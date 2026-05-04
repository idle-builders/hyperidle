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
