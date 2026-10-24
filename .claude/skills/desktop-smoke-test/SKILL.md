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
- **Desktop DEV mode (`npm run dev:desktop`) cannot load a seeded world.** Electron loads `src/preload.js` outside tsx; the bundle only emits `dist/preload.js`, so the dev window has no API key and 401s no matter what is in the DB. Dev desktop is for shell/render work only — test data-backed desktop via `build:local` + the packaged app.
- **A leftover HyperIdle holds the single-instance lock.** A fresh launch then exits silently (exit 0, no window, no error line in the log). `pgrep -fl HyperIdle` before launching; kill stragglers (often a packaged app left over from another worktree's smoke test — it also holds the DB lock).

## The real userData / DB / logs live under `@hyperidle/desktop`, NOT `HyperIdle`

`app.getName()` resolves to the **package name**, so the packaged app uses:
- DB + config: `~/Library/Application Support/@hyperidle/desktop/` (PGlite dir `…/hyperidle-pg`, `secrets.json` holds the API key)
- Logs: `~/Library/Logs/@hyperidle/desktop/server.log` (appended forever — filter to today; old entries are stale)

Seeding demo data into `~/Library/Application Support/HyperIdle/…` does nothing. If you want the Northwind demo world, seed into the `@hyperidle/desktop` dir **while the app is not running** (it holds the DB lock):
`npm run setup -- --demo --db-path "$HOME/Library/Application Support/@hyperidle/desktop/hyperidle-pg"`.
Often the dir already holds real accumulated data — treat existing data as **read-only**; only add clearly-labeled test entities and clean them up.

### Wiping / fresh-state behavior

- To wipe: quit the app (it holds the DB lock — `osascript -e 'quit app "HyperIdle"'`, then `kill -9` the PIDs of any survivors you found with `pgrep -fl HyperIdle`), then **move `hyperidle-pg` aside as a timestamped backup** (`mv hyperidle-pg hyperidle-pg.bak-$(date +%Y%m%d-%H%M%S)`) rather than hard-deleting — reversible, and preserves the user's real accumulated data. Keep `secrets.json`. Also move `config.json` aside if the app was joined to a server (it then opens the server instead of its own database).
- **A wiped (factory) DB boots into first start (`/start`), not the app.** This is the surface to test: "Found on this computer" lists the agent programs (Claude Code, Codex, OpenCode, Cursor Agent) each marked signed in / installed / not installed, with how to fix one and **Look again**; then **Your name** and **Name your team**, and **Start talking**. At least one program must be signed in for Start talking to work. It makes you, the team and a first agent, **Builder**, and lands in the conversation "Getting started" with Builder's hello and **Connect a folder / Connect GitHub / Not now**. No API key is ever typed. **Join a team on a server instead** asks for an address and a key — do not join a real server from a smoke test.
- **`--demo` seeds a person too, so it SKIPS first start** and boots straight into Northwind: Finn Olsen (you, in Product and Support) and Maya Chen, agents Builder, Growth and Designer, Facilitation from the Team habits plugin, the task "Trials that convert without a call" with its parts graph, the conversation "Trial-end confusion, three tickets" with a two-round review, the knowledge tree with "How we price", and unread notifications. Every core surface has something to look at and click. The desktop app runs agents on the signed-in programs, so **@-mentioning or handing work to an agent starts a real session** — do it once on purpose for the wedge, not by accident.

### Reaching surfaces with no address bar

The packaged app has no address bar, so every page is reached by clicking: the sidebar (Conversations / Work / Knowledge, Work's team switch and "The team ›", You at the bottom), rows inside pages, and "Look at it" on a review in its thread (the review opens at `/conversations/<thread>?review=<message id>`). A plugin's page opens from the team page.

### computer-use keyboard gotcha (macOS key-window theft)

Character typing goes to whatever holds the macOS **key window**, which can silently become a background **Terminal.app** (its Dock icon shows a badge as your keystrokes land there) even while HyperIdle is frontmost and clickable. Symptoms: clicks work, but `type`/`key`(Escape) never reach the webview; a command-palette modal (⌘K) then can't be dismissed (Escape dead, no backdrop light-dismiss) — deadlock. `⌘K`/`⌘R` still fire because they're app accelerators, not DOM input. Mitigations, in order: (1) prefer click-only checks where a write is not needed; (2) app-menu open→click-body to force key focus (unreliable); (3) **relaunch the app** to reset the modal + focus. The app's own inline page inputs (first start, the chat box, the document editor) DO accept typing when HyperIdle holds key focus — so a typing failure is the environment, not an app defect. Don't type real credentials into any field regardless.

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

**Surface checklist** (addresses in `layers/core-ui/src/App.tsx`):

| Surface | What to verify |
|---|---|
| Window | Opens on the Paper canvas (light `#faf8f4` or dark `#141310`, following the computer); the splash matches; no dark flash in light mode. The app menu has no Settings item; Help has Open Logs Folder / Open Data Folder. |
| Sidebar | Find or ask… ⌘K, the bell (Notifications panel, Mark all read), Conversations / Work / Knowledge switch the list, Work's team switch and "The team ›", "You · N waiting for you". |
| Conversations | Thread list → open a thread (messages, chat box with the format bar, @ picker). "+ New conversation". |
| Review | From "Trial-end confusion, three tickets", "Look at it" → parts, flags as pins, the questions list, round 1 link; add a comment pin (write path); Approve / Reject needs a reason. |
| Work (task) | Open "Trials that convert without a call": parts graph, click a part and "‹ The whole task", decisions and assumptions, Done when, summary, conversation; the box (Follow, Put on hold / Take off hold, Stop / Start again, Ask for a review). |
| Knowledge | The tree with team spaces → open a document: Edit / Done, format bar, a comment in the margin, Publish, Follow; + adds a document; change an icon. |
| Your page | "You" → Waiting for you / Started by you; the box: Works in, Can reach, Notifications switches (toggle one and restore it — write path), About, This app, Agent programs (Look again), Looks (switch Light / Dark and restore). There is no settings screen. |
| Agent page | Open Builder from a list or the team page: open tasks, Edit (dialog), Pause / Let it work (restore), Starts working when. |
| Team + plugins | "The team ›" → people with their agents, agents of every team, the team's plugins → open Team habits: how it stands, what it added, Switch off / on (restore). |
| First start | Only on a wiped DB (above). |
| The wedge | Once, on purpose: @ an agent in a conversation with a small piece of work → it replies, the task shows in the thread and in Work. |

**Computer-use tips:** after a dropdown selection or navigation, a `type` often lands nowhere — click firmly **inside** the field and re-type; verify with a screenshot before submitting. Prefer `computer_batch` only when the outcome is predictable; otherwise screenshot between steps.

## Phase 4 — Prove writes + scan for errors

- After any write (comment, switch, pause, publish, verdict), confirm via re-render AND either the embedded API (`curl -X POST -H "X-API-Key: <secrets.json apiKey>" -H "Content-Type: application/json" http://127.0.0.1:<port>/api/actions/<action> -d '{…}'`, e.g. `open_thread`, `open_task`, `open_document`, `open_user`) or the log.
- Watch for live wiring: a change made in one place shows in the sidebar and on other open pages without a reload (the WebSocket topics).
- Final error sweep — must be zero unhandled:
  `awk '/<today boot ts>/{f=1} f' ~/Library/Logs/@hyperidle/desktop/server.log | grep -iE "ERROR|Unhandled|did-fail|render-process-gone|FATAL|renderer console"`
  Note: a controlled `ApiError(500,…)` returned to the client (e.g. a bad id) may not appear as an `ERROR` line — catch those by clicking, not just by grepping.

## Phase 5 — Report

Summarize per surface: **works / broken / not-reached**, with a screenshot reference and, for each failure, the reproduced evidence (HTTP code + server message) and whether it's a **refactor regression** or **pre-existing** (check `git log`/`grep` for the symbol — legacy data in the user's DB that no current code produces is pre-existing, not a regression). Do not call the app "verified" on green logs alone — green proves it didn't crash, not that each surface rendered its data.
