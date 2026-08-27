# 决策：多对象存储支持（腾讯云 COS、阿里云 OSS 等国内存储）

> 日期：2026-08-27
> 状态：设计定稿，待实现（不写代码，仅设计）
> 关联文档：`../architecture.md`（当前实现，§4.6 网络层、§4.9 设置、§6 数据存储）

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

| # | 目标 |
| --- | --- |
| G1 | 通用"存储源"模型同时覆盖 AWS S3 / 腾讯 COS / 阿里 OSS / S3 兼容端点 |
| G2 | 设置 UI 全部使用文本输入，不出现任何厂商专属下拉 |
| G3 | 旧版设置（`data.json`）自动迁移，无需用户手动重新配置 |
| G4 | 缓存、下载管理、签名 URL 续签等既有机制复用，以抽象"版本令牌"替代 AWS `versionId` |
| G5 | 链接语法与现有 vault 内容 100% 向后兼容 |

## 3. 核心设计

### 3.1 数据模型：StorageSource（存储源）

```ts
interface StorageSource {
    id: string;               // 内部唯一 id（随机生成，用于缓存键区分）
    name: string;             // 显示名，用户自定义（如 "公司COS"）
    provider: string;         // 文本输入："aws" | "tencent-cos" | "aliyun-oss" | "s3-compatible"
    endpoint: string;         // 自定义 endpoint（文本输入；aws 可留空，cos/oss 必填）
    bucketName: string;       // 桶名（文本输入）
    region: string;           // 区域（文本输入，可留空；不再使用下拉）
    accessKeyId: string;      // Access Key ID（文本输入）
    secretAccessKey: string;  // Secret Access Key（文本输入）
    pathStyle: boolean;       // 是否 path-style 寻址（自定义 endpoint 通常需要）
    defaultSource: boolean;   // 是否为默认源（无前缀 s3: 链接指向它）
    signLinkEnabled: boolean; // 是否启用 s3-sign 签名链接
}

interface PluginSettings {
    sources: StorageSource[]; // 多源数组；默认源恰好一个
}
```

**要点**：

- `provider` 采用**文本输入**（需求：全部用 input），设置项描述中列出合法值 `aws` / `tencent-cos` / `aliyun-oss` / `s3-compatible`；后续可在此基础上加自动补全，但不引入下拉。
- `region` 改为自由文本：COS 需要（如 `ap-guangzhou`），OSS 可留空，S3 兼容按需。
- 多源设计允许同一 vault 同时挂多个云；v1 阶段默认单源，接口预留多源。

### 3.2 设置迁移（v1 → v2）

`loadSettings()` 检测旧格式（顶层存在 `bucketName` 字段）时自动迁移：

- 生成单个 `StorageSource`：`provider="aws"`、`endpoint=""`、`pathStyle=false`、`defaultSource=true`，其余字段平移
- 迁移后写回 `data.json`（新格式），旧字段清除
- AWS Profile 功能下线：`AwsCredentialProvider` / `AwsProfile` / `~/.aws/credentials` 解析逻辑从 UI 移除（见 §4.4），已选 profile 的用户迁移时提示改填 Access Key

### 3.3 网络层：Provider Adapter 模式

`src/network/client.ts` 拆分为接口 + 适配器 + 工厂：

```ts
interface StorageClient {
    getVersionToken(objectKey: string): Promise<string | undefined>; // 最新版本标识
    getObject(objectKey: string, versionToken: string): Promise<Readable>; // 流式下载
    getSignedUrl(objectKey: string): Promise<string>; // 签名 URL
}
```

| 适配器 | 依赖 | 版本标识（versionToken） | 签名 URL |
| --- | --- | --- | --- |
| `S3CompatibleClient` | `@aws-sdk/client-s3`（复用现有） | `VersionId` | `@aws-sdk/s3-request-presigner` |
| `TencentCosClient` | `cos-nodejs-sdk-v5` | headObject 的 `ETag` | `cos.getObjectUrl()` |
| `AliyunOssClient` | `ali-oss` | head 的 `res.headers.etag` | `client.signatureUrl()` |

- `StorageClientFactory.create(source)` 按 `provider` 字段创建对应适配器；`s3-compatible` 与 `aws` 共用 `S3CompatibleClient`（通过 `endpoint` + `forcePathStyle` 区分）。
- 现有 `DownloadManager` 生命周期（`PENDING → RUNNING → COMPLETED / FAILED`）不变，仅把 `versionId` 换为 `versionToken`。

### 3.4 缓存层：版本令牌（versionToken）统一

- 概念上把 `versionId` 泛化为 `versionToken`（AWS=VersionId，COS/OSS=ETag）
- 缓存文件名：`<sha1(versionToken)><extname>`，避免 ETag 中引号/特殊字符带来的路径问题
- `model/s3Link.ts` 字段 `versionId` → `versionToken`；localStorage 键格式不变（`obsidian-plugin-s3-link/<objectKey>`），值结构改名
- 缓存键增加源维度：`obsidian-plugin-s3-link/<sourceId>/<objectKey>`（多源同名 objectKey 不冲突）
- 因文件名规则变化，v1 旧缓存文件自然失效；升级后首次启动执行一次 `cache.clearCache()`，以 localStorage 中的 `CACHE_SCHEMA_VERSION`（=2）标记迁移

