# DeepSpace —   Autonomous Learning Memory System

<p align="center">
  <img src="https://img.shields.io/badge/tests-143%20passed-brightgreen" alt="Tests">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="License">
  <img src="https://img.shields.io/badge/version-0.8.1-blue" alt="Version">
  <img src="https://img.shields.io/badge/python-3.12%2B-blue" alt="Python">
  <img src="https://img.shields.io/badge/agents-9-orange" alt="Agents">
  <img src="https://img.shields.io/badge/commands-30-brightgreen" alt="Commands">
  <img src="https://img.shields.io/badge/plugins-3-brightgreen" alt="Plugins">
</p>

> **观察你的工作，构建知识图谱，自主学习，主动推送，自主解决问题。**

DeepSpace 是一个运行在后台的 AI 记忆引擎。它不是被动笔记——它会**主动思考**你还需要什么，**自己研究**知识空白，**自动执行**解决方案，然后**推送通知**告诉你结果。

---

##   What's New in v0.8

| 功能 | 说明 |
|------|------|
|   Plugin Ecosystem | timer_tool, webhook_tool, echo_tool — 可扩展动作类型 |
|   Auto-Tagging | LLM 为新记忆自动推荐 2-4 个标签 |
|   Unified Search | `deepspace search` 并行搜索记忆 + 知识图谱 |
|   Dashboard Export | 一键下载 stats + executions JSON |
|   Model Failover | 多 provider 自动容错 + 健康检查恢复 |
|   API Auth | `DEEP_SPACE_API_TOKEN` Bearer 认证 |
|   Analytics | 项目热力图、类型分布、增长曲线 |
|   D3.js Graph | 力导向知识图谱可视化 |
|   Timeline | 60 天记忆 + 执行时间线 |
|   WebSocket Live | 实时 Dashboard 更新 + 桌面通知 |

---

##   Screenshots

<p align="center">
  <em>Dashboard Overview</em><br>
  <img src="screenshots/dashboard-overview.png" width="80%" alt="Overview">
</p>

<p align="center">
  <em>D3.js Knowledge Graph</em><br>
  <img src="screenshots/dashboard-graph.png" width="80%" alt="Graph">
</p>

<p align="center">
  <em>CLI: deepspace solve</em><br>
  <img src="screenshots/cli-solve.png" width="80%" alt="CLI">
</p>

---

##   Architecture

```
┌─────────────────────────────────────────────────┐
│                  DeepSpace Core                  │
│                                                  │
│  Memory Engine  ←→  Knowledge Graph (Neo4j)      │
│  (pgvector)           + D3.js 可视化             │
│                                                   │
│  Autonomous Learner   Proactive Service           │
│  + Auto-tagging       + Desktop 通知              │
│  + Dedup              + Push                     │
│                                                   │
│  Agent Orchestrator (9 agents)                    │
│  Executive / Research / Memory / Graph /          │
│  Planning / Action / Verification /               │
│  Reflection / Proactive                           │
│                                                   │
│  Model Router         Plugin Manager              │
│  (容错切换)           (3 plugins)                 │
│                                                   │
│  FastAPI + WebSocket  ←→  Web Dashboard           │
│  (24 endpoints)           (6 tabs)                │
└─────────────────────────────────────────────────┘

   Goal → Plan → Execute → Verify → Learn → Remember
     ↑_______________________________________________│
```

**四层记忆模型**: `短期记忆 → 工作记忆 → 长期记忆 ← 元记忆`

---

##   Quick Start

### pip install

```bash
git clone https://github.com/WindRiders/opendeepspace.git
cd opendeepspace
pip install -e ".[dev]"
export DASHSCOPE_API_KEY="sk-..."
deepspace init
```

### Docker

```bash
docker run -d --name deepspace \
  -e DASHSCOPE_API_KEY=sk-xxx \
  -p 8645:8645 \
  windriders/opendeepspace
```

### Try it

