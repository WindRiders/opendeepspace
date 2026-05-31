# DeepSpace — AI Agent Development Platform

<p align="center">
  <img src="https://img.shields.io/badge/tests-675%2B%20passed-brightgreen" alt="Tests">
  <img src="https://img.shields.io/badge/python-3.12%2B-3776AB" alt="Python">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="License">
  <img src="https://img.shields.io/badge/version-0.9.0-blue" alt="Version">
  <img src="https://img.shields.io/badge/typescript-5.7%2B-blue" alt="TypeScript">
  <img src="https://img.shields.io/badge/node-20%2B-green" alt="Node">
</p>

> **Multi-agent collaboration platform with LLM-powered agents, real-time streaming, and sandboxed tool execution.**

DeepSpace is a TypeScript monorepo: NestJS backend + Next.js frontend + shared types. It provides an agent engine with tool calling, multi-agent orchestration, SSE streaming, WebSocket real-time sync, and a marketplace for sharing agent configurations.

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   DeepSpace                      │
│                                                  │
│  apps/core-engine (NestJS 11)                    │
│  ├── Agent Engine (LLM + tool calling)           │
│  ├── Multi-agent Collab (planner/coder/          │
│  │   reviewer/researcher + handoff)              │
│  ├── SSE Streaming + WebSocket (Socket.IO)       │
│  ├── JWT Auth (Passport + bcrypt)                │
│  ├── Sandbox (isolated FS + code exec)           │
│  ├── Marketplace + Plugins                       │
│  └── SQLite (better-sqlite3, WAL mode)           │
│                                                   │
│  apps/studio-web (Next.js 16 + React 19)          │
│  ├── Chat Interface + Streaming                  │
│  ├── Collab Panel (multi-agent orchestration)    │
│  ├── Sandbox Explorer + Trace Replay             │
│  ├── Marketplace + Share Dialog                  │
│  └── Tailwind CSS 4                              │
│                                                   │
│  packages/shared-types                           │
│  └── TypeScript interfaces                       │
└─────────────────────────────────────────────────┘
```

---

## Quick Start

### Prerequisites

Node.js >= 20, pnpm >= 9

### Setup

```bash
git clone https://github.com/WindRiders/DeepSpace.git
cd DeepSpace
pnpm install

# Configure LLM API key
cp apps/core-engine/.env.example apps/core-engine/.env
# Edit .env — add DEEPSEEK_API_KEY or OPENAI_API_KEY

# Start dev servers
pnpm dev
# Backend: http://localhost:3001
# Frontend: http://localhost:3000
```

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Language | TypeScript 5.7+ |
| Backend | NestJS 11, Express, better-sqlite3 |
| Frontend | Next.js 16, React 19, Tailwind CSS 4 |
| Shared Types | TypeScript interfaces (workspace package) |
| LLM | DashScope / OpenAI API compatible |
| Real-time | SSE (RxJS Observable) + WebSocket (Socket.IO) |
| Auth | JWT (Passport.js) + bcrypt |
| Tests | Jest (385+ unit) + Vitest (242 frontend) + 140 E2E |
| Monorepo | pnpm workspaces + Turborepo |

---

## Project Structure

```
deepspace/
├── apps/
│   ├── core-engine/              # NestJS backend
│   │   ├── src/
│   │   │   ├── agent/            # Agent engine + tools + error utils
│   │   │   ├── auth/             # JWT auth + user management
│   │   │   ├── collab/           # Multi-agent collaboration + WebSocket
│   │   │   ├── conversation/     # Conversation management
│   │   │   ├── llm/              # LLM provider abstraction
│   │   │   ├── marketplace/      # Agent marketplace
│   │   │   ├── plugins/          # Plugin registry + lifecycle
│   │   │   ├── sandbox/          # Isolated file system + code execution
│   │   │   ├── session/          # Session persistence
│   │   │   ├── share/            # Share functionality
│   │   │   ├── template/         # Prompt templates
│   │   │   └── trace/            # Execution trace recording
│   │   └── test/                 # E2E tests (12 suites)
│   └── studio-web/               # Next.js frontend
│       └── src/app/
│           ├── components/       # UI components
│           ├── hooks/            # Custom hooks
│           └── lib/              # API clients + utilities
└── packages/
    └── shared-types/             # Shared TypeScript interfaces
```

---

## Running Tests

```bash
# Backend unit tests (385+ tests)
pnpm --filter @deepspace/core-engine exec jest --forceExit

# Backend E2E tests (140+ tests)
pnpm --filter @deepspace/core-engine exec jest --config test/jest-e2e.json --forceExit

# Frontend tests (242 tests)
pnpm --filter @deepspace/studio-web exec vitest run

# TypeScript check
npx tsc --noEmit -p apps/core-engine/tsconfig.json
npx tsc --noEmit -p apps/studio-web/tsconfig.json
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [CONTRIBUTING.md](CONTRIBUTING.md) | Development guide + commit conventions |
| [SECURITY.md](SECURITY.md) | Security policy + architecture |
| [CHANGELOG.md](CHANGELOG.md) | Version history |
| [docs/architecture.md](docs/architecture.md) | Detailed architecture |
| [docs/api.md](docs/api.md) | API reference |

---

## License

MIT — see [LICENSE](LICENSE)

---

<p align="center">
  <sub>Made with ❤️ by <a href="https://github.com/WindRiders">WindRiders</a></sub>
</p>