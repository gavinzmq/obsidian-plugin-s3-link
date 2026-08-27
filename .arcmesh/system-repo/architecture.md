# obsidian-plugin-s3-link 架构文档

> 最后更新：2026-08-27
> 本文档基于对代码库的静态扫描自动生成，并随多对象存储支持与 UI 增强同步更新，描述了插件的整体架构、核心模块、数据流与关键流程。

## 1. 项目概览

`obsidian-plugin-s3-link` 是一个 Obsidian 桌面端插件（`isDesktopOnly: true`），用于在笔记中引用对象存储中的文件。插件会把文件下载并缓存到本地 vault 的 `s3_cache` 文件夹，并支持生成预签名 URL。

- **已实现**：AWS S3、腾讯云 COS、阿里云 OSS、任意 S3 兼容端点（MinIO 等）
- **认证**：全部通过设置中的文本输入（Access Key ID / Secret Access Key），不再读取 `~/.aws/credentials`
- **UI**：Provider 下拉选择；已知服务商端点按 Region 自动组合；支持测试连接；支持中/英文界面

支持的链接语法：

| 语法 | 行为 |
| --- | --- |
| `s3:[objectKey]` | 下载并缓存文件到本地，周期性检查远端是否有新版本，有则重新下载 |
| `s3:[sourceName/objectKey]` | 指定存储源（多源场景，可选前缀） |
| `s3-sign:[objectKey]` / `s3-sign:[sourceName/objectKey]` | 生成预签名 URL（7 天有效，自动续签），不下载文件 |

支持的 HTML 元素：图片 `img`、视频 `video`、内嵌 span（PDF/音频）、锚点 `a`。

## 2. 技术栈

- **语言**：TypeScript 4.7
- **打包**：esbuild（CJS 格式，入口 `src/main.ts`，输出 `main.js`）
- **测试**：Jest + ts-jest，环境 `jest-environment-jsdom`（`test/mock/obsidianMock.ts` 提供 obsidian 运行时 mock）
- **存储 SDK**：
  - `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` — AWS / S3 兼容适配器
  - `cos-nodejs-sdk-v5` — 腾讯云 COS 适配器
  - `ali-oss` — 阿里云 OSS 适配器
- **Obsidian API**：`Plugin`、`PluginSettingTab`、`Notice`、`TFile`、`FileSystemAdapter` 等

## 3. 目录结构

```
src/
├── main.ts                  # 插件入口（S3LinkPlugin，含设置迁移与语言设置）
├── config.ts                # 全局常量（前缀、PROVIDERS、缓存模式版本等）
├── i18n.ts                  # 多语言（en/zh），setLanguage / t(key)
├── cache.ts                 # 本地缓存（文件系统 + localStorage 元数据）
├── s3PostProcessor.ts       # Markdown 后处理器（多源编排核心）
├── obsidianHelper.ts        # 资源路径辅助（getCacheFileName sha1、getVaultResourcePath）
├── pluginState.ts           # 插件状态枚举
├── command/
│   ├── command.ts                # 命令抽象基类
│   ├── clearCacheGlobalCommand.ts    # 清空全局缓存
│   ├── clearCacheLocalCommand.ts     # 清空当前叶子视图的缓存（多源解析）
│   ├── reloadActiveLeafCommand.ts    # 重载当前预览叶子
│   └── reloadAllLeafsCommand.ts      # 重载所有预览叶子
├── model/
│   ├── s3Link.ts              # 缓存元数据（objectKey/lastUpdate/versionToken/sourceId）
│   └── s3SignedLink.ts        # 签名链接元数据（objectKey/lastUpdate/signedUrl）
├── network/
│   ├── storageClient.ts           # StorageClient 统一接口（含 testConnection）
│   ├── storageClientFactory.ts    # 按 provider 创建适配器
│   ├── s3CompatibleClient.ts      # AWS / S3 兼容适配器（AWS SDK v3）
│   ├── tencentCosClient.ts        # 腾讯云 COS 适配器
│   ├── aliyunOssClient.ts         # 阿里云 OSS 适配器
│   ├── downloadManager.ts         # 下载生命周期管理（单例）
│   ├── downloadRecord.ts          # 下载记录类型
│   └── downloadState.ts           # 下载状态枚举
├── resolver/
│   ├── resolver.ts            # 解析器抽象基类
│   ├── imageResolver.ts       # <img> 元素解析
│   ├── videoResolver.ts       # <video> 元素解析
│   ├── spanResolver.ts        # <span> 元素解析（PDF/音频嵌入）
│   └── anchorResolver.ts      # <a> 元素解析
├── settings/
│   ├── settings.ts            # StorageSource 模型、getComposedEndpoint、isKnownProvider、迁移、就绪校验
│   └── settingsTab.ts         # 设置页 UI（Provider 下拉 / 端点自动组合 / 测试连接 / 语言）
└── ui/
    ├── notification.ts        # Notice 通知封装
    └── statusBar.ts           # 状态栏指示器
```

