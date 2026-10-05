import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

function identity(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return null;
  try { process.kill(pid, 0); } catch (error) { if (error.code === 'ESRCH') return null; throw error; }
  if (process.platform === 'win32') {
    const command = `$p=Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}'; if($p){[pscustomobject]@{started=$p.CreationDate.ToUniversalTime().Ticks.ToString();executable=$p.ExecutablePath;command=$p.CommandLine}|ConvertTo-Json -Compress}`;
    const output = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8', windowsHide: true, timeout: 10000 }).trim();
    return output ? JSON.parse(output) : null;
  }
  if (process.platform === 'linux') {
    try {
      const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
      return { started: stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19], command: fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replaceAll('\0', ' ') };
    } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  // On platforms without a process identity probe, keep live locks conservatively.
  return { started: null, command: null };
}

export function acquireProcessLock(file, script, probe = identity) {
  if (fs.existsSync(file)) {
    const original = fs.readFileSync(file, 'utf8');
    const record = JSON.parse(original);
    const pid = typeof record === 'number' ? record : record.pid;
    const owner = probe(pid);
    if (owner) {
      const sameStart = typeof record === 'object' && record.started && owner.started && record.started === owner.started;
      const command = owner.command?.replaceAll('\\', '/').toLowerCase();
      const legacyOwner = typeof record === 'number' && (command == null || command.includes(path.resolve(script).replaceAll('\\', '/').toLowerCase()) || command.includes('development/supervisor.mjs'));
      if (sameStart || legacyOwner || (typeof record === 'object' && (!record.started || !owner.started))) throw Error('版本管理服务已运行');
    }
    if (fs.readFileSync(file, 'utf8') !== original) throw Error('版本管理服务启动状态已变化，请重试');
    fs.unlinkSync(file);
  }
  const own = probe(process.pid);
  if (!own) throw Error('无法确认当前启动进程，未创建版本服务锁');
  const record = { pid: process.pid, started: own.started, token: crypto.randomUUID() };
  fs.writeFileSync(file, JSON.stringify(record), { flag: 'wx' });
  return () => {
    try { if (JSON.parse(fs.readFileSync(file, 'utf8')).token === record.token) fs.unlinkSync(file); } catch {}
  };
}
