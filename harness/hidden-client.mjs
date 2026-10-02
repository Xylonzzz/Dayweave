import {Worker, isMainThread, parentPort, workerData} from 'node:worker_threads';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';

// Scope the SDK compatibility shim to a worker: never patch the web server's spawn.
export class HiddenHarness {
 constructor(moduleURL, options){this.moduleURL=moduleURL;this.options=options;this.pending=new Map();this.next=0;}
 start(){
  this.worker=new Worker(new URL(import.meta.url),{workerData:{moduleURL:this.moduleURL,options:this.options}});
  this.exited=new Promise(resolve=>this.worker.once('exit',code=>{this.dead=true;this.fail(Error(`Harness 进程已结束 (${code})`));resolve();}));
  this.worker.on('error',error=>this.fail(error));
  this.worker.on('message',({id,result,error})=>{const p=this.pending.get(id);if(!p)return;this.pending.delete(id);error?p.reject(Error(error)):p.resolve(result);});
  return this.request('start');
 }
 fail(error){for(const p of this.pending.values())p.reject(error);this.pending.clear();}
 request(method,args=[]){return new Promise((resolve,reject)=>{if(this.dead)return reject(Error('Harness 已关闭'));const id=++this.next;this.pending.set(id,{resolve,reject});this.worker.postMessage({id,method,args});});}
 run(...args){return this.request('run',args);}
 close(){return this.closing??=(async()=>{if(!this.worker||this.dead)return;try{await this.request('close');}finally{await this.exited;}})();}
}

if(!isMainThread){
 const spawn=childProcess.spawn;
 childProcess.spawn=function(command,args,options){return spawn(command,args,{...options,windowsHide:true});};
 syncBuiltinESMExports();
 const {DeepSeekHarness}=await import(workerData.moduleURL);
 const harness=new DeepSeekHarness(workerData.options);
 parentPort.on('message',async({id,method,args})=>{
  try{const result=await harness[method](...args);parentPort.postMessage({id,result});}
  catch(error){parentPort.postMessage({id,error:error.message});}
  finally{if(method==='close')parentPort.close();}
 });
}
