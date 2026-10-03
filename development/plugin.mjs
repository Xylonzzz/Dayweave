import {pathToFileURL} from 'node:url';
const {defineTool}=await import(pathToFileURL(process.env.SHIXU_TOOLS_MODULE).href);
export const name='shixu-developer';
export const inject=['tools','llm'];
export function apply(ctx){
 const call=async(body,signal)=>{
  const response=await fetch(process.env.SHIXU_BRIDGE,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.SHIXU_BRIDGE_TOKEN}`},body:JSON.stringify(body),signal});
  const value=await response.json();if(!response.ok)throw Error(value.error);return value;
 };
 const output={schema:{type:'json'},render:(_args,value)=>[{type:'text',text:JSON.stringify(value)}]};
 for(const [name,description,parameters] of [
  ['dev_list','列出独立副本中的可用源码文件。',{}],
  ['dev_read','读取源码；大文件使用 offset/limit 分段。',{path:{type:'string',required:true},offset:{type:'number'},limit:{type:'number'}}],
  ['dev_search','在单个源码文件中按原文搜索，返回匹配位置、行号及上下文；最多 20 处。大文件定位函数和事件处理优先用此工具，避免逐段猜偏移。',{path:{type:'string',required:true},query:{type:'string',required:true}}],
  ['dev_write','替换或新建独立副本中的完整文本文件。不会直接修改当前安装。',{path:{type:'string',required:true},content:{type:'string',required:true}}],
  ['dev_replace','精确替换一处源码。优先用于大文件的小改动，避免回写整份文件。before 必须非空且只匹配一次，不匹配或多次匹配会拒绝。先 dev_read 获取原文。',{path:{type:'string',required:true},before:{type:'string',required:true},after:{type:'string',required:true}}],
  ['dev_diff','查看改动文件和从首处变化附近开始的前后原文。offset 是片段偏移；truncated=true 时结合 dev_search/dev_read 核对其他变化，片段不是完整差异。',{}],
  ['dev_test','在无网络、无真实数据的 Docker 容器中运行固定测试。失败时读取日志并修正。',{}],
  ['dev_verdict','审查阶段提交结论，只有确认符合用户需求且无阻断问题才 approved=true。',{approved:{type:'boolean',required:true},summary:{type:'string',required:true}}]
 ])ctx.tools.register(defineTool({name,description,parameters,output,execute:(args,exec)=>call({action:name,...args},exec.signal)}));
 ctx.on('llm/stream',async function*(options,next){await call({action:'step'});for await(const chunk of next()){if(chunk.type==='text-delta')await call({action:'text',text:chunk.text});yield chunk;}},{global:true});
}
