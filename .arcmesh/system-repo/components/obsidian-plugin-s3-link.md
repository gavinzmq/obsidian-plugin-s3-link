# Component: obsidian-plugin-s3-link

> 最后更新：2026-08-27

## 概览

Obsidian 桌面端插件，用于在笔记中引用 AWS S3 对象：`s3:[objectKey]` 下载并缓存到本地，`s3-sign:[objectKey]` 生成 7 天有效的预签名 URL。

## 位置

- 源代码：`<workspaceRoot>/src/`
- 完整架构文档：`../architecture.md`

## 关键结构

- 入口：`S3LinkPlugin`（`src/main.ts`）
- 编排核心：`S3PostProcessor`（`src/s3PostProcessor.ts`）
- 缓存：`Cache`（`src/cache.ts`）
- 网络：`Client` / `DownloadManager`（`src/network/`）
- 解析器：`ImageResolver` / `VideoResolver` / `SpanResolver` / `AnchorResolver`（`src/resolver/`）
- 命令：`ClearCacheGlobal` / `ClearCacheLocal` / `ReloadActiveLeaf` / `ReloadAllLeafs`（`src/command/`）

## 已记录要点

- 双层缓存：`s3_cache/` 文件系统（以 `versionId` 命名）+ localStorage 元数据
- 下载状态机：`PENDING → RUNNING → COMPLETED / FAILED`，启动时清理未完成下载
- 认证：`~/.aws/credentials` Profile 或直接 Access Key / Secret Key

## 相关文档

- `../architecture.md` — 完整架构文档（含流程图与已知局限）
