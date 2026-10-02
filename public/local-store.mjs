import {validateState} from './validate-state.mjs';
import {backupData,makeBackup} from './portability.mjs';
import {mergeStates,syncData} from './sync-merge.mjs';
const defaults=()=>({revision:0,courses:[],tasks:[],ideas:[],blocks:[],reviews:[],settings:{name:'同学',semesterStart:'2026-08-31',dayStart:'08:00',dayEnd:'22:00',quietStart:'23:00',quietEnd:'07:00',reminderMinutes:[1440,120,30],courseReminder:15,timezone:'Asia/Shanghai'}});
let dbPromise;
function database(){return dbPromise??=new Promise((resolve,reject)=>{const req=indexedDB.open('shixu-local',1);req.onupgradeneeded=()=>req.result.createObjectStore('documents');req.onsuccess=()=>resolve(req.result);req.onerror=()=>{dbPromise=null;reject(Error('本地数据库无法打开，请检查浏览器存储权限'));};});}
async function transaction(write,fn){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('documents',write?'readwrite':'readonly'),store=tx.objectStore('documents');let result,error;tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(error||Error('本地保存失败，数据尚未保存；请检查剩余存储空间'));tx.onerror=()=>{};const req=store.get('state');req.onsuccess=()=>{try{result=fn(store,req.result);}catch(e){error=e;tx.abort();}};});}
export async function initializeLocal(seed){return transaction(true,(store,current)=>{if(current)return current;const value=validateState(seed?{...backupData(seed),revision:0}:defaults());store.put(value,'state');return value;});}
export const readLocal=()=>transaction(false,(_,s)=>{if(!s)throw Error('请先初始化本地空间');return s;});
// The state, shared sync lock and per-server baseline change in one IndexedDB transaction.
async function syncTransaction(origin,write,fn){const db=await database();return new Promise((resolve,reject)=>{
 const tx=db.transaction('documents',write?'readwrite':'readonly'),store=tx.objectStore('documents');let result,error;
 tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(error||Error('同步记录未保存，请检查本地存储'));tx.onerror=()=>{};
 const values={};let left=3;for(const [name,key] of [['state','state'],['profile','sync:'+origin],['pending','syncPending']]){const req=store.get(key);req.onsuccess=()=>{values[name]=req.result;if(--left===0)try{result=fn(store,values);}catch(e){error=e;tx.abort();}};}
 });}
export const readSyncProfile=origin=>syncTransaction(origin,false,(_,v)=>v.profile||null);
export async function listSyncProfiles(){const db=await database();return new Promise((resolve,reject)=>{const req=db.transaction('documents').objectStore('documents').getAll();req.onsuccess=()=>resolve(req.result.filter(x=>x?.syncProfile===1).map(({origin,instanceId,lastSync,pending,token})=>({origin,instanceId,lastSync,pending:!!pending,connected:!!token})));req.onerror=()=>reject(req.error);});}
export const connectSyncProfile=(origin,login)=>syncTransaction(origin,true,(store,{profile,pending})=>{
 if(profile?.instanceId&&profile.instanceId!==login.instanceId)throw Error('此地址的服务器身份已改变。请保留本地备份，并移除旧连接后重新连接。');
 const next={...profile,syncProfile:1,origin,instanceId:login.instanceId,token:login.token,deviceId:profile?.deviceId||crypto.randomUUID()};store.put(next,'sync:'+origin);return next;
});
export const forgetSyncProfile=origin=>syncTransaction(origin,true,(store,{profile,pending})=>{if(profile?.pending||pending===origin)throw Error('请先完成待确认的同步，再移除此连接');store.delete('sync:'+origin);});
export const prepareSync=(origin,preview,data)=>syncTransaction(origin,true,(store,{state,profile,pending})=>{
 if(pending)throw Error('请先完成 '+pending+' 上的待确认同步，再同步其他服务器');
 if(!profile?.token||profile.instanceId!==preview.instanceId||state.revision!==preview.local.revision)throw Error('本地数据或连接已变化，请重新预览');
 const operation={deviceId:profile.deviceId,operationId:crypto.randomUUID(),instanceId:profile.instanceId,revision:preview.remote.revision,data:syncData(data)};
 profile.pending={operation,local:state};store.put(profile,'sync:'+origin);store.put(origin,'syncPending');return operation;
});
export const clearSyncPending=(origin,operationId)=>syncTransaction(origin,true,(store,{profile,pending})=>{if(profile?.pending?.operation.operationId!==operationId)throw Error('同步记录已变化');delete profile.pending;store.put(profile,'sync:'+origin);if(pending===origin)store.delete('syncPending');});
export const finishSync=(origin,response)=>syncTransaction(origin,true,(store,{state,profile,pending})=>{
 const previous=profile?.pending;if(!previous||previous.operation.operationId!==response.operationId||profile.instanceId!==response.instanceId)throw Error('同步回执与本地记录不匹配，请重新连接检查');
 const remote=syncData(response.state);let data=remote;
 if(state.revision!==previous.local.revision){const merged=mergeStates(syncData(previous.local),syncData(state),remote);const choices=Object.fromEntries(merged.conflicts.map(c=>[c.key,'local']));data=mergeStates(syncData(previous.local),syncData(state),remote,choices).data;}
 const next=validateState({...data,revision:state.revision+1});store.put(state,'previous');store.put(next,'state');profile.base=remote;profile.lastSync=new Date().toISOString();delete profile.pending;store.put(profile,'sync:'+origin);if(pending===origin)store.delete('syncPending');return next;
});
async function writeLocal(next,revision,restore=false){validateState(next);return transaction(true,(store,current)=>{if(!current||current.revision!==revision)throw Error('其他本地窗口已更新数据，请刷新后重试');if(restore)store.put(current,'previous');next.revision=current.revision+1;store.put(next,'state');return next;});}
export async function localAPI(url,options={}){
 const method=options.method||'GET';const body=typeof options.body==='string'?JSON.parse(options.body):{};
 if(url==='/api/state')return method==='PUT'?writeLocal(body,body.revision):readLocal();
 if(url==='/api/providers'&&method==='GET')return [];
 if(url==='/api/notifications')return {subscriptions:0,emailConfigured:false};
 if(url==='/api/logout')return {ok:true};
 if(url==='/api/backup')return makeBackup(await readLocal(),'local-device');
 if(url==='/api/backup/previous'){const db=await database();return new Promise((resolve,reject)=>{const req=db.transaction('documents').objectStore('documents').get('previous');req.onsuccess=()=>req.result?resolve(makeBackup(req.result,'local-device')):reject(Error('还没有导入前的恢复点'));req.onerror=()=>reject(req.error);});}
 if(url==='/api/backup/preview'){const data=validateState({...backupData(body.backup),revision:0});return {revision:(await readLocal()).revision,counts:Object.fromEntries(['courses','tasks','ideas','blocks'].map(k=>[k,data[k].length]))};}
 if(url==='/api/backup/restore'){if(body.confirmReplace!==true)throw Error('请先确认替换本地数据');return writeLocal({...backupData(body.backup),revision:0},body.revision,true);}
 throw Error('仅本地模式暂不支持此服务功能。任务、课程、灵感、复盘及备份可离线使用；AI、文件识别与推送需服务端。');
}
