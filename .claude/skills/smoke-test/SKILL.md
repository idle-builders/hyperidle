---
name: smoke-test
description: "Launch HyperIdle and manually smoke-test its core surfaces by driving the running app in a browser — verify every route renders, core interactions work, data persists, and the console/network are clean. Lightweight regression check after a refactor, dependency bump, or big merge. Complements /product-deep-review (deep, Fable, coverage-tracked); this is the fast does-it-still-run pass."
argument-hint: "[all | <route or surface> | conversations | work | knowledge | agents | settings | setup]"
user-invocable: true
min_tool_calls: 12
---

# Smoke Test

Fast, human-in-the-loop-free regression pass: **start the real app and drive it** to confirm every core surface still renders, its primary interaction still works, and nothing throws in the console or 500s on the network. Use it after a large refactor, a dependency upgrade, or any merge that "kept the app working on paper."

This is **not** `/product-deep-review` (deep value/visual audit on Fable, coverage-tracked across runs) nor the automated e2e suite. It is the "does it still run for a real user" pass, driven by the in-app browser, that catches wiring breaks the unit/e2e lanes miss.

**Argument** (`$ARGUMENTS`): a surface to scope to (`conversations`, `work`, `knowledge`, `agents`, `settings`, `setup`), a concrete route, or `all` (default).

---

## Prerequisites

- **Node 24** — the repo requires `>=24`; the default shell node may be v22. Prefix every command:
  `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"` (running with v22 fails `npm ci` with phantom-lockfile errors).
- **`.env` present** at repo root (needs `DATABASE_URL`, `HYPERIDLE_API_KEY`, `OPENROUTER_API_KEY`). Copy from `.env.example` if missing.
- **Ports free**: dev binds **3001** (server) + **5173** (web). Do not run alongside the Playwright e2e suite — it also spawns `npm run dev` (server on 3001, web on its own port), so the two collide on 3001. Sequence them.

## 1. Launch the app

Start the dev server in the background and wait for web-ready:

```bash
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"; npm run dev > /tmp/hyperidle-dev.log 2>&1 &
```

Wait until both are up (server logs `listening on :3001`, vite logs `Local: http://localhost:5173`). Confirm with an `until grep` on `/tmp/hyperidle-dev.log`, then open the in-app browser (`mcp__Claude_Browser__preview_start` with `url: http://localhost:5173`, or `navigate`).

If the app redirects to `/setup` (first run / empty DB), complete the setup flow — it seeds the profile the rest of the surfaces need. Note in the report if a fresh DB was required.

**Demo data (recommended for a meaningful pass):** an empty DB makes every surface render its empty state, which hides most regressions. For a lived-in world, seed before `npm run dev`: `rm -rf hyperidle-pg && npm run setup -- --demo` — the app then boots straight into the Acme team (bets, threads with blocking reviews, knowledge triage, routines), and the local-mode auth logs you in as the demo founder. `--demo` is opt-in and idempotent; without it you get the honest empty shell.

## 2. Drive the core surfaces

Route table (from `layers/core-ui/src/router.tsx` — re-read it; routes move):

| Surface | Route | Primary thing to verify |
|---|---|---|
| Setup / onboarding | `/setup` | Flow completes, lands in app |
| Conversations | `/conversations`, `/conversations/:threadId` | Thread list loads; open a thread; **send a message and get a response** (the core loop) |
| Work overview | `/work` | Bets/portfolio render (not empty-by-bug) |
| Team | `/work/team/:teamId` | Team composition renders |
| Bet | `/work/bet/:betId`, `/work/bet/new` | Bet detail + create form |
| Task | `/work/bet/:betId/task/:taskId` | Task detail + request action |
| Routine | `/work/routine/:routineId` | Routine detail |
| Agent | `/agents/:agentId` | Agent profile + config |
| Knowledge | `/knowledge`, `/knowledge/new`, `/knowledge/:knowledgeId` | List, create, detail, edit |
| Artifacts | `/artifacts/:id` | Permalink renders |
| Settings | `?settings=open` overlay | Opens; theme toggle persists |

For **each** surface in scope:

1. **Navigate** (`mcp__Claude_Browser__navigate`). Prefer clicking through the real nav where possible — dead nav links are a common refactor break.
2. **Read the painted result** — `read_page` (accessibility tree, cheap) or a `computer` screenshot. Do not conclude "works" from source; look at the render.
3. **Exercise the primary interaction** for that surface (send a message, create a bet, edit a knowledge doc, toggle a setting). Confirm it **persists** on reload.
4. **Check for errors** every surface: `read_console_messages` (`onlyErrors: true`) and `read_network_requests` (look for 4xx/5xx). A clean render over a 500 is still a failure.

## 3. The wedge (do this even in a scoped run)

HyperIdle's core loop is **plan → interact → review → repeat**. The single most important journey: open/create a conversation, **send a message to an agent, and get a real streamed reply**. If that breaks, the product is down regardless of what else renders. Verify it end to end.

## 4. Report

- **Per surface**: ✅ renders + primary interaction works, ⚠️ renders but degraded (console errors, slow, missing data), or ❌ broken (blank, crash, 500, dead nav) — each with the route, what you did, what happened, and a screenshot/console excerpt as proof.
- **Triage**: separate refactor-introduced breaks from known baseline. Cross-check e2e's `layers/core-ui/__e2e__/known-pre-existing-failures.js` before calling something new.
- If a break is real, spin a worktree off `origin/main` for the fix and PR it (never fix on main). Don't hand-wave — a break without a repro is not a finding.

## Teardown

Kill the dev server (`pkill -f "npm run dev"` or the stored PID) so it doesn't hold 3001/5173.

## Notes / lore

- `@lore` the app never renders empty by design here — if a populated surface is blank, that's a data-wiring break, not "no data".
- The web app authenticates to the server with `HYPERIDLE_API_KEY`; a wall of 401s in the network log means the key/env didn't reach the web build.
- Re-read the route table from source each run — routes are renamed often (see the `@lore U6` redirects in `router.tsx`).
