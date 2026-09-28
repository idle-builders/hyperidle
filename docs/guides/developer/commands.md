# Command Reference

Every useful root `npm` script, grouped by task. Onboarding path: [getting-started.md](getting-started.md). Test mechanics (affected-slice details, harness lanes): [testing.md](testing.md).

## Setup and dev

| Command | Purpose |
|---------|---------|
| `npm install` | Install dependencies |
| `npm run setup` | Initialize the database (`tools/setup/src/setup-cli.ts`); flags: `--profile <laptop\|vps\|cloud>`, `--db-path`, `--db-url`, `--demo` (seed the lived-in Acme demo world — opt-in only) |
| `npm run dev` | Dev server with hot reload (API + frontend). Runs **no agents** — see [getting-started.md](getting-started.md). |
| `npm run dev:desktop` | Web dev server + Electron desktop shell |

## Build and run

| Command | Purpose |
|---------|---------|
| `npm run build` | Build frontend for production |
| `npm run build:desktop` | Build frontend + desktop app |
| `npm run build:desktop:local` | Local desktop build (`applications/desktop/__scripts__/build-local.sh`) |
| `npm run start` | Production server serving the built frontend (`HYPERIDLE_STATIC_DIR=layers/core-ui/dist`) |

## Tests

Default test commands run the **affected slice** against `origin/main`; `:full` variants run everything.

| Command | Purpose |
|---------|---------|
| `npm run test` | Affected unit + component tests (`vitest run --changed=origin/main --passWithNoTests`) |
| `npm run test:full` | ALL unit + component tests (no changed-file filter) |
| `npm run test:integration` | Integration tests only (`vitest.integration.config.ts`) |
| `npm run test:integration:service` | Service integration only (DB/API, vitest fixtures, PGlite) |
| `npm run test:integration:harness` | Harness integration only (real binaries + real LLM, serial, **local-only — no CI job**) |
| `npm run test:all` | ALL tests sequentially (`test:full && test:integration`) |
| `npm run test:e2e` | Affected Playwright E2E (`playwright test --only-changed=origin/main`) |
| `npm run test:e2e:full` | ALL Playwright E2E specs |
| `npm run test:coverage` | Tests with coverage |
| `npm run test:pg` | Test suite against Postgres (`framework/db/src/__testing__/pg-test-runner.ts`) |

## Verify

| Command | Purpose |
|---------|---------|
| `npm run verify` | Static gate chain: check + lint + knip + knip:production + deps:check + mock-inventory:check + builds (web, desktop). Runs **no tests** — CI runs the affected slice on every PR and push |
| `npm run verify:quick` | check + lint + knip + knip:production + deps:check only — no tests or builds |
| `npm run verify:release` | `verify` + `test:full` + `test:integration` (incl. the harness lane) + full e2e. The pre-version-bump checklist. CI re-runs `test:full`, `test:integration:service`, and full e2e on the bump PR (`.github/workflows/release-guard.yml`); the harness lane is local-only |

## Typecheck and lint

| Command | Purpose |
|---------|---------|
| `npm run check` | TypeScript type check — per-package fan-out gate (`tools/repo-gates/src/typecheck-gate.ts`) |
| `npm run lint` | Biome + ESLint + governance-lint — see [linting-and-formatting.md](linting-and-formatting.md) |
| `npm run lint:biome` | Biome only |
| `npm run lint:eslint` | ESLint only |
| `npm run lint:fix` | Auto-fix lint issues |
| `npm run knip` | Find unused files/exports/dependencies |
| `npm run knip:production` | Same, restricted to production files |
| `npm run deps:check` | Import-vs-manifest gate |
| `npm run mock-inventory` | Write the mock-data inventory into `tools/repo-gates/mock-inventory/` |
| `npm run mock-inventory:check` | CI mode — compare inventory, exit 1 on diff |

## Governance

Package-boundary rules live in `tools/governance/` (`README.md`, `architecture.json`, `decided-rules.json`, `table-owners.json`). See [tools/governance/README.md](../../../tools/governance/README.md).

| Command | Purpose |
|---------|---------|
| `npm run lint:governance` | Run governance-lint against the live tree |
| `npm run lint:governance:fixtures` | Run governance-lint against the fixture set |

Both also run inside `npm run lint`.

## Database

Migrations are hand-written — there is no generator. A new migration is a hand-authored `.sql` file in `framework/db/drizzle/` plus a matching entry in `framework/db/drizzle/meta/_journal.json`. See `framework/db/drizzle/README.md`.

| Command | Purpose |
|---------|---------|
| `npm run db:migrate` | Apply migrations via drizzle-kit against `DATABASE_URL` (Postgres only — never touches PGlite) |
| `npm run db:bootstrap:pg` | Factory bootstrap against `DATABASE_URL` |
| `npm run db:seed:pg` | Seed against `DATABASE_URL` (same as `db:bootstrap:pg` plus `--demo`) |

Laptop PGlite migrations run via `npm run setup`, not `db:migrate`.

## Evals and docs site

| Command | Purpose |
|---------|---------|
| `npm run eval` | Run the eval suite (`@hyperidle/eval`) |
| `npm run eval:quick` | Eval suite with `--quick` |
| `npm run docs:dev` | VitePress dev server for `docs/product` |
| `npm run docs:build` | VitePress build of `docs/product` |
