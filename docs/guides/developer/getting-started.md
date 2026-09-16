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

Setup flags: `--db-path <dir>` (PGlite data directory, default `./hyperidle-pg`), `--demo` (seed the demo "Acme" world — opt-in only, never seeded by default).

### Demo data

`npm run setup -- --demo` fills a fresh database with a lived-in Acme world — six weeks of history for a small team of two humans and five agents: tasks across every lifecycle (in_progress with a review blocking on the founder, proposed, done with outcomes, killed), subtasks in all eight states, ~15 threads with reviews, verdicts and DMs, a ~40-item knowledge corpus with a triage queue, sessions, routines with run history, and unread notifications. It exists so UI work and demos happen against a product that looks used, not an empty shell. The seed is idempotent (`demo-*` ids, re-running changes nothing) and anchors all timestamps to seed time.

- Local-mode auth resolves the first human user, so a seeded instance logs you straight in as the demo founder — no onboarding.
- Postgres: `npm run db:bootstrap:pg -- --demo` (or `HYPERIDLE_DEMO=1`).
- Packaged desktop app: seed its data dir while the app is not running — `npm run setup -- --demo --db-path "$HOME/Library/Application Support/@hyperidle/desktop/hyperidle-pg"` — then launch the app. Back any existing data up first; the app holds the DB lock while running.
- Desktop dev (`npm run dev:desktop`) cannot load the world today: Electron loads `src/preload.js` outside tsx and that file only exists as `dist/preload.js` after bundling, so the dev window 401s into the setup flow. Test the desktop via `npm run -w @hyperidle/desktop build:local` and the packaged app.

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
| `HYPERIDLE_API_KEY` | vps/cloud only | `hyperidle-dev-local` on laptop | Shared secret sent as `X-API-Key` on every API request. Laptop auto-defaults (localhost-only protection, `framework/host-process/src/validate-env.ts:13`); vps/cloud error at startup without it. |
| `HYPERIDLE_PROFILE` | No | `laptop` | Deployment profile (`laptop`, `vps`, `cloud`) |
| `PORT` | No | `3001` | Server port |
| `DATABASE_URL` | vps/cloud | profile default | PostgreSQL connection string |

## Database

- **Laptop profile is PGlite** — a data directory (default `./hyperidle-pg`), not a database file (`framework/host-process/src/profiles.ts:33-40`).
- **vps/cloud use real Postgres** via `DATABASE_URL`. Bootstrap with `npm run db:bootstrap:pg` (`tools/setup/src/bootstrap-pg.ts`); seed with `npm run db:seed:pg`. PG migration file: `framework/db/src/migrate-pg.ts` (requires `DATABASE_URL`; run directly via `npx tsx`).
- **One schema file for both drivers**: `framework/db/src/schema.ts` (`pgTable`). Migrations are hand-written, not generated — a new one is a `.sql` file in `framework/db/drizzle/` plus a `_journal.json` entry (see `framework/db/drizzle/README.md`). Apply with `npm run db:migrate`.

## Project Structure

```
hyperidle/
├── layers/
│   ├── core-ui/               # React + Vite frontend (port 5173)
│   ├── core-api/              # Hono API layer — per-domain services (conversation, credentials, knowledge, notifications, org, policy, review, routine, settings, users, work)
│   ├── agent-orchestration/   # Session/run orchestration, connections, tool handlers, filesystem mounting
│   └── agent-execution/       # Harness registry — CLI/LLM adapters, context window, MCP bridge
├── framework/            # One package per thing, each with a decided audience in tools/governance/architecture.json
│   ├── api-contract/          # Typed API request/response contracts
│   ├── db/                    # Drizzle schema, migrations, setup CLI (PGlite + Postgres)
│   ├── design-system/         # TSX component library + stories (single design source of truth)
│   ├── domain-model/          # The product's nouns — closed sets, wire shapes, predicates. The only one reachable by everyone
│   ├── block-derivation/      # Markdown → block tree + content-addressed ids (the one package carrying the parser)
│   ├── conversation-parts/    # The Part vocabulary and the adapters that derive Parts
│   ├── credential-access/     # Everything that needs a live secret: the resolver port, the cipher, model resolution
│   ├── cron/                  # Cron-expression parsing and next-run computation
│   ├── diagnostics/           # Structured logger, secret scrubber, observability contract + console sink
│   ├── event-bus/             # The in-process publish/subscribe object
│   ├── domain-model/         # The product's nouns — the one package everyone may name
│   ├── harness-capability/    # What an installed harness IS — readiness, models, tools, auth action
│   ├── harness-protocol/      # How a run is dispatched to a harness and how its output comes back
│   ├── host-process/          # The host as a server process sees it: git, DNS, env, deployment profile
│   ├── http-middleware/       # The primitives a route file on either Hono app needs (the one package carrying hono)
│   ├── presentation-format/   # A value turned into the string a human reads
│   ├── query-escaping/        # User text → a literal a query engine cannot read as syntax
│   ├── tool-protocol/         # The descriptor/dispatch contract + the built-in tool catalog
│   ├── toon-codec/            # The TOON text codec
│   └── work-intent-port/      # The recorder/reader seam for writing an agent work intent
├── applications/
│   ├── desktop/                # Electron desktop shell (boots embedded server)
│   ├── remote-server/          # Standalone Hono server entrypoint (port 3001)
│   └── remote-worker/          # Worker client — agent-execution only, registers against a peer's remote-server
├── tools/
│   ├── eslint-plugin-authz/    # Authorization lint rules (default-deny access boundary)
│   ├── eslint-plugin-design/   # Design-system lint rules (token scales, page anatomy)
│   ├── eval/                   # Graded journey evals — real-LLM tuning tool, not tests
│   └── governance/             # Package-boundary rules + the misplacement ledger — see its own README.md
├── docs/                       # Ground-truth documentation
├── .pipeline/                  # <track>.md registries + work/<id>/plan.md per item
├── deploy/                     # macOS LaunchAgent service wrapper, setup script, Homebrew cask, Helm chart
└── .github/                    # Workflows: ci, deploy, desktop-release, release-guard, release
```

Cross-package imports use npm workspace aliases (`@hyperidle/db`, `@hyperidle/domain-model`, …). The macOS LaunchAgent service commands are documented in [deployment/laptop](../../deployment/laptop.md).

**Before you add a file, know which world it is in.** `layers/`, `framework/` and `applications/` hold shipping code; a file there is production unless its name says otherwise (`.test.ts(x)`, `.spec.ts(x)`, `.stories.tsx`, a `__` path segment, a test-runner config). Everything else in the tree is development. A production file may never import a development one — the rule and the handful of recorded exceptions are stated in [CLAUDE.md](../../../CLAUDE.md#production-and-development-files); what may cross which *package* boundary is a separate question answered in [tools/governance/README.md](../../../tools/governance/README.md).

## Next

- [commands.md](commands.md) — full command reference
- [testing.md](testing.md) — test commands and lanes
- Coding conventions: [.claude/rules/typescript.md](../../../.claude/rules/typescript.md)
