import crypto from 'node:crypto';
import {promisify} from 'node:util';
import {AsyncLocalStorage} from 'node:async_hooks';

const scrypt=promisify(crypto.scrypt);
export const tokenHash=token=>crypto.createHash('sha256').update(token).digest('hex');
export async function passwordMatches(account,password){
  const digest=await scrypt(String(password||'').slice(0,1024),account.salt,64);
  return crypto.timingSafeEqual(digest,Buffer.from(account.hash,'hex'));
}
export async function passwordRecord(password){
  const salt=crypto.randomBytes(16).toString('hex');
  return {salt,hash:(await scrypt(password,salt,64)).toString('hex')};
}

// The original owner's keys remain in place: upgrades preserve backups and desktop tools.
// Every other account has its own KV namespace, including credentials and sync history.
export async function createAccounts({db,get:rawGet,put:rawPut,defaults,env=process.env}){
  const context=new AsyncLocalStorage();
  let owner;
  await db.transaction(async()=>{
    owner=await rawGet('account');
    if(!owner)throw Error('请先创建初始账号');
    const entries=await rawGet('accountDirectory',[]);
    const ownerEntry=entries.find(a=>a.owner);
    if(!owner.id||owner.owner!==true){owner={...owner,id:ownerEntry?.id||owner.id||crypto.randomUUID(),owner:true};await rawPut('account',owner);}
    await rawPut('accountDirectory',[{id:owner.id,username:owner.username,owner:true},...entries.filter(a=>!a.owner)]);
    if(!await rawGet('accountSessionsMigrated')){
      for(const session of await db.prepare('SELECT token FROM sessions').all())await rawPut('session:'+session.token,{id:owner.id,credential:owner.hash,remember:true});
      await rawPut('accountSessionsMigrated',true);
    }
    if(!await rawGet('registrationPolicy'))await rawPut('registrationPolicy',{
      mode:env.REGISTRATION_MODE||'invite',code:env.REGISTRATION_CODE||crypto.randomBytes(12).toString('base64url')
    });
    if(!['closed','invite','open'].includes((await rawGet('registrationPolicy')).mode))throw Error('REGISTRATION_MODE 需要为 closed、invite 或 open');
  });
  const current=()=>context.getStore()||owner;
  const key=name=>current().owner?name:`user:${current().id}:${name}`;
  const get=(name,fallback=null)=>rawGet(key(name),fallback);
  const put=(name,value)=>rawPut(key(name),value);
  const directory=()=>rawGet('accountDirectory',[]);
  const byId=async id=>{const entry=(await directory()).find(a=>a.id===id);return entry?rawGet(entry.owner?'account':`user:${id}:account`):null;};
  const find=async username=>{
    const entry=(await directory()).find(a=>a.username.toLowerCase()===String(username||'').toLowerCase());
    return entry?byId(entry.id):null;
  };
  const authenticate=async(username,password)=>{
    const account=await find(username);
    // Unknown usernames do the same password work as known ones.
    const valid=await passwordMatches(account||owner,password);
    return account&&valid?account:null;
  };
  const run=(account,fn)=>context.run(account,fn);
  const policy=()=>rawGet('registrationPolicy');
  const register=async({username,password,code})=>{
    if(typeof username!=='string'||! /^[a-zA-Z0-9_\-]{3,32}$/.test(username))throw Error('用户名需要 3–32 个英文字母、数字、下划线或短横线');
    if(typeof password!=='string'||password.length<12||password.length>128)throw Error('密码需要 12–128 个字符');
    const credentials=await passwordRecord(password);
    return db.transaction(async()=>{
      const settings=await policy();
      if(settings.mode==='closed')throw Error('当前服务器未开放注册');
      if(settings.mode==='invite'&&tokenHash(String(code||''))!==tokenHash(settings.code))throw Error('邀请码不正确');
      if(await find(username))throw Error('这个用户名已被使用');
      const account={id:crypto.randomUUID(),username,owner:false,...credentials};
      await run(account,async()=>{
        await put('account',account);await put('state',defaults());await put('syncInstance',crypto.randomUUID());
      });
      await rawPut('accountDirectory',[...await directory(),{id:account.id,username,owner:false}]);
      return account;
    });
  };
  const session=async req=>{
    const cookie=env.SHIXU_PREVIEW==='1'?'shixu_preview':'session';
    const token=new RegExp('(?:^|;\\s*)'+cookie+'=([a-f0-9]{64})(?:;|$)').exec(req.headers.cookie||'')?.[1];
    if(!token)return null;
    const hashed=tokenHash(token),row=await db.prepare('SELECT * FROM sessions WHERE token=? AND expires>?').get(hashed,Date.now());
    if(!row)return null;
    const binding=await rawGet('session:'+hashed);
    if(!binding)return null;
    const account=await byId(binding.id);
    if(!account||binding.credential!==account.hash)return null;
    return {...row,account,remember:binding?.remember??true};
  };
  const login=async(account,remember,res)=>{
    const cookie=env.SHIXU_PREVIEW==='1'?'shixu_preview':'session',token=crypto.randomBytes(32).toString('hex');
    const duration=remember?30*86400000:8*3600000,hashed=tokenHash(token);
    for(const row of await db.prepare('SELECT token FROM sessions WHERE expires<?').all(Date.now()))await db.prepare('DELETE FROM kv WHERE key=?').run('session:'+row.token);
    await db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
    await db.prepare('INSERT INTO sessions VALUES (?,?)').run(hashed,Date.now()+duration);
    await rawPut('session:'+hashed,{id:account.id,credential:account.hash,remember});
    res.cookie(cookie,token,{httpOnly:true,sameSite:'strict',secure:(env.PUBLIC_ORIGIN||'').startsWith('https:'),path:'/',...(remember?{maxAge:duration}:{})});
  };
  const scopeID=value=>current().owner?value:tokenHash(current().id+':'+value).slice(0,36);
  return {owner,current,get,put,find,byId,authenticate,run,register,policy,session,login,scopeID,directory,
    setPolicy:value=>rawPut('registrationPolicy',value),
    async byCredential(hash){for(const entry of await directory()){const a=await byId(entry.id);if(a.hash===hash)return a;}return null;},
    async forgetSession(token){await db.prepare('DELETE FROM sessions WHERE token=?').run(token);await db.prepare('DELETE FROM kv WHERE key=?').run('session:'+token);}
  };
}
