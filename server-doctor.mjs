import 'dotenv/config';
import os from 'node:os';
import { mysqlOptions } from './storage.mjs';

const report = { node: process.versions.node, platform: process.platform, osRelease: os.release(), arch: process.arch, driver: process.env.DB_DRIVER || 'sqlite', checks: [] };
let failed = false;
const check = (name, ok, detail) => { report.checks.push({ name, ok, detail }); if (!ok) failed = true; };
const [major, minor] = process.versions.node.split('.').map(Number);
check('Node.js', major > 22 || (major === 22 && minor >= 2), 'MySQL 模式最低 Node.js 22.2；SQLite 模式要求 Node.js 24+');
if (process.platform === 'win32' && Number(os.release().split('.')[0]) < 10) {
  report.platformNote = '旧 Windows 平台：Node.js 22.2 将 Server 2012 列为实验性平台。此探针可证明进程实际运行，不能替代目标机器完整验收。';
}
if (report.driver === 'mysql') {
  let connection;
  try {
    const { createConnection } = await import('mysql2/promise');
    connection = await createConnection(mysqlOptions());
    const [[row]] = await connection.query('SELECT VERSION() AS version, @@max_allowed_packet AS packet, @@character_set_connection AS charset');
    check('MySQL connection', true, { version: row.version, maxAllowedPacket: row.packet, charset: row.charset });
    report.checks.push({ name: 'MySQL packet budget', ok: row.packet >= 16 * 1024 * 1024 ? true : null, level: row.packet >= 16 * 1024 * 1024 ? 'info' : 'warning', detail: '建议 max_allowed_packet 至少 16 MB；较小值可启动，但较大的对话或备份可能保存失败。此探针不会修改实例配置。' });
    const [tables] = await connection.execute('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=?', [process.env.MYSQL_DATABASE]);
    check('Dedicated database', !tables.length || tables.some(t => t.TABLE_NAME === 'dayweave_schema'), '使用独立的空数据库或已有 Dayweave 数据库；此检查不会创建或修改表');
  } catch (error) { check('MySQL connection', false, { code: error.code || 'CONFIG_ERROR', detail: '请检查 .env、数据库账号权限和服务状态；不输出密码或连接串' }); }
  finally { if (connection) await connection.end(); }
} else check('SQLite runtime', report.driver === 'sqlite' && major >= 24, 'SQLite 需要 Node.js 24+');
console.log(JSON.stringify(report, null, 2));
process.exitCode = failed ? 1 : 0;
