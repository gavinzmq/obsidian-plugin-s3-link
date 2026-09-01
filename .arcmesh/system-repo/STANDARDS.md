# **标准（Standards）**

## **文档规则**

- 任何内容均不被覆盖——所有历史记录均保留
- 始终添加时间戳——格式为 `YYYY-MM-DD`
- 一个决策 = `decisions/` 中的一个文件
- 一个组件 = `components/` 中的一个文件，并带有累积章节

## **冲突解决优先级**

1. `decisions/` – 明确的决策始终优先
2. `architecture.md` – 技术精度优先于方向
3. `components/` – 模块特定内容优先于通用内容
4. `project.md` – 整体方向
5. `changelog.md` – 历史日志，不具有规范性

## **系统仓库位置**

- 系统仓库始终位于 `<workspaceRoot>/.arcmesh/system-repo/`
- 传递给 MCP 服务器 `args` 的所有路径 **必须** 使用绝对路径
- `mcp.json` 的服务器参数中 **禁止** 使用相对路径

## **已注册组件**

- `obsidian-plugin-s3-link` — Obsidian 插件；完整架构见 `architecture.md`，组件摘要见 `components/obsidian-plugin-s3-link.md`
- 新增组件时：在 `components/` 下创建 `<组件名>.md`，并在本节登记

## **云同步配置**

> 更新于 2026-08-27：`.arcmesh/` 现已纳入 Git 版本控制并托管于 GitHub；但以下敏感/私有文件仍须通过 `.arcmesh/.gitignore` 排除，严禁提交。

- `.arcmesh/cloud.json` – 包含 `cloudUrl`（非敏感，但属私有）
- `.arcmesh/.cloud-token` – API 令牌（敏感）
- 上述两者均由 `.arcmesh/.gitignore` 覆盖，**绝不允许** 提交
- `cloud.json` 格式：`{ "cloudUrl": "https://..." }`
- 通过命令 **ArcMesh: Configure Cloud Sync** 进行配置

---

# **开发规范与工作流**

## **语言与代码风格**

- **TypeScript**：启用严格模式（`strict: true`）。
- **ESLint**：使用 `@typescript-eslint` 推荐规则（配置文件 `.eslintrc.js`）。
- **Prettier**：统一代码格式（`.prettierrc`）：
  - `semi: true`
  - `singleQuote: true`
  - `trailingComma: 'all'`
  - `printWidth: 100`

## **Git 提交规范**

遵循 [Conventional Commits](https://www.conventionalcommits.org/)：

- `feat`: 新功能
- `fix`: 修复 bug
- `docs`: 文档变更
- `style`: 代码格式（不影响功能，如分号、缩进等）
- `refactor`: 代码重构
- `test`: 添加或更新测试
- `chore`: 维护任务（依赖、配置等）
- `ci`: CI/CD 相关

示例：`feat(uploader): 增加对又拍云的支持`

## **分支模型**

- `main` – 稳定分支，始终可发布。
- `feature/*` – 新功能开发。
- `fix/*` – bug 修复。
- `release/*` – 发布准备分支。
- 合并到 `main` 必须通过 PR，且 CI 检查全部通过。

## **测试要求**

- 为核心逻辑编写单元测试（Jest + jsdom），存放于 `test/unit/`。
- 集成测试（`test/integration/`）仅在本地运行，使用真实图床账号。
- 目标测试覆盖率不低于 80%。

## **文档规范**

- 每次代码变更（功能/修复/重构）必须同步更新 ArcMesh 蓝图：
  - 更新 `architecture.md`（架构/流程/版本号）与 `project.md`（版本/状态/已实现清单）；
  - 新增或更新 `decisions/` 决策记录（说明问题、方案、涉及文件、验证与注意事项）。
- 保持 ArcMesh `system-repo/` 与代码同步更新，记录架构和模块变更。
- 为公共 API 添加 JSDoc 注释。
- 每次发布更新 `README.md` 和 `CHANGELOG.md`。

## **AI 辅助使用指南**

- 通过 Copilot Chat + DeepSeek V4 进行代码生成、评审和调试。
- 提问时引用 ArcMesh 文档，为 AI 提供上下文。
- 对 AI 生成的代码，特别是安全敏感部分（如签名、密钥处理），必须人工审核。

## **构建与持续集成**

- 本地仅保留开发命令：`pnpm dev`（监听构建）。lint / test / 生产构建全部由 GitHub Actions 执行（`.github/workflows/ci.yaml`，push / PR 时运行 `lint → test → build`）。
- 推送 `v*` 标签时自动触发 Release 发布流程（`.github/workflows/release.yaml`）。

## **代码审查要点**

- 是否遵循 TypeScript 严格类型。
- 是否包含充分的测试用例。
- 是否更新了相关文档。
- 是否处理了边界条件和错误。
- 是否存在性能隐患（如大文件处理、同步阻塞）。
