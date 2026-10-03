import {startAutoSync} from './auto-sync.mjs';
import {syncMarkup,setupManualSync} from './sync-ui.mjs';
import {customizeMarkup,setupCustomizer} from './customize.mjs';
import {syncIdeaBubbles,bubbleSettingsCard,setupBubbleSettings,ideaInBubbles,setIdeaInBubbles} from './idea-bubbles.mjs';
import {calendarMarkup,shiftDate} from './calendar.mjs';
import {initializeLocal,localAPI} from './local-store.mjs';
import {quadrants,isImportant,quadrantOf} from './quadrants.mjs';
import {reviewSummary} from './reviews.mjs';
import {taskTypes,taskTypeName} from './task-types.mjs';
import { serverAddress } from './portability.mjs';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, x => ({ '&': '&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[x]);
const uid = () => crypto.randomUUID();
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Shanghai', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
const dateLabel = d => new Date(d).toLocaleString('zh-CN', { timeZone:'Asia/Shanghai', month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false });
const timeLabel = d => new Date(d).toLocaleTimeString('en-GB', { timeZone:'Asia/Shanghai', hour:'2-digit',minute:'2-digit' });
const localInput = d => d ? `${new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(d))}T${timeLabel(d)}` : '';
const iso = value => value ? new Date(`${value}:00+08:00`).toISOString() : '';
const weekdays = ['一','二','三','四','五','六','日'];
let state, providers = [], page = location.hash.slice(1) || 'today', taskFilter = 'all', saving = false, toastTimer, draft, activeAI;
const labels = {customize:'定制我的工具',today:'今日概览',week:'课表与日程',tasks:'作业与项目',ideas:'灵感收件箱',reviews:'复盘',quadrants:'四象限',assistant:'AI 时间管家',settings:'偏好与 AI 设置'};
let dataMode=localStorage.getItem('shixu-data-mode')==='local'?'local':'server';
const localMode=()=>dataMode==='local';
async function api(url, options = {}) {
  if(localMode())return localAPI(url,options);
  const response = await fetch(url, { ...options, headers: options.body instanceof FormData ? {} : { 'Content-Type':'application/json', ...options.headers } });
  const data = await response.json();
  if (!response.ok) { if (response.status === 401) showLogin(); throw Error(data.error || '请求失败'); }
  return data;
}
const post = (url, body = {}) => api(url, {method:'POST',body:JSON.stringify(body)});
function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').hidden = true, 6000); }
function showLogin() { syncIdeaBubbles([]); $('#shell').hidden = true; $('#login').hidden = false; }
async function load() { try { if(localMode())await initializeLocal(); [state, providers] = await Promise.all([api('/api/state'),api('/api/providers')]); $('#login').hidden = true; $('#shell').hidden = false; render(); } catch(e) { if (!$('#login').hidden) return; toast(e.message); } }
async function change(fn) {
  if (saving) throw Error('正在保存，请稍候');
  saving = true; $('#sync-status').textContent = '正在保存…';
  const next = structuredClone(state); fn(next);
  try { state = await api('/api/state', {method:'PUT',body:JSON.stringify(next)}); render(); }
  catch(e) { $('#sync-status').textContent = '未保存 · 请检查连接'; throw e; }
  finally { saving = false; }
}
let modalMotionVersion=0, lastAnimatedPage;
const motionEnabled=()=>document.documentElement.dataset.motion!=='off'&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
function openModal(title, content, setup) { modalMotionVersion++;$('#modal').getAnimations().forEach(a=>a.cancel()); $('#modal-title').textContent = title; $('#modal-content').innerHTML = content; if (!$('#modal').open) $('#modal').showModal(); setup?.(); }
function closeModal() { activeAI?.abort();const modal=$('#modal'),version=++modalMotionVersion;if(!modal.open)return;if(!motionEnabled()){modal.close();return;}modal.getAnimations().forEach(a=>a.cancel());const animation=modal.animate([{opacity:1,transform:'translateY(0) scale(1)'},{opacity:0,transform:'translateY(14px) scale(.98)'}],{duration:160,easing:'cubic-bezier(.4,0,1,1)'});animation.finished.then(()=>{if(version===modalMotionVersion)modal.close();}).catch(()=>{}); }
async function runAI(url,body,selector) {
  const controller=new AbortController();activeAI=controller;
  const started=Date.now();const progress=$(selector);
  const update=()=>{if(progress?.isConnected)progress.textContent=`正在处理，已等待 ${Math.floor((Date.now()-started)/1000)} 秒。关闭窗口可以取消。`;};
  update();const timer=setInterval(update,1000);const timeout=setTimeout(()=>controller.abort(),100000);
  try{return await api(url,{method:'POST',body:body instanceof FormData?body:JSON.stringify(body),signal:controller.signal});}
  catch(e){const message=controller.signal.aborted?'本次请求已取消或等待超时，可以重试。':e.message;if(progress?.isConnected){progress.textContent=`处理失败：${message}`;progress.classList.add('error');}throw Error(message);}
  finally{clearInterval(timer);clearTimeout(timeout);if(activeAI===controller)activeAI=undefined;}
}
function formHandler(id, handler) { $(id).addEventListener('submit', async e => { e.preventDefault(); const button = e.submitter; if (button) button.disabled = true; try { await handler(new FormData(e.target)); } catch(err) { toast(err.message); } finally { if (button?.isConnected) button.disabled = false; } }); }
const opt = (value, label, current) => `<option value="${esc(value)}" ${value === current ? 'selected' : ''}>${esc(label)}</option>`;
function courseOn(c, date) {
  const day = new Date(`${date}T12:00:00+08:00`).getUTCDay() || 7;
  const week = Math.floor((new Date(`${date}T00:00:00+08:00`) - new Date(`${state.settings.semesterStart}T00:00:00+08:00`)) / 604800000) + 1;
  return c.day === day && week >= c.fromWeek && week <= c.toWeek && (c.parity === 'all' || (c.parity === 'odd' ? week % 2 === 1 : week % 2 === 0));
}
function events(date) { return [...state.courses.filter(c => courseOn(c,date)).map(c => ({...c,course:true,title:c.name,start:`${date}T${c.start}:00+08:00`,end:`${date}T${c.end}:00+08:00`})),...state.blocks.filter(b => localInput(b.start).startsWith(date)),...state.tasks.filter(t=>active(t)&&t.due&&localInput(t.due).startsWith(date)).map(t=>({...t,deadline:true,title:`截止：${t.title}`,start:t.due,end:t.due}))].sort((a,b) => new Date(a.start)-new Date(b.start)); }
const active = t => t.status !== 'submitted' && !(t.kind !== 'homework' && t.status === 'done');
const empty = (message, action = '') => `<div class="empty"><div class="empty-symbol">◌</div>${message}${action ? `<br>${action}` : ''}</div>`;
function heading(kicker,title,description,extra = '') { return `<div class="page-heading"><div><span class="eyebrow">${kicker}</span><h1>${esc(title)}</h1><p>${esc(description)}</p></div>${extra}</div>`; }
function taskRow(t) {
  const overdue = t.due && new Date(t.due) < new Date() && active(t);
  return `<div class="task-item ${!active(t) ? 'done' : ''}"><button class="check ${['done','submitted'].includes(t.status) ? 'checked' : ''}" data-action="complete" data-id="${esc(t.id)}" aria-label="切换完成状态">${['done','submitted'].includes(t.status) ? '✓' : ''}</button><div class="task-main"><button data-action="edit-task" data-id="${esc(t.id)}" style="text-align:left;padding:0"><strong>${esc(t.title)}</strong></button><p>${esc(t.group || (t.kind === 'homework' ? '未关联课程' : '个人项目'))} · ${esc(t.minutes)} 分钟${t.due ? ` · ${overdue ? '已逾期 ' : '截止 '}${esc(dateLabel(t.due))}` : ''}${t.submittedAt ? ` · 已于 ${esc(dateLabel(t.submittedAt))} 提交` : ''}</p></div><div class="task-tail"><span class="tag ${t.kind === 'homework' ? 'orange' : 'blue'}">${esc(taskTypeName(t.kind,state.settings))}</span>${overdue ? '<span class="tag red">逾期</span>' : ''}${t.status === 'done' && t.kind === 'homework' ? `<button class="text-btn" data-action="submit-task" data-id="${esc(t.id)}">记录提交 ↗</button>` : t.status === 'submitted' ? '<span class="tag">已提交</span>' : ''}</div></div>`;
}
function render() {
  if (!state) return;
  syncIdeaBubbles(state.ideas);
  if (!labels[page]) page = 'today';
  applyNavOrder();
  $('#page-label').textContent = labels[page];
  $('#profile-name').textContent = `${state.settings.name}的空间`;
  $('.avatar').textContent = state.settings.name.slice(0,1);
  $('#sync-status').textContent = localMode()?'仅本地 · 已保存在此浏览器':'已保存到服务端';
  $('.main-footer span:last-child').textContent=localMode()?'本地优先 · 同步由你控制':'以北京时间安排 · 云端保存';
  $('#today-date').textContent = new Date().toLocaleDateString('zh-CN',{timeZone:'Asia/Shanghai',month:'long',day:'numeric',weekday:'long'});
  $('#task-count').textContent = state.tasks.filter(active).length;
  $$('[data-page]').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  const views = {customize:()=>customizeMarkup(providers,localMode()),today:renderToday,week:renderWeek,tasks:renderTasks,ideas:renderIdeas,reviews:renderReviews,quadrants:renderQuadrants,assistant:renderAssistant,settings:renderSettings};
  $('#view').innerHTML = views[page]();
  if(lastAnimatedPage!==page){lastAnimatedPage=page;const view=$('#view');view.getAnimations().forEach(a=>a.cancel());if(motionEnabled())view.animate([{opacity:0,transform:'translateY(12px)'},{opacity:1,transform:'translateY(0)'}],{duration:420,easing:'cubic-bezier(.16,1,.3,1)'});}
  if (page === 'assistant') setupAssistant();
  if (page === 'settings') setupSettings();
  if (page === 'customize') setupCustomizer(api,toast);
  if (page === 'week') setupCalendar();
  if (page === 'quadrants') setupQuadrants();
}
function renderToday() {
  const pending = state.tasks.filter(active).sort((a,b) => (a.due ? +new Date(a.due) : Infinity) - (b.due ? +new Date(b.due) : Infinity));
  const todayEvents = events(today());
  const dueSoon = pending.filter(t => t.due && new Date(t.due) < Date.now() + 3*86400000);
  const minutes = todayEvents.filter(e => !e.course).reduce((sum,e) => sum + (new Date(e.end)-new Date(e.start))/60000,0);
  const latest = state.ideas.at(-1);
  const hour = Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',hour:'2-digit',hour12:false}).format(new Date()));
  const greeting = hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好';
  return `${heading('A FRESH PAGE, A LITTLE PROGRESS',`${greeting}，${state.settings.name}。`,'把精力留给重要的事，也给自己留一点空白。',`<div class="date-badge"><small>${new Date().toLocaleDateString('en-US',{timeZone:'Asia/Shanghai',month:'short'}).toUpperCase()}</small><b>${today().slice(-2)}</b></div>`)}<div class="dashboard"><div><section class="hero"><span class="eyebrow">✳ YOUR AI PLANNING PARTNER</span><h2>事情有点多？一起理一理。</h2><p>结合课表和截止时间，把作业与项目拆成今天可以迈出的小步。</p><button class="primary small" data-action="plan">帮我安排时间 <span>↗</span></button><div class="hero-art">✳</div></section><div class="stats"><div class="stat"><span>待推进任务</span><b>${pending.length}<small>件</small></b></div><div class="stat orange"><span>三天内截止 / 逾期</span><b>${dueSoon.length}<small>件</small></b></div><div class="stat"><span>今日已安排</span><b>${(minutes / 60).toFixed(1)}<small>小时</small></b></div></div><div class="section-head"><h2>值得先做的事 <small>按截止时间排列</small></h2><button class="text-btn" data-page="tasks">查看全部 ↗</button></div><div class="task-list">${pending.length ? pending.slice(0,5).map(taskRow).join('') : empty('这里还很清爽。<br>添加第一份作业，或一个想推进的项目。','<button class="text-btn" data-action="new-task">＋ 添加任务</button>')}</div><div class="notice" style="margin-top:20px">${pending.some(t => t.kind === 'homework' && t.status === 'done') ? '有作业已经完成，但还没有记录提交。记得把最后一步也做完。' : '一个小建议：今天先选一件最重要的事，再为它留出一段完整时间。'}</div></div><div class="dashboard-right"><section class="card"><div class="section-head"><h2>今天的节奏</h2><button class="text-btn" data-page="week">日历 ↗</button></div><p class="hint">${todayEvents.filter(e=>e.course).length} 节课程 · ${todayEvents.filter(e=>!e.course).length} 段任务</p><div class="timeline">${todayEvents.length ? todayEvents.map(e => `<div class="timeline-item"><span class="timeline-time">${timeLabel(e.start)}</span><button class="timeline-content ${e.deadline?'deadline':e.course ? 'course' : ''}" data-action="${e.deadline?'edit-task':e.course ? 'edit-course':'edit-block'}" data-id="${esc(e.id)}" style="text-align:left"><strong>${esc(e.title)}</strong><small>${e.deadline?'提交截止':`${timeLabel(e.end)} 结束 · ${esc(e.location || (e.locked ? '已锁定' : '专注时间'))}`}</small></button></div>`).join('') : empty('今天还没有固定安排。','<button class="text-btn" data-page="week">录入课表 ↗</button>')}</div></section><section class="card inspiration"><div class="section-head"><h2>✧ 灵感一角</h2><button class="text-btn" data-action="new-idea">＋</button></div><p>${latest ? esc(latest.text.slice(0,130)) : '还没想清楚，也值得记下来。'}</p><small>${latest ? esc(latest.project || '自由想法') : '不急着变成任务，先让想法落地。'}</small></section></div></div>`;
}
function renderTasks() {
  const tasks = state.tasks.filter(t => taskFilter === 'all' ? active(t) : taskFilter === 'finished' ? !active(t) : t.kind === taskFilter && active(t)).sort((a,b)=>(a.due ? +new Date(a.due):Infinity)-(b.due ? +new Date(b.due):Infinity));
  return `${heading('SMALL STEPS, REAL PROGRESS','每一件事，都有下一步。','把作业交稳，把项目慢慢往前推。')}<div class="toolbar"><div class="tabs">${[['all','全部待办'],...taskTypes(state.settings).map(t=>[t.id,t.name]),['finished','已完成 / 提交']].map(([v,l])=>`<button data-filter="${esc(v)}" class="${taskFilter===v?'selected':''}">${esc(l)}</button>`).join('')}</div><button class="quiet" data-action="plan">✳ AI 安排</button></div><div class="task-list">${tasks.length ? tasks.map(taskRow).join('') : empty('当前分类还没有任务。','<button class="text-btn" data-action="new-task">＋ 添加一件事</button>')}</div>`;
}
const calendarDefaults={hour:64,width:100,height:100};
function calendarSize(){try{const saved=JSON.parse(localStorage.getItem('calendarSize')||'{}');return Object.fromEntries(Object.entries(calendarDefaults).map(([k,v])=>[k,Number.isFinite(saved[k])?Math.max(k==='hour'?32:70,Math.min(k==='hour'?120:k==='width'?180:100,saved[k])):v]));}catch{return {...calendarDefaults};}}
function fitCalendar(){const box=$('.week-scroll');if(!box)return;const size=calendarSize();const available=Math.max(180,innerHeight-box.getBoundingClientRect().top-(innerWidth<=620?88:24));box.style.height=`${Math.round(available*size.height/100)}px`;}
function setupCalendar(){
  setupCalendarNavigation();
  fitCalendar();
  $('#calendar-controls')?.addEventListener('change',e=>{if(!e.target.name)return;const size=calendarSize();size[e.target.name]=Number(e.target.value);localStorage.setItem('calendarSize',JSON.stringify(size));render();});
  if($('#calendar-reset'))$('#calendar-reset').onclick=()=>{localStorage.removeItem('calendarSize');render();};
}
window.addEventListener('resize',fitCalendar);
function weekTimeline(dates) {
  const minute=value=>{const v=localInput(value);return Number(v.slice(11,13))*60+Number(v.slice(14,16));};
  const size=calendarSize();
  const deadlines=dates.map(d=>events(d).filter(e=>e.deadline));
  const days=dates.map(d=>events(d).filter(e=>!e.deadline));
  const first=Math.min(7,...days.flat().map(e=>Math.floor(minute(e.start)/60)));
  const last=Math.max(22,...days.flat().map(e=>Math.ceil((e.deadline?Math.min(1440,minute(e.start)+30):localInput(e.end).slice(0,10)!==localInput(e.start).slice(0,10)?1440:minute(e.end))/60)));
  const height=(last-first)*size.hour;
  const ticks=Array.from({length:last-first+1},(_,i)=>first+i);
  return `<div id="calendar-controls" class="calendar-controls"><label>日历宽度<select name="width">${[100,120,150,180].map(n=>opt(String(n),n===100?'适应窗口':n+'%',String(size.width))).join('')}</select></label><label>每小时高度<input name="hour" type="range" min="32" max="120" step="1" value="${size.hour}"><span>${size.hour} px</span></label><label>视窗高度<input name="height" type="range" min="70" max="100" step="1" value="${size.height}"><span>${size.height}%</span></label><button id="calendar-reset" class="text-btn">恢复默认</button><small>设置保存在本设备；截止任务在每天顶部单独列出。</small></div><div class="week-scroll" tabindex="0" aria-label="每周时间轴"><div class="time-calendar" style="--calendar-height:${height}px;--hour-height:${size.hour}px;width:${size.width}%"><div class="time-corner">时间</div>${dates.map((d,i)=>`<div class="calendar-day-header ${d===today()?'is-today':''}">周${weekdays[(new Date(d+'T12:00:00Z').getUTCDay()+6)%7]} <b>${d.slice(5)}</b></div>`).join('')}<div class="deadline-label">截止</div>${deadlines.map((items,i)=>`<section class="day-deadlines" aria-label="${dates[i]} 截止任务">${items.length?items.map(e=>`<button class="deadline-card" data-action="edit-task" data-id="${esc(e.id)}"><small>${timeLabel(e.start)} 截止</small><strong>${esc(e.title.replace(/^截止：/,''))}</strong></button>`).join(''):'<span class="muted">—</span>'}</section>`).join('')}<div class="hour-axis">${ticks.map(h=>`<span style="top:${(h-first)*size.hour}px">${String(h).padStart(2,'0')}:00</span>`).join('')}</div>${days.map((items,index)=>{
    const ends=[];
    const placed=items.map(e=>{const start=minute(e.start), end=e.deadline?start+30:localInput(e.end).slice(0,10)!==dates[index]?1440:minute(e.end);const visualEnd=Math.max(end,start+48*60/size.hour);let lane=ends.findIndex(x=>x<=start);if(lane<0)lane=ends.length;ends[lane]=visualEnd;return {e,start,end:visualEnd,lane};});
    const lanes=Math.max(1,ends.length);
    return `<section class="hour-day ${dates[index]===today()?'is-today':''}" aria-label="${dates[index]}">${placed.map(({e,start,end,lane})=>`<button class="week-event ${e.deadline?'deadline':e.course?'course':''}" style="top:${(start-first*60)*size.hour/60}px;height:${(end-start)*size.hour/60}px;left:calc(${lane*100/lanes}% + 3px);width:calc(${100/lanes}% - 6px)" data-action="${e.deadline?'edit-task':e.course?'edit-course':'edit-block'}" data-id="${esc(e.id)}" title="${esc(e.title)} · ${timeLabel(e.start)}${e.deadline?' 截止':'–'+timeLabel(e.end)}${e.location?' · '+esc(e.location):''}"><small>${timeLabel(e.start)}${e.deadline?' 截止':'–'+timeLabel(e.end)}</small><strong>${esc(e.title)}</strong>${e.location?`<small>${esc(e.location)}</small>`:''}</button>`).join('')}</section>`;
  }).join('')}</div></div>`;
}
function renderWeek() {
  return `${heading('A WEEK WITH ROOM TO BREATHE','给时间，一个位置。','紫色是课程，绿色是任务；点击任意安排即可修改时间。')}<div class="toolbar"><span class="grow"></span><button class="quiet" data-action="import">↑ 导入课表</button><button class="quiet" data-action="new-course">＋ 课程</button><button class="primary small" data-action="new-block">＋ 时间安排</button></div>${calendarMarkup({date:calendarDate,mode:calendarMode,today:today(),events,esc,timeline:weekTimeline})}<div class="section-head" style="margin-top:28px"><h2>学期课程 <small>共 ${state.courses.length} 个上课时段</small></h2><button class="text-btn" data-page="settings">设置学期起始日 ↗</button></div><div class="task-list">${state.courses.length ? state.courses.map(c=>`<div class="task-item"><span class="tag purple">周${weekdays[c.day-1]}</span><div class="task-main"><strong>${esc(c.name)}</strong><p>${c.start}–${c.end} · 第 ${c.fromWeek}–${c.toWeek} 周 · ${{all:'每周',odd:'单周',even:'双周'}[c.parity]} · ${esc(c.location)}</p></div><button class="text-btn" data-action="edit-course" data-id="${esc(c.id)}">修改</button></div>`).join('') : empty('支持手动录入，或上传课表后逐项核对。')}</div>`;
}
function renderQuadrants(){
 const hours=state.settings.urgentHours??48;const pending=state.tasks.filter(active);
 return `${heading('MAKE TIME FOR WHAT MATTERS','四象限，先做重要的事。','重要性由你决定；紧急性按截止时间判断，也可手动覆盖。')}<button class="quiet" data-action="quadrant-ai" style="margin-bottom:12px">✦ AI 分类建议</button><form id="quadrant-settings" class="toolbar"><label>紧急期限（小时）<input name="hours" type="number" min="1" max="720" value="${hours}" required></label><button class="quiet">保存期限</button><span class="hint">逾期或 ${hours} 小时内截止为紧急。拖拽或选择象限会设为手动分类。</span></form><div class="quadrant-grid">${quadrants.map(q=>{const tasks=pending.filter(t=>quadrantOf(t,hours)===q.id).sort((a,b)=>(a.due?+new Date(a.due):Infinity)-(b.due?+new Date(b.due):Infinity));return `<section class="quadrant ${q.id}" data-quadrant="${q.id}"><h2>${q.name} <small>${tasks.length}</small></h2><p class="hint">${q.hint}</p>${tasks.map(t=>`<article class="quadrant-card" draggable="true" data-task="${esc(t.id)}"><button class="quadrant-title" data-action="edit-task" data-id="${esc(t.id)}">${esc(t.title)}</button><p>${esc(taskTypeName(t.kind,state.settings))} · ${t.minutes} 分钟${t.due?` · 截止 ${esc(dateLabel(t.due))}`:' · 无截止时间'}</p>${t.kind==='homework'&&t.status==='done'?'<span class="tag orange">已完成，尚未提交</span>':''}<small>${t.urgency&&t.urgency!=='auto'?'手动紧急性':'自动紧急性'}${t.due&&+new Date(t.due)<Date.now()?' · 已逾期':''}</small><label>移动到<select data-move="${esc(t.id)}">${quadrants.map(x=>opt(x.id,x.name,q.id)).join('')}</select></label><div class="row wrap"><button class="text-btn" data-action="schedule-task" data-id="${esc(t.id)}">安排时间</button><button class="text-btn" data-auto="${esc(t.id)}">恢复自动紧急性</button><button class="text-btn" data-action="complete" data-id="${esc(t.id)}">${t.status==='done'?'恢复未完成':'标记完成'}</button>${t.kind==='homework'&&t.status==='done'?`<button class="text-btn" data-action="submit-task" data-id="${esc(t.id)}">记录提交 ↗</button>`:''}</div></article>`).join('')||'<p class="hint">暂无任务</p>'}</section>`;}).join('')}</div>`;
}
function quadrantAI(){
 if(!providers.length){toast('请先在设置中添加 AI 接口');return;}
 openModal('AI 分类建议',`<form id="quadrant-ai-form">${providerSelect()}<label>当前最重要的目标<textarea name="focus" maxlength="2000" placeholder="例如：本周先完成自控复习，同时推进项目调试"></textarea></label><p class="hint">会发送待办的名称、备注、截止时间和当前分类。最多分析 50 项，先预览，再选择应用。</p><button class="primary">生成分类建议</button><p class="hint" id="quadrant-ai-progress"></p></form>`,()=>formHandler('#quadrant-ai-form',async f=>{
 activeAI=new AbortController();const signal=activeAI.signal;$('#quadrant-ai-progress').textContent='正在分析，可关闭窗口取消…';
 const result=await api('/api/ai/quadrants',{method:'POST',body:JSON.stringify(Object.fromEntries(f)),signal});if(signal.aborted)return;
 if(!result.suggestions.length){toast('AI 没有给出分类建议');return;}
 openModal('核对分类建议',`<form id="quadrant-ai-preview"><p class="hint">只应用勾选项。应用后紧急性标为手动，可随时恢复自动判断。</p>${result.suggestions.map((x,i)=>{const t=state.tasks.find(t=>t.id===x.taskId);return `<section class="import-row"><label><input type="checkbox" name="apply-${i}"> ${esc(t?.title||'任务已变化')}</label><p class="hint">当前：${esc(quadrants.find(q=>q.id===quadrantOf(t||{},state.settings.urgentHours??48)).name)}</p><label>建议分类<select name="q-${i}">${quadrants.map(q=>opt(q.id,q.name,x.quadrant)).join('')}</select></label><p>${esc(x.reason)}</p></section>`;}).join('')}<button class="primary">应用所选建议</button></form>`,()=>formHandler('#quadrant-ai-preview',async f=>{
 if(state.revision!==result.revision)throw Error('任务已更新，请重新生成建议');
 const chosen=result.suggestions.map((x,i)=>({...x,i})).filter(x=>f.has('apply-'+x.i));if(!chosen.length)throw Error('请先勾选要应用的建议');
 await change(s=>{for(const x of chosen){const t=s.tasks.find(t=>t.id===x.taskId),q=quadrants.find(q=>q.id===f.get('q-'+x.i));t.important=q.important;t.priority=q.important?'high':t.priority==='high'?'normal':t.priority;t.urgency=q.urgent?'urgent':'not-urgent';}});closeModal();toast(`已应用 ${chosen.length} 项分类建议`);
 }));
 }));
}
function setupQuadrants(){
 const move=async(id,qid)=>{const q=quadrants.find(x=>x.id===qid);if(!q)return;await change(s=>{const t=s.tasks.find(x=>x.id===id);if(!t)return;t.important=q.important;t.priority=q.important?'high':t.priority==='high'?'normal':t.priority;t.urgency=q.urgent?'urgent':'not-urgent';});};
 const safe=fn=>async e=>{try{await fn(e);}catch(err){toast(err.message);}};
 formHandler('#quadrant-settings',async f=>{await change(s=>s.settings.urgentHours=Number(f.get('hours')));toast('紧急期限已保存');});
 $$('[data-move]').forEach(el=>el.onchange=safe(e=>move(el.dataset.move,e.target.value)));
 $$('[data-auto]').forEach(el=>el.onclick=safe(()=>change(s=>{s.tasks.find(t=>t.id===el.dataset.auto).urgency='auto';})));
 $$('.quadrant-card').forEach(el=>el.ondragstart=e=>{e.dataTransfer.setData('text/plain',el.dataset.task);e.dataTransfer.effectAllowed='move';});
 $$('[data-quadrant]').forEach(el=>{el.ondragover=e=>{e.preventDefault();e.dataTransfer.dropEffect='move';};el.ondrop=safe(async e=>{e.preventDefault();await move(e.dataTransfer.getData('text/plain'),el.dataset.quadrant);});});
}
setInterval(()=>{if(page==='quadrants'&&state&&!saving&&!$('#modal').open&&!document.activeElement?.closest('#quadrant-settings, [data-move]'))render();},60000);
function renderReviews(){return `${heading('REFLECT AND MOVE FORWARD','复盘，给下一步一点方向。','先记录事实，再看收获与阻碍。每日、每周、每月都可以留一份复盘。','<button class="primary" data-action="new-review">＋ 开始复盘</button>')}<div class="idea-grid">${[...(state.reviews||[])].sort((a,b)=>b.date.localeCompare(a.date)).map(r=>`<article class="idea-card"><div class="row between"><strong>${esc(r.date)} · ${{day:'每日',week:'每周',month:'每月'}[r.kind]}复盘</strong><button class="text-btn" data-action="edit-review" data-id="${esc(r.id)}">查看 / 编辑</button></div><p>${esc((r.actual||r.learning||r.summary).slice(0,200))}</p><small>保存于 ${esc(dateLabel(r.updatedAt))}</small></article>`).join('')||empty('从今天做过的一件事开始。')}</div>`;}
function reviewForm(record){
 const r=record||{kind:'day',date:today(),summary:'',actual:'',learning:'',blockers:'',next:'',analysis:''};
 openModal(record?'编辑复盘':'开始复盘',`<form id="review-form"><div class="form-grid"><label>复盘周期<select name="kind">${[['day','每日'],['week','每周'],['month','每月']].map(([v,l])=>opt(v,l,r.kind)).join('')}</select></label><label>复盘日期<input type="date" name="date" value="${esc(r.date)}" required></label></div><button type="button" class="quiet" id="review-generate">生成本期汇总</button><p class="hint">周按周一至周日，月按自然月。重新生成会替换下方汇总；已保存复盘独立保留。</p>${[['summary','事实汇总（可修改）'],['actual','实际做了什么 / 计划之外的成果'],['learning','收获与感受'],['blockers','未完成的原因 / 下一步处理'],['next','下期最重要的事'],['analysis','AI 分析（可修改）']].map(([k,l])=>`<label>${l}<textarea name="${k}" maxlength="30000" rows="${k==='summary'?8:3}">${esc(r[k])}</textarea></label>`).join('')}<p class="hint">可写明继续、拆分、延期或取消。这里只保存复盘，修改任务与日程请在对应页面确认。</p>${providers.length?providerSelect():'<p class="hint">配置 AI 接口后可进行可选分析。</p>'}<button type="button" class="quiet" id="review-ai" ${providers.length?'':'disabled'}>AI 帮我分析</button><p id="review-progress" class="hint"></p><div class="form-actions"><button class="primary">保存复盘</button></div></form>`,()=>{
 const form=$('#review-form');const collect=()=>Object.fromEntries(new FormData(form));
 $('#review-generate').onclick=()=>{try{const f=collect();form.elements.summary.value=reviewSummary(state,f.kind,f.date);}catch(e){toast(e.message);}};
 if(!record)$('#review-generate').click();
 $('#review-ai').onclick=async()=>{const button=$('#review-ai');button.disabled=true;activeAI=new AbortController();const signal=activeAI.signal;$('#review-progress').textContent='正在分析，内容会发送给所选 AI 服务商…';try{const result=await api('/api/ai/review',{method:'POST',body:JSON.stringify(collect()),signal});if(signal.aborted)return;form.elements.analysis.value=result.analysis;$('#review-progress').textContent='分析已填入，可以修改后保存；不会自动更改日程。';}catch(e){if(!signal.aborted)toast(e.message);}finally{if(button.isConnected)button.disabled=false;}};
 formHandler('#review-form',async f=>{const value={id:r.id||uid(),...Object.fromEntries(['kind','date','summary','actual','learning','blockers','next','analysis'].map(k=>[k,String(f.get(k))])),createdAt:r.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};await change(s=>{s.reviews??=[];const i=s.reviews.findIndex(x=>x.id===value.id);if(i<0)s.reviews.push(value);else s.reviews[i]=value;});closeModal();toast('复盘已保存');});
 });
}
function renderIdeas() {
  return `${heading('GOOD IDEAS NEED A PLACE TO LAND','先记下来，再慢慢想。','这里不催你完成。一个想法、一句话，都可以。', '<button class="primary small" data-action="new-idea">＋ 记录灵感</button>')}<div class="idea-grid">${[...state.ideas].reverse().map(i=>`<article class="idea-card"><div class="row between"><span class="tag">${esc(i.project || '自由想法')}</span><button class="text-btn" data-action="edit-idea" data-id="${esc(i.id)}">编辑</button></div><p>${esc(i.text)}</p><div class="row between"><small>${esc(dateLabel(i.createdAt))}</small><button class="text-btn" data-action="idea-task" data-id="${esc(i.id)}">变成下一步 ↗</button></div></article>`).join('')}</div>${state.ideas.length ? '' : `<div class="card">${empty('给突然出现的好想法，留一个位置。','<button class="text-btn" data-action="new-idea">✧ 写下第一个灵感</button>')}</div>`}`;
}
function renderSettings() {
  const s = state.settings;
  return `${heading('MAKE THIS SPACE YOURS','按你的习惯来。','作息、学期、AI 和提醒，都可以在这里调整。')}${localModeCard()}${syncMarkup(localMode())}<section class="card"><h2>定制我的工具</h2><p class="hint">让 AI 根据你的需求开发、测试和审查，通过后自动整合到自己的时序。</p><button class="quiet" data-page="customize">打开定制工作台 ↗</button></section>${appearanceCard()}${bubbleSettingsCard()}${navOrderCard()}<div class="settings-grid"><section class="card"><h2>基本偏好</h2><form id="preferences"><div class="form-grid"><label>怎么称呼你<input name="name" value="${esc(s.name)}" required maxlength="30"></label><label>第一教学周的周一<input name="semesterStart" type="date" value="${esc(s.semesterStart)}" required></label><label>最早安排时间<input name="dayStart" type="time" value="${s.dayStart}" required></label><label>最晚结束时间<input name="dayEnd" type="time" value="${s.dayEnd}" required></label><label>勿扰开始<input name="quietStart" type="time" value="${s.quietStart}" required></label><label>勿扰结束<input name="quietEnd" type="time" value="${s.quietEnd}" required></label><label class="full">截止提醒提前量（分钟，逗号分隔）<input name="reminderMinutes" value="${s.reminderMinutes.join(', ')}" required></label><label>课前提醒（分钟）<input name="courseReminder" type="number" min="0" max="120" value="${s.courseReminder}" required></label></div><p class="hint">当前统一使用北京时间。AI 会避开课表和已有安排，进一步偏好可在排程时输入。</p><div class="form-actions"><button class="primary small">保存偏好</button></div></form></section><div><section class="card"><div class="section-head"><h2>AI 接口</h2><button class="text-btn" data-action="new-provider">＋ 添加</button></div><p class="hint">兼容 OpenAI Chat Completions 和 Anthropic Messages 格式。密钥加密存放在服务端；留空不会覆盖旧密钥。</p>${providers.length ? providers.map(p=>`<div class="provider-row"><div class="row between"><strong>${esc(p.name)}</strong><div class="row"><button class="text-btn" data-action="test-provider" data-id="${esc(p.id)}">测试</button><button class="text-btn" data-action="edit-provider" data-id="${esc(p.id)}">编辑</button></div></div><p>${esc(p.model)} · ${esc(p.format)}</p><p>${esc(p.baseUrl)}</p></div>`).join('') : empty('还没有配置接口。添加后即可使用 AI 排程和课表识别。')}</section><section class="card"><h2>提醒与通知</h2><p class="hint">开启后由后台推送。部署到 HTTPS 后，在 Android Chrome 中添加到主屏幕，并允许通知。邮件备用渠道由部署环境配置。</p><div class="row wrap"><button class="quiet" data-action="enable-push">启用本设备通知</button><button class="quiet" data-action="test-push">发送测试提醒</button></div><p id="notification-status" class="hint" style="margin-top:14px">正在读取通知配置…</p></section>${serverCard()}<section class="card"><h2>数据与账号</h2><p class="hint">导出的 JSON 包含课表、任务和灵感，不包含密码、API 密钥或通知订阅。</p><div class="row wrap"><button class="quiet" data-action="export">导出备份</button><button class="quiet" data-action="restore">导入备份</button><button class="text-btn" data-action="previous-backup">下载本地 / 导入前恢复点</button><button class="quiet" data-action="password">修改密码</button><button class="text-btn" data-action="refresh">刷新同步</button></div></section></div></div>`;
}
function serverCard() {
  return `<section class="card"><h2>我的服务器</h2><p class="hint">当前服务地址</p><p style="overflow-wrap:anywhere">${esc(location.origin)}</p><p class="hint">支持自己的电脑、NAS 或云服务器。切换后使用新服务器的账号，数据需要单独导入；API 接口仍在上方配置。</p><button class="quiet" data-action="switch-server">切换服务器</button></section>`;
}
function switchServerForm() {
  openModal('切换到另一台服务器',`<form id="server-form"><label>服务器地址<input name="address" type="url" placeholder="https://plan.example.com" required></label><p class="hint">填写已部署时序的完整 HTTPS 根地址。本机开发可用 http://localhost:端口。</p><div class="notice">将打开新服务器的登录页面。当前数据、密码和 API Key 不会自动发送过去。迁移时先导出备份，再在新服务器登录并导入。</div><p id="server-destination" class="hint"></p><div class="form-actions"><button type="button" class="quiet" id="check-server-address">确认地址</button><button class="primary" id="go-server" disabled>前往此服务器</button></div></form>`,()=>{
    let approved='';const input=$('#server-form [name=address]');
    input.addEventListener('input',()=>{approved='';$('#go-server').disabled=true;$('#server-destination').textContent='';});
    $('#check-server-address').onclick=()=>{try{approved=serverAddress(input.value);if(approved===location.origin)throw Error('这就是当前服务器');$('#server-destination').textContent=`目标：${approved}（仅检查地址格式，尚未验证目标服务可用）`;$('#go-server').disabled=false;}catch(e){toast(e.message);}};
    formHandler('#server-form',async()=>{const target=serverAddress(input.value);if(target!==approved)throw Error('请先确认地址');location.assign(`${target}/#today`);});
  });
}
function downloadBackup(value, label='备份') {
  const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=`时序${label}-${today()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function restoreForm() {
  openModal('从备份迁入数据',`<form id="restore-form"><p class="hint">选择从另一台时序服务器导出的 JSON。兼容早期版本的原始数据备份，最大 1.5 MB。</p><label>备份文件<input name="file" type="file" accept=".json,application/json" required></label><div class="form-actions"><button class="primary">预览备份</button></div></form>`,()=>formHandler('#restore-form',async f=>{
    const file=f.get('file');if(file.size>1.5*1024*1024)throw Error('备份不能超过 1.5 MB');
    let backup;try{backup=JSON.parse(await file.text());}catch{throw Error('文件不是有效 JSON');}
    const preview=await post('/api/backup/preview',{backup});
    openModal('确认迁入的数据',`<p class="hint">目标：${localMode()?'此浏览器的本地空间':esc(location.origin)}</p><div class="notice">课程 ${preview.counts.courses} 项 · 任务 ${preview.counts.tasks} 项 · 灵感 ${preview.counts.ideas} 条 · 日程 ${preview.counts.blocks} 段</div><p class="hint">将替换当前课表、任务、灵感、日程和偏好。账号、API 配置和本服务器通知订阅保持不变。导入前的数据自动保留一个恢复点，可在设置中下载。</p><form id="restore-confirm"><label><input type="checkbox" name="confirm" required> 我确认用这份备份替换当前数据</label><div class="form-actions"><button class="primary">确认导入</button></div></form>`,()=>formHandler('#restore-confirm',async()=>{state=await post('/api/backup/restore',{backup,revision:preview.revision,confirmReplace:true});draft=undefined;render();closeModal();toast(localMode()?'数据已导入本地空间':'数据已迁入；请检查新服务器的 API 与通知配置');}));
  }));
}
function localModeCard(){return `<section class="card appearance-card"><h2>数据存储模式</h2><p>${localMode()?'本地优先：数据保存在此浏览器，可选择手动同步或开启自动同步。':'服务器模式：当前修改保存在服务器。'}</p><p class="hint">本地空间与服务器分开保存。首次在线打开后可准备离线资源；清除浏览器网站数据会删除本地空间，请定期导出备份。可在下方管理手动与自动同步；默认关闭自动同步。</p><button class="quiet" data-action="local-mode">${localMode()?'本地模式说明':'进入本地模式'}</button> <button class="quiet" data-action="offline-ready">准备 / 更新离线资源</button>${localMode()?'<button class="text-btn" data-action="server-mode">返回服务器模式（不上传）</button>':''}</section>`;}
function localModeForm(){openModal('本地空间',`<p class="hint">已有本地空间会直接打开，不会被覆盖。首次使用可创建空白空间，或复制当前已加载的服务器数据。API 密钥与账号不会复制。本地数据只属于此浏览器和当前网址。</p><button class="primary" id="local-empty">打开 / 创建本地空间</button>${state&&!localMode()?'<button class="quiet" id="local-copy">首次创建时复制当前数据</button>':''}`,()=>{const enter=async seed=>{try{await initializeLocal(seed);localStorage.setItem('shixu-data-mode','local');dataMode='local';await navigator.storage?.persist?.();closeModal();await load();toast('已进入本地模式；同步方式可在设置中管理');}catch(e){toast(e.message);}};$('#local-empty').onclick=()=>enter();if($('#local-copy'))$('#local-copy').onclick=()=>enter(state);});}
async function prepareOffline(){if(!('serviceWorker' in navigator))throw Error('此浏览器不支持离线资源');const registration=await navigator.serviceWorker.register('/sw.js');await registration.update();await navigator.serviceWorker.ready;const channel=new MessageChannel();await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('离线资源准备超时，请联网后重试')),30000);channel.port1.onmessage=e=>{clearTimeout(timer);channel.port1.close();e.data.ok?resolve():reject(Error('资源下载失败，请联网后重试'));};(registration.active||registration.waiting).postMessage({type:'prepare-offline'},[channel.port2]);});toast('离线资源已准备，可断网后重新打开验证');}
function appearanceCard(){const a=window.shixuAppearance.get();return `<section class="card appearance-card"><h2>外观与主题</h2><p class="hint">立即预览，自动保存在本设备。不会影响其他设备的阅读习惯。</p><form id="appearance-form" class="form-grid"><label>主题色<input type="color" name="color" value="${a.color}"></label><label>显示模式<select name="mode">${[['system','跟随系统'],['light','浅色'],['dark','夜间']].map(([v,l])=>opt(v,l,a.mode)).join('')}</select></label><label>字体大小<select name="size">${[85,100,115,130].map(n=>opt(String(n),n+'%',String(a.size))).join('')}</select></label><label>字体样式<select name="font">${[['sans','现代黑体'],['serif','经典宋体'],['mono','等宽字体']].map(([v,l])=>opt(v,l,a.font)).join('')}</select></label><label><input name="motion" type="checkbox" ${a.motion?'checked':''}> 启用轻量动画</label><button type="button" class="text-btn" id="appearance-reset">恢复默认外观</button></form><p class="appearance-preview">今天的一小步，也值得认真记录。<small>课程 · 项目 · 灵感 · 复盘</small></p></section>`;}
function setupAppearance(){const form=$('#appearance-form');const update=()=>{const f=new FormData(form);window.shixuAppearance.set({...Object.fromEntries(f),motion:f.has('motion')});};form.oninput=update;form.onchange=update;form.onsubmit=e=>e.preventDefault();$('#appearance-reset').onclick=()=>{window.shixuAppearance.reset();render();};}
function setupSettings() {
  setupAppearance();
  setupBubbleSettings();
  setupManualSync(async()=>{state=await api('/api/state');render();toast('同步完成，数据已保存在本地');});
  setupNavOrder();
  formHandler('#preferences',async f=>{ await change(s=>{for(const k of ['name','semesterStart','dayStart','dayEnd','quietStart','quietEnd']) s.settings[k]=String(f.get(k));s.settings.reminderMinutes=String(f.get('reminderMinutes')).split(/[,，]/).map(x=>Number(x.trim()));s.settings.courseReminder=Number(f.get('courseReminder'));});toast('偏好已保存');});
  api('/api/notifications').then(n=>{if($('#notification-status')) $('#notification-status').textContent=`已登记 ${n.subscriptions} 个设备 · 邮件备用${n.emailConfigured?'已配置':'尚未配置'}`;}).catch(e=>toast(e.message));
}
function taskForm(task = {}) {
  openModal(task.id?'编辑任务':'添加一件事',`<form id="task-form"><div class="form-grid"><label class="full">任务名称<input name="title" value="${esc(task.title)}" placeholder="例如：完成电路实验报告" maxlength="200" required></label><label>类型<select name="kind">${taskTypes(state.settings).map(t=>opt(t.id,t.name,task.kind||'homework')).join('')}<option value="__custom__">＋ 自定义类型</option></select></label><label id="custom-type-field" hidden>自定义类型名称<input name="customType" maxlength="30" placeholder="例如：社团事务、学习计划"></label><label>所属课程 / 项目<input name="group" value="${esc(task.group)}" list="groups" placeholder="例如：电路分析"><datalist id="groups">${[...new Set([...state.courses.map(c=>c.name),...state.tasks.map(t=>t.group).filter(Boolean)])].map(g=>`<option value="${esc(g)}">`).join('')}</datalist></label><label>截止提交 / 完成时间<input name="due" type="datetime-local" value="${localInput(task.due)}"></label><label>预计总耗时（分钟）<input name="minutes" type="number" min="1" max="100000" value="${task.minutes||60}" required></label><label>重要性<select name="important">${opt('true','重要',String(isImportant(task)))}${opt('false','普通',String(isImportant(task)))}</select></label><label>紧急性<select name="urgency">${[['auto','按截止时间自动判断'],['urgent','手动：紧急'],['not-urgent','手动：不紧急']].map(([v,l])=>opt(v,l,task.urgency||'auto')).join('')}</select></label><label>当前状态<select name="status">${[['todo','未开始'],['doing','进行中'],['done','已完成（作业未提交）'],['submitted','已提交（作业）']].map(([v,l])=>opt(v,l,task.status||'todo')).join('')}</select></label><label class="full">实际提交时间（可补录）<input name="submittedAt" type="datetime-local" value="${localInput(task.submittedAt)}"></label><label class="full">提交入口<input name="link" type="url" value="${esc(task.link)}" placeholder="https://…"></label><label class="full">要求 / 下一步<textarea name="notes" maxlength="5000">${esc(task.notes)}</textarea></label></div><div class="form-actions">${task.id?`<button type="button" class="text-btn danger" data-action="delete-task" data-id="${esc(task.id)}">删除任务</button>`:''}<button class="primary">保存任务</button></div></form>`,()=>{
    const select=$('#task-form [name=kind]'), field=$('#custom-type-field'), input=field.querySelector('input');
    select.addEventListener('change',()=>{field.hidden=select.value!=='__custom__';input.required=!field.hidden;if(!field.hidden)input.focus();});
    formHandler('#task-form',async f=>{
    const t={...task,id:task.id||uid(),title:f.get('title').trim(),kind:f.get('kind'),group:f.get('group').trim(),due:iso(f.get('due')),minutes:Number(f.get('minutes')),priority:f.get('important')==='true'?'high':task.priority==='low'?'low':'normal',important:f.get('important')==='true',urgency:f.get('urgency'),status:f.get('status'),submittedAt:iso(f.get('submittedAt')),link:f.get('link'),notes:f.get('notes')};
    let newType;
    if(t.kind==='__custom__'){const name=String(f.get('customType')||'').trim();if(!name)throw Error('请填写类型名称');const existing=taskTypes(state.settings).find(x=>x.name===name);newType=existing?null:{id:'custom-'+uid(),name};t.kind=existing?.id||newType.id;}
    if(t.kind!=='homework'&&t.status==='submitted')t.status='done';
    if(t.status==='submitted'&&!t.submittedAt)t.submittedAt=new Date().toISOString();
    if(t.status!=='submitted')t.submittedAt='';
    t.completedAt=['done','submitted'].includes(t.status)?(task.completedAt||(['done','submitted'].includes(task.status)?'':new Date().toISOString())):'';
    await change(s=>{if(newType)(s.settings.taskTypes??=[]).push(newType);const index=s.tasks.findIndex(x=>x.id===t.id);if(index<0)s.tasks.push(t);else s.tasks[index]=t;});closeModal();toast('任务已保存');
  });});
}
function courseFields(c={}, prefix='') { return `<div class="form-grid"><label class="full">课程名称<input name="${prefix}name" value="${esc(c.name)}" required></label><label>星期<select name="${prefix}day">${weekdays.map((d,i)=>opt(String(i+1),`周${d}`,String(c.day||1))).join('')}</select></label><label>地点<input name="${prefix}location" value="${esc(c.location)}"></label><label>开始时间<input type="time" name="${prefix}start" value="${esc(c.start)}" required></label><label>结束时间<input type="time" name="${prefix}end" value="${esc(c.end)}" required></label><label>开始教学周<input type="number" min="1" max="60" name="${prefix}fromWeek" value="${c.fromWeek||1}" required></label><label>结束教学周<input type="number" min="1" max="60" name="${prefix}toWeek" value="${c.toWeek||16}" required></label><label>周次<select name="${prefix}parity">${[['all','每周'],['odd','单周'],['even','双周']].map(([v,l])=>opt(v,l,c.parity||'all')).join('')}</select></label></div>`; }
function courseData(f,p='') { return {name:String(f.get(`${p}name`)).trim(),location:f.get(`${p}location`),day:Number(f.get(`${p}day`)),start:f.get(`${p}start`),end:f.get(`${p}end`),fromWeek:Number(f.get(`${p}fromWeek`)),toWeek:Number(f.get(`${p}toWeek`)),parity:f.get(`${p}parity`)}; }
function courseForm(c={}) { openModal(c.id?'编辑课程':'添加课程',`<form id="course-form">${courseFields(c)}<p class="hint">时间修改会影响这门课的所有对应教学周。导入后也可以在这里修正。</p><div class="form-actions">${c.id?`<button type="button" class="text-btn danger" data-action="delete-course" data-id="${esc(c.id)}">删除课程</button>`:''}<button class="primary">保存课程</button></div></form>`,()=>formHandler('#course-form',async f=>{const v={id:c.id||uid(),...courseData(f)};await change(s=>{const i=s.courses.findIndex(x=>x.id===v.id);if(i<0)s.courses.push(v);else s.courses[i]=v;});closeModal();toast('课程已保存');})); }
function ideaForm(i={}) { openModal(i.id?'编辑灵感':'留住这个想法',`<form id="idea-form"><label>想到什么了？<textarea name="text" rows="6" placeholder="不用组织语言，先记下来。" maxlength="10000" required>${esc(i.text)}</textarea></label><label>关联项目（可选）<input name="project" value="${esc(i.project)}" placeholder="留空就是自由想法"></label><label><input type="checkbox" name="showBubble" ${ideaInBubbles(i.id)?'checked':''}> 让这条灵感参与气泡展示（本设备）</label><div class="form-actions">${i.id?`<button type="button" class="text-btn danger" data-action="delete-idea" data-id="${esc(i.id)}">删除</button>`:''}<button class="primary">保存灵感</button></div></form>`,()=>formHandler('#idea-form',async f=>{const value={...i,id:i.id||uid(),text:f.get('text').trim(),project:f.get('project'),createdAt:i.createdAt||new Date().toISOString()};if(!value.text)throw Error('写一点内容再保存');await change(s=>{const index=s.ideas.findIndex(x=>x.id===value.id);if(index<0)s.ideas.push(value);else s.ideas[index]=value;});setIdeaInBubbles(value.id,f.has('showBubble'));closeModal();toast('想法已收好');})); }
function blockForm(b={}) { openModal(b.id?'调整时间安排':'添加时间安排',`<form id="block-form"><label>安排名称<input name="title" value="${esc(b.title)}" required></label><label>关联任务<select name="taskId"><option value="">自由安排 / 休息</option>${state.tasks.filter(active).map(t=>opt(t.id,t.title,b.taskId)).join('')}</select></label><div class="form-grid"><label>开始<input name="start" type="datetime-local" value="${localInput(b.start)||`${today()}T19:00`}" required></label><label>结束<input name="end" type="datetime-local" value="${localInput(b.end)||`${today()}T20:00`}" required></label></div><label><input type="checkbox" name="locked" ${b.locked?'checked':''}> 锁定这段安排，在重排时保留</label><p class="hint">AI 添加草稿会避开所有已有安排。重排时可先清除未来未锁定安排，已锁定的始终保留。</p><div class="form-actions">${b.id?`<button type="button" class="text-btn danger" data-action="delete-block" data-id="${esc(b.id)}">删除安排</button>`:''}<button class="primary">保存安排</button></div></form>`,()=>formHandler('#block-form',async f=>{const v={...b,id:b.id||uid(),title:f.get('title').trim(),taskId:f.get('taskId'),start:iso(f.get('start')),end:iso(f.get('end')),locked:f.has('locked')};if(new Date(v.end)<=new Date(v.start))throw Error('结束时间需要晚于开始时间');const linked=state.tasks.find(t=>t.id===v.taskId);if(linked?.due&&new Date(v.end)>new Date(linked.due))throw Error('安排结束时间晚于任务截止时间，请调整时间或修改截止时间');const day=localInput(v.start).slice(0,10);if(localInput(v.end).slice(0,10)!==day)throw Error('请将跨天安排拆成两段保存');const conflicts=events(day).filter(x=>!x.deadline&&x.id!==b.id&&new Date(v.start)<new Date(x.end)&&new Date(x.start)<new Date(v.end));if(conflicts.length)throw Error(`与「${conflicts[0].title}」冲突，请调整时间`);await change(s=>{const i=s.blocks.findIndex(x=>x.id===v.id);if(i<0)s.blocks.push(v);else s.blocks[i]=v;});closeModal();toast('时间安排已保存');})); }
function providerForm(p={}) { openModal(p.id?'编辑 AI 接口':'添加 AI 接口',`<form id="provider-form"><label>配置名称<input name="name" value="${esc(p.name)}" placeholder="例如：我的日常模型" required></label><label>接口格式<select name="format">${opt('openai','OpenAI Chat Completions 兼容',p.format||'openai')}${opt('anthropic','Anthropic Messages',p.format)}</select></label><label>Base URL（包括版本路径，不含具体接口）<input name="baseUrl" type="url" value="${esc(p.baseUrl)}" placeholder="https://你的服务商地址/v1" required></label><label>模型名称<input name="model" value="${esc(p.model)}" placeholder="填写服务商提供的准确模型 ID" required></label><label>API Key<input name="apiKey" type="password" autocomplete="new-password" placeholder="${p.hasKey?'已保存，留空保留原密钥':'输入 API Key'}" ${p.hasKey?'':'required'}></label><p class="hint">地址需使用 HTTPS。排程会将课表与任务发送给所选服务商；灵感不会自动发送。调用按服务商规则计费。</p><div class="form-actions">${p.id?`<button type="button" class="text-btn danger" data-action="delete-provider" data-id="${esc(p.id)}">删除配置</button>`:''}<button class="primary">保存接口</button></div></form>`,()=>formHandler('#provider-form',async f=>{await post('/api/providers',{id:p.id,...Object.fromEntries(f)});providers=await api('/api/providers');render();closeModal();toast('接口已保存，可点击测试连接');})); }
function providerSelect() { const selected=localStorage.getItem('providerId');return `<label>本次使用的 AI<select name="providerId" required>${providers.map(p=>opt(p.id,`${p.name} · ${p.model}`,selected)).join('')}</select></label>`; }
function captureForm() {
  if(!providers.length){page='settings';location.hash=page;render();toast('请先添加 AI 接口');return;}
  openModal('跟 AI 说一声',`<form id="capture-form"><p class="hint">一句话可以包含多件事。活动加入日程，作业保存要求与截止时间；开启智能补全后，会先推断缺失字段并展示草稿。</p>${providerSelect()}<label>想记下什么？<textarea name="text" rows="5" maxlength="4000" required placeholder="我周四下午去通达加工，自控作业是课本第一章作业，周五截止。"></textarea></label><label><input type="checkbox" name="infer" checked> 智能补全：结合课表与项目推断缺失信息，先预览再保存</label><label><input type="checkbox" name="automatic" checked> 仅提取明确内容时，信息完整可自动加入（智能补全始终预览）</label><div class="form-actions"><button class="primary">交给 AI 整理</button></div><p id="capture-progress" class="hint"></p></form>`,()=>formHandler('#capture-form',async f=>{
    localStorage.setItem('providerId',f.get('providerId'));
    const result=await runAI('/api/ai/capture',{providerId:f.get('providerId'),text:f.get('text'),infer:f.has('infer')},'#capture-progress');
    if(!result.items.length){$('#capture-progress').textContent=result.questions.join('；')||'没有找到事项，请补充具体要做的事';return;}
    if(f.has('automatic')&&!result.requiresReview&&!result.issues.length&&!result.questions.length){try{await saveCapture(result,result.items);}catch(e){showCapture(result);toast(e.message);}}
    else showCapture(result);
  }));
}
function showCapture(result) {
  openModal(result.issues.length?'补充这几项，就能加入':'整理好了，核对一下',`<p class="hint">${esc(result.summary)}</p>${[...result.questions,...result.issues].length?`<div class="notice warning">${[...new Set([...result.questions,...result.issues])].map(esc).join('<br>')}</div>`:''}<form id="capture-review">${result.items.map((i,n)=>`<section class="import-row"><span class="tag ${i.type==='event'?'blue':'orange'}">${i.type==='event'?'固定日程':esc(taskTypeName(i.kind,state.settings))}</span><div class="notice">${(i.evidence||[]).map(esc).join('<br>')}${i.assumptions?.length?`<br><strong>AI 暂估，请核对：</strong><br>${i.assumptions.map(esc).join('<br>')}`:''}</div><label>名称<input name="${n}-title" value="${esc(i.title)}" required></label>${i.type==='event'?`<div class="form-grid"><label>日期<input type="date" name="${n}-date" value="${esc(i.date)}" required></label><label>关联任务<select name="${n}-taskId"><option value="">无关联任务</option>${state.tasks.filter(active).map(t=>opt(t.id,t.title,i.taskId)).join('')}</select></label><label>锁定安排<select name="${n}-locked">${opt('true','锁定',String(i.locked))}${opt('false','不锁定',String(i.locked))}</select></label><label>地点<input name="${n}-location" value="${esc(i.location)}"></label><label>开始时间<input type="time" name="${n}-startTime" value="${esc(i.startTime)}" required></label><label>结束时间<input type="time" name="${n}-endTime" value="${esc(i.endTime)}" required></label></div>`:`<div class="form-grid"><label>任务类型<select name="${n}-kind">${taskTypes(state.settings).map(t=>opt(t.id,t.name,i.kind)).join('')}</select></label><label>重要性<select name="${n}-important">${opt('true','重要',String(i.important))}${opt('false','普通',String(i.important))}</select></label><label>紧急性<select name="${n}-urgency">${[['auto','自动判断'],['urgent','紧急'],['not-urgent','不紧急']].map(([v,l])=>opt(v,l,i.urgency)).join('')}</select></label><label>提交入口<input type="url" name="${n}-link" value="${esc(i.link)}"></label><label>所属课程 / 项目<input name="${n}-group" value="${esc(i.group)}"></label><label>预计耗时（分钟，可修改）<input name="${n}-minutes" type="number" min="1" max="100000" value="${i.minutes??60}" required></label><label>截止日期<input type="date" name="${n}-dueDate" value="${esc(i.dueDate)}"></label><label>截止钟点<input type="time" name="${n}-dueTime" value="${esc(i.dueTime)}" ${i.dueDate?'required':''}></label></div>${i.minutes===null?'<p class="hint">未提供耗时，暂填 60 分钟供你调整。</p>':''}`}<label>内容 / 备注<textarea name="${n}-notes" rows="2">${esc(i.notes)}</textarea></label></section>`).join('')}<p id="capture-save-error" class="error"></p><div class="form-actions"><button type="button" class="quiet" data-action="capture">重新描述</button><button class="primary">加入日程和任务</button></div></form>`,()=>formHandler('#capture-review',async f=>{
    const items=result.items.map((item,n)=>{const i={...item};for(const key of Object.keys(i)){if(f.has(`${n}-${key}`))i[key]=key==='minutes'?Number(f.get(`${n}-${key}`)):['important','locked'].includes(key)?f.get(`${n}-${key}`)==='true':f.get(`${n}-${key}`);}return i;});
    try{await saveCapture(result,items);}catch(e){$('#capture-save-error').textContent=e.message;throw e;}
  }));
}
async function saveCapture(draft,items) {
  const result=await post('/api/ai/capture/apply',{id:draft.id,items});state=result.state;render();
  openModal(`已加入 ${result.added.length} 项`,`<div class="notice">${result.added.map(i=>`${i.type==='event'?'日程':'任务'} · ${esc(i.title)}`).join('<br>')}</div><p class="hint">活动在周历中显示，作业截止点也会出现在周历。若要安排做作业的时间，可以继续使用“帮我安排时间”。</p><div class="form-actions"><button class="quiet" id="undo-capture">撤销这次添加</button><button class="primary" id="view-captured">查看日历</button></div>`,()=>{
    $('#view-captured').onclick=()=>{const dates=result.added.map(x=>x.type==='event'?state.blocks.find(b=>b.id===x.id)?.start:state.tasks.find(t=>t.id===x.id)?.due).filter(Boolean).sort();if(dates.length){calendarDate=localInput(dates[0]).slice(0,10);calendarMode='week';}closeModal();page='week';location.hash=page;render();};
    $('#undo-capture').onclick=async e=>{e.target.disabled=true;try{state=await post('/api/ai/capture/undo',{id:result.undoId});render();closeModal();toast('这次添加已撤销');}catch(err){toast(err.message);e.target.disabled=false;}};
  });
}
function planForm() {
  if(!state.tasks.some(active)){toast('先添加至少一项作业或项目，再让 AI 安排时间');return taskForm();}
  if(!providers.length){page='settings';location.hash=page;render();toast('先添加一个 AI 接口，再开始安排');return;}
  openModal('一起安排接下来的一周',`<form id="plan-form"><p class="hint">AI 会读取你的课表、任务和作息，生成可审核的草稿。不会自动覆盖现有日程。</p>${providerSelect()}<label>这次有什么特别的想法？<textarea name="prompt" placeholder="例如：先安排周五要交的报告，晚上项目时间控制在一小时，午饭后休息半小时。" maxlength="2000"></textarea></label><div class="notice">系统会检查课程冲突、任务截止时间和可安排时段。有冲突的草稿不能应用。</div><div class="form-actions"><button type="button" class="text-btn" data-action="clear-future">清除未来未锁定安排</button><button class="primary">生成安排草稿 ↗</button></div><p id="ai-progress" class="hint"></p></form>`,()=>formHandler('#plan-form',async f=>{localStorage.setItem('providerId',f.get('providerId'));$('#ai-progress').textContent='正在结合课表和任务安排，通常需要几十秒…';try{draft=await runAI('/api/ai/plan',Object.fromEntries(f),'#ai-progress');showDraft();}catch(e){throw e;}}));
}
function showDraft() {
  openModal('先看看，这样安排可以吗？',`<p class="hint">${esc(draft.summary)}</p>${draft.errors?.length?`<div class="notice warning">草稿需要调整，暂不能应用：<br>${draft.errors.map(esc).join('<br>')}</div>`:'<div class="notice">已通过课程、截止时间与已有日程冲突检查。</div>'}${(draft.blocks||[]).map(b=>`<div class="plan-block"><strong>${esc(b.title)}</strong><p>${esc(dateLabel(b.start))} — ${esc(timeLabel(b.end))}</p><p>${esc(b.reason)}</p></div>`).join('')}${draft.unscheduled?.length?`<div class="notice warning">暂未安排：<br>${draft.unscheduled.map(x=>esc(typeof x==='string'?x:JSON.stringify(x))).join('<br>')}</div>`:''}<div class="form-actions"><button class="quiet" data-action="plan">修改要求再生成</button><button class="primary" data-action="apply-plan" ${draft.errors?.length||!draft.blocks?.length?'disabled':''}>确认加入日程</button></div>`);
}
function importForm() {
  openModal('从文件导入课表',`<form id="import-form"><p class="hint">支持 XLSX、文字版 PDF、CSV、TXT，最大 10 MB。结构化课程明细优先本地解析，其他格式才发送给所选 AI。扫描 PDF 暂不支持。</p>${providers.length?providerSelect():'<p class="hint">本地解析无需 API；其他格式需要先配置 AI。</p>'}<label>课表文件<input name="file" type="file" accept=".xlsx,.pdf,.csv,.txt" required></label><div class="notice">识别结果只进入预览，核对课程时间和教学周后才会保存。</div><div class="form-actions"><button class="primary">识别课表</button></div><p id="import-progress" class="hint"></p></form>`,()=>formHandler('#import-form',async f=>{if(f.get('file').size>10*1024*1024)throw Error('文件不能超过 10 MB');$('#import-progress').textContent='正在提取文字并识别课程…';const data=await runAI('/api/import',f,'#import-progress');previewImport(data);}));
}
function previewImport(data) {
  const slots=[...new Set(data.courses.filter(c=>c.sectionStart&&c.sectionEnd).map(c=>`${c.sectionStart}-${c.sectionEnd}`))];
  const slotFields=slots.length?`<div class="notice"><h3>批量补全节次时间</h3><p>文件只有节次，请填写各时段的开始和结束钟点，然后应用到下方同节次课程。</p>${slots.map(key=>`<div class="form-grid"><label>第 ${esc(key)} 节 · 开始<input type="time" data-slot-start="${key}"></label><label>结束<input type="time" data-slot-end="${key}"></label></div>`).join('')}<button type="button" class="quiet" id="apply-slots">应用到同节次课程</button></div>`:'';
  openModal('核对课表，再保存',`<p class="hint">${esc(data.notes)}<br>请逐项核对；取消勾选即可跳过某一项。重复导入的相同时段会自动跳过。</p><form id="import-confirm">${slotFields}${data.courses.map((c,i)=>`<div class="import-row"><label><input type="checkbox" name="include${i}" checked> 导入第 ${i+1} 项</label>${c.uncertain?`<div class="notice warning">${esc(c.uncertain)}</div>`:''}<fieldset style="border:0;padding:0;margin:0" data-import-fields="${i}">${courseFields(c,`c${i}-`)}</fieldset></div>`).join('')}<div class="form-actions"><button class="primary">确认导入选中课程</button></div></form>`,()=>{if($('#apply-slots'))$('#apply-slots').onclick=()=>{for(const key of slots){const start=$(`[data-slot-start="${key}"]`).value;const end=$(`[data-slot-end="${key}"]`).value;if(!start||!end)continue;data.courses.forEach((c,i)=>{if(`${c.sectionStart}-${c.sectionEnd}`===key){$(`[name="c${i}-start"]`).value=start;$(`[name="c${i}-end"]`).value=end;}});}toast('已填入对应课程，请核对后确认导入');};data.courses.forEach((c,i)=>$(`[name="include${i}"]`).addEventListener('change',e=>$(`[data-import-fields="${i}"]`).disabled=!e.target.checked));formHandler('#import-confirm',async f=>{const values=data.courses.flatMap((c,i)=>f.has(`include${i}`)?[{id:uid(),...courseData(f,`c${i}-`)}]:[]);if(!values.length)throw Error('至少选择一项');let added=0;await change(s=>{for(const v of values)if(!s.courses.some(c=>['name','day','start','end','fromWeek','toWeek','parity'].every(k=>c[k]===v[k]))){s.courses.push(v);added++;}});closeModal();toast(`已导入 ${added} 个课程时段`);});});
}
async function enablePush() {
  if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window))throw Error('当前浏览器不支持推送，请使用 Android Chrome 或桌面 Edge/Chrome');
  if(await Notification.requestPermission()!=='granted')throw Error('通知权限未开启，请在浏览器网站设置中允许');
  const n=await api('/api/notifications');const reg=await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;
  const key=Uint8Array.from(atob(n.publicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
  const sub=await reg.pushManager.getSubscription()||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});await post('/api/notifications/subscribe',sub.toJSON());toast('本设备已登记，请发送测试提醒并检查锁屏接收');if(page==='settings')render();
}
async function action(name,id) {
  if(localMode()&&['capture','plan','import','new-provider','enable-push','test-push','password','switch-server'].includes(name)){toast('仅本地模式暂不提供 AI、文件识别、推送或账号服务；请手动录入，或返回服务器模式使用。');return;}
  if(name==='local-mode')return localModeForm();if(name==='offline-ready')return prepareOffline();if(name==='server-mode'){localStorage.removeItem('shixu-data-mode');dataMode='server';state=null;providers=[];showLogin();await load();return;}
  if(name==='quadrant-ai')return quadrantAI();
  if(name==='capture')return captureForm();
  const task=state.tasks.find(t=>t.id===id);
  if(name==='new-review')return reviewForm();if(name==='edit-review')return reviewForm((state.reviews||[]).find(r=>r.id===id));
  if(name==='new-task')return taskForm();if(name==='edit-task')return taskForm(task);
  if(name==='new-course')return courseForm();if(name==='edit-course')return courseForm(state.courses.find(c=>c.id===id));
  if(name==='new-idea')return ideaForm();if(name==='edit-idea')return ideaForm(state.ideas.find(i=>i.id===id));
  if(name==='schedule-task'){const start=new Date(Math.ceil(Date.now()/900000)*900000);return blockForm({title:task.title,taskId:task.id,start:start.toISOString(),end:new Date(+start+Math.min(task.minutes,90)*60000).toISOString(),locked:true});}
  if(name==='new-block')return blockForm();if(name==='edit-block')return blockForm(state.blocks.find(b=>b.id===id));
  if(name==='new-provider')return providerForm();if(name==='edit-provider')return providerForm(providers.find(p=>p.id===id));
  if(name==='idea-task'){const i=state.ideas.find(x=>x.id===id);return taskForm({title:i.text.slice(0,100),notes:i.text,group:i.project,kind:'project'});}
  if(name==='complete'){if(task.status==='submitted'){toast('已提交的作业可在编辑窗口中修改状态');return;}await change(s=>{const t=s.tasks.find(x=>x.id===id);t.status=t.status==='done'?'todo':'done';t.completedAt=t.status==='done'?new Date().toISOString():'';});return;}
  if(name==='submit-task'){openModal('记录作业提交',`<form id="submit-form"><p class="hint">${esc(task.title)}。请先确认已在课程要求的平台提交。</p><label>实际提交时间<input name="submittedAt" type="datetime-local" value="${localInput(new Date())}" required></label><div class="form-actions"><button class="primary">记录为已提交</button></div></form>`,()=>formHandler('#submit-form',async f=>{await change(s=>{const t=s.tasks.find(x=>x.id===id);t.status='submitted';t.completedAt=t.completedAt||'';t.submittedAt=iso(f.get('submittedAt'));});closeModal();toast('已记录提交时间');}));return;}
  if(name.startsWith('delete-')){if(!confirm('确定删除这条记录吗？此操作不能撤销。'))return;const kind=name.slice(7);if(kind==='provider'){await api(`/api/providers/${encodeURIComponent(id)}`,{method:'DELETE'});providers=await api('/api/providers');render();}else await change(s=>{const key={task:'tasks',course:'courses',idea:'ideas',block:'blocks'}[kind];s[key]=s[key].filter(x=>x.id!==id);if(kind==='task')s.blocks=s.blocks.filter(b=>b.taskId!==id);});closeModal();return;}
  if(name==='prev-week'||name==='next-week'||name==='this-week'){calendarDate=name==='this-week'?today():shiftDate(calendarDate,'week',name==='next-week'?1:-1);render();return;}
  if(name==='plan')return planForm();if(name==='import')return importForm();
  if(name==='apply-plan'){state=await post('/api/ai/apply',{revision:draft.revision,blocks:draft.blocks});closeModal();page='week';location.hash=page;render();toast('草稿已加入日程，可以点击调整时间');return;}
  if(name==='clear-future'){if(!confirm('清除未来尚未开始且未锁定的安排？课程、任务和锁定安排会保留。'))return;await change(s=>{s.blocks=s.blocks.filter(b=>b.locked||new Date(b.start)<=new Date());});toast('已清除，可重新生成安排');return;}
  if(name==='test-provider'){toast('正在测试接口，会产生一次简短模型调用…');await post('/api/ai/test',{providerId:id});toast('接口连接成功');return;}
  if(name==='enable-push')return enablePush();if(name==='test-push'){const n=await post('/api/notifications/test');toast(n.message);return;}
  if(name==='refresh'){await load();toast('已重新读取服务端数据');return;}
  if(name==='export'){downloadBackup(await api('/api/backup'));return;}
  if(name==='previous-backup'){downloadBackup(await api('/api/backup/previous'),'恢复点');return;}
  if(name==='restore')return restoreForm();
  if(name==='switch-server')return switchServerForm();
  if(name==='password'){openModal('修改登录密码',`<form id="password-form"><label>原密码<input name="current" type="password" autocomplete="current-password" required></label><label>新密码（至少 12 个字符）<input name="password" type="password" minlength="12" maxlength="128" autocomplete="new-password" required></label><div class="form-actions"><button class="primary">修改并重新登录</button></div></form>`,()=>formHandler('#password-form',async f=>{await post('/api/password',Object.fromEntries(f));closeModal();showLogin();toast('密码已修改，所有设备需要重新登录');}));}
}
document.addEventListener('click',async e=>{
  const p=e.target.closest('[data-page]');if(p){page=p.dataset.page;location.hash=page;render();return;}
  const f=e.target.closest('[data-filter]');if(f){taskFilter=f.dataset.filter;render();return;}
  const b=e.target.closest('[data-action]');if(!b||b.disabled)return;
  b.disabled=true;try{await action(b.dataset.action,b.dataset.id);}catch(err){toast(err.message);}finally{if(b.isConnected)b.disabled=false;}
});
$('#close-modal').onclick=closeModal;
$('#modal').addEventListener('cancel',e=>{e.preventDefault();closeModal();});
$('#login-local').onclick=localModeForm;
$('#login-switch-server').onclick=switchServerForm;
$('#new-task').onclick=()=>taskForm();$('#quick-idea').onclick=()=>ideaForm();
$('#capture-start').onclick=captureForm;
$('#logout').onclick=async()=>{try{await post('/api/logout');state=null;closeModal();showLogin();}catch(e){toast(e.message);}};
formHandler('#login-form',async f=>{try{await post('/api/login',Object.fromEntries(f));$('#login-error').textContent='';$('#login-form [name=password]').value='';await load();}catch(e){$('#login-error').textContent=e.message;}});
window.addEventListener('hashchange',()=>{page=location.hash.slice(1)||'today';if(state)render();});
window.addEventListener('online',()=>{if(state)load();});
window.addEventListener('offline',()=>{if(state)$('#sync-status').textContent=localMode()?'离线 · 可在本地保存':'离线 · 暂不能保存';toast(localMode()?'网络已断开，可继续在本地使用':'网络已断开，恢复连接后再保存修改');});
setInterval(async()=>{if(!state||saving||$('#modal').open||document.hidden||['settings','assistant','customize'].includes(page))return;try{const latest=await api('/api/state');if(latest.revision!==state.revision){state=latest;render();}}catch{}},15000);
if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
let calendarDate=today(), calendarMode='week';
function setupCalendarNavigation(){
 const move=(mode,date,element)=>{
  const oldMode=calendarMode,box=$('#calendar-stage').getBoundingClientRect(),target=element?.getBoundingClientRect();
  calendarMode=mode;calendarDate=date;render();
  const stage=$('#calendar-stage');
  if(motionEnabled()){
   stage.style.transformOrigin=target?`${Math.max(0,Math.min(100,(target.x+target.width/2-box.x)/box.width*100))}% ${Math.max(0,Math.min(100,(target.y-box.y)/box.height*100))}%`:'50% 20%';
   const ranks={day:0,week:1,month:2,year:3};
   stage.animate([{opacity:0,transform:`scale(${ranks[mode]<ranks[oldMode]?.86:1.08}) translateY(10px)`},{opacity:1,transform:'scale(1) translateY(0)'}],{duration:480,easing:'cubic-bezier(.16,1,.3,1)'});
  }
 };
 $$('[data-cal-mode]').forEach(b=>b.onclick=()=>move(b.dataset.calMode,b.dataset.calDate||calendarDate,b));
 $$('[data-cal-step]').forEach(b=>b.onclick=()=>move(calendarMode,shiftDate(calendarDate,calendarMode,Number(b.dataset.calStep))));
 $('[data-cal-today]').onclick=()=>move(calendarMode,today());
 $('[data-cal-picker]').onchange=e=>{if(e.target.value)move(calendarMode,e.target.value);};
}
const navDefaults=['today','week','tasks','ideas','reviews','quadrants','assistant'];
function navOrder(){const saved=state.settings.navOrder||[];return [...new Set([...saved.filter(k=>navDefaults.includes(k)),...navDefaults])];}
function applyNavOrder(){for(const key of navOrder()){const b=$(`#nav [data-page="${key}"]`);if(b)$('#nav').append(b);}}
function navOrderCard(){return `<section class="card"><h2>我的空间 · 导航顺序</h2><p class="hint">上下移动后立即保存，手机与电脑都能调整。</p>${navOrder().map((k,i,a)=>`<div class="nav-order-row"><span>${labels[k]}</span><button class="quiet" data-nav-move="${k}" data-dir="-1" aria-label="上移${labels[k]}" ${i===0?'disabled':''}>↑</button><button class="quiet" data-nav-move="${k}" data-dir="1" aria-label="下移${labels[k]}" ${i===a.length-1?'disabled':''}>↓</button></div>`).join('')}<button class="text-btn" id="nav-reset">恢复默认顺序</button></section>`;}
function setupNavOrder(){
 $$('[data-nav-move]').forEach(b=>b.onclick=async()=>{try{const order=navOrder(),i=order.indexOf(b.dataset.navMove),j=i+Number(b.dataset.dir);[order[i],order[j]]=[order[j],order[i]];await change(s=>{s.settings.navOrder=order;});}catch(e){toast(e.message);}});
 $('#nav-reset').onclick=async()=>{try{await change(s=>{s.settings.navOrder=[...navDefaults];});}catch(e){toast(e.message);}};
}
let chatMessages=[],chatBusy=false,chatInput='',chatController,chatUndo='';
let chatEngine=localStorage.getItem('shixu-engine')||'api',harnessInfo=null;
let conversationStore=null,conversationLoading=false,selectedThread=localStorage.getItem('shixu-thread')||'',selectedProject='';
function renderAssistant(){return `${heading('YOUR TIME, IN CONVERSATION','AI 时间管家','把想法告诉我，一起安排、调整和推进。')}<div class="chat-workspace">${conversationSidebar()}<section class="card chat-main"><p class="hint">可查询、新增、修改、删除课程、任务、日程、灵感、复盘和偏好。发送即允许执行本次要求；推断会注明，最近一次修改可撤销。${localMode()?'当前是本地模式，请返回服务器模式使用联网 AI。':''}</p><div class="assistant-log" role="log" aria-live="polite">${chatMessages.map(m=>`<article class="chat-message ${m.role}"><small>${m.role==='user'?'你':'时序'}</small>${chatText(m.content)}</article>`).join('')}</div><p id="harness-progress" class="hint"></p><div id="harness-stream" class="chat-message" hidden></div><form id="assistant-form" class="assistant-composer">${providerSelect()}<label>对话引擎<select id="chat-engine" ${chatBusy?'disabled':''}>${opt('api','直接 API',chatEngine)}${opt('harness','DeepSeek Harness',chatEngine)}</select></label><p class="hint">${chatEngine==='harness'?(harnessInfo?.available?'Harness 已就绪 · 日程读写 / 联网搜索 / 网页阅读 / 模型信息':esc(harnessInfo?.error||'正在检查 Harness…')):'使用当前 API 直接处理事项'}</p><label>发给时间管家<textarea name="message" maxlength="4000" placeholder="周四下午去通达加工，自控第一章作业周五交，帮我安排好。" required ${localMode()?'disabled':''}>${esc(chatInput)}</textarea></label><div class="row wrap"><button class="primary" ${chatBusy||localMode()||!providers.length?'disabled':''}>${chatBusy?'正在处理…':'发送并执行 ↗'}</button><button type="button" class="quiet" id="chat-cancel" ${chatBusy?'':'disabled'}>停止</button><button type="button" class="quiet" id="chat-undo" ${!chatUndo||chatBusy?'disabled':''}>撤销最近一次修改</button><button type="button" class="text-btn" id="chat-clear" ${chatBusy?'disabled':''}>新建对话</button></div><p class="assistant-status hint">${chatBusy?'正在结合你的数据处理，请稍候。':'对话自动保存；项目说明会作为该项目内对话的背景。'}</p></form></section></div>`;}
function setupAssistant(){
 setupConversations();
 $('#chat-engine').onchange=e=>{chatEngine=e.target.value;localStorage.setItem('shixu-engine',chatEngine);render();};
 const log=$('.assistant-log');log.scrollTop=log.scrollHeight;
 $('#assistant-form textarea').oninput=e=>chatInput=e.target.value;
 $('#chat-cancel').onclick=()=>chatController?.abort();
 $('#chat-clear').onclick=()=>newConversation();
 $('#chat-undo').onclick=async()=>{try{const r=await post('/api/ai/chat/undo',{id:chatUndo});state=r;chatUndo='';await refreshConversations();render();}catch(e){toast(e.message);}};
 formHandler('#assistant-form',async f=>{
  if(chatBusy)return;const message=String(f.get('message')).trim();if(!message)return;
  if(!selectedThread)await newConversation(false);
  if(!conversationStore)throw Error('请等待对话加载完成');
  localStorage.setItem('providerId',f.get('providerId'));chatBusy=true;chatInput='';chatMessages.push({role:'user',content:message});chatController=new AbortController();const timer=setTimeout(()=>chatController.abort(),chatEngine==='harness'?190000:100000);render();
  try{const r=await (chatEngine==='harness'?harnessChat:api)('/api/ai/chat',{method:'POST',body:JSON.stringify({engine:chatEngine,providerId:f.get('providerId'),threadId:selectedThread,message,chatRevision:conversationStore.revision,revision:state.revision}),signal:chatController.signal});state=r.state;conversationStore=r.workspace;selectConversation(selectedThread);}
  catch(e){chatInput=message;chatMessages.push({role:'assistant',content:chatController.signal.aborted?'请求已停止。若修改恰好已保存，请刷新数据核对后再重试。':`未执行：${e.message}`});}
  finally{clearTimeout(timer);chatBusy=false;try{await refreshConversations();}catch{}if(page==='assistant')render();}
 });
}
function conversationSidebar(){return `<aside class="chat-sidebar"><div class="row wrap"><button class="quiet" id="thread-new" ${chatBusy||localMode()?'disabled':''}>＋ 新建对话</button><button class="quiet" id="project-new" ${chatBusy||localMode()||!conversationStore?'disabled':''}>＋ 新建项目</button></div><label>搜索对话<input id="thread-search" placeholder="搜索标题"></label><label>项目<select id="project-filter" ${chatBusy?'disabled':''}><option value="">全部对话</option>${(conversationStore?.projects||[]).map(p=>opt(p.id,p.title,selectedProject)).join('')}</select></label>${selectedProject?'<button class="text-btn" id="project-edit">编辑项目</button>':''}<div class="thread-list">${(conversationStore?.threads||[]).filter(t=>!selectedProject||t.projectId===selectedProject).map(t=>`<div class="thread-row ${t.id===selectedThread?'selected':''}"><button data-thread="${t.id}" ${chatBusy?'disabled':''}>${esc(t.title)}</button><button data-thread-edit="${t.id}" aria-label="管理${esc(t.title)}" ${chatBusy?'disabled':''}>⋯</button></div>`).join('')||'<p class="hint">新建一个对话，开始整理想法。</p>'}</div><button class="text-btn" id="chat-refresh" ${chatBusy?'disabled':''}>刷新对话</button></aside>`;}
function selectConversation(id){selectedThread=id;localStorage.setItem('shixu-thread',id);const thread=conversationStore?.threads.find(t=>t.id===id);chatMessages=thread?.messages||[];chatUndo=thread?.undoId||'';}
async function refreshConversations(){if(localMode())return;[conversationStore,harnessInfo]=await Promise.all([api('/api/conversations'),api('/api/harness')]);selectConversation(conversationStore.threads.some(t=>t.id===selectedThread)?selectedThread:conversationStore.threads[0]?.id||'');}
async function conversationChange(body){const r=await post('/api/conversations',{revision:conversationStore.revision,...body});conversationStore=r;return r;}
async function newConversation(redraw=true){try{if(!conversationStore)await refreshConversations();const r=await conversationChange({action:'createThread',title:'新对话',projectId:selectedProject});selectConversation(r.selectedId);chatInput='';if(redraw)render();}catch(e){toast(e.message);throw e;}}
function projectForm(){const project=conversationStore.projects.find(p=>p.id===selectedProject);openModal(project?'编辑项目':'新建项目',`<form id="chat-project-form"><label>项目名称<input name="title" value="${esc(project?.title)}" maxlength="100" required></label><label>项目说明<textarea name="instructions" maxlength="8000" placeholder="例如：这个项目用于准备数电考试，优先帮助我理解概念。">${esc(project?.instructions)}</textarea></label><p class="hint">同一项目中的对话共享这份说明，各自保留独立聊天记录。</p><div class="form-actions">${project?'<button type="button" class="text-btn" id="chat-project-delete">删除项目</button>':''}<button class="primary">保存项目</button></div></form>`,()=>{formHandler('#chat-project-form',async f=>{const r=await conversationChange({action:project?'updateProject':'createProject',id:project?.id,...Object.fromEntries(f)});selectedProject=r.selectedId;closeModal();render();});if(project)$('#chat-project-delete').onclick=async()=>{if(!confirm('删除项目？其中的对话会保留并移出项目。'))return;try{await conversationChange({action:'deleteProject',id:project.id});selectedProject='';closeModal();render();}catch(e){toast(e.message);}};});}
function threadForm(id){const t=conversationStore.threads.find(t=>t.id===id);openModal('管理对话',`<form id="chat-thread-form"><label>对话名称<input name="title" maxlength="100" value="${esc(t.title)}" required></label><label>所属项目<select name="projectId"><option value="">无项目</option>${conversationStore.projects.map(p=>opt(p.id,p.title,t.projectId)).join('')}</select></label><div class="form-actions"><button type="button" class="text-btn" id="thread-delete">删除对话</button><button class="primary">保存对话</button></div></form>`,()=>{formHandler('#chat-thread-form',async f=>{await conversationChange({action:'updateThread',id,...Object.fromEntries(f)});closeModal();render();});$('#thread-delete').onclick=async()=>{if(!confirm('删除这段聊天记录？已保存的任务和日程会保留。'))return;try{await conversationChange({action:'deleteThread',id});if(id===selectedThread)selectConversation('');closeModal();render();}catch(e){toast(e.message);}};});}
function setupConversations(){
 if(!conversationStore&&!conversationLoading&&!localMode()){conversationLoading=true;refreshConversations().then(()=>{if(page==='assistant')render();}).catch(e=>toast(e.message)).finally(()=>conversationLoading=false);}
 $('#thread-new').onclick=()=>newConversation().catch(()=>{});
 $('#project-new').onclick=()=>{if(conversationStore){selectedProject='';projectForm();}};
 $('#project-filter').onchange=e=>{selectedProject=e.target.value;render();};
 if($('#project-edit'))$('#project-edit').onclick=projectForm;
 $('#chat-refresh').onclick=async()=>{try{await refreshConversations();render();}catch(e){toast(e.message);}};
 $('#thread-search').oninput=e=>$$('.thread-row').forEach(row=>row.hidden=!row.textContent.toLowerCase().includes(e.target.value.toLowerCase()));
 $$('[data-thread]').forEach(b=>b.onclick=()=>{selectConversation(b.dataset.thread);chatInput='';render();});
 $$('[data-thread-edit]').forEach(b=>b.onclick=()=>threadForm(b.dataset.threadEdit));
}
function chatText(value){
 const text=String(value??'');let result='',offset=0;
 for(const m of text.matchAll(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g)){result+=esc(text.slice(offset,m.index));try{const u=new URL(m[2]);if(u.username||u.password)throw Error();result+=`<a href="${esc(u.href)}" target="_blank" rel="noopener noreferrer">${esc(m[1])}</a>`;}catch{result+=esc(m[0]);}offset=m.index+m[0].length;}
 return result+esc(text.slice(offset));
}
async function harnessChat(url,options){
 const response=await fetch(url,{...options,headers:{'Content-Type':'application/json'}});
 if(!response.headers.get('Content-Type')?.includes('ndjson')){const data=await response.json();if(!response.ok)throw Error(data.error||'Harness 请求失败');return data;}
 const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',result;
 try{while(true){const {value,done}=await reader.read();buffer+=decoder.decode(value,{stream:!done});const lines=buffer.split('\n');buffer=lines.pop();for(const line of lines){if(!line.trim())continue;const event=JSON.parse(line);if(event.type==='error')throw Error(event.error);if(event.type==='result')result=event.data;if(event.type==='status'&&$('#harness-progress'))$('#harness-progress').textContent=event.text;if(event.type==='text'&&$('#harness-stream')){const output=$('#harness-stream');output.hidden=false;output.textContent+=event.text;}}if(done)break;}if(!result)throw Error('Harness 连接结束但未确认保存，请刷新核对');return result;}finally{reader.releaseLock();}
}
await load();

startAutoSync({
 active:()=>localMode()&&!!state&&!saving&&!$('#modal').open&&!document.activeElement?.closest('input,textarea,select')&&page!=='settings',
 onSaved:async()=>{if(localMode()&&state&&!saving&&!$('#modal').open&&page!=='settings'){state=await api('/api/state');render();}},
 onStatus:config=>{if(localMode()&&state&&config.enabled&&!saving)$('#sync-status').textContent=config.status==='conflict'?'本地已保存 · 同步冲突待处理':config.status==='attention'?'本地已保存 · 同步需要处理':config.status==='waiting'?'本地已保存 · 等待同步':'本地已保存 · 自动同步已开启';}
});
