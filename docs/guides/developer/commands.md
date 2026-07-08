# Command Reference

Every useful root `npm` script, grouped by task. Onboarding path: [getting-started.md](getting-started.md). Test mechanics (affected-slice details, harness lanes): [testing.md](testing.md).

## Setup and dev

| Command | Purpose |
|---------|---------|
| `npm install` | Install dependencies |
| `npm run setup` | Initialize the database (`packages/db/src/setup-cli.ts`) |
| `npm run dev` | Dev server with hot reload (API + frontend) |
| `npm run dev:desktop` | Web dev server + Electron desktop shell |

## Build and run

| Command | Purpose |
|---------|---------|
| `npm run build` | Build frontend for production |
| `npm run build:desktop` | Build frontend + desktop app |
| `npm run start` | Production server serving the built frontend (`HYPERIDLE_STATIC_DIR=packages/web/dist`) |

## Tests

Default test commands run the **affected slice** against `origin/main` (AT1); `:full` variants run everything.

| Command | Purpose |
|---------|---------|
| `npm run test` | Affected unit + component tests (`vitest run --changed=origin/main --passWithNoTests`) |
| `npm run test:full` | ALL unit + component tests (no changed-file filter) |
| `npm run test:integration` | Integration tests only (`vitest.integration.config.ts`) |
| `npm run test:all` | ALL tests sequentially (`test:full && test:integration`) |
| `npm run test:e2e` | Affected Playwright E2E (`playwright test --only-changed=origin/main`) |
| `npm run test:e2e:full` | ALL Playwright E2E specs |
| `npm run test:coverage` | Tests with coverage |
| `npm run test:e2e:ah6` | AH6 real-interaction lane — key-free, offline, replays committed cassettes (`packages/web/e2e/cassettes/`) |
| `npm run smoke:ah6` | AH6 live refresh — re-records cassettes against a real OpenRouter model (`scripts/ah6-smoke-local.ts`; requires `OPENROUTER_API_KEY`, local only; review the cassette diff before committing) |
| `npm run test:pg` | Test suite against Postgres (`packages/db/src/pg-test-runner.ts`) |

## Verify

| Command | Purpose |
|---------|---------|
| `npm run verify` | Full gate chain: check + lint + knip + knip:production + guard scripts + builds + signed attestation (`scripts/verify-attest.ts` runs the attested test legs itself and derives status from their exit code) |
| `npm run verify:quick` | check + lint + knip + knip:production only — no tests or builds |
| `npm run verify:release` | `VERIFY_SCOPE=full npm run verify` — required before a version-bump PR (release-guard CI requires a full-scope attestation, `.github/workflows/release-guard.yml`) |

## Typecheck and lint

| Command | Purpose |
|---------|---------|
| `npm run check` | TypeScript type check — per-package fan-out gate (`scripts/typecheck-gate.ts`; quarantine list in `typecheck-debt.json`) |
| `npm run lint` | Biome + ESLint + lint-chained guard scripts — see [linting-and-formatting.md](linting-and-formatting.md) |
| `npm run lint:biome` | Biome only |
| `npm run lint:eslint` | ESLint only |
| `npm run lint:fix` | Auto-fix lint issues |

## Database

| Command | Purpose |
|---------|---------|
| `npm run db:generate` | Generate migration from schema changes |
| `npm run db:migrate` | Apply migrations |
| `npm run db:bootstrap:pg` | Bootstrap a Postgres database |
| `npm run db:seed:pg` | Seed a Postgres database |

## Evals and docs site

| Command | Purpose |
|---------|---------|
| `npm run eval` | Run the eval suite (`@hyperidle/eval`) |
| `npm run eval:quick` | Eval suite with `--quick` |
| `npm run docs:dev` | VitePress dev server for `docs/product` |
| `npm run docs:build` | VitePress build of `docs/product` |

## Background service

The production server can run as a macOS LaunchAgent via `bin/service` — command table in [deployment/laptop.md](../../deployment/laptop.md).
