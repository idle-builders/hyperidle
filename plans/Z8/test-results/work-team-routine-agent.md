# Z8 Live Test Results — WORK: Team Detail, Routine Detail, Agent Profile (+ dialogs)

Live browser QA (Playwright Chromium headless, 1440x900) against running dev (web :5173, API :3001).
Script: `/Users/tg/hyperidle/test-team-routine.mjs`. Screenshots: `/tmp/test-team-routine/`.
Seed corrections: prompt-named agents `seed-agent-pf-build`/`seed-agent-cos` are NOT on the
`seed-product-1` roster. Real roster = `seed-agent-builder` (lead, builder) + `seed-agent-pm-nimmly`
(product_manager). `seed-agent-builder` used for AgentProfile/Edit tests. `seed-agent-cos` exists as
"System Agent" but is the routine owner, not a team member.

## Verdict table

| Flag | Claim | Test | Verdict | Evidence |
|---|---|---|---|---|
| **F1** | Cost over-counting (quadratic inflation of Bet/Total cost) | Seed has no completed sessions with cost events; could not exercise the cost_update accumulation path live. Static claim stands but un-triggered by seed. | **NOT REPRODUCED (no path)** | All cost fields $0.00; `betCostActual:null`, `costActual.minor:0` from `GET /api/teams/seed-product-1`. Quadratic path needs real harness cost events — absent in seed (F17). |
| **F2** | Routine scheduler never started; cron routines never auto-fire | UI-created routine `cron 0 * * * *`, `nextRunAt` stayed `null` after create; only manual Trigger fires. | **CONFIRMED** | `GET /api/routines/:id` after create → `nextRunAt:null`, run history only grew via manual Trigger Now. No automatic fire observed. |
| **F3** | UI-created routines lack `triggerConfig.taskId`; scheduler skips them; successful fire writes no run row | Created routine via RoutineCreateDialog, read its triggerConfig. | **CONFIRMED** | Created routine `triggerConfig = {"cron":"0 * * * *"}` — **no taskId** (seed `seed-routine-daily_digest` has `taskId`). Scheduler `checkAndFireRoutine` requires it ⇒ permanent skip. |
| **F4** | `routines.costActualMinor` never written → Cost always "—" | Team RoutineRow + Routine detail cost. | **CONFIRMED** | All 5 team routines render cost `—`; `GET /api/routines/:id` → `costActual:null` even after 2 triggers that produced `error` runs. RunRow cost column empty. |
| **F5** | `team_members.costCap*` no write path → Cap always "--", capPercent 0 | Team Burn vs Cap. | **CONFIRMED** | Rendered "CAP --"; `burn.costCap:null` in API; progress bar flat/gray (screenshot 01). |
| **F6** | Kernel-fallback Trigger leaves session active + run "running" forever; future triggers coalesce/brick | Triggered 3x, inspected sessions + run outcomes. | **PARTIALLY REFUTED (worse-ish)** | Sessions did NOT stick "active" — each trigger ended `outcome:"crashed"` (session state `crashed`), runs finalized to `error`. So no coalescing brick in dev (adapter path crashes immediately rather than kernel-fallback hanging). Triggers stayed `fired:true` each time, never `skipped`. Bricking not observed; instead every trigger crashes. |
| **F7** | RoutineCreateDialog agent filter `role!=="human"` wrong; humans could appear; roster not kind-filtered | Inspected dialog agent select; inspected roster. | **CONFIRMED (latent)** | Dialog agent select offered only the 2 AI roster members (no human on this team to expose it), so no human leaked here — but filter logic is `m.role!=="human"` while "human" is a `kind` not a `role`; `GET /api/agents` returns `kind:null` for all. A human roster member would leak. Latent, unexercised by seed. |
| **F8** | No refetch after RoutineCreate on WorkTeam | Created routine, checked page without reload. | **CONFIRMED** | New routine name NOT in team page DOM after create (`visible:false`); only appeared via API + reload. `onCreated` just closes dialog. |
| **F9** | Pause/Resume + Trigger Now use bare `fetch`, no X-API-Key → 401 in Electron (browser assumed safe) | Captured live request headers + status in browser. | **CONFIRMED — WORSE THAN CLAIMED** | In the **browser** both fired **401 Unauthorized**: `PATCH /api/routines/:id hasApiKey=false → 401`, `POST .../trigger hasApiKey=false → 401`. apiFetch does NOT auto-inject in browser; bare fetch = hard live failure, not Electron-only. Console shows two 401s. Delete (apiFetch) correctly sent key → 200. |
| **F10** | No error feedback on the 3 routine actions | Observed UI after 401 pause/trigger. | **CONFIRMED** | Pause button label unchanged ("Pause"→"Pause") after 401; routine state stayed `active`; no toast/alert. Trigger 401 produced no UI change or run-history refresh. Silent failure. |
| **F11** | GET /api/teams/:id has side-effect notification INSERT for error agents | Not directly asserted (no error-state agent at load; triggers later crashed agent). | **NOT VERIFIED** | Roster agents `idle/healthy` at initial team GET; side-effect path not entered during initial load. After crashes, builder shows error on profile but team-GET side-effect not separately measured. |
| **F12** | Team AgentRow "error" derivation differs from AgentProfile FE | Builder profile after 2 crashed sessions. | **PARTIALLY CONFIRMED** | AgentProfile showed banner "High failure rate: 100% in last 7 days. Last session crashed." + ERROR chip. Both broad+narrow conditions true here so divergence not isolated, but profile correctly reflects `lastSessionCrashed`. Divergence requires >50% fail + recent success — not constructed. |
| **F13** | Placeholder inconsistency ("---" vs "--" vs "—" vs "$0.00") | Cross-page reading. | **CONFIRMED** | Team: "$0.00", "$0.00 (this month)", "--" (Cap), "—" (routine cost). Profile: "—" (Avg/Total cost). Multiple distinct null glyphs coexist on screen (screenshots 01, 10). |
| **F14** | Dead display logic (timeout dot, state="error", unused lastRunOutcome, cost:0) | Run outcomes observed. | **PARTIALLY CONFIRMED** | Only `error`/`crashed` outcomes produced; no `timeout` outcome ever emitted (dead branch). `lastRunOutcome` present in API but RoutineRow shows "Never"/dots only. Not exhaustively asserted but consistent. |
| **F15** | AgentProfile active-session link `betId ?? ""` → broken `/work/bet//task/...` | No active session in seed to render the link. | **NOT REPRODUCED (no path)** | Builder had only crashed (ended) sessions, no active session → "↗ Active session" link not rendered. Static fallback bug stands, unexercised. |
| **F16** | Success rate denominator includes active/stopped sessions | Builder after 2 crashed sessions. | **CONFIRMED** | `performance: {totalSessions:2, successCount:0, successRate:0}`; UI "SUCCESS RATE 0%", "SESSIONS 2". Crashed sessions count in denominator, deflating rate (screenshot 10). |
| **F17** | Seed exercises no non-zero path | Whole suite. | **CONFIRMED** | Pre-test: 0 sessions, 0 runs, no caps, draft bet. Every number zero/empty until our triggers created crashed sessions. |
| **F18** | useTeamAgents fetches entire agent list; Customize with agent=null no-ops (dialog silently does nothing) | Clicked Customize via `getByRole(button,/Customize/)` (matched the role=button row) vs `[data-testid=agent-customize-btn]`. | **REFUTED for seed (dialog works); selector caveat** | `/api/agents` returns full 16-agent list incl. soul prompts (payload smell confirmed). For seed roster agents the config IS found → dialog **opens correctly** via the testid button and Save persists (see E9 below). The "agent=null no-op" only bites if the roster agent is missing from the list (retired/in-flight) — not reproduced for seed. NOTE: the AgentRow is itself `role="button"`, so a name-based "Customize" role query is ambiguous and can hit the row (navigates to profile) — a test/selector footgun, not a product bug. |
| **F19** | N+1 queries in GET /teams/:id | Out of scope for live behavior. | **NOT TESTED** | Performance-only; functionally correct responses observed. |
| **F20** | Trigger on soft-deleted routine 403 not 404 | Deleted routine then re-GET. | **PARTIALLY CONFIRMED** | After Delete: `GET /api/routines/:id → 404` (soft-deleted hidden from GET). Did not re-trigger the deleted id to assert 403-vs-404 on trigger; GET correctly 404s. |

