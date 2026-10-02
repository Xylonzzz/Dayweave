export const quadrants=[{id:'q1',name:'重要且紧急',hint:'优先完成',important:true,urgent:true},{id:'q2',name:'重要不紧急',hint:'主动安排时间',important:true,urgent:false},{id:'q3',name:'紧急不重要',hint:'集中处理 / 协作',important:false,urgent:true},{id:'q4',name:'不重要不紧急',hint:'延后 / 重新评估',important:false,urgent:false}];
export const isImportant=t=>typeof t.important==='boolean'?t.important:t.priority==='high';
export function isUrgent(t,hours=48,now=Date.now()){return t.urgency==='urgent'?true:t.urgency==='not-urgent'?false:!!t.due&&Number.isFinite(+new Date(t.due))&&+new Date(t.due)<=now+hours*3600000;}
export const quadrantOf=(t,hours=48,now=Date.now())=>quadrants.find(q=>q.important===isImportant(t)&&q.urgent===isUrgent(t,hours,now)).id;
export function validateSuggestions(raw,tasks){
 if(!raw||!Array.isArray(raw.suggestions)||raw.suggestions.length>50)throw Error('AI 分类结果无效');
 const allowed=new Set(tasks.map(t=>t.id)),seen=new Set();
 return raw.suggestions.map(s=>{if(!s||!allowed.has(s.taskId)||seen.has(s.taskId)||!quadrants.some(q=>q.id===s.quadrant)||typeof s.reason!=='string'||!s.reason.trim()||s.reason.length>1000)throw Error('AI 返回了无效、重复的任务或分类');seen.add(s.taskId);return {taskId:s.taskId,quadrant:s.quadrant,reason:s.reason};});
}
