import {chromium} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const svg=fs.readFileSync(path.join(root,'public/app-icon.svg'),'utf8');
const browser=await chromium.launch({channel:'msedge',headless:true});
try{for(const size of [192,256,512]){
 const page=await browser.newPage({viewport:{width:size,height:size},deviceScaleFactor:1});
 await page.setContent(`<style>html,body{margin:0;background:transparent}svg{width:100vw;height:100vh;display:block}</style>${svg}`);
 const png=await page.screenshot({omitBackground:true});
 if(size!==256)fs.writeFileSync(path.join(root,`public/icon-${size}.png`),png);
 else {const header=Buffer.alloc(22);header.writeUInt16LE(1,2);header.writeUInt16LE(1,4);header.writeUInt16LE(1,10);header.writeUInt16LE(32,12);header.writeUInt32LE(png.length,14);header.writeUInt32LE(22,18);fs.writeFileSync(path.join(root,'public/desktop.ico'),Buffer.concat([header,png]));}
 await page.close();
}fs.copyFileSync(path.join(root,'public/app-icon.svg'),path.join(root,'public/icon.svg'));}finally{await browser.close();}
