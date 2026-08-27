# Changelog

## 2026-08-27 — 版本号 1.0.4

- `manifest.json` / `versions.json` / `package.json` 版本号更新为 `1.0.4`
- 打标签 `v1.0.4` 并发布（含 COS 浏览器 SDK 更换与对象键双重编码 404 修复）

## 2026-08-27 — 修复对象键双重 URL 编码导致的 404

- 现象：COS 中文文件名经自动替换后 headObject 404（SDK 对已编码 key 再次编码 → `%25`）
- 修复：`settings.resolveSourceKey` 与 `autoReplace.toS3Link` 对 objectKey 做防御性 `decodeURIComponent`（`decodeObjectKey`，失败回退）
- 新增测试 3 例；jest 7 套件 47 用例通过

## 2026-08-27 — COS SDK 更换为浏览器版

- `cos-nodejs-sdk-v5` → `cos-js-sdk-v5@^1.10.1`（Obsidian 运行于渲染进程）
- `TencentCosClient`：`getObjectStream` → `getObject` + `bodyToReadable`；整对象缓冲
- `main.js` 约 4.4MB → 2.8MB

## 2026-08-27 — 版本号 1.0.3

- 版本号更新为 `1.0.3`；打标签 `v1.0.3` 发布

## 2026-08-27 — 自动替换远程链接功能

- 新增 `src/autoReplace.ts`；vault 监听 + `autoReplaceEnabled` 开关 + 防递归；i18n 文案

## 2026-08-27 — 版本号 1.0.2

- 版本号更新为 `1.0.2`；打标签 `v1.0.2` 发布

## 2026-08-27 — UI 增强 / Release 工作流 / 多对象存储实现 / 设计与初始文档

- Provider 下拉、端点自动组合、测试连接、多语言
- `release.yaml` 修复与手动触发
- 多存储实现（StorageClient + 三适配器）；`src/aws/` 下线
- 设计决策、`.arcmesh` 入库、架构与项目文档初始化
