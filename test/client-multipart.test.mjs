import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { Video2URL } from '../client.js';
const require = createRequire(import.meta.url);
const json = data => Response.json({ data });
const md5 = value => createHash('md5').update(value).digest('hex');
for (const [name, Client] of [['ESM', Video2URL], ['CJS', require('../client.cjs').Video2URL]]) {
  test(`${name}: multipart resume checks server parts, replaces mismatched content and merges before verifying`, async () => {
    const payload = Buffer.from('abcdefghij'); const calls = []; const progress = []; let merged = false;
    const client = new Client({ apiKey: 'test', fetch: async (url, init) => {
      const body = init.body && typeof init.body === 'string' ? JSON.parse(init.body) : null;
      calls.push([url, body]);
      if (url.includes('storage.example')) { assert.equal(await init.body.text(), 'efgh'); assert.equal(init.headers.Authorization, undefined); return new Response(null); }
      if (url.endsWith('/uploads/u1')) return json({ upload: { filename: 'x.png', mimeType: 'image/png', sizeBytes: payload.length } });
      if (url.endsWith('/multipart')) {
        if (body.action === 'status') return json({ status: 'uploading', partSize: 4, parts: [{ partNumber: 1, size: 4, etag: md5('abcd') }, { partNumber: 2, size: 4, etag: md5('xxxx') }, { partNumber: 3, size: 2, etag: md5('ij') }] });
        if (body.action === 'part') { assert.equal(body.partNumber, 2); assert.equal(body.md5, md5('efgh')); return json({ status: 'signed', upload: { method: 'PUT', url: 'https://storage.example/part2', headers: {} } }); }
        merged = true; return json({ status: 'uploaded', sizeBytes: payload.length });
      }
      if (url.endsWith('/complete')) { assert.ok(merged); return json({ status: 'ready', file: { fileId: 'f1' } }); }
      return json({ share: { shareId: 's1' }, url: 'https://video2url.com/v/x' });
    } });
    const result = await client.uploadMultipart(payload, { uploadId: 'u1', filename: 'x.png', mimeType: 'image/png', onProgress: x => progress.push(x) });
    assert.equal(result.uploadId, 'u1'); assert.deepEqual(progress.map(p => p.bytesTransferred), [0, 4, 8, 10]); assert.ok(progress.every(p => p.source === 'storage'));
    assert.equal(calls.filter(c => c[0].includes('storage.example')).length, 1);
  });
  test(`${name}: multipart failed transfer retains session ID and never merges incomplete parts`, async () => {
    let created; let merged = false;
    const client = new Client({ apiKey: 'test', fetch: async (url, init) => {
      if (url.endsWith('/uploads')) return json({ uploadId: 'u2' });
      if (url.includes('storage.example')) return new Response(null, { status: 500 });
      const body = JSON.parse(init.body);
      if (body.action === 'status') return json({ status: 'uploading', partSize: 4, parts: [] });
      if (body.action === 'part') return json({ status: 'signed', upload: { method: 'PUT', url: 'https://storage.example/part', headers: {} } });
      merged = true; throw Error('unexpected completion');
    } });
    await assert.rejects(client.uploadMultipart(Buffer.from('abcd'), { filename: 'x.png', mimeType: 'image/png', onUploadCreated: x => { created = x.uploadId; } }), e => e.uploadId === 'u2' && e.code === 'UPLOAD_FAILED');
    assert.equal(created, 'u2'); assert.equal(merged, false);
  });
  test(`${name}: multipart rejects mismatched resume metadata before mutating state`, async () => {
    let count = 0;
    const client = new Client({ apiKey: 'test', fetch: async () => { count++; return json({ upload: { filename: 'different.png', mimeType: 'image/png', sizeBytes: 4 } }); } });
    await assert.rejects(client.uploadMultipart(Buffer.from('abcd'), { uploadId: 'u3', filename: 'x.png', mimeType: 'image/png' }), e => e.code === 'CONFLICT' && e.uploadId === 'u3');
    assert.equal(count, 1);
  });
}
