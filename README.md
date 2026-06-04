# DeepSpace — AI Agent Development Platform

<p align="center">
  <img src="https://img.shields.io/badge/tests-246%20python%20%7C%20388%20jest%20%7C%20351%20vitest-brightgreen" alt="Tests">
  <img src="https://img.shields.io/badge/python-3.11%2B-3776AB" alt="Python">
  <img src="https://img.shields.io/badge/typescript-5.7%2B-blue" alt="TypeScript">
  <img src="https://img.shields.io/badge/node-20%2B-green" alt="Node">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="License">
  <img src="https://img.shields.io/badge/version-0.9.1-blue" alt="Version">
</p>

> **Multi-agent collaboration platform with 4-layer memory engine, 9-agent orchestrator, autonomous learner, and MCP server.**

DeepSpace uses **Python for the AI core** (memory engine, model routing, autonomous agent orchestration) and **TypeScript for the Web/API layer** (NestJS gateway + Next.js frontend), connected via gRPC.

---

## Architecture

```
┌──────────────────────────────────────────────────┐
│                 DeepSpace Platform                 │
│                                                   │
│  apps/studio-web (Next.js 16 + React 19)           │
│  └── Chat · Collab · Memory · Sandbox · Market    │
│         │                                         │
│         ▼ HTTP/SSE + WebSocket (JWT)               │
│  apps/core-engine (NestJS 11)                      │
│  └── API Gateway · JWT Auth · Rate Limiting ·     │
│      SSE Proxy · WebSocket Relay · gRPC Client    │
│         │                                         │
│         ▼ gRPC (internal)                          │
│  engine/ (Python 3.11+, FastAPI)                   │
│  ├── Memory Engine (pgvector + Neo4j)              │
│  ├── 9-Agent Orchestrator                         │
│  ├── Autonomous Learner + Proactive Push          │
│  ├── Model Router (health check + failover)        │
│  ├── Safety Sandbox (27 dangerous patterns)        │
│  ├── MCP Server (stdio + SSE)                     │
│  └── 6 Built-in Tools + Plugin System             │
└──────────────────────────────────────────────────┘
```

---

## Quick Start

### Prerequisites

Node.js >= 20, pnpm >= 9, Python >= 3.11, Docker (for databases)

### Development

```bash
git clone https://github.com/WindRiders/DeepSpace.git
cd DeepSpace

# Start databases
docker compose -f docker-compose.dev.yml up -d postgres neo4j

# Python engine
cd engine
pip install -e .
cp .env.example .env  # add DASHSCOPE_API_KEY
python -m uvicorn api.server:app --port 8645 &
python -m api.grpc_server &

# TypeScript
pnpm install
cp apps/core-engine/.env.example apps/core-engine/.env
pnpm dev
# Backend: http://localhost:3001  |  Frontend: http://localhost:3000
```

### Production (Docker)

```bash
docker compose -f docker-compose.full.yml up -d
# Everything starts: PostgreSQL + Neo4j + Python Engine + NestJS + Next.js
```

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| AI Engine | Python 3.11+, FastAPI, gRPC |
| Memory | pgvector (vector search) + Neo4j (knowledge graph) |
| API Gateway | NestJS 11, gRPC Client, Socket.IO |
| Frontend | Next.js 16, React 19, Tailwind CSS 4 |
| LLM | DashScope / OpenAI API compatible (ModelRouter with failover) |
| MCP | stdio + SSE server (10 tools, Claude Desktop compatible) |
| Tests | pytest 246 + Jest 388 + Vitest 351 = **985** |
| Infra | Docker Compose (PostgreSQL, Neo4j, Engine, Gateway, Frontend) |

---

## Project Structure

```
deepspace/
├── engine/                        # Python AI engine
│   ├── api/
│   │   ├── server.py              # FastAPI (REST + SSE + Socket.IO)
│   │   ├── grpc_server.py         # gRPC server (13 RPC methods)
│   │   └── mcp_server.py          # MCP stdio + SSE server
│   ├── core/
│   │   ├── memory_engine.py       # 4-layer memory (pgvector + Neo4j)
│   │   ├── orchestrator.py        # 9-agent orchestration
│   │   ├── agent_executor.py      # Sandboxed execution + safety
│   │   ├── autonomous_learner.py  # Idle-time research
│   │   ├── proactive_service.py   # Context detection + push
│   │   ├── model_router.py        # Health check + failover
│   │   ├── llm_client.py          # LLM abstraction
│   │   └── plugin_manager.py      # Plugin system (6 extension points)
│   ├── storage/
│   │   ├── pgvector_store.py      # Vector + keyword search
│   │   └── neo4j_graph_store.py   # Knowledge graph
│   └── config/
│       └── config.yaml            # Central configuration
├── apps/
│   ├── core-engine/               # NestJS API gateway
│   │   └── src/
│   │       ├── agent/             # gRPC proxy to Python engine
│   │       ├── auth/              # JWT auth + user management
│   │       ├── collab/            # Collaboration WebSocket relay
│   │       ├── memory/            # Memory gRPC client
│   │       ├── grpc/              # gRPC client definitions
│   │       └── ...
│   └── studio-web/                # Next.js frontend
│       └── src/app/
│           ├── components/        # Chat, CollabPanel, MemoryPanel, ...
│           └── hooks/             # API hooks
├── tests/                         # Python tests (246)
```

---

## Running Tests

```bash
# Python unit tests (246)
cd engine && pytest tests/ --ignore=tests/integration -v

# Backend unit tests (388)
pnpm --filter @deepspace/core-engine exec jest --forceExit

# Frontend tests (351)
pnpm --filter @deepspace/studio-web exec vitest run

# TypeScript check
npx tsc --noEmit -p apps/core-engine/tsconfig.json
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [CHANGELOG.md](CHANGELOG.md) | Version history |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Development guide |
| [SECURITY.md](SECURITY.md) | Security policy |

---

## License

MIT — see [LICENSE](LICENSE)

---

<p align="center">
  <sub>Made with ❤️ by <a href="https://github.com/WindRiders">WindRiders</a></sub>
</p>