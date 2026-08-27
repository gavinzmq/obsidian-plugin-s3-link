# 决策：多对象存储支持（腾讯云 COS、阿里云 OSS 等国内存储）

> 日期：2026-08-27
> 状态：**已实现**（2026-08-27），含 UI 增强修订（§7）与 COS 浏览器 SDK 调整（§3.3）
> 关联文档：`../architecture.md`

## 1. 背景与动机

插件深度绑定 AWS 生态（Region 下拉、`~/.aws/credentials` Profile、AWS SDK）。国内用户主要使用腾讯云 COS 与阿里云 OSS，需求：支持 COS / OSS / S3 兼容存储；UI 不绑定单一厂商；保持 `s3:` / `s3-sign:` 语法向后兼容。

## 2. 设计目标

G1 通用存储源模型 ✅；G2 不出现厂商专属的 AWS Region/Profile 下拉（Provider 改为下拉，见 §7）✅；G3 旧设置自动迁移 ✅；G4 缓存/下载/签名复用，统一版本令牌 ✅；G5 链接语法向后兼容 ✅。

## 3. 核心设计（实现后定稿）

### 3.1 StorageSource / PluginSettings

```ts
interface StorageSource { id; name; provider; endpoint; bucketName; region; accessKeyId; secretAccessKey; pathStyle; defaultSource; signLinkEnabled; }
interface PluginSettings { sources: StorageSource[]; language: Language; autoReplaceEnabled: boolean; }
```

### 3.2 设置迁移（v1 → v2）

`loadSettings` 检测旧格式 → 迁移为单源 + `language:"en"` + `autoReplaceEnabled:false`。`src/aws/` 删除。

### 3.3 网络层：Provider Adapter

```ts
interface StorageClient {
    getVersionToken(objectKey): Promise<string | undefined>;
    getObject(objectKey, versionToken): Promise<Readable>;
    getSignedUrl(objectKey): Promise<string>;
    testConnection(): Promise<void>;
}
```

| 适配器 | 依赖 | 版本标识 | 签名 URL | 测试连接 |
| --- | --- | --- | --- | --- |
| `S3CompatibleClient` | `@aws-sdk/client-s3` | `VersionId` | presigner | ListObjectsV2 |
| `TencentCosClient` | `cos-js-sdk-v5`（浏览器） | headObject `ETag` | `cos.getObjectUrl` | `cos.getBucket` |
| `AliyunOssClient` | `ali-oss` | head `etag` | `client.signatureUrl` | `client.list` |

> **COS 浏览器 SDK 调整（2026-08-27）**：Obsidian 运行于渲染进程，`cos-nodejs-sdk-v5`（Node 服务端）不适用，改用 `cos-js-sdk-v5@^1.10.1`。`getObjectStream` 改为 `getObject`，响应体经 `bodyToReadable` 转 Node `Readable` 落盘；代价为整对象缓冲（无增量流式）。

### 3.4 缓存层

`versionToken` 统一；文件名 `sha1(versionToken)+ext`；localStorage 键含 sourceId；`CACHE_SCHEMA_VERSION=2` 升级自动清缓存。

### 3.5 链接语法（向后兼容）

`s3:[objectKey]`、`s3-sign:[objectKey]`、可选 `s3:[sourceName/objectKey]` 前缀。

### 3.6 设置 UI（含 §7 修订）

见 §7。

## 4. 影响模块清单

`config.ts` / `settings/*` / `network/*` / `cache.ts` / `model/s3Link.ts` / `s3PostProcessor.ts` / `obsidianHelper.ts` / `command/clearCacheLocalCommand.ts` / `autoReplace.ts` / `i18n.ts` / `main.ts` / `package.json` / `test/*`。

## 5. 实施记录（2026-08-27 完成）

设置模型与迁移、StorageClient 体系、三适配器、缓存 versionToken 改造、设置 UI、多源解析、自动替换、测试适配（7 套件 / 44 用例）、类型检查与构建全绿。

## 6. 风险与开放问题

- `ali-oss` 亦为 Node 目标 SDK，浏览器环境下是否可用需真机验证（用户已确认 COS 改用浏览器 SDK；OSS 待确认）
- COS 浏览器 SDK 整对象缓冲，超大文件内存占用需注意
- 签名 URL 有效期上限、连接测试权限需真实桶联调
- 多分片对象 ETag 带 `-N` 后缀需注意

## 7. 设计修订（2026-08-27 UI 增强，已实现）

1. Provider 下拉选择（覆盖原"全 input"要求）
2. Endpoint 已知服务商按 Region 自动组合（COS `https://cos.<region>.myqcloud.com`；OSS `https://oss-<region>.aliyuncs.com`；AWS 留空），UI 不显示输入框；仅 S3 兼容显示自定义端点 + pathStyle
3. 测试连接：`StorageClient.testConnection()` + 设置页按钮
4. 多语言（i18n）：`src/i18n.ts`，`PluginSettings.language`

## 8. 附加修订（2026-08-27 自动替换）

- `src/autoReplace.ts`：正则匹配已配置存储源的 `https://` 链接（虚拟主机/路径寻址）替换为 `s3:` 格式；跳过 fenced 代码块
- `PluginSettings.autoReplaceEnabled` + vault 监听（modify/create）+ 防递归
