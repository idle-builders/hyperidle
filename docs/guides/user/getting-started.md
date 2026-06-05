## Getting Started

You'll go from zero to HyperIdle running locally, with a Team, a Bet, and agents ready to work. This guide uses the embedded PGlite database — no external database required.

**Time: 10 minutes.** In the last step you will see an agent session produce output on a task you defined.

---

### Prerequisites

- **Node.js 24 or later.** Check with `node --version`. Install from [nodejs.org](https://nodejs.org) if needed.
- **Git.** Check with `git --version`.
- **An Anthropic API key.** Agents use the Claude API to do their work. Get one at [console.anthropic.com](https://console.anthropic.com). Your key starts with `sk-ant-`. Do not commit your API key to version control.

> If you do not have an Anthropic API key, you can still install and explore the interface. Agents will not produce output until the credential is provided after setup.

---

### Step 1: Clone and install

```bash
git clone https://github.com/ambrovia/hyperidle.git
cd hyperidle
npm install
```

**What you should see:** npm installs all workspace dependencies across the monorepo. No errors. The last line is something like `added N packages`.

**Troubleshooting:**
- `ENOENT` or `command not found: npm` — Node.js is not installed or not on your PATH.
- Network errors — check your internet connection; if behind a proxy, set `npm config set proxy`.

---

### Step 2: Set up the database

```bash
npm run setup -- --profile laptop
```

The `--` before `--profile` is required — it separates npm's own arguments from the setup script's arguments.

**What you should see:**

```
[setup] Profile: laptop (db=pglite)
[setup] Ready. PGlite data at /path/to/hyperidle/hyperidle-pg
[setup] Next: run `npm run dev` to start the server and web app.
```

This creates a PGlite data directory at `hyperidle-pg/` in the repo root, runs all schema migrations, and seeds the database with an example Team ("Nimmly"), a Chief of Staff agent, a Product Manager agent, and a Builder agent.

**Troubleshooting:**
- `--db-path must not contain '..' segments` — your working directory contains `..` in its resolved path. Use the `--db-path` flag to specify an absolute path: `npm run setup -- --profile laptop --db-path /Users/you/hyperidle-data`.
- `--db-path parent directory is not writable` — the repo directory is read-only. Run the command in a directory you own.
- Re-running `npm run setup` on an existing database is safe — all inserts use `onConflictDoNothing`.

---

### Step 3: Start HyperIdle

```bash
npm run dev
```

**What you should see:** Two processes start concurrently:

```
  ➜  Local:   http://localhost:5173/
server listening on http://localhost:3001
```

The web app is at [http://localhost:5173](http://localhost:5173). The API server runs on port 3001.

**Troubleshooting:**
- `EADDRINUSE: port 3001` — something else is using port 3001. Stop the conflicting process, or open `packages/server/src/index.ts` to find the port configuration.
- `EADDRINUSE: port 5173` — same issue for the Vite dev server. Vite will automatically try port 5174 and show the alternative URL in the terminal.

---

### Step 4: First-run setup

Open [http://localhost:5173](http://localhost:5173) in your browser.

HyperIdle detects this is a fresh install and redirects you to [http://localhost:5173/setup](http://localhost:5173/setup).

You'll see a card with three fields:

1. **Your name** (required) — enter your name, for example `Sam Chen`.
2. **Anthropic API key** (required) — paste your `sk-ant-...` key. The hint says "Your key stays on this device."
3. **Project folder** (optional) — a local path to a git repository for agents to work in, for example `/Users/sam/projects/my-app`. You can leave this blank for now.

Click **Start HyperIdle**.

**What happens:**
- A human user record is created for your name.
- A Team is created (named after the repo folder basename, or "My Team" if no folder was given).
- You are redirected to **Work > Portfolio** at `/work/portfolio`.

> **API key storage (browser only):** The Settings > Credentials panel is available in the desktop app only — in the browser it shows "Credential storage is available in the desktop app only." To supply your API key when running the server directly, set the `ANTHROPIC_API_KEY` environment variable before starting `npm run dev`:
> ```bash
> export ANTHROPIC_API_KEY=sk-ant-...
> npm run dev
> ```
> The server reads `ANTHROPIC_API_KEY` from the environment and passes it to agents automatically. Do not commit your API key to version control — add it to a `.env` file that is listed in `.gitignore`, or set it in your shell profile.

**Troubleshooting:**
- `Failed to create user` — the server is not running. Make sure `npm run dev` is still active in your terminal.
- The form stays on the page after clicking Start — check the browser console for error details.

---

### Step 5: Orient yourself

After setup you land on **Work > Portfolio**. Take 60 seconds to orient:

**Sidebar (left, 200px wide)** — labeled navigation with three sections:
- **Conversations** — review items and agent messages
- **Work** — your portfolio of Teams and Bets; expands to show your Teams as sub-items
- **Knowledge** — the factory's institutional memory

At the bottom of the Sidebar: a Search hint (or press `Cmd+K`), your avatar button (opens Settings), and an Assistant button (opens the Chief of Staff overlay).

**Main pane** — the content area. Right now it shows your Portfolio: a grid of Bet cards. Until you have bets, the page shows an empty state with a "New bet" button.

---

### Step 6: Create your first Bet

A **Bet** is a time-boxed chunk of work. It is the unit agents pick up and execute.

1. You are already on **Work > Portfolio** (the "All bets" page).
2. Click the **New bet** button in the page header. If no bets exist yet, the button also appears in the empty state in the centre of the page.
3. A dialog opens with:
   - A **Team** select (shown only when you have more than one team; otherwise the single team is used automatically).
   - A **Description** text area (required) — describe what you want built, for example: `Build a landing page with a hero section and a features list.`
   - A **Title preview** line that auto-derives a short title from your description.
4. Click **Create**.

**What you should see:** The dialog closes and the new Bet appears as a card in the portfolio grid. Its status is `draft`.

To make agents start working, open the Bet card and change its status to `active` using the action menu.

**Troubleshooting:**
- The Create button stays disabled — the description field is required and must be non-empty.
- No team appears in the select — the team seeded during setup may not have loaded. Refresh the page.

---

### Step 7: Watch an agent session

Once a Bet is active, the agents assigned to your Team pick up Tasks. This requires your Anthropic API key to be set and valid.

If you have not set the API key yet:
- **Browser (server mode):** Stop the server, set `ANTHROPIC_API_KEY` in your environment, and restart `npm run dev` (see Step 4 for details).
- **Desktop app:** Click your avatar at the bottom of the Sidebar to open Settings, navigate to **Credentials**, and set your Anthropic API key there.

After the key is set and a Bet is active:
- The Builder agent detects the active Bet and starts a Session.
- When the agent needs your approval (for a code change, a deployment action, etc.) a review item appears in **Conversations**.

**What you should see in Conversations:** An artifact card showing exactly what the agent produced — a code diff, a file listing, or a written deliverable — with an action bar: Approve / Request Changes / Reject.

**Troubleshooting — no agent session starts after activating a Bet:**
- Verify `ANTHROPIC_API_KEY` is set in the server environment and the server was restarted after setting it.
- Check the server terminal output for errors like `no API key` or `401 Unauthorized`.
- Confirm the Bet status is `active`, not `draft` — agents only pick up active Bets.

---

### Step 8: Review the output

Click **Conversations** in the Sidebar.

The queue shows all items waiting for your decision. Each item has:
- A thread title describing what is being reviewed.
- An artifact view showing the exact change or output.
- A verdict toolbar.

Most reviews take 15–30 seconds. Approve work that looks correct. Request changes if something is wrong — add a comment describing what to fix. The agent resumes automatically after your verdict.

The **Chief of Staff** thread (pinned at the top) surfaces cross-Team patterns and coaching suggestions. Check it once a week.

---

### What's next

Now that you have HyperIdle running, explore by topic:

| Goal | Where to go |
|------|-------------|
| Understand how agents work | [Agents](./agents.md) |
| Daily review rhythm | [Daily Rhythms](./daily-rhythms.md) |
| Knowledge layer | [Three Core Views](./three-core-views.md) § Knowledge |
| Interface reference | [The Interface](./the-interface.md) |
| Cost controls | [Cost Management](./cost-management.md) |
| Deploy to a server | [Deployment](./deployment.md) |
| Configure agent autonomy | [Settings](./settings.md) |