```bash
deepspace remember "PostgreSQL runs on port 5440"
deepspace recall "PostgreSQL"
deepspace search "database"
deepspace solve "check Docker containers"
deepspace serve        # → http://localhost:8645/dashboard
deepspace orchestrate  # → background loop (auto-solve every 2h)
```

---

##   CLI Commands (30 total)

| 分类 | 命令 |
|------|------|
| 记忆 | `remember` `recall` `search` `show` `forget` `consolidate` `stats` `dedup` |
| 图谱 | `graph` `neighbors` |
| 学习 | `learn` `reflect` |
| 推送 | `predict` `push` `briefing` |
| 执行 | `solve` `auto-solve` `executions` |
| 运维 | `init` `serve` `orchestrate` `logs` `timeline` `model-status` |
| 数据 | `export` `import-memories` |
| 工具 | `completion` `plugins` `schedule` |

All commands support `--json/-j` for machine-readable output.

---

##   Tech Stack

| 组件 | 技术 |
|------|------|
| Language | Python 3.12+ |
| Vector DB | PostgreSQL + pgvector |
| Graph DB | Neo4j 5 Community |
| LLM | DashScope / OpenAI API (with ModelRouter failover) |
| API | FastAPI + WebSocket |
| CLI | Click + Rich |
| Dashboard | Vanilla JS + D3.js |
| Container | Docker + Docker Compose |
| Tests | pytest (143 tests, 85% coverage) |

---

##   Project Structure

```
opendeepspace/
├── core/                       # Core engine
│   ├── models.py               # Data models (Memory, Entity, Goal, etc.)
│   ├── llm_client.py           # LLM client with ModelRouter failover
│   ├── memory_engine.py        # Four-layer memory + auto-tagging + dedup
│   ├── agent_executor.py       # Safe command execution sandbox
│   ├── orchestrator.py         # 9-agent coordinator + solve pipeline
│   ├── model_router.py         # Multi-provider failover
│   ├── plugin_manager.py       # Plugin discovery and lifecycle
│   ├── timeline.py             # Chronological event generator
│   ├── notifier.py             # Desktop notifications
│   ├── proactive_service.py    # Context detection + push
│   ├── autonomous_learner.py   # Idle-time research
│   └── errors.py               # Standardized error handling
├── storage/                    # Storage layer
│   ├── interfaces.py           # Abstract interfaces
│   ├── pgvector_store.py       # PostgreSQL + pgvector
│   └── neo4j_store.py          # Neo4j graph store
├── api/server.py               # FastAPI (24 endpoints) + WebSocket
├── cli/deepspace.py            # 30 CLI commands
├── integrations/hermes_bridge.py  # Hermes Agent integration
├── plugins/                    # Plugin system
│   ├── echo_tool/              # Echo action type
│   ├── timer_tool/             # Timer + countdown
│   └── webhook_tool/           # Webhook calls
├── templates/dashboard.html    # 6-tab Web Dashboard
├── config/config.yaml          # Configuration
├── Dockerfile                  # Multi-stage Docker build
├── docker-compose.yml          # PostgreSQL + Neo4j services
└── tests/                      # 143 unit + 9 integration tests
```

---

##   Documentation

| 文档 | 链接 |
|------|------|
| Full Docs | https://windriders.github.io/opendeepspace |
| API Reference | [docs/api.md](docs/api.md) |
| Architecture | [docs/architecture.md](docs/architecture.md) |
| Deployment | [docs/deployment.md](docs/deployment.md) |
| Development | [docs/development.md](docs/development.md) |
| Changelog | [CHANGELOG.md](CHANGELOG.md) |

---

##   Development

```bash
pip install -e ".[dev]"
pytest tests/ -v --ignore=tests/integration  # 143 tests
pytest tests/integration/ -v                  # requires Docker
ruff check core/ storage/ api/ cli/
```

See [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

---

##   License

MIT — see [LICENSE](LICENSE)

---

<p align="center">
  <sub>Made with   by <a href="https://github.com/WindRiders">WindRiders</a></sub>
</p>