# Project

## Description

**obsidian-plugin-s3-link** — 一个 Obsidian 桌面端插件（`isDesktopOnly: true`），用于在笔记中引用 AWS S3 对象。通过 `s3:[objectKey]` 语法下载并缓存文件到本地 vault 的 `s3_cache` 文件夹，通过 `s3-sign:[objectKey]` 语法生成 7 天有效的预签名 URL。

## Goals

- 在 Obsidian 笔记中无缝嵌入 S3 存储的图片、视频、PDF、音频等资源
- 本地缓存 + 版本检测（基于 S3 `versionId`），仅在 S3 上存在新版本时重新下载
- 支持两种认证方式：`~/.aws/credentials` Profile 或直接填写 Access Key / Secret Access Key
- 支持预签名 URL（7 天有效期，自动续签），适用于不希望下载文件的场景
- 提供缓存清理与叶子视图重载等实用命令

## Tech Stack

- TypeScript 4.7
- Obsidian API：`Plugin`、`PluginSettingTab`、`Notice`、`TFile`、`FileSystemAdapter`
- esbuild（打包，CJS，tree-shaking）
- Jest + ts-jest + jest-environment-jsdom（单元测试）
- AWS SDK v3：`@aws-sdk/client-s3`、`@aws-sdk/s3-request-presigner`

## Status

- 版本：1.0.0（见 `manifest.json`）
- 架构文档：`architecture.md`（基于代码扫描生成，2026-08-27）
- 组件注册：`components/obsidian-plugin-s3-link.md`
- 已知问题与下一步：见 `architecture.md` §9「设计要点与已知局限」（如签名链接缓存删除疑似 bug、`split(":")` 解析冒号截断、`forEach(async)` 未串行等待等）
