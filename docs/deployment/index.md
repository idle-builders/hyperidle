# Deployment

HyperIdle ships as a signed, notarized macOS desktop app (Electron). The Hono server runs embedded in the Electron main process; PGlite at `userData/hyperidle-pg` is the database; a 256-bit API key is auto-generated into `userData/secrets.json` on first launch; SetupFlow collects your name, creates a first team (name derived from repo path), and requires an Anthropic API key before you can proceed. Install via DMG, or via Homebrew after adding the tap (`brew tap ambrovia/homebrew-tap && brew install --cask hyperidle`). Node ≥ 24 required for dev.

| Profile | Database | How to start |
|---|---|---|
| Desktop app | PGlite at `userData/hyperidle-pg` | Launch the app; migrates on boot |
| Laptop (dev) | PGlite at `<repo-root>/hyperidle-pg` | `npm run setup` then `npm run dev` |
| VPS | Postgres via Docker Compose | see [self-hosting](self-hosting.md) |
| Cloud | Managed Postgres | see [self-hosting](self-hosting.md) |
| Shared backend | Postgres on K8s cluster | see [shared-backend](shared-backend.md) |

Dev setup steps and the command reference live in [guides/developer/getting-started](../guides/developer/getting-started.md). Agents run on the host in every profile — see [architecture/run-unit-model](../architecture/run-unit-model.md).

---

- [laptop.md](laptop.md) — the 4 dev-deployment facts (PGlite path, setup-before-dev, API-key pairing, Node≥24) + bin/service LaunchAgent table
- [self-hosting.md](self-hosting.md) — VPS Docker Compose stack and cloud Postgres profile (DATABASE\_URL, pool, migrate-pg.ts, troubleshooting)
- [releases.md](releases.md) — unified release pipeline: one version bump ships the backend image and the notarized DMG/Homebrew cask on merge
- [shared-backend.md](shared-backend.md) — headless server as a single tenant on the shared K8s cluster for internal team collaboration
