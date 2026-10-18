# video2url-share-links

`video2url-share-links` 是一个轻量、纯粹的 URL 解析与链接构建工具包，适用于浏览器与 Node.js 环境。本库专用于处理 [Video2URL](https://video2url.com/) 平台的分享链接格式，完全零依赖。

> **说明**：
> - 本包**仅执行字符串与 URL 规范化计算**，**不包含**任何上传功能、网络请求、认证凭据或服务端鉴权交互。
> - 本包遵循 MIT 开源协议，源码托管于 [Ninglz/video2url-share-links](https://github.com/Ninglz/video2url-share-links)。

---

## 安装

```bash
npm install video2url-share-links
```

---

## 功能特性

- **零依赖与通用运行环境**：基于纯 JavaScript 实现（零外部依赖），附带完整的 TypeScript 类型声明（`.d.ts`），兼容现代浏览器与 Node.js（支持 Node.js >= 20）。
- **双模块格式支持**：原生同时支持 ESM (`import`) 与 CommonJS (`require`)。
- **严格的安全校验**：
  - 仅识别严格的 `https://video2url.com` 来源（禁止 `http`、禁止子域名如 `www`、禁止非 443 自定义端口、禁止包含用户名或密码凭证）。
  - 在 URL 规范化之前采用严格原始正则拦截畸形路径（禁止反斜杠、双斜杠、路径遍历点段如 `..`、百分号编码斜杠 `%2f` / `%5c` 等）。
  - 路径严格匹配 `/v/{slug}`，其中 `slug` 仅允许 1 到 128 位的字母、数字、下划线 `_` 与连字符 `-`。
  - 解析时自动剥离 query 参数与 hash 锚点。
- **Markdown 注入防护**：格式化 Markdown 链接时自动将反斜杠、方括号、尖括号、反引号、星号、下划线、波浪号、感叹号转义，并将回车/换行/控制字符替换为空格。

---

## 导出的 API 规范

### 1. `parseShareUrl(input: unknown): { slug: string; url: string } | null`
解析给定的 URL 字符串。如果符合 Video2URL 分享链接格式，返回规范化的 `{ slug, url }`；输入非字符串或不符合规范时返回 `null`。

### 2. `buildShareUrl(slug: string): string`
根据传入的 `slug` 构建标准的分享查看 URL（`https://video2url.com/v/${slug}`）。若 `slug` 不符合规范（非 1-128 位的 `[a-zA-Z0-9_-]`），抛出 `TypeError`。

### 3. `toMarkdownLink(slug: string, label: string): string`
构建安全的 Markdown 链接格式 `[safeLabel](https://video2url.com/v/${slug})`。自动对标签中的反斜杠 `\`、方括号 `[` `]`、尖括号 `<` `>`、反引号 `` ` ``、星号 `*`、下划线 `_`、波浪号 `~`、感叹号 `!` 进行转义，并将回车/换行/控制字符转换为空格，防止 Markdown 与 HTML 格式注入。若参数不符合规范，抛出 `TypeError`。

### 4. `buildDirectUrl(slug: string): string`
拼接生成资源直接访问路径字符串：`https://video2url.com/api/shares/${slug}/direct`。若 `slug` 不符合规范，抛出 `TypeError`。
**注意**：此辅助函数仅负责拼装标准格式的 URL 文本，**并不保证该链接的实际网络可达性或权限有效性**，实际访问结果仍取决于平台服务端的权限与保留策略。

---

## 使用示例

```typescript
import {
  parseShareUrl,
  buildShareUrl,
  toMarkdownLink,
  buildDirectUrl
} from 'video2url-share-links';

// 1. 解析链接
const parsed = parseShareUrl('https://video2url.com/v/demo-video_123?autoplay=1#t=10');
if (parsed) {
  console.log(parsed.slug); // "demo-video_123"
  console.log(parsed.url);  // "https://video2url.com/v/demo-video_123"
}

// 非法链接返回 null
console.log(parseShareUrl('https://www.video2url.com/v/abc')); // null (不允许 www)
console.log(parseShareUrl('http://video2url.com/v/abc'));      // null (不允许 http)

// 2. 构建分享链接
const shareUrl = buildShareUrl('demo-video_123');
console.log(shareUrl); // "https://video2url.com/v/demo-video_123"

// 3. 构建安全的 Markdown 链接
const md = toMarkdownLink('demo-video_123', '查看 [演示\n视频]');
console.log(md); // "[查看 \\[演示 视频\\]](https://video2url.com/v/demo-video_123)"

// 4. 构建 Direct 接口 URL 字符串
const directUrl = buildDirectUrl('demo-video_123');
console.log(directUrl); // "https://video2url.com/api/shares/demo-video_123/direct"
```

---

## 测试

运行测试套件（要求 Node.js >= 20）：

```bash
npm test
```

---

## 相关链接

- 平台官网：[https://video2url.com/](https://video2url.com/)
- 官方文档：[https://video2url.com/docs](https://video2url.com/docs)
- 源码仓库：[https://github.com/Ninglz/video2url-share-links](https://github.com/Ninglz/video2url-share-links)

## 开源协议

[MIT](LICENSE)