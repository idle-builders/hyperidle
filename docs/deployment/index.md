# HyperIdle Deployment

HyperIdle ships as a native macOS desktop app (Electron). The server runs embedded in the Electron main process — no separate infrastructure required.

## Primary: Desktop App

- **Install:** `brew install --cask hyperidle` or download the DMG from releases.
- **Platform:** macOS arm64 (Apple Silicon). Signed and notarized.
- **Database:** SQLite at `~/Library/Application Support/HyperIdle/hyperidle.db`
- **Server:** Hono API on `@hono/node-server`, embedded in Electron main process (OS-assigned port on localhost).
- **Auth:** Auto-generated 256-bit API key stored in `userData/secrets.json`, injected via preload bridge.
- **First run:** SetupFlow guides through profile (name, email), product creation, and optional API key.
- **Logs:** `~/Library/Logs/HyperIdle/server.log`

## Development

For contributors working on the codebase:

```
npm install
npm run dev
```

This starts the Hono server on port 3001 and Vite dev server on port 5173.

**Prerequisites:** Node 20+, npm.

## Sections

- [Development setup](./laptop.md)
- [Shared Backend (cluster)](./shared-backend.md) — headless server as a tenant on the shared K8s cluster, for internal team usage
- [VPS (future)](./vps.md) — self-hosted Docker Compose with Postgres
- [Cloud (future)](./cloud.md) — managed Postgres + E2B sandboxes
- [Switching SQLite to Postgres](./switching-sqlite-to-postgres.md)
- [Troubleshooting](./troubleshooting.md)
