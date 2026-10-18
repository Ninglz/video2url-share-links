# video2url

Video2URL 官方 Node.js 服务端 SDK（`video2url@0.1.0`），提供媒体直传、分片断点续传、远程 URL 导入、分享链接与字幕管理、自定义域名绑定及 Webhook 签名校验等能力。

- **官方网站**：https://video2url.com
- **API 文档**：https://video2url.com/docs/api
- **GitHub 仓库**：https://github.com/Ninglz/video2url-share-links
- **运行环境**：Node.js >= 20（支持 ESM 与 CommonJS，完整 TypeScript 类型定义，零第三方依赖）

> ⚠️ **占位符域名提示**：本文档示例中的 `example.com` 仅为语法占位符，不承诺存在或可访问。实际接入时请替换为您业务中真实公开可访问的媒体 URL 或服务端回调地址。

---

## 安全须知与权限模型

- **仅限服务端使用**：`VIDEO2URL_API_KEY` 具备管理文件与分享的高级凭证权限，**严禁**暴露在浏览器端、移动端或任何前端打包产物中。
- **订阅计划与访问要求**：本 SDK 采用 MIT 许可证开源，但调用 Video2URL 后端 API 必须拥有当前已激活的付费账户权限（Pro / Business / Lifetime）。自定义域名的创建与复查需 Business 计划支持；自定义域名的读取与删除对拥有相应 Scope 的付费用户可用。
- **权限范围（Scopes）**：
  - `files:read` / `files:write`：文件查询、删除与回调状态检索（`getCallback` 需 `files:read`）
  - `uploads:write`：创建上传会话、分片签名与完成入库
  - `shares:read` / `shares:write`：分享链接管理与访问统计查询
  - `domains:read` / `domains:write`：自定义域名查询、配置与删除
  - *注意*：旧版 API Key 不会自动继承新推出的 Scope；如需调整权限，请在控制台按最小权限原则重新签发 API Key。SDK 不提供签发 Key 的接口。

---

## 安装与引入

```bash
npm install video2url
```

支持 ESM 与 CommonJS 导入：

```typescript
// ESM
import { Video2URL, Video2URLError } from 'video2url';

```

```javascript
// CommonJS
const { Video2URL, Video2URLError } = require('video2url');
```

---

## 客户端初始化与全局配置

```typescript
const client = new Video2URL({
  apiKey: process.env.VIDEO2URL_API_KEY!,
  baseUrl: 'https://video2url.com', // 默认官方 API 服务端点
  timeout: 60000,                  // 默认 API 请求超时时间（60 秒）
  uploadTimeout: 21600000,         // 默认单文件/分片传输超时时间（6 小时）
});
```

- **超时与取消**：`timeout` 约束标准 API 交互；`uploadTimeout` 约束二进制数据传输（分片上传约束单个分片）。`waitForImport` 默认等待超时为 60 分钟（`3600000ms`），轮询间隔 `pollInterval` 默认为 2000ms（最小值不得低于 250ms）。支持传入 `signal: AbortSignal` 停止本地动作与请求，但 `AbortSignal` 不会删除服务端已生成的资源，也不会取消服务端正在执行的导入作业。
- **重试策略**：为避免并发副作用或资源重复生成，**SDK 不对任何网络写操作（POST/PUT/DELETE）执行静默自动重试**。业务层必须根据句柄与操作状态自行决策重试。

---

## 资源查询与分页 API 简表

SDK 提供了一致的分页列表与单资源查询方法（分页入参 `{ limit?: 1..100, cursor?: string, signal?: AbortSignal }`，返回 `{ items: T[], nextCursor: string | null }`）：

| 方法 | 所需 Scope | 返回结构与说明 |
| :--- | :--- | :--- |
| `client.listFiles(options?)` | `files:read` | `Page<FileRecord>` 文件资产列表 |
| `client.listShares(options?)` | `shares:read` | `Page<ShareRecord>` 分享链接列表 |
| `client.listUploads(options?)` | `files:read` | `Page<UploadRecord>` 上传会话列表 |
| `client.getFile(id, options?)` | `files:read` | `{ file: FileRecord }` 获取单个文件元数据 |
| `client.getShare(id, options?)` | `shares:read` | `ShareResult`（包含 `share` 与 `url`） |
| `client.getUpload(id, options?)` | `files:read` | `{ upload: UploadRecord }`（仅包含会话状态与总 `sizeBytes`，**不反映**传输字节进度） |
| `client.getImport(id, options?)` | `files:read` + `shares:read` | `ImportJob`（查询远程导入作业终态与错误信息） |
| `client.getCallback(id, options?)` | `files:read` | `CallbackStatus`（状态为 `queued` \| `processing` \| `delivered` \| `failed`） |

