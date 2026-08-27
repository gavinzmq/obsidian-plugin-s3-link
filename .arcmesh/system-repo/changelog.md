# Changelog

## 2026-08-27 — Release 工作流修复

- 修复 `.github/workflows/release.yaml`：补充 `permissions: contents: write`（否则默认只读 token 无法建 Release）
- 升级 `actions/checkout@v4`（v3 已弃用）
- 发布资源补充 `versions.json`（Obsidian 插件发布必需，含 minAppVersion 映射）
- tag 触发模式由 `**` 收敛为 `v*`（匹配 README 的 `vx.x.x` 约定）
- 移除会与标签提取逻辑冲突的 `workflow_dispatch` 手动触发

## 2026-08-27 — 多对象存储支持实现

- 实现 `decisions/2026-08-27-multi-cloud-storage-support.md`：`StorageClient` 接口 + `S3CompatibleClient` / `TencentCosClient` / `AliyunOssClient` + `StorageClientFactory`
- 设置改为多 `StorageSource` 模型，UI 全文本输入；移除 AWS Region / Profile 下拉；`src/aws/` 目录下线
- 缓存改造：`versionToken` 统一（AWS VersionId / COS·OSS ETag）、sha1 缓存文件名、sourceId 键前缀、`CACHE_SCHEMA_VERSION=2` 自动清理；修复签名键删除 bug
- 链接语法向后兼容，新增可选 `s3:[sourceName/objectKey]` 多源前缀
- 新增依赖：`cos-nodejs-sdk-v5`、`ali-oss`
- 测试：新增 `test/mock/obsidianMock.ts` + `moduleNameMapper`（修复 obsidian 运行时解析）；cache/downloadManager 测试适配新 API；6 套件 / 35 用例通过
- 更新 `architecture.md`（§1–§10）、`project.md`

## 2026-08-27 — 多对象存储支持设计

- 新增 `decisions/2026-08-27-multi-cloud-storage-support.md`：腾讯云 COS / 阿里云 OSS / S3 兼容存储支持设计（Provider Adapter、全 input UI、版本令牌、设置迁移）
- 更新 `project.md`：目标与状态补充多存储规划
- 更新 `architecture.md`：新增 §10 规划中的变更指引

## 2026-08-27 — `.arcmesh` 纳入版本控制

- `.arcmesh/` 纳入 Git 版本控制并推送至 GitHub
- 新增 `.arcmesh/.gitignore`，排除敏感文件 `.cloud-token` 与 `cloud.json`（严禁提交）
- 更新 `STANDARDS.md`：Cloud Sync Config 说明敏感文件仍不纳入版本控制

## 2026-08-27

- 新增 `architecture.md`：基于代码扫描生成 obsidian-plugin-s3-link 完整架构文档
- 初始化 `project.md`：填写项目描述、目标、技术栈与状态
- 注册组件：新增 `components/obsidian-plugin-s3-link.md`
- 更新 `STANDARDS.md`：新增「Registered Components」登记小节
