export function parseWeeks(value) {
  const text=String(value); const parity=text.includes('单')?'odd':text.includes('双')?'even':'all';
  const cleaned=text.replace(/[周单双()（）\s]/g,'');
  const ranges=cleaned.split(/[,，、;；]/).map(x=>/^([0-9]{1,2})(?:[-–~至]([0-9]{1,2}))?$/.exec(x));
  if(!ranges.length||ranges.some(x=>!x))return null;
  const result=ranges.map(m=>({fromWeek:Number(m[1]),toWeek:Number(m[2]||m[1]),parity}));
  return result.every(x=>x.fromWeek>=1&&x.toWeek>=x.fromWeek&&x.toWeek<=60)?result:null;
}
export function structuredCourses(workbook) {
  for(const ws of workbook.worksheets){
    for(let r=1;r<=Math.min(ws.rowCount,10);r++){
      const headers=new Map();ws.getRow(r).eachCell(c=>headers.set(c.text.trim(),c.col));
      if(!['课程','星期','节次','周次'].every(k=>headers.has(k)))continue;
      const courses=[];let unsupported=false;
      for(let rowNo=r+1;rowNo<=ws.rowCount;rowNo++){
        const row=ws.getRow(rowNo);const value=k=>headers.has(k)?row.getCell(headers.get(k)).text.trim():'';
        if(!value('课程'))continue;
        const d=/^(?:星期|周)?([一二三四五六日天1-7])$/.exec(value('星期'));
        const day=d?(/[1-7]/.test(d[1])?Number(d[1]):'一二三四五六日'.indexOf(d[1].replace('天','日'))+1):0;
        const sections=/^(\d{1,2})(?:[-–~](\d{1,2}))?$/.exec(value('节次').replace(/[()（）节\s]/g,''));
        const weeks=parseWeeks(value('周次'));
        if(!day||!sections||!weeks){unsupported=true;break;}
        const sectionStart=Number(sections[1]),sectionEnd=Number(sections[2]||sections[1]);
        if(sectionStart<1||sectionEnd<sectionStart||sectionEnd>24){unsupported=true;break;}
        for(const week of weeks)courses.push({name:value('课程'),day,start:'',end:'',...week,sectionStart,sectionEnd,location:[value('校区'),value('场地'),value('选课备注')].filter(Boolean).join(' · '),uncertain:`第 ${sectionStart}–${sectionEnd} 节，文件未提供具体钟点，请补全上下课时间`});
      }
      if(!unsupported&&courses.length){
        const unique=[...new Map(courses.map(c=>[JSON.stringify(c),c])).values()];
        return {courses:unique,mode:'local',notes:`已直接读取「${ws.name}」，识别 ${unique.length} 个课程时段；未调用 AI。间断教学周已分别列出。请补全节次对应的钟点，并核对原表中的未排时间课程。`};
      }
    }
  }
  return null;
}
