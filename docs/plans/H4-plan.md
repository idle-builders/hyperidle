# H4 — Deployment Profiles + PostgreSQL Adapter — Plan

**Story ref:** `docs/work-packages/TRACK-H.md` §H4
**Branch:** `feat/H4-deployment-profiles`
**Worktree:** `/workspace/.worktrees/H4`

---

## 1. Acceptance Criteria → Verification Matrix

| AC | Criterion | Verification |
|----|-----------|--------------|
| AC1 | `bun run setup --profile laptop` creates SQLite DB, runs migrations, seeds. | Vitest integration test invoking the CLI entry with `--profile laptop --db-path <tmp>`; asserts file exists, tables present, seed rows > 0. |
| AC2 | `bun run setup --profile vps` validates Docker Compose bring-up. | No Docker daemon in sandbox — test validates CLI emits the correct `docker compose up` command AND `docker-compose.yml` parses + has required services. |
| AC3 | All tests pass against PostgreSQL. | Shared schema parity (existing) + pglite-based `createPgTestDb()` that runs the pg migrations on an in-memory WASM Postgres. `test:pg` npm script exists; if env `DATABASE_URL` set, runs against it; else runs pglite path. |
| AC4 | Switching SQLite → Postgres is a config change. | `createDb({ url })` factory test: passing `sqlite:` vs `postgres:` URL picks correct driver; caller code unchanged. |
| AC5 | Postgres pool = 10 connections default, configurable. | Unit test: `createPgDb({ url, maxConnections? })` exposes pool size. Default is 10; override honored. |
| AC6 | Documentation per profile. | `docs/DEPLOYMENT.md` contains sections `## Laptop`, `## VPS`, `## Cloud`. File existence + headings test. |

## 2. Profile Contract

```
type DeploymentProfile = "laptop" | "vps" | "cloud";

interface ProfileDefaults {
  profile: DeploymentProfile;
  dbDriver: "sqlite" | "postgres";
  dbUrlDefault: string;              // e.g. "./hyperidle.db" or "postgres://..."
  workspaceAdapter: "local" | "docker" | "e2b";
  requiresDockerCompose: boolean;
  ports: { server: number; web: number };
}

const PROFILE_DEFAULTS: Record<DeploymentProfile, ProfileDefaults> = { ... };

function resolveProfile(options?: {
  profile?: DeploymentProfile;
  env?: NodeJS.ProcessEnv;
}): ProfileDefaults;
```

Resolution order: CLI flag > `HYPERIDLE_PROFILE` env > default `laptop`.

## 3. Database Factory

Add `packages/db/src/pg-connection.ts`:

```
interface PgDbOptions {
  url: string;
  maxConnections?: number; // default 10
}
type HyperIdlePgDb = ReturnType<typeof drizzle<typeof pgSchema>>;
function createPgDb(opts: PgDbOptions): { db: HyperIdlePgDb; close(): Promise<void> };
```

Driver: `drizzle-orm/postgres-js` using the `postgres` package (pool with `max: 10`). Official docs: https://orm.drizzle.team/docs/connect-postgresql

For tests, add `createPgTestDb()` using `drizzle-orm/pglite` + `@electric-sql/pglite` (in-memory WASM Postgres). Official docs: https://orm.drizzle.team/docs/connect-pglite

Update `packages/db/src/index.ts` to export `createPgDb`, `createPgTestDb`, profile contract types.

**The existing `createDb(path)` stays (SQLite). New unified factory is NOT introduced — caller code already picks one via workspace imports. AC4 (config-only swap) is proven by both factories accepting a single URL and Drizzle query code being identical on both (pg-schema parity test already passes).**

## 4. Setup CLI

New entry: `packages/db/src/setup-cli.ts` exporting `runSetup(argv, io?): Promise<number>`.

