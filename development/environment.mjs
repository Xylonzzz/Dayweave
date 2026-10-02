import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';

export function dockerExecutable({platform=process.platform,env=process.env,exists=fs.existsSync}={}){
 if(env.SHIXU_DOCKER_PATH)return env.SHIXU_DOCKER_PATH;
 if(platform==='win32'){
  for(const file of [env.ProgramFiles&&path.join(env.ProgramFiles,'Docker','Docker','resources','bin','docker.exe'),env.LOCALAPPDATA&&path.join(env.LOCALAPPDATA,'Programs','DockerDesktop','resources','bin','docker.exe')])if(file&&exists(file))return file;
 }
 return 'docker';
}
export function dockerEnvironment(executable,source=process.env){
 const env={...source};
 if(!path.isAbsolute(executable))return env;
 const pathKey=Object.keys(env).find(key=>key.toLowerCase()==='path');
 const previous=pathKey?env[pathKey]:'';
 for(const key of Object.keys(env))if(key.toLowerCase()==='path')delete env[key];
 env.PATH=path.dirname(executable)+path.delimiter+previous;
 return env;
}
export function runProgram(program,args,{signal,timeout=180000,encoding='utf8',env=process.env,cwd,onOutput=()=>{}}={}){
 if(signal?.aborted)return Promise.reject(Error('开发已取消'));
 return new Promise((resolve,reject)=>{
  let chunks=[],length=0,timedOut=false;
  const child=spawn(program,args,{windowsHide:true,stdio:['ignore','pipe','pipe'],env,cwd});
  const abort=()=>{timedOut=true;child.kill();};
  const timer=setTimeout(abort,timeout);signal?.addEventListener('abort',abort,{once:true});
  const finish=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);};
  const append=data=>{chunks.push(data);length+=data.length;while(length>240000&&chunks.length>1)length-=chunks.shift().length;onOutput(data.toString(encoding));};
  child.stdout.on('data',append);child.stderr.on('data',append);
  child.once('error',error=>{finish();reject(error);});
  child.once('close',code=>{finish();if(timedOut)reject(Error(signal?.aborted?'开发已取消':'命令执行超时'));else resolve({ok:code===0,code,output:Buffer.concat(chunks).toString(encoding).slice(-120000)});});
 });
}
export async function inspectEnvironment({platform=process.platform,run=runProgram,executable=dockerExecutable()}={}){
 let docker;
 try{docker=await run(executable,['info','--format','{{.OSType}}'],{timeout:15000});}
 catch(error){docker={ok:false,code:error.code||'ERROR',output:error.message};}
 if(docker.ok&&docker.output.trim()==='linux')return {available:true,code:'ready',message:'Linux 容器已就绪',steps:[]};
 if(docker.ok)return {available:false,code:'wrong-engine',message:'Docker 正在使用 Windows 容器，请切换为 Linux 容器。',steps:['在 Docker Desktop 中切换到 Linux containers，再点击重新检查。']};
 let windows;
 if(platform==='win32'){
  const results=await Promise.allSettled([
   run('wsl.exe',['--status'],{timeout:8000,encoding:'utf16le'}),
   run('reg.exe',['query','HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Component Based Servicing\\RebootPending'],{timeout:5000})
  ]);
  windows={wslStatus:results[0].status==='fulfilled'?results[0].value.output.slice(0,3000):'无法读取 WSL 状态',restartPending:results[1].status==='fulfilled'&&results[1].value.ok};
 }
 const missing=docker.code==='ENOENT';
 const steps=[];
 if(windows?.restartPending)steps.push('Windows 有待完成的重启。先保存工作并从开始菜单选择“重启”，再重新检查。');
 if(platform==='win32'){
  steps.push('若 WSL 仍未就绪，在管理员 PowerShell 中检查 wsl --status；尚未安装时执行 wsl --install，并按提示重启。');
  steps.push(missing?'安装 Docker Desktop，选择并启动 Linux 容器环境。':'打开 Docker Desktop，等待引擎启动；若启动失败，查看上面的 WSL 状态。');
 }else steps.push(missing?'安装 Docker Engine 后重新检查。':'启动 Docker Engine，并确认当前运行用户有访问权限。');
 steps.push('完成后点击“重新检查”，环境就绪才会允许开始 AI 开发。');
 return {available:false,code:windows?.restartPending?'restart-pending':missing?'not-installed':'engine-unavailable',message:windows?.restartPending?`Windows 等待重启；${missing?'Docker 命令尚不可用':'Docker 引擎尚未就绪'}。`:missing?'未找到 Docker，请先安装。':'Docker 引擎不可用，请确认已启动并有访问权限。',windows,steps,detail:String(docker.output).slice(-3000)};
}
