import test from 'node:test';
import assert from 'node:assert/strict';
import {checkUpdates,newerVersion} from '../updates.mjs';
import {validateProfile} from '../public/profile.mjs';
test('update checks distinguish downloadable releases from source changes and reject foreign links',async()=>{
 assert.equal(newerVersion('v0.1.10','0.1.5'),true);assert.equal(newerVersion('0.1.4','0.1.5'),false);assert.equal(newerVersion('0.2.0-beta','0.1.5'),false);
 const source=await checkUpdates('0.1.5',async url=>url.includes('api.github')?{status:404}:{ok:true,json:async()=>({version:'0.1.6'})});assert.equal(source.kind,'source');assert.equal(source.available,true);assert.equal(source.installer,null);
 const release=await checkUpdates('0.1.5',async()=>({ok:true,json:async()=>({tag_name:'v0.1.6',html_url:'https://github.com/Xylonzzz/Dayweave/releases/tag/v0.1.6',assets:[{name:'Shixu-Setup-0.1.6.exe',browser_download_url:'https://evil.example/setup.exe'}]})}));assert.equal(release.available,true);assert.equal(release.installer,null);
 await assert.rejects(checkUpdates('0.1.5',async()=>({status:429,ok:false})),/请求过多/);
});
test('profiles allow student details and reject active or malformed avatar data',()=>{
 assert.deepEqual(validateProfile({school:'我的大学',major:'自动化',bio:'记录想法',avatar:''}).school,'我的大学');
 assert.throws(()=>validateProfile({avatar:'data:image/svg+xml;base64,PHN2Zz4='}),/PNG/);
 assert.throws(()=>validateProfile({avatar:'data:image/png;base64,PHN2Zz4='}),/数据无效/);
 assert.throws(()=>validateProfile({bio:'a'.repeat(301)}),/文字过长/);
});
