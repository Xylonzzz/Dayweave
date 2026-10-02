import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const directories=new Set(['public','harness','tests','docs','development']);
const extensions=new Set(['.mjs','.js','.css','.html','.json','.md','.txt','.svg','.png','.webmanifest']);
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
export function safePath(root,name){
 if(typeof name!=='string'||!name||name.includes('\\')||name.includes(':')||name.includes('\0'))throw Error('无效文件路径');
 const parts=name.split('/');
 if(parts.some(p=>!p||p.startsWith('.')||/[<>:"|?*\x00-\x1f]/.test(p))||!extensions.has(path.extname(name)))throw Error('此文件不在开发范围内');
 if(parts.length>1&&!directories.has(parts[0]))throw Error('不允许访问数据、密钥或开发控制程序');
 if(parts.length===1&&!['package.json','package-lock.json'].includes(name)&&!/^[a-zA-Z][a-zA-Z0-9_-]*\.(mjs|md)$/.test(name))throw Error('根目录文件不在开发范围内');
 let current=path.resolve(root);
 if(fs.lstatSync(current).isSymbolicLink())throw Error('不允许符号链接');
 for(const part of parts){current=path.join(current,part);if(fs.existsSync(current)&&fs.lstatSync(current).isSymbolicLink())throw Error('不允许符号链接');}
 return current;
}
export function files(root){
 const result=[];
 function walk(folder,prefix=''){
  for(const entry of fs.readdirSync(folder,{withFileTypes:true})){
   const name=prefix+entry.name;
   if(entry.isSymbolicLink())continue;
   if(entry.isDirectory()){if(prefix||directories.has(entry.name))walk(path.join(folder,entry.name),name+'/');continue;}
   try{safePath(root,name);if(entry.isFile())result.push(name);}catch{}
  }
 }
 walk(root);return result.sort();
}
export function digest(root){return Object.fromEntries(files(root).map(name=>[name,sha(fs.readFileSync(safePath(root,name)))]));}
export function prepare(root,home){
 fs.mkdirSync(home,{recursive:true});const original=path.join(home,'original'),candidate=path.join(home,'candidate');
 fs.mkdirSync(original);fs.mkdirSync(candidate);
 let size=0;
 for(const name of files(root)){
  const data=fs.readFileSync(safePath(root,name));size+=data.length;if(size>20*1024*1024)throw Error('源码副本超过 20 MB');
  for(const target of [original,candidate]){const destination=safePath(target,name);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,data);}
 }
 return {original,candidate,baseline:digest(original)};
}
export function changes(work){
 const current=digest(work.candidate);
 return [...new Set([...Object.keys(work.baseline),...Object.keys(current)])].sort().filter(name=>work.baseline[name]!==current[name]).map(name=>({path:name,before:work.baseline[name]||null,after:current[name]||null}));
}
export function writeSource(work,name,content){
 if(['package.json','package-lock.json'].includes(name)||name.startsWith('harness/')||name.startsWith('development/'))throw Error('本版本不自动修改依赖或 Harness 执行边界');
 if(typeof content!=='string'||Buffer.byteLength(content)>256000||content.includes('\0'))throw Error('文件内容必须是小于 256 KB 的文本');
 const destination=safePath(work.candidate,name);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,content);return {saved:name};
}
// Optimistic whole-source conflict check, backup, then apply synchronously under a host lock.
export function integrate(root,home,work,verified){
 const delta=changes(work);if(!delta.length)throw Error('没有可整合的改动');
 if(JSON.stringify(digest(work.candidate))!==verified)throw Error('验证后源码发生变化');
 const lock=path.join(root,'.shixu-development.lock');const fd=fs.openSync(lock,'wx');
 const backup=path.join(home,'rollback');
 try{
  if(JSON.stringify(digest(root))!==JSON.stringify(work.baseline))throw Error('当前安装源码已有其他修改，停止自动整合');
  fs.mkdirSync(backup,{recursive:true});
  const manifest=delta.map(item=>({...item}));
  for(const item of manifest){const target=safePath(root,item.path);if(item.before){const saved=safePath(backup,item.path);fs.mkdirSync(path.dirname(saved),{recursive:true});fs.copyFileSync(target,saved);}}
  fs.writeFileSync(path.join(home,'rollback.json'),JSON.stringify(manifest,null,2));
  const applied=[];
  try{for(const item of manifest){const target=safePath(root,item.path);applied.push(item);fs.mkdirSync(path.dirname(target),{recursive:true});if(item.after)fs.copyFileSync(safePath(work.candidate,item.path),target);else fs.unlinkSync(target);}}
  catch(error){for(const item of applied.reverse()){const target=safePath(root,item.path);if(item.before)fs.copyFileSync(safePath(backup,item.path),target);else if(fs.existsSync(target))fs.unlinkSync(target);}throw error;}
  return manifest;
 }finally{fs.closeSync(fd);fs.unlinkSync(lock);}
}
export function rollback(root,home){
 const manifest=JSON.parse(fs.readFileSync(path.join(home,'rollback.json'),'utf8'));
 const lock=path.join(root,'.shixu-development.lock'),fd=fs.openSync(lock,'wx');
 try{
  for(const item of manifest){const target=safePath(root,item.path),actual=fs.existsSync(target)?sha(fs.readFileSync(target)):null;if(actual!==item.after)throw Error(`文件已有后续修改，不能覆盖：${item.path}`);if(item.before&&sha(fs.readFileSync(safePath(path.join(home,'rollback'),item.path)))!==item.before)throw Error('恢复文件校验失败');}
  for(const item of manifest){const target=safePath(root,item.path);if(item.before)fs.copyFileSync(safePath(path.join(home,'rollback'),item.path),target);else if(fs.existsSync(target))fs.unlinkSync(target);}
 }finally{fs.closeSync(fd);fs.unlinkSync(lock);}
}
