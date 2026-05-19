# Changelog

## [0.8.1] - 2026-05-18

### Fixed

- Auto-tagging now persists to database after LLM suggestion (was only in-memory)
- Version management: git tags, README badges, CHANGELOG all synchronized

## [0.8.0] - 2026-05-18

### Added

- **Plugin ecosystem**: timer_tool (delay/countdown), webhook_tool (external API calls), echo_tool (testing)
- **Auto-tagging**: LLM suggests 2-4 tags on `remember()` when no tags provided
- **Unified search**: `deepspace search` — parallel recall + graph entity search
- **Dashboard export**: one-click JSON download of stats + executions
- **Docker image**: multi-stage build ready for `windriders/opendeepspace`
- 30 CLI commands, 3 plugins

## [0.7.3] - 2026-05-18

### Fixed

- Execution history persisted to PostgreSQL (survive restarts)
- Plugin handlers injected into API Orchestrator instances via global singleton

## [0.7.2] - 2026-05-18

### Fixed

- `_load_plugins()` async violation (nested asyncio.run in event loop)
- `echo-tool` → `echo_tool` (Python module name cannot have hyphens)
- `verify_auth` dead code — now applied to `POST /solve`
- CLI `timeline` missing execution data (no orchestrator passed)
- `plugins enable/disable` false success on missing plugin name

## [0.7.1] - 2026-05-18

### Fixed

- Orchestrator `run_loop` now runs auto-solve every 2 hours
- ModelRouter health checks started on server/orchestrator startup
- Plugins auto-loaded on server/orchestrator startup

## [0.7.0] - 2026-05-18

### Added

- **ModelRouter → LLMClient**: all chat() calls route through failover with automatic provider switching
- **Plugins → AgentExecutor**: custom action types from plugins execute before built-in handlers
- **API auth middleware**: optional Bearer token protection via `DEEP_SPACE_API_TOKEN`
- **Analytics endpoint**: project heatmaps, memory type distribution, growth curves, importance stats
- **Dashboard 6 tabs**: Overview, Memories, Graph(D3.js), Executions, Timeline, Analytics

## [0.6.0] - 2026-05-18

### Added

- **Model Router**: multi-provider failover with health checks, failure tracking, round-robin
- **Plugin Manager**: discovery, loading, lifecycle (load/enable/disable/unload), 5 extension points
- **Timeline Generator**: chronological memory + execution views, project timelines, milestone detection
- **Example plugin**: echo_tool with echo action type
- CLI: `timeline`, `plugins`, `model-status` commands
- API: `/timeline`, `/plugins`, `/model-status` endpoints

## [0.5.0] - 2026-05-18

### Added

- **Desktop Notifications**: cross-platform (macOS/Linux/Windows) with fallback logging
- **D3.js Graph Visualization**: force-directed knowledge graph in Web Dashboard
- **WebSocket Live Dashboard**: real-time connection indicator, auto-refresh on orchestrator events
- **`--json` output**: all CLI commands support machine-readable JSON output
- **Memory Deduplication**: `deepspace dedup` with LLM semantic similarity detection

## [0.4.0] - 2026-05-18

### Added

- **Web Dashboard**: 4-tab SPA at `/dashboard`
- **Export/Import**: `deepspace export` (JSON/Markdown) + `deepspace import-memories` with dry-run
- **Log viewer**: `deepspace logs --follow` with level filtering and color output
- **Error standards**: `ErrorCode` enum (25 codes), 6 custom exception classes, API error middleware
- **Integration tests**: 9 real-database tests (auto-skip without Docker)
- CLI: 26 commands, 122 unit tests

## [0.3.0] - 2026-05-18

### Added

- **Interactive init wizard**: `deepspace init` with 6-step guided setup
- **Docker support**: `Dockerfile` + `docker run` one-command start
- **Shell completion**: bash/zsh/fish tab autocompletion
- **`--version` flag**: version display + friendly welcome screen
- README badges for CI status, coverage, license

## [0.2.0] - 2026-05-18

### Added

- **Agent Orchestrator**: 7 specialized agents (Executive, Research, Memory, Graph, Planning, Reflection, Proactive)
- **Autonomous Learner**: idle-time research with CPU monitoring, cost budgeting, priority scheduling
- **Proactive Service**: context-aware prediction and push notifications
- **CLI**: 18 commands via Click + Rich
- **FastAPI Server**: REST + WebSocket on port 8645
- **Neo4j + pgvector**: full knowledge graph + vector storage
- **Docker Compose**: one-command database setup

## [0.1.0] - 2026-04

### Added

- Initial prototype: Chroma vector storage, basic memory recall, three-layer model

[0.8.1]: https://github.com/WindRiders/opendeepspace/releases/tag/v0.8.1
[0.8.0]: https://github.com/WindRiders/opendeepspace/releases/tag/v0.8.0
[0.7.3]: https://github.com/WindRiders/opendeepspace/releases/tag/v0.7.3
[0.7.2]: https://github.com/WindRiders/opendeepspace/releases/tag/v0.7.2
[0.7.1]: https://github.com/WindRiders/opendeepspace/releases/tag/v0.7.1
[0.7.0]: https://github.com/WindRiders/opendeepspace/releases/tag/v0.7.0
[0.6.0]: https://github.com/WindRiders/opendeepspace/releases/tag/v0.6.0
[0.5.0]: https://github.com/WindRiders/opendeepspace/releases/tag/v0.5.0
[0.4.0]: https://github.com/WindRiders/opendeepspace/releases/tag/v0.4.0
[0.3.0]: https://github.com/WindRiders/opendeepspace/releases/tag/v0.3.0
[0.2.0]: https://github.com/WindRiders/opendeepspace/releases/tag/v0.2.0
[0.1.0]: https://github.com/WindRiders/opendeepspace/releases/tag/v0.1.0