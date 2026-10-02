import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {unseal} from '../lib.mjs';
import {harnessStatus} from '../harness/runtime.mjs';
import {doctor} from './sandbox.mjs';
import {customize} from './customize.mjs';
import {rollback} from './workspace.mjs';
const root=path.resolve(import.meta.dirname,'..'),home=path.join(root,'.shixu-development');
const args=process.argv.slice(2),option=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
try{
 if(args.includes('--doctor')){
  const report={harness:harnessStatus(process.env.HARNESS_ROOT),docker:await doctor()};console.log(JSON.stringify(report,null,2));if(!report.harness.available||!report.docker.available)process.exitCode=1;
 }else if(args.includes('--rollback')){
  const id=option('--rollback');if(!/^[a-f0-9-]{36}$/.test(id||''))throw Error('恢复记录 ID 无效');rollback(root,path.join(home,id));console.log('源码已恢复；后端改动需重启服务。');
 }else if(args.includes('--request')){
  const filename=option('--request');if(!filename)throw Error('请提供 UTF-8 需求文件路径');const request=fs.readFileSync(filename,'utf8');
  const ready=await doctor();if(!ready.available)throw Error('需要 Docker Desktop 的 Linux 容器环境。'+ready.message);
  let provider,key;
  if(process.env.SHIXU_DEV_API_KEY){provider={name:'开发接口',format:'openai',baseUrl:process.env.SHIXU_DEV_BASE_URL||'https://api.deepseek.com/v1',model:process.env.SHIXU_DEV_MODEL||'deepseek-v4-pro'};key=process.env.SHIXU_DEV_API_KEY;}
  else{
   const data=path.resolve(root,process.env.DATA_DIR||'data');const db=new DatabaseSync(path.join(data,'planner.sqlite'),{readOnly:true});
   try{const stored=db.prepare("SELECT value FROM kv WHERE key='providers'").get();const all=stored?JSON.parse(stored.value):[];const p=option('--provider')?all.find(p=>p.id===option('--provider')):all.find(p=>p.format==='openai');if(!p)throw Error('请在时序中配置兼容 API，或设置 SHIXU_DEV_API_KEY');key=unseal(p.key,fs.readFileSync(path.join(data,'secret.key')));provider={name:p.name,format:p.format,baseUrl:p.baseUrl,model:p.model};}finally{db.close();}
  }
  const controller=new AbortController();process.once('SIGINT',()=>controller.abort());
  const result=await customize({root,home,harnessRoot:process.env.HARNESS_ROOT,provider,key,request,signal:controller.signal,onStatus:message=>console.log(message),autoApply:!args.includes('--review-only')});console.log(`记录 ID：${result.id}\n结果：${result.folder}`);
 }else console.log('环境检查：npm run customize -- --doctor\n自动开发、审查与整合：npm run customize -- --request 需求.txt\n仅生成候选版本：增加 --review-only\n恢复源码：npm run customize -- --rollback 记录ID');
}catch(error){console.error(error.message);process.exitCode=1;}
