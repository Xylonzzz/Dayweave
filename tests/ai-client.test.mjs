import test from 'node:test';
import assert from 'node:assert/strict';
import {callModel,requestSpec} from '../ai-client.mjs';
import {parseWeeks,structuredCourses} from '../course-import.mjs';
import ExcelJS from 'exceljs';
const p={baseUrl:'https://api.deepseek.com',format:'openai',model:'deepseek-v4-pro'};
test('DeepSeek structured requests explicitly disable thinking and use JSON mode',()=>{
  const spec=requestSpec(p,'只返回 JSON');assert.equal(spec.body.thinking.type,'disabled');assert.equal(spec.body.response_format.type,'json_object');
  assert.equal(requestSpec({...p,baseUrl:'https://other.example/v1'},'JSON').body.thinking,undefined);
});
test('truncated and empty model responses give actionable errors',async()=>{
  await assert.rejects(callModel(p,'dummy','JSON',{fetchImpl:async()=>Response.json({choices:[{finish_reason:'length',message:{content:'{'}}]})}),/长度上限/);
  await assert.rejects(callModel(p,'dummy','JSON',{fetchImpl:async()=>Response.json({choices:[{message:{content:''}}]})}),/未返回正文/);
});
test('cancellation propagates to model fetch',async()=>{
  const controller=new AbortController();controller.abort();
  await assert.rejects(callModel(p,'dummy','JSON',{signal:controller.signal,fetchImpl:async(_url,options)=>{options.signal.throwIfAborted();}}),/取消/);
});
test('separated teaching weeks retain gaps and parity',()=>{
  assert.deepEqual(parseWeeks('1-6周,8-13周'),[{fromWeek:1,toWeek:6,parity:'all'},{fromWeek:8,toWeek:13,parity:'all'}]);
  assert.equal(parseWeeks('1-16周(单)')[0].parity,'odd');assert.equal(parseWeeks('待定'),null);
});
test('structured course sheet parses once without inventing clock times',()=>{
  const wb=new ExcelJS.Workbook();const ws=wb.addWorksheet('课程明细');
  ws.addRow(['课程','星期','节次','周次','场地']);ws.addRow(['测试课','星期一','3-4','1-6周,8-13周','A101']);
  const out=structuredCourses(wb);assert.equal(out.courses.length,2);assert.equal(out.mode,'local');assert.equal(out.courses[0].start,'');assert.equal(out.courses[0].sectionStart,3);
});
