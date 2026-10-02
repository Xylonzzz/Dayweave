import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {harnessStatus,resolveHarnessRoot} from '../harness/runtime.mjs';
import {inspectEnvironment,runProgram} from './environment.mjs';
import {buildSandbox,command} from './sandbox.mjs';

const live=pid=>{if(!Number.isInteger(pid)||pid<=0)return false;try{process.kill(pid,0);return true;}catch{return false;}};
export function setupState(root){
 let state;try{state=JSON.parse(fs.readFileSync(path.join(root,'.shixu-tools/setup.json'),'utf8'));}catch{state={phase:'idle',message:'尚未运行配置向导',events:[]};}
 if(state.phase==='running'&&!live(state.pid))state={...state,phase:'interrupted',message:'配置进程已停止。点击继续配置，会复用已完成的组件。'};
 return {...state,supported:process.platform==='win32'&&process.arch==='x64',location:path.join(root,'.shixu-tools')};
}
export function launchSetup(root,harnessRoot){
 if(process.platform!=='win32'||process.arch!=='x64')throw Error('本版自动配置支持 Windows x64；其他系统请按文档手动准备环境。');
 const state=setupState(root);if(state.phase==='running')return state;
 const home=path.join(root,'.shixu-tools');fs.mkdirSync(home,{recursive:true});
 const lock=path.join(home,'setup.lock');
 if(fs.existsSync(lock)){if(live(Number(fs.readFileSync(lock,'utf8'))))return {phase:'running',message:'配置程序正在启动或运行',events:[]};fs.unlinkSync(lock);}
 const handle=fs.openSync(lock,'wx');fs.writeSync(handle,String(process.pid));fs.closeSync(handle);
 const log=fs.openSync(path.join(home,'worker.log'),'a');
 const child=spawn(process.execPath,[path.join(import.meta.dirname,'setup-worker.mjs'),root,harnessRoot||''],{cwd:root,detached:true,windowsHide:true,stdio:['ignore',log,log]});
 child.on('error',error=>{fs.writeFileSync(path.join(home,'setup.json'),JSON.stringify({phase:'failed',message:error.message,events:[]}));if(fs.existsSync(lock))fs.unlinkSync(lock);});child.unref();fs.closeSync(log);
 if(!child.pid){fs.unlinkSync(lock);throw Error('无法启动配置程序');}
 fs.writeFileSync(lock,String(child.pid));
 const pending={phase:'running',message:'正在启动配置程序',events:[],pid:child.pid};fs.writeFileSync(path.join(home,'setup.json'),JSON.stringify(pending));
 return pending;
}
export async function configureEnvironment({root,harnessRoot,save},deps={}){
 const check=deps.check||inspectEnvironment,hs=deps.harnessStatus||harnessStatus;
 const home=path.join(root,'.shixu-tools');fs.mkdirSync(home,{recursive:true});
 const events=[];
 const update=(phase,message)=>{events.push({at:new Date().toISOString(),message});save({phase,message,events:events.slice(-60),pid:process.pid,updatedAt:new Date().toISOString()});};
 const step=deps.step|| (async action=>{
  const env={};for(const key of ['SystemRoot','WINDIR','PATH','Path','TEMP','TMP','USERPROFILE','HOME','APPDATA','LOCALAPPDATA','ProgramFiles','ProgramData','COMSPEC','PATHEXT'])if(process.env[key])env[key]=process.env[key];
  const log=path.join(home,action+'.log');fs.writeFileSync(log,'');
  const result=await runProgram('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(import.meta.dirname,'setup-windows.ps1'),'-Action',action,'-ToolsRoot',home,'-NodePath',process.execPath],{timeout:1800000,env,onOutput:text=>fs.appendFileSync(log,text)});
  if(!result.ok)throw Error(`${action} 未完成。请查看配置日志并重试。\n${result.output.slice(-2000)}`);
 });
 try{
  update('running','检查已有组件，已完成的步骤会自动跳过');
  if(!deps.check&&(process.platform!=='win32'||process.arch!=='x64'))throw Error('自动配置当前仅支持 Windows x64');
  let docker=await check();
  if(!deps.check){const disk=fs.statfsSync(home);const needed=(!docker.available||!hs(harnessRoot).available)?8:1;if(disk.bavail*disk.bsize<needed*1024**3)throw Error(`工具所在磁盘剩余空间不足，请至少预留 ${needed} GB 后重试。`);}
  if(docker.code==='restart-pending'){update('restart','请保存工作并重启 Windows，重新打开时序后点击继续配置。');return;}
  if(!docker.available){
   if(docker.code==='wrong-engine'){update('attention','请在 Docker Desktop 中切换为 Linux 容器，再点击继续配置。');return;}
   update('running','准备 WSL。Windows 可能请求管理员授权；不会自动重启电脑');
   await step('wsl');docker=await check();
   if(docker.code==='restart-pending'){update('restart','WSL 组件已准备，请保存工作并重启 Windows，再继续配置。');return;}
   if(docker.code==='not-installed'){update('running','下载并验证 Docker 官方安装程序，随后安装。首次下载约 600 MB，实际大小以官方文件为准');await step('docker');}
   update('running','启动 Docker。首次启动请在 Docker 窗口完成许可确认，然后回到这里');
   await step('startDocker');docker=await check();
   if(!docker.available){update(docker.code==='restart-pending'?'restart':'attention',docker.message+' 请在 Docker Desktop 完成启动后点击继续配置。');return;}
  }
  if(!hs(harnessRoot).available){
   if(harnessRoot&&path.resolve(harnessRoot)!==resolveHarnessRoot())throw Error('现有 HARNESS_ROOT 指向不可用的自定义目录。请修复该目录或移除此配置后重试；向导不会覆盖自定义安装。');
   update('running','下载固定版本 Harness 并安装依赖、构建。首次可能需要数分钟，请保持网络连接');await step('harness');
   if(!hs(harnessRoot).available)throw Error('Harness 构建后检查未通过，请查看 harness.log');
  }
  update('running','准备测试镜像，首次会下载 Node 镜像和依赖；已有缓存会复用');
  const verification=deps.verify|| (async()=>{
   const buildHome=fs.mkdtempSync(path.join(home,'verify-'));
   const image=await buildSandbox({original:root},buildHome);
   const test=await command(['run','--rm','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--tmpfs','/tmp:rw,size=16m','--memory','256m','--pids-limit','64',image,'node','--input-type=module','-e',"import fs from 'node:fs';import assert from 'node:assert/strict';fs.writeFileSync('/tmp/shixu-check','ready');assert.equal(fs.readFileSync('/tmp/shixu-check','utf8'),'ready');await import('/deps/node_modules/express/index.js');console.log('隔离文件读写及依赖检查通过');"],{timeout:60000});
   fs.writeFileSync(path.join(home,'verification.log'),test.output);if(!test.ok)throw Error('容器验收失败：'+test.output.slice(-1500));
  });
  await verification();
  update('ready','定制环境已就绪。请选择已配置的 AI 接口并填写需求；本次配置未调用付费模型。');
 }catch(error){update('failed',error.message);}
}
