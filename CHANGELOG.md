# Changelog

All notable changes to DeepSpace will be documented in this file.

## [0.5.0] - 2026-05-18

### Added

- **Desktop Notifications**: Cross-platform native OS notifications (macOS/Linux/Windows) with fallback to log file
- **D3.js Graph Visualization**: Force-directed knowledge graph explorer in Web Dashboard
- **WebSocket Live Dashboard**: Real-time connection indicator, auto-refresh on orchestrator events
- **`--json` Output**: All CLI commands support `--json/-j` for machine-readable output
- **Memory Deduplication**: `deepspace dedup` — LLM-based semantic similarity detection and auto-merge
- **Notifier Integration**: Proactive push triggers desktop notifications automatically

### Changed

- Dashboard completely redesigned with D3.js, WebSocket live updates, and graph visualization
- Version bumped to 0.5.0
- README revamped with feature table and updated description
- 133 unit tests (up from 122)

### Added

- **Web Dashboard**: Dark-themed SPA at `/dashboard` with Overview, Memories, Knowledge Graph, and Executions tabs
- **Export/Import**: `deepspace export` (JSON/Markdown) and `deepspace import-memories` with dry-run support
- **Log Viewer**: `deepspace logs --follow` with level filtering (DEBUG/INFO/WARNING/ERROR) and color-coded output
- **Error Handling**: Standardized `ErrorCode` enum (25 codes), 6 custom exception classes, API error handlers
- **Integration Tests**: 9 real-database tests requiring Docker (auto-skip in CI without Docker)
- **Dashboard API**: Error middleware, HTML template serving

### Changed

- Version bumped to 0.4.0
- CLI upgraded to 24 commands
- Health endpoint enriched with features list

## [0.3.0] - 2026-05-18

### Added

- **Agent Orchestrator**: Multi-agent coordination with 7 specialized agents (Executive, Research, Memory, Graph, Planning, Reflection, Proactive)
- **Autonomous Learner**: Idle-time research with CPU monitoring, cost budgeting, and priority-based task scheduling
- **Proactive Service**: Context-aware prediction and push notification system
- **CLI**: 18 commands via Click + Rich — remember, recall, graph, learn, predict, orchestrate, etc.
- **FastAPI Server**: REST API + WebSocket on port 8645
- **Neo4j Integration**: Knowledge graph with entity extraction, relation inference, and graph search
- **pgvector Storage**: Vector similarity search for hybrid memory retrieval
- **Hermes Agent Integration**: Optional bridge for cronjob scheduling and config sharing
- **Config**: YAML-based configuration with environment variable interpolation
- **Docker Compose**: One-command setup for PostgreSQL+pgvector and Neo4j

### Changed

- Complete rewrite of memory engine with four-layer model
- Migrated from Chroma-only to PostgreSQL+pgvector primary storage

## [0.1.0] - 2026-04

### Added

- Initial prototype with Chroma vector storage
- Basic memory recall and retrieval
- Three-layer memory model (short-term, working, long-term)

[0.2.0]: https://github.com/WindRiders/opendeepspace/releases/tag/v0.2.0
[0.1.0]: https://github.com/WindRiders/opendeepspace/releases/tag/v0.1.0