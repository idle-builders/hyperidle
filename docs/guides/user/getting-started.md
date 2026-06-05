## Getting Started

You'll go from zero to HyperIdle running locally, with a Team, a Bet, and agents ready to work. This guide uses the embedded PGlite database — no external database required.

**Time: 10 minutes.** The aha moment — watching an agent pick up a task you defined — comes in the last step.

---

### Prerequisites

- **Node.js 24 or later.** Check with `node --version`. Install from [nodejs.org](https://nodejs.org) if needed.
- **Git.** Check with `git --version`.
- **An Anthropic API key.** Agents use the Claude API to do their work. Get one at [console.anthropic.com](https://console.anthropic.com). Your key starts with `sk-ant-`.

> If you do not have an Anthropic API key, you can still install and explore the interface. Agents will not produce output until the credential is set in Settings after setup.

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

> **API key storage note:** When running in the browser, the API key field in the setup form accepts your key but it is stored via the Electron bridge, which is only available in the desktop app. In the browser, complete setup, then go to Settings > Credentials and set your Anthropic API key there so agents can use it.

**Troubleshooting:**
- `Failed to create user` — the server is not running. Make sure `npm run dev` is still active in your terminal.
- The form stays on the page after clicking Start — check the browser console for error details.

---

### Step 5: Orient yourself

After setup you land on **Work > Portfolio**. Take 60 seconds to orient:

**Icon Rail (left sidebar)** — four navigation icons from top to bottom:
- Conversations — review items and agent messages
- Work — your portfolio of Teams and Bets
- Knowledge — the factory's institutional memory
- Avatar (bottom) — Settings

**Rail (right sidebar, always visible)** — a heads-up display showing blocked agents, cost burn rate, unread count, and active Bet progress.

**Main pane** — the content area. Right now it shows your Portfolio: a status card for the "Nimmly" Team seeded during setup. Click it to open the Team view.

---

### Step 6: Create your first Bet

A **Bet** is a time-boxed chunk of work with a done condition. It is the unit agents pick up and execute.

1. In Work > Portfolio, click the **Nimmly** Team card (or your Team if you named it differently).
2. You are now in the **Team view**, showing a Canvas (top) and a Kanban board (bottom).
3. Click the **+** button to open the pitch form.
4. Fill in a description, for example: `Build a landing page with a hero section and a features list.`
5. Set a done condition, for example: `The page renders at /landing with valid HTML and no console errors.`
6. Click **Create**.

**What you should see:** The Bet appears as a card in the Canvas section. Its status is `draft`.

To make agents start working, commit the Bet: drag it from the Canvas into the active area, or use the Bet's action menu to change its status to `active`.

**Troubleshooting:**
- The + button is not visible — you may need to scroll up to the top of the Canvas section.
- The Bet creation form shows a validation error — the description field is required and must be non-empty.

---

### Step 7: Watch an agent session

Once a Bet is active, the agents assigned to your Team pick up Tasks. This requires your Anthropic API key to be set and valid.

In the browser, set the key now if you have not already:
1. Click your avatar in the Icon Rail to open Settings.
2. Navigate to **Credentials**.
3. Enter your `sk-ant-...` key next to "Anthropic API Key" and save.

After the key is set:
- The Builder agent detects the active Bet and starts a Session.
- Sessions appear in the **Rail** — you'll see a spinning indicator and a cost counter.
- When the agent needs your approval (for a code change, a deployment action, etc.) a review item appears in **Conversations**.

**What you should see in Conversations:** An artifact card showing exactly what the agent produced — a code diff, a file listing, or a written deliverable — with an action bar: Approve / Request Changes / Reject.

Use keyboard shortcut `A` to approve, `R` to request changes, or `X` to reject.

---

### Step 8: Review the output

Click the **Conversations** icon in the Icon Rail.

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
