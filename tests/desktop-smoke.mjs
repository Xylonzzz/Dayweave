// Runs the built application using only its bundled runtime, with an isolated desktop profile.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {chromium} from '@playwright/test';
const root=path.resolve(import.meta.dirname,'..'),bundle=JSON.parse(fs.readFileSync(path.join(root,'dist/latest.json'))).output;
const profile=path.join(root,'test-output','desktop-smoke-'+Date.now()),env={...process.env,SHIXU_DESKTOP_HOME:profile,SHIXU_DESKTOP_PORT:'3194',PATH:process.env.WINDIR+'\\System32;'+process.env.WINDIR+';'+process.env.WINDIR+'\\System32\\WindowsPowerShell\\v1.0'};
const run=action=>new Promise((resolve,reject)=>{const child=spawn(path.join(bundle,'runtime/node.exe'),[path.join(bundle,'desktop/bootstrap.mjs'),action],{env,cwd:bundle,windowsHide:true,stdio:['ignore','pipe','pipe']});let output='',error='';child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>error+=x);child.once('error',reject);child.once('close',code=>{try{const data=JSON.parse(output);if(code||data.error)throw Error(data.error||error);resolve(data);}catch(e){reject(e);}});});
let browser;
try{
 const state=await run('start');assert.equal(state.running,true);
 assert.ok(fs.existsSync(path.join(bundle,'runtime/node_modules/npm/bin/npm-cli.js')));assert.ok(fs.existsSync(path.join(profile,'workspace/development/setup-windows.ps1')));
 const credentials=fs.readFileSync(path.join(profile,'data/bootstrap.txt'),'utf8'),password=/初始密码：([^\r\n]+)/.exec(credentials)[1];
 browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext(),page=await context.newPage();
 await page.goto(state.url);await page.getByRole('textbox',{name:'密码',exact:true}).fill(password);await page.getByRole('button',{name:/进入我的空间/}).click();await page.locator('#nav').waitFor();
 const runtime=await(await context.request.get(state.url+'/api/development/runtime')).json();assert.equal(runtime.managed,true);
 const data=await(await context.request.get(state.url+'/api/state')).json();data.ideas.push({id:crypto.randomUUID(),text:'桌面重启保留验证',createdAt:new Date().toISOString()});assert.equal((await context.request.put(state.url+'/api/state',{data})).status(),200);
 await run('stop');await run('start');await page.reload();await page.locator('#nav').waitFor();assert.equal((await(await context.request.get(state.url+'/api/state')).json()).ideas[0].text,'桌面重启保留验证');
 await page.screenshot({path:path.join(root,'test-output/desktop-packaged-browser.png'),fullPage:true});
 console.log('PASS: bundled runtime without system Node on PATH, browser login, managed customization route, persistence across stop/start, npm and setup scripts present.');
}finally{await browser?.close();await run('stop');}
