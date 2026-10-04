import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function supervise({ root = path.dirname(fileURLToPath(import.meta.url)), entry = 'server.mjs', env = process.env, retryMs = 5000, probeMs = 15000, graceMs = 30000 } = {}) {
  const dataDir = path.resolve(env.DATA_DIR || path.join(root, 'data'));
  fs.mkdirSync(dataDir, { recursive: true });
  const logfile = path.join(dataDir, 'server.log');
  const log = text => {
    if (fs.existsSync(logfile) && fs.statSync(logfile).size > 1024 * 1024) fs.renameSync(logfile, logfile + '.previous');
    fs.appendFileSync(logfile, String(text).slice(0, 128 * 1024));
  };
  let child, timer, probe, stopped = false, probing = false;
  const start = () => {
    if (stopped) return;
    const bootId = crypto.randomUUID(), started = Date.now();
    let failures = 0;
    log(`\n[${new Date().toISOString()}] Starting Dayweave\n`);
    child = spawn(process.execPath, [path.join(root, entry)], { cwd: root, env: { ...env, SHIXU_BOOT_ID: bootId }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const current = child;
    child.stdout.on('data', log); child.stderr.on('data', log);
    child.on('error', error => log(`Spawn failed: ${error.code || 'UNKNOWN'}\n`));
    child.once('close', () => {
      clearInterval(probe);
      if (child === current) child = null;
      if (!stopped) timer = setTimeout(start, retryMs);
    });
    probe = setInterval(async () => {
      if (stopped || probing || current.exitCode !== null || Date.now() - started < graceMs) return;
      probing = true;
      try {
        const response = await fetch(`http://127.0.0.1:${env.PORT || 3088}/healthz`, { signal: AbortSignal.timeout(5000) });
        const body = response.ok ? await response.json() : null;
        if (body?.bootId !== bootId || body?.status !== 'ok') throw Error('unhealthy');
        failures = 0;
      } catch {
        if (++failures >= 3 && !stopped && current === child && current.exitCode === null) {
          log('Health check failed three times; restarting the owned backend.\n');
          current.kill();
        }
      } finally { probing = false; }
    }, probeMs);
  };
  start();
  return {
    stop: async () => {
      stopped = true; clearTimeout(timer); clearInterval(probe);
      if (child && child.exitCode === null) await new Promise(resolve => { child.once('close', resolve); child.kill(); });
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const supervisor = supervise();
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await supervisor.stop(); });
}
