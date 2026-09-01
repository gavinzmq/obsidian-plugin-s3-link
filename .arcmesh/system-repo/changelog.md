# Changelog

## 2026-09-01 — 版本号 1.3.1（发布）

- `manifest.json` / `versions.json` / `package.json` 版本号更新为 `1.3.1`
- 打标签 `v1.3.1` 并发布：编辑模式单击图片不再消失（双击才进入编辑）随本版本发布

## 2026-09-01 — 编辑模式单击图片不再消失（v1.3.1）

- 现象：Live Preview 中单击渲染的图片，光标被移入链接范围，`buildDecorations` 移除该图片 widget → 图片消失（此前为 Obsidian 原生“点击可编辑”行为，用户觉得误触即消失很困扰）
- 修复（`src/editor/s3ImageWidget.ts`）：
  - `mousedown` 改为 `preventDefault() + stopPropagation()`，阻止 CodeMirror 默认把光标移入链接 → 单击图片保留、光标不动
  - 新增 `dblclick` 处理：双击才把光标放回链接（`view.posAtCoords` + `view.dispatch({selection})`），图片变为可编辑的原始 markdown
  - 同步更新 `s3EditorExtension.ts` 注释
- 验证：tsc 通过；jest 13 套件 / 104 用例通过

## 2026-09-01 — release workflow 移除 CI 门禁

- `release.yaml` 删除 "Wait for CI to pass" 步骤与 `actions: read` 权限（commit 1608068）
- 原因：推送 tag 会并发触发新 CI run（queued），`gh run list` 取到最新 run 一直是 queued/in_progress → 门禁无限等待直到超时，release 卡死
- 影响：打 tag 即直接构建并创建 GitHub Release，不再自动校验 CI；发布前需人工确认 CI 绿
- 踩坑记录：tag 触发 workflow 用的是 tag 指向 commit 里的 workflow 快照，改 workflow 后需 `git tag -f vX.Y.Z master && git push origin --force vX.Y.Z` 重指向新提交，否则仍会用旧 workflow

## 2026-09-01 — 版本号 1.3.0（发布）

- `manifest.json` / `versions.json` / `package.json` 版本号更新为 `1.3.0`
- 打标签 `v1.3.0` 并发布：图片尺寸格式遵循 Obsidian 原生 + 修复 `%7C` 尺寸后缀 404 随本版本发布

## 2026-09-01 — 图片尺寸格式遵循 Obsidian 原生 + 修复 `%7C` 404（v1.3.0）

- 现象：`![](s3:...|WxH)`（尺寸写在 URL 后）渲染时 Obsidian 把 `|` 编码为 `%7C`，插件把 `|WxH` 当作 objectKey 请求 → `HEAD ...jpeg%7C368x219` 404
- 修复：
  - `src/editor/s3EditorExtension.ts`：`setLinkSize` 拖拽写回尺寸改为 Obsidian 原生 `![alt|WxH](url)`（尺寸在 `[]` 内），wiki 格式 `![[...|WxH]]` 不变；旧的 `![](url|WxH)` 会被迁移/清理；`extractSize` 支持从 `[]` 内读尺寸（兼容旧 `()` 内写法）；导出 `extractSchemeKey`/`extractSize`/`setLinkSize` 便于测试
  - `src/resolver/resolver.ts`（基类新增 `stripImageSizeSuffix`）+ `imageResolver.ts`/`videoResolver.ts`：解码 `%7C` 并剥离末尾 `|WxH` 尺寸后缀，兼容已有旧格式笔记
- 验证：jest 13 套件 / 104 用例通过；tsc 通过；esbuild 本地缺平台二进制（发布走 GitHub Actions）

## 2026-09-01 — 版本号 1.2.2（发布）

- `manifest.json` / `versions.json` / `package.json` 版本号更新为 `1.2.2`
- 打标签 `v1.2.2` 并发布：编辑视图（Live Preview）图片拖拽调整尺寸随本版本发布

## 2026-09-01 — 编辑视图图片拖拽调整尺寸（v1.2.2）

- 需求：编辑模式与 Obsidian 原生一致，可在图片边缘拖拽调整尺寸大小
- 实现：
  - `src/editor/s3ImageWidget.ts`：图片右下角 resize 手柄（`pointerdown` + `setPointerCapture` + `pointermove/up`），拖动实时调整宽高
  - `src/editor/s3EditorExtension.ts`：拖动结束把尺寸写回链接 `![](s3:...|WxH)` / `![[s3:...|WxH]]`（`setLinkSize` 替换旧尺寸段、保留 `|alt`；`extractSize` 读回尺寸；`extractSchemeKey` 剥离 `|size` 后缀避免污染对象键）
  - `commitResize` 闭包捕获 matchStart/matchEnd（拖拽期间文档不变，位置有效），`view.dispatch({ changes })` 自动映射选区，光标不跳走、图片保持显示
- 验证：尺寸解析/写回逻辑（`|200`、`|200x150`、`|200|alt`、`|alt`、`s3-sign:`、普通 https 不误命中）实测通过；jest 12 套件 / 88 用例；tsc / eslint / 生产构建通过

