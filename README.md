# HyperIdle

Agentic operating system for managing product teams of AI agents. Two founders (CEO + CPO) run a "Product Factory" — a portfolio of digital products where AI agents do the implementation work.

See `ETHOS.md` for the builder philosophy and `CLAUDE.md` for the absolute rules. Architecture lives in `docs/architecture/`; user stories in `.pipeline/work-packages/`.

---

## Quick start (local dev)

```bash
npm install
npm run setup -- --profile laptop   # creates SQLite DB, runs migrations, seeds data
export HYPERIDLE_API_KEY=my-local-dev-key
npm run dev                          # server :3001 + web :5173
```

Open <http://localhost:5173>.

---

## Pipeline (autonomous batch story execution)

The `/pipeline` skill drives the loop — `plan → tests → code → reviews → DoD → verify → ship → retro`. Each work item is one folder, `.pipeline/work/<id>/`, holding its `plan.md` and its `retro.jsonl`; tracks are registered in `.pipeline/<track>.md`. Older work packages still live under `.pipeline/work-packages/` (`TRACK-*.md` + `pipeline-manifest.yaml`) pending migration.

### `/pipeline` — interactive Claude Code skill

Inside `claude`, type `/pipeline <target>` (e.g. `/pipeline L`) to run the loop in your current session — read every transcript and step in when you want.

### Run the pipeline in Docker (recommended)

The repo ships a `Dockerfile` with a full agent-ready toolchain pre-installed (Node.js, Claude Code, Playwright + Chromium, `git`, `gh`, `sudo`).

```bash
# 1. Build the image (one-time, or after Dockerfile changes)
docker build -t hyperidle .

# 2. Start the container (bind-mount the repo so changes persist)
docker run -it -v "$(pwd):/workspace" -p 3001:3001 -p 5173:5173 --name hyperidle-dev hyperidle

#2b. Restart the container
docker start -ai hyperidle-dev

# 3. Inside the container
npm install
claude login   
gh auth login 

# 4. start the pipeline
claude               # then:  /pipeline <workpackages>
```

Each item's state lives in its own `.pipeline/work/<id>/` folder — re-running `/pipeline <target>` resumes where the last run left off.

### Run the pipeline directly on the host

If you have Node.js, Claude Code, and Playwright installed locally, the in-container step is optional:

```bash
claude                # in this repo root
# then:  /pipeline K
```

The runner writes to `.pipeline/work/<id>/`. Worktrees are created in `.worktrees/<story-id>/` per story.

---

## VPS deployment (production stack)

Separate from the pipeline container — this is the **deployment** stack (Postgres + server + web), wired through `docker-compose.yml`.

```bash
cp .env.example .env
# set POSTGRES_PASSWORD (at minimum)
npm run setup -- --profile vps
docker compose up -d
npm run db:migrate:pg
npm run db:seed:pg
```

See `docs/deployment/` for the full operator guide.

---

## Common commands

| Command | What |
|---|---|
| `npm run dev` | Server (3001) + web (5173) in parallel |
| `npm run check` | TypeScript type check |
| `npm run lint` | Biome + ESLint |
| `npm run lint:fix` | Auto-fix lint issues |
| `npm run test` | Vitest (unit + integration) |
| `npm run db:generate` | Generate a new Drizzle migration |
| `npm run db:migrate` | Apply migrations |
| `npm run ds:serve` | Design-system component viewer (`:8098`) |
| `npm run ds:sync` | HTML ↔ TSX visual regression check |
| `bin/service` | Manage a macOS LaunchAgent for the prod server |

---

## Project layout

```
hyperidle/
├── packages/
│   ├── db/          # Drizzle ORM schema, migrations, seed, setup CLI
│   ├── server/      # Hono API server (port 3001)
│   ├── web/         # React + Vite frontend (port 5173)
│   ├── shared/      # Shared types, constants, TOON codec
│   ├── fabric/      # Knowledge fabric, context assembly, file watching, writeback
│   └── design-system/ # Tier 1 + 2 components (TSX + HTML reference)
├── docs/            # Architecture, requirements, work packages
├── bin/             # Shell wrappers (setup, service)
└── .pipeline/       # Track registries (<track>.md) + one folder per work item (work/<id>/)
```

---

## More docs

- `docs/guides/developer/` — get from zero to running tests in under 10 minutes
- `docs/guides/user/` — using HyperIdle as an end user
- `docs/deployment/` — VPS / cloud deployment
- `docs/architecture/` — three-layer system overview
- `.pipeline/work-packages/` — per-track user stories
- `CLAUDE.md` — rules for AI agents working in this repo
- `ETHOS.md` — builder philosophy
