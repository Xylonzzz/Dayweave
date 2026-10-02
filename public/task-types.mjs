export const builtinTypes = [{id:'homework',name:'课程作业'},{id:'project',name:'项目任务'}];
export const taskTypes = (settings={}) => [...builtinTypes,...(settings.taskTypes||[])];
export const taskTypeName = (kind,settings) => taskTypes(settings).find(t=>t.id===kind)?.name || '任务';
export function validateTaskTypes(settings) {
  const custom=settings.taskTypes??[];
  if(!Array.isArray(custom)||custom.length>50)throw Error('自定义类型最多 50 个');
  const ids=new Set(builtinTypes.map(t=>t.id)), names=new Set(builtinTypes.map(t=>t.name));
  for(const t of custom){
    if(!t||typeof t.id!=='string'||!/^custom-[a-zA-Z0-9-]{1,64}$/.test(t.id)||typeof t.name!=='string'||!t.name.trim()||t.name!==t.name.trim()||t.name.length>30||ids.has(t.id)||names.has(t.name))throw Error('类型名称需为 1–30 个字符，且不能重复');
    ids.add(t.id);names.add(t.name);
  }
  return ids;
}
