import {serverAddress} from './portability.mjs';
import {readLocal,readSyncProfile,connectSyncProfile,prepareSync,finishSync,clearSyncPending,forgetSyncProfile} from './local-store.mjs';
import {mergeStates,syncData} from './sync-merge.mjs';
export async function syncRequest(origin,route,body,token){
 origin=serverAddress(origin);
 const response=await fetch(origin+'/api/sync/v1'+route,{method:body===undefined?'GET':'POST',mode:'cors',credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000),headers:{'Content-Type':'application/json','X-Shixu-Sync':'1',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 let result;try{result=await response.json();}catch{const error=Error(response.status===413?'同步数据超过当前 2 MB 上限，请先导出备份并精简数据':'目标未提供兼容的同步接口，请先升级服务器');error.status=response.status;throw error;}
 if(!response.ok){const error=Error(result.error||'同步请求失败');error.status=response.status;throw error;}return result;
}
export async function connectServer(address,username,password){
 const origin=serverAddress(address),meta=await syncRequest(origin,'/meta');
 if(meta.app!=='shixu'||meta.protocol!==1||typeof meta.instanceId!=='string')throw Error('目标不是兼容的时序同步服务器');
 const login=await syncRequest(origin,'/login',{username,password});if(login.instanceId!==meta.instanceId||!(/^[a-f0-9]{64}$/).test(login.token||''))throw Error('服务器身份或授权格式无效，请重试');
 await connectSyncProfile(origin,login);return origin;
}
export async function previewSync(origin){
 const profile=await readSyncProfile(origin);if(!profile?.token)throw Error('请先连接此服务器');if(profile.pending)throw Error('上次同步尚未确认，请先点击重试待确认同步');
 const local=await readLocal(),reply=await syncRequest(origin,'/state',undefined,profile.token);if(reply.instanceId!==profile.instanceId)throw Error('服务器身份已变化，请重新连接');
 const remote={...syncData(reply.state),revision:reply.state.revision};return {origin,instanceId:profile.instanceId,local,remote,base:profile.base||null};
}
export function resolvePreview(preview,mode,choices={}){
 if(mode==='upload')return {data:syncData(preview.local),conflicts:[],notes:['以本地为准：服务器独有内容将被移除。']};
 if(mode==='download')return {data:syncData(preview.remote),conflicts:[],notes:['以服务器为准：本地独有内容将被移除。']};
 return mergeStates(preview.base,preview.local,preview.remote,choices);
}
export async function retrySync(origin){
 const profile=await readSyncProfile(origin),operation=profile?.pending?.operation;if(!operation)throw Error('没有待确认同步');
 let reply;try{reply=await syncRequest(origin,'/commit',operation,profile.token);}catch(e){if([400,409,413,422].includes(e.status))await clearSyncPending(origin,operation.operationId);throw e;}
 return finishSync(origin,reply);
}
export async function applySync(preview,mode,choices){const result=resolvePreview(preview,mode,choices);if(result.conflicts.length)throw Error('请先处理全部冲突');await prepareSync(preview.origin,preview,result.data);return retrySync(preview.origin);}
export async function disconnectServer(origin){const profile=await readSyncProfile(origin);if(profile?.pending)throw Error('请先重试待确认同步');if(profile?.token)try{await syncRequest(origin,'/logout',{},profile.token);}catch(e){if(e.status!==401)throw e;}await forgetSyncProfile(origin);}
export async function previousServerState(origin){const profile=await readSyncProfile(origin);if(!profile?.token)throw Error('请先连接此服务器');return (await syncRequest(origin,'/previous',undefined,profile.token)).state;}
