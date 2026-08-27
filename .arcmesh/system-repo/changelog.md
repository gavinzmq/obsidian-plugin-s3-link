# Changelog

## 2026-08-27 — UI 增强（Provider 下拉 / 端点自动组合 / 测试连接 / 多语言）

- 设置 UI：Provider 改为**下拉选择**（aws / tencent-cos / aliyun-oss / s3-compatible）
- Endpoint：已知服务商（AWS / 腾讯 COS / 阿里 OSS）按 Region **自动组合生成**且 UI 不显示输入框；仅 S3 兼容源显示自定义端点输入
- 新增「**测试连接**」：`StorageClient` 增加 `testConnection()`（AWS: ListObjectsV2 / COS: getBucket / OSS: list），设置页按钮即时反馈
- 新增**语言选择**：`src/i18n.ts` 支持中文/英文，设置 UI 随语言实时切换；`PluginSettings.language`
- `settings.ts` 新增 `getComposedEndpoint` / `isKnownProvider`；OSS 适配器使用自动组合端点
- 更新 `architecture.md`（§3/§4.6/§4.9）、`decisions/...-multi-cloud-storage-support.md`（§7 设计修订）、`project.md`

## 2026-08-27 — Release 工作流加入手动触发

- `release.yaml` 增加 `workflow_dispatch` 手动触发（需输入版本标签，如 `v1.0.1`）
- 标签提取逻辑兼容手动触发输入

## 2026-08-27 — 版本号 1.0.1

- `manifest.json` / `versions.json` / `package.json` 版本号更新为 `1.0.1`
- 更新 `manifest.json` 描述以反映多对象存储支持（AWS S3 / 腾讯 COS / 阿里 OSS / S3 兼容）

## 2026-08-27 — Release 工作流修复

- 修复 `.github/workflows/release.yaml`：补充 `permissions: contents: write`、升级 `actions/checkout@v4`、发布资源补充 `versions.json`、tag 模式收敛 `v*`

## 2026-08-27 — 多对象存储支持实现

- 实现 `decisions/2026-08-27-multi-cloud-storage-support.md`：`StorageClient` 接口 + `S3CompatibleClient` / `TencentCosClient` / `AliyunOssClient` + `StorageClientFactory`
- 设置改为多 `StorageSource` 模型；`src/aws/` 目录下线
- 缓存改造：`versionToken` 统一、sha1 缓存文件名、sourceId 键前缀、`CACHE_SCHEMA_VERSION=2` 自动清理
- 链接语法向后兼容，新增可选 `s3:[sourceName/objectKey]` 多源前缀
- 新增依赖：`cos-nodejs-sdk-v5`、`ali-oss`
- 测试：新增 `test/mock/obsidianMock.ts` + `moduleNameMapper`；6 套件 / 35 用例通过

## 2026-08-27 — 多对象存储支持设计

- 新增 `decisions/2026-08-27-multi-cloud-storage-support.md`
- 更新 `project.md`：目标与状态补充多存储规划
- 更新 `architecture.md`：新增 §10 规划中的变更指引

## 2026-08-27 — `.arcmesh` 纳入版本控制

- `.arcmesh/` 纳入 Git 版本控制并推送至 GitHub
- 新增 `.arcmesh/.gitignore`，排除敏感文件 `.cloud-token` 与 `cloud.json`（严禁提交）
- 更新 `STANDARDS.md`：Cloud Sync Config 说明敏感文件仍不纳入版本控制

## 2026-08-27

- 新增 `architecture.md`：基于代码扫描生成完整架构文档
- 初始化 `project.md`；注册组件 `components/obsidian-plugin-s3-link.md`
- 更新 `STANDARDS.md`：新增「Registered Components」登记小节
