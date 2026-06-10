# Z8 Runtime & Automation — Live Verification Results

Domain: Agent runtime + automated mechanisms. Verified against the LIVE dev server
(API http://localhost:3001), the running PGlite DB (`/Users/tg/hyperidle/hyperidle-pg`),
and source on current `main`. Boot log: `/tmp/hyperidle-dev.log`.

**Boot-log fact:** the only server line at boot is `Server running on http://localhost:3001`.
No scheduler / dispatcher / queue-worker startup line appears — consistent with all the
"never started in production" CRITICAL flags below.

---

## agent-runtime.md FLAGS (F1–F20)

| Flag | Claim | Test | Verdict | Evidence |
|---|---|---|---|---|
| **F1** (CRIT) | `npm run check` typechecks nothing | Injected `const z8probeBad: string = 123;` into `packages/fabric/src/`, ran `npm run check` | **CONFIRMED** | `npm run check` exited **0** with the deliberate type error present. Root `tsconfig.json` has `"include": []` and script is `tsc --noEmit -p tsconfig.json` (plain `-p`, not `-b`) → project references never compiled. Probe file removed. Real masked error proven below (F11). |
| **F2** (CRIT) | AD2 task dispatcher dead in production | `GET /api/dispatch-queue`; grep `dispatcherDeps`/`setProvisionSessionFn` in boot | **CONFIRMED** | `GET /api/dispatch-queue` → `{"entries":[],"draining":false}`. `bootstrap.ts:77` gates `registerTaskDispatcher` on `ctx.dispatcherDeps`; `server-factory.ts:167-181` (`strategyBootstrap`→`bootstrapFabric`) passes only `readAlertPreferences`, never `dispatcherDeps`. `setProvisionSessionFn` only in `provision-registry.ts:36` + integration test. Zero boot callers in app.ts/server-factory.ts/index.ts. |
| **F3** (CRIT) | Routine scheduler never starts | grep `startRoutineScheduler` callers; `GET /api/routines` lastRunAt | **CONFIRMED** | Only refs: `routine-scheduler.ts:500` (def) + `index.ts:261` (re-export). No boot call. All 4 active cron routines (`practice-meeting`, `portfolio-retro`, `knowledge-decay`, etc.) show `lastRunAt=null` AND `nextRunAt=null` — never fired, schedule never advanced. |
| **F4** | Scheduler latent crash: inserts dropped `cost:0` col + zombie active rows | Code-read (scheduler unreachable so can't trigger live) | **CONFIRMED (static)** | `routine-scheduler.ts:228` `createRoutineSession` inserts `cost:0`; column dropped in O2 (DB `sessions` has no `cost`/`trace_id` cols — verified via information_schema, empty). Masked by F1. Dormant because F3. |
| **F5** (CRIT/HIGH) | Cost over-counting: running total passed where delta expected | Read provisionSession call site + recordCostAndCheck | **CONFIRMED** | `session-provisioning.ts:603` passes `costMinor: totalCostCents` (the **accumulated** total at `:590`) on every `cost_update`. `cost-cap.ts:239/247/264` does `coalesce(costActual,0) + effectiveCostMinor` on users/teamMembers/bets. Deltas 10,5,5 → recorded 10+15+20 = **45** instead of 20. Caps trip early; bet/agent spend inflated. |
| **F6** | builtin registry cross-wiring race | Code-read | **CONFIRMED (static)** | `builtin-harness-adapter.ts` pairs with "first pre-registered session not started"; Phase 8.5a `setSessionToolRegistry` and Phase 9 `startSession` separated by awaits (prompt compose, MCP bridge). Concurrent A/B can interleave → B grabs A's registry. Couldn't trigger live (no API key). |
| **F7** | `file_leases` is fiction / no table | DB information_schema + grep schema/code | **PARTIALLY REFUTED / mostly CONFIRMED** | **Table DOES exist** in the live DB (information_schema returned `file_leases`). It is an orphaned legacy table: created in migration `0000_easy_ted_forrester.sql:46`, never dropped (only the `messages.file_leases` *column* dropped in `0006`). NOT in current Drizzle `schema.ts` (grep empty). **No application code references it** (server/fabric/shared grep empty; only migration-test comments). Substantive claim — nothing acquires/enforces leases, not in the live model — CONFIRMED; the "no table anywhere" wording is wrong. |
| **F8** | POST /api/sessions blocks for whole session | Read route; POST live | **CONFIRMED** | `sessions-routes.ts:188` `await provisionSession(...)` inline in handler — full harness loop runs inside the HTTP request. (Live POST returned fast only because it failed at credential pre-flight; with a key the request would hang for the session duration.) |
| **F9** | CLI sessions invisible to cost accounting | Code-read | **CONFIRMED (static)** | `cli-harness-adapter.ts` `buildResult` always cost 0 / empty tokens; text mode emits no `cost_update`; ndjson mode trusts parsed `{type:...}` as HarnessEvent verbatim (forgeable). |
| **F10** | Worker token = full credential exfiltration | Code-read | **CONFIRMED (static)** | `POST /api/auth/worker-token` returns shared static `HYPERIDLE_WORKER_TOKEN`; `dispatch` SessionConfig carries `resolvedModel.apiKey`; `pool.register` replaces same-id entries (identity hijack). |
| **F11** (CRIT/HIGH) | Real TS errors hidden from `npm run check` (assistant-dispatcher hostId, useSettings density) | Built shared/db refs, typechecked fabric + web directly | **CONFIRMED** | After building references: `assistant-dispatcher.ts(133,20)` and `(145,19)` → **TS2339: Property 'hostId' does not exist on type 'ThreadMessageAppendedEvent'** (interface at `events.ts:187-195` has no `hostId`). `useSettings.ts(36,3)` → **TS2353: 'density' does not exist in type 'AppearanceSettings'**. Both invisible to `npm run check` (exits 0). |
| **F12** | Docker/Isolated adapters dead in production | Code-read | **CONFIRMED (static)** | `server-factory.ts:149` constructs only `LocalWorkspaceAdapter`; isolated adapter registered in no production pool. |
| **F13** | Orphaned workspaces accumulate (no GC) | Inspected tmpdir | **CONFIRMED** | Two leaked workspace dirs present under `$TMPDIR/hyperidle-workspaces/` (`local-ws-1-*`, `local-ws-2-*`), each fully materialized (`CLAUDE.md`, `context/`, `knowledge/`, `.fabric/`) from prior crashed provisions. No startup sweep exists. |
| **F14** | PATCH /sessions desyncs DB from runtime | Read route | **CONFIRMED (static)** | `sessions-routes.ts:282+` PATCH is pure DB write, no harness stop; legacy bare-insert POST path creates active rows with no harness. |
| **F15** | `update_task_status` bypasses state machine | Read tool | **CONFIRMED** | `skill-tools/update-task-status.ts:39-42`: direct `db.update(tasks).set({state})` — no `VALID_TRANSITIONS`, no `auditTrail`, no `task_state_changed` emit. (Trace's line ref `:1192ff` wrong — file is 53 lines — substance correct.) |
| **F16** | handoff doesn't stop the session | Read handoff + provisioning | **CONFIRMED (static)** | `handoff_to` commits session→done but no abort signal to harness; provisioning later re-writes the row. Tool desc "Ends the current session" unenforced. |
| **F17** | Silent no-ops/stubs (score_attention item, edit_block, route_item view, user_skills counts) | grep + read | **CONFIRMED** | `edit-block.ts:42` always returns "Block not found … not yet implemented". `user_skills.successCount/failureCount` — grep for any writer (set/update/insert) returns **empty**. score_attention item-target / route_item view per source. |
| **F18** | `session:<id>` WS topic unauthorized | Read ws-broadcaster | **CONFIRMED** | `ws-broadcaster.ts:103` lore: "Any authenticated client may subscribe — observe mode … not gated by participant membership". Contrast `thread:<id>` which uses `createDbSubscribeAuthorizer`. |
| **F19** | Effectiveness attribution spoofing | Read PATCH route | **CONFIRMED** | `sessions-routes.ts:310`: `effectivenessRecordedBy = actor ?? existing.agentId` — master-key (no userId) silently attributes score to the agent itself. |
| **F20** | `GET /api/workers` master-key only | Code-read | **CONFIRMED (static)** | `workers.ts` compares X-API-Key to `HYPERIDLE_API_KEY` directly; bearer sessions can't list workers. |

---

## automated-mechanisms.md FLAGS (Critical 1–7, High 8–11, Medium 12–19)

| Flag | Claim | Test | Verdict | Evidence |
|---|---|---|---|---|
| **C1** (CRIT) | No routine scheduler runs | = F3 | **CONFIRMED** | See F3. All cron routines `lastRunAt=null`. Knowledge-decay 90-day sweep never auto-runs. |
| **C2** (CRIT) | Daily digest can never fire automatically | `GET /api/routines`; routine_fired emitter check | **CONFIRMED** | `seed-routine-daily_digest` is `active:false`; depends on `routine_fired` which is emitted only by `checkAndFireRoutine` (scheduler, never started). Double-dead. |
| **C3** (CRIT) | Notification queue has no drain loop | DB notification_queue; flushQueue callers | **CONFIRMED** | `notification_queue` has **1 pending row** sitting undrained. `flushQueue` called only from `POST /api/notifications/flush` (`notifications-routes.ts:330`); no interval/event drain. Pending rows (silence/quiet/flood/retry) stay forever. |
| **C4** (CRIT) | Task auto-dispatch (AD2) unwired | = F2 | **CONFIRMED** | See F2. dispatch-queue empty; dispatcherDeps never passed. |
| **C5** (CRIT) | `notification` events have zero listeners | grep `.on("notification")` | **CONFIRMED** | grep for `.on("notification"` returns **empty** (non-test). policy-engine push + dep-watcher unblock notices go into the void. |
| **C6** (CRIT) | Factory cost sentinel reads `cost_actual` nothing writes | DB factory_settings; grep writers | **CONFIRMED** | `factory_settings` has `cost_cap=20000` but **no `cost_actual` key at all**. Both `cost_actual` grep hits (`routine-scheduler.ts:166`, `cost-sentinel.ts:108`) are READS. Sentinel always reads 0 → never fires. |
| **C7** (CRIT) | `setupFts` never runs → `query_practice` throws | DB column check; grep callers | **CONFIRMED** | `knowledge_items.fts_vector` column **absent** (information_schema empty). `setupFts` has zero non-export callers. `query_practice`→`repo.search`→`ftsSearch` queries `fts_vector @@ ...` (`fts.ts:117`) → would throw "column does not exist". |
| **H8** | Relevance scoring never recomputes | grep `knowledge_accessed` subscribers | **CONFIRMED** | `knowledge_accessed` emitted at `knowledge.ts:294/350` but `.on("knowledge_accessed")` grep **empty**. `createRelevanceService` no caller. |
| **H9** | Auto-promotion sweep (G3) never runs | grep | **CONFIRMED (static)** | `runAutoPromotionSweep` exported only; no production caller. |
| **H10** | Lifecycle-propagation retry semantics broken | Code-read | **CONFIRMED (static)** | `retryFailedPropagations` increments attempts on original row then re-executes (writes NEW log row); original never marked applied; after 3 ticks → `failed`+notification even on success; duplicate log rows. |
| **H11** | Real type errors hidden from check | = F11 | **CONFIRMED** | See F11 (assistant-dispatcher hostId TS2339, useSettings density TS2353). |
| **M12** | No TTL cleanup (login_sessions, invite_codes, notification_queue, propagation_log, knowledge_access_log) | Code-read | **CONFIRMED (static)** | No purge sweeps; validation-time expiry only. |
| **M13** | recoverStuckLeases only runs inside manual flush | Code-read | **CONFIRMED (static)** | `flushQueue` (manual-only) is the sole invoker. |
| **M14** | `cost_cap_breached` not forwarded to WS | Code-read | **CONFIRMED (static)** | ws-broadcaster forwards `cost_cap_warning`→rail only; no breach forward. |
| **M15** | Observability off by default, no OTEL in runtime | Code-read | **CONFIRMED (static)** | `enabled` defaults false; adapters console/noop; OTEL only in `packages/pipeline`. |
| **M16** | Event-triggered routines read table once at registration | Code-read | **CONFIRMED (static)** | Moot under F3. |
| **M17** | post-bet-retro fires on every bet completion (LIKE dedupe only) | Code-read | **CONFIRMED (static)** | builtin-routines dedupe via body-marker LIKE-probe only. |
| **M18** | Git-export debounce in-memory, lost on restart | Code-read | **CONFIRMED (static)** | Documented in-memory debounce. |
| **M19** | CLAUDE.md claims BullMQ; codebase has none | grep | **CONFIRMED** | Dispatch queue is a module-level in-memory array (`task-dispatcher.ts:122`); no BullMQ/Redis usage. Doc/code drift. |

### Event-graph dead types (spot-checked)
- `bet_revised`: grep for emit/on → **empty** both. CONFIRMED dead.
- `dependency_met`: grep for emit/on → **empty** both. CONFIRMED dead (watcher uses `notification` instead).
- `thread_archived`: WsBroadcaster listens (`ws-broadcaster.ts:80`) but **no emitter** (`emit("thread_archived"` grep empty). CONFIRMED listener-for-never-emitted.
- `knowledge_accessed`: emitter exists (knowledge routes), **zero subscribers**. CONFIRMED.

---

## NEW ISSUES (not in the traces)

- **N1 — `nextRunAt` is null even for active cron routines.** The trace says the create-route "computes nextRunAt", but all 4 live built-in active routines show `nextRunAt=null` (not just lastRunAt). So even the seeded cron routines have no precomputed next-fire time — if the scheduler were started it would need to compute it from scratch, and any "next run" UI shows null. Slightly stronger than F3's framing.
- **N2 — `file_leases` orphaned table is live data-model drift.** Beyond F7: the table physically persists in the production PGlite DB (never dropped by migration) while absent from the Drizzle schema. Drizzle's schema/DB drift means `db:generate` could try to recreate/alter or a future "drop unknown tables" step could surprise. The trace asserted the table doesn't exist anywhere — it does.
- **N3 — Trace line refs stale in two flags.** F15 cites `update-task-status.ts:1192ff` but the file is 53 lines (real bypass at `:39-42`). The substance holds; the offsets are wrong and would mislead a fixer grepping by line.
- **N4 — Leaked workspaces are fully materialized, not empty shells.** F13's leaked dirs contain live `CLAUDE.md` + knowledge context written to disk (potential knowledge/prompt leakage at rest in `$TMPDIR`), not just empty scaffolds — a mild data-at-rest concern compounding the GC gap.

---

## Verification integrity note
Temporary changes made and reverted:
1. Injected then removed `packages/fabric/src/__z8probe.ts` (F1 empirical test).
2. Ran `tsc -b packages/shared packages/db` to build refs for F11 — this emitted stray
   `.js/.d.ts/.map` into `src/` + `dist/` + `*.tsbuildinfo`; **all removed**, tree verified clean
   (`git status` shows no new tracked/untracked build artifacts from this work besides the
   pre-existing test-*.mjs files left by other agents).
Could not exercise a live harness run (F5/F6/F8 runtime paths) because the dev env has no
`ANTHROPIC_API_KEY` — provisioning fails at credential pre-flight (500 MISSING_CREDENTIAL)
before the harness loop; those flags are verified by code-read + call-site inspection.
