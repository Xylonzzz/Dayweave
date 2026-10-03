import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const root=import.meta.dirname;
const url='http://localhost:3088';
const ready=async()=>{try{const r=await fetch(url+'/healthz',{signal:AbortSignal.timeout(1500)});const data=await r.json();return r.ok&&data.app==='shixu'&&data.status==='ok';}catch{return false;}};
if(!await ready()){
 fs.mkdirSync(path.join(root,'data'),{recursive:true});
 const out=fs.openSync(path.join(root,'data','server-out.log'),'a'),err=fs.openSync(path.join(root,'data','server-error.log'),'a');
 const server=spawn(process.execPath,['development/supervisor.mjs'],{cwd:root,detached:true,windowsHide:true,stdio:['ignore',out,err]});
 server.on('error',e=>console.error('启动失败：'+e.message));server.unref();fs.closeSync(out);fs.closeSync(err);
}
let started=false;
for(let i=0;i<60;i++){if(await ready()){started=true;break;}await new Promise(r=>setTimeout(r,500));}
if(!started){console.error('服务未能启动，请查看 data/server-error.log，确认 3088 端口没有被其他程序占用。');process.exitCode=1;}
else{
 if(!process.argv.includes('--no-open')){const browser=spawn('powershell.exe',['-NoProfile','-WindowStyle','Hidden','-Command',`Start-Process '${url}'`],{stdio:'ignore',windowsHide:true});browser.on('error',()=>console.log('请在浏览器打开 '+url));browser.unref();}
 console.log(`时序后台服务已就绪：${url}。可以关闭此窗口。电脑重启后请再次运行 start.cmd。`);
}
