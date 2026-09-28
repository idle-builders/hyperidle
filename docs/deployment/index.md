# Deployment

HyperIdle ships as a signed, notarized macOS desktop app (Electron). The Hono server runs embedded in the Electron main process; PGlite at `userData/hyperidle-pg` is the database; a 256-bit API key is auto-generated into `userData/secrets.json` on first launch.

**First run — SetupFlow** collects your name, a harness to run the assistant on (the harness must already be installed and signed in), and an optional repo folder. No API key is entered. A team is created silently from the folder name or "My Team".

Install via DMG, or via Homebrew after adding the tap (`brew tap ambrovia/homebrew-tap && brew install --cask hyperidle`). Node ≥ 24 required for dev.

**Shared mode.** The desktop app can connect to a shared HyperIdle server instead of running its own embedded instance. Set the server URL and key in Settings → Backend. The key is stored in the OS keychain (`shared_backend_key` via safeStorage, `applications/desktop/src/safe-credentials.ts`). The app loads the server's URL and starts no embedded server or agents.

| Profile | Database | How to start |
|---|---|---|
| Desktop app | PGlite at `userData/hyperidle-pg` | Launch the app; migrates on boot |
| Laptop (dev) | PGlite at `<repo-root>/hyperidle-pg` | `npm run setup` then `npm run dev` |
| Cloud | Managed Postgres | see [self-hosting](self-hosting.md) |
| Shared backend | Postgres on K8s cluster | see [shared-backend](shared-backend.md) |

Dev setup steps and the command reference live in [guides/developer/getting-started](../guides/developer/getting-started.md). Agents run only in the desktop app (local topology) and on remote workers — the dev server (`npm run dev`) runs no agents.

---

- [laptop.md](laptop.md) — PGlite path, setup-before-dev, Node ≥ 24
- [self-hosting.md](self-hosting.md) — cloud Postgres profile (`DATABASE_URL`, pool, migration tooling)
- [releases.md](releases.md) — unified release pipeline: one version bump ships the backend image and the notarized DMG/Homebrew cask on merge
- [shared-backend.md](shared-backend.md) — headless server as a single tenant on the shared K8s cluster for internal team collaboration
