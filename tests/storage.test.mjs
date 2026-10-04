import test from 'node:test';
import assert from 'node:assert/strict';
import { openStorage } from '../storage.mjs';

test('async SQLite transactions roll back and serialize competing writers', async () => {
  const { db, get, put } = await openStorage({ filename: ':memory:', env: { DB_DRIVER: 'sqlite' } });
  try {
    await put('counter', 0);
    await assert.rejects(db.transaction(async () => { await put('counter', 99); throw Error('rollback fixture'); }), /rollback fixture/);
    assert.equal(await get('counter'), 0);
    await Promise.all(Array.from({ length: 10 }, () => db.transaction(async () => {
      const n = await get('counter');
      await new Promise(resolve => setTimeout(resolve, 1));
      await put('counter', n + 1);
    })));
    assert.equal(await get('counter'), 10);
  } finally { await db.close(); }
});