### 3.5 链接语法（向后兼容）

| 语法 | 含义 | 变化 |
| --- | --- | --- |
| `s3:[objectKey]` | 默认源下载缓存 | 不变 |
| `s3-sign:[objectKey]` | 默认源签名 URL | 不变 |
| `s3:[sourceName/objectKey]` | 指定源 | 新增（可选扩展） |
| `s3-sign:[sourceName/objectKey]` | 指定源签名 URL | 新增（可选扩展） |

- Resolver 解析时支持可选 `sourceName/` 前缀；无前缀回退默认源
- 默认源未配置或对象不存在时保持现状（忽略链接 + 控制台报错）

### 3.6 设置 UI 重写（`settingsTab.ts`）

- **删除**：AWS Region 下拉（`REGIONS` 常量表废弃）、AWS Profile 下拉（含 `None` 选项）、"profile 时禁用 Access Key"联动逻辑
- **改为全 input**：
  - 源列表：新增/删除源按钮 + 源切换；每源一个区块
  - 每源字段：`name`、`provider`、`endpoint`、`bucketName`、`region`、`accessKeyId`、`secretAccessKey` 全部 `addText`
  - `pathStyle` / `signLinkEnabled` / `defaultSource` 为布尔 `addToggle`
  - 每个输入框 `setDesc` 给出格式提示（如 provider 合法值、endpoint 示例）
- `isPluginReadyState` 改为按源校验：`bucketName` 非空，且（provider 为 aws/s3-compatible 时 region 或 endpoint 至少一项；cos/oss 时 endpoint 非空）且凭证齐全

## 4. 影响模块清单

| 模块 | 改动 |
| --- | --- |
| `src/config.ts` | 移除 `AWS_PROFILE_NAME_NONE`；新增 `PROVIDERS` 常量集、各厂默认 endpoint 模板、`CACHE_SCHEMA_VERSION` |
| `src/settings/settings.ts` | 新 `StorageSource`/`PluginSettings` 模型；`REGIONS` 表废弃；`isPluginReadyState` 重写；迁移函数 |
| `src/settings/settingsTab.ts` | UI 全量重写为全 input |
| `src/aws/` | `AwsCredentialProvider`/`AwsProfile` 从 UI 下线（代码可暂留待清理） |
| `src/network/client.ts` | 拆为 `StorageClient` 接口 + 3 个适配器 + `StorageClientFactory` |
| `src/network/downloadManager.ts` | `versionId` → `versionToken`（键格式不变） |
| `src/cache.ts` | `versionToken` + 文件名 sha1 + sourceId 键前缀 + 升级清理 |
| `src/model/s3Link.ts` | 字段 `versionId` → `versionToken` |
| `src/s3PostProcessor.ts` / `src/obsidianHelper.ts` | 适配 `versionToken` 与多源解析 |
| `src/resolver/*` | 支持可选 `sourceName/` 前缀 |
| `package.json` | 新增 `cos-nodejs-sdk-v5`、`ali-oss` 依赖 |
| `test/` | 现有测试字段名适配；新增适配器 mock 测试（基于 `StorageClient` 接口） |

## 5. 实施步骤（待实现时按序执行）

1. 设置模型与 v1→v2 迁移（含单元测试）
2. `StorageClient` 接口 + `StorageClientFactory`
3. `S3CompatibleClient`（从现有 `Client` 平移，加 endpoint/forcePathStyle）
4. `TencentCosClient` + `AliyunOssClient`
5. 缓存层 `versionToken` 改造与升级清理
6. 设置 UI 重写（全 input）
7. Resolver 多源前缀解析
8. 测试覆盖与文档更新（`architecture.md`、README）

## 6. 风险与开放问题

**风险**：

- COS/OSS 对 S3 兼容协议的支持程度不一 → 本设计采用**原生 adapter 兜底**，不依赖 S3 兼容接口的完整性（需在实施时实测各厂 S3 兼容接口支持度）
- 各厂 CORS 配置方式不同 → README 需分别给出 COS/OSS 的跨域配置示例
- 签名 URL 有效期上限不同（AWS 7 天；COS/OSS 签名有效期上限需实测）→ 实现时取 `min(7天, 厂商标称上限)`
- 大文件流式下载在 COS/OSS SDK 中的 API 差异 → 实施时逐一验证 stream 接口
- ETag 对分片上传对象不唯一（多分片对象 ETag 带 `-N` 后缀）→ 版本令牌比较仍可用，但需在设计中注明

**开放问题**：

- provider 是否坚持纯 input？按需求"全部用 input"定为文本输入 + 描述提示，未来可加自动补全
- 是否同时保留 AWS Profile 文件读取为"可选高级功能"？当前设计：下线，凭证统一走 input
- `s3:[sourceName/objectKey]` 前缀语法为可选扩展，v1 是否实现由实施时决定
