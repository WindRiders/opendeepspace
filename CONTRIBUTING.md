# Contributing to DeepSpace

DeepSpace is a TypeScript monorepo: NestJS backend + Next.js frontend + shared types.

## Development Setup

```bash
# Prerequisites
Node.js >= 20, pnpm >= 9

# Install
git clone https://github.com/WindRiders/DeepSpace.git
cd DeepSpace
pnpm install

# Configure LLM API key
cp apps/core-engine/.env.example apps/core-engine/.env
# Edit .env — add DASHSCOPE_API_KEY or OPENAI_API_KEY

# Start dev servers
pnpm dev
```

## Project Architecture

| Layer | Path | Tech |
|-------|------|------|
| Backend | `apps/core-engine/` | NestJS 11, Express, better-sqlite3 |
| Frontend | `apps/studio-web/` | Next.js 16, React 19, Tailwind CSS 4 |
| Shared Types | `packages/shared-types/` | TypeScript interfaces |
| Docs | `docs/` | Markdown |

Read `README.md` and `docs/architecture.md` for detailed architecture.

## Adding a New Module

1. **DTO**: Define request/response shapes in `src/<module>/dto/`
2. **Service**: Business logic in `src/<module>/<module>.service.ts`
3. **Controller**: Routes in `src/<module>/<module>.controller.ts`
4. **Module**: Register in `src/<module>/<module>.module.ts` and import in `src/app.module.ts`
5. **Tests**: Unit tests (`*.spec.ts`) + E2E tests (`test/<module>.e2e-spec.ts`)

## Running Tests

```bash
# Backend unit tests (356+ tests)
pnpm --filter @deepspace/core-engine exec jest --forceExit

# Backend E2E tests (141+ tests)
pnpm --filter @deepspace/core-engine exec jest --config test/jest-e2e.json --forceExit

# Frontend tests (242 tests)
pnpm --filter @deepspace/studio-web exec vitest run

# TypeScript check
npx tsc --noEmit -p apps/core-engine/tsconfig.json
npx tsc --noEmit -p apps/studio-web/tsconfig.json
```

## Commit Convention

Chinese commit messages with type prefix:

- `feat:` new feature
- `fix:` bug fix
- `docs:` documentation
- `refactor:` refactoring
- `chore:` maintenance

Examples: `feat: 添加 marketplace E2E 测试`, `fix: 修复 SSRF 172.x 范围判断`