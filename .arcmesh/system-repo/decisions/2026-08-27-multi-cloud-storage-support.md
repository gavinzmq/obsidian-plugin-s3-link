# 决策：多对象存储支持（腾讯云 COS、阿里云 OSS 等国内存储）

> 日期：2026-08-27
> 状态：**已实现**（2026-08-27）
> 关联文档：`../architecture.md`（§4.6 网络层、§4.9 设置、§6 数据存储 已同步更新）

## 1. 背景与动机

当前插件深度绑定 AWS 生态：

- 设置 UI 提供 AWS **Region 下拉**（内置 27 个 AWS 区域）与 **AWS Profile 下拉**（读取 `~/.aws/credentials`）
- 网络层直接使用 `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`
- 版本检测依赖 S3 的 `versionId`（`ListObjectVersionsCommand`）

国内用户主要使用腾讯云 COS 与阿里云 OSS，需求：

1. 支持腾讯云 COS、阿里云 OSS 及任意 S3 兼容存储（如 MinIO）
2. UI 不再绑定单一厂商：**移除 AWS Region / AWS Profile 下拉，所有配置改为文本输入（input）**
3. 保持 `s3:[objectKey]` / `s3-sign:[objectKey]` 链接语法向后兼容

## 2. 设计目标

| # | 目标 | 状态 |
| --- | --- | --- |
| G1 | 通用"存储源"模型同时覆盖 AWS S3 / 腾讯 COS / 阿里 OSS / S3 兼容端点 | ✅ 已实现 |
| G2 | 设置 UI 全部使用文本输入，不出现任何厂商专属下拉 | ✅ 已实现 |
| G3 | 旧版设置（`data.json`）自动迁移，无需用户手动重新配置 | ✅ 已实现 |
| G4 | 缓存、下载管理、签名 URL 续签等既有机制复用，以抽象"版本令牌"替代 AWS `versionId` | ✅ 已实现 |
| G5 | 链接语法与现有 vault 内容 100% 向后兼容 | ✅ 已实现 |

## 3. 核心设计（实现后定稿）

### 3.1 数据模型：StorageSource（存储源）

```ts
interface StorageSource {
    id: string;               // 内部唯一 id（随机生成，用于缓存键区分）
    name: string;             // 显示名，用户自定义（如 "公司COS"）
    provider: string;         // 文本输入："aws" | "tencent-cos" | "aliyun-oss" | "s3-compatible"
    endpoint: string;         // 自定义 endpoint（文本输入；aws 可留空，cos/oss 必填）
    bucketName: string;       // 桶名（文本输入）
    region: string;           // 区域（文本输入，可留空）
    accessKeyId: string;      // Access Key ID（文本输入）
    secretAccessKey: string;  // Secret Access Key（文本输入）
    pathStyle: boolean;       // 是否 path-style 寻址（自定义 endpoint 通常需要）
    defaultSource: boolean;   // 是否为默认源（无前缀 s3: 链接指向它）
    signLinkEnabled: boolean; // 是否启用 s3-sign 签名链接
}
```

`provider` 采用文本输入，设置项描述列出合法值；`region` 为自由文本。

### 3.2 设置迁移（v1 → v2）

`loadSettings()` 检测旧格式（顶层存在 `bucketName`）→ `migrateLegacySettings` 生成单 `StorageSource`（`provider="aws"`、`defaultSource=true`）并写回。`AwsCredentialProvider` / `AwsProfile` 从 UI 下线，`src/aws/` 目录删除。

### 3.3 网络层：Provider Adapter 模式（已实现）

```ts
interface StorageClient {
    getVersionToken(objectKey: string): Promise<string | undefined>;
    getObject(objectKey: string, versionToken: string): Promise<Readable>;
    getSignedUrl(objectKey: string): Promise<string>;
}
```

| 适配器 | 依赖 | 版本标识 | 签名 URL |
| --- | --- | --- | --- |
| `S3CompatibleClient` | `@aws-sdk/client-s3` | `VersionId` | `@aws-sdk/s3-request-presigner` |
| `TencentCosClient` | `cos-nodejs-sdk-v5` | headObject `ETag` | `cos.getObjectUrl()` |
| `AliyunOssClient` | `ali-oss` | head `res.headers.etag` | `client.signatureUrl()` |

`StorageClientFactory.create(source)` 按 `provider` 分发；`aws`/`s3-compatible` 共用 `S3CompatibleClient`（`endpoint`+`forcePathStyle`）。

