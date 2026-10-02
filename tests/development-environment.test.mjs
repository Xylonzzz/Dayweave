import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {dockerExecutable,dockerEnvironment,inspectEnvironment,runProgram} from '../development/environment.mjs';

test('installed Docker can be found before the server PATH has refreshed',()=>{
 const expected=path.join('C:/Programs','Docker','Docker','resources','bin','docker.exe');
 assert.equal(dockerExecutable({platform:'win32',env:{ProgramFiles:'C:/Programs'},exists:file=>file===expected}),expected);
 assert.equal(dockerExecutable({platform:'linux',env:{},exists:()=>false}),'docker');
 assert.equal(dockerExecutable({env:{SHIXU_DOCKER_PATH:'custom-docker'}}),'custom-docker');
});
test('a ready Linux daemon does not require local WSL diagnostics',async()=>{
 let calls=0;const result=await inspectEnvironment({platform:'win32',run:async()=>{calls++;return {ok:true,output:'linux\n'};}});
 assert.equal(result.available,true);assert.equal(result.code,'ready');assert.equal(calls,1);
});
test('missing Docker plus pending restart gives actionable steps without claiming BIOS failure',async()=>{
 const result=await inspectEnvironment({platform:'win32',run:async(program)=>{
  if(program==='wsl.exe')return {ok:true,output:'WSL2 无法启动，虚拟化未就绪'};
  if(program==='reg.exe')return {ok:true,output:'pending'};
  throw Object.assign(Error('missing'),{code:'ENOENT'});
 }});
 assert.equal(result.code,'restart-pending');assert.equal(result.available,false);assert.match(result.steps[0],/重启/);assert.match(result.windows.wslStatus,/WSL2/);assert.ok(result.steps.some(x=>x.includes('安装 Docker')));
});
test('stopped Docker and wrong container engine are distinct states',async()=>{
 const stopped=await inspectEnvironment({platform:'linux',run:async()=>({ok:false,output:'daemon not running',code:1})});assert.equal(stopped.code,'engine-unavailable');
 const wrong=await inspectEnvironment({platform:'win32',run:async()=>({ok:true,output:'windows'})});assert.equal(wrong.code,'wrong-engine');assert.equal(wrong.available,false);
});
test('pre-cancelled execution does not start even an invalid executable',async()=>{
 const controller=new AbortController();controller.abort();await assert.rejects(runProgram('not-a-real-program',[],{signal:controller.signal}),/已取消/);
});

test('Docker subprocess PATH includes credential helpers without changing host environment',()=>{
 const executable=path.resolve('docker-bin','docker');const source={Path:'existing-bin',KEEP:'value'};
 const env=dockerEnvironment(executable,source);
 assert.equal(env.PATH,path.dirname(executable)+path.delimiter+'existing-bin');assert.equal(env.KEEP,'value');assert.equal(env.Path,undefined);assert.equal(source.Path,'existing-bin');
});
