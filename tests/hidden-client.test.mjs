import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import childProcess from 'node:child_process';
import {HiddenHarness} from '../harness/hidden-client.mjs';

test('failed worker import closes without hanging or patching server spawn',{timeout:5000},async()=>{
 const client=new HiddenHarness(new URL('./missing-sdk-fixture.mjs',import.meta.url).href,{});
 await assert.rejects(client.start());
 await client.close().catch(()=>{});
 await client.close().catch(()=>{});
 assert.equal(childProcess.spawn,spawn);
});
