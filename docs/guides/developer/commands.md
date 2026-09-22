# Command Reference

Every useful root `npm` script, grouped by task. Onboarding path: [getting-started.md](getting-started.md). Test mechanics (affected-slice details, harness lanes): [testing.md](testing.md).

## Setup and dev

| Command | Purpose |
|---------|---------|
| `npm install` | Install dependencies |
| `npm run setup` | Initialize the database (`tools/setup/src/setup-cli.ts`); flags: `--profile <laptop\|vps\|cloud>`, `--db-path`, `--db-url`, `--demo` (seed the lived-in Acme demo world — opt-in only) |
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
| `npm run test:e2e:ah6` | AH6 real-interaction lane — key-free, offline, replays committed cassettes (`layers/core-ui/__e2e__/cassettes/`) |
| `npm run smoke:ah6` | AH6 live refresh — re-records cassettes against a real OpenRouter model (`layers/core-ui/__scripts__/ah6-smoke-local.ts`; requires `OPENROUTER_API_KEY`, local only; review the cassette diff before committing) |
| `npm run test:pg` | Test suite against Postgres (`framework/db/src/__testing__/pg-test-runner.ts`) |

## Verify

| Command | Purpose |
|---------|---------|
| `npm run verify` | Static gate chain: check + lint + knip + knip:production + deps:check + mock-inventory:check + builds (web, desktop). Runs **no tests** — CI runs the affected slice on every PR and push (`.github/workflows/ci.yml`) |
| `npm run verify:quick` | check + lint + knip + knip:production + deps:check only — no tests or builds |
| `npm run verify:release` | `verify` + `test:full` + `test:integration` (incl. the harness lane) + full e2e. The pre-version-bump checklist. CI re-runs the full suite and e2e on the bump PR (`.github/workflows/release-guard.yml`); the harness lane is local-only and has no CI job |

## Typecheck and lint

| Command | Purpose |
|---------|---------|
| `npm run check` | TypeScript type check — per-package fan-out gate (`tools/repo-gates/src/typecheck-gate.ts`; quarantine list in `typecheck-debt.json`) |
| `npm run lint` | Biome + ESLint + governance-lint (once `--fixtures`, once against the live tree) — see [linting-and-formatting.md](linting-and-formatting.md) |
| `npm run lint:biome` | Biome only |
| `npm run lint:eslint` | ESLint only |
| `npm run lint:fix` | Auto-fix lint issues |
| `npm run lint:design` | ESLint scoped to design-system surfaces only (`layers/core-ui/src/**/*.tsx`, `framework/design-system/src/**/*.tsx`) |
| `npm run knip` | Find unused files/exports/dependencies |
| `npm run knip:production` | Same, restricted to production files (test/story-only reachability doesn't count) |
| `npm run deps:check` | Import-vs-manifest gate — fails when a package imports something undeclared or declares something it never reaches (`tools/repo-gates/src/dep-manifest-lint.ts`) |
| `npm run mock-inventory` | Write the mock-data inventory into `tools/repo-gates/mock-inventory/` |
| `npm run mock-inventory:check` | CI mode — compare inventory, exit 1 on diff |
| `npm run check:native` | Native-module ABI check ahead of `electron .` (no-op — PGlite is pure WASM) |

## Governance

Package-boundary rules live in `tools/governance/` (`README.md`, `architecture.json`, `decided-rules.json`, `table-owners.json`). See [tools/governance/README.md](../../../tools/governance/README.md) for what the rules are — this guide does not restate them.

| Command | Purpose |
|---------|---------|
| `npm run lint:governance` | Run governance-lint against the live tree |
| `npm run lint:governance:fixtures` | Run governance-lint against the fixture set |
| `npm run governance:new-cells` | List verdicts the model produced that the founder was never explicitly asked, grouped by clause |

Both `lint:governance` and `lint:governance:fixtures` also run inside `npm run lint`.

## Design system

| Command | Purpose |
|---------|---------|
| `npm run ds:inspect <page-path>` | Statically reports JSX element provenance (design-system vs. custom vs. inline-styled) for a TSX page |

## Database

Migrations are hand-written — there is no generator. A new migration is a
hand-authored `.sql` file in `framework/db/drizzle/` plus a matching entry in
`framework/db/drizzle/meta/_journal.json`. See `framework/db/drizzle/README.md`
for why.

| Command | Purpose |
|---------|---------|
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
