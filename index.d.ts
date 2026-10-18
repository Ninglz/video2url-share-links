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
export type ShareRecord = { shareId: string; slug: string; fileId: string; title?: string; visibility: 'public' | 'unlisted' | 'password'; status?: string; createdAt?: string; expiresAt?: string | null };
export type ShareOptions = { title?: string; visibility?: ShareRecord['visibility']; password?: string; customSlug?: string; expiresAt?: string; captionFileId?: string; captionLanguage?: string; captionLabel?: string };
export type UploadRecord = { uploadId: string; status: string; filename: string; mimeType: string; sizeBytes: number; expiresAt: string; file?: FileRecord };
export type ShareResult = { share: ShareRecord; url: string };
export type UploadResult = ShareResult & { uploadId: string; file: FileRecord };
export type ImportOptions = RequestOptions & { filename?: string; mimeType?: string; share?: Omit<ShareOptions, 'captionFileId' | 'captionLanguage' | 'captionLabel'> };
export type WaitOptions = RequestOptions & { pollInterval?: number; timeout?: number };
export type ImportJob = { importId: string } & ({ status: 'queued' | 'processing' } | { status: 'completed'; result: UploadResult } | { status: 'failed' | 'cancelled'; uploadId?: string; error: { code: string; message: string } });
export class Video2URLError extends Error {
  code: string; status: number; requestId?: string; retryAfter?: string | null;
  constructor(message: string, details?: { code?: string; status?: number; requestId?: string; retryAfter?: string | null });
}
export class Video2URL {
  constructor(options: { apiKey: string; baseUrl?: string; fetch?: typeof fetch; timeout?: number });
  createUpload(input: { filename: string; mimeType: string; sizeBytes: number; sha256?: string }, options?: RequestOptions): Promise<{ uploadId: string; expiresAt: string; upload: { method: 'PUT'; url: string; headers: Record<string, string>; contractVersion: number; requiredHeaders: string[] } }>;
  getUpload(id: string, options?: RequestOptions): Promise<{ upload: UploadRecord }>;
  completeUpload(id: string, options?: RequestOptions): Promise<{ status: 'ready'; file: FileRecord }>;
  createShare(input: ShareOptions & { fileId: string }, options?: RequestOptions): Promise<ShareResult>;
  getShare(id: string, options?: RequestOptions): Promise<ShareResult>;
  updateShare(id: string, input: { title?: string; expiresAt?: string; action?: 'enable' | 'disable'; allowDownload?: boolean }, options?: RequestOptions): Promise<{ status: 'updated' }>;
  deleteShare(id: string, options?: RequestOptions): Promise<{ deleted: true }>;
  getFile(id: string, options?: RequestOptions): Promise<{ file: FileRecord }>;
  deleteFile(id: string, options?: RequestOptions): Promise<{ status: 'deleted' }>;
  listFiles(options?: PageOptions): Promise<Page<FileRecord>>;
  listShares(options?: PageOptions): Promise<Page<ShareRecord>>;
  listUploads(options?: PageOptions): Promise<Page<UploadRecord>>;
  upload(file: Blob | Uint8Array | ArrayBuffer, options: RequestOptions & { filename?: string; mimeType?: string; share?: ShareOptions }): Promise<UploadResult>;
  startImport(url: string, options?: ImportOptions): Promise<{ importId: string; status: 'queued' }>;
  getImport(id: string, options?: RequestOptions): Promise<ImportJob>;
  waitForImport(id: string, options?: WaitOptions): Promise<UploadResult>;
  uploadFromUrl(url: string, options?: ImportOptions & WaitOptions): Promise<UploadResult>;
}
