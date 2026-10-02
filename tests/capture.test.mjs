import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeCapture,captureIssues,appendCapture,capturePrompt} from '../capture.mjs';
const now=new Date('2026-09-08T10:00:00+08:00');
const state={revision:3,courses:[],tasks:[],ideas:[],blocks:[],settings:{semesterStart:'2026-08-31'}};
const items=[{type:'event',title:'通达加工',date:'2026-09-10',startTime:'14:00',endTime:'17:00',location:'通达',notes:''},{type:'task',title:'课本第一章作业',kind:'homework',group:'自控',dueDate:'2026-09-11',dueTime:'18:00',minutes:60,notes:'课本第一章作业'}];
test('natural-language capture separates fixed activity and homework',()=>{
  const normalized=normalizeCapture({items});assert.deepEqual(captureIssues(normalized.items,state,now),[]);
  const added=appendCapture(normalized.items,state);assert.equal(added.state.blocks.length,1);assert.equal(added.state.tasks.length,1);assert.equal(added.state.blocks[0].locked,true);assert.equal(added.state.tasks[0].status,'todo');assert.equal(state.tasks.length,0);
});
test('afternoon and weekday-only deadlines remain questions, not invented times',()=>{
  const draft=normalizeCapture({items:[{...items[0],startTime:'',endTime:''},{...items[1],dueTime:'',minutes:null}]});
  const errors=captureIssues(draft.items,state,now);assert.equal(errors.length,3);assert.match(errors.join(),/截止/);assert.match(errors.join(),/开始和结束/);
});
test('capture blocks conflicting activities and invalid dates',()=>{
  assert.match(captureIssues(items,{...state,blocks:[{start:'2026-09-10T15:00:00+08:00',end:'2026-09-10T16:00:00+08:00'}]},now).join(),/冲突/);
  assert.match(captureIssues([{...items[0],date:'2026-02-30'}],state,now).join(),/日期/);
});
test('reference calendar uses Shanghai dates across UTC boundary',()=>{
  const prompt=capturePrompt('周四下午',state,new Date('2026-09-07T23:00:00Z'));assert.match(prompt,/2026-09-08=周二/);assert.match(prompt,/2026-09-10=周四/);
});

test('smart capture preserves editable options and assumption provenance',()=>{
 const normalized=normalizeCapture({items:[{...items[1],important:true,urgency:'urgent',link:'https://school.example/submit',assumptions:['耗时暂估90分钟'],evidence:['课程匹配']}]}).items;
 const added=appendCapture(normalized,state).state.tasks[0];assert.equal(added.important,true);assert.equal(added.urgency,'urgent');assert.match(added.notes,/暂估/);assert.equal(added.link,'https://school.example/submit');
 assert.match(captureIssues([{...normalized[0],link:'javascript:alert(1)'}],state,now).join(),/提交入口/);
});
