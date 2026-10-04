import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { supervise } from '../server-supervisor.mjs';

test('native supervisor restarts its own failed child and stops cleanly', async () => {
  const root = fs.mkdtempSync(path.resolve('test-output', 'server-supervisor-'));
  fs.writeFileSync(path.join(root, 'fixture.mjs'), `import fs from 'node:fs';
    const file='count';const count=fs.existsSync(file)?Number(fs.readFileSync(file,'utf8'))+1:1;
    fs.writeFileSync(file,String(count));console.log('fixture launch '+count);
    if(count===1)process.exit(1);setInterval(()=>{},1000);`);
  const control = supervise({ root, entry: 'fixture.mjs', env: { ...process.env, DATA_DIR: root }, retryMs: 20, probeMs: 10000, graceMs: 60000 });
  try {
    for (let i = 0; i < 100; i++) {
      if (fs.existsSync(path.join(root, 'count')) && fs.readFileSync(path.join(root, 'count'), 'utf8') === '2') break;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.equal(fs.readFileSync(path.join(root, 'count'), 'utf8'), '2');
    await control.stop();
    await new Promise(resolve => setTimeout(resolve, 80));
    assert.equal(fs.readFileSync(path.join(root, 'count'), 'utf8'), '2');
    assert.match(fs.readFileSync(path.join(root, 'server.log'), 'utf8'), /fixture launch/);
  } finally { await control.stop(); fs.rmSync(root, { recursive: true, force: true }); }
});

test('native supervisor recovers a live backend with a failing health check', async () => {
  const root = fs.mkdtempSync(path.resolve('test-output', 'server-health-'));
  fs.writeFileSync(path.join(root, 'fixture.mjs'), `import fs from 'node:fs';import http from 'node:http';
    const file='count';const count=fs.existsSync(file)?Number(fs.readFileSync(file,'utf8'))+1:1;
    fs.writeFileSync(file,String(count));
    http.createServer((req,res)=>{res.writeHead(count===1?503:200,{'Content-Type':'application/json'});
      res.end(JSON.stringify({status:'ok',bootId:process.env.SHIXU_BOOT_ID}));}).listen(Number(process.env.PORT),'127.0.0.1');`);
  const control = supervise({ root, entry: 'fixture.mjs', env: { ...process.env, DATA_DIR: root, PORT: '3208' }, retryMs: 20, probeMs: 40, graceMs: 200 });
  try {
    for (let i = 0; i < 150; i++) {
      if (fs.existsSync(path.join(root, 'count')) && Number(fs.readFileSync(path.join(root, 'count'), 'utf8')) >= 2) break;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.equal(fs.readFileSync(path.join(root, 'count'), 'utf8'), '2');
    assert.match(fs.readFileSync(path.join(root, 'server.log'), 'utf8'), /Health check failed three times/);
  } finally { await control.stop(); fs.rmSync(root, { recursive: true, force: true }); }
});
