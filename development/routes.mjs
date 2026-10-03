import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {customize} from './customize.mjs';
import {doctor} from './sandbox.mjs';
import {harnessStatus} from '../harness/runtime.mjs';
import {safePath,integrate,rollback} from './workspace.mjs';
import {setupState,launchSetup} from './setup.mjs';
import {runtimeState,stageCandidate,startPreview,stopPreview,previewInfo,verifyRelease,assertCompatible} from './releases.mjs';

const validID=id=>typeof id==='string'&&/^[a-f0-9-]{36}$/.test(id);
const terminal=new Set(['ready','integrated','rolledBack','failed','cancelled','interrupted']);
export function developmentAllowed(req,mode='local'){
 if(mode==='enabled')return true;if(mode==='disabled')return false;
 return ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)&&['localhost','127.0.0.1','[::1]','::1'].includes(req.hostname)&&!req.headers.forwarded&&!req.headers['x-forwarded-for']&&!req.headers['x-forwarded-host'];
}
// Mount after the application's session-authentication middleware.
export function registerDevelopment(app,{root,installation=root,home=path.join(installation,'.shixu-development'),harnessRoot,mode='local',getProvider},deps={}){
 let active=null,starting=false,runtimeBusy=false;
 const managed=process.env.SHIXU_MANAGED==='1'&&typeof process.send==='function';
 const allowed=req=>developmentAllowed(req,mode);
 const setupReport=req=>({...((deps.setupState||setupState)(installation)),allowed:allowed(req)&&developmentAllowed(req,'local')});
 const folder=id=>{if(!validID(id))throw Error('开发记录 ID 无效');const result=path.join(home,id);if(fs.existsSync(result)&&fs.lstatSync(result).isSymbolicLink())throw Error('无效记录目录');return result;};
 const read=id=>{const data=JSON.parse(fs.readFileSync(path.join(folder(id),'result.json'),'utf8'));if(!terminal.has(data.phase)&&active?.id!==id)data.phase='interrupted';return data;};
 const write=(id,data)=>fs.writeFileSync(path.join(folder(id),'result.json'),JSON.stringify(data,null,2));
 const report=async req=>{
  const access=allowed(req),harness=(deps.harnessStatus||harnessStatus)(harnessRoot),docker=access?await(deps.doctor||doctor)():{available:false,message:'开发执行尚未向当前连接开放'};
  return {allowed:access,harness,docker,available:access&&harness.available&&docker.available,managed,setup:setupReport(req),activeId:active?.id||null,reason:access?'源码会发送给所选 API；测试使用独立数据。':'本机访问默认可用；服务器管理员可用 SHIXU_DEVELOPMENT=enabled 显式开放。'};
 };
 app.get('/api/development/status',async(req,res)=>res.json(await report(req)));
 app.use('/api/development',(req,res,next)=>{
  if(!allowed(req))return res.status(403).json({error:'此连接未启用开发权限'});
  if(req.method!=='GET'&&req.headers['x-shixu-development']!=='1')return res.status(403).json({error:'缺少开发操作标识'});
  next();
 });
 app.get('/api/development/runtime',(req,res)=>{const state=runtimeState(installation);let currentName='项目原始版本';try{const release=state.current&&verifyRelease(installation,state.current);if(release?.record.jobId)currentName=read(release.record.jobId).request;}catch{currentName='已保存版本';}res.json({...state,currentName,managed,local:developmentAllowed(req,'local')});});
 app.post('/api/development/runtime/restore',(req,res)=>{
  if(!managed||!developmentAllowed(req,'local'))return res.status(403).json({error:'请在本机通过桌面开关启动版本管理服务'});
  if(req.body?.confirm!==true||active||starting||runtimeBusy)return res.status(409).json({error:'请确认恢复，并等待当前操作结束'});
  const state=runtimeState(installation);if(state.phase!=='running'||!state.previous)return res.status(409).json({error:'没有可恢复的运行版本'});
  process.send({type:'shixu-switch',id:state.previous,rollback:true});res.status(202).json({message:'正在恢复，页面会短暂断开，请稍后刷新。'});
 });
 for(const action of ['preview','stop-preview','activate'])app.post(`/api/development/jobs/:id/${action}`,async(req,res)=>{
  if(!developmentAllowed(req,'local'))return res.status(403).json({error:'试运行与版本切换目前仅支持本机访问'});
  if(active||starting||runtimeBusy)return res.status(409).json({error:'请等待当前开发或版本操作结束'});
  runtimeBusy=true;
  try{
   const id=req.params.id,record=read(id);
   if(action==='preview'){
    if(record.releaseId)await stopPreview(installation,record.releaseId);
    const releaseId=stageCandidate(installation,root,folder(id));record.releaseId=releaseId;write(id,record);
    const preview=await startPreview(installation,releaseId);res.json({releaseId,preview});
   }else if(action==='stop-preview'){
    if(record.releaseId)await stopPreview(installation,record.releaseId);res.json({ok:true});
   }else{
    if(!managed)throw Error('请用桌面开关重启时序，启用版本管理后再切换');
    if(req.body?.confirm!==true)throw Error('请确认已试用，并同意切换运行版本');
    const preview=previewInfo(installation,record.releaseId);if(!preview?.healthy)throw Error('请先成功启动试运行');
    assertCompatible(root,verifyRelease(installation,record.releaseId).source);
    if(runtimeState(installation).phase!=='running')throw Error('版本服务正在切换，请稍后重试');
    process.send({type:'shixu-switch',id:record.releaseId});res.status(202).json({message:'正在切换，页面会短暂断开，请稍后刷新。'});
   }
  }catch(error){res.status(409).json({error:error.message});}finally{runtimeBusy=false;}
 });
 app.get('/api/development/setup',(req,res)=>res.json(setupReport(req)));
 app.get('/api/development/setup/log',(req,res)=>{
  if(!developmentAllowed(req,'local'))return res.status(403).json({error:'配置日志仅限本机查看'});
  const home=path.join(installation,'.shixu-tools');
  const logs=['wsl.log','docker.log','startDocker.log','harness.log','verification.log','worker.log'].flatMap(name=>{const file=path.join(home,name);if(!fs.existsSync(file))return [];const fd=fs.openSync(file,'r');try{const length=fs.fstatSync(fd).size,buffer=Buffer.alloc(Math.min(length,16000));fs.readSync(fd,buffer,0,buffer.length,Math.max(0,length-buffer.length));return [{name,text:buffer.toString('utf8')}];}finally{fs.closeSync(fd);}});
  res.json({logs});
 });
 app.post('/api/development/setup',(req,res)=>{
  if(!developmentAllowed(req,'local'))return res.status(403).json({error:'安装环境只能从本机直接连接发起，远程连接不能安装电脑软件。'});
  if(req.body?.consent!==true)return res.status(400).json({error:'请先阅读组件说明并勾选开始配置'});
  if(active||starting)return res.status(409).json({error:'请等待开发任务结束后配置环境'});
  try{res.status(202).json((deps.launchSetup||launchSetup)(installation,harnessRoot));}catch(e){res.status(400).json({error:e.message});}
 });
 app.get('/api/development/jobs',(req,res)=>{
  if(!fs.existsSync(home))return res.json([]);
  const jobs=fs.readdirSync(home).filter(validID).flatMap(id=>{try{const item=read(id);return [{id,request:item.request,createdAt:item.createdAt,phase:item.phase,summary:item.review?.summary,changes:item.changes?.length||0}];}catch{return [];}}).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));res.json(jobs.slice(0,100));
 });
 app.get('/api/development/jobs/:id',(req,res)=>{
  try{const record=read(req.params.id),dir=folder(req.params.id);const logs=fs.readdirSync(dir).filter(x=>/^test-\d+\.log$/.test(x)).sort((a,b)=>Number(a.match(/\d+/)[0])-Number(b.match(/\d+/)[0])).slice(-3).map(name=>({name,text:fs.readFileSync(path.join(dir,name),'utf8').slice(-18000)}));let preview;try{preview=record.releaseId?previewInfo(installation,record.releaseId):null;}catch{}res.json({...record,preview,logs,progress:active?.id===record.id?active.progress:null});}catch(e){res.status(404).json({error:e.message});}
 });
 app.get('/api/development/jobs/:id/file',(req,res)=>{
  try{const record=read(req.params.id),name=req.query.path;if(!record.changes?.some(x=>x.path===name))throw Error('文件不在本次改动中');const dir=folder(req.params.id),content=side=>{const file=safePath(path.join(dir,side),name);return fs.existsSync(file)?fs.readFileSync(file,'utf8').slice(0,256000):'';};res.json({path:name,before:content('original'),after:content('candidate')});}catch(e){res.status(400).json({error:e.message});}
 });
 app.post('/api/development/jobs',async(req,res)=>{
  if(active||starting||runtimeBusy||setupReport(req).phase==='running')return res.status(409).json({error:'已有开发任务或环境配置正在运行'});
  const {request,providerId,autoApply}=req.body;
  if(managed&&autoApply)return res.status(409).json({error:'版本管理模式请保留候选版本，试运行后切换使用'});
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
  if(managed)return res.status(409).json({error:'版本管理模式不覆盖源码，请试运行后切换使用，或恢复上一个运行版本'});
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
