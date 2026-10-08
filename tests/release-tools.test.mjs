import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {checkVersion,prepareVersion,verifyAssets,sha256,stageInstaller} from '../release-tools.mjs';
import {digest} from '../development/workspace.mjs';
function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'dayweave-release-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.mkdirSync(path.join(root,'public'));fs.mkdirSync(path.join(root,'data'));
  fs.writeFileSync(path.join(root,'data/private.txt'),'untouched');
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({version:'0.1.5'}));
  fs.writeFileSync(path.join(root,'package-lock.json'),JSON.stringify({version:'0.1.5',packages:{'':{version:'0.1.5'}}}));
  fs.writeFileSync(path.join(root,'public/version.mjs'),"export const APP_VERSION='0.1.5';\n");
  fs.writeFileSync(path.join(root,'public/sw.js'),"const CACHE='old-cache';\n");return root;
}
test('release preparation keeps all versions consistent and changes offline resources without touching data',t=>{
  const root=fixture(t);assert.equal(checkVersion(root,'v0.1.5'),'0.1.5');
  assert.throws(()=>checkVersion(root,'v0.1.6'),/标签/);
  assert.throws(()=>prepareVersion(root,'0.1.5'),/高于/);assert.throws(()=>prepareVersion(root,'0.1.4'),/高于/);
  assert.throws(()=>prepareVersion(root,'0.1.6-beta'),/格式/);
  prepareVersion(root,'0.1.6');assert.equal(checkVersion(root,'v0.1.6'),'0.1.6');
  assert.match(fs.readFileSync(path.join(root,'public/sw.js'),'utf8'),/shixu-shell-0.1.6/);
  assert.equal(fs.readFileSync(path.join(root,'data/private.txt'),'utf8'),'untouched');
});
test('inconsistent metadata or missing worker marker refuses preparation without partial writes',t=>{
  const root=fixture(t),file=path.join(root,'package.json'),original=fs.readFileSync(file,'utf8');
  fs.writeFileSync(path.join(root,'public/sw.js'),'// no marker');
  assert.throws(()=>prepareVersion(root,'0.2.0'),/离线/);assert.equal(fs.readFileSync(file,'utf8'),original);
  fs.writeFileSync(path.join(root,'public/version.mjs'),"export const APP_VERSION='0.1.4';");
  assert.throws(()=>checkVersion(root),/不一致/);
});
test('publication refuses missing, corrupted or unexpected artifacts and records only portable metadata',async t=>{
  const root=fixture(t),folder=path.join(root,'dist/release-assets');fs.mkdirSync(folder,{recursive:true});
  const git=args=>{const r=spawnSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);};
  git(['init']);git(['-c','user.name=Release fixture','-c','user.email=fixture@example.com','commit','--allow-empty','-m','fixture']);
  await assert.rejects(verifyAssets(root),/ENOENT/);
  for(const name of ['Shixu-Setup-0.1.5.exe','dayweave-harness-0.1.5.tar.gz']){
    const file=path.join(folder,name);fs.writeFileSync(file,'synthetic package');
    fs.writeFileSync(file+'.sha256',`${await sha256(file)}  ${name}\n`);
  }
  const manifest=await verifyAssets(root);assert.equal(manifest.assets.length,2);
  assert.ok(!JSON.stringify(manifest).includes(root));
  fs.writeFileSync(path.join(folder,'notes.txt'),'unexpected');await assert.rejects(verifyAssets(root),/非预期/);
  fs.unlinkSync(path.join(folder,'notes.txt'));fs.appendFileSync(path.join(folder,'Shixu-Setup-0.1.5.exe'),'corrupt');
  await assert.rejects(verifyAssets(root),/校验失败/);
});
test('old installer cannot be staged against changed source or altered checksum',async t=>{
  const root=fixture(t),dist=path.join(root,'dist');fs.mkdirSync(dist);
  const installer=path.join(dist,'Shixu-Setup-0.1.5.exe');fs.writeFileSync(installer,'synthetic installer');
  fs.writeFileSync(installer+'.sha256',`${await sha256(installer)}  ${path.basename(installer)}\n`);
  const metadata={installer,version:'0.1.5',sourceDigest:digest(root)};
  fs.writeFileSync(path.join(dist,'latest-installer.json'),JSON.stringify(metadata));
  assert.equal(await stageInstaller(root),'Shixu-Setup-0.1.5.exe');
  fs.appendFileSync(path.join(root,'public/sw.js'),'// changed source');
  await assert.rejects(stageInstaller(root),/源码/);
  metadata.sourceDigest=digest(root);fs.writeFileSync(path.join(dist,'latest-installer.json'),JSON.stringify(metadata));
  fs.appendFileSync(installer,'corrupt');await assert.rejects(stageInstaller(root),/校验失败/);
});
