import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import {openStorage} from '../storage.mjs';
import {mergeStates,syncData} from '../public/sync-merge.mjs';
import {registerSync} from '../sync-server.mjs';
const empty=()=>({revision:0,courses:[],tasks:[],ideas:[],blocks:[],reviews:[],settings:{name:'娴嬭瘯',semesterStart:'2026-08-31',dayStart:'08:00',dayEnd:'22:00',quietStart:'23:00',quietEnd:'07:00',reminderMinutes:[30],courseReminder:15}});
const task=(id,title=id)=>({id,title,kind:'homework',status:'todo',minutes:60});
test('first connection preserves unique records and exposes same-ID conflicts',()=>{
 const local=empty(),remote=empty();local.tasks=[task('shared','local'),task('local')];remote.tasks=[task('shared','remote'),task('remote')];
 const merged=mergeStates(null,local,remote);assert.equal(merged.data.tasks.length,3);assert.equal(merged.conflicts.length,1);assert.equal(merged.conflicts[0].label,'local');
 assert.equal(mergeStates(null,local,remote,{[merged.conflicts[0].key]:'remote'}).data.tasks[0].title,'remote');
});
test('three-way sync propagates additions and deletions and does not resurrect deleted records',()=>{
 const base=empty();base.tasks=[task('deleted'),task('kept')];const local=structuredClone(base),remote=structuredClone(base);local.tasks.shift();remote.tasks.push(task('new'));
 const merged=mergeStates(base,local,remote);assert.equal(merged.conflicts.length,0);assert.deepEqual(merged.data.tasks.map(t=>t.id),['kept','new']);
 const again=mergeStates(base,remote,merged.data);assert.equal(again.conflicts.length,0);assert.deepEqual(again.data.tasks.map(t=>t.id),['kept','new']);
});
test('delete-versus-edit requires explicit choice and submittedAt survives merging',()=>{
 const base=empty();base.tasks=[task('a')];const local=structuredClone(base),remote=structuredClone(base);local.tasks=[];remote.tasks[0]={...task('a'),status:'submitted',submittedAt:'2026-10-02T09:00:00+08:00'};
 const merged=mergeStates(base,local,remote);assert.equal(merged.conflicts.length,1);const resolved=mergeStates(base,local,remote,{[merged.conflicts[0].key]:'remote'});assert.equal(resolved.data.tasks[0].submittedAt,remote.tasks[0].submittedAt);assert.equal(syncData(resolved.data).tasks[0].status,'submitted');
});
test('custom task types merge by ID and settings changes on different fields coexist',()=>{
 const base=empty(),local=empty(),remote=empty();local.settings.name='local';remote.settings.courseReminder=20;
 local.settings.taskTypes=[{id:'custom-a',name:'璁烘枃'}];remote.settings.taskTypes=[{id:'custom-b',name:'绀惧洟'}];local.tasks=[{...task('a'),kind:'custom-a'}];remote.tasks=[{...task('b'),kind:'custom-b'}];
 const result=mergeStates(base,local,remote);assert.equal(result.conflicts.length,0);assert.equal(result.data.settings.name,'local');assert.equal(result.data.settings.courseReminder,20);assert.equal(syncData(result.data).tasks.length,2);
});
async function server(t){
 const {db,get,put}=await openStorage({filename:':memory:',env:{DB_DRIVER:'sqlite'}});
 const salt='fixture';await put('account',{username:'student',salt,hash:crypto.scryptSync('test-password-123',salt,64).toString('hex')});await put('state',empty());await put('providers',[{key:'must-not-sync'}]);
 const app=express();await registerSync(app,{db,get,put});const listener=app.listen(0,'127.0.0.1');await new Promise(r=>listener.once('listening',r));t.after(async()=>{listener.closeAllConnections();listener.close();await db.close();});const root=`http://127.0.0.1:${listener.address().port}`;
 const call=async(route,body,token,headers={})=>{const response=await fetch(root+'/api/sync/v1'+route,{method:body===undefined?'GET':'POST',headers:{Origin:'https://local.example','X-Shixu-Sync':'1','Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,data:await response.json(),headers:response.headers};};
 const login=await call('/login',{username:'student',password:'test-password-123'});return {get,put,call,token:login.data.token,instanceId:await get('syncInstance')};
}
test('sync authorization is scoped to origin and planner data, never ambient cookies',async t=>{
 const s=await server(t);assert.equal((await s.call('/state')).status,401);assert.equal((await s.call('/state',undefined,s.token,{Origin:'https://other.example'})).status,401);assert.equal((await s.call('/state',undefined,s.token,{'X-Shixu-Sync':''})).status,403);
 const state=await s.call('/state',undefined,s.token);assert.equal(state.status,200);assert.equal(state.headers.get('access-control-allow-origin'),'https://local.example');assert.ok(!JSON.stringify(state.data).includes('must-not-sync'));
 assert.equal((await s.call('/providers',undefined,s.token)).status,404);await s.call('/logout',{},s.token);assert.equal((await s.call('/state',undefined,s.token)).status,401);
});
test('sync commit is idempotent after response loss and rejects stale or altered requests',async t=>{
 const s=await server(t),data=empty();data.tasks=[task('a')];const op={deviceId:crypto.randomUUID(),operationId:crypto.randomUUID(),instanceId:s.instanceId,revision:0,data};
 const first=await s.call('/commit',op,s.token);assert.equal(first.status,200);assert.equal((await s.get('state')).revision,1);assert.equal((await s.get('syncPrevious')).tasks.length,0);
 // A different device writes after the first commit; replay must return the original receipt without overwriting it.
 const updated=structuredClone((await s.get('state')));updated.revision=2;updated.tasks.push(task('b'));await s.put('state',updated);
 const replay=await s.call('/commit',op,s.token);assert.deepEqual(replay.data,first.data);assert.equal((await s.get('state')).tasks.length,2);
 assert.equal((await s.call('/commit',{...op,operationId:crypto.randomUUID()},s.token)).status,409);
 assert.equal((await s.call('/commit',{...op,data:empty()},s.token)).status,409);
 assert.equal((await s.call('/commit',{...op,instanceId:crypto.randomUUID()},s.token)).status,409);
 assert.equal((await s.call('/previous',undefined,s.token)).data.state.tasks.length,0);
});
test('invalid sync input leaves both data and recovery point intact; password changes revoke tokens',async t=>{
 const s=await server(t),op={deviceId:crypto.randomUUID(),operationId:crypto.randomUUID(),instanceId:s.instanceId,revision:0,data:empty()};op.data.tasks=[{id:'invalid'}];
 assert.equal((await s.call('/commit',op,s.token)).status,400);assert.equal((await s.get('state')).revision,0);assert.equal((await s.get('syncPrevious')),null);
 await s.put('account',{...(await s.get('account')),hash:'00'.repeat(64)});assert.equal((await s.call('/state',undefined,s.token)).status,401);
});
