# Video2URL

Video2URL 官方 JavaScript / TypeScript SDK，支持 Node.js (>= 20) 环境下的 ESM 与 CommonJS，附带完整 TypeScript 类型定义。

提供直接二进制上传、远程 URL 媒体导入、文件与分享链接生命周期管理等服务端 API，并保留纯链接辅助工具函数。

- 官网主页: https://video2url.com
- API 文档: https://video2url.com/docs/api
- GitHub 仓库: https://github.com/Ninglz/video2url-share-links

> **使用须知与权限约定**
> - **仅限服务端使用**：请在安全后端环境配置 `VIDEO2URL_API_KEY`，切勿暴露在浏览器端或任何客户端构建包中。
> - **计划与订阅**：本 SDK 源码及 npm 安装包免费开源，但调用 Video2URL API 需拥有已激活 API 访问权限的付费账户（Pro / Business / Lifetime）。安装或使用本 SDK 不免除付费计划要求。
> - **权限范围（Scopes）**：包含 `files:read`、`files:write`、`uploads:write`、`shares:read`、`shares:write`。旧版本 API Key 需重新签发以获取新权限。
> - **范围边界**：本 SDK 专注于文件与分享链接的开发者调用链，不提供账单及账户管理等 Web 控制台功能。

---

## 安装

```bash
npm install video2url
```

---

## 快速上手

```typescript
import { Video2URL, Video2URLError } from 'video2url';
import fs from 'node:fs';

const apiKey = process.env.VIDEO2URL_API_KEY;
if (!apiKey) {
  throw new Error('缺少环境变量 VIDEO2URL_API_KEY');
}

// 初始化服务端客户端
const client = new Video2URL({
  apiKey,
  timeout: 60000,
});

// 1. 直传文件（upload 总是会创建分享链接并返回其访问 URL）
const buffer = fs.readFileSync('video.mp4');
const uploadResult = await client.upload(buffer, {
  filename: 'video.mp4',
  mimeType: 'video/mp4',
  share: { visibility: 'public', title: '示例视频' },
});
console.log('分享链接:', uploadResult.url);

// 2. 远程 URL 导入（快捷等待终态）
const importResult = await client.uploadFromUrl('https://example.com/demo.mp4', {
  filename: 'demo.mp4',
  share: { visibility: 'unlisted' },
});
console.log('导入成功，分享 URL:', importResult.url);
```

---

## 核心 API 参考

### 1. 客户端初始化与配置

客户端构造函数接收 `ClientOptions` 配置对象：

```typescript
interface ClientOptions {
  apiKey: string;
  baseUrl?: string; // 默认官方 API 地址
  timeout?: number; // 默认 60000 毫秒
}
```

示例：

```typescript
const client = new Video2URL({
  apiKey,
  baseUrl: 'https://video2url.com',
  timeout: 60000,
});
```

> 具有副作用的写操作请求（上传、创建、删除）不执行静默自动重试，以防止网络异常重发导致重复资源。

### 2. 文件上传 (`upload` 与底层分步接口)

- **一键上传并分享 (`client.upload`)**：
  将媒体二进制数据直传至存储节点并通知服务端完成入库。`upload` 始终会自动创建分享链接，结果中的 `url` 即为该分享访问链接。
  - 输入类型：`Blob | Uint8Array | ArrayBuffer`
  - 参数签名：`client.upload(data, { filename, mimeType, share?, signal? })`
  - 返回结果：`{ url, share, uploadId, file }`

- **无需创建分享的底层分步上传**：
  若仅需入库文件而不创建任何分享链接，可使用底层分步流程：
  ```typescript
  // 1. 获取预签名上传凭证
  const uploadSession = await client.createUpload({
    filename: 'raw.mp4',
    mimeType: 'video/mp4',
    sizeBytes: buffer.byteLength,
  });

  // 2. 自行 PUT 上传至 uploadSession.upload.url
  await fetch(uploadSession.upload.url, {
    method: 'PUT',
    body: buffer,
    headers: uploadSession.upload.headers,
  });

  // 3. 确认入库（不创建分享）
  const fileRecord = await client.completeUpload(uploadSession.uploadId);
  ```

### 3. 远程 URL 媒体导入

