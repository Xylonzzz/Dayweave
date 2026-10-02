import test from 'node:test';
import assert from 'node:assert/strict';
import { backupData, makeBackup, serverAddress } from '../public/portability.mjs';
const state={revision:35,courses:[],tasks:[{id:'one'}],ideas:[],blocks:[],settings:{name:'同学'},account:{password:'never-export'},providers:[{key:'never-export'}]};
test('portable backups strip server credentials and revision; support legacy files',()=>{
  const b=makeBackup(state,'https://old.example');
  assert.equal(b.version,1);assert.ok(!JSON.stringify(b).includes('never-export'));
  assert.ok(!('revision' in b.data));assert.deepEqual(backupData(b),backupData(state));
  b.data.tasks[0].id='changed';assert.equal(state.tasks[0].id,'one');
});
test('unknown backup versions and incomplete payloads fail closed',()=>{
  assert.throws(()=>backupData({format:'shixu-backup',version:2,data:state}),/版本/);
  assert.throws(()=>backupData({format:'other',version:1,data:state}),/格式/);
  assert.throws(()=>backupData({settings:{}}),/缺少/);
});
test('switching servers only accepts credential-free HTTPS roots and local development',()=>{
  assert.equal(serverAddress(' https://mine.example/#today '),'https://mine.example');
  assert.equal(serverAddress('http://localhost:3098'),'http://localhost:3098');
  for(const value of ['javascript:alert(1)','https://user:pass@mine.example','https://mine.example/api','https://mine.example?key=secret','http://remote.example'])assert.throws(()=>serverAddress(value));
});
