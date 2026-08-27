# Changelog

## 2026-08-27 — COS SDK 更换为浏览器版

- `cos-nodejs-sdk-v5` → `cos-js-sdk-v5@^1.10.1`（Obsidian 运行于渲染进程，需浏览器 SDK）
- `TencentCosClient`：`getObjectStream` → `getObject`，响应体（ArrayBuffer/Blob/string）经 `bodyToReadable` 转 Node Readable 后落盘
- 代价：浏览器 SDK 整对象缓冲，大文件无增量流式（已记录局限）
- 副产品：`main.js` 约 4.4MB → 2.8MB
- 验证：tsc / jest（7 套件 44 用例）/ eslint / esbuild 全部通过
- 更新 `architecture.md`、`decisions/...`、`project.md`

## 2026-08-27 — 版本号 1.0.3

- `manifest.json` / `versions.json` / `package.json` 版本号更新为 `1.0.3`；打标签 `v1.0.3` 发布

## 2026-08-27 — 自动替换远程链接功能

- 新增 `src/autoReplace.ts`；vault 监听（modify/create）+ `autoReplaceEnabled` 开关 + 防递归
- i18n 新增 en/zh 文案；新增 `test/autoReplace.test.ts`（9 用例）

## 2026-08-27 — 版本号 1.0.2

- 版本号更新为 `1.0.2`；打标签 `v1.0.2` 发布

## 2026-08-27 — UI 增强 / Release 工作流 / 多对象存储实现 / 设计与初始文档

- Provider 下拉、端点自动组合、测试连接、多语言
- `release.yaml` 修复与手动触发
- 多存储实现（StorageClient + 三适配器）；`src/aws/` 下线
- 设计决策、`.arcmesh` 入库、架构与项目文档初始化
