## Getting Started

You'll go from zero to HyperIdle running locally, with a Team, a Bet, and agents producing output. This guide uses the embedded PGlite database — no external database required.

**Time: 10 minutes.** By the end you'll see an agent session respond to a task you defined.

---

### Prerequisites

- **Node.js 24 or later** — check with `node --version`. Install from [nodejs.org](https://nodejs.org).
- **Git** — check with `git --version`.
- **Anthropic API key** — agents use the Claude API. Get one at [console.anthropic.com](https://console.anthropic.com). Your key starts with `sk-ant-`. Do not commit it to version control.

> Without an API key you can still install and explore the interface. Agents won't produce output until the key is provided.

---

### 1. Clone and install

```bash
git clone https://github.com/ambrovia/hyperidle.git
cd hyperidle
npm install
```

**Expected:** npm installs all workspace dependencies. No errors. Last line: `added N packages`.

**Troubleshooting:**
- `command not found: npm` — Node.js is not on your PATH.
- Network errors — check your connection; if behind a proxy, set `npm config set proxy`.

---

### 2. Set up the database

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

This creates a `hyperidle-pg/` data directory, runs all schema migrations, and applies the factory bootstrap (system agents, facilitators, and factory settings). To start with a demo team pre-populated, add `--demo` (creates an example "Acme" team with assistant, Product Manager, and Builder agents).

**Troubleshooting:**
- `--db-path must not contain '..' segments` — specify an absolute path: `npm run setup -- --profile laptop --db-path /Users/you/hyperidle-data`.
- `--db-path parent directory is not writable` — the repo directory is read-only. Run from a directory you own.
- Re-running setup on an existing database is safe — all inserts use `onConflictDoNothing`.

---

### 3. Start HyperIdle

```bash
npm run dev
```

**Expected:** Two processes start:

```
  ➜  Local:   http://localhost:5173/
server listening on http://localhost:3001
```

The web app is at [http://localhost:5173](http://localhost:5173). The API runs on port 3001.

**Troubleshooting:**
- `EADDRINUSE: port 3001` — another process is using that port. Stop it, or find the port setting in `packages/server/src/index.ts`.
- `EADDRINUSE: port 5173` — Vite auto-tries port 5174 and shows the alternative URL.

---

### 4. Complete first-run setup

Open [http://localhost:5173](http://localhost:5173). HyperIdle detects a fresh install and redirects to `/setup`.

Fill in the three fields:

1. **Your name** (required) — for example, `Sam Chen`.
2. **Anthropic API key** (required) — paste your `sk-ant-...` key. The hint reads "Your key stays on this device."
3. **Project folder** (optional) — a local git repository path for agents to work in, for example `/Users/sam/projects/my-app`. Leave blank for now.

Click **Start HyperIdle**. A user record and Team are created; you land on **Work** (your team page, since you have one team).

#### Check your agent backends

After setup, open **Settings → Agent backends** to see which execution environments HyperIdle detected on this device. You'll see a row for each in-scope backend (Built-in, Claude Code, Codex, OpenCode) with a colored dot showing its current status.

- **Built-in** shows **green** if your Anthropic API key was accepted. This is sufficient to run agents immediately.
- Other backends (Claude Code, Codex, OpenCode) show **amber** if their CLI is not signed in. The row shows the sign-in command to run in a terminal. After signing in, click **Refresh** at the top of the section.

You do not need to enable additional backends to get started — the Built-in backend is always available and handles all Claude model calls. The other backends become useful when you want to route specific agents through a locally-authenticated CLI.

**Troubleshooting:**
- `Failed to create user` — the server isn't running. Check that `npm run dev` is still active.
- Form stays visible after clicking Start — check the browser console for error details.

#### API key in browser mode

The Settings > Credentials panel is only available in the desktop app. In the browser it shows "Credential storage is available in the desktop app only."

To supply the API key when running the server directly, set it as an environment variable before starting:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npm run dev
```

The server reads `ANTHROPIC_API_KEY` and passes it to agents. Use a `.env` file (listed in `.gitignore`) or your shell profile — do not commit the key.

---

### 5. Orient yourself

After setup you land on **Work** (your team page — with one team, the Work overview skips the list and takes you straight there). Take 60 seconds to orient.

**Sidebar (left panel)** — top to bottom:
- **Search field** at the very top, with an **Assistant button** (robot icon) to its right.
- **Three section buttons: Conversations / Work / Knowledge** — click to switch views. The active section's icon is brighter.
- **Fast-nav list** (below a separator) — shows the head of the active section's items: threads, teams, or knowledge items. Updates when you switch sections.
- **Settings** pinned at the bottom.

**Main pane** — shows your team. No bets yet means an empty state with a **New bet** button.

---

### 6. Create your first Bet

A **Bet** is a time-boxed chunk of work — the unit agents pick up and execute. There are two ways to create one.

**Option A — Talk to the Assistant (recommended for first-timers):**

1. Click the Assistant button at the bottom of the sidebar to open the overlay.
2. Describe your idea in plain language. For example: "I want to build a landing page with email signup."
3. The Assistant replies and drafts a bet derived from the conversation. A **BetCard** appears below the reply.
4. Click the card to open the draft bet in the authoring surface. Review, edit as needed, and commit.

This is the conversation-first path — you iterate with the Assistant until the bet looks right, then commit.

**Option B — Hand-type the bet:**

1. Click **New bet** in the Work overview header or in the team header (or in the empty-state centre if no bets exist yet).
2. A full-page authoring surface opens with:
   - **Description editor** (required) — write the bet's pitch using headings, lists, and paragraphs. For example: `Build a landing page with a hero section and a features list.`
   - **Title preview** — auto-derived from the first heading in your description.
   - **Team** select (in the Commitments aside) — shown only when you have more than one team; the single team is used automatically otherwise.
   - **Appetite** (optional) — set a cost budget for this bet.
3. Click **Create**.

**Expected:** You are navigated to the new Bet detail page. The Bet also appears as a `draft` card in the Team view.

To start agents, open the Bet and click **Commit**. The status flips from `draft` to `active`, and the team immediately begins planning tasks. If your team is already at its bet capacity, activation is blocked and an inline message explains why — complete or kill another active bet first.

**Troubleshooting:**
- Create button stays disabled — the description field is required.
- No team in the select — refresh the page; the seeded team may not have loaded.

---

### 7. Watch an agent session

Once a Bet is active, the agents assigned to your Team pick up Tasks. This requires a valid Anthropic API key (see [API key in browser mode](#api-key-in-browser-mode) if not yet set).

After the key is set and a Bet is active, the Builder agent detects the Bet and starts a Session. When the agent needs your approval — for a code change, a deployment action, or similar — a review item appears in **Conversations**.

**Expected in Conversations:** An artifact card showing exactly what the agent produced (code diff, file listing, or written deliverable) with an action bar: Approve / Request Changes / Reject.

**Troubleshooting — no session starts after activating a Bet:**
- Confirm `ANTHROPIC_API_KEY` is set and the server was restarted after setting it.
- Check server terminal output for `no API key` or `401 Unauthorized`.
- Confirm Bet status is `active`, not `draft`.

---

### 8. Review the output

Click **Conversations** in the Sidebar. The queue shows all items waiting for your decision.

Each item has:
- A thread title describing what is being reviewed.
- An artifact view showing the exact change or output.
- A verdict toolbar.

**Approve** work that looks correct. **Request changes** if something is wrong — add a comment describing the fix. The agent resumes automatically after your verdict. Most reviews take 15–30 seconds.

The **assistant** thread (pinned at the top) surfaces cross-Team patterns and coaching suggestions. Check it weekly.

---

### What's next

| Goal | Where to go |
|------|-------------|
| Understand how agents work | [Agents](./agents.md) |
| Daily review rhythm | [Daily Rhythms](./daily-rhythms.md) |
| Knowledge layer | [Three Core Views](./three-core-views.md) § Knowledge |
| Interface reference | [The Interface](./the-interface.md) |
| Cost controls | [Cost Management](./cost-management.md) |
| Deploy to a server | [Deployment](./deployment.md) |
| Configure agent autonomy | [Settings](./settings.md) |
