const messages = {"invalidRequest": "Invalid request parameters or payload.", "notFound": "The requested resource was not found.", "conflict": "The request conflicts with the current state of the resource.", "invalidExpiry": "Expiry time must be in the future and within the source retention period.", "invalidUrl": "The provided URL is invalid or inaccessible.", "uploadFailed": "Failed to upload file.", "requestFailed": "The API request failed to complete.", "invalidResponse": "Received an unexpected or invalid response from the server.", "timeout": "The operation timed out before completion.", "tooLarge": "File or payload size exceeds the maximum allowed limit.", "missingKey": "API key is required but was not provided.", "importFailed": "Failed to import media from the specified URL.", "description": "Authenticated JavaScript SDK for uploads, URL imports, history and share management, with share-link utilities."};

function observe(callback, value) {
  if (typeof callback !== 'function') return;
  try { Promise.resolve(callback(value)).catch(() => {}); } catch {}
}
function operationError(error, handles, signal) {
  const result = error instanceof Video2URLError ? error : new Video2URLError(
    error?.message || messages.requestFailed,
    { code: error?.name === 'TimeoutError' ? 'TIMEOUT' : error?.name === 'AbortError' || (signal?.aborted && signal.reason === error) ? 'ABORTED' : 'REQUEST_FAILED' }
  );
  if (result !== error) result.cause = error;
  Object.assign(result, handles);
  return result;
}
function callbackDetails(value) {
  return {
    ...(value.callbackId ? { callbackId: value.callbackId } : {}),
    ...(value.callbackStatus ? { callbackStatus: value.callbackStatus } : {}),
    ...(value.callbackError ? { callbackError: value.callbackError } : {}),
  };
}
function requestSignal(signal, timeout) {
  return signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout);
}

export async function verifyWebhookSignature(rawBody, { secret, signature, timestamp, now = Date.now(), toleranceSeconds = 300 } = {}) {
  if (!(typeof rawBody === 'string' || rawBody instanceof Uint8Array) || typeof secret !== 'string' || secret.length < 16 || secret.length > 256 || typeof signature !== 'string' || !/^v1=[a-f0-9]{64}$/.test(signature) || !/^\d{1,12}$/.test(String(timestamp)) || !Number.isFinite(now) || !Number.isFinite(toleranceSeconds) || toleranceSeconds < 0) return false;
  const seconds = Number(timestamp);
  if (Math.abs(now / 1000 - seconds) > toleranceSeconds) return false;
  const { createHmac, timingSafeEqual } = await import('node:crypto');
  const expected = createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest();
  const actual = Uint8Array.from(signature.slice(3).match(/../g), byte => Number.parseInt(byte, 16));
  return timingSafeEqual(expected, actual);
}

export class Video2URLError extends Error {
  constructor(message, { code = 'REQUEST_FAILED', status = 0, requestId, retryAfter, uploadId, fileId, importId, callbackId, callbackStatus, callbackError, reason } = {}) {
    super(message); this.name = 'Video2URLError'; this.code = code; this.status = status;
    this.requestId = requestId; this.retryAfter = retryAfter;
    Object.assign(this, { uploadId, fileId, importId, callbackId, callbackStatus, callbackError, reason });
  }
}

function resourceId(id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(id)) throw new Video2URLError(messages.invalidRequest);
  return id;
}

