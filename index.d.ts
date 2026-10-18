export interface ParsedShareUrl {
  slug: string;
  url: string;
}

/**
 * Parses a Video2URL share URL.
 * Returns { slug, url } if valid, or null if input is invalid or not a recognized share URL.
 */
export function parseShareUrl(input: unknown): ParsedShareUrl | null;

/**
 * Builds a standard Video2URL share URL from a slug.
 * Throws TypeError if the slug is invalid.
 */
export function buildShareUrl(slug: string): string;

/**
 * Builds a direct resource access URL from a slug.
 * Throws TypeError if the slug is invalid.
 */
export function buildDirectUrl(slug: string): string;

/**
 * Generates a safe Markdown link with escaped label.
 * Throws TypeError if slug or label is invalid.
 */
export function toMarkdownLink(slug: string, label: string): string;

export type RequestOptions = { signal?: AbortSignal };
export type PageOptions = RequestOptions & { limit?: number; cursor?: string };
export type Page<T> = { items: T[]; nextCursor: string | null };
export type FileRecord = { fileId: string; filename?: string; mimeType: string; sizeBytes: number; status?: string; createdAt?: string; expiresAt?: string | null };
export type ShareRecord = { shareId: string; slug: string; fileId: string; title?: string | null; allowDownload?: boolean; captionFileId?: string | null; captionLanguage?: string | null; captionLabel?: string | null; visibility: 'public' | 'unlisted' | 'password'; status?: string; createdAt?: string; expiresAt?: string | null };
export type ShareOptions = { title?: string; visibility?: ShareRecord['visibility']; password?: string; customSlug?: string; expiresAt?: string; captionFileId?: string; captionLanguage?: string; captionLabel?: string };
export type UploadRecord = { uploadId: string; status: string; filename: string; mimeType: string; sizeBytes: number; expiresAt: string; file?: FileRecord };
export type ShareResult = { share: ShareRecord; url: string };
export type UploadResult = ShareResult & CallbackRegistration & { uploadId: string; file: FileRecord; callbackId?: string };
export type ImportOptions = RequestOptions & { filename?: string; mimeType?: string; callback?: WebhookCallback; share?: Omit<ShareOptions, 'captionFileId' | 'captionLanguage' | 'captionLabel'> };
export type Observer<T> = (event: T) => void | Promise<void>;
export type UploadProgress = { uploadId: string; bytesTransferred: number; totalBytes: number; source: 'transport' | 'storage' };
export type UploadStatus = { phase: 'creating' | 'uploading' | 'verifying' | 'sharing' | 'completed'; uploadId?: string; fileId?: string };
export type OperationObservers = { onComplete?: Observer<UploadResult>; onError?: Observer<Video2URLError> };
export type UploadOptions = RequestOptions & OperationObservers & { filename?: string; mimeType?: string; share?: ShareOptions; callback?: WebhookCallback; uploadTimeout?: number; onProgress?: Observer<UploadProgress>; onUploadCreated?: Observer<UploadSession>; onStatus?: Observer<UploadStatus> };
export type UploadSession = { uploadId: string; expiresAt: string; upload: { method: 'PUT'; url: string; headers: Record<string, string>; contractVersion: number; requiredHeaders: string[] } };
export type MultipartStatus = { status: 'uploading'; partSize: number; parts: Array<{ partNumber: number; etag: string; size: number }>; expiresAt: string } | { status: 'uploaded'; sizeBytes: number };
export type SignedPart = { status: 'signed'; upload: { method: 'PUT'; url: string; headers: Record<string, string> } };
export type ImportCreated = CallbackRegistration & { importId: string; status: 'queued' };
export type WaitOptions = RequestOptions & OperationObservers & CallbackRegistration & { pollInterval?: number; timeout?: number; callbackId?: string; onStatus?: Observer<ImportJob>; onImportCreated?: Observer<ImportCreated> };
export type ImportJob = CallbackRegistration & { importId: string } & ({ status: 'queued' | 'processing' } | { status: 'completed'; result: UploadResult } | { status: 'failed' | 'cancelled'; uploadId?: string; error: { code: string; message: string } });
export type CallbackRegistration = { callbackId?: string; callbackStatus?: 'queued' | 'failed'; callbackError?: { code: string; message: string } };
export type WebhookCallback = { url: string; secret: string };
export type CallbackStatus = { callbackId: string; status: 'queued' | 'processing' | 'delivered' | 'failed'; eventId?: string; error?: { code: string; message: string } };
export type WebhookEvent = { id: string; createdAt: string } & ({ type: 'upload.completed'; data: { uploadId: string; file: FileRecord } } | { type: 'import.completed'; data: { importId: string; result: UploadResult } } | { type: 'import.failed'; data: { importId: string; error: { code: string; message: string } } });
export function verifyWebhookSignature(rawBody: string | Uint8Array, options: { secret: string; signature: string; timestamp: string | number; now?: number; toleranceSeconds?: number }): Promise<boolean>;
export type CustomDomain = { id: string; hostname: string; status: 'pending_verification' | 'pending_certificate' | 'active' | 'failed' | 'deleting'; reason: string | null; verificationName: string; verificationValue: string; cnameTarget: string | null; configured: boolean };
export type AnalyticsRange = '24h' | '7d' | '30d' | '90d' | 'all';
export type AnalyticsPoint = { label: string; views: number; uniqueVisitors: number; downloads: number };
export type LinkAnalyticsDetail = { shareOrigin?: string; id: string; slug: string; filename: string; mimeType: string; sizeBytes: number; status: string; createdAt: string; expiresAt: string | null; range: AnalyticsRange; rangeStart: string | null; rangeEnd: string; totals: { views: number; dailyUniqueVisitors: number; downloads: number; conversionRate: number }; trend: AnalyticsPoint[]; dimensions: Record<string, AnalyticsPoint[]>; lastUpdatedAt: string | null };
export class Video2URLError extends Error {
  code: string; status: number; requestId?: string; retryAfter?: string | null; uploadId?: string; fileId?: string; importId?: string; cause?: unknown; reason?: string; callbackId?: string; callbackStatus?: 'queued' | 'failed'; callbackError?: { code: string; message: string };
  constructor(message: string, details?: { code?: string; status?: number; requestId?: string; retryAfter?: string | null; uploadId?: string; fileId?: string; importId?: string; reason?: string; callbackId?: string; callbackStatus?: 'queued' | 'failed'; callbackError?: { code: string; message: string } });
}
export class Video2URL {
  constructor(options: { apiKey: string; baseUrl?: string; fetch?: typeof fetch; timeout?: number; uploadTimeout?: number });
  createUpload(input: { filename: string; mimeType: string; sizeBytes: number; sha256?: string }, options?: RequestOptions): Promise<UploadSession>;
  getUpload(id: string, options?: RequestOptions): Promise<{ upload: UploadRecord }>;
  completeUpload(id: string, options?: RequestOptions & { callback?: WebhookCallback }): Promise<CallbackRegistration & { status: 'ready'; file: FileRecord }>;
  getCallback(id: string, options?: RequestOptions): Promise<CallbackStatus>;
  createShare(input: ShareOptions & { fileId: string }, options?: RequestOptions): Promise<ShareResult>;
  getShare(id: string, options?: RequestOptions): Promise<ShareResult>;
  updateShare(id: string, input: { title?: string; expiresAt?: string; action?: 'enable' | 'disable'; allowDownload?: boolean; captionFileId?: string | null; captionLanguage?: string; captionLabel?: string }, options?: RequestOptions): Promise<{ status: 'updated' }>;
  deleteShare(id: string, options?: RequestOptions): Promise<{ deleted: true }>;
  getCustomDomain(options?: RequestOptions): Promise<{ domain: CustomDomain | null }>;
  createCustomDomain(hostname: string, options?: RequestOptions): Promise<{ domain: CustomDomain }>;
  recheckCustomDomain(id: string, options?: RequestOptions): Promise<{ domain: CustomDomain }>;
  deleteCustomDomain(id: string, options?: RequestOptions): Promise<{ deleted: boolean; reason?: string }>;
  getShareAnalytics(id: string, options?: RequestOptions & { range?: AnalyticsRange }): Promise<{ analytics: LinkAnalyticsDetail }>;
  getFile(id: string, options?: RequestOptions): Promise<{ file: FileRecord }>;
  deleteFile(id: string, options?: RequestOptions): Promise<{ status: 'deleted' }>;
  listFiles(options?: PageOptions): Promise<Page<FileRecord>>;
  listShares(options?: PageOptions): Promise<Page<ShareRecord>>;
  listUploads(options?: PageOptions): Promise<Page<UploadRecord>>;
  upload(file: Blob | Uint8Array | ArrayBuffer, options?: UploadOptions): Promise<UploadResult>;
  getMultipartUpload(id: string, options?: RequestOptions): Promise<MultipartStatus>;
  signUploadPart(id: string, input: { partNumber: number; md5: string }, options?: RequestOptions): Promise<SignedPart | { status: 'uploaded'; sizeBytes: number }>;
  completeMultipartUpload(id: string, options?: RequestOptions): Promise<{ status: 'uploaded'; sizeBytes: number }>;
  uploadMultipart(file: Blob | Uint8Array | ArrayBuffer, options?: UploadOptions & { uploadId?: string }): Promise<UploadResult>;
  startImport(url: string, options?: ImportOptions): Promise<ImportCreated>;
  getImport(id: string, options?: RequestOptions): Promise<ImportJob>;
  waitForImport(id: string, options?: WaitOptions): Promise<UploadResult>;
  uploadFromUrl(url: string, options?: ImportOptions & WaitOptions): Promise<UploadResult>;
}
