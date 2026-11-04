# HyperIdle

An operating system for AI-first companies. Agents do the work, people check it, knowledge builds up. HyperIdle handles teams, work, and knowledge around the agent programs you already use (`claude`, `codex`, `opencode`, `cursor-agent`). Those programs keep their own logins; HyperIdle needs no API key.

## Install the desktop app

```bash
brew tap idle-builders/tap && brew install --cask hyperidle
```

Or download the DMG from the [releases page](https://github.com/idle-builders/hyperidle/releases).

## Run from source

Needs Node.js 24 or newer and Git.

```bash
git clone git@github.com:idle-builders/hyperidle.git
cd hyperidle
npm install
npm run setup          # local database + migrations
npm run dev            # server :3001 + web :5173
```

Open <http://localhost:5173>. Do not set `HYPERIDLE_API_KEY`: the dev server and web app share a default key, and a custom one gets every request refused with 401.

`npm run dev` runs no agents. To run agents from source, use `npm run dev:desktop` (desktop shell + web dev server).

## Docs

Start at [`docs/index.md`](docs/index.md): product, user guide, developer guide, deployment, architecture, agent layer, objects, interface.

## Contributing

- [`CLAUDE.md`](CLAUDE.md) — rules for working in this repo
- [`ETHOS.md`](ETHOS.md) — builder philosophy
- [`docs/guides/developer/`](docs/guides/developer/index.md) — getting started, commands, testing, linting
