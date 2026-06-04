# Changelog

## [0.9.1] - 2026-06-04

### Added

- **安全规则增强**: DANGEROUS_PATTERNS 14→27 条，覆盖 fork bomb 变体、netcat/bash 反向 shell、NVMe/macOS 块设备覆盖、`eval` 注入、base64 编码载荷
- **测试覆盖**: 新增 55 个 Python 单元测试（model_router +6, autonomous_learner +18, orchestrator +6, agent_executor +24, security patterns +5），总计 189 通过
- **16 个 REST 端点**: 前端兼容层（PATCH /auth/me, conversations CRUD, plugins CRUD, templates, marketplace CRUD, shares CRUD, traces CRUD）
- **Collab WebSocket**: Socket.IO 实时协作端点（connect/execute-session/disconnect）
- **SSE 增强**: thinking/tool_call_start/tool_call_result 事件类型，编排器任务路由

### Changed

- **Config 精简**: config.yaml 92→55 行，移除 17 个未使用的配置节

### Fixed

- **Memory recall 响应格式**: `results` → `memories`，新增 summary/memoryType/project/tags/source 字段
- **AutonomousLearner daily_cost**: 新增每日预算追踪，`status()` 暴露 daily_cost/daily_budget
- **gRPC server**: 修复 8 处 async/await + 类型错误，Docker 入口脚本同时启动 FastAPI + gRPC
- **Embedding 模型名**: 容器内修正为 `BAAI/bge-small-zh-v1.5`

---

## [0.9.0] - 2026-05-31

### Added

- **gRPC 内部协议**: Proto 定义 + Python gRPC Server (13 个 RPC 方法) + TypeScript gRPC Client
- **MCP Server**: stdio + SSE 双传输，10 个 MCP 工具，兼容 Claude Desktop
- **Memory Gateway**: NestJS Memory 模块代理 Python 记忆引擎（recall/remember/consolidate/graph）
- **前端面板**: MemoryPanel（记忆搜索）、ModelStatus（模型健康）、AutonomousPanel（自主学习）
- **Docker 全栈**: docker-compose.full.yml（Python Engine + NestJS + Next.js + PostgreSQL + Neo4j）
- **Gateway 健康检查**: `/health` 端点，Docker HEALTHCHECK 正常
- **模型列表**: `/agent/models` 返回 4 个可用模型（DeepSeek V4 Pro / Qwen Turbo / Plus / Max）
- **6 个工具名**: AgentService 暴露 6 个内置工具到 `/agent/status`
- **`.env` 配置**: API Key 自动加载，docker compose up 无需手动传环境变量

### Changed

- **架构**: Python 为 AI 核心引擎，TypeScript NestJS 为 API 网关层
- **AgentService**: 从本地 LangChain 5 轮循环 → gRPC 代理到 Python Engine
- **OrchestratorService**: 从本地 LLM 调用 → gRPC 代理到 Python Orchestrator
- **Config 加载**: 容器内自动 fallback `/app/config/config.yaml`，env var 覆盖数据库连接

### Fixed

- Dockerfile.web pnpm 符号链接断裂 → `pnpm deploy` 展平 node_modules
- Dockerfile 配置路径 `/root/deepspace/` → `/app/config/config.yaml`
- gRPC health_checks 未 await → `asyncio.create_task()`
- Config 连接地址 localhost → Docker 服务名（env var 覆盖）

### Removed

- AgentService LangChain 循环逻辑（~150 行）
- OrchestratorService 本地 LLM 调用逻辑（~80 行）

### Test Coverage

- Python: 160 tests | NestJS: 388 tests | Frontend: 351 tests | **Total: 899**

### Architecture

```
Next.js Frontend → NestJS Gateway (gRPC Client) → Python Engine (gRPC Server)
```

---

## [0.5.0] - 2026-05-24

### Added

- **Marketplace E2E tests**: 18 tests covering publish, search, tag filter, star, download, delete, auth isolation
- **Plugins E2E tests**: 10 tests covering list, install, reload, toggle, error handling
- **Guard unit tests**: `JwtAuthGuard` and `WsJwtGuard` specs (7 tests)
- **Error handling**: SandboxExplorer, ReplayPlayer, ShareDialog now have proper error states
- Total: 370+ unit tests, 141 E2E tests, 242 frontend tests (753+ total)

### Changed

- **Refactored `orchestrator.service.ts`** (417 → 221 lines): extracted `CollabSessionStore` for session CRUD
- **Refactored `agent.service.ts`** (410 → 273 lines): extracted `agent-error.utils.ts` for error classification
- **Refactored `CollabPanel.tsx`** (482 → 222 lines): extracted `AgentSetupView`, `AgentSessionView`, `AgentStreamOutput`
- **Refactored `Sidebar.tsx`** (361 → 154 lines): extracted `ConfigTab`, `HistoryTab`

### Fixed

- **Bug**: `marketplace.controller.ts` — `publishAgent` used `username` for author but `deleteAgent` matched against `sub`, preventing users from deleting own agents
- **Bug**: `CollabPanel` `startCollab()` catch block was empty — now sets error state
- **Bug**: `SandboxExplorer` silently failed on API errors — now shows error messages

### Removed

- **Dead code**: `reload-plugin.dto.ts` (never imported)
- **Dead code**: `CollabDone.event` unused field references

### Docs

- Rewrote `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md` for TypeScript monorepo

---

## [0.4.0] - 2026-05-22

### Added

- **Marketplace module**: agent publishing, search, tag filtering, star/download counters, author-scoped deletion
- **Plugins module**: plugin registry, install/reload/toggle lifecycle, tool auto-loading
- **E2E tests for marketplace and plugins**: 28 new integration tests
- All controllers now have unit test specs (100% coverage)

### Fixed

- SSRF protection: `http_request` tool now correctly blocks `172.16.0.0/12` range using regex instead of string prefix
- Type consistency: `CollabAgentDone` uses `fullContent`, `CollabDone` includes `summary`, `TraceStep` uses `step`
- Session status: `'executing'`/`'complete'` throughout collab module (was `'running'`/`'completed'`)

---

## [0.3.0] - 2026-05-21

### Added

- **Multi-agent collaboration**: planner, coder, reviewer, researcher agents with handoff-based orchestration
- **SSE streaming**: real-time agent output via Server-Sent Events + RxJS Subjects
- **WebSocket real-time sync**: `CollabGateway` with room-based messaging, typing indicators, online counts
- **Execution traces**: step-by-step recording of agent reasoning and tool calls with replay UI
- **Auth system**: JWT authentication (Passport), bcrypt password hashing, profile management

---

## [0.2.0] - 2026-05-20

### Added

- **Agent engine**: LLM-powered agent with tool calling capability
- **Tool system**: `read_file`, `write_file`, `list_files`, `shell_exec`, `http_request`, `code_run`
- **Sandboxed execution**: isolated file system and code execution environment
- **Session management**: conversation persistence, session limits, context loading

---

## [0.1.0] - 2026-05-19

### Added

- Initial monorepo setup: pnpm workspaces + Turborepo
- NestJS backend with SQLite (better-sqlite3)
- Next.js 16 frontend with Tailwind CSS 4
- Shared types package (`@deepspace/shared-types`)
- LLM provider abstraction (DashScope + OpenAI compatible)