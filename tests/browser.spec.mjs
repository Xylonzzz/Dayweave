import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import ExcelJS from 'exceljs';
let server;
test.beforeAll(async()=>{
  server=spawn(process.execPath,['--import','./tests/mock-ai.mjs','server.mjs'],{stdio:'ignore',env:{...process.env,PORT:'3098',PUBLIC_ORIGIN:'http://localhost:3098',DATA_DIR:`test-output/ui-${Date.now()}`,ADMIN_PASSWORD:'UI-test-password-123',HOST:'127.0.0.1'}});
  for(let i=0;i<250;i++){try{if((await fetch('http://localhost:3098')).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}
  throw Error('UI test server did not start');
});
test.afterAll(()=>server?.kill());
test('desktop student flow and mobile layout',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');
  await page.getByRole('textbox',{name:'密码',exact:true}).fill('UI-test-password-123');
  await page.getByRole('button',{name:/进入我的空间/}).click();
  await expect(page.getByRole('heading',{name:/同学/})).toBeVisible();
  await page.getByRole('button',{name:/帮我安排时间/}).click();
  await expect(page.getByRole('heading',{name:'添加一件事',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'关闭',exact:true}).click();
  await page.getByRole('button',{name:'＋ 新建任务',exact:true}).click();
  await page.getByLabel('任务名称').fill('电路分析 · 实验报告');
  await page.getByLabel('所属课程 / 项目').fill('电路分析');
  await page.getByLabel('截止提交 / 完成时间').fill('2026-09-08T18:00');
  await page.getByRole('button',{name:'保存任务',exact:true}).click();
  await expect(page.getByRole('button',{name:'电路分析 · 实验报告',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'✧ 记个灵感',exact:true}).click();
  await page.getByLabel('想到什么了？').fill('把项目调试过程做成一张可复用的检查表。');
  await page.getByLabel('关联项目（可选）').fill('项目原型');
  await page.getByRole('button',{name:'保存灵感',exact:true}).click();
  await expect(page.locator('#view').getByText('把项目调试过程做成一张可复用的检查表。')).toBeVisible();
  await page.locator('nav [data-page="week"]').click();
  await page.getByRole('button',{name:'＋ 课程',exact:true}).click();
  await page.getByLabel('课程名称').fill('高等数学');
  await page.locator('#course-form select[name="day"]').selectOption(String(new Date().getDay()||7));
  await page.getByLabel('开始时间',{exact:true}).fill('08:00');
  await page.getByLabel('结束时间',{exact:true}).fill('09:40');
  await page.getByLabel('地点',{exact:true}).fill('教学楼 A302');
  await page.getByRole('button',{name:'保存课程',exact:true}).click();
  await expect(page.getByText('学期课程')).toBeVisible();
  await page.getByRole('button',{name:'修改',exact:true}).click();
  await page.getByLabel('地点',{exact:true}).fill('教学楼 A305');
  await page.getByRole('button',{name:'保存课程',exact:true}).click();
  await expect(page.getByText(/教学楼 A305/).last()).toBeVisible();
  await expect(page.getByLabel('每周时间轴')).toBeVisible();
  await expect(page.locator('.hour-axis')).toContainText('08:00');
  const courseBox=await page.locator('.hour-day .week-event.course').first().boundingBox();
  expect(Math.round(courseBox.height)).toBe(107);
  await page.screenshot({path:'test-output/calendar-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'test-output/calendar-mobile.png',fullPage:true});
  await page.setViewportSize({width:1440,height:1000});
  await page.locator('nav [data-page="today"]').click();
  await expect(page.locator('#toast')).toBeHidden({timeout:10000});
  await page.screenshot({path:'test-output/desktop-preview.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'test-output/android-preview.png',fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.locator('nav [data-page="tasks"]').click();
  await page.getByRole('button',{name:'切换完成状态'}).click();
  await page.getByRole('button',{name:'记录提交 ↗'}).click();
  await page.getByLabel('实际提交时间',{exact:true}).fill('2026-09-06T14:25');
  await page.getByRole('button',{name:'记录为已提交'}).click();
  await page.getByRole('button',{name:'已完成 / 提交',exact:true}).click();
  await expect(page.getByText('已提交',{exact:true})).toBeVisible();
  await expect(page.getByText(/14:25/)).toBeVisible();
  await page.reload();
  await page.getByRole('button',{name:'已完成 / 提交',exact:true}).click();
  await expect(page.getByText(/14:25/)).toBeVisible();
  await page.locator('.settings-nav').click();
  await expect(page.getByRole('heading',{name:'AI 接口',exact:true})).toBeVisible();
  await page.locator('[data-action="new-provider"]').click();
  await page.getByLabel('配置名称').fill('测试兼容接口');
  await page.getByLabel('Base URL',{exact:false}).fill('https://example.com/v1');
  await page.getByLabel('模型名称').fill('test-model');
  await page.getByLabel('API Key',{exact:true}).fill('dummy-test-key');
  await page.getByRole('button',{name:'保存接口',exact:true}).click();
  await expect(page.getByText('测试兼容接口',{exact:true})).toBeVisible();
  await page.locator('[data-action="edit-provider"]').click();
  await expect(page.getByLabel('API Key',{exact:true})).toHaveValue('');
  await page.getByRole('button',{name:'关闭',exact:true}).click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  const backup=await (await page.request.get('/api/backup')).json();
  backup.data.settings.name='迁移测试';
  await page.getByRole('button',{name:'导入备份',exact:true}).click();
  await page.locator('#restore-form input[type=file]').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
  await page.getByRole('button',{name:'预览备份',exact:true}).click();
  await expect(page.getByRole('heading',{name:'确认迁入的数据',exact:true})).toBeVisible();
  await page.locator('#restore-confirm input[type=checkbox]').check();
  await page.getByRole('button',{name:'确认导入',exact:true}).click();
  await expect(page.getByLabel('怎么称呼你')).toHaveValue('迁移测试');
  await page.getByRole('button',{name:'切换服务器',exact:true}).click();
  await page.getByLabel('服务器地址',{exact:true}).fill('https://own-server.example');
  await page.getByRole('button',{name:'确认地址',exact:true}).click();
  await expect(page.locator('#server-destination')).toContainText('https://own-server.example');
  let sentCredentials=false;
  await page.route('https://own-server.example/**',route=>{sentCredentials=!!route.request().headers().cookie||!!route.request().postData();return route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8"><h1>目标服务器登录</h1>'});});
  await page.getByRole('button',{name:'前往此服务器',exact:true}).click();
  await expect(page.getByRole('heading',{name:'目标服务器登录'})).toBeVisible();
  expect(sentCredentials).toBe(false);
  expect(errors).toEqual([]);
});
test('structured Excel import previews locally and fills repeated lesson times',async({page})=>{
  await page.goto('/');await page.getByRole('textbox',{name:'密码',exact:true}).fill('UI-test-password-123');await page.getByRole('button',{name:/进入我的空间/}).click();
  await page.locator('nav [data-page="week"]').click();await page.getByRole('button',{name:'↑ 导入课表',exact:true}).click();
  const wb=new ExcelJS.Workbook();const ws=wb.addWorksheet('课程明细');ws.addRow(['课程','星期','节次','周次','场地']);ws.addRow(['本地解析测试','星期二','1-2','1-6周,8-13周','A101']);
  await page.locator('#import-form input[type=file]').setInputFiles({name:'test.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(await wb.xlsx.writeBuffer())});
  await page.getByRole('button',{name:'识别课表',exact:true}).click();
  await expect(page.getByRole('heading',{name:'核对课表，再保存',exact:true})).toBeVisible();
  await expect(page.getByText(/未调用 AI/)).toBeVisible();
  await page.locator('[data-slot-start="1-2"]').fill('08:00');await page.locator('[data-slot-end="1-2"]').fill('09:40');
  await page.getByRole('button',{name:'应用到同节次课程',exact:true}).click();
  await expect(page.locator('[name="c1-start"]')).toHaveValue('08:00');
  await page.getByRole('button',{name:'确认导入选中课程',exact:true}).click();
  await expect(page.getByText('本地解析测试',{exact:true}).last()).toBeVisible();
});
test('chat capture fills missing times, saves both records, and undoes auto-add',async({page})=>{
  await page.goto('/');await page.getByRole('textbox',{name:'密码',exact:true}).fill('UI-test-password-123');await page.getByRole('button',{name:/进入我的空间/}).click();
  await page.locator('#capture-start').click();await page.locator('[name=infer]').uncheck();await page.getByLabel('想记下什么？').fill('模糊测试：周四下午去通达，自控第一章作业周五截止');
  await page.getByRole('button',{name:'交给 AI 整理',exact:true}).click();
  await expect(page.getByRole('heading',{name:'补充这几项，就能加入'})).toBeVisible();
  await page.locator('[name="0-startTime"]').fill('14:00');await page.locator('[name="0-endTime"]').fill('16:00');await page.locator('[name="1-dueTime"]').fill('18:00');
  await page.getByRole('button',{name:'加入日程和任务',exact:true}).click();await expect(page.getByRole('heading',{name:'已加入 2 项',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'查看日历',exact:true}).click();
  await expect(page.getByRole('button',{name:/截止.*第一章作业测试/})).toBeVisible();
  const after=await(await page.request.get('/api/state')).json();expect(after.blocks.some(b=>b.title==='通达加工测试'&&b.locked)).toBe(true);
  await page.locator('#capture-start').click();await page.locator('[name=infer]').uncheck();await page.getByLabel('想记下什么？').fill('完整测试：周四14点到16点通达加工，第一章作业18点截止需要60分钟');
  // Remove the preceding test-only records to avoid intentionally colliding with them.
  const baseline=await(await page.request.get('/api/state')).json();baseline.blocks=baseline.blocks.filter(b=>b.title!=='通达加工测试');baseline.tasks=baseline.tasks.filter(t=>t.title!=='第一章作业测试');await page.request.put('/api/state',{data:baseline});
  await page.getByRole('button',{name:'交给 AI 整理',exact:true}).click();await expect(page.getByRole('heading',{name:'已加入 2 项',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'撤销这次添加',exact:true}).click();
  const final=await(await page.request.get('/api/state')).json();expect(final.tasks.some(t=>t.title==='第一章作业测试')).toBe(false);
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('custom task type persists, filters and completes',async({page})=>{
  await page.goto('/');
  await page.getByRole('textbox',{name:'密码',exact:true}).fill('UI-test-password-123');
  await page.getByRole('button',{name:/进入我的空间/}).click();
  await page.getByRole('button',{name:'＋ 新建任务',exact:true}).click();
  await page.getByLabel('任务名称').fill('准备社团活动');
  await page.locator('#task-form select[name=kind]').selectOption('__custom__');
  await page.getByLabel('自定义类型名称').fill('社团事务');
  await page.getByRole('button',{name:'保存任务',exact:true}).click();
  await expect(page.locator('#task-form')).toBeHidden();
  await page.reload();
  await page.locator('nav [data-page="tasks"]').click();
  await page.getByRole('button',{name:'社团事务',exact:true}).click();
  await expect(page.getByRole('button',{name:'准备社团活动',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'切换完成状态'}).click();
  await expect(page.getByRole('button',{name:'准备社团活动',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'已完成 / 提交',exact:true}).click();
  await page.getByRole('button',{name:'准备社团活动',exact:true}).click();
  await expect(page.locator('#task-form select[name=kind] option:checked')).toHaveText('社团事务');
  await page.getByRole('button',{name:'关闭',exact:true}).click();
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const backup=await page.evaluate(async()=> (await fetch('/api/backup')).json());
  expect(JSON.stringify(backup)).toContain('社团事务');
});


test('calendar fits viewport, remembers sizing, and separates Sunday deadlines',async({page})=>{
  await page.setViewportSize({width:1366,height:768});
  await page.goto('/');
  await page.getByRole('textbox',{name:'密码',exact:true}).fill('UI-test-password-123');
  await page.getByRole('button',{name:/进入我的空间/}).click();
  await expect(page.getByRole('button',{name:'＋ 新建任务',exact:true})).toBeVisible();
  const baseline=await(await page.request.get('/api/state')).json();
  const now=new Date();const day=new Date(now.toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'})+'T12:00:00+08:00');day.setUTCDate(day.getUTCDate()+7-(day.getUTCDay()||7));const sunday=day.toISOString().slice(0,10);
  baseline.tasks.push(...['自控第一章作业提交截止','项目阶段总结报告提交截止'].map((title,i)=>({id:'sunday-'+i,title,kind:'homework',status:'todo',minutes:60,due:sunday+'T23:59:00+08:00'})));
  expect((await page.request.put('/api/state',{data:baseline})).ok()).toBe(true);
  await page.reload();await page.locator('nav [data-page="week"]').click();
  const box=await page.locator('.week-scroll').boundingBox();expect(box.y+box.height).toBeLessThanOrEqual(768-20);
  expect(await page.locator('.week-scroll').evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
  const cards=page.locator('.day-deadlines').last().locator('.deadline-card');await expect(cards).toHaveCount(2);
  const a=await cards.nth(0).boundingBox(), b=await cards.nth(1).boundingBox();expect(b.y).toBeGreaterThanOrEqual(a.y+a.height+5);
  expect(await cards.evaluateAll(es=>es.every(e=>e.scrollHeight<=e.clientHeight+1))).toBe(true);
  await cards.nth(1).click();await expect(page.getByLabel('任务名称')).toHaveValue('项目阶段总结报告提交截止');await page.getByRole('button',{name:'关闭',exact:true}).click();
  await page.locator('[name=hour]').fill('48');await page.locator('[name=hour]').dispatchEvent('change');
  await page.locator('[name=height]').fill('70');await page.locator('[name=height]').dispatchEvent('change');
  await page.locator('[name=width]').selectOption('150');
  await page.reload();await expect(page.locator('[name=hour]')).toHaveValue('48');await expect(page.locator('[name=height]')).toHaveValue('70');await expect(page.locator('[name=width]')).toHaveValue('150');
  expect((await page.locator('.week-scroll').boundingBox()).height).toBeLessThan(box.height);
  expect(await page.locator('.week-scroll').evaluate(e=>e.scrollWidth>e.clientWidth)).toBe(true);
  await page.getByRole('button',{name:'恢复默认'}).click();await expect(page.locator('[name=hour]')).toHaveValue('64');
  await page.screenshot({path:'test-output/calendar-sized-desktop.png'});
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await cards.nth(1).scrollIntoViewIfNeeded();
  const mobileA=await cards.nth(0).boundingBox(),mobileB=await cards.nth(1).boundingBox();expect(mobileB.y).toBeGreaterThanOrEqual(mobileA.y+mobileA.height+5);
  await page.screenshot({path:'test-output/calendar-sized-mobile.png'});
});


test('review daily weekly monthly snapshots and optional AI persist independently',async({page})=>{
 await page.goto('/');await page.getByRole('textbox',{name:'密码',exact:true}).fill('UI-test-password-123');await page.getByRole('button',{name:/进入我的空间/}).click();
 await page.locator('nav [data-page="reviews"]').click();
 for(const kind of ['day','week','month']){
 await page.getByRole('button',{name:'＋ 开始复盘'}).click();await page.getByLabel('复盘周期').selectOption(kind);await page.getByRole('button',{name:'生成本期汇总'}).click();
 await expect(page.getByLabel('事实汇总（可修改）')).toHaveValue(/不代表实际完成/);
 await page.getByLabel('实际做了什么 / 计划之外的成果').fill('完成调试并记录问题 '+kind);
 if(kind==='day'){await page.getByRole('button',{name:'AI 帮我分析'}).click();await expect(page.getByLabel('AI 分析（可修改）')).toHaveValue(/可执行/);}
 await page.getByRole('button',{name:'保存复盘',exact:true}).click();await expect(page.locator('#review-form')).toBeHidden();
 }
 const before=await(await page.request.get('/api/state')).json();expect(before.reviews).toHaveLength(3);
 await page.screenshot({path:'test-output/reviews-desktop.png'});
 const snapshot=JSON.stringify(before.reviews);before.tasks=[];expect((await page.request.put('/api/state',{data:before})).ok()).toBe(true);
 await page.reload();await expect(page.locator('[data-action="edit-review"]')).toHaveCount(3);
 const backup=await(await page.request.get('/api/backup')).json();expect(JSON.stringify(backup.data.reviews)).toBe(snapshot);
 await page.locator('[data-action="edit-review"]').first().click();await expect(page.getByLabel('实际做了什么 / 计划之外的成果')).toHaveValue(/完成调试/);
 await page.getByRole('button',{name:'关闭',exact:true}).click();await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-output/reviews-mobile.png'});
});

test('quadrants share tasks, drag and mobile move persist with automatic reset',async({page})=>{
 await page.goto('/');await page.getByRole('textbox',{name:'密码',exact:true}).fill('UI-test-password-123');await page.getByRole('button',{name:/进入我的空间/}).click();await page.locator('nav [data-page="quadrants"]').click();
 const state=await(await page.request.get('/api/state')).json();state.tasks.push({id:'quad-test',title:'四象限测试任务',kind:'project',status:'todo',minutes:60,priority:'high',due:new Date(Date.now()+36*3600000).toISOString()},{id:'quad-homework',title:'待交作业',kind:'homework',status:'done',minutes:30});expect((await page.request.put('/api/state',{data:state})).ok()).toBe(true);await page.reload();
 const card=page.locator('[data-task="quad-test"]');await expect(page.locator('.q1')).toContainText('四象限测试任务');
 await card.dragTo(page.locator('.q2'));await expect(page.locator('.q2')).toContainText('四象限测试任务');await expect(card).toContainText('手动紧急性');
 await card.getByRole('button',{name:'恢复自动紧急性'}).click();await expect(page.locator('.q1')).toContainText('四象限测试任务');
 await page.locator('#quadrant-settings input').fill('24');await page.getByRole('button',{name:'保存期限'}).click();await expect(page.locator('.q2')).toContainText('四象限测试任务');
 await page.setViewportSize({width:390,height:844});await card.locator('select').selectOption('q3');await expect(page.locator('.q3')).toContainText('四象限测试任务');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.reload();await expect(page.locator('.q3')).toContainText('四象限测试任务');await card.getByRole('button',{name:'四象限测试任务',exact:true}).click();await expect(page.getByRole('combobox',{name:'重要性',exact:true})).toHaveValue('false');await expect(page.getByRole('combobox',{name:'紧急性',exact:true})).toHaveValue('urgent');await page.getByRole('button',{name:'关闭',exact:true}).click();
 await card.getByRole('button',{name:'标记完成'}).click();await expect(card).toHaveCount(0);await expect(page.locator('[data-task="quad-homework"]')).toContainText('尚未提交');
 const backup=await(await page.request.get('/api/backup')).json();expect(backup.data.settings.urgentHours).toBe(24);expect(backup.data.tasks.find(t=>t.id==='quad-test').urgency).toBe('urgent');
 await page.screenshot({path:'test-output/quadrants-mobile.png'});
});

test('AI quadrant preview requires selection and rejects stale application',async({page})=>{
 await page.goto('/');await page.getByRole('textbox',{name:'密码',exact:true}).fill('UI-test-password-123');await page.getByRole('button',{name:/进入我的空间/}).click();await page.locator('nav [data-page="quadrants"]').click();
 const baseline=await(await page.request.get('/api/state')).json();
 await page.getByRole('button',{name:'✦ AI 分类建议'}).click();await page.getByRole('button',{name:'生成分类建议'}).click();await expect(page.locator('#quadrant-ai-preview')).toBeVisible();
 expect((await(await page.request.get('/api/state')).json()).revision).toBe(baseline.revision);
 await page.getByRole('button',{name:'应用所选建议'}).click();await expect(page.locator('#toast')).toContainText('请先勾选');
 await page.locator('#quadrant-ai-preview input[type=checkbox]').first().check();await page.getByRole('button',{name:'应用所选建议'}).click();await expect(page.locator('#quadrant-ai-preview')).toBeHidden();
 const updated=await(await page.request.get('/api/state')).json();expect(updated.revision).toBe(baseline.revision+1);
 await page.getByRole('button',{name:'✦ AI 分类建议'}).click();await page.getByRole('button',{name:'生成分类建议'}).click();await expect(page.locator('#quadrant-ai-preview')).toBeVisible();await page.locator('#quadrant-ai-preview input[type=checkbox]').first().check();
 updated.settings.name='并发测试';expect((await page.request.put('/api/state',{data:updated})).ok()).toBe(true);
 await page.getByRole('button',{name:'应用所选建议'}).click();await expect(page.locator('#quadrant-ai-preview')).toBeVisible();await expect(page.locator('#toast')).toContainText(/更新/);
});

test('quadrant scheduling prefills task and prevents conflict and late finish',async({page})=>{
 await page.goto('/');await page.getByRole('textbox',{name:'密码',exact:true}).fill('UI-test-password-123');await page.getByRole('button',{name:/进入我的空间/}).click();await page.locator('nav [data-page="quadrants"]').click();
 const s=await(await page.request.get('/api/state')).json();s.tasks.push({id:'schedule-test',title:'安排测试',kind:'project',status:'todo',minutes:60,due:'2030-01-07T18:00:00+08:00'});s.blocks.push({id:'busy-test',title:'已有安排',taskId:'',start:'2030-01-07T10:00:00+08:00',end:'2030-01-07T11:00:00+08:00'});await page.request.put('/api/state',{data:s});await page.reload();
 await page.locator('[data-task="schedule-test"]').getByRole('button',{name:'安排时间',exact:true}).click();await expect(page.locator('#block-form [name=title]')).toHaveValue('安排测试');await expect(page.locator('#block-form [name=taskId]')).toHaveValue('schedule-test');
 await page.locator('#block-form [name=start]').fill('2030-01-07T10:00');await page.locator('#block-form [name=end]').fill('2030-01-07T11:00');await page.getByRole('button',{name:'保存安排',exact:true}).click();await expect(page.locator('#toast')).toContainText('冲突');
 await page.locator('#block-form [name=start]').fill('2030-01-07T18:00');await page.locator('#block-form [name=end]').fill('2030-01-07T19:00');await page.getByRole('button',{name:'保存安排',exact:true}).click();await expect(page.locator('#toast')).toContainText('截止');
 await page.locator('#block-form [name=start]').fill('2030-01-07T14:00');await page.locator('#block-form [name=end]').fill('2030-01-07T15:00');await page.getByRole('button',{name:'保存安排',exact:true}).click();await expect(page.locator('#block-form')).toBeHidden();
 const after=await(await page.request.get('/api/state')).json();expect(after.blocks.filter(b=>b.taskId==='schedule-test')).toHaveLength(1);expect(after.tasks.find(t=>t.id==='schedule-test').status).toBe('todo');
});

test('appearance persists, follows system and supports large mobile text',async({page})=>{
 await page.goto('/');await page.getByRole('textbox',{name:'密码',exact:true}).fill('UI-test-password-123');await page.getByRole('button',{name:/进入我的空间/}).click();await page.locator('.settings-nav').click();
 await page.locator('#appearance-form [name=mode]').selectOption('dark');await page.locator('#appearance-form [name=color]').fill('#7254b8');await page.locator('#appearance-form [name=size]').selectOption('130');await page.locator('#appearance-form [name=font]').selectOption('serif');
 await expect(page.locator('html')).toHaveAttribute('data-theme','dark');expect(await page.locator('html').evaluate(e=>getComputedStyle(e).fontSize)).toBe('20.8px');
 await page.reload();await expect(page.locator('#appearance-form [name=font]')).toHaveValue('serif');await expect(page.locator('#appearance-form [name=color]')).toHaveValue('#7254b8');
 await page.locator('#appearance-form [name=motion]').uncheck();await expect(page.locator('html')).toHaveAttribute('data-motion','off');
 await page.screenshot({path:'test-output/appearance-dark.png'});
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-output/appearance-mobile.png'});
 await page.locator('#appearance-form [name=mode]').selectOption('system');await page.emulateMedia({colorScheme:'light'});await expect(page.locator('html')).toHaveAttribute('data-theme','light');await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 await page.getByRole('button',{name:'恢复默认外观'}).click();await expect(page.locator('#appearance-form [name=size]')).toHaveValue('100');
});

test('polished modal motion closes safely and respects reduced motion',async({page})=>{
 await page.goto('/');await page.getByRole('textbox',{name:'密码',exact:true}).fill('UI-test-password-123');await page.getByRole('button',{name:/进入我的空间/}).click();await page.getByRole('button',{name:'＋ 新建任务',exact:true}).click();
 expect(await page.locator('#modal').evaluate(e=>getComputedStyle(e).animationName)).toBe('sheet-arrive');
 await page.getByRole('button',{name:'关闭',exact:true}).click();await expect(page.locator('#modal')).not.toBeVisible();
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'＋ 新建任务',exact:true}).click();await page.waitForTimeout(500);const box=await page.locator('#modal').boundingBox();expect(box.y+box.height).toBeLessThanOrEqual(844);expect(box.width).toBeLessThanOrEqual(390);
 await page.screenshot({path:'test-output/ios-style-sheet.png'});await page.keyboard.press('Escape');await expect(page.locator('#modal')).not.toBeVisible();
 await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('button',{name:'＋ 新建任务',exact:true}).click();expect(await page.locator('#modal').evaluate(e=>getComputedStyle(e).animationName)).toBe('none');await page.getByRole('button',{name:'关闭',exact:true}).click();await expect(page.locator('#modal')).not.toBeVisible();
});

test('local workspace survives offline reload, preserves backups and rejects stale writes',async({page,context})=>{
 await page.goto('/');await page.getByRole('button',{name:'无需登录，使用本地空间'}).click();await page.getByRole('button',{name:'打开 / 创建本地空间'}).click();await expect(page.locator('#sync-status')).toContainText('仅本地');
 await page.locator('.settings-nav').click();await page.getByRole('button',{name:'准备 / 更新离线资源'}).click();await expect(page.locator('#toast')).toContainText('离线资源已准备');
 await context.setOffline(true);await page.reload();await expect(page.locator('#sync-status')).toContainText('仅本地');
 await page.getByRole('button',{name:'＋ 新建任务',exact:true}).click();await page.getByLabel('任务名称').fill('断网完成的本地任务');await page.getByRole('button',{name:'保存任务',exact:true}).click();await expect(page.locator('#task-form')).toBeHidden();
 await page.getByRole('button',{name:'✧ 记个灵感',exact:true}).click();await page.getByLabel('想到什么了？').fill('离线灵感');await page.getByRole('button',{name:'保存灵感',exact:true}).click();await expect(page.locator('#idea-form')).toBeHidden();
 const result=await page.evaluate(async()=>{const {localAPI}=await import('/local-store.mjs');const s=await localAPI('/api/state');const copy=structuredClone(s);copy.settings.name='本地同学';await localAPI('/api/state',{method:'PUT',body:JSON.stringify(copy)});let conflict=false;try{await localAPI('/api/state',{method:'PUT',body:JSON.stringify(s)});}catch(e){conflict=e.message.includes('其他本地窗口');}const backup=await localAPI('/api/backup');const current=await localAPI('/api/state');const changed=structuredClone(backup);changed.data.tasks=[];await localAPI('/api/backup/restore',{method:'POST',body:JSON.stringify({backup:changed,revision:current.revision,confirmReplace:true})});const previous=await localAPI('/api/backup/previous');return {conflict,backup,previous};});
 expect(result.conflict).toBe(true);expect(result.backup.data.tasks[0].title).toBe('断网完成的本地任务');expect(result.previous.data.tasks).toHaveLength(1);
 const second=await context.newPage();await second.goto('/');await expect(second.locator('#sync-status')).toContainText('仅本地');await second.locator('nav [data-page="ideas"]').click();await expect(second.locator('#view').getByText('离线灵感',{exact:true})).toBeVisible();
 const apiCached=await page.evaluate(async()=>{const keys=await caches.keys();for(const key of keys){if((await(await caches.open(key)).keys()).some(r=>new URL(r.url).pathname.startsWith('/api/')))return true;}return false;});expect(apiCached).toBe(false);
 await context.setOffline(false);await page.reload();await expect(page.locator('#sync-status')).toContainText('仅本地');
});


test('copy to local does not mutate server and returning never uploads',async({page})=>{
 await page.goto('/');await page.getByRole('textbox',{name:'密码',exact:true}).fill('UI-test-password-123');await page.getByRole('button',{name:/进入我的空间/}).click();await page.locator('.settings-nav').click();
 const before=await(await page.request.get('/api/state')).json();await page.getByRole('button',{name:'进入本地模式',exact:true}).click();await page.getByRole('button',{name:'首次创建时复制当前数据'}).click();await expect(page.locator('#sync-status')).toContainText('仅本地');
 await page.getByRole('button',{name:'＋ 新建任务',exact:true}).click();await page.getByLabel('任务名称').fill('不应上传');await page.getByRole('button',{name:'保存任务',exact:true}).click();await expect(page.locator('#task-form')).toBeHidden();
 const server=await(await page.request.get('/api/state')).json();expect(server).toEqual(before);
 await page.getByRole('button',{name:'返回服务器模式（不上传）'}).click();await expect(page.locator('#sync-status')).toContainText('已保存到服务端');expect((await(await page.request.get('/api/state')).json())).toEqual(before);
 await page.getByRole('button',{name:'进入本地模式',exact:true}).click();await page.getByRole('button',{name:'首次创建时复制当前数据'}).click();await expect(page.locator('#sync-status')).toContainText('仅本地');await page.locator('nav [data-page="tasks"]').click();await expect(page.getByRole('button',{name:'不应上传',exact:true})).toBeVisible();
});

test('smart capture fills vague intent, previews and saves edited options',async({page})=>{
 await page.goto('/');await page.getByRole('textbox',{name:'密码',exact:true}).fill('UI-test-password-123');await page.getByRole('button',{name:/进入我的空间/}).click();await page.locator('.settings-nav').click();
 await page.request.post('/api/providers',{data:{name:'智能补全测试',baseUrl:'https://example.com/v1',model:'test-model',format:'openai',apiKey:'dummy-test-key'}});await page.reload();
 const before=await(await page.request.get('/api/state')).json();before.blocks=[];before.courses=[];await page.request.put('/api/state',{data:before});await page.reload();
 await page.locator('#capture-start').click();await page.getByLabel('想记下什么？').fill('模糊测试：周四下午加工，作业周五截止');await page.getByRole('button',{name:'交给 AI 整理'}).click();await expect(page.locator('#capture-review')).toBeVisible();await expect(page.locator('#capture-review')).toContainText('AI 暂估');
 expect((await(await page.request.get('/api/state')).json()).tasks.length).toBe(before.tasks.length);
 await expect(page.locator('[name="1-minutes"]')).toHaveValue('90');await page.locator('[name="1-kind"]').selectOption('project');await page.locator('[name="1-important"]').selectOption('false');await page.locator('[name="1-urgency"]').selectOption('urgent');await page.locator('[name="0-locked"]').selectOption('false');
 await page.getByRole('button',{name:'加入日程和任务'}).click();await expect(page.getByRole('heading',{name:'已加入 2 项',exact:true})).toBeVisible();
 const after=await(await page.request.get('/api/state')).json();const t=after.tasks.at(-1);expect(t.kind).toBe('project');expect(t.important).toBe(false);expect(t.urgency).toBe('urgent');expect(t.notes).toContain('暂估');expect(after.blocks.at(-1).locked).toBe(false);
});


test('calendar zoom views, navigation ordering and assistant execution undo',async({page})=>{
  await page.goto('/');
  await page.getByRole('textbox',{name:'密码',exact:true}).fill('UI-test-password-123');
  await page.getByRole('button',{name:/进入我的空间/}).click();
  await page.locator('#nav [data-page="week"]').click();
  await page.getByRole('button',{name:'年历',exact:true}).click();
  await expect(page.locator('.year-grid .month-panel')).toHaveCount(12);
  await page.screenshot({path:'test-output/calendar-year.png',fullPage:true,animations:'disabled'});
  await page.locator('.month-title').first().click();
  await expect(page.locator('#calendar-stage')).toHaveClass(/month-view/);
  await page.locator('.month-day:not(.outside)').first().click();
  await expect(page.locator('.hour-day')).toHaveCount(1);
  await page.getByRole('button',{name:'下一个日',exact:true}).click();
  await page.getByRole('button',{name:'月历',exact:true}).click();
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
  await page.screenshot({path:'test-output/calendar-mobile.png',animations:'disabled'});
  await page.setViewportSize({width:1440,height:1000});
  await page.locator('.settings-nav').click();
  await page.getByRole('button',{name:'上移AI 时间管家',exact:true}).click();
  await expect(page.locator('#nav button').nth(5)).toHaveAttribute('data-page','assistant');
  await page.reload();
  await expect(page.locator('#nav button').nth(5)).toHaveAttribute('data-page','assistant');
  await page.getByRole('button',{name:'恢复默认顺序',exact:true}).click();
  await page.locator('#nav [data-page="assistant"]').click();
  // The test provider is provisioned without exposing any real credentials.
  await expect(page.locator('#nav')).toBeVisible();
 await page.evaluate(async()=>fetch('/api/providers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Chat test',baseUrl:'https://example.com/v1',model:'test',format:'openai',apiKey:'test-only'})}));
  await page.reload();
  await page.getByLabel('发给时间管家').fill('记下一个灵感');
  const before=await page.evaluate(async()=> (await (await fetch('/api/state')).json()).ideas.length);
  await page.getByRole('button',{name:'发送并执行 ↗',exact:true}).click();
  await expect(page.locator('.assistant-log')).toContainText('新增：对话测试灵感');
  expect(await page.evaluate(async()=> (await (await fetch('/api/state')).json()).ideas.length)).toBe(before+1);
  await page.getByRole('button',{name:'撤销最近一次修改',exact:true}).click();
  await expect(page.locator('.assistant-log')).toContainText('已撤销最近一次修改');
  expect(await page.evaluate(async()=> (await (await fetch('/api/state')).json()).ideas.length)).toBe(before);
});


test('assistant projects and conversations persist across reload with provenance',async({page})=>{
 await page.goto('/');
 await page.getByRole('textbox',{name:'密码',exact:true}).fill('UI-test-password-123');
 await page.getByRole('button',{name:/进入我的空间/}).click();
 await expect(page.locator('#nav')).toBeVisible();
 await page.evaluate(async()=>fetch('/api/providers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Project test',baseUrl:'https://example.com/v1',model:'test',format:'openai',apiKey:'test-only'})}));
 await page.reload();
 await page.locator('#nav [data-page="assistant"]').click();
 await expect(page.locator('#thread-new')).toBeVisible();
 await page.getByRole('button',{name:'＋ 新建项目',exact:true}).click();
 await page.getByLabel('项目名称',{exact:true}).fill('数电学习');
 await page.getByLabel('项目说明',{exact:true}).fill('先帮我理解概念，再整理作业。');
 await page.getByRole('button',{name:'保存项目',exact:true}).click();
 await page.getByRole('button',{name:'＋ 新建对话',exact:true}).click();
 await page.getByLabel('发给时间管家').fill('数电作业9.15 23.59分截止');
 await page.getByRole('button',{name:'发送并执行 ↗',exact:true}).click();
 await expect(page.locator('.assistant-log')).toContainText('推断：所属项目根据对话暂定');
 await page.reload();
 await expect(page.locator('.assistant-log')).toContainText('数电作业9.15 23.59分截止');
 await expect(page.locator('.assistant-log')).toContainText('推断：所属项目根据对话暂定');
 await page.getByRole('button',{name:'＋ 新建对话',exact:true}).click();
 await expect(page.locator('.assistant-log .chat-message')).toHaveCount(0);
 await page.locator('[data-thread]').filter({hasText:'数电作业9.15'}).click();
 await expect(page.locator('.assistant-log')).toContainText('数电作业9.15 23.59分截止');
 await page.locator('#project-filter').selectOption({label:'数电学习'});
 await page.getByRole('button',{name:'编辑项目',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'项目说明',exact:true})).toHaveValue('先帮我理解概念，再整理作业。');
 await page.getByRole('button',{name:'关闭',exact:true}).click();
 await page.screenshot({path:'test-output/assistant-projects.png',fullPage:true,animations:'disabled'});
});


test('Harness engine selection and streamed response render with API fallback',async({page})=>{
 await page.route('**/api/harness',route=>route.fulfill({json:{available:true,version:'0.1.0-rc.5'}}));
 await page.goto('/');await page.getByRole('textbox',{name:'密码',exact:true}).fill('UI-test-password-123');await page.getByRole('button',{name:/进入我的空间/}).click();await expect(page.locator('#nav')).toBeVisible();
 await page.request.post('/api/providers',{data:{name:'Stream fixture',baseUrl:'https://example.com/v1',model:'test',format:'openai',apiKey:'fixture'}});
 await page.reload();await page.locator('#nav [data-page="assistant"]').click();
 await page.getByRole('button',{name:'＋ 新建对话',exact:true}).click();
 await page.locator('#chat-engine').selectOption('harness');
 await expect(page.getByText(/Harness 已就绪/)).toBeVisible();
 await page.route('**/api/ai/chat',async route=>{
  const body=route.request().postDataJSON();expect(body.engine).toBe('harness');
  const response=await route.fetch({postData:JSON.stringify({...body,engine:'api'})});const data=await response.json();
  await route.fulfill({contentType:'application/x-ndjson',body:[{type:'status',text:'Harness 已连接'},{type:'text',text:'正在整理'},{type:'result',data}].map(x=>JSON.stringify(x)).join('\n')+'\n'});
 });
 await page.getByLabel('发给时间管家').fill('记录流式测试灵感');await page.getByRole('button',{name:'发送并执行 ↗',exact:true}).click();await expect(page.locator('.assistant-log')).toContainText('新增：对话测试灵感');
 await expect(page.locator('.assistant-log').getByRole('link',{name:'资料来源'})).toHaveAttribute('href','https://example.com/article');
 await page.locator('#chat-engine').selectOption('api');await expect(page.getByText('使用当前 API 直接处理事项')).toBeVisible();
});


test('idea bubbles persist appearance, follow data and respect privacy and motion',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await page.getByRole('textbox',{name:'密码',exact:true}).fill('UI-test-password-123');await page.getByRole('button',{name:/进入我的空间/}).click();await expect(page.locator('#nav')).toBeVisible();
 const state=await (await page.request.get('/api/state')).json();
 state.ideas=[{id:'bubble-fixture',text:'做一个会发光的学习地图 <script>test</script>',project:'',createdAt:new Date().toISOString()}];
 expect((await page.request.put('/api/state',{data:state})).ok()).toBeTruthy();
 await page.reload();await expect(page.locator('.idea-bubble')).toHaveCount(1);
 await expect(page.locator('.idea-bubble')).toContainText('<script>test</script>');
 await expect(page.locator('#idea-bubbles script')).toHaveCount(0);
 await page.locator('.settings-nav').click();
 for(const [name,value] of Object.entries({size:'140',opacity:'75',fontSize:'28',fontOpacity:'85',color:'#9988aa',fontColor:'#abcdef'})){
  await page.locator(`#bubble-settings [name="${name}"]`).evaluate((input,value)=>{input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));},value);
 }
 await expect(page.locator('#idea-bubbles')).toHaveCSS('--bubble-width','336px');
 await expect(page.locator('.idea-bubble span')).toHaveCSS('font-size','28px');
 await page.reload();await expect(page.locator('#bubble-size')).toHaveValue('140');
 await expect(page.locator('#bubble-settings [name=color]')).toHaveValue('#9988aa');
 await page.locator('#appearance-form [name=mode]').selectOption('dark');
 await expect(page.locator('#idea-bubbles')).toHaveAttribute('data-three-d','on');
 await expect(page.locator('.bubble-face')).toHaveCSS('animation-name','bubble-rock');
 await page.locator('#bubble-depth').evaluate(input=>{input.value='80';input.dispatchEvent(new Event('input',{bubbles:true}));});
 await expect(page.locator('.bubble-preview')).toHaveCSS('--bubble-depth','0.8');
 await page.locator('.bubble-preview').scrollIntoViewIfNeeded();await page.screenshot({path:'test-output/idea-bubbles-3d.png'});
 await page.locator('#bubble-settings [name=threeD]').uncheck();await expect(page.locator('.bubble-face')).toHaveCSS('animation-name','none');
 await page.reload();await expect(page.locator('#bubble-settings [name=threeD]')).not.toBeChecked();await expect(page.locator('#bubble-depth')).toHaveValue('80');
 await page.locator('#bubble-settings [name=threeD]').check();
 await page.locator('#bubble-settings [name=placement]').selectOption('foreground');
 await expect(page.locator('#idea-bubbles')).toHaveCSS('z-index','30');
 for(const direction of ['left','right','up','down']){
  await page.locator('#bubble-settings [name=direction]').selectOption(direction);
  await expect(page.locator('.idea-bubble')).toHaveCSS('animation-name',`idea-${direction}`);
 }
 await page.locator('#bubble-speed').evaluate(input=>{input.value='200';input.dispatchEvent(new Event('input',{bubbles:true}));});
 const duration=await page.locator('.idea-bubble').evaluate(el=>parseFloat(getComputedStyle(el).animationDuration));expect(duration).toBeGreaterThanOrEqual(18);expect(duration).toBeLessThanOrEqual(32);
 await page.reload();await expect(page.locator('#bubble-settings [name=placement]')).toHaveValue('foreground');
 await expect(page.locator('#bubble-settings [name=direction]')).toHaveValue('down');await expect(page.locator('#bubble-speed')).toHaveValue('200');
 await page.emulateMedia({reducedMotion:'reduce'});
 await expect(page.locator('.idea-bubble')).toHaveCSS('animation-name','none');
 await expect(page.locator('#idea-bubbles')).toHaveCSS('pointer-events','none');
 await page.screenshot({path:'test-output/idea-bubbles-dark.png',fullPage:false});
 await page.locator('#nav [data-page=assistant]').click();await expect(page.locator('#idea-bubbles')).toHaveClass(/focus-faded/);
 await page.locator('.settings-nav').click();await page.locator('#bubble-settings [name=autoFade]').uncheck();
 await page.locator('#nav [data-page=assistant]').click();await expect(page.locator('#idea-bubbles')).not.toHaveClass(/focus-faded/);
 await page.locator('.settings-nav').click();await page.reload();await expect(page.locator('#bubble-settings [name=autoFade]')).not.toBeChecked();
 await page.locator('[data-bubble-preset=float]').click();await expect(page.locator('#bubble-speed')).toHaveValue('85');
 await page.locator('#nav [data-page=ideas]').click();await page.locator('[data-action=edit-idea]').first().click();
 await page.locator('#idea-form [name=showBubble]').uncheck();await page.getByRole('button',{name:'保存灵感',exact:true}).click();await expect(page.locator('.idea-bubble')).toHaveCount(0);
 await page.locator('[data-action=edit-idea]').first().click();await page.locator('#idea-form [name=showBubble]').check();await page.getByRole('button',{name:'保存灵感',exact:true}).click();await expect(page.locator('.idea-bubble')).toHaveCount(1);
 await page.locator('.settings-nav').click();
 await page.locator('#bubble-settings [name=enabled]').uncheck();await expect(page.locator('#idea-bubbles')).toBeHidden();
 await page.locator('#bubble-settings [name=enabled]').check();
 await page.setViewportSize({width:390,height:844});await page.locator('#nav [data-page=ideas]').click();
 await expect(page.locator('.idea-bubble')).toHaveCount(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.screenshot({path:'test-output/idea-bubbles-mobile.png',fullPage:false});
 const scatterState=await (await page.request.get('/api/state')).json();scatterState.ideas=Array.from({length:6},(_,i)=>({id:`scatter-${i}`,text:`分散灵感 ${i}`,project:'',createdAt:new Date().toISOString()}));await page.request.put('/api/state',{data:scatterState});await page.reload();await expect(page.locator('.idea-bubble')).toHaveCount(3);
 const lanes=await page.locator('.idea-bubble').evaluateAll(nodes=>nodes.map(x=>x.style.getPropertyValue('--bubble-lane')));expect(new Set(lanes).size).toBe(3);
 const before=await page.locator('.idea-bubble').first().evaluate(x=>x.style.getPropertyValue('--bubble-lane'));
 await page.locator('.idea-bubble').first().evaluate(x=>x.dispatchEvent(new Event('animationiteration')));
 expect(await page.locator('.idea-bubble').first().evaluate(x=>x.style.getPropertyValue('--bubble-lane'))).not.toBe(before);
 const updated=await (await page.request.get('/api/state')).json();updated.ideas=[];await page.request.put('/api/state',{data:updated});
 await page.reload();await expect(page.locator('.idea-bubble')).toHaveCount(0);
 await page.setViewportSize({width:1440,height:1000});await page.locator('#logout').click();
 await expect(page.locator('#login')).toBeVisible();await expect(page.locator('#idea-bubbles')).toBeHidden();expect(errors).toEqual([]);
});


test('customization workbench explains missing environment and supports mobile',async({page})=>{
 await page.goto('/');await page.getByRole('textbox',{name:'密码',exact:true}).fill('UI-test-password-123');await page.getByRole('button',{name:/进入我的空间/}).click();await expect(page.locator('#nav')).toBeVisible();
 await page.route('**/api/development/status',r=>r.fulfill({json:{allowed:true,available:false,activeId:null,harness:{available:true},docker:{available:false,message:'Docker 未安装'}}}));
 await page.locator('.settings-nav').click();await page.getByRole('button',{name:'打开定制工作台 ↗'}).click();
 await expect(page.locator('#dev-environment')).toContainText('Docker 未安装');await expect(page.locator('#dev-start')).toBeDisabled();
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await page.screenshot({path:'test-output/customize-mobile.png',fullPage:true});
});

test('customization workbench submits request, reloads history and displays review and diff',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));let job=null;
 await page.goto('/');await page.getByRole('textbox',{name:'密码',exact:true}).fill('UI-test-password-123');await page.getByRole('button',{name:/进入我的空间/}).click();await expect(page.locator('#nav')).toBeVisible();
 await page.request.post('/api/providers',{data:{name:'Development fixture',baseUrl:'https://example.com/v1',model:'test',format:'openai',apiKey:'fixture'}});
 await page.route('**/api/development/**',async route=>{
  const url=new URL(route.request().url()),method=route.request().method();
  if(url.pathname.endsWith('/status'))return route.fulfill({json:{allowed:true,available:true,activeId:null,harness:{available:true},docker:{available:true}}});
  if(url.pathname.endsWith('/jobs')&&method==='POST'){
   const body=route.request().postDataJSON();expect(body.autoApply).toBe(false);expect(route.request().headers()['x-shixu-development']).toBe('1');
   job={id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',request:body.request,createdAt:new Date().toISOString(),phase:'ready',events:[{message:'实际测试通过'}],review:{approved:true,summary:'需求实现，未发现阻断问题'},changes:[{path:'public/example.js'}],logs:[{name:'test-1.log',text:'PASS fixture test'}]};return route.fulfill({status:202,json:{id:job.id}});
  }
  if(url.pathname.endsWith('/jobs'))return route.fulfill({json:job?[job]:[]});
  if(url.pathname.endsWith('/file'))return route.fulfill({json:{path:'public/example.js',before:'const count=1;',after:'const count=2;'}});
  if(url.pathname.endsWith('/apply'))job.phase='integrated';
  if(url.pathname.endsWith('/rollback'))job.phase='rolledBack';
  return route.fulfill({json:job});
 });
 await page.goto('/#customize');await page.reload();await expect(page.locator('#dev-start')).toBeEnabled();
 await page.getByLabel('开发需求',{exact:true}).fill('增加项目筛选');await page.getByLabel('通过测试和审查后').selectOption('review');await page.locator('#dev-start').click();
 await expect(page.locator('#dev-detail')).toContainText('候选版本已就绪');await page.reload();await expect(page.locator('#dev-detail')).toContainText('需求实现');
 await page.getByRole('button',{name:'public/example.js',exact:true}).click();await expect(page.locator('#dev-file-preview')).toContainText('const count=2;');
 await page.screenshot({path:'test-output/customize-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'整合此候选版本'}).click();await expect(page.locator('#dev-detail')).toContainText('已整合源码');
 await page.getByRole('button',{name:'恢复到本次修改前的源码'}).click();await expect(page.locator('#dev-detail')).toContainText('已恢复源码');expect(errors).toEqual([]);
});


test('release workbench opens isolated preview and requires explicit activation and restore',async({page})=>{
 await page.goto('/');await page.getByRole('textbox',{name:'密码',exact:true}).fill('UI-test-password-123');await page.getByRole('button',{name:/进入我的空间/}).click();await expect(page.locator('#nav')).toBeVisible();
 let preview=null,activated=false,restored=false;
 const job={id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',request:'前端候选试用',createdAt:new Date().toISOString(),phase:'ready',events:[],review:{approved:true,summary:'fixture review'},changes:[]};
 await page.route('**/api/development/**',async route=>{
  const pathname=new URL(route.request().url()).pathname;
  if(pathname.endsWith('/status'))return route.fulfill({json:{allowed:true,available:true,managed:true,harness:{available:true},docker:{available:true}}});
  if(pathname.endsWith('/runtime/restore')){expect(route.request().postDataJSON().confirm).toBe(true);restored=true;return route.fulfill({status:202,json:{message:'恢复已开始'}});}
  if(pathname.endsWith('/runtime'))return route.fulfill({json:{managed:true,local:true,phase:'running',previous:'previous',message:'当前运行版本已就绪'}});
  if(pathname.endsWith('/jobs'))return route.fulfill({json:[job]});
  if(pathname.endsWith('/preview')){preview={healthy:true,url:'http://preview-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.localhost:3199',password:'preview-fixture',expiresAt:Date.now()+1800000};return route.fulfill({json:{preview}});}
  if(pathname.endsWith('/activate')){expect(route.request().postDataJSON().confirm).toBe(true);activated=true;return route.fulfill({status:202,json:{message:'切换已开始'}});}
  return route.fulfill({json:{...job,preview}});
 });
 await page.goto('/#customize');await expect(page.locator('#dev-runtime-status')).toContainText('已就绪');await expect(page.getByRole('button',{name:'整合此候选版本'})).toHaveCount(0);
 await page.getByRole('button',{name:'启动试运行',exact:true}).click();await expect(page.getByRole('link',{name:'打开试运行版本 ↗'})).toHaveAttribute('href','http://preview-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.localhost:3199');
 const activate=page.getByRole('button',{name:'切换使用此版本'});await expect(activate).toBeDisabled();await page.locator('#dev-activate-confirm').check();await activate.click();expect(activated).toBe(true);
 const restore=page.getByRole('button',{name:'恢复上一个版本',exact:true});await expect(restore).toBeDisabled();await page.locator('#dev-restore-confirm').check();await restore.click();expect(restored).toBe(true);
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:'test-output/releases-mobile.png',fullPage:true});
});

test('customization setup requires consent, preserves progress on reload and resumes after restart',async({page})=>{
 let setup={allowed:true,supported:true,phase:'idle',message:'尚未运行配置向导',events:[],location:'C:/Shixu/.shixu-tools'};
 await page.goto('/');await page.getByRole('textbox',{name:'密码',exact:true}).fill('UI-test-password-123');await page.getByRole('button',{name:/进入我的空间/}).click();await expect(page.locator('#nav')).toBeVisible();
 await page.route('**/api/development/**',async route=>{
  const pathname=new URL(route.request().url()).pathname;
  if(pathname.endsWith('/status'))return route.fulfill({json:{allowed:true,available:false,harness:{available:false,error:'尚未准备'},docker:{available:false,message:'未安装'},setup}});
  if(pathname.endsWith('/setup')){
   if(route.request().method()==='POST'){expect(route.request().postDataJSON().consent).toBe(true);setup={...setup,phase:'running',message:'正在准备环境',events:[{message:'准备 WSL'}]};}
   return route.fulfill({json:setup});
  }
  return route.fulfill({json:[]});
 });
 await page.goto('/#customize');await page.reload();await expect(page.locator('#dev-setup-start')).toBeDisabled();
 await page.locator('#dev-setup-consent').check();await page.locator('#dev-setup-start').click();await expect(page.locator('#dev-setup')).toContainText('正在准备环境');
 await page.reload();await expect(page.locator('#dev-setup')).toContainText('正在准备环境');await expect(page.locator('#dev-setup-start')).toHaveCount(0);
 setup={...setup,phase:'restart',message:'请重启 Windows 后继续配置'};await page.reload();await expect(page.locator('#dev-setup-start')).toHaveText('继续配置 / 重试');
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await page.screenshot({path:'test-output/customize-setup-mobile.png',fullPage:true});
});


test('manual sync previews before writes, resolves conflicts, survives response loss and syncs deletion across origins',async({page,browser})=>{
 test.setTimeout(90000);
 const syncDir=`test-output/sync-ui-${Date.now()}`;const startRemote=()=>spawn(process.execPath,['server.mjs'],{stdio:'ignore',windowsHide:true,env:{...process.env,PORT:'3118',PUBLIC_ORIGIN:'http://localhost:3118',HOST:'127.0.0.1',DATA_DIR:syncDir,ADMIN_PASSWORD:'Sync-test-password-123'}});let remote=startRemote();
 try{
  let ready=false;for(let i=0;i<200;i++){try{if((await fetch('http://localhost:3118/healthz')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}expect(ready).toBe(true);
  await page.goto('/');await page.getByRole('button',{name:'无需登录，使用本地空间'}).click();await page.getByRole('button',{name:'打开 / 创建本地空间'}).click();await expect(page.locator('#sync-status')).toContainText('仅本地');
  await page.evaluate(async()=>{const {localAPI}=await import('/local-store.mjs');const s=await localAPI('/api/state');s.tasks.push({id:'sync-task',title:'本地作业',kind:'homework',status:'todo',minutes:60});await localAPI('/api/state',{method:'PUT',body:JSON.stringify(s)});});
  await page.locator('.settings-nav').click();await page.locator('#sync-connect summary').click();await page.getByLabel('同步服务器地址',{exact:true}).fill('http://localhost:3118');await page.getByLabel('服务器密码',{exact:true}).fill('Sync-test-password-123');await page.getByRole('button',{name:'连接服务器',exact:true}).click();await expect(page.locator('#sync-message')).toContainText('连接成功');expect(await page.getByLabel('服务器密码',{exact:true}).inputValue()).toBe('');
  const remoteState=()=>page.evaluate(async()=>{const {readSyncProfile}=await import('/local-store.mjs');const {syncRequest}=await import('/sync-client.mjs');const p=await readSyncProfile('http://localhost:3118');return (await syncRequest(p.origin,'/state',undefined,p.token)).state;});
  expect((await remoteState()).tasks).toHaveLength(0);
  await page.locator('#sync-preview').click();await expect(page.locator('#sync-preview-panel')).toContainText('本地作业');await expect(page.locator('#sync-apply')).toBeDisabled();expect((await remoteState()).tasks).toHaveLength(0);
  await page.locator('#sync-confirm').check();await page.locator('#sync-apply').click();await expect(page.locator('#sync-last')).toContainText('上次同步');expect((await remoteState()).tasks[0].title).toBe('本地作业');
  // Second independent browser/device connects to the same remote server.
  const other=await browser.newContext();const second=await other.newPage();await second.goto('http://localhost:3098/');
  await second.evaluate(async()=>{const {initializeLocal}=await import('/local-store.mjs');const {connectServer,previewSync,applySync}=await import('/sync-client.mjs');await initializeLocal();const origin=await connectServer('http://localhost:3118','student','Sync-test-password-123');await applySync(await previewSync(origin),'download',{});});
  await page.evaluate(async()=>{const {localAPI}=await import('/local-store.mjs');const s=await localAPI('/api/state');s.tasks[0].title='电脑修改';await localAPI('/api/state',{method:'PUT',body:JSON.stringify(s)});});
  await second.evaluate(async()=>{const {localAPI}=await import('/local-store.mjs');const {previewSync,applySync}=await import('/sync-client.mjs');const s=await localAPI('/api/state');s.tasks[0].title='手机修改';await localAPI('/api/state',{method:'PUT',body:JSON.stringify(s)});await applySync(await previewSync('http://localhost:3118'),'merge',{});});
  await page.locator('#sync-preview').click();await expect(page.locator('.sync-conflict')).toContainText('电脑修改');await page.locator('#sync-confirm').check();await expect(page.locator('#sync-apply')).toBeDisabled();await page.locator('[data-sync-choice]').selectOption('local');await page.locator('#sync-confirm').check();
  // Let the server commit, then drop its response: pending operation must survive a reload.
  let lost=false;await page.route('http://localhost:3118/api/sync/v1/commit',async route=>{if(!lost){lost=true;await route.fetch();await route.abort('failed');}else await route.continue();});
  await page.locator('#sync-apply').click();await expect(page.locator('#sync-retry')).toBeVisible();const committed=await remoteState();expect(committed.tasks[0].title).toBe('电脑修改');
  await page.evaluate(async()=>{const {localAPI}=await import('/local-store.mjs');const state=await localAPI('/api/state');state.ideas.push({id:'while-pending',text:'等待同步期间的新灵感',createdAt:new Date().toISOString()});await localAPI('/api/state',{method:'PUT',body:JSON.stringify(state)});});
  await new Promise(resolve=>{remote.once('exit',resolve);remote.kill();});remote=startRemote();for(let i=0;i<200;i++){try{if((await fetch('http://localhost:3118/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  await page.reload();await expect(page.locator('#sync-retry')).toBeVisible();await page.locator('#sync-retry').click();await expect(page.locator('#sync-retry')).toBeHidden();expect((await remoteState()).revision).toBe(committed.revision);expect(await page.evaluate(async()=>{const {readLocal}=await import('/local-store.mjs');return (await readLocal()).ideas.some(i=>i.id==='while-pending');})).toBe(true);
  await page.evaluate(async()=>{const {localAPI}=await import('/local-store.mjs');const {previewSync,applySync}=await import('/sync-client.mjs');const s=await localAPI('/api/state');s.tasks=[];await localAPI('/api/state',{method:'PUT',body:JSON.stringify(s)});await applySync(await previewSync('http://localhost:3118'),'merge',{});});
  const conflict=await second.evaluate(async()=>{const {previewSync,resolvePreview}=await import('/sync-client.mjs');const p=await previewSync('http://localhost:3118');return resolvePreview(p,'merge').conflicts.length;});
  expect(conflict).toBe(0);const count=await second.evaluate(async()=>{const {previewSync,applySync}=await import('/sync-client.mjs');return (await applySync(await previewSync('http://localhost:3118'),'merge',{})).tasks.length;});expect(count).toBe(0);expect((await remoteState()).tasks).toHaveLength(0);
  await other.close();await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await page.screenshot({path:'test-output/manual-sync-mobile.png',fullPage:true});
 }finally{remote.kill();}
});


test('automatic sync is opt-in, shows pending changes, runs from app and pauses on conflict',async({page,context})=>{
 test.setTimeout(90000);
 const remote=spawn(process.execPath,['server.mjs'],{stdio:'ignore',windowsHide:true,env:{...process.env,PORT:'3120',PUBLIC_ORIGIN:'http://localhost:3120',HOST:'127.0.0.1',DATA_DIR:`test-output/auto-sync-${Date.now()}`,ADMIN_PASSWORD:'Auto-test-password-123'}});
 try{
  for(let i=0;i<200;i++){try{if((await fetch('http://localhost:3120/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  await page.goto('/');await page.getByRole('button',{name:'无需登录，使用本地空间'}).click();await page.getByRole('button',{name:'打开 / 创建本地空间'}).click();await expect(page.locator('#sync-status')).toContainText('仅本地');
  await page.evaluate(async()=>{const {connectServer}=await import('/sync-client.mjs');await connectServer('http://localhost:3120','student','Auto-test-password-123');});
  await page.locator('.settings-nav').click();await expect(page.locator('#sync-auto')).not.toBeChecked();await expect(page.locator('#sync-auto')).toBeDisabled();
  await page.evaluate(async()=>{const {previewSync,applySync}=await import('/sync-client.mjs');await applySync(await previewSync('http://localhost:3120'),'merge',{});});await page.reload();await expect(page.locator('#sync-auto')).toBeEnabled();
  await page.evaluate(async()=>{const {localAPI}=await import('/local-store.mjs');const s=await localAPI('/api/state');s.tasks.push({id:'automatic-task',title:'自动同步作业',kind:'homework',status:'todo',minutes:30});await localAPI('/api/state',{method:'PUT',body:JSON.stringify(s)});});
  await expect(page.locator('#sync-pending-count')).toContainText('本地待同步：1 项',{timeout:10000});await page.locator('#sync-auto').check();await expect(page.locator('#sync-auto-status')).toContainText('自动目标');
  const remoteState=()=>page.evaluate(async()=>{const {readSyncProfile}=await import('/local-store.mjs');const {syncRequest}=await import('/sync-client.mjs');const p=await readSyncProfile('http://localhost:3120');return (await syncRequest(p.origin,'/state',undefined,p.token)).state;});
  expect((await remoteState()).tasks).toHaveLength(0);
  await page.locator('nav [data-page="tasks"]').click();await page.evaluate(()=>window.dispatchEvent(new Event('online')));
  await expect.poll(async()=>(await remoteState()).tasks.length,{timeout:15000}).toBe(1);
  const revision=(await remoteState()).revision;const unchanged=await page.evaluate(async()=>{const {autoSyncOnce}=await import('/auto-sync.mjs');return (await autoSyncOnce()).kind;});expect(unchanged).toBe('unchanged');expect((await remoteState()).revision).toBe(revision);
  await page.locator('.settings-nav').click();await page.locator('#sync-auto').uncheck();await expect(page.locator('#sync-auto-status')).toContainText('已关闭');
  await page.evaluate(async()=>{const {localAPI}=await import('/local-store.mjs');const s=await localAPI('/api/state');s.tasks[0].title='未授权上传的修改';await localAPI('/api/state',{method:'PUT',body:JSON.stringify(s)});});
  expect(await page.evaluate(async()=>{const {autoSyncOnce}=await import('/auto-sync.mjs');return (await autoSyncOnce()).kind;})).toBe('skipped');expect((await remoteState()).tasks[0].title).toBe('自动同步作业');
  await page.evaluate(async()=>{const {readSyncProfile}=await import('/local-store.mjs');const {syncRequest}=await import('/sync-client.mjs');const p=await readSyncProfile('http://localhost:3120');const {state}=await syncRequest(p.origin,'/state',undefined,p.token);state.tasks[0].title='服务器另一处修改';await syncRequest(p.origin,'/commit',{deviceId:crypto.randomUUID(),operationId:crypto.randomUUID(),instanceId:p.instanceId,revision:state.revision,data:state},p.token);});
  await page.locator('#sync-auto').check();expect(await page.evaluate(async()=>{const {autoSyncOnce}=await import('/auto-sync.mjs');return (await autoSyncOnce()).kind;})).toBe('conflict');await expect(page.locator('#sync-auto-status')).toContainText('冲突',{timeout:10000});expect((await remoteState()).tasks[0].title).toBe('服务器另一处修改');
  await page.locator('#sync-preview').click();await page.locator('[data-sync-choice]').selectOption('local');await page.locator('#sync-confirm').check();await page.locator('#sync-apply').click();await expect(page.locator('#sync-auto-status')).toContainText('最近一次同步已完成');
  const duplicate=await page.evaluate(async()=>{const {previewSync,retrySync}=await import('/sync-client.mjs');const {prepareSync}=await import('/local-store.mjs');const p=await previewSync('http://localhost:3120');await prepareSync(p.origin,p,p.local);const replies=await Promise.all([retrySync(p.origin),retrySync(p.origin)]);return replies.map(r=>r.revision);});expect(duplicate[0]).toBe(duplicate[1]);
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await page.locator('#manual-sync').screenshot({path:'test-output/auto-sync-mobile.png'});
 }finally{remote.kill();}
});

test('invitation registration and optional automatic login on mobile',async({page,browser})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const admin=await browser.newContext();
 try{
  const login=await admin.request.post('http://localhost:3098/api/login',{data:{username:'student',password:'UI-test-password-123'}});expect(login.ok()).toBeTruthy();
  const policy=await(await admin.request.get('http://localhost:3098/api/registration')).json();
  await page.setViewportSize({width:390,height:844});await page.goto('/');
  await page.getByRole('button',{name:'创建个人账户',exact:true}).click();
  const form=page.locator('#register-form'),username='friend_'+Date.now();
  await form.getByLabel('用户名',{exact:true}).fill(username);
  await form.getByLabel('密码',{exact:true}).fill('Friend-test-password-123');
  await form.getByLabel('再次输入密码').fill('Friend-test-password-123');
  await form.getByLabel('邀请码').fill(policy.code);
  await form.getByRole('button',{name:'注册并进入我的空间'}).click();
  await expect(page.locator('#shell')).toBeVisible();await expect(page.locator('#task-count')).toHaveText('0');
  let cookie=(await page.context().cookies()).find(c=>c.name==='session');expect(cookie.expires).toBe(-1);
  await page.locator('.settings-nav').click();await expect(page.locator('#view')).toContainText(username);
  await expect(page.locator('#manage-registration')).toHaveCount(0);
  await page.locator('#account-logout').click();await expect(page.locator('#login')).toBeVisible();
  await page.locator('#login-form [name=password]').fill('Friend-test-password-123');
  await page.locator('#login-form').getByLabel('自动登录（30 天）').check();await page.getByRole('button',{name:/进入我的空间/}).click();
  await expect(page.locator('#shell')).toBeVisible();
  cookie=(await page.context().cookies()).find(c=>c.name==='session');expect(cookie.expires).toBeGreaterThan(Date.now()/1000+29*86400);
  await page.reload();await expect(page.locator('#shell')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();expect(errors).toEqual([]);
 }finally{await admin.close();}
});
