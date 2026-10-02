// Version-specific SDK glue for DeepSeek Harness 0.1.0-rc.5 (MIT).
// That SDK always creates sessions. This adapter adds the public agents.resume
// operation while retaining its protocol/notification implementation.
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const load=p=>import(pathToFileURL(path.join(process.env.SHIXU_HARNESS_ROOT,'packages',p,'lib/index.js')).href);
const {HarnessSdkJsonRpcServer}=await load('sdk/server');
const {JsonRpcLineTransport}=await load('sdk/protocol');
export const name='shixu-resumable-sdk';
export const inject=['agents','sessionPersistence'];
class ResumableServer extends HarnessSdkJsonRpcServer{
 async createSession(id){
  const stored=await this.ctx.sessionPersistence.list();
  if(!stored.some(s=>s.id===id))return super.createSession(id);
  const handle=await this.ctx.agents.resume({resumeSessionId:id,agentOptions:{provider:this.provider,model:this.model,maxTokens:this.maxTokens}});
  const record={handle};this.sessions.set(id,record);return record;
 }
}
export function apply(ctx){
 const transport=new JsonRpcLineTransport(process.stdin,process.stdout),server=new ResumableServer(ctx,transport);
 let exiting=false;
 transport.onRequest(async(method,params)=>{
  const result=await server.handleRequest(method,params);
  if(method==='shutdown'&&!exiting){exiting=true;setImmediate(async()=>{await transport.flush();await ctx.root.fiber.dispose();process.exit(0);});}
  return result;
 });
 ctx.effect(()=>{transport.start();return async()=>{await server.shutdown();transport.close();};},'shixu.sdk');
}