---

## 单文件上传（Direct Upload）

### 1. 高层一键上传并创建分享 (`client.upload`)

输入类型支持 `Blob | Uint8Array | ArrayBuffer`（Node.js `Buffer` 原生可用）。`upload` 总是按序执行：创建会话 → 直传存储 → 完成验证（`completeUpload`） → 创建分享链接（`createShare`）。

```typescript
import fs from 'node:fs';

const fileBuffer = fs.readFileSync('video.mp4');

const result = await client.upload(fileBuffer, {
  filename: 'video.mp4',
  mimeType: 'video/mp4',
  share: {
    visibility: 'public',
    title: '发布演示视频',
  },
  // 本地 observer 同步执行（同步 CPU 工作会延迟主流程）；不等待返回 Promise；异常隔离
  onUploadCreated: (session) => {
    console.log('上传会话已创建，ID:', session.uploadId);
  },
  onStatus: (status) => {
    console.log('当前阶段:', status.phase); // creating | uploading | verifying | sharing | completed
  },
  onProgress: (progress) => {
    // 统计本地喂给底层 fetch 传输管道的字节数（64KiB 步进），非服务端入库进度
    console.log(`传输进度: ${progress.bytesTransferred} / ${progress.totalBytes} 来源: ${progress.source}`);
  },
});

console.log('分享访问 URL:', result.url);
console.log('文件 ID:', result.file.fileId);
```

> **Observer 运行机制**：所有 observer 回调在本地同步调用。SDK **不等待返回 Promise**，其内部异常被严格隔离；但同步执行的 CPU 工作会直接延迟主流程，切勿在 observer 内执行密集计算或关键异步事务。

高层方法 upload、uploadMultipart、waitForImport 与 uploadFromUrl 支持 onComplete(result) 和 onError(error)；upload 与 uploadMultipart 具备 onUploadCreated(session)，uploadFromUrl 具备 onImportCreated(job)；onStatus 回调传入上传 phase 或 ImportJob。各 observer 均为同步调用但不等待 Promise 且具备异常隔离，业务关键逻辑请通过 await 主 Promise 处理，注意此处并不提供 getUpload 字节进度。

### 2. 底层分步上传（无需创建分享）

```typescript
// 1. 获取预签名上传会话凭证
const session = await client.createUpload({
  filename: 'raw-archive.mp4',
  mimeType: 'video/mp4',
  sizeBytes: fileBuffer.byteLength,
});

// 2. 自行 PUT 上传至存储节点：必须原样传递 session.upload.headers，禁止携带 API 密钥！
const putResponse = await fetch(session.upload.url, {
  method: 'PUT',
  body: fileBuffer,
  headers: session.upload.headers,
  redirect: 'error',
});

if (!putResponse.ok) {
  throw new Error(`存储节点直传失败: HTTP ${putResponse.status}`);
}

// 3. 通知服务端完成校验并入库（支持绑定 webhook 回调）
const { file, callbackId, callbackStatus } = await client.completeUpload(session.uploadId);
console.log('文件已安全入库，File ID:', file.fileId);
```

---

## 大文件分片断点续传 (`uploadMultipart`)

针对超大文件，`uploadMultipart` 采用固定分片大小（当前 32MiB）顺序上传。每次上传前核对已有分片 MD5，自动跳过匹配块，重传异常块。

```typescript
try {
  const result = await client.uploadMultipart(fileBuffer, {
    filename: 'video.mp4',
    mimeType: 'video/mp4',
    onProgress: (p) => {
      // source 为 'storage' 表示包含新成功 PUT 的分片和 MD5 匹配复用的旧分片累计字节
      console.log(`进度: ${p.bytesTransferred}/${p.totalBytes} (${p.source})`);
    },
  });
  console.log('上传完成:', result.url);
} catch (error) {
  // 续传前必须先确认 error.uploadId 存在，否则直接 throw，避免失败前无句柄导致误新建
  if (error instanceof Video2URLError && error.uploadId) {
    const interruptedUploadId = error.uploadId;
    // 推荐持久化保存 interruptedUploadId，稍后使用相同二进制内容与元数据传入 uploadId 重新调用续传
    // 切勿在 catch 块中盲目立即无限重试
  } else {
    throw error;
  }
}
```

可通过接入方持久化保存的 savedUploadId 恢复分片上传：`await client.uploadMultipart(fileBuffer, { filename: 'video.mp4', mimeType: 'video/mp4', uploadId: savedUploadId });`，恢复时必须提供与原上传完全一致的文件元信息。

