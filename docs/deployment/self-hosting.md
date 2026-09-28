# Self-Hosting

The **cloud** profile runs HyperIdle against a managed Postgres instance. The remote-server application boots with no embedded harness pool — agents come from desktop clients or a `remote-worker` pointed at the server.

Profile defaults are in `applications/remote-server/src/profiles.ts`.

## Required environment variables

| Variable | Required | Notes |
|---|---|---|
| `HYPERIDLE_API_KEY` | **Yes** | Shared secret for all API requests. Server exits at startup without it for vps/cloud profiles (`applications/remote-server/src/validate-startup-env.ts`). |
| `DATABASE_URL` | **Yes** | PostgreSQL connection string. |
| `HYPERIDLE_PROFILE` | No | `cloud` (default: `laptop`). |
| `PORT` | No | Default `3001`. |

## Cloud (managed Postgres)

`HYPERIDLE_PROFILE=cloud` runs against a managed Postgres instance (Neon, Supabase, RDS, …).

```bash
export DATABASE_URL=postgres://user:pass@host:5432/hyperidle
export HYPERIDLE_PROFILE=cloud
export HYPERIDLE_API_KEY=$(openssl rand -hex 32)
npm run db:migrate:pg    # applies migrations (no CREATE SCHEMA — safe for a restricted role)
npm start                # serve the built frontend + API; factory bootstrap runs at boot
```

The server runs `applyFactoryCoreState` on every boot — no separate bootstrap step is needed.

**Connection pool:** default 10 connections; override via `PG_POOL_SIZE` (`framework/db/src/connection.ts`).

**Health check:** `curl $API_URL/api/health`.

## Postgres migration tooling

Two migration runners exist:

| Command | What it does |
|---|---|
| `npm run db:migrate:pg` | Custom runner (`framework/db/src/migrate-pg.ts`) — applies migrations without `CREATE SCHEMA`, safe for a schema-scoped tenant role |
| `npm run db:migrate` | drizzle-kit migrate against `DATABASE_URL` — requires database-level CREATE, not suitable for a restricted role |

Use `db:migrate:pg` in production. Use `npm run db:migrate` locally when you have full database access.

Companion commands:

| Command | What it does |
|---|---|
| `npm run db:bootstrap:pg -- --demo` | Seeds the Acme demo world — only needed if you want demo data |
| `npm run db:seed:pg` | Factory bootstrap (the `system:propagation` actor) — not needed for normal deploys, server does it at boot |

## VPS (Docker Compose)

The `docker-compose.yml` at repo root defines a three-service stack: Postgres, a one-shot migrate container, and the production server. The server also serves the built web SPA from `HYPERIDLE_STATIC_DIR` — no separate frontend container.

```bash
cp .env.example .env                          # set POSTGRES_PASSWORD and HYPERIDLE_API_KEY
docker compose up -d --build                  # builds Dockerfile.deploy, runs migrate, starts server
```

On `docker compose up`:
1. `postgres` starts and passes its healthcheck.
2. `migrate` runs `npx tsx framework/db/src/migrate-pg.ts` against Postgres, then exits.
3. `server` starts once migrate exits successfully, serving the API and built web SPA on port 3001.

The server runs factory bootstrap at boot (the `system:propagation` actor is created automatically).

**Health checks:**
```bash
curl http://127.0.0.1:3001/api/health
curl -H "X-API-Key: $HYPERIDLE_API_KEY" http://127.0.0.1:3001/api/health/auth
curl http://127.0.0.1:3001/   # HTML 200 — web SPA
```

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `HYPERIDLE_API_KEY is required for VPS/cloud profiles` | Server started without a key. | Export `HYPERIDLE_API_KEY` before starting. |
| `Invalid profile: "…". Must be one of: laptop, vps, cloud.` | Typo in `HYPERIDLE_PROFILE`. | Use `laptop`, `vps`, or `cloud`. |
| `Cloud profile requires DATABASE_URL env var or --db-url.` | Cloud profile without a URL. | Export `DATABASE_URL` or pass `--db-url`. |
| Postgres pool exhausted | Too few connections. | Raise `PG_POOL_SIZE` (default 10). |

## Other profiles

- Local development: [laptop](laptop.md)
- Desktop app releases (primary end-user distribution): [releases](releases.md)
- Shared K8s backend: [shared-backend](shared-backend.md)
