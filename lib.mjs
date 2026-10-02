import crypto from 'node:crypto';

export function localDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
export function atChina(date, time = '00:00') { return new Date(`${date}T${time}:00+08:00`); }
export function dayDiff(a, b) { return Math.round((atChina(a) - atChina(b)) / 86400000); }
export function courseOn(course, date, semesterStart) {
  const weekday = new Date(`${date}T12:00:00+08:00`).getUTCDay() || 7;
  const week = Math.floor(dayDiff(date, semesterStart) / 7) + 1;
  return Number(course.day) === weekday && week >= Number(course.fromWeek || 1) && week <= Number(course.toWeek || 20)
    && (!course.parity || course.parity === 'all' || (course.parity === 'odd' ? week % 2 === 1 : week % 2 === 0));
}
export function overlaps(a, b) { return new Date(a.start) < new Date(b.end) && new Date(b.start) < new Date(a.end); }
export function checkPlan(blocks, state, now = new Date()) {
  const errors = [];
  const tasks = state.tasks || [];
  const fixed = state.blocks || [];
  if (!Array.isArray(blocks) || blocks.length > 100) return ['日程必须是最多 100 条的数组'];
  const seen = new Set();
  for (const [i, b] of blocks.entries()) {
    const prefix = `第 ${i + 1} 项`;
    if (!b || typeof b !== 'object') { errors.push(`${prefix}格式错误`); continue; }
    const task = tasks.find(t => t.id === b.taskId);
    if (!task || ['submitted', 'done'].includes(task.status)) errors.push(`${prefix}没有对应的待处理任务`);
    const start = new Date(b.start), end = new Date(b.end);
    if (!Number.isFinite(+start) || !Number.isFinite(+end) || end <= start) { errors.push(`${prefix}时间无效`); continue; }
    const date = localDate(start);
    if (date !== localDate(end)) errors.push(`${prefix}不能跨天`);
    if (start < now) errors.push(`${prefix}安排在过去`);
    if (start > new Date(+now + 7 * 86400000)) errors.push(`${prefix}超出未来七天范围`);
    if (end - start > 120 * 60000) errors.push(`${prefix}超过 120 分钟，请拆分`);
    if (start < atChina(date, state.settings.dayStart) || end > atChina(date, state.settings.dayEnd)) errors.push(`${prefix}超出可安排时段`);
    if (task?.due && end > new Date(task.due)) errors.push(`${prefix}超过任务截止时间`);
    for (const c of state.courses || []) {
      if (courseOn(c, date, state.settings.semesterStart) && overlaps(b, { start: atChina(date, c.start), end: atChina(date, c.end) })) errors.push(`${prefix}与课程「${c.name}」冲突`);
    }
    if (fixed.some(f => overlaps(b, f))) errors.push(`${prefix}与已有日程冲突`);
    if (blocks.slice(0, i).some(f => f && Number.isFinite(+new Date(f.start)) && overlaps(b, f))) errors.push(`${prefix}与本次草稿内其他安排冲突`);
    const key = `${b.taskId}-${b.start}`;
    if (seen.has(key)) errors.push(`${prefix}重复`);
    seen.add(key);
  }
  for (const task of tasks) {
    const added = blocks.filter(b => b?.taskId === task.id).reduce((sum,b) => sum + (new Date(b.end) - new Date(b.start)) / 60000, 0);
    const existing = fixed.filter(b => b.taskId === task.id && new Date(b.start) >= now).reduce((sum,b) => sum + (new Date(b.end) - new Date(b.start)) / 60000, 0);
    if (added > 0 && added + existing > Number(task.minutes)) errors.push(`任务「${task.title}」的安排超过预计总耗时`);
  }
  return [...new Set(errors)];
}
export function extractJSON(text) {
  const cleaned = String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(cleaned); } catch { throw new Error('模型没有返回有效 JSON，请重试或更换模型'); }
}
export function seal(value, key) {
  const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([c.update(value, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString('base64');
}
export function unseal(value, key) {
  const b = Buffer.from(value, 'base64'); const c = crypto.createDecipheriv('aes-256-gcm', key, b.subarray(0, 12));
  c.setAuthTag(b.subarray(12, 28)); return Buffer.concat([c.update(b.subarray(28)), c.final()]).toString('utf8');
}
