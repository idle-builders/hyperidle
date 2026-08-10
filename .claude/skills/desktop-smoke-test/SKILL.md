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

### Wiping / fresh-state behavior (learned 2026-08-10, round 2)

- To wipe: quit the app (it holds the DB lock — `osascript -e 'quit app "HyperIdle"'`, then `kill -9` any survivors), then **move `hyperidle-pg` aside as a timestamped backup** (`mv hyperidle-pg hyperidle-pg.bak-$(date +%Y%m%d-%H%M%S)`) rather than hard-deleting — reversible, and preserves the user's real accumulated data. Keep `secrets.json`.
- **A wiped (factory) DB boots into the `/setup` ONBOARDING flow, not the app.** This is the surface to test: name + Anthropic API key + agent-harness picker (Built-in gateway / Claude Code / Cursor Agent / CLI codex / opencode — each shows readiness) + optional project folder + a "What are you building?" team-type picker (Software/Eng+UX/Full team/Growth/Custom, previews the roles it creates). "Start HyperIdle" seeds a founder + team + agents + routines and lands in Work. Use a **fake** key (`sk-ant-…`) — onboarding stores it without a live validation call, so a dummy value completes the flow (never type a real credential).
- **`--demo` seeds a founder too, so it SKIPS onboarding** and boots straight into the Acme team. But the demo world is minimal: 1 draft "daily-digest anchor" bet, its 1 anchor task, 1 knowledge item ("Boil the Lake"), 1 routine — and **all credentials are `absent`**, so agents can't run and won't auto-generate tasks/reviews/artifacts.

### Reaching data-detail surfaces when agents can't run (no credential) — seed via the embedded API, open by mouse

The demo/factory world has no bets-with-tasks, no artifacts, no reviews. Rather than committing a bet (needs a live LLM credential), **write the entity through the embedded API, then click into it** (read path is what you're proving):
- Task: `POST /api/tasks {betId,title,description?,doneCondition?}` → appears under the (active) bet's TASKS → click → `WorkTask` detail.
- Artifact: `POST /api/artifacts {producingTaskId,kind:"text",label?,preview:{kind:"text",body,format:"markdown"}}` → appears in the bet/task ARTIFACTS list → click → `ArtifactPermalink` (renders the markdown). Also exercises the AE6 artifact-kind + preview-schema path.
- Create a bet in the UI first (New bet → type description → Create → "…" menu → **Activate bet** = draft→active) so the task has an active parent that surfaces in the Work view. The empty-TASKS state only offers "Add an agent" (needs a credential) — there is no manual add-task button, hence the API seed.
- Review page (`work/bet/:betId/review/:reviewId` → `ReviewPage`): reviews only come from the agent `submit_review`/proposed-calls flow (session + credential), so none exist in a fresh seed. The GET has a **fixture path** — `GET /api/reviews/rev-1` returns a full fixture the page renders — but reaching `/review/rev-1` needs URL entry (no address bar in the packaged app). If no review is surfaced to click, verify the data path with the `rev-1` fixture curl + confirm `ReviewPage.tsx` compiles, and report it as data/nav-limited, not broken.

### computer-use keyboard gotcha (macOS key-window theft)

Character typing goes to whatever holds the macOS **key window**, which can silently become a background **Terminal.app** (its Dock icon shows a badge as your keystrokes land there) even while HyperIdle is frontmost and clickable. Symptoms: clicks work, but `type`/`key`(Escape) never reach the webview; a command-palette modal (⌘K) then can't be dismissed (Escape dead, no backdrop light-dismiss) — deadlock. `⌘K`/`⌘R` still fire because they're app accelerators, not DOM input. Mitigations, in order: (1) prefer the **API-seed-then-click** path above so you need no typing; (2) app-menu open→click-body to force key focus (unreliable); (3) **relaunch the app** to reset the modal + focus. The app's own inline page inputs (onboarding, bet composer) DO accept typing when HyperIdle holds key focus — so a typing failure is the environment, not an app defect. Don't type real credentials into any field regardless.

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
