import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {DatabaseSync} from 'node:sqlite';
import {prepare,digest,writeSource} from '../development/workspace.mjs';
import {snapshot,verifyRelease,writeJSON,stageCandidate,assertCompatible,startPreview,previewInfo,runtimeState} from '../development/releases.mjs';
import {VersionSupervisor} from '../development/supervisor.mjs';

const fixtureServer=`import http from 'node:http';import fs from 'node:fs';import path from 'node:path';
if(fs.existsSync('public/fail.txt'))process.exit(2);
http.createServer((req,res)=>{if(req.url==='/healthz'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({app:'shixu',status:'ok',bootId:process.env.SHIXU_BOOT_ID}));}else res.end(fs.readFileSync('public/app.js'));}).listen(Number(process.env.PORT),'127.0.0.1');`;
async function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'shixu-release-test-')),cleanup=[];t.after(async()=>{for(const dispose of cleanup)await dispose();fs.rmSync(root,{recursive:true,force:true});});
 fs.mkdirSync(path.join(root,'public'));fs.writeFileSync(path.join(root,'public/app.js'),'original');fs.writeFileSync(path.join(root,'server.mjs'),fixtureServer);fs.writeFileSync(path.join(root,'package-lock.json'),'{}');fs.writeFileSync(path.join(root,'.env'),'SENSITIVE=excluded');
 const data=path.join(root,'data');fs.mkdirSync(data);fs.writeFileSync(path.join(data,'secret.key'),Buffer.alloc(32,1));const db=new DatabaseSync(path.join(data,'planner.sqlite'));db.exec('CREATE TABLE items(value TEXT); INSERT INTO items VALUES (\'existing\')');db.close();
 const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
 return {root,port,data,cleanup};
}
function candidate(root,change){const folder=path.join(root,'.shixu-development',crypto.randomUUID());const work=prepare(root,folder);for(const [file,content] of Object.entries(change))writeSource(work,file,content);writeJSON(path.join(folder,'verified.json'),{baseline:work.baseline,verified:JSON.stringify(digest(work.candidate))});writeJSON(path.join(folder,'result.json'),{id:crypto.randomUUID(),phase:'ready',review:{approved:true}});return {folder,work};}
function markPreview(root,id){const {folder}=verifyRelease(root,id);writeJSON(path.join(folder,'preview.json'),{healthy:true});}

test('release staging excludes personal data and refuses changed or unreviewed candidates',async t=>{
 const {root}=await fixture(t),{folder,work}=candidate(root,{'public/app.js':'new'}),id=stageCandidate(root,root,folder),release=verifyRelease(root,id);
 assert.ok(!fs.existsSync(path.join(release.source,'.env')));assert.ok(!fs.existsSync(path.join(release.source,'data')));
 fs.writeFileSync(path.join(work.candidate,'public/app.js'),'tampered');assert.throws(()=>stageCandidate(root,root,folder),/验证后/);
 fs.writeFileSync(path.join(release.source,'public/app.js'),'tampered');assert.throws(()=>verifyRelease(root,id),/已变化/);
});
test('backend and dependency changes cannot enter the UI-only release contract',async t=>{
 const {root}=await fixture(t),{work}=candidate(root,{'server.mjs':'changed'});assert.throws(()=>assertCompatible(root,work.candidate),/后端/);
});
test('preview command has isolated data, internal network, localhost port and no inherited secrets',async t=>{
 const {root}=await fixture(t),id=snapshot(root,root),calls=[];
 const result=await startPreview(root,id,{run:async args=>{calls.push(args);return {ok:true,output:'ok'};},health:async()=>({ok:true,json:async()=>({app:'shixu',status:'ok'})})});
 assert.equal(result.healthy,true);assert.match(result.url,/^http:\/\/preview-[a-f0-9-]{36}\.localhost:/);
 assert.ok(calls.some(args=>args.includes('--internal')));const run=calls.find(args=>args[0]==='run');assert.ok(run.includes('DATA_DIR=/work/data'));assert.ok(run.includes('SHIXU_DEVELOPMENT=disabled'));assert.ok(run.includes('SHIXU_PREVIEW=1'));assert.ok(run.includes('1800'));assert.ok(!JSON.stringify(run).includes('SENSITIVE'));assert.equal(previewInfo(root,id).healthy,true);
});
test('supervisor switches verified UI release, restores previous code and preserves latest data',async t=>{
 const {root,port,data,cleanup}=await fixture(t),supervisor=new VersionSupervisor(root,{env:{...process.env,PORT:String(port),DATA_DIR:data},healthTimeout:2500});cleanup.push(()=>supervisor.stop());
 await supervisor.start();const {folder}=candidate(root,{'public/app.js':'new version'}),id=stageCandidate(root,root,folder);markPreview(root,id);
 await supervisor.switchTo(id);assert.equal(await(await fetch(`http://127.0.0.1:${port}/app.js`)).text(),'new version');assert.equal(runtimeState(root).current,id);assert.ok(fs.existsSync(path.join(runtimeState(root).backup,'planner.sqlite')));
 const db=new DatabaseSync(path.join(data,'planner.sqlite'));db.exec("INSERT INTO items VALUES ('after switch')");db.close();
 await supervisor.switchTo(runtimeState(root).previous,{rollback:true});assert.equal(await(await fetch(`http://127.0.0.1:${port}/app.js`)).text(),'original');
 const verify=new DatabaseSync(path.join(data,'planner.sqlite'));assert.equal(verify.prepare('SELECT count(*) AS n FROM items').get().n,2);verify.close();
});
test('failed health check automatically starts old version; incompatible release never stops it',async t=>{
 const {root,port,data,cleanup}=await fixture(t),supervisor=new VersionSupervisor(root,{env:{...process.env,PORT:String(port),DATA_DIR:data},healthTimeout:1200});cleanup.push(()=>supervisor.stop());await supervisor.start();
 const {folder}=candidate(root,{'public/fail.txt':'simulate startup failure'}),id=stageCandidate(root,root,folder);markPreview(root,id);
 await assert.rejects(supervisor.switchTo(id),/退出|超时/);assert.equal(runtimeState(root).phase,'running');assert.match(runtimeState(root).message,/已回到原版本/);assert.equal(await(await fetch(`http://127.0.0.1:${port}/app.js`)).text(),'original');
 const other=candidate(root,{'server.mjs':fixtureServer+'\n// backend changed'}),bad=stageCandidate(root,root,other.folder);markPreview(root,bad);const pid=supervisor.child.pid;await assert.rejects(supervisor.switchTo(bad),/后端/);assert.equal(supervisor.child.pid,pid);
});
