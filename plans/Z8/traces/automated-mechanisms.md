# Automated Mechanisms — Deep Trace (Z8)

Scope: every mechanism that runs without a user click — schedulers, event cascades, background jobs, queues, the knowledge fabric. Traced from boot entry points through every register/start call. File:line references are against current `main`.

---

## Boot Sequence

Production entry: `packages/server/src/index.ts:15` → `createServer(port)` (`packages/server/src/server-factory.ts:134`). Desktop reuses the exact same path via `packages/desktop/src/boot-server.ts:16` (`startServer()` → `_createServer(0)`), after running migrations (`desktop/src/main.ts:427`).

Boot order inside `createServer` → `createApp` (`packages/server/src/app.ts:211`):

1. `validateStartupEnv` (index.ts:7) — env sanity, fatal exit on failure.
2. DB open: PGlite (laptop profile) or postgres-js (vps/cloud) — `server-factory.ts:135-144`. **No migrations are run by the server itself** (desktop runs them; `npm run dev` relies on prior `db:migrate`).
3. `new EventBus()` — single in-process bus (`shared/src/event-bus.ts:35`). Synchronous delivery, per-handler try/catch (one throwing handler can't break the chain; errors logged).
4. `EnvCredentialResolver`, `createLocalAdapterPool()` (registers `local-claude-code`, `local-builtin`, plus `aider`/`goose`/`opencode` CLI adapters if on PATH — `harness/adapter-pool.ts:292-317`), `LocalWorkspaceAdapter`, `createMcpBridgeRegistry()`.
5. `createApp({...})`:
   - rate limiter (in-memory token buckets, LRU eviction at 10k buckets — `middleware/rate-limit.ts:54,90`; no timer, lazy eviction)
   - WS route, worker WS route, MCP route mounted before auth
   - `SessionActivityBuffer.start()` — subscribes `tool_call_recorded` + `session_ended` (`app.ts:407-408`)
   - **strategyBootstrap → `bootstrapFabric`** (`fabric/src/bootstrap.ts:38`), registering in order:
     a. `registerSessionReviewCreator` (session_ended → review items)
     b. `registerPolicyEngine` (item_created → push/queue/auto_resolve)
     c. `registerLifecyclePropagation` (L20 cascade + 30s retry heartbeat)
     d. `registerBuiltinRoutineHandlers` (bet_state_changed → post-bet-retro)
     e. `registerCostCapDedupReleaser` (session_ended → dedup map cleanup)
     f. `startCostSentinel` — **the only interval-based job actually started at boot** (15-min `setInterval`, `cost-sentinel.ts:182`)
     g. `registerGitExportHandler` (knowledge_updated → debounced git export)
     h. `registerNotificationDispatcher` (item_created / cost events / routine_fired)
     i. `registerTaskDispatcher` — **SKIPPED: gated on `ctx.dispatcherDeps`, which `server-factory.ts:167-181` never passes** (bootstrap.ts:77)
   - `registerAssistantDispatcher` (app.ts:516) — thread_message_appended → assistant (log-only stub)
   - dependency-watcher inline handler (app.ts:523) — task_state_changed(done) → unblock dependents
   - `readObservabilityConfig(db)` (app.ts:494) + `wireObservability` — builds dispatcher only when `factory_settings.observability.enabled=true`; adapter = console | noop. Rebuilt in place on PATCH `/api/observability/config`.
6. `WsBroadcaster.start()` (server-factory.ts:192) — 16 event subscriptions forwarding to WS topics.
7. Static handler + `serve()` + `WebSocketServer({noServer:true})`.
8. Dispose order (server-factory.ts:240): disposeApp (all bus handlers) → WS route → HTTP server → DB.

**Never called at boot:** `startRoutineScheduler`, `registerEventTriggers`, `setupFts`, `setKnowledgeEventBus`, `setProvisionSessionFn`, `runAutoPromotionSweep`, `createRelevanceService`.

---

## Mechanism Inventory

### 1. Routine scheduler + built-in routines

- **Generic scheduler** `startRoutineScheduler` (`fabric/src/services/routine-scheduler.ts:500`): would poll `routines` (active=true, nextRunAt<=now) on `pollIntervalMs`, fire `checkAndFireRoutine`, and register event triggers. **It is never called in production** — only exported from `fabric/src/index.ts:261` and used by eval scenarios/tests. ⇒ no cron/heartbeat routine ever fires automatically.
- **`checkAndFireRoutine`** (routine-scheduler.ts:358): requires `triggerConfig.taskId`; checks factory cost cap (`factory_settings.cost_cap` vs `cost_actual`, :157-175); checks monthly cap via `getRoutineMonthlySpend` (sum of `routine_runs.cost_minor` since 1st of UTC month, :343) and inserts a `routine_runs` row with `outcome="monthly_budget_exhausted"` when over (:384); WIP-limit check with optional delegation via `user_skills`; creates a lightweight session row (no workspace/watcher, :219-248) + emits `session_started`; optional review item (threads+items insert, `item_created` emit); updates `routines.lastRunAt/nextRunAt`; emits `routine_fired` (:442).
- **Cron engine**: in-house 5-field parser (:111) with AND semantics across dayOfMonth/dayOfWeek (deliberate POSIX divergence — load-bearing for `PORTFOLIO_RETRO_CRON = "0 10 1-7 * MON"`).
- **Built-ins** (`fabric/src/services/builtin-routines.ts`): 4 ids — `builtin:practice-meeting` (cron `0 10 * * MON`), `builtin:post-bet-retro` (event `bet_state_changed`), `builtin:portfolio-retro` (first-Monday cron), `builtin:knowledge-decay` (cron `0 2 * * *`). Dispatcher `runBuiltinRoutine` (:204) short-circuits when `active=false`, updates `lastRunAt` on fire. These do NOT create sessions — they write review items / knowledge transitions directly.
  - **post-bet-retro** (:341): dedupe via `betId=<id>` body marker LIKE-probe joined on `threads(hostKind='bet', hostId=betId)`; writes thread+item in a transaction; emits `item_created` unless `silent`.
  - **portfolio-retro** (:436): JOIN `knowledge_items`×`knowledge_strategy_fabric` (layer L3/L4, updatedAt within 30d), writes a factory-hosted thread + review item.
  - **knowledge-decay** (:516): `runStaleSweep` (promotion-pipeline.ts:528) — `active` items with `updatedAt` older than 90d (cap 1000/pass) → CAS to `stale` + `knowledge_edit_log` row (`editor='system:auto-promotion'`); events suppressed (`silent=1` seeded).
- **Actual triggers in production**: (a) `registerBuiltinRoutineHandlers` (builtin-routines.ts:268, wired in bootstrapFabric) fires post-bet-retro on `bet_state_changed` with `toState==="completed"`; (b) manual `POST /api/routines/:id/trigger` (`routes/routines-routes.ts:525`) which routes builtins to `runBuiltinRoutine` and operator routines through `provisionSession` (full 11-phase, routine context) with `routine_runs` lifecycle (`running` row pre-inserted :624, finalized by `updateRoutineRunOnSessionEnd` in `session-lifecycle.ts:71` matching `routineId+outcome="running"`; outcomes success | error | budget_exhausted). Coalescing: `shouldCoalesce` (active session for routineId) → `routine_runs.outcome="skipped"`.
- **Per-run budget** (AA3): `provisionSession` reads `routines.costCapPerRunMinor` once (`session-provisioning.ts:521-529`), checks after each `cost_update` (:594), breaks the stream and calls `endSession(..., "budget_exhausted")` (:711).
- **Daily digest routine**: seeded `seed-routine-daily_digest` (db/src/seed.ts:379), cron `0 8 * * *`, **`active:false`** (operator must enable) — and even if enabled, nothing polls it (scheduler never starts).

### 2. Lifecycle propagation engine (L20)

`registerLifecyclePropagation` (`fabric/src/services/lifecycle-propagation.ts:667`), wired at boot.

- **session→task** (:255): on `session_ended` with `outcome==="completed"` only (crashed/stopped → `propagation_log` status=`skipped`); requires task `in_progress` and no other active sessions on the task; transitions task → `review` via an **inlined copy of transitionTask** (:87 — must stay in lockstep with kernel `task-state-machine.ts`); writes `propagation_log` status=`applied`; emits `propagation_applied`. InvalidTransitionError race → `skipped`; other errors → `pending_retry`.
- **task→bet** (:390): on `task_state_changed` toState ∈ {done, killed}; if ALL tasks on the bet are terminal and bet is `active`, CAS bet → `completed` (`transitionBetToCompletedAsync` :159, appends `revision_log` entry actor=`system:propagation`), emits `bet_state_changed`, writes `propagation_log`, then creates a ship-confirmation thread + review message (`createShipConfirmationThread` :493 — `threads` + `messages` insert, sender `system:propagation`, participants include first human user; emits `thread_created`).
- **bet→team** (:554): on `bet_state_changed` toState ∈ {completed, killed} — audit-only (team status derived on read): `propagation_log` row + `propagation_applied` event.
- **Retry heartbeat** (:693): 30s `setInterval` → `retryFailedPropagations` (:600). Rows at `attempts>=3` → status=`failed`, insert `notification_queue` row (eventType=`propagation_exhausted`, severity=warning), emit `propagation_failed`. Otherwise increments `attempts` and re-executes the propagation.
- DB: reads `tasks`, `bets`, `sessions`, `users`; writes `propagation_log` (every attempt — no retention policy, documented), `tasks`, `bets`, `threads`, `messages`, `notification_queue`.

### 3. Event bus

`shared/src/event-bus.ts` — in-process, synchronous, typed; wildcard support; per-handler try/catch with logging; `EventBusAdapter` interface for Redis declared (`shared/src/events.ts:334`) but **no implementation exists anywhere**. Full event graph below.

### 4. Knowledge fabric

- **bootstrapFabric** wires only the 8 strategy handlers listed in Boot Sequence — none of the scoring/promotion machinery.
- **Attention scoring** (`fabric/src/services/attention-service.ts:114`): `buildAttentionService().recomputeOne/Many/Scope` — transactional read/score/upsert of `knowledge_strategy_fabric.attention_score`; upward crossing of 0.7 creates a review `items` row (idempotent via reasoning marker) + emits `item_created`; every recompute emits `knowledge_updated(action=attention_recomputed)`. Batch cap 5000, filter required. **Trigger: on-demand only** — the `score_attention` skill tool (`server/src/skill-tools/score-attention.ts:83`). No schedule, no event subscription.
- **Relevance scoring (L22)** (`fabric/src/services/relevance-service.ts:54`): computes lastActivityAt / accessCount30d from `knowledge_access_log` + `knowledge_edit_log`, upserts `knowledge_strategy_fabric.relevance_score`. **No production caller.** `routes/knowledge.ts:9` documents the inline call was removed in favor of a `knowledge_accessed` event — which has **zero subscribers**. `relevance_score` is therefore never recomputed automatically.
- **Promotion pipeline (G3)** (`fabric/src/promotion-pipeline.ts`): `runAutoPromotionSweep` (:428 — provisional items, 5+ distinct scopes, no L4 contradiction, no open conflict → CAS to `validated` + edit-log + `knowledge_updated(auto_promoted)`; contradictions emit `contradiction_flagged`). **No production caller** — exported only; used by tests/evals. `runStaleSweep` IS reachable (knowledge-decay builtin, manual trigger only).
- **Knowledge decay**: see builtin above. Trigger condition: `knowledge_items.status='active' AND updated_at < now-90d` (:359).
- **Topic grouping / materialization** (`fabric/src/materialization.ts`): per-session, invoked by `provisionSession` Phase 6 / `createSession` — builds workspace dirs (`context/`, `knowledge/{practices,decisions,failures}`, `work/`), writes ranked+budgeted items (`rankAndBudget`, weights from `loadScoringWeights(db)`), `.fabric/manifest.json`, read-only context. Not a background job.
- **File watcher → writeback** (`fabric/src/file-watcher.ts:22` + `writeback.ts:82`): per-session `fs.watch` on `knowledge/` + `work/` with 500ms debounce; on flush: creates `knowledge_items` (layer L1, status `captured`, updatedBy `session:<id>`), version-CAS updates (VersionConflictError → `knowledge_conflicts` row, status `open`), deletes → `knowledge_conflicts` flag (no auto-delete), `work/task-notes.md` → `sessions.notes`. Stopped (with final flush) in `endSession`/`crashSession`. `polling-watcher.ts` fallback exists but nothing selects it.
- **FTS** (`fabric/src/fts.ts:13`): `setupFts` creates the generated `fts_vector` tsvector column + GIN index — **never called at boot or in any migration**. `ftsSearch` (used by `repo.search`, used by the `query_practice` skill tool — `skill-tools/query-practice.ts:1`) queries `fts_vector` and will throw `column does not exist` at runtime. `/api/search` is unaffected (pure LIKE queries, `routes/search.ts`).
- **knowledge-repository events** (`fabric/src/events.ts`): `create`/`update` emit `knowledge_item_updated` on a module-local EventEmitter. `setKnowledgeEventBus` (claimed by @lore to be wired "in app.ts") is **never called in production**; the emitter has **zero listeners**.

### 5. Dispatch queue (AD2)

- **NOT BullMQ.** No BullMQ or Redis usage exists in the codebase (the only mentions are CLAUDE.md's tech-stack list and an aspirational comment in cost-sentinel.ts:180). The dispatch queue is a **module-level in-memory array** in `fabric/src/services/task-dispatcher.ts:122`.
- Design: subscribes `task_state_changed(toState=accepted, ownerAgentId set)` → enqueue; `session_ended` → handoff re-dispatch + drain; startup sweep of accepted tasks; drain calls `provisionSession` via the `provision-registry` indirection; ConcurrencyLimitError skips agent for the pass, CostCapExceededError pauses the drain, other errors evict the entry. Generation counter guards stale async drains.
- **Wiring status: DEAD in production.** `bootstrapFabric` registers it only when `dispatcherDeps` is provided (bootstrap.ts:77); `server-factory.ts` never provides it. `setProvisionSessionFn` is called only in the integration test (`__tests__/AD2-task-dispatcher.integration.test.ts:65`) — so even if deps were passed, drain would throw "provisionSession not registered".
- `GET /api/dispatch-queue` (`routes/dispatch-queue-routes.ts:22`) reads `getDispatchQueueSnapshot()` — in production it always returns `{entries: [], draining: false}`.
- Tasks actually reach sessions only via: `POST /api/sessions` (sessions-routes.ts:188, awaits `provisionSession` inline in the request) and routine manual trigger.

### 6. Notification dispatch (H2)

`registerNotificationDispatcher` (`fabric/src/services/notifications/dispatcher.ts:556`), wired at boot.

- **Subscriptions**: `item_created` → classify (blocking/high→push, medium→digest, low→drop); `cost_cap_breached` (hard→push bypassing everything, soft→digest); `cost_cap_warning` (critical→push, warning→digest); `routine_fired` (routineId contains `daily_digest` → `runDailyDigest`).
- **route()** (:630): loads config from `factory_settings` (`loadNotificationConfig`); applies alert prefs (injected via `readServerConfig` from server-factory.ts:170, fail-open all-ON); quiet hours (`isInSilenceWindow`) → enqueue reason=`silence`; factory silence (`isSilenced` — `silence_mode`, `silence_product_<teamId>`, `silence_window_start/end` in factory_settings) → enqueue; digest classification → enqueue reason=`digest`; flood control (in-memory window, maxPerMinute) → enqueue reason=`flood_coalesce`; otherwise `dispatchPush` via adapter (console | ntfy | smtp — `adapter-factory.ts`), failure → enqueue reason=`retry`, missing recipient → insert row status=`failed`.
- **Queue** (`notification_queue`): cap 10,000 pending with digest-first eviction (:244); at-least-once claim protocol (pending → sending+claimedAt → sent/failed; `recoverStuckLeases` requeues `sending` rows older than 5 min — but only at the top of `flushQueue`).
- **Drain loop: DOES NOT EXIST.** `flushQueue` (:379) is invoked solely by `POST /api/notifications/flush` (`routes/notifications-routes.ts:330`). `runDailyDigest` (digest.ts:41 — batch-claims ALL pending into one digest send) is invoked by `POST /api/notifications/digest` or the `routine_fired` handler — and `routine_fired` is never emitted in production (see §1). Rows enqueued for silence/quiet-hours/flood/retry stay `pending` forever unless an operator manually POSTs `/flush` or `/digest`. There is no silence-lift watcher despite flushQueue's docstring ("Called on silence lift").

### 7. Dependency watcher

`checkAndUnblockDependents` (`services/dependency-watcher.ts:26`), subscribed in app.ts:523 to `task_state_changed` where `toState==="done"`. SQL pre-filter: `state='hold' AND dependencies LIKE '%"<escaped-id>"%' ESCAPE '\'`; verifies all deps `done`; transitions `hold → accepted` via kernel `transitionTask` (emits `task_state_changed`) and emits a `notification` event (**which has no listener** — see Event Graph). Failures logged, not retried. Note: `dependency_met` event type exists but is never emitted; the watcher uses `notification` instead.

### 8. Git export

`registerGitExportHandler` (`fabric/src/services/git-export.ts:510`), wired at boot.

- **Trigger**: `knowledge_updated` events for items whose fabric row is layer L2/L4 with kind ∈ {BRIEF, ARCHITECTURE, BRAND, PRINCIPLES, FOCUS, PORTFOLIO, REFLECTION}; debounced (config `debounceMs`, in-memory — pending export lost on restart, documented). Config gate (`git_export.*` keys in factory_settings via `loadGitExportConfig`) re-checked after debounce.
- **`runGitExport`** (:388): per-repoPath promise mutex; init repo if needed (`git init -b <branch>`); plan = JOIN knowledge_items × fabric (status ∈ {active, validated}, layer L2/L4); writes `products/<scope>/<KIND>.md` / `factory/<KIND>.md` / `factory/REFLECTIONS/<topic>.md` (path-segment sanitization, traversal defense); deletes tracked files no longer in plan; commit (records `git_export.last_commit_*` to factory_settings); push to `origin` when remoteUrl set (records `last_push_at`). Total function — returns typed error results, never throws.
- **Routes** (`routes/git-export-routes.ts`): GET `/api/git-export` is a static descriptor; `/config` GET/PATCH (remoteUrl redacted), `POST /run` (manual/forced), `GET /status`.

### 9. Observability

- **Dispatcher** (`services/observability/dispatcher.ts:160`): ring buffer (cap from config), background `setInterval(flushIntervalMs)` drain (unref'd), batch-full early flush via microtask; adapter failure drops the batch (telemetry is disposable) and records lastError; status surfaced via `/api/observability` routes. Subscribed via **wildcard** `bus.on("*")` (:474) translating: session_started/ended, tool_call_recorded, task/bet_state_changed, cost events (→ `cost_incurred`), knowledge_updated (→ `knowledge_write`). Explicitly dropped: item_created, routine_fired, dependency_met, bet_revised, notification, artifact_created, thread events — plus **stale case labels `response_recorded` and `bet_committed` for event types that no longer exist in the DomainEvent union**.
- **Config** (`observability/config.ts:94`): `readObservabilityConfig` reads `observability.*` keys from `factory_settings` at startup (app.ts:494); `enabled` defaults false ⇒ **observability is OFF by default; no dispatcher, no wildcard subscriber**. Adapters: `console` (structured stdout) or `noop`. **No OTEL adapter exists in the server** — OTEL (`@opentelemetry/*`, OTLP exporter, BatchSpanProcessor) lives only in `packages/pipeline/src/otel.ts` for the build-pipeline tooling, not the app runtime.
- **TraceId resolver** (dispatcher.ts:142): `sessions.traceId` column was stripped (O2); the resolver is cache-only and **nothing calls `seed()`** — every trace falls back to sessionId/`task:`/`bet:`/`cost:` fallbacks. Effectively the resolver is vestigial.
- **Audit logs**: `tasks.auditTrail` JSON (state machine + revert path), `bets.revisionLog`, `knowledge_edit_log`, notification config PATCH audit via logger (`notifications-routes.ts:230`). No dedicated audit table mechanism.

### 10. Session provisioning chain (the main event cascade source)

`provisionSession` (`services/session-provisioning.ts:231`): cost-cap pre-flight (`checkCostCap`) → adapter select + concurrency check → task → `in_progress` → workspace spawn → `sessions` insert → materialize → file watcher → `session_started` emit → tool registry (+ builtin-harness injection) → CLAUDE.md compose → MCP bridge (graceful-degradation) → harness start → event-stream drain: `cost_update` → `recordCostAndCheck` (atomic accumulation on `users.costActual`, `team_members.costActual`, `bets.cost_actual_minor`; emits `cost_cap_warning`/`cost_cap_breached` with per-session in-memory dedup — `fabric/src/services/cost-cap.ts:224,354`), `token_usage` → in-memory accumulation → `bets.tokensActualJson` at teardown, `tool_call` → `tool_call_recorded` emit + (non-MCP path) registry invoke, `error` → crash → teardown: MCP unregister → `endSession`/`crashSession` (session row update, `session_ended` emit, routine_runs finalize, dedup release, workspace delete on success / preserved on crash).

### 11. WS broadcaster

`WsBroadcaster.start()` (`services/ws-broadcaster.ts:40`): forwards 16 event types to topics — `conversations` (item_created, knowledge_updated, thread_created), `work` (task/bet_state_changed, propagation_applied, artifact_created), `rail` (cost_cap_warning, propagation_failed), `thread:<id>` (append/resolve/reopen/archive — participant-authz via DB lookup), `session:<id>` (started/ended/tool_call_recorded — unauthz by design). Dead client removal on send failure. Note: `cost_cap_breached` is NOT forwarded to any WS topic (only `cost_cap_warning`).

### 12. Snapshot tables

`_l1_snapshot_threads/messages/items/responses` — created once by migration `packages/db/drizzle/0006_thread_primitive_l1.sql:12-15` as `CREATE TABLE ... AS SELECT *` backups before the L1 thread-primitive rewrite. **No application code reads or writes them** — referenced only by migration integration tests (`db/src/__tests__/*.integration.test.ts`). Pure frozen backups.

### 13. TTL / cleanup mechanisms

| Thing | Expiry check | Cleanup sweep |
|---|---|---|
| Login sessions (`login_sessions`) | At validation (`login-session.ts:128`) | **None — expired/revoked rows accumulate forever** |
| Invite codes (`invite_codes`) | At claim (`invite-code.ts:101`) | **None** |
| WS upgrade tokens | 60s TTL, single-use, in-memory; cap-based oldest-eviction (`auth/upgrade-token-store.ts`) | lazy (no timer) |
| Notification queue | lease recovery only inside manual flush | **No purge of sent/failed/dropped rows** |
| propagation_log | n/a | **None (documented as follow-up)** |
| knowledge_access_log | n/a | **None — grows per knowledge read** |
| Session activity buffer | 5-min post-session eviction timer (`session-activity-buffer.ts:74`) | in-memory only |
| Rate-limit buckets | LRU eviction at 10k entries | lazy |
| Cost-cap dedup map | released on session_ended (`registerCostCapDedupReleaser`) | event-driven |
| Desktop logs | `createLogRotator` on desktop boot (`desktop/src/log-rotation.ts`) | boot-time |

### 14. Hint system backend

`routes/hints.ts` — `GET /api/hint-progress`, `POST /api/hint-progress/:id/dismiss` (atomic `ON CONFLICT DO NOTHING ... RETURNING`, catalog-validated via `isHintId`). Purely request-driven; no automation, no TTL.

### 15. Cost sentinel (AD8c)

`startCostSentinel` (`fabric/src/services/cost-sentinel.ts:182`) — 15-min interval, unconditional (cannot be disabled via routine row). Reads `factory_settings.cost_cap` + `cost_actual`; classifies ok/warning(≥0.8)/breach(≥1.0); emits `cost_cap_warning`/`cost_cap_breached` **only on level transitions** (state persisted in `factory_settings.cost_sentinel_last_level`). **However: nothing in the codebase ever writes `factory_settings.cost_actual`** — `recordCostAndCheck` accumulates on users/team_members/bets only. Unless an operator manually maintains the setting (settings PATCH route), the sentinel always reads 0 and never fires.

---

## Event Graph

Counts exclude tests/evals/web. "WsB" = WsBroadcaster, "Obs" = observability wildcard (only when enabled). Wildcard subscriber sees everything.

| Event | Emitters (production) | Listeners (production) |
|---|---|---|
| `task_state_changed` | kernel `transitionTask` (task-state-machine.ts), lifecycle-propagation inline copy, session-provisioning revert, handoff-protocol, create-task skill tool | dep-watcher (app.ts:523), lifecycle-propagation, WsB(work), Obs · [task-dispatcher — unwired] |
| `bet_state_changed` | bet-state-machine/routes, lifecycle-propagation `transitionBetToCompletedAsync` | lifecycle-propagation (bet→team), builtin-routines (post-bet-retro), WsB(work), Obs |
| `session_started` | provisionSession, createSession, routine-scheduler, routines-routes fallback, sessions-routes | WsB(session:), Obs |
| `session_ended` | endSession, crashSession (+harness worker paths) | lifecycle-propagation, session-review-creator, cost-cap dedup releaser, activity buffer, WsB(session:), Obs · [task-dispatcher — unwired] |
| `item_created` | 12 sites (knowledge routes, skill tools, builtin routines, routine-scheduler review, session-review-creator, attention review factory) | policy-engine, notification dispatcher, WsB(conversations) |
| `thread_created` | threads routes, lifecycle-propagation ship-confirmation | WsB(conversations) |
| `thread_message_appended` | threads routes (2 sites) | assistant-dispatcher, WsB(thread:) |
| `thread_resolved` / `thread_reopened` | threads routes | WsB(thread:) |
| `thread_archived` | **none** | WsB(thread:) — listener for an event never emitted |
| `knowledge_updated` | 11 sites (knowledge routes, attention service, promotion pipeline, practice meeting, stale sweep) | git-export handler, WsB(conversations), Obs |
| `knowledge_created` | knowledge routes | **none** |
| `knowledge_archived` | knowledge routes | **none** |
| `knowledge_accessed` | knowledge routes GET /:id | **none** (was supposed to drive relevance recompute) |
| `artifact_created` | create-artifact skill tool | WsB(work) (no UI subscriber yet, documented) |
| `cost_cap_warning` | recordCostAndCheck, cost sentinel | notification dispatcher, WsB(rail), Obs |
| `cost_cap_breached` | recordCostAndCheck, cost sentinel | notification dispatcher, Obs — **not forwarded to WS** |
| `notification` | policy-engine "push" action, dependency-watcher | **none — fire-and-forget into the void** |
| `propagation_applied` | lifecycle-propagation (2) | WsB(work) |
| `propagation_failed` | retry exhaustion | WsB(rail) |
| `routine_fired` | `checkAndFireRoutine` only — **never reachable in production** (scheduler not started) | notification dispatcher (daily digest) — effectively dead |
| `tool_call_recorded` | provisionSession stream drain | activity buffer, WsB(session:), Obs |
| `bet_revised` | **none** | **none** — dead type |
| `dependency_met` | **none** | **none** — dead type |
| `knowledge_item_updated` (fabric-local EventEmitter) | knowledge-repository create/update | **none** (`setKnowledgeEventBus` never called) |

---

## Dead / Unwired Code

1. **`startRoutineScheduler` + `registerEventTriggers`** (routine-scheduler.ts:455,500) — exported, tested, never started. The entire cron/heartbeat routine system is inert.
2. **`registerTaskDispatcher`** (task-dispatcher.ts:404) — gated on `dispatcherDeps` that production never passes (server-factory.ts:167). The AD2 task→session auto-dispatch pipeline (startup sweep, accepted-task queue, handoff re-dispatch) never runs. `GET /api/dispatch-queue` always reports an empty queue.
3. **`setProvisionSessionFn`** (provision-registry.ts:36) — called only in the integration test; double-dead with #2.
4. **`runAutoPromotionSweep`** (promotion-pipeline.ts:428) — G3 auto-promotion (5-scope repetition → validated) has no production caller.
5. **`createRelevanceService`** (relevance-service.ts:54) — no production caller; `knowledge_accessed` was created to replace the inline call and has no subscriber. `relevance_score` is write-only-at-seed.
6. **`setupFts`** (fts.ts:13) — never called; `fts_vector` column never exists; `repo.search`/`query_practice` skill tool will fail at runtime.
7. **`setKnowledgeEventBus`** (fabric/events.ts) — bridge to shared EventBus never installed despite @lore claiming app.ts does; repository-level update events go nowhere.
8. **`bet_revised`, `dependency_met`** event types — never emitted, never consumed.
9. **`thread_archived`** — WsBroadcaster listens; no emitter exists.
10. **Observability dispatcher stale case labels** `response_recorded`, `bet_committed` (dispatcher.ts:454,457) — event types no longer in the union.
11. **`TraceIdResolver.seed`** — never called; DB resolver degraded to fallback-only after the `sessions.traceId` column was stripped.
12. **`startPollingWatcher`** (polling-watcher.ts:41) — exported fallback, never selected.
13. **Assistant dispatcher dispatch path** (assistant-dispatcher.ts:142) — logs "assistant dispatch triggered" and stops; session provisioning explicitly deferred. Only the AC-6 pinning side-effect is real.
14. **BullMQ** — listed in CLAUDE.md tech stack; zero usage. No Redis anywhere (the `EventBusAdapter` Redis interface is an unimplemented stub). Nothing breaks without Redis because nothing uses it.

---

## FLAGS

**Critical**
1. **No routine scheduler runs.** `startRoutineScheduler` is never invoked at boot → practice-meeting, portfolio-retro, knowledge-decay (and any operator-created calendar routine, despite the create-route computing `nextRunAt`) never fire automatically. Knowledge decay (90-day stale sweep) therefore never runs unless manually triggered.
2. **Daily digest can never fire automatically**: depends on `routine_fired` (never emitted, see #1) AND the seed routine is `active:false`. The dispatcher's digest subscription is dead wiring.
3. **Notification queue has no drain loop.** Quiet-hours/silence/flood/retry-deferred rows stay `pending` forever unless an operator manually calls `POST /api/notifications/flush` or `/digest`. The "blocking items always surface to a human" guarantee (UX-3, per the dispatcher's own lore) is not met.
4. **Task auto-dispatch (AD2) is unwired in production** (dispatcherDeps never passed; provisionSession never registered). Accepted tasks with owner agents are never auto-provisioned; only manual `POST /api/sessions` works.
5. **`notification` events have zero listeners** — policy-engine "push" decisions and dependency-watcher unblock notices vanish. The policy engine's most important outcome (push to human) is a no-op beyond the audit trail.
6. **Factory cost sentinel reads `factory_settings.cost_actual`, which nothing writes** — factory-level cost monitoring (and the scheduler's factory-cap gate) compares against a value that never updates.
7. **`setupFts` never runs** → `query_practice` skill tool (agent-facing knowledge search) throws at runtime (`fts_vector` column missing).

**High**
8. **Relevance scoring never recomputes** — `knowledge_accessed` has no subscriber; `createRelevanceService` has no caller. L22 signals are dead.
9. **Auto-promotion sweep (G3) never runs** — provisional knowledge can only be promoted manually; the "5 scopes → validated" rule is inert.
10. **Lifecycle-propagation retry semantics are broken**: `retryFailedPropagations` increments `attempts` on the original `pending_retry` row, then re-executes the propagation — which writes a NEW log row. The original row is never marked applied on a successful retry; after 3 ticks (≈90s) it is marked `failed` + emits `propagation_failed` + enqueues a notification even when a retry actually succeeded, and each retry duplicates log rows.
11. **Real type errors hidden from `npm run check`**: `assistant-dispatcher.ts:133,145` access `event.hostId`, which does not exist on `ThreadMessageAppendedEvent` (verified TS2339 when typechecking the fabric project directly), yet root `npm run check` (`tsc --noEmit -p tsconfig.json` with `include: []` + project references, no `--build`) exits 0 — the root typecheck does not actually check fabric sources.

**Medium**
12. No TTL cleanup for `login_sessions`, `invite_codes`, `notification_queue` (sent/failed/dropped), `propagation_log`, `knowledge_access_log` — unbounded growth.
13. `recoverStuckLeases` (crash-recovery for `sending` notification rows) only runs inside the manual flush — a crash mid-send leaves rows stuck until an operator flushes.
14. `cost_cap_breached` is not forwarded to any WS topic (only `cost_cap_warning` reaches `rail`) — the UI cannot see hard breaches live.
15. Observability is disabled by default and offers only console/noop — no OTEL in the app runtime (OTEL exists only in the build-pipeline package). With it disabled, the wildcard subscriber doesn't exist at all.
16. Event-triggered operator routines (`registerEventTriggers`) read the routines table once at registration — new event-routines created at runtime would require restart — moot today because the scheduler never starts, but a trap once it does.
17. `registerBuiltinRoutineHandlers` fires post-bet-retro on EVERY `bet_state_changed(completed)` including replays; protected only by the LIKE-probe body-marker dedupe.
18. Git-export debounce state is in-memory — a restart mid-burst silently drops the pending export until the next knowledge_updated event (documented as accepted).
19. CLAUDE.md tech stack claims BullMQ; the codebase has none — doc/code drift that will mislead future agents.