## Dialog / action functional results (independent of flags)

| Surface | Test | Result |
|---|---|---|
| **Burn vs Cap** | Cross-check rendered vs API | Bet $0.00 / Routine $0.00 (this month) / Total $0.00 / Cap -- / Capacity 1/5 — exact match to `burn` payload. Confirms FE fallbacks + formatMoney(null). |
| **RoutineCreateDialog** | Create routine | 201, routine in `GET /api/routines` (count 5→6), `state:active`, `active:true`. Agent select + 5 schedule presets + Custom render. **Not visible on team page until reload (F8).** |
| **Pause/Resume** | Toggle | **401** (bare fetch, no key). State NOT persisted, no error UI (F9+F10). |
| **Trigger Now (UI)** | Click | **401** (bare fetch). No run-history refresh (F9+F10). |
| **Trigger (API direct)** | POST /trigger ×2 | Both `fired:true`, `outcome:"crashed"`; created 2 sessions (state `crashed`), 2 run rows `outcome:"error"`, both cost null. No coalescing/skip. |
| **Delete** | Confirm row → DELETE | apiFetch with key → 200, navigated to `/work/portfolio`, `GET` after → 404 (soft delete). Works correctly. |
| **AgentProfile** | Performance | Sessions 2, Success rate 0%, Avg cost —, Total cost — (F4/F16). Health banner + ERROR chip after crashes. Recent Activity cost column "—". |
| **AgentEditDialog (E9)** | Edit soul → Save | `PATCH /api/agents/seed-agent-builder` 200 **with X-API-Key**; soulPrompt persisted (verified via profile re-fetch: marker present). **Works correctly.** Dialog opens only via the explicit Customize button, not the row. |
| **AgentAddDialog** | Role select + template | 11 roles (Builder…Data Analyst) from team catalog. Selecting Builder → `GET /api/agents/templates/builder` 200 with key → soul textarea auto-filled (939 chars). **Works correctly.** |

