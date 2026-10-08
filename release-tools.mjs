import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {digest} from './development/workspace.mjs';

const stable=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const read=(root,name)=>fs.readFileSync(path.join(root,name),'utf8');
export function checkVersion(root,tag) {
  const pkg=JSON.parse(read(root,'package.json'));
  const lock=JSON.parse(read(root,'package-lock.json'));
  const ui=/export const APP_VERSION=['"]([^'"]+)['"]/.exec(read(root,'public/version.mjs'))?.[1];
  if(!stable.test(pkg.version))throw Error('发行版本必须为正式的 x.y.z 格式');
  if([lock.version,lock.packages?.['']?.version,ui].some(v=>v!==pkg.version))
    throw Error('package.json、lockfile 和页面版本不一致');
  if(tag!==undefined && tag!==`v${pkg.version}`)throw Error('发行标签与源码版本不一致');
  return pkg.version;
}

export function prepareVersion(root,version) {
  const previous=checkVersion(root);
  if(!stable.test(version))throw Error('发行版本必须为正式的 x.y.z 格式');
  const oldParts=previous.split('.').map(Number),newParts=version.split('.').map(Number);
  const changed=newParts.findIndex((v,i)=>v!==oldParts[i]);
  if(changed<0||newParts[changed]<oldParts[changed])throw Error('新版本必须高于当前版本');
  const names=['package.json','package-lock.json','public/version.mjs','public/sw.js'];
  const before=Object.fromEntries(names.map(name=>[name,read(root,name)]));
  const pkg=JSON.parse(before['package.json']),lock=JSON.parse(before['package-lock.json']);
  pkg.version=version;lock.version=version;lock.packages[''].version=version;
  const worker=before['public/sw.js'];
  if(!/const CACHE=['"][^'"]+['"]/.test(worker))throw Error('无法更新离线资源版本');
  const next={
    'package.json':JSON.stringify(pkg,null,2)+'\n',
    'package-lock.json':JSON.stringify(lock,null,2)+'\n',
    'public/version.mjs':before['public/version.mjs'].replace(/(export const APP_VERSION=)['"][^'"]+['"]/,`$1'${version}'`),
    'public/sw.js':worker.replace(/const CACHE=['"][^'"]+['"]/,`const CACHE='shixu-shell-${version}'`),
  };
  const written=[];
  try {for(const name of names){fs.writeFileSync(path.join(root,name),next[name]);written.push(name);}checkVersion(root);}
  catch(error){for(const name of written)fs.writeFileSync(path.join(root,name),before[name]);throw error;}
  return {previous,version};
}

export async function sha256(file) {
  const hash=crypto.createHash('sha256');
  for await(const chunk of fs.createReadStream(file))hash.update(chunk);
  return hash.digest('hex');
}
export async function stageInstaller(root) {
  const version=checkVersion(root),meta=JSON.parse(read(root,'dist/latest-installer.json'));
  const file=fs.realpathSync(meta.installer),dist=fs.realpathSync(path.join(root,'dist'));
  if(!file.startsWith(dist+path.sep)||meta.version!==version||path.basename(file)!==`Shixu-Setup-${version}.exe`)
    throw Error('安装包来源或版本不匹配');
  if(!meta.sourceDigest||JSON.stringify(meta.sourceDigest)!==JSON.stringify(digest(root)))
    throw Error('源码在打包后已变化或缺少清单，请重新构建安装包');
  const checksum=(await sha256(file));
  if(read(root,path.relative(root,file)+'.sha256').trim()!==`${checksum}  ${path.basename(file)}`)
    throw Error('安装包校验失败');
  const out=path.join(root,'dist/release-assets');fs.mkdirSync(out,{recursive:true});
  fs.copyFileSync(file,path.join(out,path.basename(file)));
  fs.writeFileSync(path.join(out,path.basename(file)+'.sha256'),`${checksum}  ${path.basename(file)}\n`);
  return path.basename(file);
}
export async function verifyAssets(root,folder=path.join(root,'dist/release-assets')) {
  const version=checkVersion(root),names=[`Shixu-Setup-${version}.exe`,`dayweave-harness-${version}.tar.gz`];
  const expected=new Set([...names,...names.map(n=>n+'.sha256'),'release-manifest.json']);
  if(fs.readdirSync(folder).some(n=>!expected.has(n)))throw Error('发行目录包含非预期文件');
  const assets=[];
  for(const name of names){
    const file=path.join(folder,name),stat=fs.lstatSync(file);
    if(!stat.isFile()||stat.size===0)throw Error('发行文件为空或不是普通文件');
    const hash=await sha256(file),check=fs.readFileSync(file+'.sha256','utf8').trim();
    if(check!==`${hash}  ${name}`)throw Error(`发行校验失败：${name}`);
    assets.push({name,bytes:stat.size,sha256:hash});
  }
  const commit=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',windowsHide:true});
  if(commit.status!==0)throw Error('无法确认发行提交');
  const manifest={version,commit:commit.stdout.trim(),assets};
  fs.writeFileSync(path.join(folder,'release-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  return manifest;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const root=import.meta.dirname,[command,arg]=process.argv.slice(2);
  try {
    if(command==='check'){
      const version=checkVersion(root,arg);
      const commit=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',windowsHide:true});
      if(commit.status!==0)throw Error('无法读取发行提交');
      if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,`version=${version}\ncommit=${commit.stdout.trim()}\n`);
      console.log(`Version checks passed: ${version}`);
    }else if(command==='prepare')console.log(JSON.stringify(prepareVersion(root,arg)));
    else if(command==='stage-installer')console.log(await stageInstaller(root));
    else if(command==='verify-assets')console.log(JSON.stringify(await verifyAssets(root),null,2));
    else throw Error('用法：release-tools.mjs check [vX.Y.Z] | prepare X.Y.Z | stage-installer | verify-assets');
  }catch(error){console.error(error.message);process.exitCode=1;}
}
