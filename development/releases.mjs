import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import {digest,safePath} from './workspace.mjs';
import {command} from './sandbox.mjs';

export const releaseHome=root=>path.join(root,'.shixu-releases');
export const readJSON=file=>JSON.parse(fs.readFileSync(file,'utf8'));
export function writeJSON(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(value,null,2));fs.renameSync(temp,file);}
export function releasePath(root,id){if(!/^[a-f0-9-]{36}$/.test(id))throw Error('版本 ID 无效');const folder=path.join(releaseHome(root),id);if(fs.existsSync(folder)&&fs.lstatSync(folder).isSymbolicLink())throw Error('版本目录不能是链接');return folder;}
export function runtimeState(root){const file=path.join(releaseHome(root),'runtime.json');return fs.existsSync(file)?readJSON(file):{phase:'unmanaged',current:null,previous:null,message:'请使用桌面开关重新启动时序，启用版本管理。'};}
export function verifyRelease(root,id){const folder=releasePath(root,id),record=readJSON(path.join(folder,'release.json'));if(JSON.stringify(digest(path.join(folder,'source')))!==record.digest)throw Error('版本文件已变化，请重新开发和验证');return {folder,record,source:path.join(folder,'source')};}
export function snapshot(root,source,{jobId=null}={}){
 const id=crypto.randomUUID(),folder=releasePath(root,id),target=path.join(folder,'source'),hashes=digest(source);fs.mkdirSync(target,{recursive:true});
 for(const name of Object.keys(hashes)){const dest=safePath(target,name);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(safePath(source,name),dest);}
 const serialized=JSON.stringify(hashes);if(JSON.stringify(digest(target))!==serialized)throw Error('复制期间源码发生变化');
 writeJSON(path.join(folder,'release.json'),{id,jobId,createdAt:new Date().toISOString(),digest:serialized});return id;
}
export function stageCandidate(installation,root,jobFolder){
 const job=readJSON(path.join(jobFolder,'result.json')),proof=readJSON(path.join(jobFolder,'verified.json')),candidate=path.join(jobFolder,'candidate');
 if(!['ready','integrated'].includes(job.phase)||!job.review?.approved)throw Error('仅能试运行通过测试与审查的候选版本');
 if(JSON.stringify(digest(candidate))!==proof.verified)throw Error('验证后源码发生变化');
 const current=JSON.stringify(digest(root));if(current!==JSON.stringify(proof.baseline)&&current!==proof.verified)throw Error('当前源码已有其他修改，请基于最新版本重新定制');
 const id=snapshot(installation,candidate,{jobId:job.id}),file=path.join(releasePath(installation,id),'release.json');writeJSON(file,{...readJSON(file),parentDigest:current});return id;
}
// This release contract permits UI-only changes. Backend/storage migrations need a separate protocol.
export function assertCompatible(current,next){
 const before=digest(current),after=digest(next);
 for(const name of new Set([...Object.keys(before),...Object.keys(after)])){
  const frontend=/^public\/(app\.js|appearance\.js|.*\.(css|html|svg|png|webmanifest))$/.test(name)||(!before[name]&&name.startsWith('public/'));
  if(before[name]!==after[name]&&!frontend&&!/^(docs\/|tests\/)/.test(name))throw Error(`本阶段只支持页面与前端功能切换；后端、共享模块或依赖变化需独立迁移方案：${name}`);
 }
}
async function freePort(){const server=net.createServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;}
export async function stopPreview(installation,id,run=command){const {folder}=verifyRelease(installation,id),file=path.join(folder,'preview.json');if(!fs.existsSync(file))return;const state=readJSON(file);await run(['rm','-f',state.container,...(state.relay?[state.relay]:[])],{timeout:15000});await run(['network','rm',state.network],{timeout:15000});writeJSON(file,{...state,stopped:true});}
export async function startPreview(installation,id,{run=command,health=fetch}={}){
 const {folder,source}=verifyRelease(installation,id),port=await freePort(),container='shixu-preview-'+id,network=container+'-net',relay=container+'-relay';
 const lock=fs.readFileSync(path.join(source,'package-lock.json'));const image='shixu-development:'+crypto.createHash('sha256').update(lock).digest('hex').slice(0,16);
 const password=crypto.randomBytes(18).toString('base64url'),url=`http://preview-${id}.localhost:${port}`,healthURL=`http://127.0.0.1:${port}`;
 await stopPreview(installation,id,run);
 const made=await run(['network','create','--internal',network],{timeout:15000});if(!made.ok)throw Error('无法创建隔离试运行网络：'+made.output);
 writeJSON(path.join(folder,'preview.json'),{container,network,relay,url,username:'preview',password,expiresAt:Date.now()+1800000,healthy:false});
 try{
  const result=await run(['run','-d','--rm','--name',container,'--network',network,'--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--pids-limit','128','--memory','768m','--cpus','2','--tmpfs','/tmp:rw,size=64m','--tmpfs','/work:rw,uid=1000,gid=1000,size=128m','--mount',`type=bind,src=${source},dst=/candidate,readonly`,'-e','DATA_DIR=/work/data','-e','HOST=0.0.0.0','-e','PORT=3088','-e',`PUBLIC_ORIGIN=${url}`,'-e','ADMIN_USER=preview','-e',`ADMIN_PASSWORD=${password}`,'-e','SHIXU_PREVIEW=1','-e','SHIXU_DEVELOPMENT=disabled',image,'timeout','1800','sh','-c','cp -R /candidate /work/run && ln -s /deps/node_modules /work/run/node_modules && cd /work/run && node server.mjs'],{timeout:30000});
  if(!result.ok)throw Error('试运行启动失败：'+result.output);
  // Trusted relay has no source/data mounts. Its destination is fixed; it is not a general outbound proxy.
  const proxy=`const http=require('node:http');http.createServer((req,res)=>{delete req.headers.authorization;req.headers.cookie=(req.headers.cookie||'').split(';').filter(x=>x.trim().startsWith('shixu_preview=')).join(';');const upstream=http.request({hostname:${JSON.stringify(container)},port:3088,path:req.url,method:req.method,headers:req.headers},reply=>{if(reply.headers['set-cookie'])reply.headers['set-cookie']=reply.headers['set-cookie'].filter(x=>x.startsWith('shixu_preview=')).map(x=>x.replace(/;\\s*domain=[^;]+/ig,''));res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);});upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end('Preview unavailable');});req.on('aborted',()=>upstream.destroy());req.pipe(upstream);}).listen(3088,'0.0.0.0');`;
  const bridge=await run(['run','-d','--rm','--name',relay,'--network','bridge','-p',`127.0.0.1:${port}:3088`,'--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--pids-limit','32','--memory','128m',image,'timeout','1800','node','-e',proxy],{timeout:30000});if(!bridge.ok)throw Error('预览入口启动失败：'+bridge.output);
  const attached=await run(['network','connect',network,relay],{timeout:15000});if(!attached.ok)throw Error('预览入口连接失败：'+attached.output);
  for(let i=0;i<40;i++){
   try{const response=await health(healthURL+'/healthz',{signal:AbortSignal.timeout(1000)}),body=await response.json();if(response.ok&&body.app==='shixu'&&body.status==='ok'){const state=readJSON(path.join(folder,'preview.json'));writeJSON(path.join(folder,'preview.json'),{...state,healthy:true});return {...state,healthy:true};}}catch{}
   await new Promise(resolve=>setTimeout(resolve,250));
  }
  throw Error('试运行未通过启动检查');
 }catch(error){const logs=await run(['logs','--tail','60',container],{timeout:10000}).catch(()=>null);if(logs?.output)fs.writeFileSync(path.join(folder,'preview.log'),logs.output);await stopPreview(installation,id,run).catch(()=>{});throw Error(error.message+(logs?.output?'；试运行日志：'+logs.output.slice(-2400):''));}
}
export function previewInfo(installation,id){const {folder}=verifyRelease(installation,id),file=path.join(folder,'preview.json');return fs.existsSync(file)?readJSON(file):null;}
