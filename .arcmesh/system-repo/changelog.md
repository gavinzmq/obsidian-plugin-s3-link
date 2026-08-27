# Changelog

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
