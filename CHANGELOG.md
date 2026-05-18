# Changelog

All notable changes to DeepSpace will be documented in this file.

## [0.2.0] - 2026-05-18

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