# 决策：多对象存储支持（腾讯云 COS、阿里云 OSS 等国内存储）

> 日期：2026-08-27
> 状态：**已实现**（2026-08-27），并包含后续 UI 增强修订（见 §7）
> 关联文档：`../architecture.md`（§4.6 网络层、§4.9 设置、§6 数据存储 已同步更新）

## 1. 背景与动机

当前插件深度绑定 AWS 生态：

- 设置 UI 提供 AWS **Region 下拉**（内置 27 个 AWS 区域）与 **AWS Profile 下拉**（读取 `~/.aws/credentials`）
- 网络层直接使用 `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`
- 版本检测依赖 S3 的 `versionId`（`ListObjectVersionsCommand`）

国内用户主要使用腾讯云 COS 与阿里云 OSS，需求：

1. 支持腾讯云 COS、阿里云 OSS 及任意 S3 兼容存储（如 MinIO）
2. UI 不再绑定单一厂商：移除 AWS Region / AWS Profile 下拉
3. 保持 `s3:[objectKey]` / `s3-sign:[objectKey]` 链接语法向后兼容

## 2. 设计目标

| # | 目标 | 状态 |
| --- | --- | --- |
| G1 | 通用"存储源"模型同时覆盖 AWS S3 / 腾讯 COS / 阿里 OSS / S3 兼容端点 | ✅ |
| G2 | 设置 UI 不出现厂商专属的 AWS Region/Profile 下拉（Provider 经修订改为下拉，见 §7） | ✅ |
| G3 | 旧版设置（`data.json`）自动迁移 | ✅ |
| G4 | 缓存、下载管理、签名 URL 复用，以"版本令牌"替代 AWS `versionId` | ✅ |
| G5 | 链接语法 100% 向后兼容 | ✅ |

## 3. 核心设计（实现后定稿）

### 3.1 数据模型：StorageSource（存储源）

```ts
interface StorageSource {
    id: string;
    name: string;
    provider: string;         // aws | tencent-cos | aliyun-oss | s3-compatible
    endpoint: string;         // 仅 s3-compatible 使用；已知服务商自动组合
    bucketName: string;
    region: string;           // 已知服务商用于组合端点
    accessKeyId: string;
    secretAccessKey: string;
    pathStyle: boolean;       // 仅 s3-compatible 使用
    defaultSource: boolean;
    signLinkEnabled: boolean;
}

interface PluginSettings {
    sources: StorageSource[];
    language: Language;       // "en" | "zh"（i18n）
}
```

### 3.2 设置迁移（v1 → v2）

`loadSettings()` 检测旧格式（顶层存在 `bucketName`）→ `migrateLegacySettings` 生成单源（`provider="aws"`）并写入 `language:"en"`。`src/aws/` 目录删除。

### 3.3 网络层：Provider Adapter 模式（已实现）

```ts
interface StorageClient {
    getVersionToken(objectKey: string): Promise<string | undefined>;
    getObject(objectKey: string, versionToken: string): Promise<Readable>;
    getSignedUrl(objectKey: string): Promise<string>;
    testConnection(): Promise<void>;   // 新增：连接测试
}
```

| 适配器 | 版本标识 | 签名 URL | 测试连接 |
| --- | --- | --- | --- |
| `S3CompatibleClient` | `VersionId` | presigner | ListObjectsV2（MaxKeys=1） |
| `TencentCosClient` | headObject `ETag` | `cos.getObjectUrl` | `cos.getBucket` |
| `AliyunOssClient` | head `etag` | `client.signatureUrl` | `client.list` |

### 3.4 缓存层（已实现）

- `versionToken` 统一（AWS VersionId / COS·OSS ETag）；文件名 `sha1(versionToken)+ext`
- localStorage 键含源维度：`obsidian-plugin-s3-link/<sourceId>/<objectKey>`（签名 `/s3-sign/`）
- `CACHE_SCHEMA_VERSION=2`，升级自动清缓存

### 3.5 链接语法（已实现，向后兼容）

`s3:[objectKey]`、`s3-sign:[objectKey]`、可选 `s3:[sourceName/objectKey]` 多源前缀。

### 3.6 设置 UI（已实现，含 §7 修订）

见 §7。

## 4. 影响模块清单（实现后）

`config.ts` / `settings/settings.ts` / `settings/settingsTab.ts` / `network/*`（适配器+工厂）/ `cache.ts` / `model/s3Link.ts` / `s3PostProcessor.ts` / `obsidianHelper.ts` / `command/clearCacheLocalCommand.ts` / `i18n.ts`（新增）/ `main.ts` / `package.json` / `test/*`。

## 5. 实施记录（2026-08-27 完成）

设置模型与迁移、StorageClient 体系、三适配器、缓存 versionToken 改造、设置 UI、多源解析、测试适配（6 套件 / 35 用例）、类型检查与构建全绿。

## 6. 风险与开放问题

- COS/OSS 适配器需真实桶端到端联调（SDK 无完整类型，`@ts-ignore`）
- 签名 URL 有效期上限厂商差异需实测
- 多分片对象 ETag 带 `-N` 后缀需注意
- 连接测试对 OSS 使用 `client.list`、COS 使用 `getBucket`，需真实桶验证权限

## 7. 设计修订（2026-08-27 UI 增强，已实现）

用户后续明确要求，覆盖原 §3.6"全部用 input"：

1. **Provider 改为下拉选择**：`addDropdown`，选项为 aws / tencent-cos / aliyun-oss / s3-compatible（本地化文案）。其余字段仍为文本输入或开关。
2. **Endpoint 自动组合 + 条件显示**：
   - 已知服务商（AWS / 腾讯 COS / 阿里 OSS，`isKnownProvider`）不显示端点输入框；端点由 Region 自动组合：
     - 腾讯 COS：`https://cos.<region>.myqcloud.com`
     - 阿里 OSS：`https://oss-<region>.aliyuncs.com`
     - AWS：留空，SDK 使用默认端点
   - 仅 `s3-compatible` 显示自定义端点输入（必填）与 `pathStyle` 开关
   - 切换服务商时自动清空自定义端点
3. **测试连接**：每源「Test Connection / 测试连接」按钮 → `StorageClientFactory.create(source).testConnection()` → 成功/失败通知。
4. **多语言（i18n）**：新增 `src/i18n.ts`（`Language` = `en | zh`，`setLanguage` / `t(key)`）；`PluginSettings.language`；设置页顶部语言下拉，切换后 UI 实时重渲染为对应语言。
