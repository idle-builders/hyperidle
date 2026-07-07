# Laptop

Setup steps and the command reference live in [guides/developer/getting-started](../guides/developer/getting-started.md) and [guides/developer/commands](../guides/developer/commands.md); this page holds only the deployment facts specific to this profile.

## Deployment facts

1. **Database is a PGlite data directory at `<repo-root>/hyperidle-pg`.** The laptop profile default is `./hyperidle-pg` (`packages/db/src/profiles.ts`), resolved repo-root-relative — not cwd-relative — by `resolvePglitePath` in `packages/server/src/server-factory.ts`, so it points to the same directory whether the server starts via `npm run dev` (cwd `packages/server/`) or direct Node invocation.
2. **Setup before dev.** `npm run dev` does not migrate the database. Run `npm run setup` first — the setup CLI (`packages/db/src/setup-cli.ts`) creates the PGlite directory and applies migrations via `applyMigrations`. The desktop app migrates itself on boot (`packages/desktop/src/migrate.ts`); the dev server never does.
3. **Dev auth is a paired key.** Set `VITE_HYPERIDLE_API_KEY` (web client, `packages/web/src/services/api-fetch.ts`) matching `HYPERIDLE_API_KEY` (server) in `.env`. The server does not auto-generate a key — it only warns and refuses credential writes when none is set (`server-factory.ts`); only the desktop app generates one.
4. **Node ≥ 24** (root `package.json` engines).

## Background service (macOS)

To keep HyperIdle running after the terminal closes and across reboots:

```bash
export HYPERIDLE_API_KEY=your-secret-key
bin/service install
```

This builds the frontend if needed, installs a macOS LaunchAgent (`com.hyperidle.server` in `~/Library/LaunchAgents`), and starts the server at http://localhost:3001. It restarts automatically on login. `install` refuses to run without `HYPERIDLE_API_KEY` exported.

| Command | What it does |
|---|---|
| `bin/service install` | Build, install, and start the service |
| `bin/service uninstall` | Stop and remove the service |
| `bin/service start` | Start the server |
| `bin/service stop` | Stop the server |
| `bin/service restart` | Stop, rebuild if needed, and start |
| `bin/service status` | Check if the server is running |
| `bin/service logs` | Tail the server log |
| `bin/service rebuild` | Rebuild the frontend after code changes |

## Other profiles

- Server-hosted profiles (VPS, cloud): [self-hosting](self-hosting.md)
- Desktop app releases (the primary end-user distribution): [releases](releases.md)
- Profile overview and install table: [index](index.md)
