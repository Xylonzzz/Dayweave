export const BACKUP_FORMAT = 'shixu-backup';
export function backupData(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('备份文件格式无效');
  let s = value;
  if ('format' in value || 'version' in value) {
    if (value.format !== BACKUP_FORMAT || value.version !== 1) throw Error('不支持此备份格式或版本，请使用兼容版本的时序');
    s = value.data;
  }
  if (!s || !s.settings || !['courses','tasks','ideas','blocks'].every(k => Array.isArray(s[k]))) throw Error('备份缺少课程、任务、灵感、日程或偏好');
  return structuredClone({ courses:s.courses, tasks:s.tasks, ideas:s.ideas, blocks:s.blocks, reviews:s.reviews||[], settings:s.settings });
}
export function makeBackup(state, source = '') {
  return { format:BACKUP_FORMAT, version:1, exportedAt:new Date().toISOString(), source, data:backupData(state) };
}
export function serverAddress(value) {
  let url; try { url = new URL(String(value).trim()); } catch { throw Error('请输入完整地址，例如 https://plan.example.com'); }
  const local = ['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) throw Error('远程服务器请使用 HTTPS；HTTP 仅用于本机开发');
  if (url.username || url.password || url.search || (url.pathname !== '/' && url.pathname !== '')) throw Error('请只填写服务器根地址，不包含账号、路径或查询参数');
  return url.origin;
}
