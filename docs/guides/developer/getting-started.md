# Getting Started

One path from clone to running app. Command reference lives in [commands.md](commands.md); deployment facts (PGlite path, Node version floor) live in [deployment/laptop](../../deployment/laptop.md).

## Prerequisites

- **Node.js + npm** — version floor in root `package.json` `engines` (≥ 24)
- **Git**

## Quick Start

```bash
git clone git@github.com:idle-builders/hyperidle.git
cd hyperidle
npm install
npm run setup          # PGlite data dir + migrations + factory bootstrap
npm run dev            # server (3001) + web (5173)
```

Open [http://localhost:5173](http://localhost:5173).

`npm run setup` flags: `--db-path <dir>` (PGlite data directory, default `./hyperidle-pg`), `--demo` (seed the Northwind demo world — opt-in only, never seeded by default). On an empty database the app opens first start; with `--demo` you land in the demo world as Finn Olsen.

### First start — what `/start` asks

A fresh database opens `/start` (`layers/core-ui/src/Start.tsx`). It shows:

1. The agent programs found on this computer (claude-code, codex, opencode, cursor-agent), how to sign in to one, and Look again
2. Your name and your team's name

Start talking (`POST /api/start`, `layers/core-api/src/routes/start.ts`) makes you, the team, a first agent called Builder on a signed-in program, and the conversation "Getting started" with Builder's hello. It needs one program installed and signed in; no API key is asked. The desktop app can instead join a team's server (address and key).

### Dev server runs no agents

`npm run dev` boots the server with `topology: "disabled"` (`applications/remote-server/src/index.ts`) — the harness pool is empty, so no agent runs. To run agents in dev, use the desktop app: `npm run dev:desktop` (desktop shell + web dev server) or `npm run build:desktop:local`.

The desktop app uses `topology: "local"` (`applications/desktop/src/boot-server.ts`) and runs agents on the host.

### Dev auth

The laptop profile auto-defaults both sides to `hyperidle-dev-local`:

- Server: `applications/remote-server/src/validate-startup-env.ts` sets `HYPERIDLE_API_KEY=hyperidle-dev-local` when none is provided
- Web client: in a dev build, `apiKey()` in `layers/core-ui/src/api.ts` falls back to the same value

No env setup is needed unless you set your own key.

### Demo data

`npm run setup -- --demo` fills a fresh database with the Northwind demo world (`tools/setup/src/demo-world/`): two people, four agents, the trials task and its parts, the hand-off and its reviews, and the knowledge tree. The app's code holds no made-up data — the demo world is where the story lives, and the e2e tests run against it. Postgres: `npm run db:bootstrap:pg -- --demo`.

## Database

- **Laptop profile is PGlite** — a data directory (default `./hyperidle-pg`). `npm run dev` never migrates; run `npm run setup` first.
- **vps/cloud use Postgres** via `DATABASE_URL`. Apply migrations with `npm run db:migrate:pg` (custom runner, safe for restricted roles) or `npm run db:migrate` (drizzle-kit, requires database-level CREATE). The server runs factory bootstrap at boot — use `npm run db:bootstrap:pg -- --demo` only if you want demo data.
- Migrations are hand-written — see `framework/db/drizzle/README.md`.

## Project Structure

35 packages across four roots:

| Root | What lives there |
|------|-----------------|
| `layers/` | Shipping services: `core-ui` (React + Vite frontend, plain CSS with tokens), `core-api` (Hono API, per-domain services), `agent-orchestration` (sessions, connections, filesystems), `agent-execution` (harness registry, CLI/LLM adapters) |
| `framework/` | One package per cross-cutting concern: `db`, `domain-model`, `api-contract`, `event-bus`, `diagnostics`, `harness-capability`, `harness-protocol` |
| `applications/` | Entry points: `desktop` (Electron), `remote-server` (standalone Hono), `remote-worker` (the worker client library), `website` |
| `tools/` | Build-time tools: `eslint-plugin-authz`, `eslint-plugin-design`, `eval`, `governance`, `repo-gates`, `setup`, `trace` |

Cross-package imports use npm workspace aliases (`@hyperidle/db`, `@hyperidle/domain-model`, …).

**Before you add a file, know which world it is in.** `layers/`, `framework/` and `applications/` hold shipping code; a file there is production unless its name says otherwise (`.test.ts(x)`, `.spec.ts(x)`, a `__` path segment, a test-runner config). Everything else is development. A production file may never import a development one. What may cross which *package* boundary is answered in [tools/governance/README.md](../../../tools/governance/README.md).

## Next

- [commands.md](commands.md) — full command reference
- [testing.md](testing.md) — test commands and lanes
- Coding conventions: [.claude/rules/typescript.md](../../../.claude/rules/typescript.md)
- How the UI is built (plain CSS, tokens, the token check): [interface/ui-design.md](../../interface/ui-design.md)
