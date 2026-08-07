# Deployment

Most users run HyperIdle as the desktop app — a signed Electron build distributed as a versioned DMG (also via Homebrew cask). See [releases](../../deployment/releases.md).

For running HyperIdle yourself, there are three profiles (`framework/db/src/profiles.ts`):

| Profile | Database | Best for |
|---------|----------|----------|
| **Laptop** | PGlite (embedded Postgres, data dir `./hyperidle-pg`) | Local use, trying things out |
| **VPS** | PostgreSQL via Docker Compose | Self-hosted, single server |
| **Cloud** | Managed PostgreSQL via `DATABASE_URL` | Production, scalable |

`npm run setup -- --profile <laptop|vps|cloud>` selects a profile (or set `HYPERIDLE_PROFILE`; default is laptop) and applies migrations itself. All profiles serve on ports 3001 (server) and 5173 (web).

Full recipes live in [docs/deployment/](../../deployment/index.md):

- [Laptop](../../deployment/laptop.md) — local setup and the macOS `bin/service` background service (LaunchAgent)
- [Self-hosting](../../deployment/self-hosting.md) — VPS Docker Compose stack and cloud profile
- [Releases](../../deployment/releases.md) — desktop app versions and release flow
