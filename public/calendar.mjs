export const dateKey=d=>d.toISOString().slice(0,10);
export function shiftDate(date,mode,step){
 const d=new Date(date+'T12:00:00Z');
 if(mode==='year'){const month=d.getUTCMonth();d.setUTCDate(1);d.setUTCFullYear(d.getUTCFullYear()+step);d.setUTCMonth(month);}
 else if(mode==='month'){d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+step);}
 else d.setUTCDate(d.getUTCDate()+step*(mode==='week'?7:1));
 return dateKey(d);
}
export function monthDates(date){const d=new Date(date.slice(0,7)+'-01T12:00:00Z');d.setUTCDate(1-((d.getUTCDay()+6)%7));return Array.from({length:42},(_,i)=>dateKey(new Date(+d+i*86400000)));}
export function calendarMarkup({date,mode,today,events,esc,timeline}){
 const names={day:'日',week:'周',month:'月',year:'年'};
 const month=(value,mini=false)=>`<section class="month-panel">${mini?`<button class="month-title" data-cal-date="${value}" data-cal-mode="month">${Number(value.slice(5,7))} 月</button>`:''}<div class="month-grid ${mini?'mini':''}">${['一','二','三','四','五','六','日'].map(x=>`<span class="weekday">${x}</span>`).join('')}${monthDates(value).map(d=>{const list=events(d);return `<button class="month-day ${d.slice(0,7)!==value.slice(0,7)?'outside':''} ${d===today?'current':''}" data-cal-date="${d}" data-cal-mode="day" aria-label="${d}，${list.length} 项安排"><b>${Number(d.slice(-2))}</b>${mini?(list.length?'<i class="event-dot"></i>':''):list.slice(0,3).map(e=>`<span class="month-event ${e.deadline?'due':''}">${esc(e.title)}</span>`).join('')+(list.length>3?`<small>还有 ${list.length-3} 项</small>`:'')}</button>`;}).join('')}</div></section>`;
 let content;
 if(mode==='year')content=`<div class="year-grid">${Array.from({length:12},(_,i)=>month(`${date.slice(0,4)}-${String(i+1).padStart(2,'0')}-01`,true)).join('')}</div>`;
 else if(mode==='month')content=month(date);
 else {const d=new Date(date+'T12:00:00Z');if(mode==='week')d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));content=timeline(Array.from({length:mode==='day'?1:7},(_,i)=>dateKey(new Date(+d+i*86400000))));}
 return `<div class="toolbar calendar-toolbar"><div class="tabs" role="group" aria-label="日历视图">${Object.entries(names).map(([k,v])=>`<button data-cal-mode="${k}" aria-pressed="${mode===k}" class="${mode===k?'selected':''}">${v}历</button>`).join('')}</div><button class="quiet" data-cal-step="-1" aria-label="上一个${names[mode]}">←</button><strong>${mode==='year'?date.slice(0,4)+' 年':mode==='month'?date.slice(0,7):date}</strong><button class="quiet" data-cal-step="1" aria-label="下一个${names[mode]}">→</button><button class="text-btn" data-cal-today>今天</button><label>跳转日期<input type="date" data-cal-picker value="${date}"></label></div><div class="calendar-viewport"><div id="calendar-stage" class="calendar-stage ${mode}-view">${content}</div></div>`;
}
