import {readAutoSync,autoSyncStatus,readSyncProfile,prepareSync,acknowledgeSync} from './local-store.mjs';
import {previewSync,resolvePreview,retrySync} from './sync-client.mjs';
import {syncData,stable} from './sync-merge.mjs';
// No timers or browser globals in the decision function: tests can exercise races deterministically.
export async function autoSyncOnce({active=()=>true}={},deps={}){
 const read=deps.read||readAutoSync,status=deps.status||autoSyncStatus,profile=deps.profile||readSyncProfile;
 const config=await read();if(!active()||!config.enabled||['conflict','attention'].includes(config.status))return {kind:'skipped'};
 const stillEnabled=async()=>{const current=await read();return active()&&current.enabled&&current.origin===config.origin&&current.version===config.version&&!['conflict','attention'].includes(current.status);};
 try{
  const target=await profile(config.origin);if(!target?.base){await status(config.version,'attention','请先手动完成首次同步');return {kind:'attention'};}
  if(!await stillEnabled())return {kind:'skipped'};
  if(target.pending){const saved=await(deps.retry||retrySync)(config.origin);return {kind:'saved',state:saved};}
  const preview=await(deps.preview||previewSync)(config.origin);if(!await stillEnabled())return {kind:'skipped'};
  const result=resolvePreview(preview,'merge');
  if(result.conflicts.length){await status(config.version,'conflict',`发现 ${result.conflicts.length} 项冲突，自动同步已暂停，请在设置中预览并处理。`);return {kind:'conflict'};}
  const data=syncData(result.data);
  if(stable(syncData(preview.local))===stable(data)&&stable(syncData(preview.remote))===stable(data)){await(deps.acknowledge||acknowledgeSync)(config.origin,preview,data,config.version);await status(config.version,'idle','已检查：本地与服务器内容一致');return {kind:'unchanged'};}
  if(!await stillEnabled())return {kind:'skipped'};
  await(deps.prepare||prepareSync)(config.origin,preview,data,config.version);
  if(!await stillEnabled())return {kind:'skipped'};
  const saved=await(deps.retry||retrySync)(config.origin);return {kind:'saved',state:saved};
 }catch(error){
  const transient=error.status===409||error.name==='TypeError'||error.name==='TimeoutError'||error.name==='AbortError'||/重新预览|已改变|待确认同步|请求失败/.test(error.message);
  await status(config.version,transient?'waiting':'attention',transient?'连接或数据暂时变化，稍后重试；本地修改已保留。':error.message+'，请在设置中处理后重新开启自动同步。');
  return {kind:transient?'waiting':'attention'};
 }
}
export function startAutoSync({active,onSaved,onStatus}){
 let stopped=false,busy=false,timer;
 const permitted=()=>!stopped&&active()&&navigator.onLine&&!document.hidden;
 async function tick(){
  if(!busy&&permitted()){busy=true;try{const work=async()=>{const result=await autoSyncOnce({active:permitted});if(result.kind==='saved')await onSaved(result.state);await onStatus?.(await readAutoSync());};if(navigator.locks)await navigator.locks.request('shixu-auto-sync',{ifAvailable:true},lock=>lock?work():undefined);else await work();}catch{}finally{busy=false;}}
  if(!stopped)timer=setTimeout(tick,30000);
 }
 const wake=()=>{if(!busy){clearTimeout(timer);timer=setTimeout(tick,1000);}};
 window.addEventListener('online',wake);document.addEventListener('visibilitychange',wake);window.addEventListener('shixu-auto-sync-change',wake);timer=setTimeout(tick,3000);
 return ()=>{stopped=true;clearTimeout(timer);window.removeEventListener('online',wake);document.removeEventListener('visibilitychange',wake);window.removeEventListener('shixu-auto-sync-change',wake);};
}
