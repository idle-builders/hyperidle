# Getting Started

From zero to HyperIdle running locally, with a Team, a Bet, and agents producing output. This guide uses the embedded PGlite database — no external database required.

**Time: 10 minutes.** By the end you'll see an agent session respond to a bet you defined.

---

## Prerequisites

- **Node.js 24 or later** — check with `node --version`. Install from [nodejs.org](https://nodejs.org).
- **Git** — check with `git --version`.
- **A way for your agents to think** — either a model provider API key, or a coding CLI you are already signed in to (Claude Code, Codex, OpenCode, Cursor).
  - **Anthropic** — get a key at [console.anthropic.com](https://console.anthropic.com); it starts with `sk-ant-`.
  - **OpenRouter** — get a key at [openrouter.ai](https://openrouter.ai) to reach many models through one account.
  - **Any OpenAI-compatible provider** (Together, Groq, a local server) — you will need its base URL as well as a key.
  - Do not commit a key to version control.

> Setup won't submit until the engine you picked can actually run. If you choose an already-signed-in CLI, no key is needed at all.

---

## 1. Clone and install

```bash
git clone https://github.com/ambrovia/hyperidle.git
cd hyperidle
npm install
```

**Expected:** npm installs dependencies for every package in the monorepo. No errors. Last line: `added N packages`.

---

## 2. Set up the database

```bash
npm run setup -- --profile laptop
```

The `--` before `--profile` is required — it separates npm's flags from the setup script's flags.

**Expected:**

```
[setup] Profile: laptop (db=pglite)
[setup] Ready. PGlite data at /path/to/hyperidle/hyperidle-pg
[setup] Next: run `npm run dev` to start the server and web app.
```

This creates a `hyperidle-pg/` data directory, runs all schema migrations, and
applies the factory bootstrap — the System Agent and factory settings, on every
install. That is all you get: one agent, with a bare identity. Roles and the
agents that hold them come from plugins or from you. To start with a demo team
pre-populated, add `--demo`: it seeds an example team, as it would look once you
had installed a plugin that brings one.

**Troubleshooting:**
- `--db-path must not contain '..' segments` — specify an absolute path: `npm run setup -- --profile laptop --db-path /Users/you/hyperidle-data`.
- `--db-path parent directory is not writable` — the repo directory is read-only. Run from a directory you own.
- Re-running setup on an existing database is safe — all inserts use `onConflictDoNothing`.

---

## 3. Start HyperIdle

```bash
npm run dev
```

**Expected:** Two processes start:

```
  ➜  Local:   http://localhost:5173/
Server running on http://localhost:3001
```

The web app is at [http://localhost:5173](http://localhost:5173). The API runs on port 3001.

**Troubleshooting:**
- `EADDRINUSE: port 3001` — another process is using that port. Set the `PORT` environment variable.
- Port 5173 busy — Vite auto-tries the next port and shows the alternative URL.

---

## 4. Complete first-run setup

Open [http://localhost:5173](http://localhost:5173). HyperIdle detects a fresh install and redirects to `/setup`.

Fill in the fields:

1. **Your name** (required) — for example, `Sam Chen`.
2. **Agent harness** (required) — the coding CLI every agent on your team runs through. HyperIdle lists whichever it found on this device.
   - Pick one that shows **Ready** and there is nothing else to fill in — it uses the login you already have.
   - A CLI that isn't installed, or isn't signed in, appears greyed with the command to fix it rather than as a dead option.
   - **HyperIdle never asks for an API key.** The harness is what you bring, and your key lives in that harness's own login. If nothing on this device is ready, setup stops and tells you what to install — it will not hand you a workspace whose agents silently fail.
3. **Project folder** (optional) — a local git repository path for agents to work in, for example `/Users/sam/projects/my-app`. Leave blank for now.
4. **What are you building?** — pick a team type. The default preset is **software**; each preset determines which agent roles your team starts with. Picking **custom** requires selecting at least one function.

Click **Start HyperIdle**. A user record and Team are created; you land on **Work** (your team page — with one team, the Work overview skips the list and takes you straight there).

### Check your agent backends

After setup, open **Settings → Agent backends** to see which execution environments HyperIdle detected on this device. Each backend (Claude Code, Codex, OpenCode, Cursor Agent) gets a row with a status dot, version, and status line.

- A backend shows a warning state if the CLI is present but not signed in; the row shows the sign-in command to run in a terminal (for example `codex login`). After signing in, click **Refresh** to re-run detection.

You do not need to enable additional backends to get started. The other backends become useful when you want to route specific agents through a locally-authenticated CLI. See [Connections](./connections.md) for the full credential and backend walkthrough.

**Troubleshooting:**
- `Failed to create user` — the server isn't running. Check that `npm run dev` is still active.
- Form stays visible after clicking Start — check the browser console for error details.

### API key via environment variable

**Settings → Credentials** works in all environments (browser and desktop) via the credentials API. Alternatively, supply the key as an environment variable before starting the server:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npm run dev
```

The server reads `ANTHROPIC_API_KEY` and passes it to agents. Use a `.env` file (listed in `.gitignore`) or your shell profile — do not commit the key.

---

## 5. Orient yourself

Take 60 seconds to look around. Top to bottom in the **sidebar**:

- **HyperIdle identity**, with **Search** and **Assistant** grouped in the top-right corner.
- **Notifications / Conversations / Work / Knowledge** — one stable set for attention and context switching.
- **Domain navigator** below — most of the sidebar is reserved for scanning and opening items from the active domain.
- **Settings** pinned at the bottom.

The **main pane** shows your team. No bets yet means an empty state with a **New bet** button.

Full walkthrough of the shell, shortcuts, and search: [The Interface](./the-interface.md). What each view is for: [Three Core Views](./three-core-views.md).

---

## 6. Create your first Bet

A **Bet** is a time-boxed chunk of work — the unit agents pick up and execute. There are two ways to create one.

**Option A — Talk to the Assistant (recommended for first-timers):**

1. Click the Assistant button in the top row of the sidebar (next to search) to open the overlay.
2. Describe your idea in plain language. For example: "I want to build a landing page with email signup."
3. The Assistant replies and drafts a bet from the conversation. A **BetCard** appears below the reply.
4. Click the card to open the draft bet. Review, edit as needed, and commit.

This is the conversation-first path — you iterate with the Assistant until the bet looks right, then commit.

**Option B — Hand-type the bet:**

1. Click **New bet** in the Work overview header or the team header (or in the empty-state centre if no bets exist yet).
2. A full-page authoring surface opens with:
   - **Description editor** (required) — describe the work using headings, lists, and paragraphs. For example: `Build a landing page with a hero section and a features list.`
   - **Title preview** — auto-derived from the first line of your description (heading markers stripped).
   - **Team** select — shown only when you have more than one team; the single team is used automatically otherwise.
3. Click **Create**.

**Expected:** You are navigated to the new Bet detail page. The Bet also appears as a `draft` card in the Team view.

To start agents, open the Bet, click the overflow menu (`···`) in the top-right, and choose **Activate bet**. The status flips from `draft` to `active`. The task section shows "No tasks yet" — agents on your team will begin adding tasks as they pick up the work. If your team is already at its bet capacity, activation is blocked and an inline message explains why — complete or kill another active bet first.

**Troubleshooting:**
- Create button stays disabled — the description field is required.
- No team in the select — refresh the page; the seeded team may not have loaded.

---

## 7. Watch an agent session

Once a Bet is active, the agents on your Team pick up its tasks and start sessions. When an agent's work needs your decision, a review thread appears in **Conversations**.

**Troubleshooting — no session starts after activating a Bet:**
- Confirm your API key is set (Settings → Credentials or `ANTHROPIC_API_KEY`) and the server was restarted if you changed the environment.
- Check server terminal output for `no API key` or `401 Unauthorized`.
- Confirm Bet status is `active`, not `draft`.

---

## 8. Review the output

Click **Conversations** in the sidebar. Threads with an unresolved review sort to the top.

An unresolved review shows in the conversation as a review card with an **Open review** link. Click it to open the review page, which shows exactly what the agent produced and the decision actions:

- **Approve** and **Request changes** are the primary buttons.
- **Approve with comments**, **Edit**, and **Reject** live in the overflow menu.

Approve work that looks correct. Request changes if something is wrong — add a comment describing the fix. The agent resumes automatically after your verdict. The full decision grammar: [Three Core Views](./three-core-views.md).

---

## What's next

| Goal | Where to go |
|------|-------------|
| Understand how agents work | [Agents](./agents.md) |
| Daily rhythm and troubleshooting | [Running Your Team](./running-your-team.md) |
| Knowledge layer | [Three Core Views](./three-core-views.md) |
| Interface reference | [The Interface](./the-interface.md) |
| Connect backends and credentials | [Connections](./connections.md) |
| Deploy to a server | [Deployment](./deployment.md) |
| Settings reference | [Settings](./settings.md) |
