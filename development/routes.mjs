import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {customize} from './customize.mjs';
import {doctor} from './sandbox.mjs';
import {harnessStatus} from '../harness/runtime.mjs';
import {safePath,integrate,rollback} from './workspace.mjs';
import {setupState,launchSetup} from './setup.mjs';

const validID=id=>typeof id==='string'&&/^[a-f0-9-]{36}$/.test(id);
const terminal=new Set(['ready','integrated','rolledBack','failed','cancelled','interrupted']);
export function developmentAllowed(req,mode='local'){
 if(mode==='enabled')return true;if(mode==='disabled')return false;
 return ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)&&['localhost','127.0.0.1','[::1]','::1'].includes(req.hostname)&&!req.headers.forwarded&&!req.headers['x-forwarded-for']&&!req.headers['x-forwarded-host'];
}
// Mount after the application's session-authentication middleware.
export function registerDevelopment(app,{root,home=path.join(root,'.shixu-development'),harnessRoot,mode='local',getProvider},deps={}){
 let active=null,starting=false;
 const allowed=req=>developmentAllowed(req,mode);
 const setupReport=req=>({...((deps.setupState||setupState)(root)),allowed:allowed(req)&&developmentAllowed(req,'local')});
 const folder=id=>{if(!validID(id))throw Error('开发记录 ID 无效');const result=path.join(home,id);if(fs.existsSync(result)&&fs.lstatSync(result).isSymbolicLink())throw Error('无效记录目录');return result;};
 const read=id=>{const data=JSON.parse(fs.readFileSync(path.join(folder(id),'result.json'),'utf8'));if(!terminal.has(data.phase)&&active?.id!==id)data.phase='interrupted';return data;};
 const write=(id,data)=>fs.writeFileSync(path.join(folder(id),'result.json'),JSON.stringify(data,null,2));
 const report=async req=>{
  const access=allowed(req),harness=(deps.harnessStatus||harnessStatus)(harnessRoot),docker=access?await(deps.doctor||doctor)():{available:false,message:'开发执行尚未向当前连接开放'};
  return {allowed:access,harness,docker,available:access&&harness.available&&docker.available,setup:setupReport(req),activeId:active?.id||null,reason:access?'源码会发送给所选 API；测试使用独立数据。':'本机访问默认可用；服务器管理员可用 SHIXU_DEVELOPMENT=enabled 显式开放。'};
 };
 app.get('/api/development/status',async(req,res)=>res.json(await report(req)));
 app.use('/api/development',(req,res,next)=>{
  if(!allowed(req))return res.status(403).json({error:'此连接未启用开发权限'});
  if(req.method!=='GET'&&req.headers['x-shixu-development']!=='1')return res.status(403).json({error:'缺少开发操作标识'});
  next();
 });
 app.get('/api/development/setup',(req,res)=>res.json(setupReport(req)));
 app.get('/api/development/setup/log',(req,res)=>{
  if(!developmentAllowed(req,'local'))return res.status(403).json({error:'配置日志仅限本机查看'});
  const home=path.join(root,'.shixu-tools');
  const logs=['wsl.log','docker.log','startDocker.log','harness.log','verification.log','worker.log'].flatMap(name=>{const file=path.join(home,name);if(!fs.existsSync(file))return [];const fd=fs.openSync(file,'r');try{const length=fs.fstatSync(fd).size,buffer=Buffer.alloc(Math.min(length,16000));fs.readSync(fd,buffer,0,buffer.length,Math.max(0,length-buffer.length));return [{name,text:buffer.toString('utf8')}];}finally{fs.closeSync(fd);}});
  res.json({logs});
 });
 app.post('/api/development/setup',(req,res)=>{
  if(!developmentAllowed(req,'local'))return res.status(403).json({error:'安装环境只能从本机直接连接发起，远程连接不能安装电脑软件。'});
  if(req.body?.consent!==true)return res.status(400).json({error:'请先阅读组件说明并勾选开始配置'});
  if(active||starting)return res.status(409).json({error:'请等待开发任务结束后配置环境'});
  try{res.status(202).json((deps.launchSetup||launchSetup)(root,harnessRoot));}catch(e){res.status(400).json({error:e.message});}
 });
 app.get('/api/development/jobs',(req,res)=>{
  if(!fs.existsSync(home))return res.json([]);
  const jobs=fs.readdirSync(home).filter(validID).flatMap(id=>{try{const item=read(id);return [{id,request:item.request,createdAt:item.createdAt,phase:item.phase,summary:item.review?.summary,changes:item.changes?.length||0}];}catch{return [];}}).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));res.json(jobs.slice(0,100));
 });
 app.get('/api/development/jobs/:id',(req,res)=>{
  try{const record=read(req.params.id),dir=folder(req.params.id);const logs=fs.readdirSync(dir).filter(x=>/^test-\d+\.log$/.test(x)).sort((a,b)=>Number(a.match(/\d+/)[0])-Number(b.match(/\d+/)[0])).slice(-3).map(name=>({name,text:fs.readFileSync(path.join(dir,name),'utf8').slice(-18000)}));res.json({...record,logs,progress:active?.id===record.id?active.progress:null});}catch(e){res.status(404).json({error:e.message});}
 });
 app.get('/api/development/jobs/:id/file',(req,res)=>{
  try{const record=read(req.params.id),name=req.query.path;if(!record.changes?.some(x=>x.path===name))throw Error('文件不在本次改动中');const dir=folder(req.params.id),content=side=>{const file=safePath(path.join(dir,side),name);return fs.existsSync(file)?fs.readFileSync(file,'utf8').slice(0,256000):'';};res.json({path:name,before:content('original'),after:content('candidate')});}catch(e){res.status(400).json({error:e.message});}
 });
 app.post('/api/development/jobs',async(req,res)=>{
  if(active||starting||setupReport(req).phase==='running')return res.status(409).json({error:'已有开发任务或环境配置正在运行'});
  const {request,providerId,autoApply}=req.body;
  if(typeof request!=='string'||!request.trim()||request.length>12000||typeof autoApply!=='boolean')return res.status(400).json({error:'请填写需求并选择整合方式'});
  starting=true;
  try{
   const ready=await report(req);if(!ready.available)return res.status(409).json({error:!ready.harness.available?ready.harness.error:'Docker Linux 容器未就绪：'+ready.docker.message});
   const credentials=getProvider(providerId);if(credentials.provider.format!=='openai')throw Error('请选择兼容 OpenAI 格式的开发接口');
   const id=crypto.randomUUID(),controller=new AbortController();fs.mkdirSync(folder(id),{recursive:true});
   write(id,{id,request:request.trim(),createdAt:new Date().toISOString(),phase:'queued',events:[]});active={id,controller,progress:'准备开发'};
   // A task belongs to the server, so closing or reloading the browser does not cancel it.
   Promise.resolve().then(()=> (deps.customize||customize)({root,home,harnessRoot,...credentials,request:request.trim(),autoApply,jobId:id,signal:controller.signal,onStatus:message=>{if(active?.id===id)active.progress=message;}})).catch(error=>{
    let record;try{record=read(id);}catch{record={id,request,createdAt:new Date().toISOString(),events:[]};}if(!['failed','cancelled'].includes(record.phase)){record.phase=controller.signal.aborted?'cancelled':'failed';record.events.push({at:new Date().toISOString(),phase:record.phase,message:error.message});write(id,record);}
   }).finally(()=>{if(active?.id===id)active=null;});
   res.status(202).json({id});
  }catch(e){res.status(400).json({error:e.message});}finally{starting=false;}
 });
 app.post('/api/development/jobs/:id/cancel',(req,res)=>{if(active?.id!==req.params.id)return res.status(409).json({error:'任务已结束'});active.controller.abort();active.progress='正在停止开发并关闭执行环境';res.json({ok:true});});
 for(const action of ['apply','rollback'])app.post(`/api/development/jobs/:id/${action}`,(req,res)=>{
  if(active||starting)return res.status(409).json({error:'请等待当前开发任务结束'});
  try{
   const id=req.params.id,record=read(id),dir=folder(id);
   if(action==='apply'){
    if(record.phase!=='ready'||!record.review?.approved)throw Error('只有通过验证和审查的候选版本可以整合');
    const proof=JSON.parse(fs.readFileSync(path.join(dir,'verified.json'),'utf8'));
    integrate(root,dir,{original:path.join(dir,'original'),candidate:path.join(dir,'candidate'),baseline:proof.baseline},proof.verified);record.phase='integrated';
   }else{if(record.phase!=='integrated')throw Error('只有已整合版本可以恢复');rollback(root,dir);record.phase='rolledBack';}
   record.events.push({at:new Date().toISOString(),phase:record.phase,message:action==='apply'?'源码已整合；后端改动需重启后加载':'源码已恢复；后端改动需重启后加载'});write(id,record);res.json(record);
  }catch(e){res.status(409).json({error:e.message});}
 });
}
