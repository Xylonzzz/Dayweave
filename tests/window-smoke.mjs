import { _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..');
const info=JSON.parse(fs.readFileSync(path.join(root,'dist/latest.json')));
const profile=path.join(root,'test-output','window-'+Date.now());
const env={...process.env,SHIXU_SHELL_TEST:'1',SHIXU_DESKTOP_HOME:profile,SHIXU_WINDOW_HOME:path.join(profile,'browser'),SHIXU_DESKTOP_PORT:'3196',SHIXU_TEST_BUNDLE:info.output};
delete env.ELECTRON_RUN_AS_NODE;
const executablePath=process.env.SHIXU_WINDOW_EXE;
const options={env,timeout:60000,...(executablePath?{executablePath,args:[]}:{args:[path.join(root,'desktop/window.mjs')]})};
function stop(){
 const bundle=executablePath?path.join(path.dirname(executablePath),'resources/payload'):info.output;
 const stopped=spawnSync(path.join(bundle,'runtime/node.exe'),[path.join(bundle,'desktop/bootstrap.mjs'),'stop'],{env,windowsHide:true,encoding:'utf8',timeout:20000});
 if(stopped.status!==0)throw Error(stopped.stdout+stopped.stderr);
}
let desktop;
try{
 desktop=await electron.launch(options);let page=await desktop.firstWindow();
 await page.getByRole('textbox',{name:'密码',exact:true}).waitFor({timeout:150000});
 const password=/初始密码：([^\r\n]+)/.exec(fs.readFileSync(path.join(profile,'data/bootstrap.txt'),'utf8'))[1];
 await page.getByRole('textbox',{name:'密码',exact:true}).fill(password);await page.getByRole('button',{name:/进入我的空间/}).click();await page.locator('#nav').waitFor();
 const preferences=await desktop.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences());
 assert.equal(preferences.nodeIntegration,false);assert.equal(preferences.contextIsolation,true);assert.equal(preferences.sandbox,true);
 assert.equal(await page.evaluate(()=>typeof process),'undefined');
 if(process.env.SHIXU_TEST_APPEARANCE==='1'){
  await page.evaluate(()=>{location.hash='#settings';});
  const primary=page.getByRole('textbox',{name:'主主题色（颜色代码）',exact:true});await primary.waitFor();
  await primary.fill('');await primary.pressSequentially('#405BC4');assert.equal(await primary.inputValue(),'#405BC4');
  await page.getByRole('textbox',{name:'辅主题色（颜色代码）',exact:true}).fill('rgb(229, 144, 120)');
  await page.getByRole('textbox',{name:'日期卡片背景（颜色代码）',exact:true}).fill('0#243445');
  await page.getByRole('textbox',{name:'日期卡片文字（颜色代码）',exact:true}).fill('#FFEEDD');
  await page.locator('#appearance-form select[name=mode]').selectOption('dark');
  if(process.env.SHIXU_TEST_THEMES==='1'){
   await page.getByRole('textbox',{name:'整体背景色（颜色代码）',exact:true}).fill('#20152A');
   await page.getByRole('textbox',{name:'主题名称',exact:true}).fill('我的紫色夜间');await page.locator('#theme-save').click();
   const preset=await page.evaluate(()=>JSON.parse(localStorage.getItem('shixu-theme-presets'))[0]);
   await page.locator('#theme-preset').selectOption('forest');
   assert.equal(await page.evaluate(()=>window.shixuAppearance.get().background),'#edf2ec');
   await page.locator('#theme-preset').selectOption(preset.id);
   assert.equal(await page.evaluate(()=>window.shixuAppearance.get().background),'#20152a');
   assert.equal(await page.evaluate(()=>window.shixuAppearance.get().mode),'dark');
  }
  if(process.env.SHIXU_TEST_MATERIALS==='1'){
   for(const material of ['solid','frosted','glass','acrylic','mica','paper']){
    await page.locator('#appearance-form select[name=material]').selectOption(material);
    await page.locator('#bubble-settings select[name=material]').selectOption(material);
    assert.equal(await page.locator('html').getAttribute('data-material'),material);
    assert.equal(await page.locator('.bubble-preview').getAttribute('data-material'),material);
    if(process.env.SHIXU_TEST_THEMES==='1')assert.equal(await page.locator('.topbar').evaluate(e=>getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0)');
   }
   await page.locator('#appearance-form select[name=material]').selectOption('glass');
   assert.equal(await page.locator('.bubble-sample').evaluate(e=>getComputedStyle(e).backdropFilter),'none','bubble paper material must not inherit page glass');
   assert.equal(await page.locator('.sidebar .brand-icon').evaluate(e=>getComputedStyle(e).borderTopWidth),'0px');
   assert.equal(await page.locator('#desktop-titlebar').evaluate(e=>getComputedStyle(e).borderBottomWidth),'0px');
  }
  await page.getByRole('textbox',{name:'气泡颜色（颜色代码）',exact:true}).fill('#AABBCC');
  const secondary=page.getByRole('textbox',{name:'辅主题色（颜色代码）',exact:true});await secondary.fill('invalid');
  assert.equal(await secondary.getAttribute('aria-invalid'),'true');
  assert.equal(await page.evaluate(()=>window.shixuAppearance.get().secondary),'#e59078');
  await page.evaluate(()=>{location.hash='#today';});await page.locator('.date-badge').waitFor();
  const badge=await page.locator('.date-badge').evaluate(e=>({bg:getComputedStyle(e).backgroundColor,ink:getComputedStyle(e.querySelector('b')).color}));
  assert.deepEqual(badge,{bg:'rgb(36, 52, 69)',ink:'rgb(255, 238, 221)'});
  await desktop.evaluate(({BrowserWindow})=>{BrowserWindow.getAllWindows()[0].close();});
  assert.equal(await desktop.evaluate(({BrowserWindow})=>({count:BrowserWindow.getAllWindows().length,visible:BrowserWindow.getAllWindows()[0].isVisible()})).then(x=>x.count===1&&!x.visible),true);
  await desktop.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].show());
 }
 await page.evaluate(()=>localStorage.setItem('window-smoke','persistent'));
 await page.evaluate(()=>window.scrollTo(0,0));
 await page.screenshot({path:path.join(root,'test-output/independent-window.png'),fullPage:true});
 // A detached Windows child can retain test-runner pipes: stop this test backend before closing the harness.
 stop();await desktop.close();desktop=await electron.launch(options);page=await desktop.firstWindow();await page.locator('#nav').waitFor({timeout:150000});
 assert.equal(await page.evaluate(()=>localStorage.getItem('window-smoke')),'persistent');
 if(process.env.SHIXU_TEST_THEMES==='1')assert.equal(await page.evaluate(()=>window.shixuAppearance.get().background),'#20152a');
 if(process.env.SHIXU_TEST_MATERIALS==='1'){
  assert.equal(await page.evaluate(()=>window.shixuAppearance.get().material),'glass');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('shixu-idea-bubbles')).material),'paper');
 }
 console.log('PASS: independent Electron window, real login, sandbox enabled, Node unavailable to pages, login and browser data persist after relaunch.');
}finally{
 stop();await desktop?.close();
}
