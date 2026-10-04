import {atomicRoute} from './storage.mjs';
import express from 'express';
import crypto from 'node:crypto';
import {serverAddress} from './public/portability.mjs';
import {syncData,stable} from './public/sync-merge.mjs';
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const validID=s=>typeof s==='string'&&/^[a-f0-9-]{36}$/.test(s);
export async function registerSync(app,{db,get,put}){
 if(!(await get('syncInstance')))(await put('syncInstance',crypto.randomUUID()));
 const router=express.Router(),attempts=new Map();
 router.use(async(req,res,next)=>{
  res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.vary('Origin');
  try{if(!req.headers.origin||serverAddress(req.headers.origin)!==req.headers.origin)throw Error();}catch{return res.status(403).json({error:'同步请求必须来自 HTTPS 或本机应用地址'});}
  res.set({'Access-Control-Allow-Origin':req.headers.origin,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization, X-Shixu-Sync'});
  if(req.method==='OPTIONS')return res.sendStatus(204);
  if(req.headers['x-shixu-sync']!=='1')return res.status(403).json({error:'缺少同步操作标识'});next();
 });
 router.use(express.json({limit:'2mb'}));
 router.get('/meta',async(req,res)=>res.json({app:'shixu',protocol:1,instanceId:(await get('syncInstance'))}));
 router.post('/login',atomicRoute(db, async(req,res)=>{
  const ip=req.socket.remoteAddress,now=Date.now();for(const [key,value] of attempts)if(now-value.at>900000)attempts.delete(key);
  const entry=attempts.get(ip)||{count:0,at:now};if(entry.count>=10)return res.status(429).json({error:'尝试过多，请 15 分钟后重试'});entry.count++;attempts.set(ip,entry);
  const a=(await get('account')),password=String(req.body?.password||'').slice(0,1024);
  if(req.body?.username!==a.username||!crypto.timingSafeEqual(crypto.scryptSync(password,a.salt,64),Buffer.from(a.hash,'hex')))return res.status(401).json({error:'同步服务器用户名或密码错误'});
  attempts.delete(ip);(await db.prepare('DELETE FROM sync_tokens WHERE expires<? OR account<>?').run(now,a.hash));
  if((await db.prepare('SELECT count(*) AS n FROM sync_tokens').get()).n>=100)return res.status(409).json({error:'同步授权已达上限，请在服务器修改密码以撤销旧授权'});
  const token=crypto.randomBytes(32).toString('hex');(await db.prepare('INSERT INTO sync_tokens VALUES (?,?,?,?)').run(hash(token),req.headers.origin,a.hash,now+30*86400000));
  res.json({token,instanceId:(await get('syncInstance'))});
 }));
 router.use(async(req,res,next)=>{const token=/^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization||'')?.[1];const row=token&&(await db.prepare('SELECT * FROM sync_tokens WHERE token=? AND origin=? AND account=? AND expires>?').get(hash(token),req.headers.origin,(await get('account')).hash,Date.now()));if(!row)return res.status(401).json({error:'同步授权已过期或被撤销，请重新连接此服务器'});req.syncToken=hash(token);next();});
 router.post('/logout',atomicRoute(db, async(req,res)=>{(await db.prepare('DELETE FROM sync_tokens WHERE token=?').run(req.syncToken));res.json({ok:true});}));
 router.get('/state',async(req,res)=>res.json({instanceId:(await get('syncInstance')),state:{...syncData((await get('state'))),revision:(await get('state')).revision}}));
 router.post('/commit',atomicRoute(db, async(req,res)=>{
  const {deviceId,operationId,instanceId,revision,data}=req.body||{};
  if(instanceId!==(await get('syncInstance')))return res.status(409).json({error:'服务器身份已改变，请重新连接并预览'});
  if(!validID(deviceId)||!validID(operationId)||!Number.isSafeInteger(revision)||revision<0)return res.status(400).json({error:'同步请求标识无效'});
  try{
   const clean=syncData(data),fingerprint=hash(stable({revision,data:clean}));
   const receipt=(await db.prepare('SELECT * FROM sync_receipts WHERE device=?').get(deviceId));
   if(receipt?.operation===operationId){if(receipt.fingerprint!==fingerprint)return res.status(409).json({error:'重复请求内容不一致'});return res.json(JSON.parse(receipt.result));}
   if((await get('state')).revision!==revision)return res.status(409).json({error:'服务器数据已变化，请重新预览；尚未写入此次同步'});
   if(!receipt&&(await db.prepare('SELECT count(*) AS n FROM sync_receipts').get()).n>=100)return res.status(409).json({error:'同步设备数量达到当前版本上限'});
   const next={...clean,revision:revision+1},result={instanceId,operationId,state:next};
   await db.transaction(async()=>{(await put('syncPrevious',(await get('state'))));(await put('state',next));(await db.prepare('INSERT INTO sync_receipts VALUES (?,?,?,?) ON CONFLICT(device) DO UPDATE SET operation=excluded.operation,fingerprint=excluded.fingerprint,result=excluded.result').run(deviceId,operationId,fingerprint,JSON.stringify(result)));});
   res.json(result);
  }catch(e){res.status(400).json({error:e.message});}
 }));
 router.get('/previous',async(req,res)=>{const state=(await get('syncPrevious'));if(!state)return res.status(404).json({error:'还没有同步前的服务器恢复点'});res.json({state:syncData(state)});});
 router.use(async(req,res)=>res.status(404).json({error:'不支持的同步接口'}));
 app.use('/api/sync/v1',router);
}