## NEW ISSUES (not in the 20 flags)

1. **N1 — Pause/Resume + Trigger Now 401 IN THE BROWSER, not just Electron.** The trace hedged F9 as "may work in browser since api-fetch injects." It does NOT — `apiFetch` injects the dev key but these two handlers use bare `window.fetch`. Live result: both return **401 Unauthorized** in headless Chromium against the dev server, with two console errors. So Pause/Resume and Trigger Now are **completely non-functional from the UI in every environment**, not an Electron edge case. This elevates F9 from Medium to effectively High/Critical for these two actions.

2. **N2 — Trigger Now always crashes the session in dev (no working harness).** Every `POST /:id/trigger` returns `outcome:"crashed"` and leaves a `crashed` session + `error` run. The Trigger path provisions a session that immediately crashes (no adapter), so a UI Trigger (if it weren't already 401'd) would only ever produce error run history. F6's "active forever / bricks future triggers" was NOT reproduced — the dev path crashes instead of hanging, so subsequent triggers are not coalesced. Different failure mode than the trace predicted.

3. **N3 — Triggering a routine pollutes the OWNER AGENT's profile health.** The 2 throwaway triggers crashed `seed-agent-builder`'s sessions, flipping its AgentProfile to "Health warning: High failure rate: 100% in last 7 days" with an ERROR chip and 0% success rate. A manual Trigger Now on any routine immediately degrades the owning agent's displayed health from crashed provisioning — a real UX/data-integrity smell (manual triggers shouldn't tank agent health metrics).

4. **N4 — AgentProfile JSON is flat, not nested under `agent`.** `GET /api/agents/:id/profile` returns `id/name/role/soulPrompt/...` at the top level plus `performance`, `runs`-equivalents — there is no `agent` wrapper key (relevant for any consumer expecting `data.agent.*`). Not a bug per se, but a shape worth noting for downstream/test code.

5. **N5 — `getByRole("button", {name:/Customize/})` is ambiguous** because AgentRow is `role="button"`; a name match plus `force` lands on the row and navigates to the profile instead of opening the edit dialog. Product is fine (testid button works), but it is an accessibility/automation footgun: a row and its action button share the button role.

## Confidence notes
- F1, F11, F15 could not be exercised: seed lacks real cost events / active sessions / missing-task rows. Static claims plausible but unproven live.
- F6 actively REFUTED in dev (crash, not hang); re-test against a real harness recommended.
- All UI-driven dialogs that use `apiFetch` (Create, Delete, Edit save, Add template) work and authenticate; the two bare-`fetch` actions (Pause, Trigger) are the live failures.
