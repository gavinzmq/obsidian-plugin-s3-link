# 决策：兼容桌面端与移动端（移动端支持规划）

> 日期：2026-09-01
> 状态：**已实现**（待真机验证，2026-09-01）
> 关联文档：`../architecture.md`、`../project.md`

## 1. 背景与动机

插件目前仅在桌面端可用（`manifest.json` 的 `isDesktopOnly: true`）。需求要求同时兼容桌面端与移动端，使用户在 Obsidian 移动端（iOS / Android）也能通过 `s3:` / `s3-sign:` 语法引用对象存储文件。

## 2. 设计目标

- G1 桌面端行为保持不变（`s3:` 缓存 + `s3-sign:` 预签名）✅（现状）
- G2 移除 `isDesktopOnly` 限制，插件可在移动端加载 ✅（已实现）
- G3 缓存与本地文件读取在移动端 `Vault` 抽象下可用 ✅（已实现）

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

## 5. 验证（2026-09-01 已执行）

- SigV4 与 OSS 签名已与官方 `@smithy/signature-v4` 逐字节对照验证，一致
- 桌面端回归：Jest 11 套件 / 81 用例（新增 platformUtil / sigV4 / ossSigner）+ tsc / esbuild / ESLint 全部通过
- **待真机验证**：真实桶（S3/COS/OSS）端到端联调、移动端 iOS/Android 加载与渲染

## 6. 注意事项

- 移动端无法使用 Node `fs`，缓存落盘已改走 Obsidian `Vault` API（`createBinary` / `modifyBinary`）
- 签名 URL 在移动端同样可用（纯 HTTP 请求，无 SDK 依赖）
- 整对象缓冲下载在移动端内存更受限，需关注内存占用

## 7. 实施记录（2026-09-01 完成，未发布）

1. 新增 `src/platformUtil.ts`：Web Crypto（sha1/sha256/HMAC）、Base64、路径、字节流收集；移除全部 Node 内置依赖（`fs`/`path`/`stream`/`crypto`）。
2. `manifest.json` 移除 `isDesktopOnly`；`esbuild.config.mjs` 移除 Node builtins external；`package.json` 依赖仅剩 `cos-js-sdk-v5`。
3. `cache.ts` / `obsidianHelper.ts`：缓存改走 Vault 二进制 API，路径全部改为 vault 相对路径；`getCacheFileName` 等改为异步 Web Crypto 实现。
4. 网络层重写：`S3CompatibleClient`（原生 `fetch` + `sigV4.ts`）、`AliyunOssClient`（原生 `fetch` + `ossSigner.ts`）；`TencentCosClient` 保留 `cos-js-sdk-v5` 并改为返回 `Uint8Array`。`StorageClient.getObject` 接口由 `Promise<Readable>` 改为 `Promise<Uint8Array>`（整对象缓冲）。
5. 测试：新增 `test/mock/setup.ts`（注入 Node webcrypto / TextEncoder，jest setupFiles）；新增 platformUtil / sigV4 / ossSigner 测试。
6. 产物：`main.js` 约 2.8MB → 0.57MB。
