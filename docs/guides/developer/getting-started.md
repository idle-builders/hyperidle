# Getting Started

One path from clone to running app. Command reference lives in [commands.md](commands.md); deployment facts (PGlite path, Node version floor) live in [deployment/laptop](../../deployment/laptop.md).

## Prerequisites

- **Node.js + npm** — version floor in root `package.json` `engines` (≥ 24)
- **Git**

## Quick Start

```bash
git clone git@github.com:ambrovia/hyperidle.git
cd hyperidle
npm install
npm run setup          # PGlite data dir + migrations + factory bootstrap
npm run dev            # server (3001) + web (5173)
```

Open [http://localhost:5173](http://localhost:5173).

`npm run setup` flags: `--db-path <dir>` (PGlite data directory, default `./hyperidle-pg`), `--demo` (seed the lived-in Acme world — opt-in only, never seeded by default).

### First run — what the welcome screen asks

SetupFlow (`layers/core-ui/src/pages/SetupFlow.tsx`) collects:

1. Your name
2. Which harness to run the assistant on (claude-code, codex, opencode, or cursor-agent — the harness must already be installed and signed in; SetupFlow cannot accept a key)
3. An optional repo folder (the team name is derived from the folder basename, or "My Team" if none)

No API key is requested. Once submitted, a user row and an assistant agent are created.

### Dev server runs no agents

`npm run dev` boots the server with `topology: "disabled"` (`applications/remote-server/src/index.ts`) — the harness pool is empty. To run agents in dev: build and launch the desktop app (`npm run build:desktop:local`) or start a `remote-worker` pointed at your local server.

The desktop app uses `topology: "local"` (`applications/desktop/src/boot-server.ts`) and runs agents on the host.

### Dev auth

The laptop profile auto-defaults both sides to `hyperidle-dev-local`:

- Server: `applications/remote-server/src/validate-startup-env.ts` sets `HYPERIDLE_API_KEY=hyperidle-dev-local` when none is provided
- Web client: `layers/core-ui/src/services/api-fetch.ts` falls back to the same value

No env setup is needed unless you set your own key.

### Demo data

`npm run setup -- --demo` fills a fresh database with a lived-in Acme world — six weeks of history for a small team of two humans and five agents. Postgres: `npm run db:bootstrap:pg -- --demo`.

## Database

- **Laptop profile is PGlite** — a data directory (default `./hyperidle-pg`). `npm run dev` never migrates; run `npm run setup` first.
- **vps/cloud use Postgres** via `DATABASE_URL`. Apply migrations with `npm run db:migrate:pg` (custom runner, safe for restricted roles) or `npm run db:migrate` (drizzle-kit, requires database-level CREATE). The server runs factory bootstrap at boot — use `npm run db:bootstrap:pg -- --demo` only if you want demo data.
- Migrations are hand-written — see `framework/db/drizzle/README.md`.

## Project Structure

35 packages across four roots:

| Root | What lives there |
|------|-----------------|
| `layers/` | Shipping services: `core-ui` (React + Vite frontend), `core-api` (Hono API, per-domain services), `agent-orchestration` (sessions, connections, filesystems), `agent-execution` (harness registry, CLI/LLM adapters) |
| `framework/` | One package per cross-cutting concern: `db`, `domain-model`, `api-contract`, `event-bus`, `diagnostics`, `harness-capability`, `harness-protocol`. Three directories (`design-system`, `http-middleware`, `tool-protocol`) exist in the repo but are not workspace packages. |
| `applications/` | Entry points: `desktop` (Electron), `remote-server` (standalone Hono), `remote-worker`, `website` |
| `tools/` | Build-time tools: `eslint-plugin-authz`, `eslint-plugin-design`, `eval`, `governance`, `repo-gates`, `setup`, `trace` |

Cross-package imports use npm workspace aliases (`@hyperidle/db`, `@hyperidle/domain-model`, …).

**Before you add a file, know which world it is in.** `layers/`, `framework/` and `applications/` hold shipping code; a file there is production unless its name says otherwise (`.test.ts(x)`, `.spec.ts(x)`, `.stories.tsx`, a `__` path segment, a test-runner config). Everything else is development. A production file may never import a development one. What may cross which *package* boundary is answered in [tools/governance/README.md](../../../tools/governance/README.md).

## Next

- [commands.md](commands.md) — full command reference
- [testing.md](testing.md) — test commands and lanes
- Coding conventions: [.claude/rules/typescript.md](../../../.claude/rules/typescript.md)