### 3.4 缓存层：版本令牌（versionToken）统一（已实现）

- `model/s3Link.ts`：`versionId` → `versionToken`（新增 `sourceId` 字段）
- 缓存文件名：`<sha1(versionToken)><extname>`
- localStorage 键含源维度：`obsidian-plugin-s3-link/<sourceId>/<objectKey>`（签名：`/s3-sign/<objectKey>`）
- 下载记录键：`obsidian-plugin-s3-link-manager/<sourceId>/<objectKey>/<versionToken>`
- `CACHE_SCHEMA_VERSION = 2`，升级时 `Cache.init` 自动 `clearCache()` 一次

### 3.5 链接语法（已实现，向后兼容）

| 语法 | 含义 |
| --- | --- |
| `s3:[objectKey]` | 默认源下载缓存 |
| `s3-sign:[objectKey]` | 默认源签名 URL |
| `s3:[sourceName/objectKey]` | 指定源（`resolveSourceKey` 在 `S3PostProcessor` 解析） |
| `s3-sign:[sourceName/objectKey]` | 指定源签名 URL |

### 3.6 设置 UI（已实现，全 input）

- 删除 AWS Region 下拉（`REGIONS` 表废弃）与 AWS Profile 下拉
- 每源字段全部 `addText`；布尔项用 `addToggle`；支持添加/删除源
- `isPluginReadyState` 按源校验

## 4. 影响模块清单（实现后）

| 模块 | 改动 |
| --- | --- |
| `src/config.ts` | 移除 `AWS_PROFILE_NAME_NONE` 等；新增 `PROVIDERS`、`SOURCE_SPLITTER`、`CACHE_SCHEMA_VERSION(KEY)` |
| `src/settings/settings.ts` | 新 `StorageSource`/`PluginSettings`；`isLegacySettings`/`migrateLegacySettings`/`resolveSourceKey`；`REGIONS` 废弃 |
| `src/settings/settingsTab.ts` | 全 input 重写，多源管理 |
| `src/aws/` | 已删除 |
| `src/network/` | `Client` → `StorageClient` + 3 适配器 + `StorageClientFactory`；`DownloadManager` 加 sourceId |
| `src/cache.ts` | versionToken + sha1 文件名 + sourceId 键 + 升级清理；修复签名键删除 bug |
| `src/model/s3Link.ts` | `versionId` → `versionToken`（+`sourceId`） |
| `src/s3PostProcessor.ts` / `src/obsidianHelper.ts` | 多源解析、versionToken、`getCacheFileName` |
| `src/command/clearCacheLocalCommand.ts` | 经 `resolveSourceKey` 多源清理 |
| `src/resolver/*` | 不变（仅提取原始键，归属由后处理器解析） |
| `package.json` | 新增 `cos-nodejs-sdk-v5`、`ali-oss` |
| `test/` | cache/downloadManager 测试适配新 API；新增 `test/mock/obsidianMock.ts` + `moduleNameMapper`（修复 obsidian 运行时解析） |

## 5. 实施记录（2026-08-27 完成）

1. ✅ 设置模型与 v1→v2 迁移
2. ✅ `StorageClient` 接口 + `StorageClientFactory`
3. ✅ `S3CompatibleClient`（endpoint/forcePathStyle）
4. ✅ `TencentCosClient` + `AliyunOssClient`
5. ✅ 缓存层 versionToken 改造与升级清理
6. ✅ 设置 UI 全 input 重写
7. ✅ 多源前缀解析（`resolveSourceKey`）
8. ✅ 测试适配 + obsidian mock；`tsc` 类型检查、esbuild 构建、Jest（6 套件/35 用例）、ESLint 全部通过

## 6. 风险与开放问题（实现后评估）

**风险**：

- COS/OSS 的 S3 兼容接口完整度未经真实验证 → 已采用原生 adapter，规避兼容性问题
- 签名 URL 有效期上限厂商差异（COS/OSS 上限需实测）→ 当前统一 7 天
- 大文件流式下载在 COS/OSS SDK 的 API 差异 → 使用 `getObjectStream` / `getStream`，需真桶验证
- 多分片对象 ETag 带 `-N` 后缀 → 版本令牌比较仍可用，需注意

**开放问题（后续）**：

- provider 当前为纯文本输入（按需求），可考虑加自动补全
- `s3:[sourceName/objectKey]` 前缀语法已实现为可选扩展
- 真实桶上的 COS/OSS 适配器端到端联调尚未执行（需真实凭证）