> `src/aws/` 目录已下线（不再读取 `~/.aws/credentials`）。

## 4. 核心模块说明

### 4.1 入口：`S3LinkPlugin`（`src/main.ts`）

- **`onload`**：初始化状态栏 → 加载设置（含 v1→v2 迁移）→ 注册设置页 → 初始化 `Cache` → 清理未完成下载 → 注册后处理器 → 注册命令 → 设置状态。
- **`loadSettings`**：检测旧格式并迁移；保证至少一个默认源；`setLanguage(settings.language)`。
- **`saveSettings`**：持久化后 `setLanguage`，按 `isPluginReadyState` 更新状态并通知 `S3PostProcessor` 重建客户端。

### 4.2 配置常量：`Config`（`src/config.ts`）

| 常量 | 值 | 用途 |
| --- | --- | --- |
| `CACHE_FOLDER` | `s3_cache` | 缓存文件夹 |
| `S3_LINK_PREFIX` / `S3_SIGNED_LINK_PREFIX` | `s3` / `s3-sign` | 链接前缀 |
| `SOURCE_SPLITTER` | `/` | 多源链接前缀分隔符 |
| `S3_LINK_EXPIRATION_TIME_SECONDS` | 3600 | 普通链接缓存过期时间 |
| `S3_SIGNED_LINK_EXPIRATION_TIME_SECONDS` | 604800（7 天） | 签名 URL 过期时间 |
| `CACHE_SCHEMA_VERSION` | 2 | 缓存模式版本（升级自动清缓存） |
| `PROVIDERS` | `aws` / `tencent-cos` / `aliyun-oss` / `s3-compatible` | 支持厂商集合 |

### 4.3 编排核心：`S3PostProcessor`（`src/s3PostProcessor.ts`）

- 4 个 Resolver 解析 HTML → 合并 `objectKeys` / `signObjectKeys` → 经 `resolveSourceKey` 解析 `{sourceId, objectKey}` → 从 `clients` Map 取对应 `StorageClient` 处理。
- 缓存命中/过期/新对象处理使用统一 `versionToken`。

### 4.4 解析器族：`Resolver`（`src/resolver/`）

`img` / `video` / `span` / `a` 四类；仅提取原始键（可含 `sourceName/` 前缀），来源归属由后处理器解析。`split(":")` 解析（objectKey 含冒号会截断，设计局限）。

### 4.5 缓存：`Cache`（`src/cache.ts`）

- 文件系统：`s3_cache/`，文件名 `<sha1(versionToken)><extname>`。
- localStorage：`obsidian-plugin-s3-link/<sourceId>/<objectKey>`（签名 `/s3-sign/`）。
- `CACHE_SCHEMA_VERSION` 变化自动 `clearCache()`；`removeItemFromCache` 同时清理普通与签名条目。

### 4.6 网络层：`StorageClient` 适配器体系（`src/network/`）

```ts
interface StorageClient {
    getVersionToken(objectKey: string): Promise<string | undefined>;
    getObject(objectKey: string, versionToken: string): Promise<Readable>;
    getSignedUrl(objectKey: string): Promise<string>;
    testConnection(): Promise<void>;   // 连接测试（设置页使用）
}
```

| 适配器 | 版本标识 | 签名 URL | 测试连接 |
| --- | --- | --- | --- |
| `S3CompatibleClient` | `VersionId` | `getSignedUrl` presigner | `ListObjectsV2`（MaxKeys=1） |
| `TencentCosClient` | headObject `ETag` | `cos.getObjectUrl` | `cos.getBucket` |
| `AliyunOssClient` | head `etag` | `client.signatureUrl` | `client.list` |

- `StorageClientFactory.create(source)` 按 `provider` 分发；`aws`/`s3-compatible` 共用 `S3CompatibleClient`（`endpoint`+`forcePathStyle`）。
- `AliyunOssClient` 使用 `getComposedEndpoint`（`https://oss-<region>.aliyuncs.com`）。

#### `DownloadManager`（单例）

`PENDING → RUNNING → COMPLETED / FAILED`；记录键 `obsidian-plugin-s3-link-manager/<sourceId>/<objectKey>/<versionToken>`。

