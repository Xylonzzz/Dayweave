import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {configureEnvironment,setupState} from '../development/setup.mjs';

function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'shixu-setup-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const states=[];return {root,states,save:s=>states.push(structuredClone(s))};}
test('ready environment reuses components and verifies without installing or calling a model',async t=>{
 const f=fixture(t);let verified=0;
 await configureEnvironment(f,{check:async()=>({available:true}),harnessStatus:()=>({available:true}),step:async()=>assert.fail('must reuse installed components'),verify:async()=>verified++});
 assert.equal(verified,1);assert.equal(f.states.at(-1).phase,'ready');
});
test('pending reboot stops installation and resume rechecks installed components',async t=>{
 const f=fixture(t);let reboot=true,steps=[];
 const deps={check:async()=>reboot?{available:false,code:'restart-pending'}:{available:true},harnessStatus:()=>({available:true}),step:async a=>steps.push(a),verify:async()=>{}};
 await configureEnvironment(f,deps);assert.equal(f.states.at(-1).phase,'restart');assert.deepEqual(steps,[]);
 reboot=false;await configureEnvironment(f,deps);assert.equal(f.states.at(-1).phase,'ready');assert.deepEqual(steps,[]);
});
test('fresh environment sequences installation and cannot pass a failed verification',async t=>{
 const f=fixture(t);let docker=false,harness=false;const steps=[];
 await configureEnvironment(f,{check:async()=>({available:docker,code:docker?'ready':'not-installed'}),harnessStatus:()=>({available:harness}),step:async a=>{steps.push(a);if(a==='startDocker')docker=true;if(a==='harness')harness=true;},verify:async()=>{throw Error('fixture container failure');}});
 assert.deepEqual(steps,['wsl','docker','startDocker','harness']);assert.equal(f.states.at(-1).phase,'failed');assert.match(f.states.at(-1).message,/fixture container failure/);
});
test('broken custom Harness path is not overwritten',async t=>{
 const f=fixture(t);await configureEnvironment({...f,harnessRoot:path.join(f.root,'custom')},{check:async()=>({available:true}),harnessStatus:()=>({available:false}),step:async()=>assert.fail('must not overwrite')});
 assert.equal(f.states.at(-1).phase,'failed');assert.match(f.states.at(-1).message,/HARNESS_ROOT/);
});
test('dead persisted setup is reported interrupted while live setup stays running',t=>{
 const f=fixture(t),home=path.join(f.root,'.shixu-tools');fs.mkdirSync(home);
 fs.writeFileSync(path.join(home,'setup.json'),JSON.stringify({phase:'running',pid:null}));assert.equal(setupState(f.root).phase,'interrupted');
 fs.writeFileSync(path.join(home,'setup.json'),JSON.stringify({phase:'running',pid:process.pid}));assert.equal(setupState(f.root).phase,'running');
});
