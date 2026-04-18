# HyperIdle Deployment Profiles

HyperIdle (H4) ships three deployment profiles that each map to a concrete
(database driver, workspace adapter, orchestration) tuple. Pick the one
that matches your environment and use the `bun run setup` CLI.

Profile selection order:
1. `--profile <laptop|vps|cloud>` CLI flag.
2. `HYPERIDLE_PROFILE` env var.
3. Default: `laptop`.

---

## Laptop

Single-machine development. SQLite file, local workspace adapter, no
external services.

**Prerequisites**
- Bun ≥ 1.1
- Node 20+ (for Playwright binaries)

**Setup**
```
bun install
bun run setup --profile laptop
bun dev
```

The setup command:
1. Creates `./hyperidle.db` (configurable via `--db-path`).
2. Runs the SQLite migrations from `packages/db/drizzle/`.
3. Seeds initial data (products, agents, routines).
4. Prints a ready banner. `bun dev` then starts server + web.

**Verification**
```
bun run test
```

---

## VPS

Self-hosted single-VPS deployment using Docker Compose: Postgres + server
+ web in one stack.

**Prerequisites**
- Docker 24+
- Docker Compose v2

**Setup**
```
cp .env.example .env
# Edit .env — at minimum set POSTGRES_PASSWORD.
bun run setup --profile vps
docker compose up -d
bun run db:migrate:pg
bun run db:seed:pg
```

The `setup --profile vps` step verifies `docker-compose.yml` exists and
prints the bring-up steps. The compose stack:
- `postgres` — Postgres 16 with a named volume and a healthcheck.
- `server` — Hono API on port 3001; depends on a healthy Postgres.
- `web` — Vite dev server on port 5173.

`DATABASE_URL` inside the server container defaults to
`postgres://hyperidle:hyperidle@postgres:5432/hyperidle`. Override via
`.env`.

**Verification**
```
docker compose ps
curl http://localhost:3001/health
```

---

## Cloud

Managed Postgres + serverless/container workspace (E2B). Useful for
production-grade deployments.

**Prerequisites**
- A managed Postgres instance (e.g. Neon, Supabase, RDS).
- E2B API credentials for sandboxed agent workspaces.

**Setup**
```
export DATABASE_URL=postgres://user:pass@host:5432/hyperidle
export HYPERIDLE_PROFILE=cloud
bun run setup --profile cloud
bun run db:migrate:pg
bun run db:seed:pg
```

Cloud profile uses connection pooling (`PG_POOL_SIZE`, default 10) against
the managed Postgres. See `packages/db/src/pg-connection.ts` for details.

**Verification**
```
curl $API_URL/health
```

---

## Switching SQLite → Postgres

No code changes required. Set `DATABASE_URL` and switch profile:

```
# From laptop:
HYPERIDLE_PROFILE=vps DATABASE_URL=postgres://... bun run db:migrate:pg
```

Drizzle's schema definitions are driver-agnostic; the Postgres schema
lives at `packages/db/src/schema.pg.ts` and mirrors the SQLite schema
table-for-table (pinned by the `pg-schema.test.ts` parity test).

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `docker-compose.yml not found` | Wrong working directory. | Run from repo root. |
| `Invalid profile` | Typo in `HYPERIDLE_PROFILE`. | Use one of `laptop`, `vps`, `cloud`. |
| `DATABASE_URL required` | Cloud/VPS profile without URL. | Export `DATABASE_URL` or pass `--db-url`. |
| Postgres pool exhausted | Too few connections. | Raise `PG_POOL_SIZE` env var. |
