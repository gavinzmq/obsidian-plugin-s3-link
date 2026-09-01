# Changelog

## 2026-09-01 — 版本号 1.1.0（发布）

- `manifest.json` / `versions.json` / `package.json` 版本号更新为 `1.1.0`
- 打标签 `v1.1.0` 并发布：移动端兼容改造（移除 Node 依赖 + 原生 fetch/Web Crypto 签名）与 CI 重构（合并 `ci.yaml`）随本版本发布

## 2026-09-01 — 移动端兼容改造（未发布）

- 移除全部 Node 内置依赖（`fs`/`path`/`stream`/`crypto`），`manifest.json` 移除 `isDesktopOnly`
- 缓存改走 Obsidian Vault 二进制 API（`createBinary`/`modifyBinary`），全部路径为 vault 相对路径；下载内容整对象缓冲
- 网络层：移除 `@aws-sdk/client-s3`、`@aws-sdk/s3-request-presigner`、`ali-oss` 依赖；S3 / S3 兼容与阿里云 OSS 改用原生 `fetch` + Web Crypto 手写签名（`sigV4.ts`、`ossSigner.ts`）；COS 保留浏览器 SDK `cos-js-sdk-v5`
- 签名已与官方 `@smithy/signature-v4` 逐字节对照验证；构建产物约 2.8MB → 0.57MB
- 新增 platformUtil / sigV4 / ossSigner 测试；jest 11 套件 81 用例通过
- 待真机验证：真实桶端到端、移动端 iOS/Android 渲染

## 2026-09-01 — 版本号 1.0.10

- `manifest.json` / `versions.json` / `package.json` 版本号更新为 `1.0.10`
- 打标签 `v1.0.10` 并发布（含 s3: 链接 `net::ERR_UNKNOWN_URL_SCHEME` 修复）

## 2026-09-01 — 修复 s3: 链接渲染报 net::ERR_UNKNOWN_URL_SCHEME

- 现象：与 obsidian-plugin-auto-upload 共同使用时，`![](s3:images/x.jpeg)` 渲染报 `GET s3:... net::ERR_UNKNOWN_URL_SCHEME`（`s3:` 非 Electron 注册 scheme，后处理器异步下载前浏览器已尝试加载）
- 修复：
  - `config.ts` 新增 `S3_LINK_PLACEHOLDER`（透明 GIF data URI）
  - `ImageResolver` 命中 `s3:` / `s3-sign:` 的 img 时，在任何 await 之前同步将 `src` 替换为占位符；`VideoResolver` 对命中 video 同步 `removeAttribute("src")`；后处理器取到本地文件/签名 URL 后写回真实 `src`
  - span/anchor 无需处理（非媒体元素不自动加载 src/href）
- 新增测试 3 例；jest 8 套件 60 用例通过

## 2026-08-27 — 版本号 1.0.9

- `manifest.json` / `versions.json` / `package.json` 版本号更新为 `1.0.9`
- 打标签 `v1.0.9` 并发布（含日志级别设置，控制开发者控制台输出量）

## 2026-08-27 — 新增日志级别设置（DEBUG / INFO / WARN / ERROR / NONE）

- 新增 `src/logger.ts`（`Logger` + `LogLevel`）：所有插件日志统一走 Logger，按级别过滤输出；默认 `INFO`
- 设置界面新增「日志级别」下拉框（Debug/Info/Warning/Error/None），中英文案已补充
- 全部 17 个源文件约 100 处 `console.debug/info/warn/error` 改为 `Logger.*`（`logger.ts` 内部仍调用原生 console）
- `main.ts` 加载/保存设置时应用日志级别
- 默认级别 `INFO` 会隐藏大量每次渲染产生的 debug 消息；排查问题时可切到 `Debug`
- 新增 Logger 单元测试 6 例；jest 8 套件 57 用例通过

## 2026-08-27 — 版本号 1.0.8

- `manifest.json` / `versions.json` / `package.json` 版本号更新为 `1.0.8`
- 打标签 `v1.0.8` 并发布（含腾讯云 COS 二进制下载损坏修复）

## 2026-08-27 — 修复腾讯云 COS 二进制下载损坏（图片显示错误图标）

- 现象：文件能下载保存（`Saved ... (182911 bytes)`）且资源路径解析成功（`Resolved ... via vault resource path`），但图片仍显示错误图标
- 根因（据文件头确证）：缓存文件头为 `efbfbd efbfbd efbfbd efbfbd 0010 4a46` —— `efbfbd` 是 UTF-8 替换字符 U+FFFD，对应原始 JPEG 头 `ff d8 ff e0 00 10 4a 46 49 46`（JFIF）。浏览器版 COS SDK `getObject` 默认 `DataType: 'text'`，把二进制对象按 UTF-8 文本解码，无效字节全部变为 U+FFFD → 图片损坏
- 修复：`TencentCosClient.getObject` 增加 `DataType: 'blob'`，让 SDK 返回 Blob 保留字节；`bodyToReadable` 已支持 Blob → Buffer 转换
- 与下载无关；私有读不影响（插件用凭据签名下载）
- jest 7 套件 51 用例通过

## 2026-08-27 — 版本号 1.0.7

- `manifest.json` / `versions.json` / `package.json` 版本号更新为 `1.0.7`
- 打标签 `v1.0.7` 并发布（含私有读存储桶图片显示修复与资源路径回退）

## 2026-08-27 — 修复私有读存储桶下图片仍显示错误图标

- 现象：1.0.6 已能稳定下载并保存文件（`Saved ... (182911 bytes)`），文件存在于 `s3_cache`，但图片仍显示错误图标
- 结论：下载本身成功（私有读不影响，插件用凭据签名下载）；问题在 Obsidian 渲染阶段未能加载缓存文件
- 修复：
  - `updateLinkReferences` 为 img/video 增加 `error` 事件回退：Obsidian 资源服务器无法提供缓存文件时，自动切换到 `file://` 直链（`getCacheFileUrl`，渲染器必定可加载）
  - `obsidianHelper` 新增 `getCacheFileUrl`；`getVaultResourcePath` 各分支打印实际解析路径，便于定位
  - `saveFileToCacheFolder` 写后打印文件字节数与文件头十六进制（如 `ffd8ff...` 为 JPEG），确证下载内容为真实图片而非错误页
- jest 7 套件 51 用例通过

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
