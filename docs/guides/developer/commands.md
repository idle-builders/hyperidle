# Command Reference

Every useful root `npm` script, grouped by task. Onboarding path: [getting-started.md](getting-started.md). Test mechanics (affected-slice details, harness lanes): [testing.md](testing.md).

## Setup and dev

| Command | Purpose |
|---------|---------|
| `npm install` | Install dependencies |
| `npm run setup` | Initialize the database (`tools/setup/src/setup-cli.ts`); flags: `--profile <laptop\|vps\|cloud>`, `--db-path`, `--db-url` |
| `npm run dev` | Dev server with hot reload (API + frontend) |
| `npm run dev:desktop` | Web dev server + Electron desktop shell |

## Build and run

| Command | Purpose |
|---------|---------|
| `npm run build` | Build frontend for production |
| `npm run build:desktop` | Build frontend + desktop app |
| `npm run build:desktop:local` | Local desktop build (`applications/desktop/__scripts__/build-local.sh`) |
| `npm run start` | Production server serving the built frontend (`HYPERIDLE_STATIC_DIR=layers/core-ui/dist`) |

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
| `npm run test:e2e:ah1` | AH1 lane — own Playwright config (`layers/core-ui/playwright.ah1.config.ts`) |
| `npm run test:e2e:ah5` | AH5 lane — own Playwright config (`layers/core-ui/playwright.ah5.config.ts`) |
| `npm run test:e2e:ah6` | AH6 real-interaction lane — key-free, offline, replays committed cassettes (`layers/core-ui/__e2e__/cassettes/`) |
| `npm run smoke:ah6` | AH6 live refresh — re-records cassettes against a real OpenRouter model (`scripts/ah6-smoke-local.ts`; requires `OPENROUTER_API_KEY`, local only; review the cassette diff before committing) |
| `npm run test:pg` | Test suite against Postgres (`framework/db/src/__testing__/pg-test-runner.ts`) |

## Verify

| Command | Purpose |
|---------|---------|
| `npm run verify` | Full gate chain: check + lint + knip + knip:production + deps:check + mock-inventory:check + builds (web, desktop) + signed attestation. `verify` itself runs no test leg — `scripts/verify-attest.ts` runs the attested test legs (`test`, `test:integration`, `test:e2e`) and derives status from their exit codes |
| `npm run verify:quick` | check + lint + knip + knip:production + deps:check only — no tests or builds |
| `npm run verify:release` | `VERIFY_SCOPE=full npm run verify` — required before a version-bump PR (release-guard CI requires a full-scope attestation, `.github/workflows/release-guard.yml`) |

## Typecheck and lint

| Command | Purpose |
|---------|---------|
| `npm run check` | TypeScript type check — per-package fan-out gate (`scripts/typecheck-gate.ts`; quarantine list in `typecheck-debt.json`) |
| `npm run lint` | Biome + ESLint + governance-lint (once `--fixtures`, once against the live tree) — see [linting-and-formatting.md](linting-and-formatting.md) |
| `npm run lint:biome` | Biome only |
| `npm run lint:eslint` | ESLint only |
| `npm run lint:fix` | Auto-fix lint issues |
| `npm run lint:design` | ESLint scoped to design-system surfaces only (`layers/core-ui/src/**/*.tsx`, `framework/design-system/src/**/*.tsx`) |
| `npm run knip` | Find unused files/exports/dependencies |
| `npm run knip:production` | Same, restricted to production files (test/story-only reachability doesn't count) |
| `npm run deps:check` | Import-vs-manifest gate — fails when a package imports something undeclared or declares something it never reaches (`scripts/dep-manifest-lint.ts`) |
| `npm run mock-inventory` | Write the mock-data inventory (`inventory.json`/`inventory.md`/`queue.md`) |
| `npm run mock-inventory:check` | CI mode — compare inventory, exit 1 on diff |
| `npm run check:native` | Native-module ABI check ahead of `electron .` (no-op — PGlite is pure WASM) |

## Governance

Package-boundary rules live in `governance/` (`README.md`, `architecture.json`, `decided-rules.json`, `table-owners.json`, `misplaced-files.json`). `rule-severity.json` is not among them by default — it exists only for the span between a new rule landing over existing debt and that debt clearing; see [governance/README.md](../../../governance/README.md) for what the rules are — this guide does not restate them.

| Command | Purpose |
|---------|---------|
| `npm run lint:governance` | Run governance-lint against the live tree |
| `npm run lint:governance:fixtures` | Run governance-lint against the fixture set |
| `npm run governance:new-cells` | List verdicts the model produced that the founder was never explicitly asked, grouped by clause |

Both `lint:governance` and `lint:governance:fixtures` also run inside `npm run lint`.

## Design system and observability

| Command | Purpose |
|---------|---------|
| `npm run ds:inspect <page-path>` | Statically reports JSX element provenance (design-system vs. custom vs. inline-styled) for a TSX page |
| `npm run obs:env` | Print OTel env vars to tag the current shell (`source <(npm run obs:env)`) |
| `npm run obs:smoke` | Emit one span and verify ingest |
| `npm run obs:run -- <command>` | Run a command with OTel env set |
| `npm run obs:collector` | Run the local DuckDB-backed trace collector |

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

The production server can run as a macOS LaunchAgent via `deploy/bin/service` — command table in [deployment/laptop.md](../../deployment/laptop.md).
