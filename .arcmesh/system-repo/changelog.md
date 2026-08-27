# Changelog

## 2026-08-27 — 版本号 1.0.2

- `manifest.json` / `versions.json` / `package.json` 版本号更新为 `1.0.2`
- 打标签 `v1.0.2` 并发布（含多对象存储与 UI 增强）

## 2026-08-27 — UI 增强（Provider 下拉 / 端点自动组合 / 测试连接 / 多语言）

- 设置 UI：Provider 改为**下拉选择**（aws / tencent-cos / aliyun-oss / s3-compatible）
- Endpoint：已知服务商（AWS / 腾讯 COS / 阿里 OSS）按 Region **自动组合生成**且 UI 不显示输入框；仅 S3 兼容源显示自定义端点输入
- 新增「**测试连接**」：`StorageClient` 增加 `testConnection()`（AWS: ListObjectsV2 / COS: getBucket / OSS: list）
- 新增**语言选择**：`src/i18n.ts` 支持中文/英文，设置 UI 随语言实时切换；`PluginSettings.language`
- `settings.ts` 新增 `getComposedEndpoint` / `isKnownProvider`
- 更新 `architecture.md`、`decisions/...`（§7 设计修订）、`project.md`

## 2026-08-27 — Release 工作流加入手动触发

- `release.yaml` 增加 `workflow_dispatch` 手动触发（需输入版本标签）
- 标签提取逻辑兼容手动触发输入

## 2026-08-27 — 版本号 1.0.1

- `manifest.json` / `versions.json` / `package.json` 版本号更新为 `1.0.1`

## 2026-08-27 — Release 工作流修复

- 修复 `.github/workflows/release.yaml`：`permissions: contents: write`、`actions/checkout@v4`、发布资源补充 `versions.json`、tag 模式 `v*`

## 2026-08-27 — 多对象存储支持实现

- 实现多存储：`StorageClient` + 三适配器 + 工厂；多源设置模型；缓存 versionToken 改造；`src/aws/` 下线
- 新增依赖：`cos-nodejs-sdk-v5`、`ali-oss`
- 测试 6 套件 / 35 用例通过

## 2026-08-27 — 多对象存储支持设计 / .arcmesh 纳入版本控制 / 初始文档

- 设计决策、`.arcmesh` 入库（排除敏感文件）、架构文档与项目文档初始化
