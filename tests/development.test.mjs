import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {prepare,safePath,writeSource,digest,integrate,rollback} from '../development/workspace.mjs';
import {customize} from '../development/customize.mjs';

function fixture(t){const folder=fs.mkdtempSync(path.join(os.tmpdir(),'shixu-dev-test-'));t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));const root=path.join(folder,'source');fs.mkdirSync(root);fs.writeFileSync(path.join(root,'server.mjs'),'export const value=1;');fs.mkdirSync(path.join(root,'data'));fs.writeFileSync(path.join(root,'data','secret.key'),'private');fs.writeFileSync(path.join(root,'.env'),'private');fs.writeFileSync(path.join(root,'credentials.json'),'private');return {folder,root};}

test('development copy excludes credentials and confines tool writes',t=>{
 const {folder,root}=fixture(t),work=prepare(root,path.join(folder,'job'));
 assert.deepEqual(Object.keys(work.baseline),['server.mjs']);
 for(const name of ['../data/secret.key','data/secret.json','C:/secret.json','public/../x.js','public/a\nb.js','.env'])assert.throws(()=>safePath(work.candidate,name));
 assert.throws(()=>writeSource(work,'package.json','{}'));
 assert.throws(()=>writeSource(work,'development/cli.mjs','bad'));
 writeSource(work,'public/new.js','export const ok=true;');assert.ok(fs.existsSync(path.join(work.candidate,'public/new.js')));
});
test('automatic integration and rollback preserve unrelated data',t=>{
 const {folder,root}=fixture(t),home=path.join(folder,'job'),work=prepare(root,home);
 writeSource(work,'server.mjs','export const value=2;');writeSource(work,'public/new.js','export const ok=true;');
 integrate(root,home,work,JSON.stringify(digest(work.candidate)));
 assert.match(fs.readFileSync(path.join(root,'server.mjs'),'utf8'),/value=2/);
 rollback(root,home);assert.match(fs.readFileSync(path.join(root,'server.mjs'),'utf8'),/value=1/);assert.ok(!fs.existsSync(path.join(root,'public/new.js')));assert.equal(fs.readFileSync(path.join(root,'data/secret.key'),'utf8'),'private');
});
test('concurrent source edits block integration and later edits block rollback',t=>{
 const {folder,root}=fixture(t),home=path.join(folder,'job'),work=prepare(root,home);writeSource(work,'server.mjs','export const value=2;');
 fs.writeFileSync(path.join(root,'server.mjs'),'export const value=3;');assert.throws(()=>integrate(root,home,work,JSON.stringify(digest(work.candidate))),/其他修改/);
 fs.writeFileSync(path.join(root,'server.mjs'),'export const value=1;');integrate(root,home,work,JSON.stringify(digest(work.candidate)));
 fs.writeFileSync(path.join(root,'server.mjs'),'export const value=4;');assert.throws(()=>rollback(root,home),/后续修改/);assert.match(fs.readFileSync(path.join(root,'server.mjs'),'utf8'),/value=4/);
});
const deps=(approved=true,testOK=true)=>({doctor:async()=>({available:true}),build:async()=> 'fixture-image',verify:async()=>({ok:testOK,output:testOK?'actual test pass':'actual test fail'}),engine:async options=>{const h=options.development.handle;if(options.threadId.endsWith('-develop'))await h({action:'dev_write',path:'server.mjs',content:'export const value=2;'});else{await assert.rejects(h({action:'dev_write',path:'server.mjs',content:'bad'}),/只读/);await h({action:'dev_verdict',approved,summary:'fixture review'});}return {reply:'fixture'};}});
test('developer and separate reviewer can automatically integrate without human merge',async t=>{
 const {folder,root}=fixture(t);const result=await customize({root,home:path.join(folder,'jobs'),provider:{},request:'change value'},deps());assert.equal(result.phase,'integrated');assert.equal(result.review.approved,true);assert.match(fs.readFileSync(path.join(root,'server.mjs'),'utf8'),/value=2/);
});
test('failed tests or review never integrate',async t=>{
 for(const [approve,pass] of [[false,true],[true,false]]){const {folder,root}=fixture(t);await assert.rejects(customize({root,home:path.join(folder,'jobs'),provider:{},request:'change value'},deps(approve,pass)),/未通过/);assert.match(fs.readFileSync(path.join(root,'server.mjs'),'utf8'),/value=1/);}
});
test('missing Docker fails before sending source or creating jobs',async t=>{
 const {folder,root}=fixture(t),home=path.join(folder,'jobs');await assert.rejects(customize({root,home,request:'change'}, {...deps(),doctor:async()=>({available:false,message:'missing'})}),/Docker/);assert.ok(!fs.existsSync(home));
});
