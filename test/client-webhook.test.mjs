import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createRequire } from 'node:module';
import * as esm from '../index.js';
const require = createRequire(import.meta.url);
const json = data => Response.json({ data });
const secret = 'unit-test-webhook-secret';
const callback = { url: 'https://example.com/webhook', secret };
for (const [name, { Video2URL, verifyWebhookSignature }] of [['ESM', esm], ['CJS', require('../index.cjs')]]) {
  test(`${name}: webhook signatures bind exact body, timestamp and secret within time window`, async () => {
    const timestamp = '1800000000'; const now = Number(timestamp) * 1000;
    const body = '{"id":"event-1","message":"媒体"}';
    const signature = 'v1=' + createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
    const options = { timestamp, signature, secret, now };
    assert.equal(await verifyWebhookSignature(body, options), true);
    assert.equal(await verifyWebhookSignature(new TextEncoder().encode(body), options), true);
    assert.equal(await verifyWebhookSignature(body + ' ', options), false);
    assert.equal(await verifyWebhookSignature(body, { ...options, secret: 'different-test-secret' }), false);
    assert.equal(await verifyWebhookSignature(body, { ...options, now: now + 301000 }), false);
    assert.equal(await verifyWebhookSignature(body, { ...options, now: now - 301000 }), false);
    assert.equal(await verifyWebhookSignature(body, { ...options, timestamp: String(Number(timestamp) + 1) }), false);
    assert.equal(await verifyWebhookSignature(body, { ...options, signature: 'v1=not-hex' }), false);
    assert.equal(await verifyWebhookSignature(body, { ...options, timestamp: '1e9' }), false);
  });
  test(`${name}: upload callback registration and delivery status preserve separate lifecycle`, async () => {
    const calls = [];
    const client = new Video2URL({ apiKey: 'test', fetch: async (url, init) => {
      calls.push([url, init]);
      if (url.endsWith('/uploads')) return json({ uploadId: 'u1', upload: { method: 'PUT', url: 'https://storage.example/o', headers: {} } });
      if (url.includes('storage.example')) return new Response(null);
      if (url.endsWith('/complete')) { assert.deepEqual(JSON.parse(init.body), { callback }); return json({ status: 'ready', file: { fileId: 'f1' }, callbackId: 'cb1' }); }
      if (url.endsWith('/callbacks/cb1')) return json({ callbackId: 'cb1', status: 'processing' });
      return json({ share: { shareId: 's1' }, url: 'https://video2url.com/v/x' });
    } });
    const result = await client.upload(new Blob(['a'], { type: 'image/png' }), { filename: 'x.png', callback });
    assert.equal(result.callbackId, 'cb1');
    assert.equal((await client.getCallback('cb1')).status, 'processing');
    const storage = calls.find(c => c[0].includes('storage.example'))[1];
    assert.equal(storage.body instanceof Blob, true); assert.equal(storage.headers.secret, undefined);
  });
  test(`${name}: import callback ID survives waiting, observer completion and terminal error`, async () => {
    let completed; let reported;
    let failed = false;
    const client = new Video2URL({ apiKey: 'test', fetch: async (_url, init) => {
      if (init.method === 'POST') { assert.deepEqual(JSON.parse(init.body).callback, callback); return json({ importId: 'i1', status: 'queued', callbackId: 'cb2' }); }
      return json(failed ? { status: 'failed', error: { code: 'IMPORT_FAILED', message: 'failed' } } : { status: 'completed', result: { url: 'https://video2url.com/v/x' } });
    } });
    const result = await client.uploadFromUrl('https://example.com/a.png', { callback, onComplete: value => { completed = value; } });
    assert.equal(result.callbackId, 'cb2'); assert.equal(completed.callbackId, 'cb2');
    failed = true;
    await assert.rejects(client.uploadFromUrl('https://example.com/a.png', { callback, onError: value => { reported = value; } }), e => e.importId === 'i1' && e.callbackId === 'cb2');
    assert.equal(reported.callbackId, 'cb2');
  });
}
test('callback queue failure remains visible without failing successful media operations', async () => {
  const registration = { callbackStatus: 'failed', callbackError: { code: 'CALLBACK_QUEUE_FAILED', message: 'queue' } };
  const client = new esm.Video2URL({ apiKey: 'test', fetch: async (url, init) => {
    if (url.endsWith('/uploads')) return json({ uploadId: 'u1', upload: { method: 'PUT', url: 'https://storage.example/o', headers: {} } });
    if (url.includes('storage.example')) return new Response(null);
    if (url.endsWith('/complete')) return json({ status: 'ready', file: { fileId: 'f1' }, ...registration });
    if (url.endsWith('/imports')) return json({ importId: 'i1', status: 'queued', ...registration });
    if (url.endsWith('/imports/i1')) return json({ status: 'completed', result: { url: 'https://video2url.com/v/x' } });
    return json({ share: { shareId: 's1' }, url: 'https://video2url.com/v/x' });
  } });
  const uploaded = await client.upload(new Blob(['a'], { type: 'image/png' }), { filename: 'x.png', callback, onError: () => assert.fail('media succeeded') });
  const imported = await client.uploadFromUrl('https://example.com/a.png', { callback, onError: () => assert.fail('media succeeded') });
  for (const result of [uploaded, imported]) { assert.equal(result.callbackStatus, 'failed'); assert.equal(result.callbackError.code, 'CALLBACK_QUEUE_FAILED'); assert.equal(result.callbackId, undefined); }
});
test('final import callback signal failure overrides initially queued registration', async () => {
  const client = new esm.Video2URL({ apiKey: 'test', fetch: async (_url, init) => init.method === 'POST'
    ? json({ importId: 'i1', status: 'queued', callbackId: 'cb1', callbackStatus: 'queued' })
    : json({ status: 'completed', result: { url: 'https://video2url.com/v/x', callbackId: 'cb1', callbackStatus: 'failed', callbackError: { code: 'CALLBACK_SIGNAL_FAILED', message: 'failed' } } }) });
  const result = await client.uploadFromUrl('https://example.com/a.png', { callback });
  assert.equal(result.callbackStatus, 'failed'); assert.equal(result.callbackError.code, 'CALLBACK_SIGNAL_FAILED');
});
