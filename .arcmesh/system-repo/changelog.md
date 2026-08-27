# Changelog

## 2026-08-27 — 版本号 1.0.3

- `manifest.json` / `versions.json` / `package.json` 版本号更新为 `1.0.3`
- 打标签 `v1.0.3` 并发布（含自动替换远程链接功能）

## 2026-08-27 — 自动替换远程链接功能

- 新增 `src/autoReplace.ts`：正则匹配已配置存储源的 `https://` 链接（虚拟主机/路径寻址），替换为插件 `s3:` 格式链接；跳过 fenced 代码块
- 新增 `src/main.ts` vault 监听（modify/create）+ `autoReplaceEnabled` 开关 + 防递归
- i18n 新增 en/zh 文案；新增 `test/autoReplace.test.ts`（9 用例）
- 验证：tsc / jest（7 套件 44 用例）/ eslint / esbuild 全部通过

## 2026-08-27 — 版本号 1.0.2

- `manifest.json` / `versions.json` / `package.json` 版本号更新为 `1.0.2`；打标签 `v1.0.2` 发布

## 2026-08-27 — UI 增强（Provider 下拉 / 端点自动组合 / 测试连接 / 多语言）

- Provider 下拉；已知服务商端点按 Region 自动组合且不显示输入框；S3 兼容源显示自定义端点
- `StorageClient.testConnection()` + 设置页「测试连接」按钮
- `src/i18n.ts` 中/英文界面；`PluginSettings.language`

## 2026-08-27 — Release 工作流修复 / 手动触发

- `release.yaml`：`permissions`、`checkout@v4`、`versions.json`、tag 模式 `v*`、`workflow_dispatch`

## 2026-08-27 — 多对象存储支持实现

- `StorageClient` + 三适配器 + 工厂；多源设置模型；缓存 versionToken 改造；`src/aws/` 下线
- 新增依赖：`cos-nodejs-sdk-v5`、`ali-oss`

## 2026-08-27 — 设计 / .arcmesh / 初始文档

- 设计决策、`.arcmesh` 入库（排除敏感文件）、架构与项目文档初始化
