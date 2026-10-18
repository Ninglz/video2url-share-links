import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { Video2URL, Video2URLError } from '../index.js';
const require = createRequire(import.meta.url);
const key = 'unit-test-secret-not-real';
const json = data => Response.json({ data });

for (const [label, Client] of [['ESM', Video2URL], ['CJS', require('../index.cjs').Video2URL]]) {
 test(`${label}: uploads real bytes before creating a share, never forwards credentials to storage`, async () => {
   const calls = [];
   const fetcher = async (url, init) => {
     calls.push({url,init});
     if (String(url).includes('storage.example')) {
       assert.equal(init.headers.Authorization, undefined);
       assert.equal(await init.body.text(), 'actual payload');
       assert.equal(init.redirect, 'error');
       return new Response(null, { status: 200 });
     }
     assert.equal(init.headers.Authorization, `Bearer ${key}`);
     const path = new URL(url).pathname;
     if (path === '/api/v1/uploads') return json({ uploadId: 'upload-1', upload: { method:'PUT',url:'https://storage.example/file?signature=secret',headers:{'Content-Type':'text/vtt'} } });
     if (path.endsWith('/complete')) return json({ status:'ready',file:{fileId:'file-1',mimeType:'text/vtt',sizeBytes:14} });
     if (path === '/api/v1/shares') { assert.equal(JSON.parse(init.body).fileId,'file-1'); return json({share:{shareId:'share-1'},url:'https://video2url.com/v/demo'}); }
     throw Error('Unexpected call');
   };
   const client = new Client({apiKey:key,fetch:fetcher});
   const result = await client.upload(new Blob(['actual payload'],{type:'text/vtt'}), {filename:'captions.vtt'});
   assert.equal(result.url,'https://video2url.com/v/demo'); assert.equal(calls.length,4);
   assert.equal(JSON.stringify(client).includes(key),false);
 });
 test(`${label}: persists job ID and polls a server job separately`, async () => {
   let polls=0;
   const client = new Client({apiKey:key,fetch:async(url,init)=> {
     if (init.method === 'POST') { assert.equal(JSON.parse(init.body).url,'https://example.com/video.mp4'); return json({importId:'job-1',status:'queued'}); }
     polls++; return json(polls===1?{importId:'job-1',status:'processing'}:{importId:'job-1',status:'completed',result:{url:'https://video2url.com/v/ready'}});
   }});
   const job = await client.startImport('https://example.com/video.mp4');
   assert.equal(job.importId,'job-1');
   assert.deepEqual(await client.waitForImport(job.importId,{pollInterval:250}),{url:'https://video2url.com/v/ready'});
 });
 test(`${label}: aborts polling without deleting the server job`, async () => {
   const controller=new AbortController(); let calls=0;
   const client=new Client({apiKey:key,fetch:async()=>{calls++;controller.abort(new Error('cancelled'));return json({status:'processing'});}});
   await assert.rejects(client.waitForImport('job',{signal:controller.signal}),/cancelled/);assert.equal(calls,1);
 });
}
test('validates key, origin, payload and server responses', async()=>{
 assert.throws(()=>new Video2URL({apiKey:''}),Video2URLError);
 for(const baseUrl of ['http://example.com','https://name:pass@example.com','https://example.com/a','https://example.com/?key=x']) assert.throws(()=>new Video2URL({apiKey:key,baseUrl}));
 let calls=0;const client=new Video2URL({apiKey:key,fetch:async()=>{calls++;return json({});}});
 await assert.rejects(client.upload(null,{filename:'x',mimeType:'image/png'}));assert.equal(calls,0);
 const bad=new Video2URL({apiKey:key,fetch:async()=>Response.json({broken:true})});await assert.rejects(bad.listFiles(),e=>e instanceof Video2URLError);
});
test('preserves typed errors and never retries writes',async()=>{
 let calls=0; const client=new Video2URL({apiKey:key,fetch:async()=>{calls++;return Response.json({error:{code:'INSUFFICIENT_SCOPE',message:'scope',requestId:'request-1'}},{status:403});}});
 await assert.rejects(client.deleteFile('file'),e=>e.status===403&&e.code==='INSUFFICIENT_SCOPE'&&e.requestId==='request-1');assert.equal(calls,1);
});
test('encodes history cursors and resource identifiers',async()=>{
 const urls=[];const client=new Video2URL({apiKey:key,fetch:async url=>{urls.push(url);return json({items:[],nextCursor:null});}});
 await client.listUploads({limit:10,cursor:'+/='});assert.throws(()=>client.getShare('../a'));await client.getShare('valid-id');
 assert.equal(new URL(urls[0]).searchParams.get('cursor'),'+/=');assert.match(urls[1],/valid-id$/);
});
