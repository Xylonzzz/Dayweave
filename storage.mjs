import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';

const sqliteSchema = `
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, expires INTEGER);
CREATE TABLE IF NOT EXISTS notices (key TEXT PRIMARY KEY, sent INTEGER);
CREATE TABLE IF NOT EXISTS sync_tokens (token TEXT PRIMARY KEY, origin TEXT, account TEXT, expires INTEGER);
CREATE TABLE IF NOT EXISTS sync_receipts (device TEXT PRIMARY KEY, operation TEXT, fingerprint TEXT, result TEXT);`;
const mysqlSchema = [
  'CREATE TABLE IF NOT EXISTS kv (`key` VARCHAR(191) COLLATE utf8mb4_bin PRIMARY KEY, value LONGTEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS sessions (token VARCHAR(64) COLLATE utf8mb4_bin PRIMARY KEY, expires BIGINT)',
  'CREATE TABLE IF NOT EXISTS notices (`key` VARCHAR(191) COLLATE utf8mb4_bin PRIMARY KEY, sent BIGINT)',
  'CREATE TABLE IF NOT EXISTS sync_tokens (token VARCHAR(64) COLLATE utf8mb4_bin PRIMARY KEY, origin TEXT, account VARCHAR(128), expires BIGINT)',
  'CREATE TABLE IF NOT EXISTS sync_receipts (device VARCHAR(36) COLLATE utf8mb4_bin PRIMARY KEY, operation VARCHAR(36), fingerprint VARCHAR(64), result LONGTEXT)',
];
const upsert = 'INSERT INTO kv VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value';
const receiptUpsert = 'INSERT INTO sync_receipts VALUES (?,?,?,?) ON CONFLICT(device) DO UPDATE SET operation=excluded.operation,fingerprint=excluded.fingerprint,result=excluded.result';

export function mysqlOptions(env = process.env) {
  for (const key of ['MYSQL_DATABASE', 'MYSQL_USER', 'MYSQL_PASSWORD']) {
    if (!env[key]) throw Error(`MySQL 配置缺少 ${key}`);
  }
  const port = Number(env.MYSQL_PORT || 3306);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('MYSQL_PORT 无效');
  return {
    host: env.MYSQL_HOST || '127.0.0.1', port,
    user: env.MYSQL_USER, password: env.MYSQL_PASSWORD, database: env.MYSQL_DATABASE,
    charset: 'utf8mb4_bin', connectTimeout: 10000, multipleStatements: false,
    ...(env.MYSQL_SSL_CA ? { ssl: { ca: fs.readFileSync(env.MYSQL_SSL_CA), rejectUnauthorized: true } } : {}),
  };
}

