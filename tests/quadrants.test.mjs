import {test} from 'node:test';import assert from 'node:assert/strict';import {quadrantOf} from '../public/quadrants.mjs';
test('quadrants use deadlines, legacy importance, manual overrides and threshold',()=>{
 const now=Date.parse('2026-09-10T00:00:00Z');
 assert.equal(quadrantOf({priority:'high',due:'2026-09-12T00:00:00Z'},48,now),'q1');
 assert.equal(quadrantOf({important:true,due:'2026-09-12T00:00:00Z'},24,now),'q2');
 assert.equal(quadrantOf({due:'2026-09-09T00:00:00Z'},48,now),'q3');
 assert.equal(quadrantOf({},48,now),'q4');
 assert.equal(quadrantOf({important:true,urgency:'urgent'},48,now),'q1');
 assert.equal(quadrantOf({important:false,priority:'high',urgency:'not-urgent',due:'2026-09-09T00:00:00Z'},48,now),'q4');
});

test('AI suggestions reject unknown tasks and duplicate IDs',async()=>{
 const {validateSuggestions}=await import('../public/quadrants.mjs');const good={taskId:'a',quadrant:'q2',reason:'长期目标'};
 assert.deepEqual(validateSuggestions({suggestions:[good]},[{id:'a'}]),[good]);
 assert.throws(()=>validateSuggestions({suggestions:[good]},[]));
 assert.throws(()=>validateSuggestions({suggestions:[good,good]},[{id:'a'}]));
});
