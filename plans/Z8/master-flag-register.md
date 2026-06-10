# Z8 Master Flag Register

Compiled 2026-06-10 from the 8 deep-trace audits in `plans/Z8/traces/`
(conversations, work-bets-tasks, work-team-routine-agent, knowledge, settings,
shell-search-artifacts, agent-runtime, automated-mechanisms).

**175 source flags → 165 register entries** (9 entries merge 19 flags found independently
by multiple tracers; independent corroboration is noted and raises confidence).
Severity normalized from the source schemes (P1/P2/P3, CRITICAL/HIGH/MED/LOW/INFO, F-numbers,
unlabeled buckets) into four buckets: Critical 14 · High 37 · Medium 51 · Low 63.

Source shorthand: `conv` = conversations.md, `wbt` = work-bets-tasks.md,
`wtra` = work-team-routine-agent.md, `kn` = knowledge.md, `set` = settings.md,
`ssa` = shell-search-artifacts.md, `ar` = agent-runtime.md, `am` = automated-mechanisms.md.

Fix shapes: **one-liner** (single targeted edit), **small WP** (workpackage-sized, clear scope),
**concept+pipeline** (needs /concept + full pipeline run — design decisions involved).

---

## Critical

### Z8-001 — `npm run check` typechecks nothing; real type errors ship
- **Sources:** ar F1 + am #11 — **independently corroborated by two tracers**
- **Files:** `tsconfig.json` (`"include": []`), root `package.json` check script; proven errors at `packages/server/src/services/session-provisioning.ts:385`, `packages/server/src/skill-tools/handoff-to.ts:54` (missing `traceId`), `packages/fabric/src/services/assistant-dispatcher.ts:133,145` (TS2339 `event.hostId`)
- Root tsconfig has empty `include` and the check script runs plain `tsc --noEmit -p` (not `-b`), so project references are never built and zero source files compile — the gate passes vacuously. Directly compiling real sources yields ~100 strict errors across server/fabric/db. Every "zero type errors" attestation since this landed is unsound. See also Z8-084 (a live type error in web that slips through).
- **Fix shape:** small WP — switch to `tsc -b` over all project refs, then burn down the revealed error backlog.

### Z8-002 — Cost over-counting: running total recorded as a delta (quadratic inflation)
- **Sources:** wtra F1 + ar F5 — **independently corroborated**
- **Files:** `packages/server/src/services/session-provisioning.ts:590-603`, `packages/fabric/src/services/cost-cap.ts:224-269`
- `provisionSession` accumulates `totalCostCents += delta` then passes the **running total** as `costMinor` to `recordCostAndCheck`, which *adds* it to `users.costActual`, `team_members.costActual`, and `bets.costActualMinor` on every `cost_update` event. Deltas 10,5,5 record as 10+15+20=45 instead of 20. The builtin harness emits one cost event per LLM call, so all spend numbers and cap-breach checks are systematically wrong.
- **Fix shape:** one-liner (pass the per-event delta) + a regression test.

### Z8-003 — Routine scheduler is never started: no cron/heartbeat routine ever fires
- **Sources:** wtra F2 + ar F3 + am #1 — **independently corroborated by three tracers**
- **Files:** `packages/fabric/src/services/routine-scheduler.ts:500` (`startRoutineScheduler`), `packages/server/src/server-factory.ts` (no call site), `packages/fabric/src/bootstrap.ts`
- `startRoutineScheduler` is exported and tested (a test even claims "server-factory.ts calls it at boot") but has zero production call sites. UI-created calendar routines compute and display `nextRunAt` that nothing consumes; built-ins (practice-meeting, portfolio-retro, knowledge-decay 90-day stale sweep) never fire automatically. Only manual `POST /api/routines/:id/trigger` works.
- **Fix shape:** small WP — wire the start call at boot, but must land together with Z8-029 (the scheduler is also broken internally).

### Z8-004 — AD2 task auto-dispatch is dead in production
- **Sources:** ar F2 + am #4 — **independently corroborated** (also am dead-code #2/#3: `setProvisionSessionFn` called only in tests)
- **Files:** `packages/fabric/src/bootstrap.ts:77` (gated on `ctx.dispatcherDeps`), `packages/server/src/server-factory.ts:167-181` (never passes deps), `packages/fabric/src/services/task-dispatcher.ts:404`, `packages/fabric/src/services/provision-registry.ts:36`
- `registerTaskDispatcher` only runs when `dispatcherDeps` is provided; server-factory never provides it, and `setProvisionSessionFn` is only called in the integration test. Accepted tasks with owner agents are never auto-provisioned, handoff re-dispatch never fires, and `GET /api/dispatch-queue` always returns an empty queue. The product's core "agents pick up work" loop only functions via manual `POST /api/sessions`.
- **Fix shape:** small WP — pass `dispatcherDeps` + register `provisionSession` at boot; verify with the existing integration test wired against the production factory.

### Z8-005 — Notification queue has no drain loop; deferred notifications stay pending forever
- **Sources:** am #3
- **Files:** `packages/fabric/src/services/notifications/dispatcher.ts:379` (`flushQueue`), `packages/server/src/routes/notifications-routes.ts:330`
- Rows enqueued for quiet-hours/silence/flood/retry are only flushed by manual `POST /api/notifications/flush` or `/digest`. There is no silence-lift watcher despite the docstring claiming one. The "blocking items always surface to a human" guarantee (UX-3) is not met.
- **Fix shape:** small WP — periodic drain interval + silence-lift trigger; include Z8-098 (stuck-lease recovery).

### Z8-006 — Daily digest can never fire automatically
- **Sources:** am #2
- **Files:** `packages/fabric/src/services/notifications/digest.ts:41`, `packages/db/src/seed.ts:379` (seed routine `active:false`), dispatcher `routine_fired` subscription
- The digest depends on a `routine_fired` event that is never emitted in production (scheduler never starts, Z8-003) AND the seeded `daily_digest` routine ships `active:false`. The dispatcher's digest subscription is dead wiring; digest-classified notifications accumulate unsent (compounding Z8-005).
- **Fix shape:** small WP — depends on Z8-003; activate seed routine or fire digest from the new drain loop.

### Z8-007 — `notification` events have zero listeners; policy-engine "push to human" is a no-op
- **Sources:** am #5
- **Files:** `packages/fabric/src/services/policy-engine*` (push action emit), `packages/server/src/services/dependency-watcher.ts:26` (also emits `notification`)
- The policy engine's "push" decisions and the dependency-watcher's unblock notices emit a `notification` event consumed by nothing — they vanish beyond the audit trail. The single most important policy outcome (escalate to human) does not reach anyone.
- **Fix shape:** small WP — route `notification` events into the notification dispatcher (or replace with direct `route()` calls).

### Z8-008 — Factory cost sentinel monitors a value nothing writes
- **Sources:** am #6
- **Files:** `packages/fabric/src/services/cost-sentinel.ts:182`, `packages/fabric/src/services/cost-cap.ts` (accumulates on users/team_members/bets only)
- `startCostSentinel` (the only interval job actually started at boot) reads `factory_settings.cost_actual`, but `recordCostAndCheck` never writes that key — no code does. The sentinel always reads 0 and never fires; the scheduler's factory-cap gate compares against the same dead value. Factory-level cost monitoring is inert.
- **Fix shape:** small WP — accumulate factory-level spend in `recordCostAndCheck` (after fixing Z8-002) or have the sentinel sum from real tables.

### Z8-009 — `setupFts` never runs: `query_practice` skill tool throws at runtime
- **Sources:** am #7 (also am dead-code #6)
- **Files:** `packages/fabric/src/fts.ts:13`, `packages/server/src/skill-tools/query-practice.ts:1`
- `setupFts` (creates the `fts_vector` tsvector column + GIN index) is called by no boot path and no migration. `ftsSearch` → `repo.search` → the agent-facing `query_practice` tool will fail with "column does not exist" the first time any agent searches practice knowledge. `/api/search` is unaffected (pure LIKE).
- **Fix shape:** one-liner-ish — add a migration (or boot-time idempotent setup call); verify with an integration test invoking `query_practice`.

### Z8-010 — draft→active is unreachable: UI-created bets stay draft forever
- **Sources:** wbt FLAG-6
- **Files:** `packages/server/src/routes/bets.ts:664` (`POST /:id/commit`, zero web callers), `packages/web/src/pages/WorkBet.tsx` (Activate affordance removed with Pause)
- `POST /api/bets/:id/commit` has no frontend caller — the overflow-menu cleanup removed *Activate* along with Pause, but draft→active is still a required transition. Bets created via BetCreateDialog can never become active (and thus never complete) without an agent/API call. `POST /:id/ship` likewise has no UI. Core bet lifecycle is broken for human-only use.
- **Fix shape:** small WP — restore a Commit/Activate affordance on WorkBet (plus Ship, or rely on propagation).

### Z8-011 — Assistant overlay messages vanish after send; replies never appear live
- **Sources:** conv FLAG-2
- **Files:** `packages/web/src/shell/CocOverlay.tsx:102-139`, `packages/web/src/shell/AssistantOverlay.tsx:180-212`, `packages/web/src/hooks/useAssistantThread.ts`
- The overlay POSTs the message but never calls `refresh()`/`retry()`, has no WS subscription, and no optimistic UI — the composer clears and nothing appears until the overlay is closed and reopened. The flagship assistant surface looks broken on the very first message.
- **Fix shape:** small WP — refetch after POST (or optimistic append) + subscribe to `thread:<id>`; coordinate with Z8-017.

### Z8-012 — IDOR: any authenticated identity can read any thread's full messages
- **Sources:** conv FLAG-6 (security)
- **Files:** `packages/server/src/routes/threads.ts:497-545` (`GET /api/threads/:id` — no participant check)
- The list endpoint (threads.ts:427-430) and the WS `thread:<id>` topic both enforce participant membership; the detail endpoint is the gap — full message history of any thread is readable by any holder of an API key/login session. Real exposure in shared-backend mode.
- **Fix shape:** one-liner — add the same participant-membership guard used by the list route; add a 403 test.

### Z8-013 — X-Identity header spoofing defeats the assistant "self-only" guard
- **Sources:** set #12 (security)
- **Files:** `packages/server/src/routes/assistant.ts:40-45` (`readSenderId` prefers `X-Identity` over auth context); same pattern noted in `routes/threads.ts:70-78`
- Assistant soul-prompt routes resolve identity from the client-supplied `X-Identity` header *before* the authenticated userId; the self-only 403 compares header to URL param, so anyone with the shared API key can read/overwrite **any** user's assistant by setting the header. The threads message route trusts the same header for sender identity.
- **Fix shape:** small WP — only honor `X-Identity` for trusted agent-runtime callers (or drop it); audit all `readSenderId`-style sites.

