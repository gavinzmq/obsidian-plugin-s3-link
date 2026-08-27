# Component: obsidian-plugin-s3-link

> 最后更新：2026-08-27

## 概览

Obsidian 桌面端插件，用于在笔记中引用对象存储文件：`s3:[objectKey]` 下载并缓存到本地，`s3-sign:[objectKey]` 生成预签名 URL。支持 AWS S3、腾讯云 COS、阿里云 OSS 及 S3 兼容端点；Provider 下拉、端点自动组合、测试连接、中/英文界面、自动替换远程链接。

## 位置

- 源代码：`<workspaceRoot>/src/`
- 完整架构文档：`../architecture.md`

## 关键结构

- 入口：`S3LinkPlugin`（`src/main.ts`，含设置迁移、语言设置、vault 监听/自动替换）
- 自动替换：`src/autoReplace.ts`（`https://` → `s3:` 链接，围栏感知）
- 编排核心：`S3PostProcessor`（`src/s3PostProcessor.ts`，多源解析）
- 缓存：`Cache`（`src/cache.ts`，versionToken + sha1 文件名 + sourceId 键）
- 网络：`StorageClient` 接口（含 `testConnection`）+ 3 适配器 + `StorageClientFactory`（`src/network/`）
- 国际化：`src/i18n.ts`（en/zh）
- 设置 UI：`src/settings/settingsTab.ts`（语言 / 自动替换开关 / Provider 下拉 / 端点自动组合 / 测试连接）
- 命令：`ClearCacheGlobal` / `ClearCacheLocal` / `ReloadActiveLeaf` / `ReloadAllLeafs`（`src/command/`）

## 已记录要点

- 多源 `StorageSource[]` + `PluginSettings{sources, language, autoReplaceEnabled}`
- 统一版本令牌 `versionToken`（AWS VersionId / COS·OSS ETag），缓存文件名 `sha1(versionToken)+ext`
- 链接语法向后兼容，可选 `s3:[sourceName/objectKey]` 前缀
- 自动替换：虚拟主机/路径两种寻址，fenced 代码块不处理
- `src/aws/`（`~/.aws/credentials` 读取）已下线

## 相关文档

- `../architecture.md` — 完整架构文档（含流程图与已知局限）
- `../decisions/2026-08-27-multi-cloud-storage-support.md` — 多存储支持决策（已实现，含 §7 UI 修订）
