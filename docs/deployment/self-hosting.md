# Self-Hosting

Two server-hosted profiles run HyperIdle against real Postgres: **VPS** (single-machine Docker Compose) and **cloud** (managed Postgres). Both use the postgres-js driver (`framework/db/src/profiles.ts`). The implemented, operated server deployment is the shared K8s backend — see [shared-backend](shared-backend.md). The VPS compose stack runs dev-mode processes (`npm run dev` inside the containers) — it is not hardened production.

Agents run on the host in every profile — see [run-unit-model](../architecture/run-unit-model.md).

## VPS (Docker Compose)

One stack, three services (`docker-compose.yml` at repo root):

- `postgres` — `postgres:16-alpine`, named volume `postgres_data`, healthcheck, bound to `127.0.0.1:5432`.
- `server` — Hono API on `127.0.0.1:3001`, `HYPERIDLE_PROFILE=vps`, waits on a healthy Postgres (`depends_on: condition: service_healthy`).
- `web` — Vite on `127.0.0.1:5173`.

All three bind to loopback so `docker compose up -d` never accidentally publishes to `0.0.0.0`. Front the server and web with a reverse proxy (nginx/Caddy) for TLS + auth; reach Postgres externally only via VPN or SSH tunnel.

### Setup

```bash
cp .env.example .env
# Set POSTGRES_PASSWORD — compose hard-fails without it.
npm run setup -- --profile vps
docker compose up -d
DATABASE_URL=postgres://hyperidle:$POSTGRES_PASSWORD@localhost:5432/hyperidle npx tsx framework/db/src/migrate-pg.ts
npm run db:seed:pg
```

Notes:

- `npm run setup` needs `--` before flags to forward them (`npm run setup --profile vps` silently drops the flag). The vps profile verifies `docker-compose.yml` exists (`framework/db/src/setup-cli.ts`, `requiresDockerCompose` in `profiles.ts`).
- `DATABASE_URL` inside the server container is interpolated from `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` (see `@lore` in `docker-compose.yml`). Override with an explicit `DATABASE_URL` in `.env` if needed.

### Verify

```bash
docker compose ps
curl http://localhost:3001/health
```

## Cloud (managed Postgres)

`HYPERIDLE_PROFILE=cloud` runs against a managed Postgres instance (Neon, Supabase, RDS, …). The cloud profile has no default URL — `DATABASE_URL` (or `--db-url`) is mandatory; setup errors with `Cloud profile requires DATABASE_URL env var or --db-url.` (`framework/db/src/setup-cli.ts:231`).

```bash
export DATABASE_URL=postgres://user:pass@host:5432/hyperidle
export HYPERIDLE_PROFILE=cloud
npm run setup -- --profile cloud
npx tsx framework/db/src/migrate-pg.ts
npm run db:seed:pg
```

**Connection pool:** default 10 connections; override via the `PG_POOL_SIZE` env var or the `maxConnections` option on `createPgDb` — all in `framework/db/src/connection.ts`.

**Verify:** `curl $API_URL/health` (also served at `/api/health`).

## Postgres tooling

There is no `db:migrate:pg` npm script — PG migrations run via `npx tsx framework/db/src/migrate-pg.ts`, which applies migrations without `CREATE SCHEMA` so a schema-scoped tenant role (no database-level CREATE) can run it. Companion scripts:

| Command | What it does |
|---|---|
| `npx tsx framework/db/src/migrate-pg.ts` | Apply PG migrations against `DATABASE_URL` |
| `npm run db:seed:pg` | Seed against `DATABASE_URL` |
| `npm run db:bootstrap:pg` | Factory bootstrap against `DATABASE_URL` |
| `npm run test:pg` | Run the test suite against a real `DATABASE_URL` (`framework/db/src/__testing__/pg-test-runner.ts`) |

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `docker-compose.yml not found` | Wrong working directory. | Run from repo root, or pass `--root <path>` to setup. |
| `Invalid profile: "…". Must be one of: laptop, vps, cloud.` | Typo in `HYPERIDLE_PROFILE`. | Use `laptop`, `vps`, or `cloud`. |
| `Cloud profile requires DATABASE_URL env var or --db-url.` | Cloud profile without a URL. | Export `DATABASE_URL` or pass `--db-url`. |
| Postgres pool exhausted | Too few connections. | Raise `PG_POOL_SIZE` (default 10). |

## Other profiles

- Local development: [laptop](laptop.md)
- Desktop app releases (primary end-user distribution): [releases](releases.md)
- Shared K8s backend: [shared-backend](shared-backend.md)
