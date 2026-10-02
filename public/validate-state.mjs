import {validateTaskTypes} from './task-types.mjs';
import {validateReviews} from './reviews.mjs';
const atChina=(date)=>new Date(date+'T00:00:00+08:00');
const hhmm = v => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
export function validateState(s) {
  if (!s || !s.settings || !['courses','tasks','ideas','blocks'].every(k => Array.isArray(s[k]) && s[k].length <= 3000)) throw Error('数据格式错误或条目过多');
  if (typeof s.settings.name !== 'string' || !s.settings.name.trim() || s.settings.name.length > 30) throw Error('称呼需为 1–30 个字符');
  s.reviews??=[];validateReviews(s.reviews);
  if(s.settings.navOrder!=null&&(!Array.isArray(s.settings.navOrder)||s.settings.navOrder.length>7||new Set(s.settings.navOrder).size!==s.settings.navOrder.length||s.settings.navOrder.some(k=>!['today','week','tasks','ideas','reviews','quadrants','assistant'].includes(k))))throw Error('导航顺序无效');
  if(s.settings.urgentHours!=null&&(!Number.isInteger(s.settings.urgentHours)||s.settings.urgentHours<1||s.settings.urgentHours>720))throw Error('紧急期限需为 1–720 小时');
  for(const t of s.tasks)if((t.important!=null&&typeof t.important!=='boolean')||(t.urgency!=null&&!['auto','urgent','not-urgent'].includes(t.urgency)))throw Error('四象限分类无效');
  const typeIds=validateTaskTypes(s.settings);
  for (const c of s.courses) if (typeof c?.name !== 'string' || (c.location != null && typeof c.location !== 'string')) throw Error('课程文字格式无效');
  for (const t of s.tasks) if (typeof t?.title !== 'string' || ['group','notes','link'].some(k => t[k] != null && typeof t[k] !== 'string')) throw Error('任务文字格式无效');
  for (const i of s.ideas) if (typeof i?.text !== 'string' || !i.text.trim() || (i.project != null && typeof i.project !== 'string') || !Number.isFinite(+new Date(i.createdAt))) throw Error('灵感内容或时间无效');
  for (const b of s.blocks) if (typeof b?.title !== 'string') throw Error('日程标题无效');
  if (!['dayStart','dayEnd','quietStart','quietEnd'].every(k => hhmm(s.settings[k])) || s.settings.dayStart >= s.settings.dayEnd) throw Error('作息时间格式错误');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.settings.semesterStart) || !Number.isFinite(+atChina(s.settings.semesterStart))) throw Error('学期起始日期错误');
  if (!Array.isArray(s.settings.reminderMinutes) || s.settings.reminderMinutes.length > 6 || s.settings.reminderMinutes.some(n => !Number.isInteger(n) || n < 0 || n > 10080)) throw Error('提醒提前量错误');
  if (!Number.isInteger(s.settings.courseReminder) || s.settings.courseReminder < 0 || s.settings.courseReminder > 120) throw Error('课程提醒提前量错误');
  for (const k of ['courses','tasks','ideas','blocks']) {
    const ids = new Set(); for (const x of s[k]) { if (!x || typeof x.id !== 'string' || ids.has(x.id)) throw Error('条目编号无效或重复'); ids.add(x.id); }
  }
  for (const c of s.courses) if (!c.name || !hhmm(c.start) || !hhmm(c.end) || c.start >= c.end || !Number.isInteger(c.day) || c.day < 1 || c.day > 7 || !Number.isInteger(c.fromWeek) || !Number.isInteger(c.toWeek) || c.fromWeek < 1 || c.toWeek < c.fromWeek || c.toWeek > 60 || !['all','odd','even'].includes(c.parity)) throw Error('课程日期或周次无效');
  for (const t of s.tasks) if (!t.title || !typeIds.has(t.kind) || !['todo','doing','done','submitted'].includes(t.status) || !Number.isFinite(t.minutes) || t.minutes < 1 || t.minutes > 100000 || (t.due && !Number.isFinite(+new Date(t.due))) || (t.submittedAt && !Number.isFinite(+new Date(t.submittedAt))) || (t.completedAt && !Number.isFinite(+new Date(t.completedAt)))) throw Error('任务内容或时间无效');
  for (const b of s.blocks) if (!b.title || !Number.isFinite(+new Date(b.start)) || !Number.isFinite(+new Date(b.end)) || new Date(b.start) >= new Date(b.end)) throw Error('日程时间无效');
  return s;
}