### Z8-014 — Shared worker token = org-wide credential exfiltration + worker identity hijack
- **Sources:** ar F10 (security)
- **Files:** `packages/server/src/routes/auth.ts:112` (`POST /api/auth/worker-token` returns the shared static token), `packages/server/src/routes/worker-ws.ts:161`, adapter-pool `register` (same-id replace)
- Any authenticated user can mint the single shared `HYPERIDLE_WORKER_TOKEN`, register a worker, and receive `dispatch` messages containing `resolvedModel.apiKey` (the org's Anthropic/OpenRouter key), the composed prompt, and knowledge context. Worker `id` is attacker-chosen and `pool.register` replaces same-id entries, enabling hijack of legitimate workers. No per-worker identity or revocation short of env rotation.
- **Fix shape:** concept+pipeline — per-worker identity/credentials and a dispatch model that never ships raw API keys (interacts with Z8-050).

---

## High

### Z8-015 — Conversations list sorts by UUID, not recency
- **Sources:** conv FLAG-1 (P1)
- **Files:** `packages/web/src/components/ThreadSections.tsx:258-264`, `packages/web/src/hooks/useConversationsThreads.ts:87-98`
- The sort parses `Date.parse(t.timestamp)` but `timestamp` is the relative string ("just now", "5m") → always NaN → falls through to `id.localeCompare`. The list renders in thread-UUID order, scrambling the server's lastActiveAt-desc order.
- **Fix shape:** one-liner — keep ISO `lastActiveAt` on ThreadItem (or trust server order).

### Z8-016 — "Unread" and "Blocking" filter chips can never match anything
- **Sources:** conv FLAG-3 (P1)
- **Files:** `packages/web/src/hooks/useConversationsThreads.ts:104-123` (never sets `unread`; server never emits `blocking`), `packages/web/src/pages/Conversations.tsx:537-548`
- `rowToItem` never sets `unread`, and `blocking` is fixture-only — toggling either chip always yields the empty state. Two of the page's three header controls are inert in production.
- **Fix shape:** small WP — emit real unread/blocking signals from the list API or remove the chips.

### Z8-017 — Wrong assistant overlay mounted; tool-call summaries never render; rename half-landed
- **Sources:** conv FLAG-4
- **Files:** `packages/web/src/layouts/AppShell.tsx:28,754,786` (mounts `CocOverlay`), `packages/web/src/shell/AssistantOverlay.tsx:368` (false lore claim), `packages/web/src/shell/CocOverlay.tsx`
- AppShell mounts `CocOverlay`, a stale duplicate of `AssistantOverlay` that lacks `renderMessageExtra={renderToolCallSummaries}` — the AD8b assistant tool-call summary rows are never rendered in production. `AssistantOverlay` + `AssistantAttachButton` are dead code; the lore comment claiming CocOverlay re-exports from AssistantOverlay is false. Header titles also differ ("System Agent" vs "Assistant").
- **Fix shape:** small WP — mount AssistantOverlay, delete CocOverlay, finish the rename (pairs with Z8-091).

### Z8-018 — No live updates in open threads or the thread list
- **Sources:** conv FLAG-5
- **Files:** web package (no `thread:<id>` subscription anywhere), `packages/server/src/services/ws-broadcaster.ts:71-79`, `packages/web/src/hooks/useConversationsThreads.ts:210-222`
- The server broadcasts `thread_message_appended`/`thread_resolved`/`thread_reopened` to `thread:<id>`, but nothing in web subscribes — an open conversation only updates when *you* send. The list only refreshes on `thread_created`; resolution/activity never updates ordering or `hasUnresolvedReview`.
- **Fix shape:** small WP — subscribe detail to `thread:<id>` and broadcast list-relevant events to "conversations" (root cause of Z8-060 staleness).

### Z8-019 — Portfolio bet titles are a lie (FE expects `title`, server never sends it)
- **Sources:** wbt FLAG-1
- **Files:** `packages/web/src/hooks/useBets.ts:19`, `packages/server/src/routes/bets.ts:359-363` (raw rows, no `deriveTitle`)
- `BetListItem.title` is never returned by `GET /api/bets`; cards always fall back to `description.slice(0,60)` including the literal markdown `# ` prefix. Classic FE/BE field mismatch.
- **Fix shape:** one-liner — apply `deriveTitle` in the list route.

### Z8-020 — Portfolio budget badge can never render
- **Sources:** wbt FLAG-2
- **Files:** `packages/web/src/hooks/useBets.ts`, `packages/server/src/routes/bets.ts:359` (raw `costAppetiteMinor/Currency` columns, no WireMoney)
- The FE expects `costAppetite` as a WireMoney object; the list route returns raw columns. `bet.costAppetite` is always undefined → the budget badge never renders.
- **Fix shape:** one-liner — map to WireMoney in the list route (same normalization the detail route does).

### Z8-021 — Bet stat cards render "NaN%", structural "0%", and permanent "--"
- **Sources:** wbt FLAG-3
- **Files:** `packages/web/src/pages/WorkBet.tsx:1148-1174`, `packages/server/src/routes/bets.ts:501-502`, `packages/fabric/src/services/cost-cap.ts:260-268`
- (a) Zero-task bets render `0/0 = NaN%` plus an invalid `width: NaN%` style. (b) 0% is the steady state because no UI path moves a task to `done` (review→done is API-only). (c) Budget spent is "--" because `bets.cost_actual_minor` is only written by fabric cost-cap on session cost events; "of -- appetite" because no working UI sets appetite (Z8-022).
- **Fix shape:** small WP — guard total=0; ties into Z8-062 (transition UI) and Z8-022.

### Z8-022 — "Adjust appetite" is 100% broken: UI sends a duration string, server requires WireMoney
- **Sources:** wbt FLAG-4
- **Files:** `packages/web/src/pages/WorkBet.tsx:473-605` (AppetiteDialog), `packages/server/src/routes/bets.ts:77-81,626`
- The dialog offers "1 week/2 weeks/6 weeks" and PATCHes `{field:"cost_appetite", value:"2 weeks"}`; the Zod schema requires `{minor, currency}` or null → guaranteed 400 every time. `currentAppetite` ("$50.00") never matches the options, and the menu shows for `draft` while the server only allows mutation in `active`.
- **Fix shape:** small WP — decide appetite semantics (money vs duration), align dialog + schema + state guard.

### Z8-023 — Kill-bet dialog copy is false: nothing halts tasks or sessions
- **Sources:** wbt FLAG-5
- **Files:** `packages/web/src/pages/WorkBet.tsx:323-457` (ConsequencePreviewDialog copy), `packages/server/src/services/bet-state-machine.ts` (kill touches only bets + team_members)
- "STOPS: All active tasks will be halted" — `POST /bets/:id/kill` performs no cascade to tasks or sessions; propagation is upward-only. Tasks and (cost-burning) sessions keep running on a killed bet.
- **Fix shape:** small WP — implement a downward kill cascade, or make the copy honest as a stopgap.

### Z8-024 — Task `owner` and `startedAt` don't exist on the wire
- **Sources:** wbt FLAG-8
- **Files:** `packages/web/src/types/bet.ts:50,64`, `packages/server/src/routes/bets.ts:460-489` (sends `ownerAgentId`, `createdAt`)
- The FE task shape expects `owner` and `startedAt`; the server sends `ownerAgentId` and `createdAt` only. WorkBet task-row owner segment is blank, WorkTask Owner cell renders empty, Started cell never renders. `tokenAppetite` is likewise never returned.
- **Fix shape:** one-liner-ish — align field names on one side and resolve owner display name.

### Z8-025 — `GET /api/tasks/:id/sessions` does not exist; WorkTask sessions are permanently empty
- **Sources:** wbt FLAG-10
- **Files:** `packages/web/src/hooks/useTaskSessions.ts:29` (sole consumer, always 404), `packages/server/src/routes/tasks.ts` (no such route), `packages/server/src/routes/sessions-routes.ts:93-116`
- The hook always 404s → "No sessions yet" / "0 active / 0 completed" forever; SessionRow, effectiveness score, and Dial-in are unreachable. Even the closest real endpoint (`GET /api/sessions?task_id=`) returns a row shape (`state`, `agentId`) that mismatches the hook's `TaskSession` (`status`, `agent`, `title`, `cost`).
- **Fix shape:** small WP — add the endpoint (or point the hook at `/api/sessions?task_id=`) and reconcile the wire shape.

### Z8-026 — WorkTask overflow `···` button has no onClick
- **Sources:** wbt FLAG-11
- **Files:** `packages/web/src/pages/WorkTask.tsx:267-273`
- The "More actions" button renders with no handler at all — pure decoration on a primary detail page.
- **Fix shape:** one-liner — wire a menu or remove the button until actions exist.

### Z8-027 — WorkTask "Dial in" button has no onClick
- **Sources:** wbt FLAG-12
- **Files:** `packages/web/src/pages/WorkTask.tsx:350-358`
- No handler; also unreachable today because sessions are always empty (Z8-025). Doubly dead interactive control.
- **Fix shape:** one-liner — wire to the session activity panel once Z8-025 lands.

### Z8-028 — Breadcrumb "Work" links to `/work`, a route that doesn't exist
- **Sources:** wbt FLAG-13
- **Files:** `packages/web/src/pages/WorkBet.tsx:991`, `packages/web/src/pages/WorkTask.tsx:238`, `packages/web/src/router.tsx`
- Both detail pages' first breadcrumb lands on NotFound. The router only has `work/portfolio`, `work/team/:id`, `work/routine/:id`, `work/bet/...`.
- **Fix shape:** one-liner — point at `/work/portfolio` (or add a `/work` redirect).

### Z8-029 — Scheduler is broken even if started: divergent implementation, dropped column, zombie sessions
- **Sources:** wtra F3 + ar F4 — **independently corroborated** (cost:0 also noted in wtra F14d)
- **Files:** `packages/fabric/src/services/routine-scheduler.ts:228-236,365-369,419-450`
- (a) `checkAndFireRoutine` requires `triggerConfig.taskId`, which UI-created routines (`{cron}` only) never have → permanent skip. (b) On a successful fire it inserts **no `routine_runs` row** and creates the session **without `routineId`** → no run history, coalescing blind, lifecycle hook can't finalize. (c) `createRoutineSession` inserts `cost: 0` into a column dropped in O2 — a runtime crash (and a type error masked by Z8-001) the moment Z8-003 is fixed; it also bare-inserts `state:"active"` sessions no harness drives. The scheduler and the manual-trigger flow are two divergent implementations.
- **Fix shape:** small WP — unify scheduler firing onto the manual-trigger/provisionSession path; must ship with Z8-003.

### Z8-030 — `routines.costActualMinor` is never written; routine cost is permanently "—"
- **Sources:** wtra F4
- **Files:** `packages/server/src/services/session-lifecycle.ts:94-116` (writes routine_runs only), reads at `routines-routes.ts:425`, `teams-routes.ts:789`
- The column is read by WorkTeam's RoutineRow cost column and RoutineDetail but no code ever accumulates into it. Either dead schema or missing accumulation in `updateRoutineRunOnSessionEnd`.
- **Fix shape:** one-liner-ish — accumulate per-run cost onto the routine (or derive from routine_runs at read time).

### Z8-031 — Team cost caps have no write path; Burn-vs-Cap "Cap" is always "--"
- **Sources:** wtra F5
- **Files:** `packages/db/src/schema.ts` (`team_members.cost_cap_minor/cost_cap`), `packages/server/src/routes/teams-routes.ts:799-835`, `packages/fabric/src/services/cost-cap.ts`
- No API, no seed, nothing writes the team cap columns — Cap renders "--" forever, capPercent stays 0, the `overBudget` branch of `deriveTeamStatus` and team-level cap enforcement in cost-cap can never trigger.
- **Fix shape:** small WP — add a settings/PATCH surface for team caps.

### Z8-032 — Kernel-fallback "Trigger Now" permanently bricks the routine
- **Sources:** wtra F6
- **Files:** `packages/server/src/routes/routines-routes.ts:680-717`, `packages/fabric/src/services/routine-scheduler.ts:324-331` (`shouldCoalesce`)
- The no-adapter fallback leaves a session `state="active"` and a run `outcome="running"` forever (no harness drives them). Every subsequent trigger is then coalesced/skipped because `shouldCoalesce` sees the eternal active session — one manual trigger in kernel mode disables the routine until someone hand-patches the session.
- **Fix shape:** small WP — remove the fallback or add a timeout/finalizer for fallback sessions.

### Z8-033 — Humans offered as routine owners and rendered as agents (role vs kind confusion)
- **Sources:** wtra F7
- **Files:** `packages/web/src/pages/WorkTeam.tsx:481-483` (filters `m.role !== "human"` — "human" is a kind, not a role), `packages/server/src/routes/teams-routes.ts:560` (roster query doesn't filter `kind="ai"`)
- Any human on the roster is offered as a routine owner agent in RoutineCreateDialog, and appears as an AgentRow with health dots and a Customize button (whose PATCH then 403s). FE/BE contract gap on the role/kind axis.
- **Fix shape:** one-liner-ish — filter by `kind === "ai"` on both sides.

### Z8-034 — Knowledge items created with the default scope can never be edited in the UI
- **Sources:** kn F-01
- **Files:** `packages/web/src/pages/knowledge/scope-labels.ts:59` (Shared → `factory`), `packages/web/src/pages/KnowledgeDetail.tsx:460,685` (`isFactory` hides Edit)
- KnowledgeCreate defaults to "Shared" → `scopeKind:"factory"`, and KnowledgeDetail hides the Edit button for factory items. Net: create with defaults → immediately read-only. With Team disabled (Z8-072), the only editable creation choice is Private.
- **Fix shape:** small WP — decide factory-item editability (or change the default scope); UX decision required.

### Z8-035 — Knowledge sort pills are a placebo
- **Sources:** kn F-02
- **Files:** `packages/web/src/pages/KnowledgeList.tsx:872-880` (writes `?sort=` that nothing reads)
- The relevance/recency/frequency pills update the URL param; no code consumes it — neither curated grouping nor triage ordering changes. Pure dead control.
- **Fix shape:** small WP — implement the three sort orders client-side (signals are already delivered).

### Z8-036 — ScopeChangeDialog sends a stale version → guaranteed 409 after any autosave
- **Sources:** kn F-06
- **Files:** `packages/web/src/pages/KnowledgeDetail.tsx:848` (`currentVersion={item.versionNum ?? 1}` — frozen prop, not live state)
- The dialog receives the version frozen at view mount, not the live `version` state autosave bumps. Edit the body, then "Change scope" → guaranteed 409 with a raw "Version conflict" string. Fixture items (versionNum undefined) always send 1.
- **Fix shape:** one-liner — pass the live version state.

### Z8-037 — Relevance scoring is dead: `knowledge_accessed` has zero subscribers
- **Sources:** kn F-09 + am #8 — **independently corroborated** (also am dead-code #5)
- **Files:** `packages/server/src/routes/knowledge.ts:351-359` (emit), `packages/fabric/src/services/relevance-service.ts:54` (no production caller), `routes/knowledge.ts:9` (lore documents the removed inline call)
- The event was created to replace an inline relevance recompute, but no subscriber was ever added and `createRelevanceService` has no caller — `relevance_score` is write-only-at-seed and L22 signals are dead. The access-log table fills up; nothing consumes it.
- **Fix shape:** small WP — subscribe relevance recompute to `knowledge_accessed` (debounced) or schedule it (after Z8-003).

### Z8-038 — Auto-promotion sweep (G3) never runs
- **Sources:** am #9 (also am dead-code #4)
- **Files:** `packages/fabric/src/promotion-pipeline.ts:428` (`runAutoPromotionSweep`, exported, test-only)
- The "provisional knowledge seen in 5+ scopes → validated" rule has no production caller — promotion is manual-only via the skill tool. A headline fabric mechanism is inert.
- **Fix shape:** small WP — schedule the sweep (depends on Z8-003 or a plain interval).

### Z8-039 — Lifecycle-propagation retry semantics are broken
- **Sources:** am #10
- **Files:** `packages/fabric/src/services/lifecycle-propagation.ts:600-693` (`retryFailedPropagations`)
- Retries increment `attempts` on the original `pending_retry` row but the re-executed propagation writes a NEW log row — the original is never marked applied on success. After 3 ticks (~90s) it is marked `failed`, emits `propagation_failed`, and enqueues a notification even when the retry succeeded; each retry duplicates log rows.
- **Fix shape:** small WP — update the original row in place; add a retry-success test.

### Z8-040 — SettingsWorker is unreachable (worker registration UI cannot be used)
- **Sources:** set #1
- **Files:** `packages/web/src/settings/SettingsWorker.tsx` (no production import), `packages/web/src/pages/SettingsPage.tsx:34-138` (8 sections mounted, not this one)
- The full worker-device UI (enable, max concurrency, pause/resume, connection badge) exists with tests and stories but is mounted nowhere. Its @lore references AppShell nav filtering that no longer exists.
- **Fix shape:** one-liner-ish — mount it in SettingsPage (gated on shared backendMode, which it already checks correctly).

### Z8-041 — SettingsAgents is unreachable (no agent configuration from Settings)
- **Sources:** set #2
- **Files:** `packages/web/src/settings/SettingsAgents.tsx` (mounted nowhere), `packages/web/src/pages/SettingsPage.tsx`
- The full agent CRUD UI (X3) is fully built and tested but never mounted. Agent management exists only via WorkTeam dialogs; the Settings path is dead.
- **Fix shape:** small WP — mount it, or formally delete it in favor of WorkTeam (decision needed; see Z8-082 for the missing delete guard).

### Z8-042 — Settings Backend section checks the wrong bridge field; always says "Local (laptop)"
- **Sources:** set #4
- **Files:** `packages/web/src/settings/SettingsBackend.tsx:23-24` (compares `platform`, hardcoded "electron"), `packages/desktop/src/preload.ts:15,17`
- The local/shared discriminator is `backendMode`, not `platform`. The Backend section reports "Local (laptop)" even when connected to a shared backend. SettingsWorker.tsx:31-33 does it correctly.
- **Fix shape:** one-liner.

### Z8-043 — Models autosave silently wipes the stored openai-compatible API key
- **Sources:** set #5
- **Files:** `packages/web/src/settings/SettingsModels.tsx:74-95,288-301`, `packages/server/src/services/server-config.ts:111-113,183` (modelGateway = full replacement)
- The UI never holds the stored key and only sends `apiKey` when non-empty, but the server treats `modelGateway` as full replacement — any debounced edit (e.g. changing the reasoning model) erases a previously stored key; `hasApiKey` flips false after save.
- **Fix shape:** small WP — deep-merge or "preserve existing key when absent" semantics server-side.

### Z8-044 — Setup re-submission creates duplicate teams + full agent rosters
- **Sources:** ssa #1
- **Files:** `packages/web/src/router.tsx:47` (`/setup` always routable), `packages/server/src/routes/teams-routes.ts:319` (no idempotency)
- POST `/api/users` is idempotent but POST `/api/teams` is not — every re-visit/re-submit of /setup inserts a new team + members + N agent users. One stale tab = a phantom team forever in the sidebar.
- **Fix shape:** small WP — redirect away from /setup when complete + make team creation idempotent for the setup flow.

### Z8-045 — Setup silently discards the mandatory API key outside Electron
- **Sources:** ssa #2
- **Files:** `packages/web/src/pages/SetupFlow.tsx:191-193`
- The required Anthropic key is only stored when `window.__HYPERIDLE__?.credentials?.set` exists. In a plain browser the field is collected then dropped with no error and no server-side fallback (PUT /api/credentials exists and is unused here) — the user believes their key is saved.
- **Fix shape:** one-liner-ish — fall back to `PUT /api/credentials/anthropic_api_key`, or fail loudly.

### Z8-046 — `rail-indicators` hint is dead code AND violates the Rail purge directive
- **Sources:** ssa #3
- **Files:** `packages/shared/src/hint.ts:54-58`
- The hint is defined with copy describing the deleted Rail, has zero render sites, can never be shown or dismissed, yet the server still accepts its dismissal. The Rail purge is a stated hard requirement; this is a surviving occurrence in shared code.
- **Fix shape:** one-liner — delete the catalog entry.

### Z8-047 — Builtin harness registry cross-wiring race: concurrent sessions can swap tool contexts
- **Sources:** ar F6
- **Files:** `packages/server/src/harness/builtin-harness-adapter.ts:210-216`, `packages/server/src/services/session-provisioning.ts` (Phase 8.5a vs Phase 9 gap)
- `startSession` pairs with "the first pre-registered session that hasn't started"; the set-registry and start calls are separated by multiple awaits, so concurrent provisions A,B can interleave such that B's harness grabs A's registry — B's LLM then writes notes/tasks/artifacts under A's sessionId/taskId/workspace. Cross-session data corruption.
- **Fix shape:** small WP — key registry handoff by sessionId through startSession config.

### Z8-048 — `POST /api/sessions` blocks for the entire agent session
- **Sources:** ar F8
- **Files:** `packages/server/src/routes/sessions-routes.ts:188` (awaits `provisionSession` inline)
- A 20-minute session = a 20-minute hanging HTTP request; client/proxy timeouts abort the response while the loop keeps running unobservably. No restart recovery — the loop is in-memory.
- **Fix shape:** small WP — return 202 immediately, run the loop detached, observe via the sessions API/WS (natural companion to Z8-004).

### Z8-049 — CLI harness sessions are invisible to cost accounting; ndjson mode trusts forged events
- **Sources:** ar F9
- **Files:** `packages/server/src/harness/cli-harness-adapter.ts:364` (ndjson trust), `buildResult` (always cost 0)
- aider/goose/opencode sessions burn real API spend (gateway-resolved key via envMap) with zero cap enforcement; and in ndjson mode any stdout line parsing to `{type:...}` is trusted verbatim as a HarnessEvent — prompt-injected output could forge `cost_update`/`error` events.
- **Fix shape:** small WP — validate ndjson events against the schema + decide a cost story (or cap) for CLI harnesses.

### Z8-050 — Remote worker dispatch is architecturally incoherent (server-local workspace shipped to another machine)
- **Sources:** ar F11
- **Files:** `packages/server/src/services/session-provisioning.ts` (server-side workspace/materialize/CLAUDE.md), `packages/server/src/harness/remote-harness-adapter.ts`, `server-factory.ts:155` (`mcpBaseUrl` = localhost)
- Provisioning spawns the workspace, materializes knowledge, and writes CLAUDE.md/.mcp.json on the **server's** filesystem, then ships that path to a worker on a different machine — nonexistent dir, no knowledge, no MCP config; `mcpBaseUrl` is `http://localhost:<port>`, unreachable remotely. Remote sessions cannot work as wired.
- **Fix shape:** concept+pipeline — remote provisioning needs a real design (workspace transfer or worker-side materialization); pair with Z8-014.

### Z8-051 — `update_task_status` assistant tool bypasses the task state machine
- **Sources:** ar F15
- **Files:** `packages/server/src/skill-tools/update-task-status.ts` (direct `tasks.state` write), vs `packages/server/src/services/task-state-machine.ts`
- Direct state write with no `VALID_TRANSITIONS` check, no auditTrail entry, and no `task_state_changed` event — unlike every other mutation path. Lifecycle propagation and the dependency watcher (which listen to that event) silently miss these transitions, corrupting downstream invariants.
- **Fix shape:** one-liner-ish — route through `transitionTask`.

---

## Medium

### Z8-052 — Every send blanks the open thread to a skeleton
- **Sources:** conv FLAG-7
- **Files:** `packages/web/src/pages/Conversations.tsx:283`, `packages/web/src/hooks/useThreadDetail.ts:126-128`
- Success → `retry()` → the hook sets status "loading" and `setData(null)` → full-screen skeleton flash and scroll-position loss on every message/verdict.
- **Fix shape:** one-liner-ish — keep stale data while refetching (or optimistic append).

### Z8-053 — RecipientPicker always creates a duplicate DM thread
- **Sources:** conv FLAG-8
- **Files:** `packages/server/src/routes/threads.ts:609-640`, `packages/server/src/services/direct-thread.ts` (dedupe helper exists, unused here)
- `POST /api/threads` unconditionally INSERTs; messaging the same agent twice via "New thread" produces two threads with identical host/participants. `findOrCreateDirectThread` is used only by the users DM route and the agent skill tool.
- **Fix shape:** one-liner-ish — use `findOrCreateDirectThread` for the picker path.

### Z8-054 — RecipientPicker has no error state; fetch-per-keystroke with no debounce
- **Sources:** conv FLAG-9
- **Files:** `packages/web/src/components/RecipientPicker.tsx:137-139,149-205`
- On `useRecipients` error the listbox renders nothing (silent blank panel; `retry` never wired). A request fires per keystroke with no debounce, plus a redundant client-side filter over already-server-filtered results.
- **Fix shape:** small WP — add error state + debounce.

### Z8-055 — Promoted questionnaire answer buttons are enabled but do nothing
- **Sources:** conv FLAG-10
- **Files:** `packages/web/src/design-system/.../RichMessageCard.tsx:394-416`, `ThreadShell.tsx:374-376` (silently ignores `kind:"answer"`)
- The promoted card renders active option buttons whose actions ThreadShell deliberately drops, while the non-promoted CommentRow variant honestly disables its options. Dead-clicking buttons on the highest-salience card.
- **Fix shape:** one-liner — disable them with the same "lands in a follow-up" title, or implement answer dispatch.

### Z8-056 — "Re-expand" on resolved review cards is a visual no-op
- **Sources:** conv FLAG-11
- **Files:** `RichMessageCard.tsx:217-224`, `ThreadShell.tsx:425-427`
- The button flips `reExpanded`/aria-expanded but no code anywhere renders expanded content for that state.
- **Fix shape:** one-liner-ish — render the original card when re-expanded, or remove the button.

### Z8-057 — Session activity Reasoning and Cost tabs can never show data
- **Sources:** conv FLAG-12
- **Files:** `packages/server/src/services/session-activity-buffer.ts:46-64` (stores only tool_call), `packages/web/src/components/SessionActivityPanel.tsx:160-165`
- Nothing emits reasoning/cost_tick entries and the WS handler only parses `tool_call_recorded` — two of four filter tabs are permanently empty; the hook's `summary` value is never consumed.
- **Fix shape:** small WP — feed reasoning/cost events into the buffer, or drop the tabs.

### Z8-058 — Stale dial-in/session state (one-shot fetch, leaked panel across navigation, arbitrary session pick)
- **Sources:** conv FLAG-13
- **Files:** `packages/web/src/pages/Conversations.tsx:150-198,382`, `packages/server/src/routes/sessions-routes.ts:105-115` (no ORDER BY)
- `useActiveSessionForTask` fetches once per taskId (no polling/WS); `dialInSessionId` survives navigation to a different thread; the sessions list has no ORDER BY so "first active session" is arbitrary when multiple are active.
- **Fix shape:** small WP.

### Z8-059 — `isAgent`/`operationalStatus` computed with N+1 queries, decoded, never rendered
- **Sources:** conv FLAG-14
- **Files:** `packages/server/src/routes/threads.ts:147-169` (N+1 sessions query per AI sender), `ThreadShell.tsx:433-437,472-477,509-513`
- The server pays an N+1 to compute them, useThreadDetail decodes them, then ThreadShell builds senders as `{id,name,role}` only — the Agent badge, green agent avatar, and presence dots are dead on this surface. Wasted queries + dead UI.
- **Fix shape:** one-liner-ish — pass the fields through to CommentRow (and batch the server query).

### Z8-060 — Sidebar blocking badge is stale and misnamed (three notions of "blocking" coexist)
- **Sources:** conv FLAG-23 + ssa #7 — **independently corroborated**
- **Files:** `packages/web/src/layouts/AppShell.tsx:450-453`, `packages/web/src/hooks/useConversationsThreads.ts:210-222`
- The "blocking" badge counts `hasUnresolvedReview` (different semantics from the Blocking chip's never-set `blocking` flag), and only refreshes on `thread_created` — resolving a review leaves the badge over-counting until another thread is created or a hard reload. Root cause shared with Z8-018.
- **Fix shape:** small WP — refresh on resolution events + unify the "blocking" definition.

### Z8-061 — TaskSheet in WorkBet is dead code (its open-trigger can never fire)
- **Sources:** wbt FLAG-7 (source bucket: critical; normalized down — no user-visible breakage, rows navigate instead)
- **Files:** `packages/web/src/pages/WorkBet.tsx:735-751,1567,1623-1630`
- `open={selectedTaskId !== null}` but `setSelectedTaskId` is only ever called with `null`; task rows navigate to WorkTask. Three callbacks exist solely to feed the unreachable component.
- **Fix shape:** one-liner — delete the mount + callbacks (TaskSheet stays alive via WorkTeam).

### Z8-062 — TaskSheet deprecation docs contradict the code; no UI path can actually transition a task
- **Sources:** wbt FLAG-14
- **Files:** `packages/web/src/shell/TaskSheet.tsx:9-12,72-88,245-269`
- Props marked `@deprecated`/"no longer used" are actively load-bearing (`handleOpenThread`, `handleSendRequest` use all three) — following the comment would break the sheet. More importantly, the REQUEST intents only post plain-text messages; nothing in the product calls `POST /api/tasks/:id/transition`, so humans cannot move tasks (root cause of the structural 0% in Z8-021).
- **Fix shape:** small WP — fix the docs now; designing a human task-transition affordance is concept+pipeline.

### Z8-063 — Missing `await` on `loadTeamMembers` in bet commit
- **Sources:** wbt FLAG-17
- **Files:** `packages/server/src/routes/bets.ts:689`
- The async call isn't awaited so the surrounding try/catch can never catch its ApiError → unhandled promise rejection instead of the intended 500 mapping; the existence check it was meant to perform is skipped (survives by accident because `transitionBet` re-looks-up).
- **Fix shape:** one-liner.

### Z8-064 — propagation_log records a wrong transition label; ship-confirmation asks after the fact
- **Sources:** wbt FLAG-18
- **Files:** `packages/fabric/src/services/lifecycle-propagation.ts:457,493`
- `propagateTaskToBet` logs `targetTransition: "${fromStatus} -> review"` while the actual transition is `active -> completed` — the audit trail misrepresents what happened. The ship-confirmation thread asks "Confirm shipping?" *after* the bet is already completed, and no UI affordance exists to answer it.
- **Fix shape:** one-liner for the label; the confirm-before-complete flow is concept+pipeline.

### Z8-065 — Task transitions have no CAS (unlike bets); duplicated state-machine logic drifts
- **Sources:** wbt FLAG-19
- **Files:** `packages/server/src/services/task-state-machine.ts:44-79` (read-then-write, no tx), `packages/fabric/src/services/lifecycle-propagation.ts:87-133` (hand-maintained copy)
- Two concurrent transitions can both pass validation and double-emit `task_state_changed`; the bet machine fixed exactly this with compare-and-set, the task machine did not. The fabric inline copy has the same gap and is a drift hazard.
- **Fix shape:** small WP — CAS `WHERE state=fromState` + share the implementation.

### Z8-066 — No data refresh after mutations on WorkTeam (new routine/agent invisible until reload)
- **Sources:** wtra F8
- **Files:** `packages/web/src/pages/WorkTeam.tsx:467-483` (`onCreated` handlers), `packages/web/src/hooks/useTeam.ts` (no refetch)
- RoutineCreateDialog `onCreated` only closes the dialog; AgentAddDialog refreshes `/api/agents` but the roster renders from useTeam data — in both cases the new entity doesn't appear until a full page reload.
- **Fix shape:** one-liner-ish — expose and call a useTeam refetch.

### Z8-067 — Routine Pause/Trigger use bare `fetch` (no X-API-Key) — silent 401 in Electron/prod
- **Sources:** wtra F9
- **Files:** `packages/web/src/pages/WorkRoutine.tsx:109,127` (vs `handleDeleteConfirm` which correctly uses apiFetch)
- Both handlers bypass `apiFetch`, so no API key is injected. Where the key only exists via the Electron bridge, the two buttons 401 silently.
- **Fix shape:** one-liner.

### Z8-068 — Routine actions have no error feedback; unhandled rejections from onClick
- **Sources:** wtra F10
- **Files:** `packages/web/src/pages/WorkRoutine.tsx:104-153`
- Non-ok responses produce no user feedback (pause silently no-ops; delete silently closes; trigger ignores the response and never refreshes run history); network rejections in pause/trigger propagate as unhandled promise rejections (try/finally without catch).
- **Fix shape:** small WP — toasts + refetch on success, catch on failure.

### Z8-069 — `GET /api/teams/:id` performs writes (notification enqueue) on a read path
- **Sources:** wtra F11
- **Files:** `packages/server/src/routes/teams-routes.ts:112-142,665-667`
- The team detail GET INSERTs into notification_queue for error-state agents, throttled only by "pending" status — once dispatched/dismissed, the next page view re-enqueues. Side-effecting reads also break caching assumptions.
- **Fix shape:** small WP — move detection to an event/interval, or add proper dedup.

### Z8-070 — Agent health "error" derivation differs between team page and profile page
- **Sources:** wtra F12
- **Files:** `packages/server/src/routes/teams-routes.ts:650` (`failureRate7d > 0.5 || lastSessionCrashed`), `packages/web/src/pages/AgentProfile.tsx:113-116` (only `lastSessionCrashed`)
- An agent with >50% failures but a recent success shows "error" on the team page and "idle" on its own profile. Same data, two truths.
- **Fix shape:** one-liner-ish — derive both from `computeHealthSignals` server-side.

### Z8-071 — Attention/relevance scores are always null for UI-created knowledge; triage sort is a no-op
- **Sources:** kn F-04
- **Files:** `packages/server/src/routes/knowledge.ts:131-159` (`upsertFabricLayer` writes only `layer`), `packages/fabric/src/services/attention-service.ts:211`, `relevance-service.ts:197`
- Scores are written solely by fabric services/skill-tools that no UI flow triggers — for any UI-created item both scores are null, so the triage attention sort degrades to DB row order. Compounded by Z8-037/Z8-003 (the automated writers never run either).
- **Fix shape:** small WP — covered largely by Z8-037 + scheduling; otherwise sort triage by a real fallback signal.

### Z8-072 — "Team" knowledge scope is permanently disabled in both create surfaces
- **Sources:** kn F-05
- **Files:** `packages/web/src/pages/KnowledgeCreate.tsx:59`, `packages/web/src/pages/knowledge/KnowledgeCreateDialog.tsx:66` (`hasTeam = false` hardcoded)
- The user model lacks teamId so the pill is hardcoded off. Effective creation choices collapse to Shared (read-only per Z8-034) or Private.
- **Fix shape:** small WP — resolve the user's team and enable the pill.

### Z8-073 — Knowledge triage badge: endpoint + UI both exist but the wiring is broken/stale
- **Sources:** kn F-07 + ssa #6 — **two tracers, partially conflicting observations; both agree the badge is broken**
- **Files:** `packages/web/src/layouts/AppShell.tsx:443-444`, `packages/web/src/shell/Sidebar.tsx:97,326-333`, `packages/server/src/routes/knowledge.ts:280-292`
- The knowledge tracer found AppShell never passes `knowledgeTriageCount` to Sidebar (badge never renders, endpoint has no production caller); the shell tracer found AppShell fetches the count once at mount and never refreshes (stale after any triage action; feeds the mobile attention dot). Resolve the discrepancy during fix: verify the prop wiring AND add refresh-on-triage.
- **Fix shape:** small WP.

### Z8-074 — Autosave has no in-flight serialization → self-inflicted 409 conflict banner
- **Sources:** kn F-08
- **Files:** `packages/web/src/hooks/useAutoSave.ts` (debounce without queueing)
- A second debounced PATCH can dispatch with the pre-bump version before the first response lands — the user's *own* save triggers the scary "someone else saved this item" conflict banner. Window = network latency vs 1.5s debounce; realistic on slow links.
- **Fix shape:** small WP — serialize saves (queue next save until in-flight resolves).

### Z8-075 — Knowledge detail "Access count" displays 0 forever
- **Sources:** kn F-10
- **Files:** `packages/web/src/hooks/useKnowledgeItem.ts:35`, `packages/web/src/pages/KnowledgeDetail.tsx:909`, `packages/server/src/routes/knowledge.ts:296-367` (GET /:id never computes it)
- The hook declares `accessCount` and the aside renders it, but the detail route never returns it — permanently 0 while the access log fills up.
- **Fix shape:** one-liner — compute the count in GET /:id (the list route already has the batched query pattern).

### Z8-076 — `relatedItems` never returned → BacklinksCard always "No related items."
- **Sources:** kn F-11
- **Files:** `packages/web/src/hooks/useKnowledgeItem.ts`, `packages/web/src/pages/KnowledgeDetail.tsx:313-350`
- The API never returns `relatedItems`; the fixture-based fallback needs `topic`/`relatedItems` that API-mapped items never have (compounded by Z8-133 dropping topic). Real data always shows the empty state.
- **Fix shape:** small WP — implement related-items in GET /:id (topic match is the cheapest version).

### Z8-077 — Triage validate never refetches: the validated item exists in neither tab
- **Sources:** kn F-15
- **Files:** `packages/web/src/pages/KnowledgeList.tsx:839-870`
- Optimistic removal from triage works, but the curated memo is still built from the stale fetch — the item appears nowhere until a full remount/navigation.
- **Fix shape:** one-liner-ish — refetch on successful PATCH (or move the item between memos locally).

### Z8-078 — Settings "Teams" section is a ghost (declared nav, no component, dead constant)
- **Sources:** set #3
- **Files:** `packages/web/src/settings/settings-types.ts:33-43` (`SETTINGS_SECTIONS`, zero production references)
- The constant still lists a Teams item with lore "retained as sidebar nav item"; no `SettingsTeams.tsx` exists and the constant itself is dead code.
- **Fix shape:** one-liner — delete the constant (or build the section).

### Z8-079 — openai-compatible apiKey stored in plaintext in `server_config` JSON
- **Sources:** set #6 (security)
- **Files:** `packages/server/src/services/server-config.ts:196-203`, schema `server_config` (812-818)
- The model-gateway apiKey bypasses the AES-256-GCM machinery used for `server_credentials` — anyone with DB read access gets the key. Inconsistent with the system's own encryption posture.
- **Fix shape:** small WP — store via server_credentials (also resolves part of Z8-080).

### Z8-080 — Credential status dot is always "No credential" for anthropic/openrouter
- **Sources:** set #7
- **Files:** `packages/server/src/routes/model-gateway.ts:75-90` (`hasApiKey` from a field PATCH rejects for those providers)
- `hasApiKey` derives from the gateway config's own apiKey field, which the schema forbids for anthropic/openrouter; real presence lives in `server_credentials`/safeStorage and is never consulted. The dot is misleading for the two primary providers.
- **Fix shape:** one-liner-ish — consult the credential store for those providers.

### Z8-081 — Notification toggle failures are silent unhandled rejections; toggles during load are lost
- **Sources:** set #9
- **Files:** `packages/web/src/settings/SettingsNotifications.tsx:112-127` (`void save(updated)` with no catch)
- `useSettings.save` deliberately throws on non-2xx; the caller voids it — the toggle stays optimistically flipped with no toast, no revert, plus an unhandled rejection. Toggles flipped while `settings` is null are never saved at all.
- **Fix shape:** one-liner-ish — catch + revert + toast.

### Z8-082 — No 409 guard on deleting agents with active sessions
- **Sources:** set #10
- **Files:** `packages/server/src/routes/agents.ts:269-286` (409 only for already-retired)
- An agent with active sessions is soft-retired without conflict despite `activeSessions` being computed for the list view. Moot in UI terms while Z8-041 stands, but the API allows it.
- **Fix shape:** one-liner — add the active-session 409.

### Z8-083 — Org chart "team" mechanism is unusable from the UI
- **Sources:** set #11
- **Files:** `packages/web/src/settings/SettingsOrgChart.tsx:303-311`, `packages/server/src/routes/org.ts:107-111`
- The server validates `target` as a `team_members.id`, but the UI's team dropdown only offers values harvested from *existing* team-edge targets — the first team edge can never be created (empty dropdown, no free-text path), and any existing value renders as a raw id.
- **Fix shape:** small WP — populate the dropdown from `/api/teams` and render names.

### Z8-084 — Live type error in useSettings (density-removal leftover) ships because the gate is vacuous
- **Sources:** set #13 (corroborates Z8-001)
- **Files:** `packages/web/src/hooks/useSettings.ts:62-68` (TS2353: `density` not in `AppearanceSettings`), `useSettings.test.ts:129` (TS2339)
- `buildDefaultAppearance` returns `{density:"auto", theme}` against a type with only `theme` — a confirmed real `tsc` error that `npm run check` passes anyway. Also a residue of the W2 density removal directive.
- **Fix shape:** one-liner (then caught permanently by the Z8-001 fix).

### Z8-085 — Search thread candidate set is nondeterministic (LIMIT 50, no ORDER BY)
- **Sources:** ssa #4
- **Files:** `packages/server/src/routes/search.ts:126-145`
- For common terms the join returns arbitrary rows and the JS cap keeps the first 5 verified — the user's most recent matching conversations can be invisible while stale ones surface.
- **Fix shape:** one-liner — `ORDER BY lastActiveAt DESC` in the candidate query.

### Z8-086 — Message search probes raw payload JSON, not message text
- **Sources:** ssa #5
- **Files:** `packages/server/src/routes/search.ts:140` (`messages.payload ILIKE %q%`)
- Matching runs over JSON structure: queries like `text`, `type`, `{` match essentially every message, returning junk hits (title/snippet extraction parses `.text`, matching doesn't).
- **Fix shape:** small WP — match against extracted text (expression index or generated column).

### Z8-087 — Artifact `threadCount` hardcoded 0 → thread pill is unreachable dead UI
- **Sources:** ssa #8
- **Files:** `packages/server/src/routes/artifacts.ts:138,323`, gallery/stack cards gated on `count > 0`
- The cards ship "N threads" pill logic against a field the server always sends as 0.
- **Fix shape:** one-liner-ish — count threads with hostKind=artifact, or drop the pill.

### Z8-088 — ArtifactCostChip is permanently "pending"; POST silently swallows cost
- **Sources:** ssa #9
- **Files:** `packages/server/src/routes/artifacts.ts:67` (`NULL_COST` always), design-system `ArtifactCostChip.tsx`
- O2 stripped cost columns; every chip renders "—" forever and the token branch is dead. The POST body still accepts cost and ignores it — a wire-compat trap for agent authors.
- **Fix shape:** one-liner — remove the chip + the accepted-but-ignored field (or restore cost, a bigger decision).

### Z8-089 — No artifact kind has a real renderer (images render as "W×H" text, html as a char count)
- **Sources:** ssa #10
- **Files:** `packages/web/src/design-system/src/ArtifactPreviewSurface.tsx`, `packages/shared/src/kinds/*.ts`
- All 6 kinds funnel through `summarize()` one-line text; the permalink "full preview" is a 240px text box. URL kind isn't even a clickable link. The kind system's display value is currently ~zero.
- **Fix shape:** concept+pipeline — per-kind renderers are a design effort.

### Z8-090 — Setup re-auth path compares X-API-Key to the raw env var, bypassing the auth middleware
- **Sources:** ssa #11
- **Files:** `packages/server/src/routes/users.ts:101-110`
- A shared-mode user authenticated via bearer login session gets 401 from this pre-auth route even though they're authenticated elsewhere; it also bypasses any future key-rotation logic.
- **Fix shape:** one-liner-ish — delegate to the shared auth helper.

### Z8-091 — Banned "CoC" naming persists across shell and work surfaces (purge directive violation)
- **Sources:** ssa #23 + wbt FLAG-26 — **independently corroborated**
- **Files:** `packages/web/src/shell/CocOverlay.tsx`, `CocAttachButton.tsx`, `CocContext`, `AppShell.tsx:516-517` (`onCocClick`, `cocOverlayOpen`), imports in `WorkBet.tsx`, `KnowledgeBody.tsx`
- The CoS/CoC purge is a stated hard requirement; UI strings say "Assistant" but identifiers don't. Sidebar already exposes `onAssistantClick` aliases while AppShell still wires the deprecated props. Lands naturally with Z8-017.
- **Fix shape:** small WP — mechanical rename sweep (with Z8-017).

### Z8-092 — DockerWorkspaceAdapter and IsolatedHarnessAdapter are dead in production; only sh-c LocalWorkspaceAdapter runs
- **Sources:** ar F12
- **Files:** `packages/server/src/server-factory.ts:149`, `packages/server/src/harness/docker-workspace-adapter.ts`, `isolated-harness-adapter.ts`
- Only `LocalWorkspaceAdapter` (unisolated `sh -c` exec) is ever constructed; the documented "Docker is the production path" is unreachable, and the isolated adapter is never registered in any pool.
- **Fix shape:** small WP — wire adapter selection by deployment profile (or document local-only honestly).

### Z8-093 — Orphaned crash workspaces accumulate forever; adapter map leaks
- **Sources:** ar F13
- **Files:** `packages/server/src/services/session-lifecycle.ts:282` (crash preserves workspace), `harness/local-workspace-adapter.ts`
- Crash-path preservation is intentional but nothing ever GCs old workspaces (no startup sweep of `workspaceSnapshot` paths); crash also skips `workspace.destroy`, leaking the in-memory map entry so later `destroy` throws "Unknown workspace".
- **Fix shape:** small WP — startup/periodic sweep with retention window.

### Z8-094 — `PATCH /api/sessions/:id` desyncs DB from runtime; legacy POST creates zombie sessions
- **Sources:** ar F14
- **Files:** `packages/server/src/routes/sessions-routes.ts:124,282`
- Marking a session done/crashed via PATCH stops nothing — the harness keeps running and its later `endSession` overwrites the PATCH. The legacy bare-insert POST path (no adapters) creates `active` sessions no harness will ever drive.
- **Fix shape:** small WP — signal the harness to stop on PATCH; remove the legacy insert path.

### Z8-095 — Handoff doesn't stop the session: the agent keeps live tools after ownership transfer
- **Sources:** ar F16
- **Files:** `packages/server/src/services/handoff-protocol.ts:107-309`, `skill-tools/handoff-to.ts`
- After `handoff_to` commits (session → done, ownership transferred), the harness loop continues with live tools and workspace; provisioning later rewrites the session row. The tool's "Ends the current session" claim is unenforced — no abort signal exists from tool → harness.
- **Fix shape:** small WP — add an abort channel from tools to the provisioning loop.

### Z8-096 — `session:<id>` WS topic has no authorization
- **Sources:** ar F18 (also observed without flag in the conversations trace, Chain E)
- **Files:** `packages/server/src/services/ws-broadcaster.ts:103,222-249`
- Any authenticated WS client can watch any session's tool-call stream. Args summaries are scrubbed + truncated to 512 chars, which limits but doesn't eliminate cross-user data exposure in shared mode (acknowledged in lore).
- **Fix shape:** small WP — authorize by task/team membership like `thread:<id>` does.

### Z8-097 — No TTL cleanup anywhere: five tables grow unboundedly
- **Sources:** am #12
- **Files:** `login_sessions`, `invite_codes`, `notification_queue` (sent/failed/dropped), `propagation_log`, `knowledge_access_log` (see automated-mechanisms §13 table)
- Expiry is only checked at validation/claim time; no sweeps exist for any of these. propagation_log additionally writes one row per attempt (documented as follow-up).
- **Fix shape:** small WP — one retention sweep job covering all five.

### Z8-098 — Stuck notification leases only recover inside the manual flush
- **Sources:** am #13
- **Files:** `packages/fabric/src/services/notifications/dispatcher.ts:379` (`recoverStuckLeases` at top of flushQueue only)
- A crash mid-send leaves `sending` rows stuck until an operator manually POSTs `/flush`. Resolves naturally with the Z8-005 drain loop.
- **Fix shape:** one-liner-ish — fold into Z8-005.

### Z8-099 — `cost_cap_breached` is not forwarded to any WS topic
- **Sources:** am #14
- **Files:** `packages/server/src/services/ws-broadcaster.ts` (only `cost_cap_warning` → rail)
- The UI cannot see hard cap breaches live — only the soft warning is broadcast.
- **Fix shape:** one-liner.

### Z8-100 — Observability is off by default with console/noop only; no OTEL in the app runtime
- **Sources:** am #15
- **Files:** `packages/server/src/services/observability/config.ts:94`, `dispatcher.ts:160`; OTEL exists only in `packages/pipeline/src/otel.ts`
- With `enabled` defaulting false the wildcard subscriber doesn't exist at all. Note: "OTEL later" is a stated product decision (config rework), so this is partially by design — but having zero default telemetry on a system this full of silent failures is operationally risky. Includes stale case labels for removed event types (dispatcher.ts:454,457) and a vestigial TraceIdResolver (seed never called).
- **Fix shape:** small WP — enable console adapter by default in dev; clean the stale labels.

### Z8-101 — Event-triggered routines read the routines table once at registration
- **Sources:** am #16
- **Files:** `packages/fabric/src/services/routine-scheduler.ts:455` (`registerEventTriggers`)
- New event-routines created at runtime would require a server restart to be seen. Moot today (scheduler never starts, Z8-003) but a trap the moment it does.
- **Fix shape:** one-liner-ish — re-read on routine create/update events; fold into Z8-003/029.

### Z8-102 — post-bet-retro fires on EVERY `bet_state_changed(completed)` including replays; dedupe is a LIKE-probe
- **Sources:** am #17
- **Files:** `packages/fabric/src/services/builtin-routines.ts:268,341`
- Protection against duplicate retro threads is only a body-marker LIKE probe joined on the bet's host threads — fragile against marker drift or concurrent emits.
- **Fix shape:** one-liner-ish — dedupe on a structured column/unique index instead of body text.

---

## Low

### Z8-103 — AppShell's All/Blocking/Async filter context is dead on the Conversations page
- **Sources:** conv FLAG-15
- **Files:** `packages/web/src/pages/Conversations.tsx:478,614-615`, `ThreadSections.tsx:231-327`
- The flat-list branch ignores `activeFilter`/`onClearFilter` entirely (`predicateFor` only used in the dead grouped branch); `_onFilterChange` is underscore-dead.
- **Fix shape:** one-liner — delete the dead plumbing.

### Z8-104 — Thread header shows raw UUIDs for non-person hosts; dial-in subtitle shows a raw task id
- **Sources:** conv FLAG-16
- **Files:** `packages/web/src/pages/Conversations.tsx:381,395`
- `identities` is keyed by message-sender ids, so task/bet-hosted threads (and fresh DMs) title with the opaque hostId; `hostTitle` exists but is only used in the small context link. SessionActivityPanel gets `taskTitle={thread.hostId}`.
- **Fix shape:** one-liner-ish — prefer `hostTitle` for the h2 and panel subtitle.

### Z8-105 — Keyboard shortcuts hijack Cmd+D / Cmd+N (no modifier check)
- **Sources:** conv FLAG-17
- **Files:** `packages/web/src/pages/Conversations.tsx:244-247`, `AppShell.tsx:422-425`
- The "D" and "N" handlers don't check meta/ctrl/alt — browser bookmark and new-window shortcuts are preventDefault'd in those views.
- **Fix shape:** one-liner.

### Z8-106 — `sanitizeHtml` lore claims a wiring that doesn't exist
- **Sources:** conv FLAG-18
- **Files:** `CommentRow.tsx:58-64` (claim), no ThreadShell consumer passes `sanitizeHtml`
- Raw-HTML blocks degrade to UnknownPayload everywhere (safe), but the documented feature is unwired — doc drift.
- **Fix shape:** one-liner — fix the comment (or wire DOMPurify as documented).

### Z8-107 — Dead props/fields across the conversations surface
- **Sources:** conv FLAG-19
- **Files:** `useThreadDetail.ts:29` (`artifactRef` never populated), `Composer.tsx:67-78` (`unresolvedReviewLink` never passed), `ThreadSections.tsx:311` (deprecated avatarUrl), `useActiveSessionForTask` (loading never consumed; stuck true on taskId flip), CocOverlay's prop literally named `ref`
- Multiple decoded-but-unused fields and never-passed props; the `ref`-named prop only works because React 19 forwards ref-as-prop — fragile.
- **Fix shape:** one-liner-ish — deletion sweep.

### Z8-108 — Assistant context refs are re-attached to every subsequent message
- **Sources:** conv FLAG-20
- **Files:** `packages/web/src/shell/CocOverlay.tsx:106-122`
- Chips never clear after a successful send — every message re-sends the same refs until manually removed.
- **Fix shape:** one-liner — clear chips on successful send.

### Z8-109 — Assistant thread creation race → unhandled 500 on concurrent first opens
- **Sources:** conv FLAG-21
- **Files:** `packages/server/src/routes/assistant.ts:170-205`
- Two concurrent first GETs both miss and both INSERT `thr-ast-<uid>`; the second throws unhandled. Messages SELECT also lacks ORDER BY (benign — client sorts).
- **Fix shape:** one-liner — upsert/ON CONFLICT.

### Z8-110 — ws-client global-topic matching is promiscuous
- **Sources:** conv FLAG-22
- **Files:** `packages/web/src/services/ws-client.ts:186-205`
- `messageMatchesTopic` returns true for all frames on global topics, relying on every handler to filter by `msg.type`. Safe today; a foot-gun for the next subscriber.
- **Fix shape:** one-liner-ish — match event types per subscription.

### Z8-111 — Send-interaction inconsistencies (Enter vs Cmd+Enter; currency dropped; raw ISO timestamp)
- **Sources:** conv FLAG-24
- **Files:** `Composer.tsx:51-59` vs `RecipientPicker.tsx:129-132`; `RichMessageCard.tsx:214-216`
- Detail composer requires Cmd/Ctrl+Enter while the picker sends on bare Enter; cost rows drop `currency`; ResolvedView renders raw ISO `resolvedAt`.
- **Fix shape:** one-liner-ish — polish pass.

### Z8-112 — Message idempotency check is read-then-write: concurrent duplicates 500 instead of replaying
- **Sources:** conv FLAG-25
- **Files:** `packages/server/src/routes/threads.ts:726-756` (+ `messages_idempotency_uq`)
- A concurrent duplicate POST passes the pre-check and the unique index makes the INSERT throw → 500 `internal_error` instead of the intended 200 replay.
- **Fix shape:** one-liner — catch the unique violation and replay.

### Z8-113 — Dead sort machinery in WorkBet
- **Sources:** wbt FLAG-9 (source bucket: high; normalized down — pure dead code)
- **Files:** `packages/web/src/pages/WorkBet.tsx:55-56,130-157,640-641,907-914`
- `_handleSort` is never invoked, `sortColumn` stays null, `sortTasks` is identity; `latestSessionOutcome` is fetched mainly for this dead path.
- **Fix shape:** one-liner — delete.

### Z8-114 — Portfolio silently truncates at 50 bets with no pagination UI
- **Sources:** wbt FLAG-15
- **Files:** `packages/server/src/routes/bets.ts:359` (limit 50, max 200), `WorkPortfolio.tsx` (client-side filters over the truncated page)
- **Fix shape:** small WP (later; only matters past 50 bets).

### Z8-115 — Duplicate pitch save indicators in WorkBet
- **Sources:** wbt FLAG-16
- **Files:** `packages/web/src/pages/WorkBet.tsx:1440,1482`
- Header and inline indicators render the same status twice; the first is styled success-color even for "Saving...".
- **Fix shape:** one-liner.

### Z8-116 — Bet vs task InvalidTransition error-code asymmetry (400 vs 409)
- **Sources:** wbt FLAG-20 (source: medium; documented as intentional, FE treats both generically)
- **Files:** `packages/server/src/routes/bets.ts:697-699` (lore), global error handler
- **Fix shape:** one-liner-ish — unify, or keep + document on the FE.

### Z8-117 — `BetPitch.onShareBlock` prop is a dead pass-through
- **Sources:** wbt FLAG-21
- **Files:** `packages/web/src/pages/WorkBet.tsx:233` (renamed `_onShareBlock`, unused)
- **Fix shape:** one-liner — delete.

### Z8-118 — WorkTask status label casing/styling inconsistent on the same page
- **Sources:** wbt FLAG-22
- **Files:** `packages/web/src/pages/WorkTask.tsx:218-228` (raw `replace(/_/g," ")`) vs meta strip (TASK_STATUS_LABEL)
- Header shows "in progress", meta shows "In progress"; header badge for blocked/review lacks the warning styling WorkBet rows have.
- **Fix shape:** one-liner.

### Z8-119 — Cost rendering hardcodes `$` + `/100` instead of formatMoney; server hardcodes "USD"
- **Sources:** wbt FLAG-23
- **Files:** `WorkTask.tsx:328-337`, SessionRow, TaskSheet; `packages/server/src/routes/bets.ts:551-552`
- Ignores currency and scale helpers throughout the task-cost path.
- **Fix shape:** one-liner-ish — use formatMoney everywhere.

### Z8-120 — WorkBet overflow dropdown has no outside-click/Escape dismissal
- **Sources:** wbt FLAG-24
- **Files:** `packages/web/src/pages/WorkBet.tsx:1021-1032` (raw `toggleAttribute("open")`)
- Stays open after selecting an action that opens a dialog.
- **Fix shape:** one-liner-ish.

### Z8-121 — Legacy `bets.appetite` column + unreachable updateBetField branch survive
- **Sources:** wbt FLAG-25
- **Files:** `packages/server/src/services/bet-state-machine.ts:51,282`, db schema
- The PATCH schema can no longer deliver an `appetite` field; the mapping is dead server code.
- **Fix shape:** one-liner — delete (with Z8-022).

### Z8-122 — `transitionBet` dead `!transitioned` branch
- **Sources:** wbt FLAG-27
- **Files:** `packages/server/src/services/bet-state-machine.ts:225`
- `transitioned` is always true when the tx commits — unreachable early return.
- **Fix shape:** one-liner.

### Z8-123 — Bet progress excludes killed tasks while completion treats done|killed as terminal
- **Sources:** wbt FLAG-28
- **Files:** `packages/server/src/routes/bets.ts:501-502` vs `lifecycle-propagation.ts:390`
- A completed bet can permanently display <100% progress.
- **Fix shape:** one-liner — count killed as terminal in progress (or display done/total honestly).

### Z8-124 — Money-placeholder inconsistency: "---" vs "--" vs "—" vs hardcoded "$0.00"
- **Sources:** wtra F13
- **Files:** `WorkRoutine.tsx:349`, `shared/format/money.ts:14-16`, RoutineRow/RunRow/AgentProfile, WorkTeam hardcoded fallbacks
- Four different empty-money representations, some assuming USD.
- **Fix shape:** one-liner-ish — one formatter, one placeholder.

### Z8-125 — Dead display logic on routine surfaces (timeout outcome, error state, lastRunOutcome, scheduler cost:0)
- **Sources:** wtra F14 (the cost:0 sub-item is covered by Z8-029)
- **Files:** `WorkRoutine.tsx:400`, `teams-routes.ts:769-774`, routines state machine
- RunRow maps an outcome "timeout" no writer produces; `routines.state="error"` is never set by any code; `lastRunOutcome` is fetched per-routine but never rendered.
- **Fix shape:** one-liner-ish — delete dead branches/queries.

### Z8-126 — AgentProfile active-session link can render `/work/bet//task/:id`
- **Sources:** wtra F15
- **Files:** `packages/server/src/routes/agent-profile.ts:260` (`betId ?? ""`)
- Missing task row → broken navigation.
- **Fix shape:** one-liner — omit the link when betId is missing.

### Z8-127 — Agent success-rate denominator includes active/stopped sessions
- **Sources:** wtra F16
- **Files:** `packages/server/src/routes/agent-profile.ts:289-291`
- 1 completed + 1 currently-active session shows 50%.
- **Fix shape:** one-liner — denominator = ended sessions.

### Z8-128 — Seed data exercises no non-zero path on team/routine/agent pages
- **Sources:** wtra F17 (info)
- **Files:** `packages/db/src/seed.ts`
- Every number renders zero/empty/"--" out of the box — no demo value, and zero-state bugs hide.
- **Fix shape:** small WP — richer seed (sessions, runs, caps, verdicts).

### Z8-129 — useTeamAgents fetches every agent (incl. 50KB soul prompts); null-agent dialog silently no-ops
- **Sources:** wtra F18
- **Files:** `packages/web/src/hooks/useTeamAgents.ts:67-78`, `AgentEditDialog.tsx:70-82`
- Full-list fetch just to power edit dialogs (acknowledged lore); if the roster agent is retired/in-flight, Customize opens with `agent=null` and the native dialog never opens — silent dead click.
- **Fix shape:** one-liner-ish — guard/feedback for the null case; payload trim later.

### Z8-130 — N+1 query patterns in team routes
- **Sources:** wtra F19 (info)
- **Files:** `packages/server/src/routes/teams-routes.ts:625-629,682-685,769-774` (and worse on the list route)
- Fine for laptop scale; flagged for the record.
- **Fix shape:** small WP (only at scale).

### Z8-131 — Trigger on soft-deleted routine returns 403 not 404; `/retire` endpoint is dead for this UI
- **Sources:** wtra F20 (info)
- **Files:** `packages/server/src/routes/routines-routes.ts:510-539`
- `deletedAt` not checked in trigger/retire paths; retire has no UI caller.
- **Fix shape:** one-liner.

### Z8-132 — Knowledge kind badge is dead code
- **Sources:** kn F-03
- **Files:** `packages/web/src/pages/KnowledgeList.tsx:169-187,258-265,388-395`
- No call site passes `kind`; the badge can never render.
- **Fix shape:** one-liner — delete or wire.

### Z8-133 — Detail mapping drops `apiItem.topic`
- **Sources:** kn F-12
- **Files:** `packages/web/src/pages/KnowledgeDetail.tsx:252-267`
- Topic is in the API response but discarded — breadcrumb topic segment and topic-based related lookup never work for API items (feeds Z8-076).
- **Fix shape:** one-liner.

### Z8-134 — `originAgent` is fixture-only; every real item shows "by unknown"
- **Sources:** kn F-13
- **Files:** `packages/web/src/pages/KnowledgeDetail.tsx:658-678`
- The API has `updatedBy` provenance but the metadata bar's origin field only exists in fixtures.
- **Fix shape:** one-liner-ish — derive from updatedBy.

### Z8-135 — ScopeChangeDialog leaks all 7 raw scope kinds (AD6/AE1 vocabulary violation)
- **Sources:** kn F-14
- **Files:** `packages/web/src/pages/knowledge/ScopeChangeDialog.tsx:140-186`
- Contradicts the 3-label collapse used everywhere else; also lets users move items into bet/task scopes no list pill can filter to.
- **Fix shape:** one-liner-ish — restrict to the 3 labels.

### Z8-136 — Triage PATCH failure reverts the row silently (stale 409 looks like a flaky button)
- **Sources:** kn F-16
- **Files:** `packages/web/src/pages/KnowledgeList.tsx:853-868`
- **Fix shape:** one-liner — toast on failure.

### Z8-137 — No UI surface sets `topic`; all human knowledge piles into "General"
- **Sources:** kn F-17
- **Files:** `KnowledgeCreate.tsx`, `KnowledgeCreateDialog.tsx` (omit topic), `KnowledgeList.tsx:118-143`
- Topic grouping only differentiates seeded/agent data.
- **Fix shape:** small WP — topic input on create/edit.

### Z8-138 — Detail page flashes "Unknown Knowledge Item" during load; errors show it permanently
- **Sources:** kn F-18
- **Files:** `packages/web/src/pages/KnowledgeDetail.tsx:248-269` (`isLoading` destructured, unused; `useFetch.error` ignored)
- No skeleton; on fetch error the not-found fallback shows forever with no retry.
- **Fix shape:** one-liner-ish — loading + error states.

### Z8-139 — Archive/flag mis-attribute the edit log and skip optimistic locking
- **Sources:** kn F-19
- **Files:** `packages/server/src/routes/knowledge.ts:834-843,888-897` (editor = `item.updatedBy`, the previous editor)
- The audit trail attributes archive/flag to the wrong actor; archive bumps neither version nor updatedBy.
- **Fix shape:** one-liner — use the authenticated actor.

### Z8-140 — Two archive paths emit different events
- **Sources:** kn F-20 (info)
- **Files:** triage reject via generic PATCH (`knowledge_updated`) vs `POST /:id/archive` (`knowledge_archived`)
- Event consumers distinguishing archival would miss every triage reject.
- **Fix shape:** one-liner — route triage reject through the archive endpoint (also fixes attribution per Z8-139).

### Z8-141 — Triage rows carry no status badge by construction
- **Sources:** kn F-21 (info)
- **Files:** `packages/web/src/pages/KnowledgeList.tsx:98-109,193-204` (draft→"captured"→null style)
- draft and needs_human both map to no badge — rows visually indistinguishable by status.
- **Fix shape:** one-liner (if differentiation is wanted).

### Z8-142 — "Email digests" toggle does not persist
- **Sources:** set #8 (known QW-3 residue)
- **Files:** `packages/web/src/settings/SettingsNotifications.tsx:45-49,116`
- Local component state only; resets on refresh with no hint. The other three toggles are wired.
- **Fix shape:** one-liner-ish — add the SERVER_KEY_MAP entry + server key.

### Z8-143 — Error-swallowing patterns across Settings
- **Sources:** set #14
- **Files:** `SettingsModels.tsx:317-318`, SettingsOrgChart/SettingsAgents/SettingsProfile generic toasts; `CredentialsTab` handleDelete/handleValidate with no catch
- Generic toasts hide status detail; uncaught IPC rejections in CredentialsTab.
- **Fix shape:** one-liner-ish — sweep.

### Z8-144 — Models autosave 400s on normal interaction (provider switch fires before baseUrl typed)
- **Sources:** set #15
- **Files:** `packages/web/src/settings/SettingsModels.tsx:330-350` (500ms debounce), `PatchModelGatewaySchema` superRefine
- Selecting openai-compatible PATCHes before a baseUrl exists → guaranteed failure toast; half-typed model ids also persist on typing pauses.
- **Fix shape:** small WP — validate-before-save or explicit save for this section (overlaps Z8-043).

### Z8-145 — "Appearance saved" toast overpromises (localStorage-only by design)
- **Sources:** set #16 (info)
- **Files:** `packages/web/src/settings/SettingsAppearance.tsx`, `hooks/useTheme.ts:109`
- **Fix shape:** one-liner — soften the copy.

### Z8-146 — `PATCH /api/users/:id` echoes the entire users row
- **Sources:** set #17 (info)
- **Files:** `packages/server/src/routes/users.ts:237`
- Includes AI-oriented columns; harmless today, a wide contract.
- **Fix shape:** one-liner — project the response.

### Z8-147 — `RedirectProductToTeam` with empty param lands on NotFound
- **Sources:** ssa #12
- **Files:** `packages/web/src/router.tsx:38-41`
- `/work/team/` matches no route; should fall back to the portfolio.
- **Fix shape:** one-liner.

### Z8-148 — NotFound mounts outside AppShell; "Go back" can exit the app
- **Sources:** ssa #13
- **Files:** `packages/web/src/router.tsx:95`, `pages/NotFound.tsx:71` (`navigate(-1)`)
- 404s lose all chrome; on direct entry, back leaves the app/history.
- **Fix shape:** one-liner-ish.

### Z8-149 — Hardcoded cool-gray avatar placeholder evades the color lint
- **Sources:** ssa #14
- **Files:** `packages/web/src/components/GlobalSearchPanel.tsx:40-41` (`#374151` in a data URI)
- AQ-008/AQ-018 violation invisible to lint.
- **Fix shape:** one-liner.

### Z8-150 — Sidebar search hint is a click-only div (a11y suppressed)
- **Sources:** ssa #15
- **Files:** `packages/web/src/shell/Sidebar.tsx:351-367`
- Keyboard users must know ⌘K; no focusable affordance.
- **Fix shape:** one-liner — make it a button.

### Z8-151 — handleSearchNavigate: same failure, two behaviors
- **Sources:** ssa #16
- **Files:** `packages/web/src/layouts/AppShell.tsx:339-359`
- Unsafe conversation id falls back to `/conversations`; unsafe work/knowledge ids silently no-op.
- **Fix shape:** one-liner.

### Z8-152 — "Search coming soon" 404 branch can mask real route-loss regressions
- **Sources:** ssa #17
- **Files:** `packages/web/src/components/GlobalSearchPanel.tsx:150-172`
- `/api/search` is always mounted now; the branch would mislabel a regression as "coming soon".
- **Fix shape:** one-liner — delete the branch.

### Z8-153 — Knowledge search `layer` parsed/validated but never displayed
- **Sources:** ssa #18
- **Files:** `useGlobalSearch.ts` parsers, `KnowledgeRow` props
- **Fix shape:** one-liner — drop or display.

### Z8-154 — Recent-queries row is a permanent placeholder
- **Sources:** ssa #19 (deferred to J8+ by design)
- **Files:** `packages/web/src/components/GlobalSearchPanel.tsx:281-287`
- **Fix shape:** small WP (deferred feature).

### Z8-155 — Sidebar thread titles (placeholder stubs) disagree with search result titles for the same threads
- **Sources:** ssa #20 (root cause shared with conv list-title placeholder, FLAG noted at useConversationsThreads.ts:104-123)
- **Files:** `packages/web/src/hooks/useConversationsThreads.ts:104-123`, `routes/search.ts` (real first-message titles)
- The list endpoint emits no titles yet; sidebar shows "Task thread a1b2c3d4" while search shows real text.
- **Fix shape:** small WP — emit titles from the list endpoint.

### Z8-156 — `escapeLikePattern` doc block describes SQLite while the stack is Postgres/PGlite
- **Sources:** ssa #21 (comment drift only; behavior correct)
- **Files:** `packages/server/src/services/like-escape.ts`
- **Fix shape:** one-liner.

### Z8-157 — Hints fetched once at boot; cross-device dismissals reappear until reload
- **Sources:** ssa #22
- **Files:** `packages/web/src/hooks/useHints.tsx:62-89`
- Also: the swallowed 409 is indistinguishable from network failure in logs. Acceptable, recorded.
- **Fix shape:** one-liner-ish (refetch on focus) or accept.

### Z8-158 — Setup team-name derivation breaks on Windows paths
- **Sources:** ssa #24
- **Files:** `packages/web/src/pages/SetupFlow.tsx:170` (splits on `/` only)
- `C:\repos\app` becomes the entire string as team name.
- **Fix shape:** one-liner.

### Z8-159 — Artifacts API has no per-user/team boundary; preview PATCH is open to any key holder
- **Sources:** ssa #25
- **Files:** `packages/server/src/routes/artifacts.ts` (bare Hono, no userId use)
- Consistent with "bets are team-scoped" but the only unscoped PATCH in the domain — note for the shared-mode security pass (with Z8-012/013/096).
- **Fix shape:** small WP (part of the security batch).

### Z8-160 — `file_leases` is fiction: the audited concept doesn't exist anywhere
- **Sources:** ar F7
- **Files:** (absent) — grep over all packages
- No table, no code. Cross-session file-conflict safety rests entirely on workspace isolation + writeback version checks → `knowledge_conflicts`. Audit-spec/doc drift; nothing to fix in code unless leases are actually wanted.
- **Fix shape:** one-liner — correct any docs that mention it (or concept+pipeline if leases are desired).

### Z8-161 — Silent no-ops and stubs in the agent tool surface
- **Sources:** ar F17
- **Files:** `skill-tools/score-attention.ts` (item target: ok-but-writes-nothing), `assistant-tools.ts` `edit_block` (always "Block not found"), `route_item` (computed view never persisted/emitted), `user_skills.successCount/failureCount` (no writer anywhere)
- Agents receive success responses for operations that did nothing — worse than errors for agent learning loops.
- **Fix shape:** small WP — return honest errors/remove stubs; wire or drop user_skills counters.

### Z8-162 — Effectiveness-score attribution spoofing/defaulting
- **Sources:** ar F19
- **Files:** `packages/server/src/routes/sessions-routes.ts:310` (`effectivenessRecordedBy = actor ?? existing.agentId`)
- With the master API key (no userId), scores silently self-attribute to the scored agent.
- **Fix shape:** one-liner — require an explicit actor.

### Z8-163 — `GET /api/workers` accepts only the raw master key
- **Sources:** ar F20
- **Files:** `packages/server/src/routes/workers.ts:26`
- Inconsistent with bearer-session auth in shared mode; desktop UI sessions cannot list workers.
- **Fix shape:** one-liner — use the standard auth middleware.

### Z8-164 — Git-export debounce state is in-memory; restart mid-burst drops the pending export
- **Sources:** am #18 (documented as accepted)
- **Files:** `packages/fabric/src/services/git-export.ts:510`
- Recovered on the next `knowledge_updated`. Recorded; acceptable.
- **Fix shape:** one-liner-ish (boot-time catch-up export) or accept.

### Z8-165 — CLAUDE.md claims BullMQ; the codebase has zero BullMQ/Redis usage
- **Sources:** am #19 (also am dead-code #14; the Redis `EventBusAdapter` interface is an unimplemented stub)
- **Files:** `CLAUDE.md` tech-stack list, `shared/src/events.ts:334`, `cost-sentinel.ts:180` (aspirational comment)
- Doc/code drift that will mislead future agents into "fixing" Redis wiring that was never there.
- **Fix shape:** one-liner — fix the doc.

### Z8-167 — `create_item` tool advertises `attentionScore`/`costEstimate` inputs the `items` table cannot store
- **Sources:** AF4 (type checker confirms drift; TS2769 "Object literal may only specify known properties" at the insert).
- **Files:** `packages/server/src/skill-tools/create-item.ts:40,46` (input schema), `:148,151` (insert), vs `packages/db/src/schema.ts` `items` table (no `attention_score`/`cost_estimate` columns — those live on `knowledge_items`).
- AF4: type checker confirms the tool's Zod input schema accepts `attentionScore` and `costEstimate`, but the `items` (inbox-item) table has no such columns, so the `db.insert(items).values({...})` does not type-check. The values were never persistable at runtime. Honest in-scope fix: drop the two phantom columns from the `.values()` so the insert type-checks (no runtime behavior change — they were never written). Whether these inputs SHOULD be persisted (e.g. route the item to `knowledge_items`, or add columns) is a behavioral decision → **owned by the knowledge/inbox workpackage (Batch 7)**. The input-schema fields are left in place (removing them is a tool-contract change for that WP to decide).
- **Fix shape:** small-WP — decide whether attentionScore/costEstimate belong on items; align tool schema ⇄ table.

### Z8-166 — Message payload zod schema drifts from the shared domain type (`blockId`, `MentionRef.sourceText`)
- **Sources:** AF4 (type checker confirms drift; surfaced as TS2322 at `rowToMessage` in assistant/coach/threads).
- **Files:** `packages/server/src/routes/threads-schema.ts:85` (plainPayloadSchema `blockId`), `:71-75` (mentionRefSchema `sourceText` optional), vs `packages/shared/src/thread.ts:152` (`PlainPayload` lacks `blockId`) + `:131` (`MentionRef.sourceText` REQUIRED).
- AF4: type checker confirms the wire schema validates/persists a `blockId` field on plain payloads that the domain `PlainPayload` type omits, and accepts mentions WITHOUT `sourceText` though the domain type requires it (contradicting the AE5 lore that sourceText is server-constructed and required). Reconciling either direction changes the wire/persisted shape (add `blockId` to the domain type, or tighten the schema to reject sourceText-less mentions) → **behavioral fix owned by the conversations workpackage (Batch 6 / AF6)**. AF4 keeps the runtime untouched and bridges the read-back mapping at the internal DB-row→domain boundary only (no request-payload cast, no behavior change).
- **Fix shape:** small-WP — decide canonical Message payload shape, align schema ⇄ `PlainPayload`/`MentionRef`, migrate persisted rows if needed.

---

## Cross-cutting themes

1. **Dead/unwired code — the dominant failure mode.** Entire subsystems are built, tested, and never connected: routine scheduler (Z8-003), task dispatcher (Z8-004), notification drain (Z8-005), FTS (Z8-009), relevance scoring (Z8-037), auto-promotion (Z8-038), SettingsWorker/SettingsAgents (Z8-040/041), Docker/Isolated adapters (Z8-092). Plus dozens of dead components, props, branches, and event types (`bet_revised`, `dependency_met`, `thread_archived` listener, `setKnowledgeEventBus`, polling watcher — see automated-mechanisms "Dead/Unwired Code"). The pattern: workpackages ship the mechanism and its tests but the boot/mount wiring step is skipped — and the vacuous typecheck (Z8-001) plus a verify suite that never exercises boot wiring lets it through.

2. **Events emitted into the void / listeners without emitters.** `notification` (Z8-007), `knowledge_accessed` (Z8-037), `knowledge_created`/`knowledge_archived`, `routine_fired` (Z8-006), `artifact_created` (no UI subscriber), vs. `thread_archived` listener with no emitter. An event-graph lint (every type needs ≥1 emitter and ≥1 listener, or an explicit allowlist) would catch the whole class.

3. **FE/BE contract mismatches.** The FE routinely declares wire shapes the server never sends: bet `title`/`costAppetite` (Z8-019/020), task `owner`/`startedAt` (Z8-024), `TaskSession` shape + missing endpoint (Z8-025), knowledge `accessCount`/`relatedItems`/`topic` (Z8-075/076/133), thread `blocking`/`unread` (Z8-016), appetite payload type (Z8-022), `platform` vs `backendMode` (Z8-042), role vs kind (Z8-033), `hasApiKey` provenance (Z8-080). Root cause: hand-written response mappers on both sides with no shared zod schema per endpoint. Structural fix: shared wire-contract types validated at both ends.

4. **Missing refetch-after-mutation.** Assistant overlay (Z8-011), WorkTeam dialogs (Z8-066), knowledge triage (Z8-077), triage badge (Z8-073), blocking badge (Z8-060), routine actions (Z8-068), plus the inverse problem — full-blank refetch on send (Z8-052). No consistent mutation→invalidate convention exists; each page hand-rolls it or forgets.

5. **No error feedback / silent failure.** Routine pause/trigger/delete (Z8-068), notification toggles (Z8-081), triage failures (Z8-136), RecipientPicker errors (Z8-054), settings catch-all toasts (Z8-143), knowledge detail fetch errors (Z8-138), setup key drop (Z8-045), agent tool silent no-ops (Z8-161). The system frequently swallows failure at every layer — particularly dangerous combined with theme 1 (broken things look idle, not broken).

6. **Unbounded growth & resource leaks.** Five tables with no TTL (Z8-097), propagation_log per-attempt rows + broken retry duplication (Z8-039), orphaned crash workspaces (Z8-093), notification queue without drain (Z8-005), knowledge_access_log written on every read with no consumer (Z8-037).

7. **Security gaps clustered around shared-backend mode.** Cross-user reads/writes: thread-detail IDOR (Z8-012), X-Identity spoofing (Z8-013), session WS topic (Z8-096), unscoped artifacts (Z8-159). Credential exposure: worker-token exfiltration (Z8-014), plaintext gateway key (Z8-079), preload `credentials.get` plaintext surface (settings trace note). Auth-model inconsistency: raw env-key compares bypassing middleware (Z8-090, Z8-163), effectiveness attribution (Z8-162). Local single-user mode masks all of these; shared mode cannot launch without the batch.

8. **Cost accounting is untrustworthy end-to-end.** Over-counting at the source (Z8-002), never-written sinks (`routines.costActualMinor` Z8-030, team caps Z8-031, `factory_settings.cost_actual` Z8-008), invisible CLI spend (Z8-049), permanently-dash UI (Z8-021, Z8-088, Z8-124), breach events not reaching the UI (Z8-099). Every number a user sees about money is currently wrong, empty, or both.

9. **Concurrency races without CAS/serialization.** Task transitions (Z8-065), autosave (Z8-074), message idempotency (Z8-112), builtin registry pairing (Z8-047), assistant thread create (Z8-109), session PATCH vs runtime (Z8-094), handoff vs live harness (Z8-095). The bet state machine got CAS right; nothing else copied it.

10. **Naming-purge directive violations.** "CoC" identifiers across shell/work/knowledge (Z8-091), "Rail" in the shared hint catalog (Z8-046), plus the half-landed CocOverlay/AssistantOverlay duplication (Z8-017). Both purges are stated hard requirements.

---

## Recommended fix batches

Ordered by launch impact. Each is a coherent workpackage (or small workpackage cluster).

### Batch 1 — Make verify tell the truth (do this first; it gates trusting every other fix)
Z8-001, Z8-084 (+ the error backlog Z8-001 reveals, incl. assistant-dispatcher TS2339 and the latent Z8-029c type error).
Fix `tsc -b` over project references, burn down revealed errors, add a CI guard that the typecheck compiles a nonzero file count. Small WP, but everything downstream depends on a sound gate.

### Batch 2 — Wire the automation backbone (the product's core promise)
Z8-003, Z8-029, Z8-004, Z8-048, Z8-005, Z8-098, Z8-006, Z8-007, Z8-009, Z8-101, Z8-102.
Start the routine scheduler (after unifying its firing path with the trigger flow), pass dispatcherDeps + register provisionSession, detach session provisioning from the HTTP request, add the notification drain loop + listeners for `notification` events, run setupFts. This is the difference between "agentic OS" and "a UI over manual API calls". Needs concept+pipeline (boot-wiring architecture decisions + heavy integration testing).

### Batch 3 — Cost integrity
Z8-002, Z8-008, Z8-030, Z8-031, Z8-049, Z8-099, Z8-021c, Z8-124, Z8-127.
Fix the delta-vs-total bug first (one line + tests), then the never-written sinks (factory cost_actual, routine cost, team caps write path), CLI cost story, breach WS forwarding, and the display placeholders. Small-WP cluster; mostly mechanical once Z8-002 lands.

### Batch 4 — Shared-mode security hardening
Z8-012, Z8-013, Z8-014, Z8-096, Z8-079, Z8-159, Z8-090, Z8-162, Z8-163 (+ Z8-050 remote-dispatch design as a follow-on concept).
Participant guard on thread detail, kill X-Identity trust, per-worker identity/no-key-in-dispatch, session-topic authz, encrypt the gateway key, scope artifacts, unify auth-middleware usage. One focused security workpackage; required before any shared/VPS deployment. The worker/remote items (Z8-014/050) need concept+pipeline.

### Batch 5 — Bet & task lifecycle becomes operable by humans
Z8-010, Z8-022, Z8-023, Z8-062 (transition affordance — concept), Z8-025, Z8-024, Z8-019, Z8-020, Z8-021, Z8-026, Z8-027, Z8-028, Z8-033, Z8-063, Z8-064, Z8-065, Z8-051.
Commit/activate affordance, working appetite dialog, honest (or real) kill cascade, a human path to move tasks (the structural-0% root cause), the missing sessions endpoint, and the wire-field mismatches + dead buttons on Work pages. The human transition affordance needs /concept; the rest is small-WP.

### Batch 6 — Conversations liveness & assistant correctness
Z8-011, Z8-017, Z8-091, Z8-018, Z8-060, Z8-015, Z8-016, Z8-052, Z8-053, Z8-054, Z8-055, Z8-057, Z8-058, Z8-059, Z8-104, Z8-108, Z8-112, Z8-155.
Mount the right overlay + finish the CoC purge, refetch/optimistic-append after send, subscribe to `thread:<id>`, fix list sort and the inert chips, stop the skeleton blanking, dedupe DM threads, real thread titles. One pipeline run over the conversations domain.

### Batch 7 — Knowledge editing, triage, and signals
Z8-034, Z8-072, Z8-036, Z8-074, Z8-035, Z8-073, Z8-077, Z8-075, Z8-076, Z8-133, Z8-137, Z8-037, Z8-038, Z8-071, Z8-136, Z8-138, Z8-139, Z8-140, Z8-135.
Make default-created items editable (scope/editability decision = /concept), fix the version races, implement the sort pills, wire the triage badge + refetch, return accessCount/relatedItems/topic, and connect relevance/attention/promotion to real triggers (depends on Batch 2's scheduler).

### Batch 8 — Settings completeness & credential truthfulness
Z8-040, Z8-041, Z8-082, Z8-042, Z8-043, Z8-144, Z8-080, Z8-079 (if not done in Batch 4), Z8-081, Z8-083, Z8-078, Z8-142, Z8-143.
Mount the two orphaned sections (or formally delete SettingsAgents), fix the backend label, stop the apiKey wipe, make the credential dots honest, persist email digests, error feedback sweep. Small WP.

### Batch 9 — Setup & first-run robustness
Z8-044, Z8-045, Z8-090, Z8-158, Z8-147.
Idempotent setup, browser-mode key storage, redirect away when complete, Windows path handling. Small WP; high embarrassment-per-bug for new users.

### Batch 10 — Hygiene & retention sweep
Z8-097, Z8-093, Z8-046, Z8-160, Z8-165, Z8-100, Z8-128, plus the dead-code deletions (Z8-061, Z8-103, Z8-107, Z8-113, Z8-117, Z8-121, Z8-122, Z8-125, Z8-132, Z8-152, Z8-153) and polish items (Z8-056, Z8-066–070, Z8-085–089, Z8-094, Z8-095, Z8-105, Z8-106, Z8-109–111, Z8-114–116, Z8-118–120, Z8-123, Z8-126, Z8-129–131, Z8-134, Z8-141, Z8-145–146, Z8-148–151, Z8-154, Z8-156–157, Z8-161, Z8-164).
TTL/retention job, workspace GC, purge-directive cleanups, doc-drift fixes, dead-code deletion, error-feedback polish. Best run as a recurring "hygiene" workpackage after Batches 1–9 rather than one monolith.

---

## Tally

| Severity | Entries |
|---|---|
| Critical | 14 |
| High | 37 |
| Medium | 51 |
| Low | 63 |
| **Total entries** | **165** |
| Source flags covered | 175 (9 merged entries absorb 19 corroborated flags) |

Per-source coverage: conversations 25/25 · work-bets-tasks 28/28 · work-team-routine-agent 20/20 · knowledge 21/21 · settings 17/17 · shell-search-artifacts 25/25 · agent-runtime 20/20 · automated-mechanisms 19/19.
