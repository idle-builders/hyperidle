# Deployment

HyperIdle ships as a signed, notarized macOS desktop app (Electron). The Hono server runs inside the Electron main process; PGlite at `userData/hyperidle-pg` is the database; a 256-bit API key is generated into `userData/secrets.json` on first launch.

**First start.** A fresh install opens `/start`. It shows the agent programs found on this computer (claude-code, codex, opencode, cursor-agent) and how to sign in to one, then asks your name and your team's name. Start talking makes you, the team, a first agent called Builder on a signed-in program, and a first conversation where Builder says hello. No API key is entered.

Install via DMG, or via Homebrew after adding the tap (`brew tap ambrovia/homebrew-tap && brew install --cask hyperidle`). Node ≥ 24 required for dev.

**Joining a team's server.** At first start the desktop app can instead join a team that runs on a server: "Join a team on a server", then the server's address and the key its owner gave you. The app keeps the key encrypted on this computer (`shared_backend_key`, Electron `safeStorage`, `applications/desktop/src/safe-credentials.ts`), checks that the server answers, and reopens on the server's address. From then on it starts no server and runs no agents of its own. To leave the server, delete `config.json` in the app's data folder (Help → Open Data Folder).

| Profile | Database | How to start |
|---|---|---|
| Desktop app | PGlite at `userData/hyperidle-pg` | Launch the app; migrates on boot |
| Laptop (dev) | PGlite at `<repo-root>/hyperidle-pg` | `npm run setup` then `npm run dev` |
| Cloud | Managed Postgres | see [self-hosting](self-hosting.md) |
| Shared backend | Postgres on K8s cluster | see [shared-backend](shared-backend.md) |

Dev setup steps and the command reference live in [guides/developer/getting-started](../guides/developer/getting-started.md).

**Where agents run.** Only the desktop app on its own database runs agents: its server looks for the agent programs on this computer and starts them. A server started with `npm run dev`, `npm start` or the server image runs none. It can take sessions from a worker that connects over `/ws/worker` (`RemoteWorkerClient`, exported by `applications/remote-worker`), but no app in this repo runs that client — so a shared server, and a desktop app joined to it, run no agents.

---

- [laptop.md](laptop.md) — PGlite path, setup-before-dev, Node ≥ 24
- [self-hosting.md](self-hosting.md) — cloud Postgres profile (`DATABASE_URL`, pool, migration tooling)
- [releases.md](releases.md) — unified release pipeline: one version bump ships the backend image and the notarized DMG/Homebrew cask on merge
- [shared-backend.md](shared-backend.md) — headless server as a single tenant on the shared K8s cluster for internal team collaboration
