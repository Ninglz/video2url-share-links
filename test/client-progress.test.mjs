import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { Video2URL } from '../client.js';
const require = createRequire(import.meta.url);
const json = data => Response.json({ data });
const session = { uploadId: 'u1', upload: { method: 'PUT', url: 'https://storage.example/object', headers: { 'Content-Type': 'image/png' } } };
const file = { fileId: 'f1', sizeBytes: 5, mimeType: 'image/png' };
const share = { share: { shareId: 's1' }, url: 'https://video2url.com/v/ready' };
for (const [name, Client] of [['ESM', Video2URL], ['CJS', require('../client.cjs').Video2URL]]) {
  test(`${name}: streaming progress measures bytes consumed by transport and observers cannot corrupt success`, async () => {
    const events = []; const progress = []; let received;
    const client = new Client({ apiKey: 'test', fetch: async (url, init) => {
      if (url.includes('storage.example')) {
        assert.equal(init.duplex, 'half'); assert.equal(init.headers['Content-Length'], '200000');
        assert.equal(init.headers.Authorization, undefined);
        received = new Uint8Array(await new Response(init.body).arrayBuffer());
        return new Response(null);
      }
      if (url.endsWith('/uploads')) return json(session);
      if (url.endsWith('/complete')) return json({ status: 'ready', file });
      return json(share);
    } });
    const payload = new Uint8Array(200000).fill(17);
    const result = await client.upload(payload, { filename: 'a.png', mimeType: 'image/png',
      onUploadCreated: value => { assert.equal(value.uploadId, 'u1'); throw Error('observer'); },
      onProgress: value => { progress.push(value); return Promise.reject(Error('observer')); },
      onStatus: value => events.push(value.phase),
      onComplete: () => { throw Error('observer'); },
      onError: () => assert.fail('success must not emit error'),
    });
    assert.deepEqual(received, payload); assert.equal(result.file.fileId, 'f1');
    assert.deepEqual(events, ['creating', 'uploading', 'verifying', 'sharing', 'completed']);
    assert.equal(progress[0].bytesTransferred, 0); assert.equal(progress.at(-1).bytesTransferred, payload.length);
    assert.ok(progress.length > 2); assert.ok(progress.every((p, i) => p.source === 'transport' && p.totalBytes === payload.length && (i === 0 || p.bytesTransferred > progress[i - 1].bytesTransferred)));
  });
  test(`${name}: failures expose recovery handles and error observers cannot mask failure`, async () => {
    let notified;
    const client = new Client({ apiKey: 'test', fetch: async url => {
      if (url.endsWith('/uploads')) return json(session);
      if (url.includes('storage.example')) return new Response(null);
      if (url.endsWith('/complete')) return json({ status: 'ready', file });
      return Response.json({ error: { code: 'BAD_REQUEST', message: 'share' } }, { status: 400 });
    } });
    await assert.rejects(client.upload(new Blob(['hello'], { type: 'image/png' }), { filename: 'x.png', onError: error => { notified = error; throw Error('observer'); } }), error => error.uploadId === 'u1' && error.fileId === 'f1' && error.code === 'BAD_REQUEST');
    assert.equal(notified.fileId, 'f1');
  });
  test(`${name}: import callbacks and recovery handles survive terminal failures, timeout and abort`, async () => {
    const statuses = []; let errors = 0; let created;
    const client = new Client({ apiKey: 'test', fetch: async (_url, init) => init.method === 'POST' ? json({ importId: 'job1', status: 'queued' }) : json({ importId: 'job1', status: 'failed', uploadId: 'u1', error: { code: 'IMPORT_FAILED', message: 'failed' } }) });
    await assert.rejects(client.uploadFromUrl('https://example.com/a.png', { onImportCreated: x => { created = x; }, onStatus: x => statuses.push(x.status), onError: async () => { errors++; throw Error('observer'); } }), error => error.importId === 'job1' && error.uploadId === 'u1');
    assert.equal(errors, 1); assert.equal(created.importId, 'job1'); assert.deepEqual(statuses, ['failed']);
    const pending = new Client({ apiKey: 'test', fetch: async () => json({ importId: 'job2', status: 'processing' }) });
    await assert.rejects(pending.waitForImport('job2', { timeout: 10 }), error => error.importId === 'job2' && error.code === 'TIMEOUT');
    await assert.rejects(pending.waitForImport('job2', { signal: AbortSignal.abort() }), error => error.importId === 'job2' && error.code === 'ABORTED');
  });
  test(`${name}: domain and analytics methods preserve API contracts`, async () => {
    const calls = []; const client = new Client({ apiKey: 'test', fetch: async (url, init) => { calls.push([new URL(url).pathname, init.method, init.body]); return json({}); } });
    await client.getCustomDomain(); await client.createCustomDomain('media.example.com'); await client.recheckCustomDomain('d1'); await client.deleteCustomDomain('d1'); await client.getShareAnalytics('s1', { range: '7d' });
    assert.deepEqual(calls.map(x => x.slice(0, 2)), [['/api/v1/custom-domains', 'GET'], ['/api/v1/custom-domains', 'POST'], ['/api/v1/custom-domains/d1/recheck', 'POST'], ['/api/v1/custom-domains/d1', 'DELETE'], ['/api/v1/shares/s1/analytics', 'GET']]);
    assert.deepEqual(JSON.parse(calls[1][2]), { hostname: 'media.example.com' });
  });
}
test('Node native fetch streams fixed-length upload without chunked transfer encoding', async t => {
  let bytes = 0; let headers;
  const server = createServer((req, res) => { headers = req.headers; req.on('data', chunk => { bytes += chunk.length; }); req.on('end', () => res.end()); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const endpoint = `http://127.0.0.1:${server.address().port}/object`;
  const client = new Video2URL({ apiKey: 'test', fetch: async (url, init) => {
    if (url.includes('storage.example')) return fetch(endpoint, init);
    if (url.endsWith('/uploads')) return json(session);
    if (url.endsWith('/complete')) return json({ status: 'ready', file });
    return json(share);
  } });
  await client.upload(new Uint8Array(250000), { filename: 'x.png', mimeType: 'image/png', onProgress() {} });
  assert.equal(bytes, 250000); assert.equal(headers['content-length'], '250000'); assert.equal(headers['transfer-encoding'], undefined); assert.equal(headers.authorization, undefined);
});
test('aborted upload preserves session and reports only bytes supplied before cancellation', async () => {
  const controller = new AbortController(); const progress = []; let completed = false; let errors = 0;
  const client = new Video2URL({ apiKey: 'test', fetch: async (url, init) => {
    if (url.endsWith('/uploads')) return json(session);
    if (url.includes('storage.example')) { await new Response(init.body).arrayBuffer(); return new Response(null); }
    completed = true; throw Error('unexpected');
  } });
  await assert.rejects(client.upload(new Uint8Array(200000), { filename: 'x.png', mimeType: 'image/png', signal: controller.signal,
    onProgress: event => { progress.push(event.bytesTransferred); if (event.bytesTransferred > 0) controller.abort(new Error('user cancelled')); },
    onError: () => { errors++; },
  }), error => error.code === 'ABORTED' && error.uploadId === 'u1');
  assert.deepEqual(progress, [0, 65536]); assert.equal(errors, 1); assert.equal(completed, false);
});
test('upload transport timeout is independent from API timeout', async () => {
  const client = new Video2URL({ apiKey: 'test', timeout: 10, uploadTimeout: 200, fetch: async (url, init) => {
    if (url.endsWith('/uploads')) return json(session);
    if (url.includes('storage.example')) { await new Promise(resolve => setTimeout(resolve, 30)); init.signal.throwIfAborted(); return new Response(null); }
    if (url.endsWith('/complete')) return json({ status: 'ready', file });
    return json(share);
  } });
  assert.equal((await client.upload(new Blob(['hello'], { type: 'image/png' }), { filename: 'x.png' })).uploadId, 'u1');
});