- **底层分片接口**：进阶场景可调用 `getMultipartUpload(id)` 查询分片清单、`signUploadPart(id, { partNumber, md5 })` 签署分片、`completeMultipartUpload(id)` 合并分片，最后仍须调用 `completeUpload(id)` 触发校验入库。
- **幂等与状态**：对已完成入库的对象重复调用高层 `uploadMultipart` 可能触发新建分享链接。对同一 uploadId 重复调用 `completeUpload`，以首次注册的 callback 配置与事件为准，不可更改回调目标。

---

## 远程 URL 媒体导入

### 1. 导入源地址严格约束
- 必须为公开直接可达的 HTTPS 媒体直链（端口必须为默认 443）；
- HTTP 响应必须为 200，且带有合法正整数 `Content-Length`；不支持压缩传输编码（如 `gzip/br`）；
- 最多允许 5 次重定向；禁止内网 IP、私有网段、Localhost、IP 字面量及包含认证鉴权信息的 URL；
- **不支持**解析或提取视频平台网页（如 YouTube、Bilibili 等 HTML 播放页）。

### 2. 导入调用方式

```typescript
// 方式 A：一键导入并等待终态（高层封装，支持 onStatus 与 onImportCreated）
const importResult = await client.uploadFromUrl('https://example.com/media/sample.mp4', {
  filename: 'sample.mp4',
  share: { visibility: 'unlisted' },
  pollInterval: 2000,
  timeout: 3600000, // 最长等待 60 分钟
  onImportCreated: ({ importId }) => console.log('导入作业已排队，ID:', importId),
  // onStatus 会接收到 queued | processing | completed | failed 四种状态
  onStatus: (job) => console.log('作业状态:', job.status),
});
console.log('导入成功，分享 URL:', importResult.url);

// 方式 B：底层作业提交（startImport 异步持久运行，不接受 Observer）
const { importId, callbackId } = await client.startImport('https://example.com/media/sample.mp4', {
  filename: 'sample.mp4',
  callback: {
    url: 'https://example.com/api/video2url-webhook?source=import',
    secret: 'secret_key_16_to_256_chars_length',
  },
});

// 查询作业状态（返回 queued | processing | completed | failed，不提供下载百分比）
const job = await client.getImport(importId);

// 恢复轮询；即使本地 AbortSignal 中断，服务端导入作业仍将继续运行，不会被终止
const waitResult = await client.waitForImport(importId, { pollInterval: 2000 });
```

---

## 分享链接与文件资产管理

### 1. 创建分享 (`client.createShare`)
```typescript
const share = await client.createShare({
  fileId: 'file_01hxxx',
  visibility: 'password', // 'public' | 'unlisted' | 'password'
  password: 'strongPassword123', // password 模式密码至少 8 个字符
  // 服务端规则：trim + 转小写，3..48 字符，仅限 a-z, 0-9, -，首尾必须为字母或数字
  customSlug: 'my-custom-link',
  title: '产品发布说明会',
  expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
  captionFileId: 'file_vtt_01hxxx',
  captionLanguage: 'zh-CN',
  captionLabel: '中文字幕',
});
```

> **Slug 校验区别**：服务端 `createShare` 的 `customSlug` 严格执行 trim + 小写，长度 3..48 字符，仅限 `a-z`、`0-9`、`-` 且首尾必须为字母或数字；而纯链接离线工具（如 `buildShareUrl`）接受 `A-Z`、`a-z`、`0-9`、`_`、`-` 且长度为 1..128 字符。二者规则不同。

### 2. 更新与删除
创建后**不支持更新 `visibility` 或 `password`**；如需变更请重新创建分享。
```typescript
await client.updateShare(share.share.shareId, {
  title: '更新后的标题',
  action: 'disable', // 'enable' | 'disable' 快速启用/停用
  allowDownload: false,
  expiresAt: new Date(Date.now() + 14 * 86400000).toISOString(),
  captionFileId: null, // 传入 null 移除字幕
});

await client.deleteShare(share.share.shareId);
```

updateShare 支持设置 captionFileId、captionLanguage 与 captionLabel，传 null 可移除 captionFileId；若单独修改字幕语言或标签等元信息，前提是该分享已存在字幕；配置的 expiresAt 不得超过源文件的保留期限。

- **字幕规范**：必须为当前账户下处于 `ready` 状态、大小 <= 1MiB 的 `text/vtt` 文件。
- **级联删除约束**：调用 `deleteFile(fileId)` 前，**必须先删除所有关联且未删除的分享链接**（`deleteShare`），否则服务端将拒绝删除。

---

## 自定义域名与数据分析

