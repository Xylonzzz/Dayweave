import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {files,safePath} from '../development/workspace.mjs';
if(process.platform!=='win32'||process.arch!=='x64')throw Error('此构建脚本需要 Windows x64');
const root=path.resolve(import.meta.dirname,'..'),version=JSON.parse(fs.readFileSync(path.join(root,'package.json'))).version;
const output=path.join(root,'dist',`Shixu-${version}-windows-x64-${Date.now()}`),app=path.join(output,'app');fs.mkdirSync(app,{recursive:true});
for(const name of files(root)){const target=path.join(app,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(safePath(root,name),target);}
fs.mkdirSync(path.join(output,'runtime'));fs.copyFileSync(process.execPath,path.join(output,'runtime/node.exe'));
fs.cpSync(path.join(path.dirname(process.execPath),'node_modules/npm'),path.join(output,'runtime/node_modules/npm'),{recursive:true});
fs.writeFileSync(path.join(output,'runtime/NODE-LICENSE.txt'),spawnSync(process.execPath,['--license'],{encoding:'utf8',windowsHide:true}).stdout);
fs.mkdirSync(path.join(output,'desktop'));fs.copyFileSync(path.join(root,'desktop/bootstrap.mjs'),path.join(output,'desktop/bootstrap.mjs'));
const npm=path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');const installed=spawnSync(process.execPath,[npm,'ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund','--cache',path.join(root,'.npm-cache')],{cwd:app,stdio:'inherit',windowsHide:true});if(installed.status!==0)throw Error('安装随包依赖失败');
const compiler=path.join(process.env.WINDIR,'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
const processInfo=spawnSync(compiler,['/nologo','/target:exe','/platform:x64','/optimize+','/reference:System.Web.Extensions.dll','/reference:System.Management.dll','/out:'+path.join(output,'runtime/ProcessInfo.exe'),path.join(root,'desktop/ProcessInfo.cs')],{encoding:'utf8',windowsHide:true});if(processInfo.status!==0)throw Error(processInfo.stdout+processInfo.stderr);
const result=spawnSync(compiler,['/nologo','/target:winexe','/platform:x64','/optimize+','/reference:System.Windows.Forms.dll','/reference:System.Drawing.dll','/reference:System.Web.Extensions.dll','/out:'+path.join(output,'时序.exe'),'/win32icon:'+path.join(root,'public/desktop.ico'),path.join(root,'desktop/Shixu.cs')],{encoding:'utf8',windowsHide:true});if(result.status!==0)throw Error(result.stdout+result.stderr);
fs.writeFileSync(path.join(output,'使用说明.txt'),'双击 时序.exe。首次启动会在 %LOCALAPPDATA%\\Shixu 中准备可定制源码和个人数据。\r\n请保留此文件夹中的 app、runtime、desktop；EXE 不能单独移动。可以为 EXE 创建桌面快捷方式。\r\n已有 localhost:3088 服务时优先打开原空间；独立桌面空间使用 localhost:3090。\r\n日常使用无需另装 Node 或 Docker。AI 开发在设置中按需准备环境。\r\n关闭启动器后后台服务继续运行；停止桌面后台服务按钮只停止它自己的空间。\r\n首次迁移请先在旧版创建完整备份，再选择首次导入；不迁移浏览器 IndexedDB 数据。\r\n该本地测试版尚未代码签名，也未经过全新电脑安装验收。\r\n');
console.log('PACKAGED '+output);
fs.copyFileSync(path.join(root,'desktop/install.ps1'),path.join(output,'desktop/install.ps1'));
fs.copyFileSync(path.join(root,'desktop/ShellLink.cs'),path.join(output,'desktop/ShellLink.cs'));
for(const [name,action] of [['Install.cmd','Install'],['Uninstall.cmd','Uninstall']]){
 fs.writeFileSync(path.join(output,name),`@echo off\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0desktop\\install.ps1" -Action ${action}\r\nif errorlevel 1 echo Operation failed. Read the message above.\r\npause\r\n`);
}
const manifest={id:path.basename(output),files:[]};
function inventory(folder,prefix='') {for(const entry of fs.readdirSync(folder,{withFileTypes:true})) {const name=prefix+entry.name,file=path.join(folder,entry.name);if(entry.isDirectory())inventory(file,name+'/');else manifest.files.push({path:name,sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')});}}
inventory(output);fs.writeFileSync(path.join(output,'package-manifest.json'),JSON.stringify(manifest,null,2));
const archive=output+'.zip';
const zipped=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'desktop/archive.ps1'),'-Source',output,'-Destination',archive],{encoding:'utf8',windowsHide:true});if(zipped.status!==0)throw Error(zipped.stdout+zipped.stderr);
fs.writeFileSync(archive+'.sha256',crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex')+'  '+path.basename(archive)+'\n');
fs.writeFileSync(path.join(root,'dist/latest.json'),JSON.stringify({output,version,node:process.version,exe:path.join(output,'时序.exe'),archive},null,2));
console.log('ARCHIVE '+archive);