### 4.7 AWS 凭证（已下线）

`src/aws/` 已删除，不再读取 `~/.aws/credentials`。

### 4.8 命令（`src/command/`）

`ClearCacheGlobal` / `ClearCacheLocal`（多源解析）/ `ReloadActiveLeaf` / `ReloadAllLeafs`。

### 4.9 设置（`src/settings/`）

- **`StorageSource`**：`id` / `name` / `provider` / `endpoint` / `bucketName` / `region` / `accessKeyId` / `secretAccessKey` / `pathStyle` / `defaultSource` / `signLinkEnabled`。
- **`PluginSettings`**：`sources: StorageSource[]` + `language: "en" | "zh"`。
- **`getComposedEndpoint(source)`**：已知服务商按 Region 组合端点（COS: `https://cos.<region>.myqcloud.com`；OSS: `https://oss-<region>.aliyuncs.com`；AWS 留空用 SDK 默认）。
- **`isKnownProvider(source)`**：AWS / 腾讯 COS / 阿里 OSS 为已知服务商（端点隐藏 + 自动组合）。
- **`isPluginReadyState`**：按源校验桶名、region/endpoint、凭证。
- **`PluginSettingsTab`**：
  - 顶部**语言下拉**（English / 中文），切换后 UI 实时重渲染
  - Provider 为**下拉选择**；其余字段文本输入 + 开关
  - Endpoint 已知服务商**不显示输入框**（显示自动组合端点）；S3 兼容源显示自定义端点与 pathStyle
  - 每源**测试连接**按钮 → `StorageClient.testConnection()` → 成功/失败通知
  - 添加 / 删除存储源

### 4.10 UI（`src/ui/`）

- `sendNotification`：包装 `Notice`。
- `StatusBar`：按 `PluginState` 显示状态；`CONFIG` 点击打开设置页。

### 4.11 辅助函数与国际化

- `obsidianHelper.ts`：`getCacheFileName`（sha1）、`getVaultResourcePath`。
- `i18n.ts`：`Language`（en/zh）、`setLanguage`、`t(key)`，供设置 UI 使用（通知/状态栏暂为英文）。

## 5. 核心流程

### 5.1 普通链接 `s3:` 处理流程

```mermaid
flowchart TD
    A[Markdown 渲染触发 onMarkdownPostProcessor] --> B[4 个 Resolver 解析 HTML]
    B --> C[resolveSourceKey 解析 sourceId/objectKey]
    C --> D{localStorage 中是否存在缓存?}
    D -- 否 --> E[StorageClient.getVersionToken 获取 versionToken]
    E --> F[Cache.writeItemToCache 写元数据]
    F --> G[StorageClient.getObject 流式下载]
    G --> H[Cache.saveFileToCacheFolder 落盘]
    H --> I[更新 HTML src/href 为本地资源路径]
    D -- 是 --> J{缓存是否过期? > 1小时}
    J -- 否 --> K[刷新 lastUpdate, 直接使用本地文件]
    J -- 是 --> L[查询远端最新 versionToken]
    L --> M{versionToken 是否变化?}
    M -- 是 --> G
    M -- 否 --> K
    K --> I
    I --> N[写入 data-object-key 属性]
```

### 5.2 签名链接 `s3-sign:` 处理流程

```mermaid
flowchart TD
    A[解析出 signObjectKeys + 来源] --> B{localStorage 中是否存在签名链接?}
    B -- 是 --> C{签名链接是否过期? > 7天}
    C -- 否 --> D[直接使用缓存的 signedUrl]
    B -- 否 --> E[StorageClient.getVersionToken 校验对象存在]
    E --> F[StorageClient.getSignedUrl 生成预签名 URL]
    F --> G[Cache.writeSignedUrlToLocalStorage 写入缓存]
    G --> D
    D --> H[更新 HTML src/href 为 signedUrl]
    H --> I[写入 data-object-key 属性]
```

### 5.3 下载生命周期

```mermaid
stateDiagram-v2
    [*] --> PENDING : StorageClient.getObject
    PENDING --> RUNNING : 响应 Body 到达
    RUNNING --> COMPLETED : 流 end 事件
    PENDING --> FAILED : SDK 抛异常
    RUNNING --> FAILED : 流 error
    FAILED --> [*] : 移除缓存条目(按 sourceId)
    COMPLETED --> [*]
```

## 6. 数据存储汇总

