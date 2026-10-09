import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import { acquireProcessLock } from '../development/process-lock.mjs';

test('reused PID does not block startup; a live owner and successor lock are preserved', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'shixu-process-lock-'));
  const file = path.join(folder, 'supervisor.lock'), script = path.join(folder, 'supervisor.mjs');
  const probe = () => ({ started: 'new-process', command: 'C:\\Windows\\explorer.exe' });
  try {
    fs.writeFileSync(file, '13644');
    const release = acquireProcessLock(file, script, probe);
    const active = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(active.started, 'new-process');
    assert.throws(() => acquireProcessLock(file, script, probe), /已运行/);
    fs.writeFileSync(file, JSON.stringify({ ...active, started: 'old-process' }));
    const releaseNext = acquireProcessLock(file, script, probe);
    release(); assert.ok(fs.existsSync(file), 'old owner cannot unlink its successor');
    releaseNext(); assert.ok(!fs.existsSync(file));
    fs.writeFileSync(file, '13644');
    assert.throws(() => acquireProcessLock(file, script, () => ({ started: 'legacy-process', command: `node "${script}"` })), /已运行/);
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
});

test('real Windows startup identifies its own process with only desktop environment variables', {skip:process.platform!=='win32',timeout:45000}, t=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'shixu-native-lock-'));
 t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
 const env={};for(const name of ['SystemRoot','WINDIR','PATH','TEMP','TMP','USERPROFILE','HOME','APPDATA','LOCALAPPDATA','ProgramFiles'])if(process.env[name])env[name]=process.env[name];
 const moduleURL=pathToFileURL(path.resolve('development/process-lock.mjs')).href;
 const source=`import fs from 'node:fs'; import assert from 'node:assert/strict'; import {acquireProcessLock} from ${JSON.stringify(moduleURL)}; const file=${JSON.stringify(path.join(folder,'lock'))}; const release=acquireProcessLock(file,'fixture.mjs'); assert.match(JSON.parse(fs.readFileSync(file)).started,/0$/); assert.throws(()=>acquireProcessLock(file,'fixture.mjs'),/已运行/); release(); console.log('native lock OK');`;
 const r=spawnSync(process.execPath,['--input-type=module','-e',source],{env,encoding:'utf8',windowsHide:true,timeout:40000});
 assert.equal(r.status,0,r.stdout+r.stderr+String(r.error||''));
 assert.match(r.stdout,/native lock OK/);assert.ok(!fs.existsSync(path.join(folder,'lock')));
});
