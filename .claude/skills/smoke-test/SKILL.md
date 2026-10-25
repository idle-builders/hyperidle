---
name: smoke-test
description: "Launch HyperIdle and manually smoke-test its core surfaces by driving the running app in a browser — verify every route renders, core interactions work, data persists, and the console/network are clean. Lightweight regression check after a refactor, dependency bump, or big merge. Complements /product-deep-review (deep, Fable, coverage-tracked); this is the fast does-it-still-run pass."
argument-hint: "[all | <route or surface> | conversations | review | work | knowledge | people | plugins | find | start]"
user-invocable: true
min_tool_calls: 12
---

# Smoke Test

Fast, human-in-the-loop-free regression pass: **start the real app and drive it** to confirm every core surface still renders, its primary interaction still works, and nothing throws in the console or 500s on the network. Use it after a large refactor, a dependency upgrade, or any merge that "kept the app working on paper."

This is **not** `/product-deep-review` (deep value/visual audit on Fable, coverage-tracked across runs) nor the automated e2e suite. It is the "does it still run for a real user" pass, driven by the in-app browser, that catches wiring breaks the unit/e2e lanes miss.

**Argument** (`$ARGUMENTS`): a surface to scope to (`conversations`, `review`, `work`, `knowledge`, `people`, `plugins`, `find`, `start`), a concrete address, or `all` (default).

---

## Prerequisites

- **Node 24** — the repo requires `>=24`; the default shell node may be v22. Prefix every command:
  `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"` (running with v22 fails `npm ci` with phantom-lockfile errors).
- **Ports free**: dev binds **3001** (server) + **5173** (web). The Playwright e2e suite uses its own ports (3102/5182, 3103/5183), so the two do not collide.
- **Agents answering** needs at least one agent program (Claude Code, Codex, OpenCode, Cursor Agent) installed and signed in on this computer — see step 1.

## 1. Launch the app

Seed the demo world, then start the dev server in the background and keep its PID:

```bash
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
rm -rf hyperidle-pg && npm run setup -- --profile laptop --demo
npm run dev > /tmp/hyperidle-dev.log 2>&1 & echo $! > /tmp/hyperidle-dev.pid
```

Wait until both are up (server logs `remote-server running on http://localhost:3001`, vite logs `Local: http://localhost:5173`) with an `until grep` on `/tmp/hyperidle-dev.log`, then open the in-app browser (`mcp__Claude_Browser__preview_start` with `url: http://localhost:5173`, or `navigate`).

The demo world is Northwind: Finn Olsen (you, in Product and Support) and Maya Chen, their agents Builder, Growth and Designer, Facilitation from the Team habits plugin, the task "Trials that convert without a call", the conversation "Trial-end confusion, three tickets", and the knowledge tree with "How we price". Without `--demo` a fresh database opens first start at `/start` and every list is empty, which hides most regressions.

**`npm run dev` runs no agents** (its server starts with no agent programs), so a message to an agent waits in the queue. To see agents answer — the wedge in step 3 — start the server the way the desktop app does instead of `npm run dev`:

```bash
DATABASE_URL=$PWD/hyperidle-pg HYPERIDLE_API_KEY=hyperidle-dev-local node --import tsx --input-type=module -e "await (await import('@hyperidle/remote-server/create-server')).createServer(3001, { topology: 'local' })" > /tmp/hyperidle-server.log 2>&1 & echo $! > /tmp/hyperidle-server.pid
npm run -w @hyperidle/core-ui dev > /tmp/hyperidle-web.log 2>&1 & echo $! > /tmp/hyperidle-web.pid
```

or run the desktop app (`/desktop-smoke-test`).

## 2. Drive the core surfaces

Address table (from `layers/core-ui/src/App.tsx` — re-read it; addresses move). One sidebar on every page: Find or ask (⌘K), the bell, Conversations / Work / Knowledge, the list for the chosen one, and You at the bottom.

