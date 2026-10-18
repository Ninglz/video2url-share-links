import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as esm from '../index.js';
const cjs = createRequire(import.meta.url)('../index.cjs');
for(const [name,api] of [['ESM',esm],['CJS',cjs]]) {
 test(name+' canonical viewing links',()=>{
  for(const slug of ['a','demo_123-x','a'.repeat(128)]) {
   assert.equal(api.buildShareUrl(slug),'https://video2url.com/v/'+slug);
   assert.deepEqual(api.parseShareUrl(api.buildShareUrl(slug)+'?utm_source=test#t=5'),{slug,url:api.buildShareUrl(slug)});
   assert.equal(api.buildDirectUrl(slug),'https://video2url.com/api/shares/'+slug+'/direct');
  }
  assert.equal(api.parseShareUrl('https://video2url.com:443/v/demo').url,'https://video2url.com/v/demo');
 });
 test(name+' rejects malformed, deceptive, and credential-bearing URLs',()=>{
  for(const input of [null,42,{},'http://video2url.com/v/x','https://www.video2url.com/v/x','https://video2url.com.evil.test/v/x','https://evil.test/v/x','https://user:password@video2url.com/v/x','https://video2url.com:444/v/x','https://video2url.com//v/x','https://video2url.com/a/../v/x','https://video2url.com/v/x/','https://video2url.com/v/a%2Fb','https://video2url.com/v/%61','https://video2url.com\\@evil.test/v/x','https://video2url.com/v/x\n','https://video2url.com/v/'+ 'x'.repeat(129)]) assert.equal(api.parseShareUrl(input),null,String(input));
 });
 test(name+' constructors reject invalid slugs',()=>{
  for(const slug of ['',null,42,'..','a/b','a b','a'.repeat(129),'x\n'])for(const f of [api.buildShareUrl,api.buildDirectUrl])assert.throws(()=>f(slug),TypeError,String(slug));
 });
 test(name+' markdown never embeds unescaped HTML or formatting',()=>{
  assert.equal(api.toMarkdownLink('demo','a [b]\nc'),'[a \\[b\\] c](https://video2url.com/v/demo)');
  const md=api.toMarkdownLink('demo','<img src=x>![click](evil) `x` *bold* _i_ ~s~ \\');
  assert.ok(md.includes('\\<img src=x\\>'));assert.ok(md.includes('\\!\\[click\\]'));assert.ok(md.includes('\\`x\\`'));assert.ok(md.endsWith('](https://video2url.com/v/demo)'));
  assert.throws(()=>api.toMarkdownLink('demo',null),TypeError);
 });
}
