const messages = {"invalidRequest": "Invalid request parameters or payload.", "notFound": "The requested resource was not found.", "conflict": "The request conflicts with the current state of the resource.", "invalidExpiry": "Expiry time must be in the future and within the source retention period.", "invalidUrl": "The provided URL is invalid or inaccessible.", "uploadFailed": "Failed to upload file.", "requestFailed": "The API request failed to complete.", "invalidResponse": "Received an unexpected or invalid response from the server.", "timeout": "The operation timed out before completion.", "tooLarge": "File or payload size exceeds the maximum allowed limit.", "missingKey": "API key is required but was not provided.", "importFailed": "Failed to import media from the specified URL.", "description": "Authenticated JavaScript SDK for uploads, URL imports, history and share management, with share-link utilities."};

class Video2URLError extends Error {
  constructor(message, { code = 'REQUEST_FAILED', status = 0, requestId, retryAfter } = {}) {
    super(message); this.name = 'Video2URLError'; this.code = code; this.status = status;
    this.requestId = requestId; this.retryAfter = retryAfter;
  }
}

function resourceId(id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(id)) throw new Video2URLError(messages.invalidRequest);
  return id;
}

class Video2URL {
  #apiKey; #fetch; #baseUrl; #timeout;
  constructor({ apiKey, baseUrl = 'https://video2url.com', fetch: fetcher = globalThis.fetch, timeout = 60000 } = {}) {
    if (typeof apiKey !== 'string' || !apiKey.trim()) throw new Video2URLError(messages.missingKey);
    const url = new URL(baseUrl);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Video2URLError(messages.invalidUrl);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Video2URLError(messages.invalidUrl);
    if (typeof fetcher !== 'function' || !Number.isFinite(timeout) || timeout <= 0) throw new Video2URLError(messages.invalidRequest);
    this.#apiKey = apiKey; this.#baseUrl = url.origin; this.#fetch = fetcher; this.#timeout = timeout;
  }
  async #request(path, { method = 'GET', body, signal } = {}) {
    const response = await this.#fetch(`${this.#baseUrl}/api/v1${path}`, {
      method, redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(this.#timeout)]) : AbortSignal.timeout(this.#timeout),
      headers: { Authorization: `Bearer ${this.#apiKey}`, Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Video2URLError(data?.error?.message || messages.requestFailed, { code: data?.error?.code, status: response.status, requestId: data?.error?.requestId, retryAfter: response.headers.get('Retry-After') });
    if (!data || typeof data !== 'object' || !('data' in data)) throw new Video2URLError(messages.invalidResponse, { status: response.status });
    return data.data;
  }
  createUpload(input, options) { return this.#request('/uploads', { ...options, method: 'POST', body: input }); }
  getUpload(id, options) { return this.#request(`/uploads/${resourceId(id)}`, options); }
  completeUpload(id, options) { return this.#request(`/uploads/${resourceId(id)}/complete`, { ...options, method: 'POST' }); }
  createShare(input, options) { return this.#request('/shares', { ...options, method: 'POST', body: input }); }
  getShare(id, options) { return this.#request(`/shares/${resourceId(id)}`, options); }
  updateShare(id, input, options) { return this.#request(`/shares/${resourceId(id)}`, { ...options, method: 'PATCH', body: input }); }
  deleteShare(id, options) { return this.#request(`/shares/${resourceId(id)}`, { ...options, method: 'DELETE' }); }
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
  async upload(file, { filename = file?.name, mimeType = file?.type, share = {}, signal } = {}) {
    if (!(file instanceof Blob || file instanceof Uint8Array || file instanceof ArrayBuffer)) throw new Video2URLError(messages.invalidRequest);
    const blob = file instanceof Blob ? file : new Blob([file], { type: mimeType });
    if (!filename || !mimeType || !blob.size) throw new Video2URLError(messages.invalidRequest);
    const session = await this.createUpload({ filename, mimeType, sizeBytes: blob.size }, { signal });
    const target = new URL(session.upload.url);
    if (target.protocol !== 'https:' || target.username || target.password || session.upload.method !== 'PUT') throw new Video2URLError(messages.invalidResponse);
    const put = await this.#fetch(target.href, { method: 'PUT', headers: session.upload.headers, body: blob, redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(this.#timeout)]) : AbortSignal.timeout(this.#timeout) });
    if (!put.ok) throw new Video2URLError(messages.uploadFailed, { status: put.status, code: 'UPLOAD_FAILED' });
    const completed = await this.completeUpload(session.uploadId, { signal });
    if (completed.status !== 'ready' || !completed.file?.fileId) throw new Video2URLError(messages.invalidResponse);
    const result = await this.createShare({ ...share, fileId: completed.file.fileId }, { signal });
    return { ...result, uploadId: session.uploadId, file: completed.file };
  }
  startImport(url, { filename, mimeType, share = {}, signal } = {}) {
    return this.#request('/imports', { method: 'POST', body: { url, filename, mimeType, share }, signal });
  }
  getImport(id, options) { return this.#request(`/imports/${resourceId(id)}`, options); }
  async waitForImport(id, { signal, pollInterval = 2000, timeout = 600000 } = {}) {
    if (!Number.isFinite(pollInterval) || pollInterval < 250 || !Number.isFinite(timeout) || timeout <= 0) throw new Video2URLError(messages.invalidRequest);
    const combined = signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout);
    for (;;) {
      combined.throwIfAborted();
      const job = await this.getImport(id, { signal: combined });
      if (job.status === 'completed') return job.result;
      if (['failed', 'cancelled'].includes(job.status)) throw new Video2URLError(job.error?.message || messages.uploadFailed, { code: job.error?.code || 'IMPORT_FAILED' });
      await new Promise((resolve, reject) => {
        const finish = () => { combined.removeEventListener('abort', abort); resolve(); };
        const timer = setTimeout(finish, pollInterval);
        const abort = () => { clearTimeout(timer); combined.removeEventListener('abort', abort); reject(combined.reason); };
        combined.addEventListener('abort', abort, { once: true });
        if (combined.aborted) abort();
      });
    }
  }
  async uploadFromUrl(url, options = {}) {
    const job = await this.startImport(url, options);
    return this.waitForImport(job.importId, options);
  }
}

module.exports = { Video2URL, Video2URLError };
