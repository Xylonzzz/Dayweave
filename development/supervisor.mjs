import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {backupLocal} from '../backup-local.mjs';
import {releaseHome,runtimeState,writeJSON,verifyRelease,snapshot,assertCompatible,previewInfo} from './releases.mjs';
import {digest} from './workspace.mjs';

export class VersionSupervisor{
 constructor(root,{env=process.env,healthTimeout=15000,backup=backupLocal}={}){this.root=root;this.env=env;this.timeout=healthTimeout;this.backup=backup;this.child=null;this.busy=false;this.state=runtimeState(root);this.data=path.resolve(root,env.DATA_DIR||'data');this.port=Number(env.PORT||3088);}
 save(values){this.state={...this.state,...values,updatedAt:new Date().toISOString()};writeJSON(path.join(releaseHome(this.root),'runtime.json'),this.state);}
 source(id){return id?verifyRelease(this.root,id).source:this.root;}
 async stop(){const child=this.child;if(!child)return;this.child=null;if(child.exitCode!==null||child.signalCode!==null)return;await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('旧服务未退出，停止版本切换')),10000);child.once('exit',()=>{clearTimeout(timer);resolve();});child.kill();});}
 async launch(id){
  const source=this.source(id),boot=crypto.randomUUID();fs.mkdirSync(this.data,{recursive:true});
  const out=fs.openSync(path.join(this.data,'server-out.log'),'a'),err=fs.openSync(path.join(this.data,'server-error.log'),'a');
  const env={...this.env,DATA_DIR:this.data,SHIXU_INSTALL_ROOT:this.root,SHIXU_MANAGED:'1',SHIXU_BOOT_ID:boot,SHIXU_VERSION_ID:id||'source',DOTENV_CONFIG_PATH:path.join(this.root,'.env')};
  // All release copies share the installed tools and job history, never a nested download directory.
  if(!env.HARNESS_ROOT&&fs.existsSync(path.join(this.root,'.shixu-tools','harness-revision.txt')))env.HARNESS_ROOT=path.join(this.root,'.shixu-tools/source/deepseek-harness-47f943859bef60e4160492346772ded9b24f765a');
  const child=spawn(process.execPath,[path.join(source,'server.mjs')],{cwd:source,env,windowsHide:true,stdio:['ignore',out,err,'ipc']});this.child=child;fs.closeSync(out);fs.closeSync(err);let spawnError;child.once('error',e=>{spawnError=e;});
  child.once('exit',()=>{if(this.child===child&&!this.busy){this.save({phase:'failed',message:'运行服务已退出，请通过桌面开关重新启动；查看 server-error.log 获取原因。'});this.onUnexpectedExit?.();}});
  child.on('message',message=>{if(this.child!==child||this.busy||message?.type!=='shixu-switch')return;setTimeout(()=>this.switchTo(message.id,{rollback:message.rollback===true}).catch(()=>{}),500);});
  const deadline=Date.now()+this.timeout;
  while(Date.now()<deadline){
   if(spawnError)throw spawnError;if(child.exitCode!==null||child.signalCode!==null)throw Error('新服务启动后退出，请查看运行日志');
   try{const response=await fetch(`http://127.0.0.1:${this.port}/healthz`,{signal:AbortSignal.timeout(750)}),data=await response.json();if(response.ok&&data.app==='shixu'&&data.status==='ok'&&data.bootId===boot){const page=await fetch(`http://127.0.0.1:${this.port}/app.js`,{signal:AbortSignal.timeout(750)});if(page.ok)return;}}catch{}
   await new Promise(resolve=>setTimeout(resolve,150));
  }
  throw Error('新版本启动检查超时');
 }
 async start(){
  this.busy=true;const current=this.state.current||null;
  try{await this.launch(current);this.save({phase:'running',current,message:'版本服务已就绪'});}
  catch(error){await this.stop();if(!this.state.previous){this.save({phase:'failed',message:error.message});throw error;}await this.launch(this.state.previous);this.save({phase:'running',current:this.state.previous,previous:null,message:'启动失败，已恢复上一个版本：'+error.message});}
  finally{this.busy=false;}
 }
 async switchTo(id,{rollback=false}={}){
  if(this.busy)throw Error('正在切换版本');this.busy=true;const old=this.state.current||null;let stopped=false,previous;
  try{
   if(rollback&&id!==this.state.previous)throw Error('恢复目标与记录不一致');
   if(!rollback){const preview=previewInfo(this.root,id);if(!preview?.healthy)throw Error('请先完成试运行和启动检查');const release=verifyRelease(this.root,id);if(release.record.parentDigest!==JSON.stringify(digest(this.source(old))))throw Error('试运行之后当前版本已有修改，请重新定制，避免覆盖后续工作');}
   const target=this.source(id);assertCompatible(this.source(old),target);
   previous=old||snapshot(this.root,this.root);
   this.save({phase:'switching',message:rollback?'正在恢复上一个版本':'正在备份并切换版本'});
   await this.stop();stopped=true;
   const backup=await this.backup(this.data);this.save({backup});
   await this.launch(id);
   this.save({phase:'running',current:id,previous,message:rollback?'已恢复上一个版本，保留最新业务数据':'新版本已启用，启动检查通过'});
  }catch(error){
   if(stopped){await this.stop();try{await this.launch(previous||old);this.save({phase:'running',current:previous||old,message:'切换失败，已回到原版本：'+error.message});}catch(recovery){this.save({phase:'failed',message:'恢复启动失败：'+recovery.message});throw recovery;}}
   else this.save({phase:'running',message:'未切换版本：'+error.message});
   throw error;
  }finally{this.busy=false;}
 }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const root=path.resolve(import.meta.dirname,'..');await import('dotenv/config');
 fs.mkdirSync(releaseHome(root),{recursive:true});const lock=path.join(releaseHome(root),'supervisor.lock');
 if(fs.existsSync(lock)){const pid=Number(fs.readFileSync(lock,'utf8'));let alive=false;try{process.kill(pid,0);alive=true;}catch{}if(alive)throw Error('版本管理服务已运行');fs.unlinkSync(lock);}
 const fd=fs.openSync(lock,'wx');fs.writeFileSync(fd,String(process.pid));fs.closeSync(fd);
 let controlTimer;const supervisor=new VersionSupervisor(root,{healthTimeout:process.env.SHIXU_DESKTOP_INSTANCE?60000:15000});const close=async()=>{clearInterval(controlTimer);await supervisor.stop().catch(()=>{});try{fs.unlinkSync(lock);}catch{}process.exit();};
 supervisor.onUnexpectedExit=()=>{process.exitCode=1;void close();};
 if(process.env.SHIXU_CONTROL_FILE&&process.env.SHIXU_CONTROL_TOKEN)controlTimer=setInterval(()=>{try{const file=process.env.SHIXU_CONTROL_FILE;if(fs.existsSync(file)&&JSON.parse(fs.readFileSync(file,'utf8')).token===process.env.SHIXU_CONTROL_TOKEN){fs.unlinkSync(file);void close();}}catch{}},500);
 process.on('SIGINT',close);process.on('SIGTERM',close);process.on('exit',()=>{try{fs.unlinkSync(lock);}catch{}});
 try{await supervisor.start();}catch(error){console.error(error.message);await close();}
}
