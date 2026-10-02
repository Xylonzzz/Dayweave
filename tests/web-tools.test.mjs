import test from 'node:test';
import assert from 'node:assert/strict';
import {publicAddress,webURL,searchResults,searchWeb,readWeb,plainText,fetchPublic} from '../harness/web.mjs';
test('web reader disallows private networks, local services and credentials',async()=>{
 for(const address of ['127.0.0.1','10.0.0.1','192.168.1.1','172.16.0.1','169.254.169.254','100.64.0.1','::1','::ffff:127.0.0.1','2002:7f00:1::'])assert.equal(publicAddress(address),false,address);
 assert.equal(publicAddress('8.8.8.8'),true);assert.equal(publicAddress('2606:4700:4700::1111'),true);
 for(const url of ['http://example.com','https://user:pass@example.com','https://example.com:3088','https://localhost','https://127.1','https://[::1]'])assert.throws(()=>webURL(url));
 await assert.rejects(fetchPublic('https://127.0.0.1'),/内网/);
});
test('search extracts real source links and reports empty or blocked pages',async()=>{
 const html='<li class="b_algo"><h2><a href="https://example.com/?a=1&amp;b=2">Example &amp; title</a></h2><p>Snippet &ensp; content</p></li>';
 assert.deepEqual(searchResults(html),[{title:'Example & title',url:'https://example.com/?a=1&b=2',snippet:'Snippet content'}]);
 const result=await searchWeb('中文 搜索',{fetcher:async url=>{assert.match(url,/%E4%B8%AD/);return {body:html};}});assert.equal(result.results.length,1);
 await assert.rejects(searchWeb('x',{fetcher:async()=>({body:'Please verify you are human'})}),/未返回/);
});
test('web text removes executable markup, keeps content and marks truncation',async()=>{
 assert.equal(plainText('<script>secret()</script><style>x{}</style><p>Hello &amp; world</p>'),'Hello & world');
 const result=await readWeb('https://example.com',{fetcher:async()=>({url:'https://example.com/',body:'<title>文章</title><p>'+ '文'.repeat(19000)+'</p>'})});assert.equal(result.title,'文章');assert.equal(result.text.length,18000);assert.equal(result.truncated,true);
});