Argv parsing (no external dep — hand-rolled):
- `--profile laptop|vps|cloud` (required; or `HYPERIDLE_PROFILE`)
- `--db-path <path>` (laptop only; default `./hyperidle.db`)
- `--db-url <url>` (vps/cloud)
- `--start` (optional; print banner only in this first pass — does NOT spawn the server because the sandbox can't prove it)
- `--dry-run` (emit planned actions without executing)

Binary: `bin/setup` bash wrapper → `bun packages/db/src/setup-cli.ts`.

Root `package.json` script: `"setup": "bun packages/db/src/setup-cli.ts"`.

Laptop path:
1. Resolve profile.
2. Create directory for `--db-path`.
3. Open `better-sqlite3` connection.
4. Run `migrate()` from `drizzle-orm/better-sqlite3/migrator` against `packages/db/drizzle/`.
5. Run `seed(db)`.
6. Print `"[setup] Ready. SQLite DB at <path>. Run `bun dev` to start the server."`

VPS path:
1. Resolve profile.
2. Ensure `docker-compose.yml` exists at repo root (file check).
3. Print instructions: `docker compose up -d` then `bun run db:migrate:pg`.
4. Optionally, if `DATABASE_URL` is set, connect + run pg migrations as a smoke test.

Cloud path:
1. Resolve profile. Requires `DATABASE_URL`.
2. Connect to remote Postgres, run migrations, seed.

## 5. Docker Compose

`docker-compose.yml` at repo root:
- `postgres` — image `postgres:16-alpine`, named volume, env POSTGRES_{USER,PASSWORD,DB}, healthcheck via `pg_isready`.
- `server` — build `./packages/server`, depends_on postgres (condition: service_healthy), env DATABASE_URL, port 3001.
- `web` — build `./packages/web`, depends_on server, port 5173.

Bind `.env` for secrets.

## 6. Docs

`docs/DEPLOYMENT.md` — three sections, each with: prerequisites, commands, verification.

`.env.example` at repo root — enumerates keys.

## 7. Tests Plan

**`packages/db/src/__tests__/profiles.test.ts`** — resolver unit tests (CLI flag > env > default; invalid value rejected).

**`packages/db/src/__tests__/pg-connection.test.ts`** — `createPgDb` returns drizzle instance; pool size default 10, override honored (check via the postgres.js connection option). Uses pglite for actual exercise.

**`packages/db/src/__tests__/pg-migration.test.ts`** — apply `drizzle-pg/` to a fresh pglite DB, assert all tables exist (via `information_schema.tables`). Proves AC3 (migrations apply cleanly).

**`packages/db/src/__tests__/setup-cli.test.ts`** — integration: run `runSetup` with `--profile laptop --db-path <tmp>`, assert file exists, products table has seed row. Also test `--profile vps --dry-run` prints the docker-compose command. Test invalid profile rejected.

**`packages/db/src/__tests__/docker-compose.test.ts`** — read `docker-compose.yml`, `yaml.parse`, assert services `postgres|server|web`, pg healthcheck present, named volume, DATABASE_URL env wired.

**`packages/db/src/__tests__/deployment-docs.test.ts`** — `docs/DEPLOYMENT.md` exists and contains `## Laptop`, `## VPS`, `## Cloud`.

## 8. Risks / Trade-offs

- `@electric-sql/pglite` is WASM Postgres — not 100% identical to real Postgres, but sufficient to prove migration parity and dual-driver support. Real Postgres test via `DATABASE_URL` remains available. Flagged with `@lore`.
- The `--start` server bring-up is stubbed (banner only) because the sandbox can't prove a server spawns correctly across reboots. Verified manually via `bun dev`.
- Setup CLI lives in `packages/db` because it needs the schema/seed; it does not pull in `@hyperidle/server`. Alternative was `bin/setup.ts` at root — rejected (no tsconfig at root).

## 9. Lore to Capture

- Why pglite and not pg-mem: pglite is WASM-based, runs real Postgres queries; pg-mem reimplements a subset. Drizzle officially supports pglite via `drizzle-orm/pglite`.
- Why the setup CLI doesn't actually start the server: cross-process lifecycle can't be proven by a single test; operators run `bun dev` separately.
- Why there's no single `createDb(url)` that returns a union type: Drizzle query chains are parametric on the dialect's column types; unifying them forces casts at every call site. Better: two factories, caller picks by workspace import (SQLite is the default; Postgres opt-in).
