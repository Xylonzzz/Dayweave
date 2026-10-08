import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectPublicFile} from '../check-public.mjs';
const inspect=(file,text='')=>inspectPublicFile(file,Buffer.from(text));
test('public documents allow placeholders but reject literal deployment IPs',()=>{
  assert.deepEqual(inspect('docs/setup.md','203.0.113.10 127.0.0.1 0.0.0.0 https://plan.example.com'),[]);
  assert.ok(inspect('docs/setup.md','https://8.8.8.8').includes('non-example-ip-in-docs'));
  assert.deepEqual(inspect('tests/network.test.mjs','8.8.8.8'),[]);
});
test('environment templates are allowed and real data files rejected',()=>{
  assert.deepEqual(inspect('.env.mysql.example'),[]);
  for(const name of ['.env','.env.production','data/state.json','backup.sqlite','secret.pem'])
    assert.ok(inspect(name).includes('private-file'),name);
});
test('keys and build-machine paths are caught in text and UTF16 binaries',()=>{
  assert.ok(inspect('config.mjs','sk-'+'a'.repeat(32)).includes('possible-api-key'));
  const home=['C:','Users','someone','file.txt'].join('\\');
  assert.ok(inspect('guide.md',home).includes('personal-home-path'));
  assert.ok(inspectPublicFile('icon.bin',Buffer.from(home,'utf16le')).includes('personal-home-path'));
  const unaligned=Buffer.concat([Buffer.from([0]),Buffer.from(home,'utf16le')]).subarray(1);
  assert.ok(inspectPublicFile('icon.bin',unaligned).includes('personal-home-path'));
  assert.deepEqual(inspect('README.md','https://github.com/Xylonzzz/Dayweave.git'),[]);
});
