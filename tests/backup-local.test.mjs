import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {backupLocal} from '../backup-local.mjs';
test('complete backup includes committed WAL data and matching key, independently restorable',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'shixu-backup-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const db=new DatabaseSync(path.join(dir,'planner.sqlite'));db.exec('PRAGMA journal_mode=WAL; CREATE TABLE example (value TEXT); INSERT INTO example VALUES (\'fixture\')');fs.writeFileSync(path.join(dir,'secret.key'),Buffer.alloc(32,7));
 try{const result=await backupLocal(dir);const restored=new DatabaseSync(path.join(result,'planner.sqlite'));try{assert.equal(restored.prepare('SELECT value FROM example').get().value,'fixture');assert.deepEqual(fs.readFileSync(path.join(result,'secret.key')),Buffer.alloc(32,7));assert.equal(db.prepare('SELECT count(*) AS n FROM example').get().n,1);}finally{restored.close();}}finally{db.close();}
});
