export function reviewPeriod(kind,date){
 const d=new Date(date+'T00:00:00+08:00');if(!['day','week','month'].includes(kind)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(+d))throw Error('复盘周期无效');
 const day=new Date(date+'T12:00:00Z');if(day.toISOString().slice(0,10)!==date)throw Error('复盘日期无效');if(kind==='week')day.setUTCDate(day.getUTCDate()-((day.getUTCDay()||7)-1));if(kind==='month')day.setUTCDate(1);
 const start=day.toISOString().slice(0,10);if(kind==='day')day.setUTCDate(day.getUTCDate()+1);if(kind==='week')day.setUTCDate(day.getUTCDate()+7);if(kind==='month')day.setUTCMonth(day.getUTCMonth()+1);
 return {start,end:day.toISOString().slice(0,10)};
}
export function reviewSummary(state,kind,date){
 const {start,end}=reviewPeriod(kind,date);const inside=v=>v&&+new Date(v)>=+new Date(start+'T00:00:00+08:00')&&+new Date(v)<+new Date(end+'T00:00:00+08:00');
 const completed=state.tasks.filter(t=>inside(t.completedAt)),submitted=state.tasks.filter(t=>inside(t.submittedAt));
 const pending=state.tasks.filter(t=>t.status!=='submitted'&&!(t.kind!=='homework'&&t.status==='done'));
 const due=pending.filter(t=>inside(t.due));const planned=state.blocks.filter(b=>inside(b.start));
 const list=xs=>xs.length?xs.map(t=>'• '+t.title).join('\n'):'暂无记录';
 return `统计周期：${start} 至 ${new Date(+new Date(end+'T12:00:00Z')-86400000).toISOString().slice(0,10)}\n\n有完成时间记录：\n${list(completed)}\n\n已提交作业：\n${list(submitted)}\n\n本期截止、当前未完成或未提交：\n${list(due)}\n\n当前其他待推进事项：\n${list(pending.filter(t=>!due.includes(t)))}\n\n本期计划安排（不代表实际完成）：\n${list(planned)}\n\n说明：按生成时的任务状态汇总；没有完成时间的历史任务不归入本期成果。预计耗时、日历时段均不算实际投入。`;
}
export function validateReviews(reviews){
 if(!Array.isArray(reviews)||reviews.length>3000)throw Error('复盘数据无效或过多');const ids=new Set();
 for(const r of reviews){if(!r||typeof r.id!=='string'||ids.has(r.id))throw Error('复盘编号无效');ids.add(r.id);reviewPeriod(r.kind,r.date);for(const key of ['summary','actual','learning','blockers','next','analysis'])if(typeof r[key]!=='string'||r[key].length>30000)throw Error('复盘内容格式无效或过长');if(!Number.isFinite(+new Date(r.createdAt))||!Number.isFinite(+new Date(r.updatedAt)))throw Error('复盘时间无效');}
}