// Serialize one connection, including every statement inside a transaction.
// No database lock is held while waiting for a model or a network notification.
export async function openStorage({ dataDir = 'data', env = process.env, filename } = {}) {
  const driver = env.DB_DRIVER || 'sqlite';
  if (!['sqlite', 'mysql'].includes(driver)) throw Error('DB_DRIVER 只能是 sqlite 或 mysql');
  let connection, sqlite, lease;
  if (driver === 'mysql') {
    const { createConnection } = await import('mysql2/promise');
    connection = await createConnection(mysqlOptions(env));
    try {
      // A personal workspace has one backend. Prevent two reminder/state writers,
      // and retain the lease on the same connection used for all SQL statements.
      lease = 'dayweave:' + crypto.createHash('sha256').update(env.MYSQL_DATABASE).digest('hex').slice(0, 48);
      const [[row]] = await connection.execute('SELECT GET_LOCK(?, 0) AS acquired', [lease]);
      if (row.acquired !== 1) throw Error('此 MySQL 数据库已有一个 Dayweave 实例运行');
      const [existing] = await connection.execute('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=?', [env.MYSQL_DATABASE]);
      if (existing.length && !existing.some(t => t.TABLE_NAME === 'dayweave_schema')) {
        throw Error('目标数据库已有其他表，请为 Dayweave 使用独立的空数据库；不会改动已有表');
      }
      if (existing.length) {
        const [[schema]] = await connection.query('SELECT version FROM dayweave_schema WHERE id=1');
        if (schema?.version !== 1) throw Error('不支持的 Dayweave MySQL 数据版本');
      }
      await connection.query("SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION'");
      for (const statement of mysqlSchema) await connection.query(statement + ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin');
      const [tables] = await connection.execute('SELECT TABLE_NAME, ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME IN (?,?,?,?,?)', [env.MYSQL_DATABASE, 'kv', 'sessions', 'notices', 'sync_tokens', 'sync_receipts']);
      if (tables.some(t => t.ENGINE !== 'InnoDB')) throw Error('Dayweave 数据表必须使用 InnoDB 以支持事务回滚');
      if (!existing.length) {
        await connection.query('CREATE TABLE dayweave_schema (id INT PRIMARY KEY, version INT NOT NULL) ENGINE=InnoDB');
        await connection.query('INSERT INTO dayweave_schema VALUES (1,1)');
      }
    } catch (error) { await connection.end(); throw error; }
  } else {
    if (Number(process.versions.node.split('.')[0]) < 24) throw Error('SQLite 模式需要 Node.js 24+；Node.js 22.2 请配置 DB_DRIVER=mysql');
    const { DatabaseSync } = await import('node:sqlite');
    sqlite = new DatabaseSync(filename || path.join(dataDir, 'planner.sqlite'));
    sqlite.exec('PRAGMA journal_mode=WAL; ' + sqliteSchema);
  }
  let tail = Promise.resolve(), closed = false;
  const context = new AsyncLocalStorage();
  const exclusive = async fn => {
    if (context.getStore()?.active) return fn();
    const previous = tail;
    let release;
    tail = new Promise(resolve => { release = resolve; });
    await previous;
    const scope = { active: true, transaction: false };
    try {
      if (closed) throw Error('数据库连接已关闭');
      return await context.run(scope, fn);
    } finally { scope.active = false; release(); }
  };
  const mysqlSQL = sql => {
    if (sql === upsert) return 'INSERT INTO kv (`key`,value) VALUES (?,?) ON DUPLICATE KEY UPDATE value=VALUES(value)';
    if (sql === receiptUpsert) return 'INSERT INTO sync_receipts VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE operation=VALUES(operation),fingerprint=VALUES(fingerprint),result=VALUES(result)';
    // These are fixed internal SQL statements, never user-supplied identifiers.
    return sql.replace(/\bkey\b/g, '`key`').replace('INSERT OR IGNORE', 'INSERT IGNORE');
  };
  const query = (sql, args, mode) => exclusive(async () => {
    if (connection) {
      const [result] = await connection.execute(mysqlSQL(sql), args);
      return mode === 'get' ? result[0] : result;
    }
    return sqlite.prepare(sql)[mode](...args);
  });
  const db = {
    driver,
    prepare(sql) { return { get: (...args) => query(sql, args, 'get'), all: (...args) => query(sql, args, 'all'), run: (...args) => query(sql, args, 'run') }; },
    transaction: fn => exclusive(async () => {
      const scope = context.getStore();
      if (scope.transaction) return fn();
      if (connection) await connection.beginTransaction(); else sqlite.exec('BEGIN IMMEDIATE');
      scope.transaction = true;
      try {
        const result = await fn();
        if (connection) await connection.commit(); else sqlite.exec('COMMIT');
        return result;
      } catch (error) {
        try { if (connection) await connection.rollback(); else sqlite.exec('ROLLBACK'); } catch { /* Keep the original failure. */ }
        throw error;
      } finally { scope.transaction = false; }
    }),
    close: () => exclusive(async () => {
      closed = true;
      if (connection) await connection.end(); else sqlite.close();
    }),
  };
  const get = async (key, fallback = null) => {
    const row = await db.prepare('SELECT value FROM kv WHERE key=?').get(key);
    return row ? JSON.parse(row.value) : fallback;
  };
  const put = (key, value) => db.prepare(upsert).run(key, JSON.stringify(value));
  return { db, get, put };
}

// Short mutation routes must commit before Express sends their JSON response.
// A rejected request also rolls back any intermediate writes.
export function atomicRoute(db, handler) {
  return async (req, res) => {
    const originalJSON = res.json;
    let payload, sent = false;
    const rejected = new Error('route rejected');
    res.json = body => { payload = body; sent = true; return res; };
    try {
      await db.transaction(async () => {
        await handler(req, res);
        if (res.statusCode >= 400) throw rejected;
      });
    } catch (error) { if (error !== rejected) throw error; }
    finally { res.json = originalJSON; }
    if (sent) return res.json(payload);
  };
}
