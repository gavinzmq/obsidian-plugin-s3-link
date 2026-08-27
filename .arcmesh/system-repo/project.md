# Project

## Description

**obsidian-plugin-s3-link** — 一个 Obsidian 桌面端插件（`isDesktopOnly: true`），用于在笔记中引用对象存储中的文件。通过 `s3:[objectKey]` 语法下载并缓存文件到本地 vault 的 `s3_cache` 文件夹，通过 `s3-sign:[objectKey]` 语法生成预签名 URL。

- 已支持：AWS S3、腾讯云 COS、阿里云 OSS、S3 兼容端点（MinIO 等）
- 设置 UI：Provider 下拉 + 端点自动组合 + 测试连接 + 中/英文界面
- 自动替换：可选监听文档变化，将匹配存储源的 `https://` 链接替换为 `s3:` 格式

## Goals

- 在 Obsidian 笔记中无缝嵌入对象存储的图片、视频、PDF、音频等资源 ✅
- 本地缓存 + 版本检测（统一 `versionToken`），仅在远端存在新版本时重新下载 ✅
- 支持腾讯云 COS、阿里云 OSS 等国内对象存储 ✅
- Provider 下拉选择，已知服务商端点按 Region 自动组合 ✅
- 提供「测试连接」能力 ✅
- 支持多语言 UI（中文 / 英文）✅
- 自动替换远程 `https://` 链接为 `s3:` 格式（可开关）✅
- 支持预签名 URL（自动续签）✅
- 提供缓存清理与叶子视图重载等实用命令 ✅

## Tech Stack

- TypeScript 4.7
- Obsidian API：`Plugin`、`PluginSettingTab`、`Notice`、`TFile`、`TAbstractFile`、`FileSystemAdapter`、`Vault`
- esbuild（打包，CJS，tree-shaking）
- Jest + ts-jest + jest-environment-jsdom（7 套件 / 44 用例，含 obsidian mock）
- 存储 SDK：`@aws-sdk/client-s3`、`@aws-sdk/s3-request-presigner`、`cos-js-sdk-v5`（浏览器）、`ali-oss`

## Status

- 版本：1.0.3（`manifest.json`，已发布）
- 架构文档：`architecture.md`（2026-08-27 随功能更新）
- 组件注册：`components/obsidian-plugin-s3-link.md`
- 设计决策：`decisions/2026-08-27-multi-cloud-storage-support.md`（已实现，含 §7 UI 修订与 COS 浏览器 SDK 调整）
- 验证：tsc / esbuild（`main.js` 约 2.8MB）/ Jest / ESLint 全部通过
- 待办：`ali-oss` 浏览器环境真机验证；COS/OSS 真桶端到端联调；已知局限见 `architecture.md` §9
