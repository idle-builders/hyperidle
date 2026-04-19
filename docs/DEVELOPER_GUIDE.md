# HyperIdle Developer Guide

Get from zero to running tests in under 10 minutes.

---

## Prerequisites

- **Bun >= 1.1** — runtime, package manager, and bundler
- **Node 20+** — needed for Playwright binaries
- **Git** — version control

Optional:
- **Docker 24+ & Docker Compose v2** — only for VPS deployment profile or container-based workspaces

---

## Quick Start

```bash
git clone git@github.com:ambrovia/hyperidle.git
cd hyperidle
bun install
bun run setup --profile laptop   # creates SQLite DB, runs migrations, seeds data
bun dev                           # starts server (3001) + web (5173)
```

Open [http://localhost:5173](http://localhost:5173).

---

## Project Structure

```
hyperidle/
├── packages/
│   ├── db/          # Drizzle ORM schema, migrations, seed data, setup CLI
│   ├── server/      # Hono API server (port 3001)
│   ├── web/         # React + Vite frontend (port 5173)
│   ├── shared/      # Shared types, constants, TOON codec
│   ├── fabric/      # Knowledge materialization, file watching, writeback
│   └── pipeline/    # CLI for batch story processing (Ink React)
├── docs/            # Architecture, requirements, work packages
├── bin/             # Shell wrappers (setup, pipeline)
└── .github/         # CI workflow
```

Cross-package imports use workspace aliases: `@hyperidle/db`, `@hyperidle/server`, `@hyperidle/shared`, etc.

---

## Dev Server

```bash
bun dev
```

This runs two processes in parallel via `concurrently`:

| Service | Port | What |
|---------|------|------|
| **Server** | 3001 | Hono API + WebSocket |
| **Web** | 5173 | Vite dev server (React) |

The Vite dev server proxies `/api/*` requests to `localhost:3001`.

### Environment Variables

Set `HYPERIDLE_API_KEY` before starting the server — it will exit if this is missing. This is a shared secret you choose yourself (any string). Every API request must include it as an `X-API-Key` header. There is no default — pick something and set it.

```bash
export HYPERIDLE_API_KEY=my-local-dev-key
bun dev
```

Key variables:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `HYPERIDLE_API_KEY` | Yes | — | Shared secret for API auth (you choose the value) |
| `HYPERIDLE_PROFILE` | No | `laptop` | Deployment profile (`laptop`, `vps`, `cloud`) |
| `PORT` | No | `3001` | Server port |
| `DATABASE_URL` | VPS/Cloud | — | PostgreSQL connection string |

---

## Database

### SQLite (default, laptop profile)

```bash
bun run setup --profile laptop   # creates hyperidle.db, migrates, seeds
```

### PostgreSQL (VPS/Cloud)

```bash
bun run db:migrate:pg            # run Postgres migrations
bun run db:seed:pg               # seed initial data
```

### Schema Changes

```bash
# 1. Edit packages/db/src/schema.ts (SQLite) and/or schema.pg.ts (Postgres)
# 2. Generate migration
bun run db:generate

# 3. Apply migration
bun run db:migrate
```

Both drivers share the same Drizzle ORM schema. A parity test (`pg-schema.test.ts`) ensures they stay in sync.

---

## Testing

### Unit & Integration Tests (Vitest)

```bash
bun run test                     # run all tests
bun run test -- <path>           # run a specific test file
bun run test:coverage            # with coverage report
```

**Important:** Always use `bun run test`, never bare `bun test` (which invokes Bun's native test runner instead of Vitest).

Tests use `createTestDb()` for in-memory SQLite databases and `createTestApp()` for Hono app instances — prefer these over mocks.

### E2E Tests (Playwright)

```bash
# Ensure dev server is running first
bun dev &

# Run E2E tests
bun run --filter @hyperidle/web test:e2e
```

Playwright config is in `packages/web/playwright.config.ts`. It runs Chromium only.

### Test Conventions

- Test files: `*.test.ts` / `*.test.tsx` in `__tests__/` directories
- Follow AAA pattern: Arrange, Act, Assert
- Test all paths: success, error, boundary values, edge cases
- Never mock what `createTestDb()` / `createTestApp()` can provide

---

## Linting & Formatting

```bash
bun run lint                     # biome + eslint (read-only)
bun run lint:biome               # biome only
bun run lint:eslint              # eslint only
bun run lint:fix                 # biome auto-fix
bun run check                    # TypeScript type checking
```

**Biome** is the primary linter/formatter (tabs, 100-char line width). **ESLint** covers gaps: React Compiler safety, React Hooks rules, and Drizzle ORM safety (`enforce-delete-with-where`, `enforce-update-with-where`).

### CI Gate

All three checks must pass before merging to `main`:

```bash
bun run check   # zero type errors
bun run lint    # zero lint errors
bun run test    # all tests green
```

Branch protection on `main` requires the CI status check to pass.

---

## Design System

HyperIdle uses a built-in design system browser instead of Storybook.

### Viewing Components

Start the dev server and navigate to [http://localhost:5173/designsystem](http://localhost:5173/designsystem). This route is dev-only and stripped in production.

### Creating Stories

Every custom component must have a `.stories.tsx` file. Stories are auto-discovered via `import.meta.glob` from:

- `packages/web/src/components/*.stories.tsx`
- `packages/web/src/shell/*.stories.tsx`
- `packages/web/src/pages/*.stories.tsx`
- `packages/web/src/layouts/*.stories.tsx`

Story format (CSF3-style):

```tsx
// MyComponent.stories.tsx
import { MyComponent } from "./MyComponent";

export default {
  title: "Components/MyComponent",
};

export function Default() {
  return <MyComponent>Hello</MyComponent>;
}

export function WithError() {
  return <MyComponent error>Something went wrong</MyComponent>;
}
```

### Design Rules

- **limited custom components** — everything else uses DaisyUI primitives directly
- **Tailwind CSS + DaisyUI** with the `factory-dark` theme
- **Avoid the "AI Aesthetic"**: no excessive gradients, no `rounded-2xl`, no `p-8`/`p-12` oversized padding. Think Bloomberg terminal, not marketing landing page
- 8-12px padding default, dense information display

---

## Architecture

Three-layer system with strict downward dependency:

```
Human Interface Layer (web)
        ↓
Meta Layer (server, fabric)
        ↓
Agent Runtime (harness adapters, workspaces)
```

No layer reaches past its neighbor. Read `docs/concept/ARCHITECTURE.md` for the full picture.

### Key Architectural Concepts

- **Products, Bets, Tasks** — work hierarchy (portfolio > shaped bets > concrete tasks)
- **Agents** — AI identities with skills, inbox, memory
- **Teams** — persistent agent groups bound to a product
- **Sessions** — bounded agent runs on tasks
- **Knowledge (L0-L4)** — five layers from session ephemera to factory principles
- **Conversations** — unified threading for reviews and chat

---

## Coding Conventions

- **TypeScript strict** — no `any`, no `@ts-ignore`, no unsafe `as` casts
- **Explicit return types** on all exported functions
- **camelCase** for variables/functions, **PascalCase** for types/components, **SCREAMING_SNAKE_CASE** for constants
- **No `console.log`** in production code — use the observability adapter
- **All DB queries through Drizzle** — never raw SQL except in migrations
- **Result types** for expected errors; let unexpected errors propagate

See `.claude/rules/` for detailed conventions on TypeScript, frontend, design system, and database patterns.

---

## Work Packages

Stories are defined in `docs/work-packages/TRACK-*.md` files (A through J). Each track has numbered stories with acceptance criteria. Implementation follows TDD:

1. Read the acceptance criteria from the track file
2. Write failing tests (red)
3. Implement until tests pass (green)
4. Simplify (refactor)
5. Verify: `bun run check && bun run lint && bun run test`

---

## Deployment

Three profiles. See `docs/DEPLOYMENT.md` for full details.

| Profile | Database | Use Case |
|---------|----------|----------|
| `laptop` | SQLite | Local development |
| `vps` | PostgreSQL (Docker Compose) | Self-hosted single server |
| `cloud` | Managed PostgreSQL | Production |

---

## Useful Commands Reference

| Command | Purpose |
|---------|---------|
| `bun install` | Install dependencies |
| `bun dev` | Start dev server with hot reload (API + frontend) |
| `bun run build` | Build frontend for production |
| `bun run start` | Start production server (serves built frontend + API) |
| `bun run setup` | Initialize database |
| `bun run test` | Run all tests |
| `bun run test:coverage` | Tests with coverage |
| `bun run check` | TypeScript type check |
| `bun run lint` | Biome + ESLint |
| `bun run lint:fix` | Auto-fix lint issues |
| `bun run db:generate` | Generate migration from schema changes |
| `bun run db:migrate` | Apply SQLite migrations |
| `bun run db:migrate:pg` | Apply PostgreSQL migrations |
| `bin/service install` | Install and start as macOS background service |
| `bin/service stop/start` | Stop or start the background service |
| `bin/service logs` | Tail the server log |
