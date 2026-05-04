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

Cloud profile uses connection pooling against the managed Postgres. The
pool size defaults to 10 and is configurable via the `PG_POOL_SIZE`
environment variable (or the `maxConnections` option on `createPgDb`).
See `packages/db/src/pg-connection.ts` for details.

**Verification**
```
curl $API_URL/health
```
