import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {runHarness,harnessStatus} from '../harness/runtime.mjs';
const root=process.env.HARNESS_ROOT;
test('missing Harness leaves the optional engine unavailable',()=>assert.equal(harnessStatus(path.join(import.meta.dirname,'missing-harness-fixture')).available,false));
test('real pinned Harness executes planner tool and returns streamed reply',{skip:!root,timeout:60000},async()=>{
 let calls=0,lastMessages;const mock=http.createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);calls++;
  for(const name of ['shixu_apply','runtime_info','web_search','web_read'])assert.ok(body.tools.some(t=>t.function.name===name));
  lastMessages=body.messages;const done=body.messages.some(m=>m.role==='tool');
  const delta=done?{content:'已准备好数电作业。'}:{tool_calls:[{index:0,id:'call-1',type:'function',function:{name:JSON.stringify(body.messages.at(-1)).includes('查询模型')?'runtime_info':'shixu_apply',arguments:JSON.stringify({operations:[{collection:'tasks',action:'create',values:{title:'数电作业',kind:'homework',due:'2026-09-15T23:59:00+08:00',assumptions:['耗时暂估']}}]})}}]};
  res.writeHead(200,{'Content-Type':'text/event-stream'});
  res.end(`data: ${JSON.stringify({choices:[{index:0,delta,finish_reason:null}]})}\n\ndata: ${JSON.stringify({choices:[{index:0,delta:{},finish_reason:done?'stop':'tool_calls'}]})}\n\ndata: [DONE]\n\n`);
 });await new Promise(resolve=>mock.listen(0,'127.0.0.1',resolve));
 const home=path.resolve('test-output',`harness-${Date.now()}`);fs.mkdirSync(home,{recursive:true});
 const state={revision:0,settings:{name:'同学',semesterStart:'2026-08-31',dayStart:'07:00',dayEnd:'22:00',quietStart:'22:00',quietEnd:'07:00',reminderMinutes:[30],courseReminder:10},courses:[],tasks:[],blocks:[],ideas:[],reviews:[]};let text='';
 const options={root,home,provider:{format:'openai',baseUrl:`http://127.0.0.1:${mock.address().port}/v1`,model:'test'},key:'mock',threadId:'test',prompt:'使用 shixu_apply 创建作业',state,onText:t=>text+=t};
 try{const result=await runHarness(options);assert.equal(result.operations[0].values.title,'数电作业');assert.match(text,/数电/);assert.equal(calls,2);assert.equal(state.tasks.length,0,'writes are staged until server commit');
 const resumed=await runHarness({...options,prompt:'继续对话'});assert.equal(resumed.operations.length,0);assert.ok(lastMessages.some(m=>JSON.stringify(m.content).includes('使用 shixu_apply 创建作业')),'persisted session restored after process exit');
 await runHarness({...options,threadId:'identity-test',prompt:'查询模型'});assert.ok(lastMessages.some(m=>m.role==='tool'&&JSON.stringify(m.content).includes('configuredModel')));
 const controller=new AbortController();await assert.rejects(runHarness({...options,threadId:'cancel-test',signal:controller.signal,onStatus:s=>{if(s.includes('校验通过'))controller.abort();}}));assert.equal(state.tasks.length,0,'cancelled staged writes never mutate source');
 }
 finally{mock.closeAllConnections();await new Promise(resolve=>mock.close(resolve));}
});
test('Harness HTTP conversation streams, commits validated state and supports undo',{skip:!root,timeout:60000},async()=>{
 const upstream=http.createServer(async(req,res)=>{let raw='';for await(const c of req)raw+=c;const body=JSON.parse(raw),done=body.messages.some(m=>m.role==='tool');const delta=done?{content:'作业已准备好。'}:{tool_calls:[{index:0,id:'apply-1',type:'function',function:{name:'shixu_apply',arguments:JSON.stringify({operations:[{collection:'tasks',action:'create',values:{title:'Harness 端到端作业',kind:'homework',assumptions:['耗时暂估']}}]})}}]};res.writeHead(200,{'Content-Type':'text/event-stream'});res.end(`data: ${JSON.stringify({choices:[{index:0,delta,finish_reason:null}]})}\n\ndata: ${JSON.stringify({choices:[{index:0,delta:{},finish_reason:done?'stop':'tool_calls'}]})}\n\ndata: [DONE]\n\n`);});
 await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));
 const dataDir=path.resolve('test-output',`harness-api-${Date.now()}`),origin='http://localhost:3197';
 const server=spawn(process.execPath,['server.mjs'],{windowsHide:true,stdio:'ignore',env:{...process.env,HARNESS_ROOT:root,DATA_DIR:dataDir,PORT:'3197',PUBLIC_ORIGIN:origin,ADMIN_PASSWORD:'harness-test-password',HOST:'127.0.0.1'}});
 let cookie='';const request=(url,body)=>fetch(origin+url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Cookie:cookie},body:body?JSON.stringify(body):undefined});
 try{
  for(let i=0;i<300;i++){try{if((await request('/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  const login=await request('/api/login',{username:'student',password:'harness-test-password'});assert.equal(login.status,200);cookie=login.headers.get('set-cookie').split(';')[0];
  const provider=await(await request('/api/providers',{name:'fixture',baseUrl:'https://example.com/v1',model:'test',format:'openai',apiKey:'test-only'})).json();
  // Only this isolated fixture DB uses a loopback HTTP model endpoint.
  const db=new DatabaseSync(path.join(dataDir,'planner.sqlite')),providers=JSON.parse(db.prepare("SELECT value FROM kv WHERE key='providers'").get().value);providers[0].baseUrl=`http://127.0.0.1:${upstream.address().port}/v1`;db.prepare("UPDATE kv SET value=? WHERE key='providers'").run(JSON.stringify(providers));db.close();
  const workspace=await(await request('/api/conversations',{revision:0,action:'createThread',title:'新对话',projectId:''})).json();
  const response=await request('/api/ai/chat',{engine:'harness',providerId:provider.id,threadId:workspace.selectedId,chatRevision:workspace.revision,message:'创建一份作业',revision:0});
  assert.match(response.headers.get('content-type'),/ndjson/);const events=(await response.text()).trim().split('\n').map(JSON.parse),result=events.find(e=>e.type==='result')?.data;
  assert.ok(result,JSON.stringify(events));assert.ok(events.some(e=>e.type==='text'));assert.equal(result.state.tasks[0].title,'Harness 端到端作业');assert.match(result.state.tasks[0].notes,/暂估/);
  const saved=await(await request('/api/state')).json();assert.equal(saved.tasks[0].id,result.state.tasks[0].id);
  const undone=await(await request('/api/ai/chat/undo',{id:result.undoId})).json();assert.equal(undone.tasks.length,0);
  const ownerCookie=cookie,policy=await(await request('/api/registration')).json();
  assert.equal((await request('/api/register',{username:'harnessfriend',password:'Friend-password-123',code:policy.code})).status,201);
  const friendLogin=await request('/api/login',{username:'harnessfriend',password:'Friend-password-123'});cookie=friendLogin.headers.get('set-cookie').split(';')[0];
  const me=await(await request('/api/me')).json();assert.deepEqual(await(await request('/api/providers')).json(),[]);
  const friendProvider=await(await request('/api/providers',{name:'friend fixture',baseUrl:'https://example.com/v1',model:'test',format:'openai',apiKey:'friend-test-only'})).json();
  const friendDB=new DatabaseSync(path.join(dataDir,'planner.sqlite')),key=`user:${me.id}:providers`,stored=JSON.parse(friendDB.prepare('SELECT value FROM kv WHERE key=?').get(key).value);
  stored[0].baseUrl=`http://127.0.0.1:${upstream.address().port}/v1`;friendDB.prepare('UPDATE kv SET value=? WHERE key=?').run(JSON.stringify(stored),key);friendDB.close();
  const friendWorkspace=await(await request('/api/conversations',{revision:0,action:'createThread',title:'独立对话',projectId:''})).json();
  const friendResponse=await request('/api/ai/chat',{engine:'harness',providerId:friendProvider.id,threadId:friendWorkspace.selectedId,chatRevision:friendWorkspace.revision,message:'创建一份作业',revision:0});
  const friendEvents=(await friendResponse.text()).trim().split('\n').map(JSON.parse);assert.ok(friendEvents.some(e=>e.type==='result'),JSON.stringify(friendEvents));
  assert.ok(fs.existsSync(path.join(dataDir,'users',me.id,'harness')));
  cookie=ownerCookie;assert.equal((await(await request('/api/state')).json()).tasks.length,0,'friend Harness cannot change the original owner state');
  assert.equal((await(await request('/api/conversations')).json()).threads.length,1,'friend conversation is not visible to owner');
 }finally{server.kill();upstream.closeAllConnections();await new Promise(resolve=>upstream.close(resolve));}
});


test('real Harness loads development tools without planner data tools',{skip:!root,timeout:60000},async()=>{
 let wrote=false;
 const model=http.createServer(async(req,res)=>{
  let raw='';for await(const c of req)raw+=c;const body=JSON.parse(raw);
  assert.ok(body.tools.some(t=>t.function.name==='dev_write'));assert.ok(!body.tools.some(t=>t.function.name==='shixu_query'));
  const done=body.messages.some(m=>m.role==='tool');
  const delta=done?{content:'已在副本修改文件。'}:{tool_calls:[{index:0,id:'dev-1',type:'function',function:{name:'dev_write',arguments:JSON.stringify({path:'public/custom.js',content:'export const feature=true;'})}}]};
  res.writeHead(200,{'Content-Type':'text/event-stream'});
  res.end(`data: ${JSON.stringify({choices:[{index:0,delta,finish_reason:null}]})}\n\ndata: ${JSON.stringify({choices:[{index:0,delta:{},finish_reason:done?'stop':'tool_calls'}]})}\n\ndata: [DONE]\n\n`);
 });await new Promise(resolve=>model.listen(0,'127.0.0.1',resolve));
 try{
  const result=await runHarness({root,home:path.resolve('test-output',`harness-dev-${Date.now()}`),provider:{format:'openai',baseUrl:`http://127.0.0.1:${model.address().port}/v1`,model:'test'},key:'fixture',threadId:'developer',prompt:'修改副本',state:{},development:{persona:'你是开发者',plugin:new URL('../development/plugin.mjs',import.meta.url).href,handle:async data=>{assert.equal(data.action,'dev_write');assert.equal(data.path,'public/custom.js');wrote=true;return {saved:true};}}});
  assert.ok(wrote);assert.match(result.reply,/副本/);assert.deepEqual(result.operations,[]);
 }finally{model.closeAllConnections();await new Promise(resolve=>model.close(resolve));}
});
