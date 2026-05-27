## Development Setup

Local development runs the server and web client as separate processes with hot reload.

**Prerequisites**
- Node 20+
- npm

**Setup**
```
npm install
npm run dev
```

This starts:
1. Hono API server on `http://localhost:3001` (via `@hono/node-server`)
2. Vite dev server on `http://localhost:5173` (React SPA with HMR)

The dev server uses `better-sqlite3` with the database at `packages/hyperidle.db`. Migrations run automatically on server start from `packages/db/drizzle/`.

**Auth in dev mode:** Set `VITE_HYPERIDLE_API_KEY` in `.env` or let the server generate one on first start.

**Verification**
```
npm run verify
```

Runs type-checking, linting, and tests in one orchestrated pass.
