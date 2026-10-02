// 仅由测试进程 --import 加载，生产服务不引用此文件。
const original = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  if (String(url) !== 'https://example.com/v1/chat/completions') return original(url, options);
  const prompt = JSON.parse(options.body).messages[0].content;
  let result;
  if(prompt.includes('你是时序 AI 助手'))return Response.json({choices:[{message:{content:JSON.stringify({reply:'已为你记下灵感。 [资料来源](https://example.com/article)',operations:[{collection:'ideas',action:'create',values:{text:'对话测试灵感',project:'测试',assumptions:['所属项目根据对话暂定']}}]})}}]});
  if(prompt.includes('你是学生日程录入助手')){const date=new Date(Date.now()+3*86400000).toISOString().slice(0,10);result={summary:'两件事',questions:[],items:[{type:'event',title:'通达加工测试',date,startTime:'14:00',endTime:'16:00',location:'通达',notes:''},{type:'task',title:'第一章作业测试',kind:'homework',group:'自控',dueDate:date,dueTime:'18:00',minutes:60,notes:'课本第一章'}]};if(prompt.includes('模糊测试')){result.items[0].startTime='';result.items[0].endTime='';result.items[1].dueTime='';result.items[1].minutes=null;}}
  else if(prompt.includes('学生四象限分类助手')){const tasks=JSON.parse(prompt.split('。任务：')[1]);result={suggestions:tasks.map(t=>({taskId:t.id,quadrant:'q2',reason:'为长期项目预留时间'}))};}
  else if(prompt.includes('学生复盘助手')) result={analysis:'建议：将未完成事项拆为一个可执行的小步骤。'};
  else if (prompt.includes('提取课表')) result = { courses:[{name:'测试数学',day:1,start:'08:00',end:'09:40',fromWeek:1,toWeek:16,parity:'all',location:'A101',uncertain:''}],notes:'模拟模型结果，仅验证文件与确认流程' };
  else {
    const date = new Date(Date.now()+86400000).toISOString().slice(0,10);
    result = { summary:'测试安排', blocks:[{taskId:'project',title:'推进原型',start:`${date}T14:00:00+08:00`,end:`${date}T15:00:00+08:00`,reason:'测试'}],unscheduled:[] };
  }
  if(prompt.includes('主动补全草稿')){for(const i of result.items){i.assumptions=['时间与耗时：AI 暂估，请确认'];i.evidence=['事项：用户原话'];if(i.type==='task'){i.minutes=90;i.important=true;i.urgency='auto';i.dueTime='18:00';}else{i.startTime='14:00';i.endTime='16:00';}}}
  return Response.json({choices:[{message:{content:JSON.stringify(result)}}]});
};
