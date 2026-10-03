import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {DatabaseSync,backup} from 'node:sqlite';
import {pathToFileURL} from 'node:url';

export function locations(bundle,env=process.env){
 const home=path.resolve(env.SHIXU_DESKTOP_HOME||path.join(env.LOCALAPPDATA||env.HOME,'Shixu'));
 const port=Number(env.SHIXU_DESKTOP_PORT||3090);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('桌面端口无效');
 return {bundle,home,port,url:`http://localhost:${port}`,workspace:path.join(home,'workspace'),data:path.join(home,'data')};
}
function config(p){const file=path.join(p.home,'desktop.json');fs.mkdirSync(p.home,{recursive:true});if(fs.existsSync(file)){const value=JSON.parse(fs.readFileSync(file,'utf8'));if(value.port!==p.port)throw Error('此空间端口已固定，请使用原端口，避免浏览器本地数据分散');return value;}const value={instance:crypto.randomUUID(),token:crypto.randomBytes(32).toString('hex'),port:p.port};fs.writeFileSync(file,JSON.stringify(value),{mode:0o600});return value;}
export async function health(url){try{const r=await fetch(url+'/healthz',{signal:AbortSignal.timeout(1200)});if(!r.ok)return null;const data=await r.json();return data.app==='shixu'&&data.status==='ok'?data:null;}catch{return null;}}
export function prepare(p){
 const settings=config(p),marker=path.join(p.workspace,'.desktop-ready.json');
 if(fs.existsSync(marker))return settings;
 if(fs.existsSync(p.workspace))throw Error('桌面源码准备未完成。请保留该目录，查看日志后重试；不会覆盖已有文件。');
 const staging=path.join(p.home,'preparing-'+crypto.randomUUID());
 try{fs.cpSync(path.join(p.bundle,'app'),staging,{recursive:true,errorOnExist:true,force:false});
 fs.writeFileSync(path.join(staging,'.desktop-ready.json'),JSON.stringify({version:JSON.parse(fs.readFileSync(path.join(staging,'package.json'))).version,at:new Date().toISOString()}));
 fs.renameSync(staging,p.workspace);}catch(error){fs.rmSync(staging,{recursive:true,force:true});throw error;}return settings;
}
export async function start(p){
 const settings=prepare(p),live=await health(p.url);
 if(live){if(live.desktopInstance!==settings.instance)throw Error('桌面端口被其他时序空间占用，未连接或修改它');return {running:true,url:p.url};}
 fs.mkdirSync(p.data,{recursive:true});const control=path.join(p.home,'stop.json');if(fs.existsSync(control))fs.unlinkSync(control);
 const out=fs.openSync(path.join(p.data,'desktop-out.log'),'a'),err=fs.openSync(path.join(p.data,'desktop-error.log'),'a');
 // Do not inherit API credentials, database paths, or server settings from the launching shell.
 const env={};for(const name of ['SystemRoot','WINDIR','PATH','TEMP','TMP','USERPROFILE','HOME','APPDATA','LOCALAPPDATA','ProgramFiles'])if(process.env[name])env[name]=process.env[name];
 Object.assign(env,{PORT:String(p.port),HOST:'127.0.0.1',PUBLIC_ORIGIN:p.url,DATA_DIR:p.data,SHIXU_DESKTOP_INSTANCE:settings.instance,SHIXU_CONTROL_FILE:control,SHIXU_CONTROL_TOKEN:settings.token});
 const child=spawn(process.execPath,[path.join(p.workspace,'development/supervisor.mjs')],{cwd:p.workspace,env,windowsHide:true,detached:true,stdio:['ignore',out,err]});let error;child.once('error',e=>{error=e;});child.unref();fs.closeSync(out);fs.closeSync(err);
 const deadline=Date.now()+120000;
 while(Date.now()<deadline){if(error)throw error;const result=await health(p.url);if(result?.desktopInstance===settings.instance)return {running:true,url:p.url};await new Promise(r=>setTimeout(r,350));}
 throw Error('启动未完成，请查看数据文件夹中的 desktop-error.log；原有空间未被修改');
}
export async function stop(p){
 const settings=config(p),live=await health(p.url);if(!live)return {running:false};if(live.desktopInstance!==settings.instance)throw Error('此服务不属于桌面空间，不能停止');
 fs.writeFileSync(path.join(p.home,'stop.json'),JSON.stringify({token:settings.token}));
 for(let i=0;i<40;i++){await new Promise(r=>setTimeout(r,250));if(!await health(p.url))return {running:false};}throw Error('服务尚未停止，请稍后重试');
}
export async function importBackup(p,folder){
 if(await health(p.url))throw Error('请先停止桌面空间再导入');
 if(fs.existsSync(p.data)&&fs.readdirSync(p.data).length)throw Error('桌面空间已有数据或日志，首次导入只允许空白空间，未覆盖现有内容');
 const source=path.resolve(folder),dbFile=path.join(source,'planner.sqlite'),key=path.join(source,'secret.key');
 if(path.resolve(p.data)===source)throw Error('来源和目标不能相同');
 if(fs.readFileSync(key).length!==32)throw Error('备份密钥格式不正确');
 const db=new DatabaseSync(dbFile,{readOnly:true}),staging=path.join(p.home,'import-'+crypto.randomUUID());fs.mkdirSync(staging,{recursive:true});
 try{if(db.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw Error('备份数据库检查失败');if(!db.prepare("SELECT value FROM kv WHERE key='account'").get()||!db.prepare("SELECT value FROM kv WHERE key='state'").get())throw Error('不是完整的时序备份');await backup(db,path.join(staging,'planner.sqlite'));fs.copyFileSync(key,path.join(staging,'secret.key'));}finally{db.close();}
 if(fs.existsSync(p.data))fs.rmdirSync(p.data);fs.renameSync(staging,p.data);return {message:'完整备份已导入，请使用原账号密码登录。原始数据没有移动或删除。'};
}
export async function command(action,p,arg){
 if(action==='existing'){const result=await health('http://localhost:3088');return {running:!!result,url:'http://localhost:3088'};}
 if(action==='start')return start(p);if(action==='stop')return stop(p);
 if(action==='import'){config(p);return importBackup(p,arg);}
 if(action==='credentials'){const file=path.join(p.data,'bootstrap.txt');return {text:fs.existsSync(file)?fs.readFileSync(file,'utf8'):'没有初始密码文件。若导入了备份，请使用原账号密码。'};}
 if(action==='status'){const settings=config(p),result=await health(p.url);return {running:result?.desktopInstance===settings.instance,url:p.url,home:p.home,data:p.data,workspace:p.workspace};}
 throw Error('未知桌面操作');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){try{console.log(JSON.stringify(await command(process.argv[2],locations(path.resolve(import.meta.dirname,'..')),process.argv[3])));}catch(error){console.log(JSON.stringify({error:error.message}));process.exitCode=1;}}