| 存储位置 | 内容 | 键/路径格式 |
| --- | --- | --- |
| localStorage | 普通链接元数据 | `obsidian-plugin-s3-link/<sourceId>/<objectKey>` → `{objectKey, lastUpdate, versionToken, sourceId}` |
| localStorage | 签名链接元数据 | `obsidian-plugin-s3-link/<sourceId>/s3-sign/<objectKey>` → `{objectKey, lastUpdate, signedUrl}` |
| localStorage | 下载记录 | `obsidian-plugin-s3-link-manager/<sourceId>/<objectKey>/<versionToken>` → `DownloadRecord` |
| localStorage | 缓存模式版本 | `obsidian-plugin-s3-link-cache-schema-version` = `2` |
| 文件系统 | 缓存文件 | `<vault>/s3_cache/<sha1(versionToken)><extname>` |
| 文件系统 | 插件设置 | Obsidian `data.json`（`sources: StorageSource[]` + `language`） |

## 7. 依赖关系图

```mermaid
graph TD
    Main[S3LinkPlugin<br>src/main.ts] --> Config
    Main --> Cache
    Main --> S3PP[S3PostProcessor]
    Main --> Settings[settings/settings]
    Main --> SettingsTab[settingsTab]
    Main --> I18n[i18n]
    Main --> StatusBar
    Main --> Cmds[4 个 Command]
    Main --> DM[DownloadManager]

    SettingsTab --> I18n
    SettingsTab --> Factory[StorageClientFactory]

    S3PP --> Cache
    S3PP --> R1[ImageResolver]
    S3PP --> R2[VideoResolver]
    S3PP --> R3[SpanResolver]
    S3PP --> R4[AnchorResolver]
    S3PP --> Factory

    Factory --> SC[S3CompatibleClient]
    Factory --> TC[TencentCosClient]
    Factory --> AC[AliyunOssClient]

    SC --> DM
    TC --> DM
    AC --> DM

    Cmds --> Cache
    Cmds --> Settings

    Cache --> S3Link[model/S3Link]
    Cache --> S3SignedLink[model/S3SignedLink]
    Cache --> OH[obsidianHelper]

    DM --> Cache
    S3PP --> OH
    Settings --> I18n
```

## 8. 构建、测试与发布

- **开发**：`npm run dev` — esbuild watch。
- **构建**：`npm run build` — `tsc -noEmit -skipLibCheck` + esbuild 生产打包（`main.js` 约 4.4MB）。
- **测试**：Jest（6 套件 / 35 用例）；`test/mock/obsidianMock.ts` + `moduleNameMapper`。
- **Lint**：`npx eslint .`。
- **发布**：推送 `v*` 标签触发 GitHub Actions 创建 Release（含 main.js / manifest.json / versions.json）。

## 9. 设计要点与已知局限

1. **多源 + 版本令牌**：`StorageSource[]` 支持同 vault 多云端；统一 `versionToken` 与 sha1 缓存文件名。
2. **适配器隔离**：`StorageClient` 接口解耦业务编排与厂商 SDK；`testConnection` 供设置页连接测试。
3. **端点自动组合**：已知服务商端点按 Region 自动生成，UI 不要求填写。
4. **大文件支持**：流式写入 + `getAbstractFileWithRetry` 补偿。
5. **崩溃恢复**：`DownloadManager` 启动清理未完成下载；`CACHE_SCHEMA_VERSION` 升级自动清缓存。
6. **已知局限/潜在问题**：
  - `S3CompatibleClient.getVersionToken` 只取版本列表第一个，未处理 `DeleteMarkers`。
  - Resolver 用 `split(":")` 解析，objectKey 含冒号会被截断。
  - `S3PostProcessor.updateLinkReferences` 的 `forEach(async ...)` 回调中 `await` 不会被串行等待。
  - `TencentCosClient` / `AliyunOssClient` 依赖 `@ts-ignore` 与显式 `any`，运行时行为需真实桶验证。
  - 连接测试（list/getBucket）与签名 URL 有效期上限需真实桶联调。
  - 多分片对象 ETag 带 `-N` 后缀需注意。
  - 命令层 `rebuildView` / `app.setting.open` 依赖未公开 Obsidian API（`@ts-ignore`）。
  - i18n 目前覆盖设置 UI；通知/状态栏暂为英文。

## 10. 已实现的决策（2026-08-27）

多对象存储支持与 UI 增强（Provider 下拉、端点自动组合、测试连接、中/英文界面）已按
`decisions/2026-08-27-multi-cloud-storage-support.md`（含 §7 修订）实现并落地，本文档已同步更新。
