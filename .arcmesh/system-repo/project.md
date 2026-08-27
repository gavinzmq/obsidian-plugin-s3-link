# Project

## Description

**obsidian-plugin-s3-link** — 一个 Obsidian 桌面端插件（`isDesktopOnly: true`），用于在笔记中引用对象存储中的文件。通过 `s3:[objectKey]` 语法下载并缓存文件到本地 vault 的 `s3_cache` 文件夹，通过 `s3-sign:[objectKey]` 语法生成预签名 URL。

- 当前实现：AWS S3
- 规划中：腾讯云 COS、阿里云 OSS 及 S3 兼容存储（见 `decisions/2026-08-27-multi-cloud-storage-support.md`）

## Goals

- 在 Obsidian 笔记中无缝嵌入对象存储的图片、视频、PDF、音频等资源
- 本地缓存 + 版本检测，仅在远端存在新版本时重新下载
- 支持腾讯云 COS、阿里云 OSS 等国内对象存储（规划中，设计已定稿）
- 设置 UI 不绑定单一厂商，全部使用文本输入配置（规划中）
- 支持预签名 URL（自动续签），适用于不希望下载文件的场景
- 提供缓存清理与叶子视图重载等实用命令

## Tech Stack

- TypeScript 4.7
- Obsidian API：`Plugin`、`PluginSettingTab`、`Notice`、`TFile`、`FileSystemAdapter`
- esbuild（打包，CJS，tree-shaking）
- Jest + ts-jest + jest-environment-jsdom（单元测试）
- 存储 SDK：AWS SDK v3（`@aws-sdk/client-s3`、`@aws-sdk/s3-request-presigner`）；规划新增 `cos-nodejs-sdk-v5`、`ali-oss`

## Status

- 版本：1.0.0（见 `manifest.json`）
- 架构文档：`architecture.md`（基于代码扫描生成，2026-08-27）
- 组件注册：`components/obsidian-plugin-s3-link.md`
- 设计决策：`decisions/2026-08-27-multi-cloud-storage-support.md`（多对象存储支持，已定稿待实现）
- 已知问题与下一步：见 `architecture.md` §9「设计要点与已知局限」（如签名链接缓存删除疑似 bug、`split(":")` 解析冒号截断、`forEach(async)` 未串行等待等）
