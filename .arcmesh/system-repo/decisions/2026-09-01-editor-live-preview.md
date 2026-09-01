# 决策：编辑视图（Live Preview）内联渲染 s3: 图片

> 日期：2026-09-01
> 状态：**已实现**（代码已落地，待发布）
> 关联文档：`../architecture.md`、`../components/obsidian-plugin-s3-link.md`

## 1. 问题

阅读/预览视图正常显示 `s3:` 图片，但编辑视图（Live Preview）什么都没有、源码模式只有链接文本。原因：

- `registerMarkdownPostProcessor` 只在预览模式触发，Live Preview（编辑器）用 CodeMirror 6 渲染，不会运行 post processor；
- `s3:` 非标准 scheme，Obsidian 原生图片扩展不识别，因此编辑视图既不渲染图片、也不显示可点击占位。

## 2. 方案

新增 CodeMirror 6 编辑器扩展（`src/editor/`）：

- `s3EditorExtension.ts`：`ViewPlugin.fromClass` 用正则匹配 `![](s3:...)` / `![[s3:...]]` / `![[s3-sign:...]]`，`Decoration.replace({ widget, block:false })` 替换为内联 `<img>`；光标位于链接范围内时跳过替换（保持可编辑）；doc / selection / viewport 变化时重建 decorations。
- `s3ImageWidget.ts`：`<img>` 以 `Config.S3_LINK_PLACEHOLDER` 起步（避免 `s3:` 直接进入 `src`，规避 ERR_UNKNOWN_URL_SCHEME 与占位符守卫），异步解析真实资源路径后写回 `src`。
- `S3PostProcessor.resolveLinkResourceUrl(rawKey)`：共享解析入口——普通链接缓存命中直读、未命中按需下载；`s3-sign:` 走签名缓存或重新生成。`S3EditorLinkResolver` 对同一 key 去重 + 记忆化，避免选区每次移动触发重复下载。

## 3. 涉及文件

- 新增 `src/editor/s3EditorExtension.ts`（ViewPlugin + 正则 + 去重解析器 + 工厂 `s3EditorExtension(getPostProcessor)`）
- 新增 `src/editor/s3ImageWidget.ts`（WidgetType）
- `src/s3PostProcessor.ts` — 新增 `resolveLinkResourceUrl`
- `src/main.ts` — `setupMarkdownPostProcessor` 中注册 `registerEditorExtension(s3EditorExtension(() => this.s3PostProcessor))`
- `esbuild.config.mjs` — `@codemirror/view` / `@codemirror/state` 保持 external（运行时由 Obsidian 提供，无需改动）

## 4. 验证

- tsc / eslint / 生产构建通过；jest 12 套件 / 88 用例通过
- 正则匹配与 key 提取（`![]()` / `![[...]]` / `s3:` / `s3-sign:` / 普通 https 不误命中）手工验证通过
- 待人工验证：真实 vault 中切换编辑/阅读视图，确认内联图片显示、点击链接可编辑、切换后无报错

## 5. 注意事项与局限

- 仅内联渲染图片 `img`；视频 / span / 锚点在编辑视图暂不渲染（源码模式仍可见链接文本）。
- 编辑器内过期缓存不做远端 HEAD 校验（沿用本地缓存直读），避免选区每次移动触发网络请求；远端更新后的新版本在阅读视图重新渲染时生效。
- 正则假定 `s3:` / `s3-sign:` 出现在链接目的地开头。
- `@codemirror/*` 依赖 Obsidian 运行时提供（esbuild external）；若 Obsidian 未来变更其 CodeMirror 版本需兼容验证。