### 1. 自定义域名流程
每个账户仅支持配置单个自定义域名。创建与复查需 Business 计划支持；读取与删除对持有相应 Scope 的付费用户可用。
```typescript
// 1. 发起域名绑定（需 Business 计划，domains:write）
const { domain } = await client.createCustomDomain('media.example.com');

// 2. 在外部 DNS 服务商配置 TXT 与 CNAME 解析后触发复查（需 Business 计划，domains:write）
const recheck = await client.recheckCustomDomain(domain.id);
console.log('域名状态:', recheck.domain.status); // pending_verification -> pending_certificate -> active

// 3. 查询当前域名（需 domains:read）
const current = await client.getCustomDomain();

// 4. 删除自定义域名（需 domains:write）
const { deleted, reason } = await client.deleteCustomDomain(domain.id);
```
createCustomDomain 返回的 verificationName 与 verificationValue 用于配置 TXT 记录，cnameTarget 用于配置 CNAME 记录；SDK 不会自动修改 DNS。

> **生效说明**：域名进入 `active` 状态后，API 返回的 `ShareResult.url` 会自动切换为该域名；切勿通过自行拼接或修改客户端 `baseUrl` 替换分享域名。

### 2. 分享链接数据分析 (`client.getShareAnalytics`)
需要 `shares:read` 权限与付费账户权限。

getShareAnalytics 支持通过 range 参数指定统计周期，可选范围为 '24h' | '7d' | '30d' | '90d' | 'all'。
```typescript
const { analytics } = await client.getShareAnalytics('share_01hxxx', { range: '7d' });
console.log('累计访问:', analytics.totals.views);
console.log('独立访客:', analytics.totals.dailyUniqueVisitors);
console.log('下载次数:', analytics.totals.downloads);
```

---

## 服务端 Webhook 回调与签名验证

completeUpload、upload、uploadMultipart、startImport 与 uploadFromUrl 均支持传入 callback: { url, secret }；接收到的 upload.completed 仅代表文件上传验证通过，不代表后续创建分享成功；Webhook 重试时 eventId 保持不变但 timestamp 会更新；验签时间窗不能替代持久化去重机制。

### 1. Webhook 契约与重试机制
- **URL 规范**：仅允许公开标准 HTTPS 协议（默认 443 端口）；**允许携带 Query 查询参数**；禁止 hash/fragment、用户名密码（userinfo）、IP 字面量及私网地址；不跟随 3xx 重定向。
- **投递与密钥**：`secret` 长度需为 16..256 字符。最多投递 6 次（首次投递 + 5 次重试，指数退避 10s、20s、40s、80s、160s，单次超时 15 秒）。
- **状态分离与异常处理**：
  - `callbackStatus` 代表注册/通知状态，返回 `queued` **不代表已送达**；实际投递状态通过 `getCallback(callbackId)` 查询（`queued` \| `processing` \| `delivered` \| `failed`，需 `files:read`）。
  - `completeUpload` 与 `startImport` 若排队注册失败，响应 `callbackStatus: 'failed'`，`callbackError: { code: 'CALLBACK_QUEUE_FAILED', message }`，无 `callbackId`，但媒体入库仍可能成功。
  - `import` 完成后通知 callback workflow 失败时，`result.callbackStatus: 'failed'`，`callbackError.code = 'CALLBACK_SIGNAL_FAILED'`，保留 `callbackId`。
  - 对同一 upload 重复调用 `completeUpload`，以首个 callback 配置与事件为准，不可更改目标。
- **事件结构**：
  - `upload.completed`：`{ id, type, createdAt, data: { uploadId, file } }`（仅代表文件入库）。
  - `import.completed`：`{ id, type, createdAt, data: { importId, result } }`。
  - `import.failed`：`{ id, type, createdAt, data: { importId, error } }`。

### 2. 签名验证与防重放实现

请求头包含 `Video2URL-Event-Id`、`Video2URL-Timestamp`（秒级）与 `Video2URL-Signature`（`v1=<hex_hmac_sha256>`）。服务端签名算法为 `HMAC-SHA256(secret, "${timestamp}.${rawBody}")`。

