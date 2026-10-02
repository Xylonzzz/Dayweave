import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import {registerDevelopment,developmentAllowed} from '../development/routes.mjs';
import {customize} from '../development/customize.mjs';

async function setup(t,{available=true,wait=false,mode='local'}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'shixu-dev-api-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.writeFileSync(path.join(root,'server.mjs'),'export const value=1;');
 const dependencies={engine:async options=>{if(wait){await new Promise((resolve,reject)=>{if(options.signal.aborted)return reject(Error('cancelled'));options.signal.addEventListener('abort',()=>reject(Error('cancelled')),{once:true});});}if(options.threadId.endsWith('develop'))await options.development.handle({action:'dev_write',path:'server.mjs',content:'export const value=2;'});else await options.development.handle({action:'dev_verdict',approved:true,summary:'review passed'});return {reply:'done'};},doctor:async()=>({available:true}),build:async()=> 'fixture',verify:async()=>({ok:true,output:'fixture test passed'})};
 const app=express();app.use(express.json());app.use((req,res,next)=>req.headers.authorization==='test'?next():res.status(401).json({error:'login required'}));
 registerDevelopment(app,{root,mode,getProvider:()=>({provider:{format:'openai'},key:'private-test-key'})},{launchSetup:()=>({phase:'running'}),doctor:async()=>({available,message:'fixture Docker not running'}),harnessStatus:()=>({available:true}),customize:options=>customize(options,dependencies)});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>{server.closeAllConnections();server.close();});
 const origin=`http://127.0.0.1:${server.address().port}`;
 const call=async(url,body,headers={})=>{const response=await fetch(origin+'/api/development'+url,{method:body===undefined?'GET':'POST',headers:{Authorization:'test','Content-Type':'application/json','X-Shixu-Development':'1',...headers},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,data:await response.json()};};
 const done=async id=>{for(let i=0;i<100;i++){const result=await call('/jobs/'+id);if(['ready','integrated','cancelled','failed'].includes(result.data.phase))return result.data;await new Promise(r=>setTimeout(r,20));}throw Error('job timeout');};
 return {call,done,root};
}
test('development local access rejects forwarded and remote connections by default',()=>{
 const req={socket:{remoteAddress:'127.0.0.1'},hostname:'localhost',headers:{}};assert.equal(developmentAllowed(req),true);assert.equal(developmentAllowed({...req,headers:{'x-forwarded-for':'1.2.3.4'}}),false);assert.equal(developmentAllowed({...req,hostname:'public.example'}),false);assert.equal(developmentAllowed(req,'disabled'),false);assert.equal(developmentAllowed({...req,hostname:'public.example'},'enabled'),true);
});
test('development API requires auth and operation header; reports missing environment without starting',async t=>{
 const {call,root}=await setup(t,{available:false});assert.equal((await call('/status',undefined,{Authorization:''})).status,401);
 assert.equal((await call('/jobs',{request:'test',autoApply:true},{'X-Shixu-Development':''})).status,403);
 assert.equal((await call('/status')).data.available,false);assert.equal((await call('/jobs',{request:'test',autoApply:true})).status,409);assert.ok(!fs.existsSync(path.join(root,'.shixu-development')));
});
test('candidate API can show diff, integrate and restore without exposing credentials',async t=>{
 const {call,done,root}=await setup(t);const started=await call('/jobs',{request:'change value',autoApply:false,providerId:'fixture'});assert.equal(started.status,202);const id=started.data.id;
 const ready=await done(id);assert.equal(ready.phase,'ready');assert.match(ready.logs[0].text,/test passed/);assert.ok(!JSON.stringify(ready).includes('private-test-key'));
 const diff=await call(`/jobs/${id}/file?path=server.mjs`);assert.match(diff.data.before,/value=1/);assert.match(diff.data.after,/value=2/);
 assert.equal((await call(`/jobs/${id}/file?path=../data/secret.key`)).status,400);
 assert.equal((await call(`/jobs/${id}/apply`,{})).data.phase,'integrated');assert.match(fs.readFileSync(path.join(root,'server.mjs'),'utf8'),/value=2/);
 assert.equal((await call(`/jobs/${id}/rollback`,{})).data.phase,'rolledBack');assert.match(fs.readFileSync(path.join(root,'server.mjs'),'utf8'),/value=1/);
});
test('background development can be cancelled and refuses duplicate starts',async t=>{
 const {call,done,root}=await setup(t,{wait:true});const id=(await call('/jobs',{request:'change',autoApply:true})).data.id;
 assert.equal((await call('/jobs',{request:'duplicate',autoApply:true})).status,409);
 assert.equal((await call(`/jobs/${id}/cancel`,{})).status,200);assert.equal((await done(id)).phase,'cancelled');assert.match(fs.readFileSync(path.join(root,'server.mjs'),'utf8'),/value=1/);
});


test('environment installation requires local connection and explicit consent even in remote development mode',async t=>{
 const {call}=await setup(t,{mode:'enabled'});
 assert.equal((await call('/setup',{})).status,400);
 assert.equal((await call('/setup',{consent:true},{'X-Shixu-Development':''})).status,403);
 assert.equal((await call('/setup',{consent:true},{'X-Forwarded-For':'203.0.113.2'})).status,403);
 assert.equal((await call('/setup',{consent:true},{'X-Forwarded-Host':'remote.example'})).status,403);
 assert.equal((await call('/setup',{consent:true})).status,202);
});
