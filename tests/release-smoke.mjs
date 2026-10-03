// Explicit integration check: requires Docker and Edge. Never reads real planner data or model credentials.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import net from 'node:net';
import {chromium} from '@playwright/test';
import {snapshot,verifyRelease,writeJSON,stageCandidate,startPreview,stopPreview,runtimeState} from '../development/releases.mjs';
import {prepare,digest,writeSource} from '../development/workspace.mjs';
import {VersionSupervisor} from '../development/supervisor.mjs';

const sourceRoot=path.resolve(import.meta.dirname,'..'),realAI=process.argv.includes('--real-ai');
const existing=realAI?JSON.parse(fs.readFileSync(path.join(sourceRoot,'test-output/real-release-latest.json'),'utf8')):null;
const fixture=existing?.fixture||path.join(sourceRoot,'test-output','release-smoke-'+Date.now());fs.mkdirSync(fixture,{recursive:true});
const root=existing?.root||verifyRelease(fixture,snapshot(fixture,sourceRoot)).source;
if(!path.resolve(root).startsWith(path.join(sourceRoot,'test-output')+path.sep))throw Error('验收只能运行独立测试副本');
const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
const supervisor=new VersionSupervisor(root,{env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,PORT:String(port),PUBLIC_ORIGIN:`http://127.0.0.1:${port}`,HOST:'127.0.0.1',DATA_DIR:path.join(fixture,'data'),ADMIN_USER:'student',ADMIN_PASSWORD:'Smoke-password-123',SHIXU_DEVELOPMENT:'local'},healthTimeout:20000});
let releaseId,browser;
try{
 await supervisor.start();
 const job=crypto.randomUUID(),folder=existing?.jobFolder||path.join(root,'.shixu-development',job);
 if(!realAI){const work=prepare(root,folder);
 const app=fs.readFileSync(path.join(work.candidate,'public/index.html'),'utf8');assert.ok(app.includes('作业与项目'));writeSource(work,'public/index.html',app.replaceAll('作业与项目','作业与项目 · 候选验证'));
 // Synthetic reviewed fixture: tests the publishing mechanism, not an AI review claim.
 writeJSON(path.join(folder,'result.json'),{id:job,phase:'ready',request:'发布机制测试夹具',review:{approved:true,summary:'synthetic fixture'}});writeJSON(path.join(folder,'verified.json'),{baseline:work.baseline,verified:JSON.stringify(digest(work.candidate))});
 }
 releaseId=stageCandidate(root,root,folder);writeJSON(path.join(folder,'result.json'),{...JSON.parse(fs.readFileSync(path.join(folder,'result.json'),'utf8')),releaseId});const preview=await startPreview(root,releaseId);
 browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext(),page=await context.newPage();
 await page.goto(preview.url);await page.getByRole('textbox',{name:'用户名',exact:true}).fill('preview');await page.getByRole('textbox',{name:'密码',exact:true}).fill(preview.password);await page.getByRole('button',{name:/进入我的空间/}).click();await page.locator('#nav').waitFor();assert.ok(await page.getByText('试运行空间 · 使用独立测试数据 · 不会同步到你的正式空间').isVisible());if(!realAI)assert.ok(await page.locator('#nav').innerText().then(t=>t.includes('候选验证')));
 const checkFilter=async()=>{const data=await page.evaluate(()=>fetch('/api/state').then(r=>r.json()));data.tasks=[['done','homework'],['todo','homework'],['submitted','homework'],['done','project']].map(([status,kind],i)=>({id:'task-'+i,title:'筛选验证-'+i,status,kind,minutes:30,priority:'normal'}));assert.equal(await page.evaluate(data=>fetch('/api/state',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}).then(r=>r.status),data),200);await page.goto(new URL('/#tasks',page.url()).href);await page.reload();await page.locator('[data-filter="awaiting-submission"]').click();assert.equal(await page.locator('.task-list .task-item').count(),1);assert.ok(await page.getByRole('button',{name:'筛选验证-0',exact:true}).isVisible());await page.screenshot({path:path.join(sourceRoot,'test-output/real-release-filter.png'),fullPage:true});};
 const previewState=await page.evaluate(()=>fetch('/api/state').then(r=>r.json()));assert.equal(previewState.tasks.length,0);previewState.ideas.push({id:crypto.randomUUID(),text:'仅试运行空间',createdAt:new Date().toISOString()});assert.equal(await page.evaluate(data=>fetch('/api/state',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}).then(r=>r.status),previewState),200);
 if(realAI)await checkFilter();
 const origin=`http://127.0.0.1:${port}`;await context.request.post(origin+'/api/login',{data:{username:'student',password:'Smoke-password-123'}});let state=await(await context.request.get(origin+'/api/state')).json();assert.equal(state.ideas.length,0);
 const waitVersion=async id=>{for(let i=0;i<150;i++){if(runtimeState(root).phase==='running'&&runtimeState(root).current===id)return;await new Promise(r=>setTimeout(r,200));}throw Error('版本切换未完成');};
 const jobID=JSON.parse(fs.readFileSync(path.join(folder,'result.json'),'utf8')).id,activateURL=origin+'/api/development/jobs/'+jobID+'/activate',headers={'X-Shixu-Development':'1'};
 assert.equal((await context.request.post(activateURL,{headers,data:{confirm:false}})).status(),409);assert.equal((await context.request.post(activateURL,{headers,data:{confirm:true}})).status(),202);await waitVersion(releaseId);
 await page.goto(origin);await page.locator('#nav').waitFor();if(realAI)await checkFilter();else assert.ok((await page.locator('#nav').innerText()).includes('候选验证'));
 state=await(await context.request.get(origin+'/api/state')).json();state.ideas.push({id:crypto.randomUUID(),text:'切换后新增，恢复应保留',createdAt:new Date().toISOString()});assert.equal((await context.request.put(origin+'/api/state',{data:state})).status(),200);
 const previous=runtimeState(root).previous;assert.equal((await context.request.post(origin+'/api/development/runtime/restore',{headers,data:{confirm:true}})).status(),202);await waitVersion(previous);await page.reload();await page.locator('#nav').waitFor();if(realAI)assert.equal(await page.locator('[data-filter="awaiting-submission"]').count(),0);else assert.ok(!(await page.locator('#nav').innerText()).includes('候选验证'));assert.equal((await(await context.request.get(origin+'/api/state')).json()).ideas.length,1);
 console.log(`PASS: ${realAI?'real AI feature':'synthetic fixture'}, real Docker preview, independent cookies/data, real server activation, rollback and latest data preservation.`);
}finally{await browser?.close();if(releaseId)await stopPreview(root,releaseId);await supervisor.stop();}
