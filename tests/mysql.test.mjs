import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { openStorage } from '../storage.mjs';
import { unseal } from '../lib.mjs';

// Opt-in, fixed localhost test container only. Never consume production .env.
test('MySQL 5.7: transactions, Unicode, ownership, API regression, conflicts and restart', { skip: process.env.SHIXU_TEST_MYSQL !== '1', timeout: 90000 }, async t => {
  const { createConnection } = await import('mysql2/promise');
  const database = 'dayweave_test_' + crypto.randomBytes(8).toString('hex');
  const env = { ...process.env, DB_DRIVER: 'mysql', MYSQL_HOST: '127.0.0.1', MYSQL_PORT: '33317', MYSQL_USER: 'root', MYSQL_PASSWORD: 'dayweave-fixture-only', MYSQL_DATABASE: database, MYSQL_SSL_CA: '', SHIXU_DEVELOPMENT: 'disabled' };
  delete env.NODE_TEST_CONTEXT;
  const admin = await createConnection({ host: env.MYSQL_HOST, port: 33317, user: env.MYSQL_USER, password: env.MYSQL_PASSWORD });
  let storage, child;
  const dataDir = path.resolve('test-output', database);
  fs.mkdirSync(dataDir, { recursive: true });
  const stop = async () => {
    if (!child || child.exitCode !== null) return;
    const stopped = once(child, 'exit'); child.kill(); await stopped;
  };
  t.after(async () => {
    await stop();
    if (storage) await storage.db.close();
    await admin.query(`DROP DATABASE \`${database}\``);
    await admin.end();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_bin`);
  // Refuse unrelated data before any Dayweave table is created.
  await admin.query(`CREATE TABLE \`${database}\`.existing_app (id INT)`);
  await assert.rejects(openStorage({ env, dataDir }), /独立的空数据库/);
  const [untouched] = await admin.query(`SHOW TABLES FROM \`${database}\``);
  assert.equal(untouched.length, 1);
  await admin.query(`DROP TABLE \`${database}\`.existing_app`);
  storage = await openStorage({ env, dataDir });
  assert.match((await storage.db.prepare('SELECT VERSION() AS version').get()).version, /^5\.7\./);
  const key = "灵感' OR 1=1 -- 🌙";
  await storage.put(key, { text: '课程、作业与灵感 🧠', counter: 0 });
  await assert.rejects(storage.db.transaction(async () => {
    await storage.put(key, { counter: 99 });
    await storage.put('rollback-only', 'must disappear');
    throw Error('rollback fixture');
  }), /rollback fixture/);
  assert.equal(await storage.get('rollback-only'), null);
  await Promise.all(Array.from({ length: 10 }, () => storage.db.transaction(async () => {
    const value = await storage.get(key);
    await new Promise(resolve => setTimeout(resolve, 2));
    await storage.put(key, { ...value, counter: value.counter + 1 });
  })));
  assert.deepEqual(await storage.get(key), { text: '课程、作业与灵感 🧠', counter: 10 });
  await assert.rejects(openStorage({ env, dataDir }), /已有一个/);
  await storage.db.close(); storage = null;

  // Run the existing API suite against real MySQL using this Node executable.
  const regression = spawn(process.execPath, ['--test', 'tests/server.test.mjs'], { env: { ...env, SHIXU_TEST_DATA_DIR: dataDir, SHIXU_TEST_PORT: '3197' }, windowsHide: true, stdio: 'pipe' });
  let output = '';
  regression.stdout.on('data', b => { output += b; }); regression.stderr.on('data', b => { output += b; });
  const [code] = await once(regression, 'exit');
  assert.equal(code, 0, output);
  assert.match(output, /authenticated API/);
  t.diagnostic(`Existing API suite passed on Node ${process.versions.node} + MySQL 5.7`);

  const port = 3198, origin = `http://127.0.0.1:${port}`;
  let stderr = '';
  async function start() {
    child = spawn(process.execPath, ['server.mjs'], { env: { ...env, PORT: String(port), PUBLIC_ORIGIN: origin, DATA_DIR: dataDir, ADMIN_PASSWORD: 'Integration-test-password-123' }, windowsHide: true, stdio: 'pipe' });
    child.stdout.resume(); child.stderr.on('data', b => { stderr += b; });
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) break;
      try { if ((await fetch(origin + '/healthz')).ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.fail('Server did not restart: ' + stderr.slice(-1000));
  }
  await start();
  const login = await fetch(origin + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'student', password: 'Integration-test-password-123' }) });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const call = (route, method = 'GET', body) => fetch(origin + route, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  let state = await (await call('/api/state')).json();
  assert.equal(state.settings.name, '迁移后的同学');
  const responses = await Promise.all(['甲', '乙'].map(name => call('/api/state', 'PUT', { ...state, settings: { ...state.settings, name } })));
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
  state = await (await call('/api/state')).json();
  const syncHeaders = { Origin: 'https://local.example', 'Content-Type': 'application/json', 'X-Shixu-Sync': '1' };
  const syncLogin = await fetch(origin + '/api/sync/v1/login', { method: 'POST', headers: syncHeaders, body: JSON.stringify({ username: 'student', password: 'Integration-test-password-123' }) });
  assert.equal(syncLogin.status, 200);
  const auth = await syncLogin.json(); syncHeaders.Authorization = 'Bearer ' + auth.token;
  const operation = { deviceId: crypto.randomUUID(), operationId: crypto.randomUUID(), instanceId: auth.instanceId, revision: state.revision, data: { ...state, settings: { ...state.settings, name: 'MySQL 同步 🌙' } } };
  const commit = body => fetch(origin + '/api/sync/v1/commit', { method: 'POST', headers: syncHeaders, body: JSON.stringify(body) });
  const [first, replay] = await Promise.all([commit(operation), commit(operation)]);
  assert.equal(first.status, 200); assert.equal(replay.status, 200);
  assert.deepEqual(await first.json(), await replay.json());
  assert.equal((await commit({ ...operation, operationId: crypto.randomUUID() })).status, 409);
  await stop(); await start();
  state = await (await call('/api/state')).json();
  assert.equal(state.settings.name, 'MySQL 同步 🌙');
  assert.equal(state.revision, operation.revision + 1);
  assert.equal((await commit(operation)).status, 200, 'sync receipts and tokens survive restart');
  const providers = await (await call('/api/providers')).json();
  assert.equal(providers[0].hasKey, true);
  const [[providerRow]] = await admin.query(`SELECT value FROM \`${database}\`.kv WHERE \`key\`='providers'`);
  assert.equal(unseal(JSON.parse(providerRow.value)[0].key, fs.readFileSync(path.join(dataDir, 'secret.key'))), 'secret-for-test');
  assert.ok(!fs.existsSync(path.join(dataDir, 'planner.sqlite')), 'MySQL mode never creates a SQLite database');
});