```typescript
import { verifyWebhookSignature, type WebhookEvent } from 'video2url';

// 接入方业务系统自行实现的业务去重与处理函数（非 SDK 内置函数）
// 必须基于数据库唯一约束（如 UNIQUE(event.id)）与事务，原子化保证去重与业务副作用一致
declare function processEventOnce(event: WebhookEvent): Promise<void>;

export async function handleWebhookRequest(request: Request) {
  // 1. 获取未解析的原始请求体（必须是 raw string 或 Uint8Array，严禁解析后再 stringify）
  const rawBody = await request.text();

  const signature = request.headers.get('Video2URL-Signature') ?? '';
  const timestamp = request.headers.get('Video2URL-Timestamp') ?? '';
  const headerEventId = request.headers.get('Video2URL-Event-Id') ?? '';

  // 2. 校验签名（默认时间容差 toleranceSeconds 为 300 秒；若指定 now 覆盖值，单位为毫秒）
  const isValid = await verifyWebhookSignature(rawBody, {
    secret: process.env.VIDEO2URL_WEBHOOK_SECRET!,
    signature,
    timestamp,
    toleranceSeconds: 300,
  });

  if (!isValid) {
    return new Response('Invalid Signature', { status: 401 });
  }

  // 3. 反序列化 Payload 并校验头信息一致性
  const event: WebhookEvent = JSON.parse(rawBody);
  if (event.id !== headerEventId) {
    return new Response('Event ID Mismatch', { status: 400 });
  }

  // 4. 原子化执行去重与业务逻辑后再返回 200
  await processEventOnce(event);

  return new Response('OK', { status: 200 });
}
```

---

## 纯链接离线辅助工具（无网络开销）

以下工具函数基于官方 `video2url.com` 域名离线运行（自定义域名请直接使用 API 返回的 `url`）：

```typescript
import {
  parseShareUrl,
  buildShareUrl,
  buildDirectUrl,
  toMarkdownLink,
} from 'video2url';

// 1. 构建标准分享页 URL -> https://video2url.com/v/quick-start-demo
const shareUrl = buildShareUrl('quick-start-demo');

// 2. 构建资源直链 URL -> https://video2url.com/api/shares/quick-start-demo/direct
const directUrl = buildDirectUrl('quick-start-demo');

// 3. 生成安全 Markdown 链接语法
const mdLink = toMarkdownLink('quick-start-demo', '点击查看 [演示]');
// 输出: [点击查看 \[演示\]](https://video2url.com/v/quick-start-demo)

// 4. 解析分享链接：允许官方 URL 携带 query 与 fragment，并返回去除 query/fragment 的规范化 URL 与 slug；
const parsed = parseShareUrl('https://video2url.com/v/quick-start-demo?autoplay=1#player');
if (parsed) {
  console.log('Slug:', parsed.slug); // 'quick-start-demo'
  console.log('规范化 URL:', parsed.url); // 'https://video2url.com/v/quick-start-demo'
}
```

---

## 错误处理与规范化机制

SDK 业务异常与 HTTP 失败统一封装为 `Video2URLError` 类：

```typescript
import fs from 'node:fs';
import { Video2URL, Video2URLError } from 'video2url';

const client = new Video2URL({ apiKey: process.env.VIDEO2URL_API_KEY! });
const fileBuffer = fs.readFileSync('video.mp4');

try {
  await client.upload(fileBuffer, { filename: 'test.mp4', mimeType: 'video/mp4' });
} catch (error) {
  if (error instanceof Video2URLError) {
    console.error('业务错误码:', error.code);        // 如 'REQUEST_FAILED', 'TIMEOUT', 'ABORTED'
    console.error('HTTP 状态码:', error.status);      // 如 400, 401, 404, 500
    console.error('追踪 Request ID:', error.requestId);
    console.error('重试冷却秒数:', error.retryAfter);
    console.error('关联上下文 ID:', error.uploadId, error.fileId, error.importId);
    console.error('失败原因与回调句柄:', error.reason, error.callbackId, error.callbackStatus, error.callbackError);
    console.error('底层诱因:', error.cause);
  } else {
    console.error('系统原生错误:', error);
  }
}
```

- **错误规范化规则**：高层复合接口（`upload`、`uploadMultipart`、`waitForImport`、`uploadFromUrl`）在底层异常时统一规范化：普通网络异常规范化为 `REQUEST_FAILED`，超时规范化为 `TIMEOUT`，取消规范化为 `ABORTED`（保留原始 `cause` 及已产生的 `uploadId`、`fileId`、`importId`、`reason`、`callbackId` 等句柄以便业务恢复）。低层简单接口在网络不通时仍可能直接抛出原生的 `TypeError` 或 `AbortError`。

---

## 边界说明与许可证

- **功能边界声明**：本 SDK 专注于媒体文件流转、分享生命周期及开发集成链路。账户注册、账单结算、订阅升级及外部 DNS 解析托管均属于 Web 控制台与第三方服务商范畴，SDK 不提供相关接口封装。
- **开源许可证**：[MIT License](https://github.com/Ninglz/video2url-share-links/blob/main/LICENSE)