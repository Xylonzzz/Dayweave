import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {build,Platform,Arch} from 'electron-builder';
import {files,safePath,digest} from '../development/workspace.mjs';
const root=path.resolve(import.meta.dirname,'..');
const source=JSON.parse(fs.readFileSync(path.join(root,'dist/latest.json'))).output;
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json')));
const sourceDigest=digest(root);
const old=JSON.parse(fs.readFileSync(path.join(source,'app/package.json')));
if(JSON.stringify(pkg.dependencies)!==JSON.stringify(old.dependencies)||JSON.stringify(pkg.overrides)!==JSON.stringify(old.overrides))throw Error('生产依赖已变化，请先运行 build:windows');
const staging=path.join(root,'dist','window-build-'+Date.now()),payload=path.join(staging,'payload'),app=path.join(staging,'shell');
fs.mkdirSync(payload,{recursive:true});fs.mkdirSync(app);
for(const dir of ['app','runtime'])fs.cpSync(path.join(source,dir),path.join(payload,dir),{recursive:true});
for(const name of files(root)){const target=path.join(payload,'app',name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(safePath(root,name),target);}
fs.mkdirSync(path.join(payload,'desktop'));fs.copyFileSync(path.join(root,'desktop/bootstrap.mjs'),path.join(payload,'desktop/bootstrap.mjs'));
fs.copyFileSync(path.join(root,'desktop/window.mjs'),path.join(app,'main.mjs'));
fs.writeFileSync(path.join(app,'package.json'),JSON.stringify({name:'shixu-desktop',version:pkg.version,description:'时序学生时间管理',author:'Shixu contributors',main:'main.mjs',type:'module',private:true}));
const output=path.join(staging,'release');
const artifacts=await build({targets:Platform.WINDOWS.createTarget(['nsis'],Arch.x64),projectDir:root,publish:'never',config:{
 appId:'org.shixu.planner.desktop',productName:'时序',electronVersion:pkg.devDependencies.electron,
 directories:{app,output},files:['main.mjs','package.json','!node_modules/**/*'],asar:true,npmRebuild:false,
 extraResources:[{from:payload,to:'payload',filter:['**/*']}],
 win:{target:['nsis'],icon:path.join(root,'public/icon-512.png'),signExecutable:false},
 nsis:{oneClick:false,perMachine:false,allowToChangeInstallationDirectory:true,createDesktopShortcut:true,createStartMenuShortcut:true,shortcutName:'时序独立窗口',deleteAppDataOnUninstall:false,runAfterFinish:false,artifactName:'Shixu-Setup-${version}.${ext}',installerLanguages:['zh_CN','en_US']},
 }});
const installer=artifacts.find(file=>file.endsWith('.exe')&&!file.includes('uninstaller'));
if(!installer)throw Error('没有生成安装 EXE');
fs.writeFileSync(installer+'.sha256',crypto.createHash('sha256').update(fs.readFileSync(installer)).digest('hex')+'  '+path.basename(installer)+'\n');
if(JSON.stringify(sourceDigest)!==JSON.stringify(digest(root)))throw Error('构建期间源码发生变化，请重新打包');
fs.writeFileSync(path.join(root,'dist/latest-installer.json'),JSON.stringify({installer,unpacked:path.join(output,'win-unpacked'),payload,version:pkg.version,sourceDigest},null,2));
console.log('INSTALLER '+installer);
