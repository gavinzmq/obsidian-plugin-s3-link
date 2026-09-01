# Component: obsidian-plugin-s3-link

> 最后更新：2026-09-01

## 概览

Obsidian 插件（桌面端 + 移动端，移动端兼容已实现、待真机验证），用于在笔记中引用对象存储文件：`s3:[objectKey]` 下载并缓存到本地，`s3-sign:[objectKey]` 生成预签名 URL。支持 AWS S3、腾讯云 COS、阿里云 OSS 及 S3 兼容端点；Provider 下拉、端点自动组合、测试连接、中/英文界面、日志级别设置、自动替换远程链接。阅读视图（preview）与编辑视图（Live Preview / 源码）均可渲染 `s3:` 图片。

## 位置

- 源代码：`<workspaceRoot>/src/`
- 完整架构文档：`../architecture.md`

## 关键结构

- 入口：`S3LinkPlugin`（`src/main.ts`，含设置迁移、语言设置、日志级别应用、vault 监听/自动替换、编辑器扩展注册）
- 自动替换：`src/autoReplace.ts`（`https://` → `s3:` 链接，围栏感知）
- 编排核心：`S3PostProcessor`（`src/s3PostProcessor.ts`，多源解析；`resolveLinkResourceUrl` 供编辑器复用缓存/下载）
- 编辑器（Live Preview）：`src/editor/`（CodeMirror 6 扩展，`s3EditorExtension.ts` + `s3ImageWidget.ts`，渲染 `![](s3:...)` 内联图片）
- 缓存：`Cache`（`src/cache.ts`，versionToken + sha1 文件名 + sourceId 键；Vault 二进制写盘）
- 网络：`StorageClient` 接口（含 `testConnection`）+ 3 适配器 + `StorageClientFactory` + `sigV4` / `ossSigner`（`src/network/`）
- 平台工具：`src/platformUtil.ts`（Web Crypto 哈希/HMAC、Base64、路径、字节流收集）
- 占位符守卫：`src/placeholderGuard.ts`（全局 MutationObserver，拦截 s3: src 避免 ERR_UNKNOWN_URL_SCHEME）
- 日志：`src/logger.ts`（`Logger` + `LogLevel`，默认 INFO）
- 国际化：`src/i18n.ts`（en/zh）
- 设置 UI：`src/settings/settingsTab.ts`（语言 / 日志级别 / 自动替换开关 / Provider 下拉 / 端点自动组合 / 测试连接）
- 命令：`ClearCacheGlobal` / `ClearCacheLocal` / `ReloadActiveLeaf` / `ReloadAllLeafs`（`src/command/`）

## 已记录要点

- 多源 `StorageSource[]` + `PluginSettings{sources, language, autoReplaceEnabled, logLevel}`
- 统一版本令牌 `versionToken`（AWS VersionId / COS·OSS ETag），缓存文件名 `sha1(versionToken)+ext`
- 链接语法向后兼容，可选 `s3:[sourceName/objectKey]` 前缀
- 自动替换：虚拟主机/路径两种寻址，fenced 代码块不处理
- 阅读视图经 `registerMarkdownPostProcessor`；编辑视图（Live Preview）经 `registerEditorExtension`（CodeMirror 6 ViewPlugin，`Prec.highest` 最高优先级覆盖 Obsidian 内置图片 widget），两者共享 `S3PostProcessor.resolveLinkResourceUrl`（缓存命中直读，未命中按需下载，去重防重复下载）。编辑器扩展**只作用于 Live Preview**（`editorLivePreviewField` 门控），源码模式保持纯链接文本。
- `src/aws/`（`~/.aws/credentials` 读取）已下线

## 累积章节

### 2026-08-27 — 多对象存储支持 / UI 增强 / 自动替换 / COS 浏览器 SDK

- 多存储适配器体系落地；`src/aws/` 下线；Provider 下拉 + 端点自动组合 + 测试连接 + i18n；自动替换远程链接；COS 改用浏览器 SDK `cos-js-sdk-v5`。

### 2026-09-01 — 日志级别与 s3: 占位符修复

- 日志级别设置（`Logger` / `LogLevel`，v1.0.9）：全部插件日志统一过滤，默认 INFO。
- `net::ERR_UNKNOWN_URL_SCHEME` 修复（v1.0.10）：`Config.S3_LINK_PLACEHOLDER`（透明 GIF data URI）；`ImageResolver` 同步替换 `img.src`、`VideoResolver` 同步 `removeAttribute("src")`，避免渲染器加载未注册的 `s3:` scheme；span/anchor 无需处理。

### 2026-09-01 — 移动端兼容改造（未发布）

- 移除全部 Node 内置依赖（`fs`/`path`/`stream`/`crypto`），`manifest.json` 移除 `isDesktopOnly`。
- 缓存改走 Vault 二进制 API（`createBinary`/`modifyBinary`），全部路径为 vault 相对路径；下载整对象缓冲。
- 网络层：`@aws-sdk/*` 与 `ali-oss` 移除，S3 / S3 兼容与 OSS 改用原生 `fetch` + Web Crypto 手写签名（`sigV4.ts`、`ossSigner.ts`）；COS 保留浏览器 SDK `cos-js-sdk-v5`。
- 签名已与官方 `@smithy/signature-v4` 逐字节对照验证；构建产物 2.8MB → 约 0.57MB；jest 11 套件 / 81 用例。
- 待真机验证：真实桶端到端、移动端 iOS/Android 渲染。

### 2026-09-01 — 编辑视图（Live Preview）支持

- 现象：阅读/预览视图正常显示 `s3:` 图片，但编辑视图（Live Preview）什么都没有、源码模式只有链接文本。
- 根因：`registerMarkdownPostProcessor` 只在预览模式触发；Live Preview 用 CodeMirror 6 渲染，不会运行 post processor，`s3:` 非标准 scheme 也不被 Obsidian 原生图片扩展识别。
- 修复：新增 `src/editor/` —— CodeMirror 6 `ViewPlugin`（`s3EditorExtension.ts`）用正则匹配 `![](s3:...)` / `![[s3:...]]` / `![[s3-sign:...]]`，用 `Decoration.replace` 替换为内联 `<img>` widget（`s3ImageWidget.ts`）；光标在链接内时不替换（保持可编辑）。widget 以占位符起步，异步经 `S3PostProcessor.resolveLinkResourceUrl` 解析真实资源路径（缓存命中直读，未命中按需下载；解析器去重，避免每次选区变化重复下载）。**只作用于 Live Preview**（`editorLivePreviewField` 门控，源码模式保持纯链接文本），且用 `Prec.highest` 包裹以覆盖 Obsidian 内置图片 widget。
- 拖拽调尺寸（v1.2.2）：右下角 resize 手柄拖拽调整宽高，松手写回链接 `|WxH`（替换旧尺寸、保留 `|alt`）；渲染时读回尺寸。
- `@codemirror/view` / `@codemirror/state` 保持 esbuild external，运行时由 Obsidian 提供；jest 12 套件 / 88 用例通过。

## 相关文档

- `../architecture.md` — 完整架构文档（含流程图与已知局限）
- `../decisions/2026-08-27-multi-cloud-storage-support.md` — 多存储支持决策（已实现，含 §7 UI 修订）
- `../decisions/2026-09-01-s3-link-placeholder.md` — s3: 链接占位符修复决策（已实现）
- `../decisions/2026-09-01-mobile-support.md` — 移动端兼容决策（已实现，待真机验证）
