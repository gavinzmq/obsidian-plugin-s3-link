# 决策：兼容桌面端与移动端（移动端支持规划）

> 日期：2026-09-01
> 状态：**规划中**（尚未实现）
> 关联文档：`../architecture.md`、`../project.md`

## 1. 背景与动机

插件目前仅在桌面端可用（`manifest.json` 的 `isDesktopOnly: true`）。需求要求同时兼容桌面端与移动端，使用户在 Obsidian 移动端（iOS / Android）也能通过 `s3:` / `s3-sign:` 语法引用对象存储文件。

## 2. 设计目标

- G1 桌面端行为保持不变（`s3:` 缓存 + `s3-sign:` 预签名）✅（现状）
- G2 移除 `isDesktopOnly` 限制，插件可在移动端加载（规划）
- G3 缓存与本地文件读取在移动端 `Vault` 抽象下可用（规划）

## 3. 现状与障碍

- `manifest.json` 声明 `isDesktopOnly: true`，需移除后方可在移动端启用。
- 存储 SDK 兼容性：`ali-oss` 为 Node 目标 SDK、`cos-js-sdk-v5` 为浏览器 SDK、`@aws-sdk/client-s3` 依赖 Node 环境——移动端（Capacitor / WebView）需逐个验证或替换。
- 文件系统：桌面端使用 `fs.createWriteStream` / `FileSystemAdapter.getResourcePath`，移动端 `Vault` API 行为不同，需改用 `app.vault` 抽象读写。
- UI / 设置：移动端设置页布局需适配（触控、小屏）。

## 4. 涉及文件（规划）

- `manifest.json` — 移除 `isDesktopOnly`
- `src/cache.ts` / `src/obsidianHelper.ts` — 文件读写改走 `Vault` 抽象
- `src/network/*` — 各 SDK 在移动端环境的可用性验证 / 替换
- `package.json` / 构建配置 — 视 SDK 情况调整

## 5. 验证（规划）

- 移动端真机（iOS / Android）加载与渲染验证
- 桌面端回归：Jest 8 套件 / 60 用例 + tsc / esbuild

## 6. 注意事项

- 移动端无法使用 Node `fs`，缓存落盘必须改走 Obsidian `Vault` API
- 签名 URL 在移动端同样可用（纯 HTTP 请求，无 SDK 依赖）
- 大文件缓冲下载在移动端内存更受限，需关注内存占用
