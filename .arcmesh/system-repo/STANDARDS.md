# Standards

## Documentation Rules

- Nothing is overwritten – all history is preserved
- Always timestamp – format YYYY-MM-DD
- One decision = one file in `decisions/`
- One component = one file in `components/` with accumulated sections

## Conflict Resolution Priority

1. `decisions/` – explicit decision always wins
2. `architecture.md` – technical precision over direction
3. `components/` – module-specific over general
4. `project.md` – overall direction
5. `changelog.md` – historical log, not normative

## System-Repo Location

- The system-repo is always located at `<workspaceRoot>/.arcmesh/system-repo/`
- All paths passed to MCP server args MUST be absolute
- Relative paths are forbidden in `mcp.json` server args

## Registered Components

- `obsidian-plugin-s3-link` — Obsidian 插件；完整架构见 `architecture.md`，组件摘要见 `components/obsidian-plugin-s3-link.md`
- 新增组件时：在 `components/` 创建 `<组件名>.md`，并在本节登记

## Cloud Sync Config

> 更新 2026-08-27：`.arcmesh/` 现已纳入 Git 版本控制并托管于 GitHub；但以下敏感/私有文件仍须通过 `.arcmesh/.gitignore` 排除，严禁提交。

- `.arcmesh/cloud.json` – inneholder `cloudUrl` (ikke sensitiv, men privat)
- `.arcmesh/.cloud-token` – API-token (sensitiv)
- Begge dekkes av `.arcmesh/.gitignore` og skal aldri committes
- Format for `cloud.json`: `{ "cloudUrl": "https://..." }`
- Konfigureres via kommandoen `ArcMesh: Configure Cloud Sync`
