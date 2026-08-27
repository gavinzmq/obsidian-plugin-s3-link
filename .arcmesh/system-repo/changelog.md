# Changelog

## 2026-08-27 — 版本号 1.0.6

- `manifest.json` / `versions.json` / `package.json` 版本号更新为 `1.0.6`
- 打标签 `v1.0.6` 并发布（含缓存文件缺失循环与图片仍不显示的修复）

## 2026-08-27 — 修复缓存文件被误删导致图片仍不显示

- 现象：1.0.5 触发“重新下载”并成功保存文件，但图片仍不显示；每次渲染文件都缺失并再次下载
- 根因：下载保存后 `getVaultResourcePath` 抛错（原生流写入的文件未被 Obsidian 索引）→ `getResourcePath` catch 中 `removeItemFromCache` 删掉了刚保存的文件 → 无限“下载→删除”循环
- 修复：
  - `getResourcePath` 失败时**不再删除缓存**（避免删掉真实存在的文件）；过期条目由 `processS3Links` 按缺失重新下载处理
  - `getVaultResourcePath` 增加回退链：索引未命中时先试 `FileSystemAdapter.getResourcePath`（app://local），再回退 `getFilePath`（file://，渲染器必定可加载）
  - `updateLinkReferences` 改为顺序 `await` 设置 src，避免 Obsidian 在 src 设置前完成渲染丢弃元素引用
  - `DownloadManager.setErrorState` 忽略已完成下载后的尾部 error（防止流在 end 后补发 error 删文件）
  - `Cache.isFileInCacheFolder` 用 `statSync` 且空文件视为缺失；`saveFileToCacheFolder` 写后校验并打印文件字节数（诊断）
- 新增测试 4 例；jest 7 套件 51 用例通过

## 2026-08-27 — 版本号 1.0.5

- `manifest.json` / `versions.json` / `package.json` 版本号更新为 `1.0.5`
- 打标签 `v1.0.5` 并发布（含缓存文件缺失时自动重新下载修复）

## 2026-08-27 — 修复缓存文件缺失时图片不显示

- 现象：localStorage 记录有效但 `s3_cache/` 对应文件缺失时，`getVaultResourcePath` 抛错 → 插件只删缓存不重新下载 → 图片不显示
- 修复：新增 `Cache.isFileInCacheFolder()` 校验磁盘文件；`processS3Links` 缓存文件缺失时清除旧记录并立即重新下载；缓存记录改为文件保存成功后才写入（避免下载失败留下孤儿条目）；`getVaultResourcePath` 回退到文件系统检查 + `FileSystemAdapter.getResourcePath`（原生流写入的文件可能未被 Obsidian 索引）
- 新增测试 2 例；jest 7 套件 49 用例通过

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
