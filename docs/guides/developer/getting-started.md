# Getting Started

One path from clone to running app. Command reference lives in [commands.md](commands.md); dev-deployment specifics (PGlite directory location, setup-before-dev rule, web/server API-key pairing, Node version floor) live in [deployment/laptop](../../deployment/laptop.md) — not restated here.

## Prerequisites

- **Node.js + npm** — version floor in `package.json` `engines` (see [deployment/laptop](../../deployment/laptop.md))
- **Git**
- **Docker 24+ & Docker Compose v2** — only for the `vps` deployment profile; the `laptop` profile uses embedded PGlite and needs no Docker

## Quick Start

```bash
git clone git@github.com:ambrovia/hyperidle.git
cd hyperidle
npm install
npm run setup -- --profile laptop   # PGlite data dir + migrations + factory bootstrap
npm run dev                          # server (3001) + web (5173)
```

Open [http://localhost:5173](http://localhost:5173).

Setup flags: `--db-path <dir>` (PGlite data directory, default `./hyperidle-pg`), `--demo` (seed a demo "Acme" team — opt-in only, never seeded by default).

Desktop dev: `npm run dev:desktop` runs the Vite dev server plus the Electron shell instead of the standalone server.

## Dev Server

`npm run dev` runs two processes via `concurrently`:

| Service | Port | What |
|---------|------|------|
| **Server** | 3001 | Hono API + WebSocket |
| **Web** | 5173 | Vite dev server (React) |

Vite proxies `/api/*` to `localhost:3001` with **no path rewrite** — the server mounts all routes under `/api` (`layers/core-ui/vite.config.ts`).

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `HYPERIDLE_API_KEY` | vps/cloud only | `hyperidle-dev-local` on laptop | Shared secret sent as `X-API-Key` on every API request. Laptop auto-defaults (localhost-only protection, `framework/shared/src/validate-env.ts:13`); vps/cloud error at startup without it. |
| `HYPERIDLE_PROFILE` | No | `laptop` | Deployment profile (`laptop`, `vps`, `cloud`) |
| `PORT` | No | `3001` | Server port |
| `DATABASE_URL` | vps/cloud | profile default | PostgreSQL connection string |

## Database

- **Laptop profile is PGlite** — a data directory (default `./hyperidle-pg`), not a database file (`framework/db/src/profiles.ts:19-26`).
- **vps/cloud use real Postgres** via `DATABASE_URL`. Bootstrap with `npm run db:bootstrap:pg` (`framework/db/src/bootstrap-pg.ts`); seed with `npm run db:seed:pg`. PG migration file: `framework/db/src/migrate-pg.ts` (requires `DATABASE_URL`; run directly via `npx tsx`).
- **One schema file for both drivers**: `framework/db/src/schema.ts` (`pgTable`). Generate and apply migrations with `npm run db:generate` + `npm run db:migrate`.

## Project Structure

```
hyperidle/
├── layers/
│   ├── core-ui/               # React + Vite frontend (port 5173)
│   ├── core-api/              # Hono API layer — per-domain services (conversation, credentials, knowledge, notifications, org, policy, review, routine, settings, users, work)
│   ├── agent-orchestration/   # Session/run orchestration, connections, tool handlers, filesystem mounting
│   └── agent-execution/       # Harness registry — CLI/LLM adapters, context window, MCP bridge
├── framework/
│   ├── api-contract/          # Typed API request/response contracts
│   ├── db/                    # Drizzle schema, migrations, setup CLI (PGlite + Postgres)
│   ├── design-system/         # TSX component library + stories (single design source of truth)
│   └── shared/                # Shared types, constants, TOON codec, env validation
├── applications/
│   ├── desktop/                # Electron desktop shell (boots embedded server)
│   ├── remote-server/          # Standalone Hono server entrypoint (port 3001)
│   └── remote-worker/          # Worker client — agent-execution only, registers against a peer's remote-server
├── tools/
│   ├── eslint-plugin-authz/    # Authorization lint rules (default-deny access boundary)
│   ├── eslint-plugin-design/   # Design-system lint rules (token scales, page anatomy)
│   └── eval/                   # Graded journey evals — real-LLM tuning tool, not tests
├── docs/                       # Ground-truth documentation
├── governance/                 # Package-boundary rules — see governance/README.md
├── .pipeline/                  # work/<id>/plan.md + <track>.md coordination; legacy specs in work-packages/
├── deploy/                     # macOS LaunchAgent service wrapper, setup script, Homebrew cask, Helm chart
└── .github/                    # Workflows: ci, deploy, desktop-release, release-guard, release
```

Cross-package imports use npm workspace aliases (`@hyperidle/db`, `@hyperidle/shared`, …). The macOS LaunchAgent service commands are documented in [deployment/laptop](../../deployment/laptop.md).

## Next

- [commands.md](commands.md) — full command reference
- [testing.md](testing.md) — test commands and lanes
- Coding conventions: [.claude/rules/typescript.md](../../../.claude/rules/typescript.md)
