import {backupData} from './portability.mjs';
import {validateState} from './validate-state.mjs';
export const collections=['courses','tasks','ideas','blocks','reviews'];
export const stable=value=>JSON.stringify(value===undefined?null:normalize(value));
function normalize(value){if(Array.isArray(value))return value.map(normalize);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,normalize(value[k])]));return value;}
const same=(a,b)=>stable(a)===stable(b);
export function mergeStates(base,local,remote,choices={}){
 const result={settings:{}},conflicts=[],notes=[];
 function choose(key,b,l,r,label){
  if(same(l,r))return l;
  if(base&&same(l,b))return r;
  if(base&&same(r,b))return l;
  // No shared history: absence means an unshared record, never a deletion.
  if(!base&&l===undefined)return r;if(!base&&r===undefined)return l;
  if(Object.hasOwn(choices,key)&&choices[key]==='local')return l;
  if(Object.hasOwn(choices,key)&&choices[key]==='remote')return r;
  conflicts.push({key,label,local:l??null,remote:r??null});return l;
 }
 function rows(name,b,l,r){const maps=[b,l,r].map(items=>new Map((items||[]).map(x=>[x.id,x])));const ids=new Set([...maps[1].keys(),...maps[2].keys(),...maps[0].keys()]);return [...ids].flatMap(id=>{const values=maps.map(m=>m.get(id));const label=values[1]?.title||values[2]?.title||values[1]?.name||values[2]?.name||values[1]?.text||values[2]?.text||id;const item=choose(JSON.stringify([name,id]),...values,label);return item===undefined?[]:[structuredClone(item)];});}
 for(const name of collections)result[name]=rows(name,base?.[name],local[name],remote[name]);
 for(const key of new Set([...Object.keys(local.settings),...Object.keys(remote.settings),...Object.keys(base?.settings||{})])){
  if(key==='taskTypes'){result.settings[key]=rows('taskTypes',base?.settings[key],local.settings[key],remote.settings[key]);continue;}
  const value=choose(JSON.stringify(['settings',key]),base?.settings[key],local.settings[key],remote.settings[key],'偏好：'+key);
  if(value!==undefined)Object.defineProperty(result.settings,key,{value:structuredClone(value),enumerable:true,writable:true,configurable:true});
 }
 for(const b of result.blocks)if(b.taskId&&!result.tasks.some(t=>t.id===b.taskId)){notes.push(`「${b.title}」关联的任务已不存在，将保留日程并解除关联。`);b.taskId='';}
 return {data:result,conflicts,notes};
}
export function syncData(state){return backupData(validateState({...backupData(state),revision:0}));}
export function difference(from,to){return Object.fromEntries(collections.map(name=>{const before=new Map(from[name].map(x=>[x.id,x])),after=new Map(to[name].map(x=>[x.id,x]));return [name,{added:[...after].filter(([id])=>!before.has(id)).length,changed:[...after].filter(([id,x])=>before.has(id)&&!same(before.get(id),x)).length,deleted:[...before.keys()].filter(id=>!after.has(id)).length}];}));}
