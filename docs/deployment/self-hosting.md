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
npx tsx framework/db/src/migrate-pg.ts   # applies migrations (no CREATE SCHEMA — safe for a restricted role)
npm run db:bootstrap:pg                  # writes the one system row every instance needs
npm start                                # serve the built frontend + API
```

**Connection pool:** default 10 connections; override via `PG_POOL_SIZE` (`framework/db/src/connection.ts`).

**Health check:** `curl $API_URL/api/health`.

## Postgres migration tooling

Two migration runners exist:

| Command | What it does |
|---|---|
| `npx tsx framework/db/src/migrate-pg.ts` | Custom runner — applies migrations without `CREATE SCHEMA`, safe for a schema-scoped tenant role |
| `npm run db:migrate` | drizzle-kit migrate against `DATABASE_URL` — requires database-level CREATE, not suitable for a restricted role |

Use `migrate-pg.ts` in production. Use `npm run db:migrate` locally when you have full database access.

Companion commands:

| Command | What it does |
|---|---|
| `npm run db:bootstrap:pg` | Factory bootstrap (the `system:propagation` actor) |
| `npm run db:seed:pg` | Same as bootstrap plus `--demo` |
| `npm run test:pg` | Run the test suite against a real `DATABASE_URL` |

## VPS (Docker Compose)

The `docker-compose.yml` at repo root defines a three-service stack. **This stack is not currently functional** — the `server` service requires `HYPERIDLE_API_KEY` but none is passed in the compose environment, so the server exits at startup. Use the cloud profile with a managed Postgres instead until this is fixed.

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
