import test from 'node:test';
import assert from 'node:assert/strict';
import {applyAssistantOperations} from '../assistant.mjs';
import {monthDates,shiftDate} from '../public/calendar.mjs';
const state={revision:1,settings:{name:'同学',semesterStart:'2026-08-31',dayStart:'07:00',dayEnd:'22:00',quietStart:'22:00',quietEnd:'07:00',reminderMinutes:[30],courseReminder:10},courses:[],tasks:[],blocks:[],ideas:[],reviews:[]};
test('calendar handles leap month, year boundary and Monday grid',()=>{
 assert.equal(shiftDate('2026-12-31','month',1),'2027-01-01');
 assert.equal(shiftDate('2024-02-29','day',1),'2024-03-01');
 assert.equal(shiftDate('2026-01-01','week',-1),'2025-12-25');
 const days=monthDates('2024-02-15');assert.equal(days.length,42);assert.ok(days.includes('2024-02-29'));assert.equal(new Date(days[0]).getUTCDay(),1);
});
test('assistant atomically creates linked task, updates, deletes and preserves source',()=>{
 const inferred=applyAssistantOperations(state,[{collection:'tasks',action:'create',values:{title:'数电作业',due:'2026-09-15T23:59:00+08:00',assumptions:['耗时暂估 60 分钟'],evidence:'用户明确截止时间'}}]);
 assert.match(inferred.state.tasks[0].notes,/耗时暂估/);assert.ok(inferred.changes.some(x=>x.includes('推断')));assert.equal(inferred.state.tasks[0].due,'2026-09-15T23:59:00+08:00');
 const r=applyAssistantOperations(state,[{collection:'tasks',action:'create',ref:'new',values:{title:'报告'}},{collection:'blocks',action:'create',values:{title:'写报告',taskId:'new',start:'2026-09-15T14:00:00+08:00',end:'2026-09-15T15:00:00+08:00'}}]);
 assert.equal(state.tasks.length,0);assert.equal(r.state.blocks[0].taskId,r.state.tasks[0].id);
 const id=r.state.tasks[0].id;
 const edited=applyAssistantOperations(r.state,[{collection:'tasks',action:'update',id,values:{title:'新报告',status:'done'}}]);assert.ok(edited.state.tasks[0].completedAt);
 const removed=applyAssistantOperations(edited.state,[{collection:'tasks',action:'delete',id}]);assert.equal(removed.state.tasks.length,0);assert.equal(removed.state.blocks[0].taskId,'');
});
test('assistant rejects invalid mutations and conflicts without partially saving',()=>{
 const legacy={...state};delete legacy.reviews;
 assert.equal(applyAssistantOperations(legacy,[{collection:'reviews',action:'create',values:{actual:'整理笔记'}}]).state.reviews.length,1);
 assert.throws(()=>applyAssistantOperations(state,[{collection:'account',action:'update',values:{}}]),/不支持/);
 assert.throws(()=>applyAssistantOperations(state,[{collection:'tasks',action:'update',id:'missing',values:{title:'x'}}]),/不存在/);
 assert.throws(()=>applyAssistantOperations(state,[{collection:'settings',action:'update',values:JSON.parse('{"__proto__":{}}')}]),/字段/);
 assert.throws(()=>applyAssistantOperations(state,[{collection:'tasks',action:'create',values:{title:'报告',status:'submitted'}}]),/提交时间/);
 assert.throws(()=>applyAssistantOperations(state,[{collection:'settings',action:'update',values:{navOrder:['today','today']}}]),/导航/);
 const withClass={...state,courses:[{id:'c',name:'数学',day:2,start:'14:00',end:'16:00',fromWeek:1,toWeek:16,parity:'all'}]};
 assert.throws(()=>applyAssistantOperations(withClass,[{collection:'blocks',action:'create',values:{title:'冲突',start:'2026-09-15T14:00:00+08:00',end:'2026-09-15T15:00:00+08:00'}}]),/课程冲突/);
 assert.equal(state.blocks.length,0);
});
