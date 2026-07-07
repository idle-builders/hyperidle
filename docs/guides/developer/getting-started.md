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

Vite proxies `/api/*` to `localhost:3001` with **no path rewrite** — the server mounts all routes under `/api` (`packages/web/vite.config.ts`).

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `HYPERIDLE_API_KEY` | vps/cloud only | `hyperidle-dev-local` on laptop | Shared secret sent as `X-API-Key` on every API request. Laptop auto-defaults (localhost-only protection, `packages/server/src/validate-env.ts:13`); vps/cloud error at startup without it. |
| `HYPERIDLE_PROFILE` | No | `laptop` | Deployment profile (`laptop`, `vps`, `cloud`) |
| `PORT` | No | `3001` | Server port |
| `DATABASE_URL` | vps/cloud | profile default | PostgreSQL connection string |

## Database

- **Laptop profile is PGlite** — a data directory (default `./hyperidle-pg`), not a database file (`packages/db/src/profiles.ts:19-26`).
- **vps/cloud use real Postgres** via `DATABASE_URL`. Bootstrap with `npm run db:bootstrap:pg` (`packages/db/src/bootstrap-pg.ts`); seed with `npm run db:seed:pg`. PG migration file: `packages/db/src/migrate-pg.ts` (requires `DATABASE_URL`; run directly via `npx tsx`).
- **One schema file for both drivers**: `packages/db/src/schema.ts` (`pgTable`). Generate and apply migrations with `npm run db:generate` + `npm run db:migrate`.

## Project Structure

```
hyperidle/
├── packages/
│   ├── api-contract/         # Typed API request/response contracts (auth, settings)
│   ├── db/                   # Drizzle schema, migrations, seed, setup CLI (PGlite + Postgres)
│   ├── design-system/        # TSX component library + stories (single design source of truth)
│   ├── desktop/              # Electron desktop shell (boots embedded server)
│   ├── eslint-plugin-authz/  # Authorization lint rules (default-deny access boundary)
│   ├── eslint-plugin-design/ # Design-system lint rules (token scales, page anatomy)
│   ├── eval/                 # Graded journey evals — real-LLM tuning tool, not tests
│   ├── fabric/               # Knowledge context assembly, polling watcher, writeback
│   ├── server/               # Hono API server (port 3001)
│   ├── shared/               # Shared types, constants, TOON codec
│   ├── strategy-minimal/     # Minimal Strategy-layer implementation (fabric alternative)
│   └── web/                  # React + Vite frontend (port 5173)
├── docs/                     # Ground-truth documentation
├── .pipeline/work-packages/  # Work-package specs (per-track files)
├── bin/                      # setup + service wrappers, launchd/ plist template
└── .github/                  # Workflows: ci, deploy, desktop-release, release-guard, release
```

Cross-package imports use npm workspace aliases (`@hyperidle/db`, `@hyperidle/server`, …). The macOS LaunchAgent service commands are documented in [deployment/laptop](../../deployment/laptop.md).

## Next

- [commands.md](commands.md) — full command reference
- [testing.md](testing.md) — test commands and lanes
- Coding conventions: [.claude/rules/typescript.md](../../../.claude/rules/typescript.md)