export class Video2URL {
  #apiKey; #fetch; #baseUrl; #timeout; #uploadTimeout;
  constructor({ apiKey, baseUrl = 'https://video2url.com', fetch: fetcher = globalThis.fetch, timeout = 60000, uploadTimeout = 6 * 60 * 60 * 1000 } = {}) {
    if (typeof apiKey !== 'string' || !apiKey.trim()) throw new Video2URLError(messages.missingKey);
    const url = new URL(baseUrl);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Video2URLError(messages.invalidUrl);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Video2URLError(messages.invalidUrl);
    if (typeof fetcher !== 'function' || !Number.isSafeInteger(timeout) || timeout <= 0 || !Number.isSafeInteger(uploadTimeout) || uploadTimeout <= 0) throw new Video2URLError(messages.invalidRequest);
    this.#apiKey = apiKey; this.#baseUrl = url.origin; this.#fetch = fetcher; this.#timeout = timeout; this.#uploadTimeout = uploadTimeout;
  }
  async #request(path, { method = 'GET', body, signal } = {}) {
    const response = await this.#fetch(`${this.#baseUrl}/api/v1${path}`, {
      method, redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(this.#timeout)]) : AbortSignal.timeout(this.#timeout),
      headers: { Authorization: `Bearer ${this.#apiKey}`, Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Video2URLError(data?.error?.message || messages.requestFailed, { code: data?.error?.code, status: response.status, requestId: data?.error?.requestId, reason: data?.error?.reason, retryAfter: response.headers.get('Retry-After') });
    if (!data || typeof data !== 'object' || !('data' in data)) throw new Video2URLError(messages.invalidResponse, { status: response.status });
    return data.data;
  }
  createUpload(input, options) { return this.#request('/uploads', { ...options, method: 'POST', body: input }); }
  getUpload(id, options) { return this.#request(`/uploads/${resourceId(id)}`, options); }
  completeUpload(id, { signal, callback } = {}) { return this.#request(`/uploads/${resourceId(id)}/complete`, { signal, method: 'POST', ...(callback ? { body: { callback } } : {}) }); }
  getCallback(id, options) { return this.#request(`/callbacks/${resourceId(id)}`, options); }
  createShare(input, options) { return this.#request('/shares', { ...options, method: 'POST', body: input }); }
  getShare(id, options) { return this.#request(`/shares/${resourceId(id)}`, options); }
  updateShare(id, input, options) { return this.#request(`/shares/${resourceId(id)}`, { ...options, method: 'PATCH', body: input }); }
  deleteShare(id, options) { return this.#request(`/shares/${resourceId(id)}`, { ...options, method: 'DELETE' }); }
  getCustomDomain(options) { return this.#request('/custom-domains', options); }
  createCustomDomain(hostname, options) { return this.#request('/custom-domains', { ...options, method: 'POST', body: { hostname } }); }
  recheckCustomDomain(id, options) { return this.#request(`/custom-domains/${resourceId(id)}/recheck`, { ...options, method: 'POST' }); }
  deleteCustomDomain(id, options) { return this.#request(`/custom-domains/${resourceId(id)}`, { ...options, method: 'DELETE' }); }
  getShareAnalytics(id, { range, signal } = {}) {
    const query = new URLSearchParams();
    if (range !== undefined) query.set('range', range);
    return this.#request(`/shares/${resourceId(id)}/analytics?${query}`, { signal });
  }
  getFile(id, options) { return this.#request(`/files/${resourceId(id)}`, options); }
  deleteFile(id, options) { return this.#request(`/files/${resourceId(id)}`, { ...options, method: 'DELETE' }); }
  #list(kind, { limit, cursor, signal } = {}) {
    const query = new URLSearchParams();
    if (limit !== undefined) query.set('limit', String(limit));
    if (cursor !== undefined) query.set('cursor', cursor);
    return this.#request(`/${kind}?${query}`, { signal });
  }
  listUploads(options) { return this.#list('uploads', options); }
  listFiles(options) { return this.#list('files', options); }
  listShares(options) { return this.#list('shares', options); }
  async upload(file, options = {}) {
    const { filename = file?.name, mimeType = file?.type, share = {}, callback, signal, uploadTimeout = this.#uploadTimeout, onProgress, onUploadCreated, onStatus, onComplete, onError } = options;
    const handles = {};
    const status = phase => observe(onStatus, { phase, ...handles });
    try {
      if (!(file instanceof Blob || file instanceof Uint8Array || file instanceof ArrayBuffer) || !Number.isSafeInteger(uploadTimeout) || uploadTimeout <= 0) throw new Video2URLError(messages.invalidRequest);
      const blob = file instanceof Blob ? file : new Blob([file], { type: mimeType });
      if (!filename || !mimeType || !blob.size) throw new Video2URLError(messages.invalidRequest);
      status('creating');
      const session = await this.createUpload({ filename, mimeType, sizeBytes: blob.size }, { signal });
      handles.uploadId = session.uploadId;
      observe(onUploadCreated, session);
      const target = new URL(session.upload.url);
      if (target.protocol !== 'https:' || target.username || target.password || session.upload.method !== 'PUT') throw new Video2URLError(messages.invalidResponse);
      const transferSignal = requestSignal(signal, uploadTimeout);
      let body = blob;
      let reader;
      if (typeof onProgress === 'function') {
        let offset = 0;
        let cancelled = false;
        reader = {
          async read() {
            if (cancelled || offset >= blob.size) return { done: true };
            const value = new Uint8Array(await blob.slice(offset, offset + 65536).arrayBuffer());
            offset += value.byteLength;
            return { done: false, value };
          },
          async cancel() { cancelled = true; },
        };
        let bytesTransferred = 0;
        const progress = () => observe(onProgress, { uploadId: session.uploadId, bytesTransferred, totalBytes: blob.size, source: 'transport' });
        progress();
        body = new ReadableStream({
          async pull(controller) {
            try {
              transferSignal.throwIfAborted();
              const chunk = await reader.read();
              if (chunk.done) { controller.close(); return; }
              controller.enqueue(chunk.value);
              bytesTransferred += chunk.value.byteLength;
              progress();
            } catch (error) { controller.error(error); }
          },
          cancel(reason) { return reader.cancel(reason); },
        }, { highWaterMark: 0 });
      }
      status('uploading');
      let put;
      try {
        put = await this.#fetch(target.href, { method: 'PUT', headers: { ...session.upload.headers, ...(reader ? { 'Content-Length': String(blob.size) } : {}) }, body, ...(reader ? { duplex: 'half' } : {}), redirect: 'error', signal: transferSignal });
      } finally { if (reader) await reader.cancel().catch(() => {}); }
      if (!put.ok) throw new Video2URLError(messages.uploadFailed, { status: put.status, code: 'UPLOAD_FAILED' });
      status('verifying');
      const completed = await this.completeUpload(session.uploadId, { signal, callback });
      if (completed.status !== 'ready' || !completed.file?.fileId) throw new Video2URLError(messages.invalidResponse);
      handles.fileId = completed.file.fileId;
      if (completed.callbackId) handles.callbackId = completed.callbackId;
      status('sharing');
      const result = { ...await this.createShare({ ...share, fileId: completed.file.fileId }, { signal }), uploadId: session.uploadId, file: completed.file, ...callbackDetails(completed) };
      status('completed');
      observe(onComplete, result);
      return result;
    } catch (error) {
      const failure = operationError(error, handles, signal);
      observe(onError, failure);
      throw failure;
    }
  }
  getMultipartUpload(id, options) { return this.#request(`/uploads/${resourceId(id)}/multipart`, { ...options, method: 'POST', body: { action: 'status' } }); }
  signUploadPart(id, input, options) { return this.#request(`/uploads/${resourceId(id)}/multipart`, { ...options, method: 'POST', body: { ...input, action: 'part' } }); }
  completeMultipartUpload(id, options) { return this.#request(`/uploads/${resourceId(id)}/multipart`, { ...options, method: 'POST', body: { action: 'complete' } }); }
  async uploadMultipart(file, options = {}) {
    const { filename = file?.name, mimeType = file?.type, share = {}, callback, signal, uploadTimeout = this.#uploadTimeout, onProgress, onUploadCreated, onStatus, onComplete, onError } = options;
    const handles = options.uploadId ? { uploadId: options.uploadId } : {};
    const status = phase => observe(onStatus, { phase, ...handles });
    try {
      if (!(file instanceof Blob || file instanceof Uint8Array || file instanceof ArrayBuffer) || !Number.isSafeInteger(uploadTimeout) || uploadTimeout <= 0) throw new Video2URLError(messages.invalidRequest);
      const blob = file instanceof Blob ? file : new Blob([file], { type: mimeType });
      if (!filename || !mimeType || !blob.size) throw new Video2URLError(messages.invalidRequest);
      if (handles.uploadId) {
        const existing = (await this.getUpload(handles.uploadId, { signal })).upload;
        if (!existing || existing.sizeBytes !== blob.size || existing.mimeType !== mimeType || existing.filename !== filename) throw new Video2URLError(messages.conflict, { code: 'CONFLICT' });
      } else {
        status('creating');
        const session = await this.createUpload({ filename, mimeType, sizeBytes: blob.size }, { signal });
        handles.uploadId = session.uploadId;
        observe(onUploadCreated, session);
      }
      const state = await this.getMultipartUpload(handles.uploadId, { signal });
      status('uploading');
      if (state.status === 'uploading') {
        if (!Number.isSafeInteger(state.partSize) || state.partSize <= 0 || state.partSize > 32 * 1024 * 1024 || !Array.isArray(state.parts)) throw new Video2URLError(messages.invalidResponse);
        const { createHash } = await import('node:crypto');
        const existing = new Map(state.parts.map(part => [part.partNumber, part]));
        let bytesTransferred = 0;
        const progress = () => observe(onProgress, { uploadId: handles.uploadId, bytesTransferred, totalBytes: blob.size, source: 'storage' });
        progress();
        for (let offset = 0, partNumber = 1; offset < blob.size; offset += state.partSize, partNumber++) {
          signal?.throwIfAborted();
          const part = blob.slice(offset, offset + state.partSize);
          const md5 = createHash('md5').update(new Uint8Array(await part.arrayBuffer())).digest('hex');
          const known = existing.get(partNumber);
          if (!(known?.size === part.size && known.etag?.replaceAll('"', '').toLowerCase() === md5)) {
            const signed = await this.signUploadPart(handles.uploadId, { partNumber, md5 }, { signal });
            if (signed.status !== 'signed') throw new Video2URLError(messages.invalidResponse);
            const target = new URL(signed.upload.url);
            if (target.protocol !== 'https:' || target.username || target.password || signed.upload.method !== 'PUT') throw new Video2URLError(messages.invalidResponse);
            const put = await this.#fetch(target.href, { method: 'PUT', headers: signed.upload.headers, body: part, redirect: 'error', signal: requestSignal(signal, uploadTimeout) });
            if (!put.ok) throw new Video2URLError(messages.uploadFailed, { status: put.status, code: 'UPLOAD_FAILED' });
          }
          bytesTransferred += part.size;
          progress();
        }
        const merged = await this.completeMultipartUpload(handles.uploadId, { signal });
        if (merged.status !== 'uploaded' || merged.sizeBytes !== blob.size) throw new Video2URLError(messages.invalidResponse);
      } else if (state.status !== 'uploaded' || state.sizeBytes !== blob.size) throw new Video2URLError(messages.invalidResponse);
      status('verifying');
      const completed = await this.completeUpload(handles.uploadId, { signal, callback });
      if (completed.status !== 'ready' || !completed.file?.fileId) throw new Video2URLError(messages.invalidResponse);
      handles.fileId = completed.file.fileId;
      if (completed.callbackId) handles.callbackId = completed.callbackId;
      status('sharing');
      const result = { ...await this.createShare({ ...share, fileId: completed.file.fileId }, { signal }), uploadId: handles.uploadId, file: completed.file, ...callbackDetails(completed) };
      status('completed'); observe(onComplete, result);
      return result;
    } catch (error) {
      const failure = operationError(error, handles, signal); observe(onError, failure); throw failure;
    }
  }
  startImport(url, { filename, mimeType, share = {}, callback, signal } = {}) {
    return this.#request('/imports', { method: 'POST', body: { url, filename, mimeType, share, callback }, signal });
  }
  getImport(id, options) { return this.#request(`/imports/${resourceId(id)}`, options); }
  async waitForImport(id, { signal, pollInterval = 2000, timeout = 60 * 60 * 1000, callbackId, callbackStatus, callbackError, onStatus, onComplete, onError } = {}) {
    try {
      if (!Number.isFinite(pollInterval) || pollInterval < 250 || !Number.isSafeInteger(timeout) || timeout <= 0) throw new Video2URLError(messages.invalidRequest);
      const combined = requestSignal(signal, timeout);
      for (;;) {
        combined.throwIfAborted();
        const job = await this.getImport(id, { signal: combined });
        observe(onStatus, job);
        if (job.status === 'completed') { const result = { ...callbackDetails({ callbackId, callbackStatus, callbackError }), ...callbackDetails(job), ...job.result }; observe(onComplete, result); return result; }
        if (['failed', 'cancelled'].includes(job.status)) throw new Video2URLError(job.error?.message || messages.uploadFailed, { code: job.error?.code || 'IMPORT_FAILED', uploadId: job.uploadId, ...callbackDetails(job) });
        if (!['queued', 'processing'].includes(job.status)) throw new Video2URLError(messages.invalidResponse);
        await new Promise((resolve, reject) => {
          const finish = () => { combined.removeEventListener('abort', abort); resolve(); };
          const timer = setTimeout(finish, pollInterval);
          const abort = () => { clearTimeout(timer); combined.removeEventListener('abort', abort); reject(combined.reason); };
          combined.addEventListener('abort', abort, { once: true });
          if (combined.aborted) abort();
        });
      }
    } catch (error) {
      const failure = operationError(error, { importId: id, ...(callbackId ? { callbackId } : {}) }, signal);
      observe(onError, failure);
      throw failure;
    }
  }
  async uploadFromUrl(url, options = {}) {
    let job;
    try { job = await this.startImport(url, options); }
    catch (error) { const failure = operationError(error, {}, options.signal); observe(options.onError, failure); throw failure; }
    observe(options.onImportCreated, job);
    return this.waitForImport(job.importId, { ...options, ...callbackDetails(job) });
  }
}
