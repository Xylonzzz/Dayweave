import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { checkPlan, courseOn, extractJSON, seal, unseal } from '../lib.mjs';
const now = new Date('2026-09-06T00:00:00+08:00');
const task = {id:'t',title:'报告',status:'todo',minutes:120,due:'2026-09-08T20:00:00+08:00'};
const state = { settings:{semesterStart:'2026-08-31',dayStart:'08:00',dayEnd:'22:00'},tasks:[task],courses:[{name:'数学',day:1,start:'09:00',end:'10:40',fromWeek:1,toWeek:16,parity:'all'}],blocks:[] };
const block = {taskId:'t',title:'写报告',start:'2026-09-07T14:00:00+08:00',end:'2026-09-07T15:00:00+08:00'};
test('valid plan is accepted',()=>assert.deepEqual(checkPlan([block],state,now),[]));
test('teaching weeks and odd/even weeks work across semester boundary',()=>{
  const c={...state.courses[0],parity:'odd'};
  assert.equal(courseOn(c,'2026-08-31','2026-08-31'),true);
  assert.equal(courseOn(c,'2026-09-07','2026-08-31'),false);
  assert.equal(courseOn(c,'2026-08-24','2026-08-31'),false);
});
test('AI cannot overlap a class',()=>assert.match(checkPlan([{...block,start:'2026-09-07T10:00:00+08:00',end:'2026-09-07T11:00:00+08:00'}],state,now).join(),/课程/));
test('AI cannot overlap an existing or draft block',()=>{
  assert.match(checkPlan([block],{...state,blocks:[block]},now).join(),/已有日程/);
  assert.match(checkPlan([block,block],state,now).join(),/草稿/);
});
test('deadline, bedtime and invalid durations are rejected',()=>{
  assert.match(checkPlan([{...block,start:'2026-09-09T20:00:00+08:00',end:'2026-09-09T21:00:00+08:00'}],state,now).join(),/截止/);
  assert.match(checkPlan([{...block,start:'2026-09-07T22:00:00+08:00',end:'2026-09-07T23:00:00+08:00'}],state,now).join(),/时段/);
  assert.match(checkPlan([{...block,end:block.start}],state,now).join(),/无效/);
});
test('completed tasks, unknown tasks and malformed output cannot be scheduled',()=>{
  assert.match(checkPlan([block],{...state,tasks:[{...task,status:'submitted'}]},now).join(),/待处理/);
  assert.ok(checkPlan([null],state,now).length);
  assert.ok(checkPlan({},state,now).length);
});
test('replanning cannot overbook task estimate',()=>assert.match(checkPlan([block],{...state,tasks:[{...task,minutes:30}]},now).join(),/耗时/));
test('encrypted API keys authenticate and reject modification',()=>{
  const key=crypto.randomBytes(32), value=seal('private-test-secret',key);
  assert.equal(unseal(value,key),'private-test-secret');
  const damaged=Buffer.from(value,'base64');damaged[damaged.length-1]^=1;
  assert.throws(()=>unseal(damaged.toString('base64'),key));
});
test('model JSON supports fenced responses, never executable code',()=>{
  assert.deepEqual(extractJSON('```json\n{"blocks":[]}\n```'),{blocks:[]});
  assert.throws(()=>extractJSON('process.exit()'));
});