| Surface | Address (demo world) | Primary thing to verify |
|---|---|---|
| Sidebar | any | Conversations / Work / Knowledge switch the list; Work's team switch and "The team ›"; the bell opens Notifications; "You · N waiting for you" opens your page |
| Conversations | `/conversations/demo-thread-trial-end`, `/conversations/new` | Thread renders; **send a message**; @ picker lists people and agents; a new conversation gets its first line as title |
| Review | `/conversations/demo-thread-trial-end?review=demo-msg-explainer-review-2` | Parts, the agent's flags as pins, the questions list, the link back to round 1; a comment pin; Approve or Reject (with a reason) |
| Work (task) | `/work/demo-task-trials` | The parts graph; clicking a part puts `?part=` in the address; decisions and assumptions, Done when, summary, conversation; the box (Follow, hold, Stop / Start again, Ask for a review) |
| Knowledge | `/knowledge/demo-doc-ten-days`, `/knowledge/demo-doc-how-we-price` | View and Edit mode, the format bar, / and @, saving; a comment in the margin; Publish / Follow; + in the tree adds a document |
| Your page | `/people/me` | Waiting for you; the box: Works in, Can reach, Notifications switches, About, This app, Agent programs (Look again), Looks (Light / Dark / Like this computer). There is no settings screen |
| Agent page | `/people/demo-agent-builder` | Open tasks; Edit and Pause / Let it work; Starts working when; a dialog opens and saves |
| Team | `/teams/Product` | People with their agents, agents of every team, Add someone, the team's plugins |
| Plugin | from the team page, open Team habits (`/plugins/<id>`) | How it stands, what it added; Switch off / on |
| Find or ask | ⌘K anywhere | Find lists knowledge, conversations and work with the matching text; Tab switches to Ask |
| First start | `/start` on an empty database (setup without `--demo`) | Agent programs found, Look again, your name and the team's, Start talking lands in "Getting started" |

For **each** surface in scope:

1. **Navigate** (`mcp__Claude_Browser__navigate`). Prefer clicking through the sidebar where possible — dead links are a common refactor break.
2. **Read the painted result** — `read_page` (accessibility tree, cheap) or a `computer` screenshot. Do not conclude "works" from source; look at the render.
3. **Exercise the primary interaction** for that surface (send a message, comment on a review, edit a document, switch a notification). Confirm it **persists** on reload.
4. **Check for errors** every surface: `read_console_messages` (`onlyErrors: true`) and `read_network_requests` (look for 4xx/5xx on `/api/actions/*`). A clean render over a 500 is still a failure. A failed read shows one "did not load" line with Try again.

## 3. The wedge (do this even in a scoped run)

HyperIdle's core loop is **hand off → watch it move → check the result**. The single most important journey: in a conversation, **@ an agent with a piece of work and get a real reply**, the task it starts showing in the thread. This needs the server started with `topology: 'local'` (step 1) and a signed-in agent program. If that breaks, the product is down regardless of what else renders.

## 4. Report

- **Per surface**: ✅ renders + primary interaction works, ⚠️ renders but degraded (console errors, slow, missing data), or ❌ broken (blank, crash, 500, dead link) — each with the address, what you did, what happened, and a screenshot/console excerpt as proof.
- **Triage**: separate refactor-introduced breaks from what was already broken — compare with `origin/main` before calling something new.
- If a break is real, spin a worktree off `origin/main` for the fix (never fix on main). Don't hand-wave — a break without a repro is not a finding.

## Teardown

Stop only the processes you started, by PID: `kill $(cat /tmp/hyperidle-dev.pid)` (or the server/web PIDs), so nothing holds 3001/5173. Never a broad `pkill`.

## Notes / lore

- With the demo world, a populated surface that renders blank is a data-wiring break, not "no data".
- The web app authenticates to the server with `HYPERIDLE_API_KEY`; in dev both default to `hyperidle-dev-local`. A wall of 401s in the network log means the key didn't reach the web build.
- Re-read the address table from `App.tsx` each run.
