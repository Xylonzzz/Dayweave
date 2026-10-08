import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
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