## 2026-09-01 — 版本号 1.2.1（发布）

- `manifest.json` / `versions.json` / `package.json` 版本号更新为 `1.2.1`
- 打标签 `v1.2.1` 并发布：编辑视图（Live Preview）修复随本版本发布

## 2026-09-01 — 修复编辑视图（Live Preview）图片渲染与源码模式行为（v1.2.1）

- 现象：1.2.0 的编辑器扩展让源码模式也渲染了图片（源码模式应只显示链接文本），而 Live Preview 仍看不到图片
- 根因：
  - 扩展此前对源码模式与 Live Preview 一视同仁，源码模式也被 `Decoration.replace` 换成图片
  - Live Preview 下 Obsidian 内置图片 widget 会把 `![](s3:...)` 渲染为 `<img src="s3:...">`（`s3:` scheme 不可加载 → 占位符守卫替换为透明图 → 不可见），且优先级高于本插件 decoration，覆盖了插件的渲染
- 修复（`src/editor/s3EditorExtension.ts`）：
  - 用 Obsidian 导出的 `editorLivePreviewField`（`StateField<boolean>`）门控：源码模式下返回空 decorations，保持纯链接文本；仅 Live Preview 渲染图片
  - 用 `Prec.highest(...)`（`@codemirror/state`）包裹 ViewPlugin，使插件的内联 `<img>` widget 以最高优先级覆盖 Obsidian 内置图片 widget
- 验证：jest 12 套件 / 88 用例通过；tsc / eslint / 生产构建通过；打包产物已确认包含门控与最高优先级逻辑

## 2026-09-01 — 版本号 1.2.0（发布）

- `manifest.json` / `versions.json` / `package.json` 版本号更新为 `1.2.0`
- 打标签 `v1.2.0` 并发布：编辑视图（Live Preview）内联渲染 s3: 图片随本版本发布

## 2026-09-01 — 编辑视图（Live Preview）支持

- 现象：阅读/预览视图正常显示 `s3:` 图片，但编辑视图（Live Preview）什么都没有、源码模式只有链接文本
- 根因：`registerMarkdownPostProcessor` 只在预览模式触发；Live Preview 用 CodeMirror 6 渲染，不运行 post processor，且 `s3:` 非标准 scheme 不被 Obsidian 原生图片扩展识别
- 修复：
  - 新增 `src/editor/` —— CodeMirror 6 `ViewPlugin`（`s3EditorExtension.ts`）正则匹配 `![](s3:...)` / `![[s3:...]]` / `![[s3-sign:...]]`（含 wiki 嵌入），`Decoration.replace({ widget })` 替换为内联 `<img>` widget（`s3ImageWidget.ts`，占位符起步 + 异步解析）；光标位于链接内时跳过替换，保持原始 markdown 可编辑
  - `S3PostProcessor` 新增 `resolveLinkResourceUrl(rawKey)`：阅读/编辑共享的按需解析入口（缓存命中直读、未命中按需下载、`s3-sign:` 走签名缓存或重新生成）；`S3EditorLinkResolver` 对同一 key 去重 + 记忆化，避免选区移动触发重复下载
  - 注册：`main.ts` 经 `registerEditorExtension(s3EditorExtension(() => this.s3PostProcessor))`；`@codemirror/view` / `@codemirror/state` 保持 esbuild external（运行时由 Obsidian 提供）
- 验证：jest 12 套件 / 88 用例通过；tsc / eslint / 生产构建通过；正则匹配与 key 提取（`![]()` / `![[...]]` / `s3:` / `s3-sign:` / 普通 `https:` 不误命中）手工验证通过

## 2026-09-01 — 版本号 1.1.1（发布）

- `manifest.json` / `versions.json` / `package.json` 版本号更新为 `1.1.1`
- 打标签 `v1.1.1` 并发布：全局占位符守卫增强（提前注册 + childList）随本版本发布

## 2026-09-01 — 修复 s3: 链接仍报 net::ERR_UNKNOWN_URL_SCHEME（全局占位符守卫，v1.1.1）

- 现象：`![](s3:...)` / `![](s3-sign:...)` 在控制台仍出现 `GET s3:... net::ERR_UNKNOWN_URL_SCHEME`；后处理器的同步占位符替换未覆盖 Obsidian（或 live-preview 等）在 post-processor 之外再次设置 `src` 的场景；且 Obsidian 在插件 onload 完成前就开始渲染视图并创建 `<img src="s3:...">`（堆栈 `Image → initDOM → toDOM`）
- 修复：新增 `src/placeholderGuard.ts`（全局 MutationObserver 守卫）：任何元素 `src` 被设为 `s3:` / `s3-sign:` 时立即替换为占位符（img）或移除 `src`（video）；observer 回调早于浏览器加载，阻止 ERR
- 增强：守卫注册提前到 `onload` 最开头（早于 Obsidian 渲染视图）；observer 同时监听 `src` 属性变化与 `childList`（新增元素立即检查）；守卫由 `main.ts` 直接持有，onunload 断开
- 新增测试 7 例；jest 12 套件 88 用例通过

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
