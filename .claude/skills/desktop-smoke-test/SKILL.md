---
name: desktop-smoke-test
description: "Build the packaged HyperIdle desktop (Electron) app from the current branch and manually drive it through every core surface with computer-use, proving the app still works after a refactor. Use when asked to build + manually test the desktop app, smoke-test a branch in the real app, or verify a large refactor didn't break the running product. Native app → computer-use (not the browser). Reusable, founder-invoked."
argument-hint: "[surfaces to focus | 'all' (default)]"
user-invocable: true
min_tool_calls: 16
---

# Desktop Smoke Test

Prove the **packaged desktop app** built from the current worktree still works end to end, by building it and driving the real window with **computer-use** (it is a native Electron app, not a web page — the in-app Browser/Chrome MCPs cannot reach it). This is a paint-and-click smoke test: boot the app, exercise each surface, watch for 500s / blank states / crashes, and read the logs.

**Never claim a surface works without looking at the painted output** (screenshot) AND, where a write is involved, confirming persistence (re-render or API/log). Reading source is not a test here.

---

## Environment gotchas (learned the hard way — check every time)

- **Node 24 is required** (`engines: >=24`). The default shell `node` is often v22. Prefix every build/setup command with `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"`. Without it, `npm ci`/electron-builder fail with phantom errors.
- **This is a worktree** — it has no `node_modules` until you `npm install` (Node 24). A rebased worktree needs a fresh install before you trust anything.
- **Electron's binary is often not downloaded** even after `npm install` (empty `node_modules/electron/dist/`). Run `node node_modules/electron/install.js` once to fetch it, or electron-builder and `electron .` both fail.
- **electron-builder can't resolve a caret Electron version in a monorepo.** `electron` is hoisted to the ROOT `node_modules`, so electron-builder run from `applications/desktop/` sees only `"^43.x"` and dies with *"Electron version … is a range"*. Pass the exact version explicitly: `-c.electronVersion="$(node -p "require('electron/package.json').version")"`. `applications/desktop/__scripts__/build-local.sh` now does this — if it regressed, that's the fix.
- **`scripts/` was renamed to `__scripts__/`** (prod/dev world split). Any `applications/desktop/scripts/…` path in a shell script is stale — the real dir is `__scripts__/`.

## The real userData / DB / logs live under `@hyperidle/desktop`, NOT `HyperIdle`

`app.getName()` resolves to the **package name**, so the packaged app uses:
- DB + config: `~/Library/Application Support/@hyperidle/desktop/` (PGlite dir `…/hyperidle-pg`, `secrets.json` holds the API key)
- Logs: `~/Library/Logs/@hyperidle/desktop/server.log` (appended forever — filter to today; old entries are stale)

Seeding demo data into `~/Library/Application Support/HyperIdle/…` does nothing. If you want the "Acme" demo world, seed into the `@hyperidle/desktop` dir **while the app is not running** (it holds the DB lock):
`npm run setup -- --demo --db-path "$HOME/Library/Application Support/@hyperidle/desktop/hyperidle-pg"`.
Often the dir already holds real accumulated data — treat existing data as **read-only**; only add clearly-labeled test entities and clean them up.

---

## Phase 1 — Build the packaged app

```bash
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
cd <worktree-root>
npm install                                   # if node_modules missing
node node_modules/electron/install.js          # if node_modules/electron/dist/ is empty
npm run -w @hyperidle/desktop build:local       # → applications/desktop/release/mac-arm64/HyperIdle.app (+ dmg)
```

`build:local` = build web SPA → esbuild bundle (`dist/main.cjs`) → electron-builder unsigned. Verify the output:
- `release/mac-arm64/HyperIdle.app/Contents/MacOS/HyperIdle` exists
- `…/Contents/Resources/web-dist/index.html` exists (SPA packaged)
- `…/Contents/Resources/drizzle/*.sql` exists (migrations packaged)

## Phase 2 — Launch and confirm a clean boot

```bash
open applications/desktop/release/mac-arm64/HyperIdle.app
```

Then read today's log lines and require a clean boot sequence:
`grep "$(date +%F)" ~/Library/Logs/@hyperidle/desktop/server.log | tail -40`
Expect: `migrations complete` → `factory bootstrap complete` → `static dir … exists:true` → `server listening {port}` → `preload … exists:true` → `health check passed` → `loading app http://127.0.0.1:<port>` (production; NOT `localhost:5173` — that's a dev run). Note the port; the embedded API is at `http://127.0.0.1:<port>/api` with the key from `secrets.json`.

## Phase 3 — Grant computer-use and drive the app

1. `request_access(["HyperIdle"])` — the app must already be **running** to be matchable (it lives in the build dir, not `/Applications`, so Spotlight won't find it otherwise). Native app → **full** tier.
2. Load computer-use tools via ToolSearch (`{query:"computer-use", max_results:30}`) if deferred.
3. Screenshot, then click through **every** surface. Screenshot after each navigation and actually read it.

**Surface checklist** (routes in `layers/core-ui/src/router.tsx`):

| Surface | What to verify |
|---|---|
| Work → Teams | list renders; click each team → detail (capacity, status, bets, routines, agents roster). A clickable row that 500s is a bug. |
| Bet detail | open a bet; **create a labeled test bet** (write path → persists, re-renders); **kill it** (state transition + reason modal). Clean up. |
| Task detail | open a task under a committed bet if present. |
| Conversations | thread list → open a thread (messages render, composer present). Avoid sending (spawns a real LLM session). |
| Knowledge | list + filters/sort → open an item (body, metadata sidebar, discussion, backlinks). |
| Agent profile | open an agent → config, harness capabilities, review track record, performance. |
| Settings | Profile, Org chart, Agents, Agent behavior, Filesystems, Appearance, Credentials, Notifications, Backend. Toggle **theme** (live write path) and restore it. |
| Notifications | opens without error. |

**Computer-use tips:** after a dropdown selection or navigation, a `type` often lands nowhere — click firmly **inside** the field and re-type; verify with a screenshot before submitting. Prefer `computer_batch` only when the outcome is predictable; otherwise screenshot between steps.

## Phase 4 — Prove writes + scan for errors

- After any create/kill/toggle, confirm via re-render AND either the embedded API (`curl -H "X-API-Key: <secrets.json apiKey>" http://127.0.0.1:<port>/api/…`) or the log.
- Watch for reactive wiring: e.g. killing a bet fires the **Post-bet retro** routine and flips an agent to `active` — confirms event-bus → routine → dispatch works.
- Final error sweep — must be zero unhandled:
  `awk '/<today boot ts>/{f=1} f' ~/Library/Logs/@hyperidle/desktop/server.log | grep -iE "ERROR|Unhandled|did-fail|render-process-gone|FATAL|renderer console"`
  Note: a controlled `ApiError(500,…)` returned to the client (e.g. a bad team) may not appear as an `ERROR` line — catch those by clicking, not just by grepping.

## Phase 5 — Report

Summarize per surface: **works / broken / not-reached**, with a screenshot reference and, for each failure, the reproduced evidence (HTTP code + server message) and whether it's a **refactor regression** or **pre-existing** (check `git log`/`grep` for the symbol — legacy data in the user's DB that no current code produces is pre-existing, not a regression). Do not call the app "verified" on green logs alone — green proves it didn't crash, not that each surface rendered its data.
