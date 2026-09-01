# Project

## Description

**obsidian-plugin-s3-link** — 一个 Obsidian 插件（桌面端 + 移动端，移动端兼容已实现、待真机验证），用于在笔记中引用对象存储中的文件。通过 `s3:[objectKey]` 语法下载并缓存文件到本地 vault 的 `s3_cache` 文件夹，通过 `s3-sign:[objectKey]` 语法生成预签名 URL。

- 已支持：AWS S3、腾讯云 COS、阿里云 OSS、S3 兼容端点（MinIO 等）
- 设置 UI：Provider 下拉 + 端点自动组合 + 测试连接 + 中/英文界面
- 日志：日志级别设置（DEBUG / INFO / WARN / ERROR / NONE，默认 INFO）
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
- 日志级别设置（控制开发者控制台输出量）✅
- 修复 `net::ERR_UNKNOWN_URL_SCHEME`（媒体元素同步占位符替换）✅
- 兼容桌面端与移动端（已实现，待真机验证）

## 技术栈

- **语言**：TypeScript
- **构建工具**：esbuild
- **测试框架**：Jest + jsdom（11 套件 / 81 用例，含 obsidian mock）
- **CI/CD**：GitHub Actions
- **包管理器**：pnpm
- **关键依赖**：
  - Obsidian API：`Plugin`、`PluginSettingTab`、`Notice`、`TFile`、`TAbstractFile`、`FileSystemAdapter`、`Vault`
  - 存储 SDK：`cos-js-sdk-v5`（腾讯云 COS，浏览器版）；AWS S3 / S3 兼容与阿里云 OSS 使用原生 `fetch` + Web Crypto 手写签名
- **AI 辅助**：DeepSeek V4（通过 Copilot Chat）+ ArcMesh 知识管理

## Status

- 版本：1.0.10（`manifest.json`，已发布；移动端兼容改造未发布）
- 架构文档：`architecture.md`（2026-09-01 随占位符修复、日志级别与移动端兼容更新）
- 组件注册：`components/obsidian-plugin-s3-link.md`
- 设计决策：`decisions/2026-08-27-multi-cloud-storage-support.md`（已实现，含 §7 UI 修订与 COS 浏览器 SDK 调整）、`decisions/2026-09-01-s3-link-placeholder.md`（已实现，`net::ERR_UNKNOWN_URL_SCHEME` 修复）、`decisions/2026-09-01-mobile-support.md`（已实现，待真机验证）
- 验证：tsc / esbuild（`main.js` 约 0.57MB）/ Jest（11 套件 / 81 用例）/ ESLint 全部通过
- 待办：真实桶端到端联调（S3/COS/OSS）；移动端 iOS/Android 真机验证（见 `decisions/2026-09-01-mobile-support.md`）；已知局限见 `architecture.md` §9
