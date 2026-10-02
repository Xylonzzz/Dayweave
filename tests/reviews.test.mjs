import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reviewPeriod,reviewSummary,validateReviews} from '../public/reviews.mjs';
test('review periods and completion evidence respect Shanghai dates',()=>{
 assert.deepEqual(reviewPeriod('week','2026-09-13'),{start:'2026-09-07',end:'2026-09-14'});
 assert.deepEqual(reviewPeriod('month','2026-12-31'),{start:'2026-12-01',end:'2027-01-01'});
 const s={tasks:[{title:'本日完成',status:'done',kind:'project',completedAt:'2026-09-09T16:01:00Z'},{title:'历史完成',status:'done',kind:'project'},{title:'待提交',kind:'homework',status:'done',due:'2026-09-10T10:00:00Z'}],blocks:[]};
 const text=reviewSummary(s,'day','2026-09-10');assert.match(text,/本日完成/);assert.doesNotMatch(text,/历史完成/);assert.match(text,/待提交/);
 assert.throws(()=>validateReviews([{id:'bad'}]));
});
