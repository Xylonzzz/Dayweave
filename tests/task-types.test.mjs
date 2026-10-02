import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateTaskTypes,taskTypes} from '../public/task-types.mjs';
import {normalizeCapture,capturePrompt} from '../capture.mjs';
test('custom types validate and survive AI normalization',()=>{
  const settings={taskTypes:[{id:'custom-club',name:'社团事务'}]};
  assert.equal(validateTaskTypes(settings).has('custom-club'),true);
  assert.equal(taskTypes({}).length,2);
  assert.throws(()=>validateTaskTypes({taskTypes:[{id:'custom-club',name:'课程作业'}]}));
  const item=normalizeCapture({items:[{type:'task',kind:'custom-club',title:'活动'}]},settings).items[0];
  assert.equal(item.kind,'custom-club');
  assert.match(capturePrompt('活动',{settings,courses:[]}),/custom-club/);
});
