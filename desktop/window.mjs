import {app,BrowserWindow,Menu,dialog,clipboard,shell,session,Tray,nativeImage} from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';

const testing=process.env.SHIXU_SHELL_TEST==='1';
if(process.env.SHIXU_WINDOW_HOME)app.setPath('userData',process.env.SHIXU_WINDOW_HOME);
const bundle=app.isPackaged?path.join(process.resourcesPath,'payload'):process.env.SHIXU_TEST_BUNDLE;
const home=process.env.SHIXU_DESKTOP_HOME||path.join(process.env.LOCALAPPDATA,'Shixu');
let window,tray,quitting=false;
app.on('before-quit',()=>{quitting=true;});
const reveal=()=>{if(window&&!window.isDestroyed()){if(window.isMinimized())window.restore();window.show();window.focus();}};
async function run(action,arg) {
 return new Promise((resolve,reject)=>{
  const child=spawn(path.join(bundle,'runtime/node.exe'),[path.join(bundle,'desktop/bootstrap.mjs'),action,...(arg?[arg]:[])],{cwd:bundle,env:process.env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let output='',error='';child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>error+=x);child.once('error',reject);child.once('close',code=>{try{const data=JSON.parse(output);if(code||data.error)throw Error(data.error||error);resolve(data);}catch(e){reject(e);}});
 });
}
async function guarded(action){try{await action();}catch(e){await dialog.showMessageBox(window,{type:'error',title:'时序',message:e.message});}}
async function independent(){
 if(!testing&&!fs.existsSync(path.join(home,'workspace','.desktop-ready.json'))){
  const {response}=await dialog.showMessageBox(window,{type:'question',title:'准备个人空间',message:'创建新空间，或先导入原版完整备份',detail:'浏览器中的离线数据需要单独导出 JSON，再在这里导入。已有服务端备份会保留原账号。',buttons:['创建新空间','导入完整备份','取消'],cancelId:2});
  if(response===2)return;
  if(response===1){const selected=await dialog.showOpenDialog(window,{title:'选择包含 planner.sqlite 和 secret.key 的备份目录',properties:['openDirectory']});if(selected.canceled)return;await run('import',selected.filePaths[0]);}
 }
 const state=await run('start');await window.loadURL(state.url);
}
function permitted(url){try{const u=new URL(url);return u.protocol==='https:'||(u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname));}catch{return false;}}
if(!app.requestSingleInstanceLock()){app.quit();}else{
 app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.show();window.focus();}});
 void app.whenReady().then(async()=>{
 session.defaultSession.setPermissionRequestHandler((webContents,permission,callback)=>callback(permission==='notifications'&&permitted(webContents.getURL())));
 const icon=path.join(bundle,'app/public/desktop.ico');
 window=new BrowserWindow({width:1320,height:900,minWidth:760,minHeight:560,title:'时序',icon,show:!testing,autoHideMenuBar:true,titleBarStyle:'hidden',titleBarOverlay:{color:'#f7f8f4',symbolColor:'#24382f',height:42},backgroundColor:'#f6f7f5',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,backgroundThrottling:false}});
 tray=new Tray(nativeImage.createFromPath(icon));tray.setToolTip('时序 · 正在后台运行');
 tray.setContextMenu(Menu.buildFromTemplate([{label:'打开时序',click:reveal},{label:'收起到后台',click:()=>window.hide()},{type:'separator'},{label:'退出时序并停止桌面独立服务',click:()=>guarded(async()=>{if(fs.existsSync(path.join(home,'desktop.json')))await run('stop');quitting=true;app.quit();})}]));
 tray.on('click',reveal);tray.on('double-click',reveal);
 window.on('close',event=>{if(!quitting){event.preventDefault();window.hide();}});
 window.webContents.on('did-finish-load',()=>{void window.webContents.executeJavaScript(`(()=>{
  document.documentElement.dataset.desktopVersion=${JSON.stringify(app.getVersion())};
  const version=document.getElementById('desktop-version');if(version)version.textContent=' · 桌面窗口 '+document.documentElement.dataset.desktopVersion;
  if(document.getElementById('desktop-titlebar'))return;
  const style=document.createElement('style');style.textContent='body{padding-top:44px}.sidebar{top:44px;height:calc(100dvh - 44px)}#desktop-titlebar{position:fixed;inset:0 0 auto;height:44px;display:flex;align-items:center;padding:0 18px;gap:9px;z-index:9999;background:var(--bg,#f7f8f4);color:var(--muted,#6f8178);font:12px "Segoe UI","Microsoft YaHei",sans-serif;-webkit-app-region:drag;border-bottom:0}#desktop-titlebar img{width:21px;height:21px}';document.head.append(style);
  const bar=document.createElement('div');bar.id='desktop-titlebar';const image=document.createElement('img');image.src='/icon.svg';image.alt='';bar.append(image,document.createTextNode('时序 · 给重要的事留时间'));document.body.prepend(bar);
 })()`).catch(()=>{});});
 const themeTimer=setInterval(async()=>{try{if(window.isDestroyed())return;const colors=await window.webContents.executeJavaScript(`({background:getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()||'#f7f8f4',ink:getComputedStyle(document.documentElement).getPropertyValue('--ink').trim()||'#24382f'})`);window.setTitleBarOverlay({color:colors.background,symbolColor:colors.ink,height:42});}catch{}},1000);themeTimer.unref();
 window.on('closed',()=>{clearInterval(themeTimer);tray?.destroy();});
 window.webContents.on('will-attach-webview',event=>event.preventDefault());
 window.webContents.on('will-navigate',(event,url)=>{if(!permitted(url))event.preventDefault();});
 window.webContents.on('will-redirect',(event,url)=>{if(!permitted(url))event.preventDefault();});
 window.webContents.setWindowOpenHandler(({url})=>{if(permitted(url))void shell.openExternal(url);return {action:'deny'};});
 Menu.setApplicationMenu(Menu.buildFromTemplate([
  {label:'时序',submenu:[
   {label:'打开桌面独立空间',click:()=>guarded(independent)},
   {label:'打开原版空间',click:()=>guarded(async()=>{const state=await run('existing');if(!state.running)throw Error('原版服务未运行');await window.loadURL(state.url);})},
   {label:'复制桌面空间首次登录信息',click:()=>guarded(async()=>{clipboard.writeText((await run('credentials')).text);await dialog.showMessageBox(window,{message:'首次登录信息已复制'});})},
   {label:'打开桌面数据文件夹',click:()=>guarded(async()=>{const state=await run('status');fs.mkdirSync(state.data,{recursive:true});await shell.openPath(state.data);})},
   {type:'separator'},
   {label:'停止桌面后台服务',click:()=>guarded(async()=>{await run('stop');await dialog.showMessageBox(window,{message:'桌面后台服务已停止'});})},
   {label:'收起到后台',click:()=>window.hide()},
   {role:'quit',label:'退出窗口（保留后台服务）'}]},
  {label:'编辑',submenu:[{role:'undo',label:'撤销'},{role:'redo',label:'重做'},{type:'separator'},{role:'cut',label:'剪切'},{role:'copy',label:'复制'},{role:'paste',label:'粘贴'},{role:'selectAll',label:'全选'}]},
  {label:'视图',submenu:[{role:'reload',label:'刷新'},{role:'resetZoom',label:'实际大小'},{role:'zoomIn',label:'放大'},{role:'zoomOut',label:'缩小'},{role:'togglefullscreen',label:'全屏'}]}
 ]));
 await window.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<html lang="zh"><body style="background:#f6f7f5;color:#283d35;font:20px system-ui;padding:12vh 10vw"><h1>时序</h1><p>正在准备你的空间…</p><p>首次启动需要复制运行文件，请稍候。</p></body></html>'));
 await guarded(async()=>{const state=testing?{running:false}:await run('existing');if(state.running)await window.loadURL(state.url);else await independent();});
 app.on('window-all-closed',()=>app.quit());
 }).catch(error=>{dialog.showErrorBox('时序启动失败',error.message);app.quit();});
}
