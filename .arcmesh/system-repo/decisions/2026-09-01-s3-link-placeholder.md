# 决策：s3: 链接占位符修复（消除 net::ERR_UNKNOWN_URL_SCHEME）

> 日期：2026-09-01
> 状态：**已实现**（v1.0.10）
> 关联文档：`../architecture.md`

## 1. 问题

与 obsidian-plugin-auto-upload 共同使用时，auto-upload 通过 URL 后处理管道把图床链接改成 `s3:...`，Obsidian 渲染 `![](s3:images/x.jpeg)` 时浏览器报 `GET s3:... net::ERR_UNKNOWN_URL_SCHEME`。

根因：Obsidian markdown 渲染器直接生成 `<img src="s3:...">`；`s3:` 不是 Electron 注册的 scheme。后处理器异步下载文件，浏览器在 `src` 被替换为本地资源路径之前就尝试加载未知 scheme 而报错。

## 2. 方案

在解析器**同步阶段**（任何 `await` 之前）立即移除媒体元素上的 `s3:` URL，避免浏览器发起未知 scheme 的加载请求：

- `Config.S3_LINK_PLACEHOLDER`：透明 GIF data URI（`data:image/gif;base64,...`）。
- `ImageResolver`：命中 `s3:` / `s3-sign:` 的 `img` 时，立即 `img.src = S3_LINK_PLACEHOLDER`；后处理器取到本地文件或签名 URL 后写回真实 `src`。
- `VideoResolver`：命中 `video` 时立即 `removeAttribute("src")`，同样由后处理器回填。
- `span` / `anchor` 无需处理：非媒体元素不会自动加载 `src`/`href`。

## 3. 涉及文件

- `src/config.ts` — 新增 `S3_LINK_PLACEHOLDER`
- `src/resolver/imageResolver.ts` — 同步替换 `img.src` 为占位符
- `src/resolver/videoResolver.ts` — 同步 `removeAttribute("src")`
- `test/imageResolver.test.ts` — 新增 2 例（占位符替换、非 s3 图片不受影响）
- `test/videoResolver.test.ts` — 新增 1 例（src 属性被清除）
- `manifest.json` / `package.json` / `versions.json` — 版本号 1.0.10

## 4. 验证

- Jest：8 套件 / 60 用例全部通过
- 渲染 `![](s3:images/x.jpeg)` 不再出现 `net::ERR_UNKNOWN_URL_SCHEME`，图片最终显示本地缓存内容

## 5. 注意事项

- 占位符仅覆盖图片/视频元素；用户主动点击 `s3:` 形式的 `href` 时仍可能触发未知 scheme 加载（当前未处理）。
- 占位符替换必须保持同步——若在 `await` 之后才替换，浏览器可能已经发起加载并报错。