- **约束规范**：仅支持返回有效且大于 0 的 `Content-Length` 的公开 HTTPS 直接媒体链接；最多跟随 5 次重定向；禁止内网/私有 IP；不支持需鉴权或页面渲染的网页提取。
- **异步持久化作业模型**：`startImport` 启动后台任务。即使本地调用进程中断，服务端仍会继续执行。请持久化保存 `importId` 以备检索。

```typescript
// 启动后台异步导入
const { importId } = await client.startImport('https://cdn.example.com/asset.mp4', {
  filename: 'asset.mp4',
  mimeType: 'video/mp4',
});

// 随后或在重启任务中检索已保存作业的状态
const savedJob = await client.getImport(importId);
console.log('作业状态:', savedJob.status);

// 轮询直至完成
const job = await client.waitForImport(importId, {
  timeout: 600000,
  pollInterval: 2000,
});

// 或使用集成了启动与等待的快捷封装
const result = await client.uploadFromUrl('https://cdn.example.com/asset.mp4', {
  filename: 'asset.mp4',
  share: { visibility: 'public' },
});
console.log('导入分享 URL:', result.url);
```

### 4. 资源列表与详情查询

- `listUploads({ limit?: number, cursor?: string, signal?: AbortSignal })`: limit 取值范围 `1..100`，返回 `{ items, nextCursor }`。
- `listFiles({ limit?: number, cursor?: string, signal?: AbortSignal })`: 分页获取已入库文件列表。
- `listShares({ limit?: number, cursor?: string, signal?: AbortSignal })`: 分页获取分享链接列表。
- `getUpload(id)`: 获取指定上传会话记录详情。
- `getFile(id)`: 获取指定文件详情。
- `getShare(id)`: 获取指定分享链接详情。
- `getImport(id)`: 获取指定远程导入作业记录与执行状态。

### 5. 分享链接与文件管理

- **创建分享 (`createShare`)**：
  ```typescript
  const tomorrowIso = new Date(Date.now() + 86400000).toISOString();

  // 公开/未列出分享
  const share = await client.createShare({
    fileId: 'file_123',
    title: '演示视频',
    visibility: 'public',
    expiresAt: tomorrowIso, // 过期时间不能超过底层文件保留期限
  });

  // 密码保护分享（密码必须至少 8 个字符）
  const pwShare = await client.createShare({
    fileId: 'file_123',
    visibility: 'password',
    password: 'securePassword123',
  });
  ```

- **更新分享 (`updateShare`)**：
  ```typescript
  await client.updateShare(share.share.shareId, {
    title: '新标题',
    action: 'disable', // 'enable' | 'disable'
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  });
  ```

- **删除分享 (`deleteShare`)**：停用并软删除指定分享链接。
- **删除文件 (`deleteFile`)**：清理底层存储二进制并标记文件记录为已删除（非数据库硬删除）。若当前文件仍有关联且未删除的分享链接，删除操作将失败，必须先删除所有关联的分享链接。

### 6. 纯链接辅助工具函数（无网络请求）

提供无依赖的纯文本与 URL 计算工具：

```typescript
import {
  buildShareUrl,
  buildDirectUrl,
  toMarkdownLink,
  parseShareUrl,
} from 'video2url';

// 生成分享 URL: https://video2url.com/v/sample-slug
const shareUrl = buildShareUrl('sample-slug');

// 生成直链 URL
const directUrl = buildDirectUrl('sample-slug');

// 生成 Markdown 超链接: [示例视频](https://video2url.com/v/sample-slug)
const md = toMarkdownLink('sample-slug', '示例视频');

// 解析分享 URL 提取 slug
const parsed = parseShareUrl('https://video2url.com/v/sample-slug');
console.log(parsed?.slug); // 'sample-slug'
```

### 7. 错误处理

服务端业务与 HTTP 状态异常统一抛出 `Video2URLError` 实例；原生网络故障、DNS 失败或 `AbortSignal` 取消则会抛出标准系统异常（如 `TypeError`、`DOMException` / `AbortError`）。

```typescript
import { Video2URL, Video2URLError } from 'video2url';

try {
  await client.getFile('file_nonexistent');
} catch (error) {
  if (error instanceof Video2URLError) {
    console.error('业务错误码:', error.code);
    console.error('HTTP 状态码:', error.status);
    console.error('链路跟踪 ID:', error.requestId);
    console.error('重试建议秒数:', error.retryAfter);
  } else {
    console.error('系统或网络错误:', error);
  }
}
```

---

## 许可证

MIT License
