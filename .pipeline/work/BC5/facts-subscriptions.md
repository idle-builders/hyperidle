# BC5 — facts: routines, notifications, events, the one websocket

Census 2026-09-22, worktree `pipeline-bc5-user-subscriptions` at `84b4626fb`. Facts only.

## 1. Package `layers/core-api/routine`

### 1.1 Files
Production: `routine-scheduler.ts` 771 · `routine-service.ts` 671 · `ports.ts` 211 · `schedule-label.ts` 171 · `cron.ts` 146 · `index.ts` 86 = **2056**. Tests (7 files) 1773: `routine-service.integration` 605, `routine-run-resolver.integration` 531, `routine-transition-constraint.integration` 205, `routine-scheduler-completeness.integration` 174, `cron-equivalence` 132, `schedule-label` 81, `routine-transition-filter` 45. Deps: db, diagnostics, domain-model, event-bus, drizzle. Dev: document, org, users.

### 1.2 Exports
Types `RoutineSchedulerPorts, FireResult, RoutineScheduler, RoutineSchedulerConfig, Routine, RoutinePatch, RoutineRun, RoutineRunPatch`. Functions `fireGenericRoutine, startRoutineScheduler, computeRoutineNextRunAt, getRoutine, getRoutineRun, insertRoutine, insertRoutineRun, listRoutineRuns, listRoutines, parseTransitionTo, setRoutinesLive, softDeleteRoutines, updateRoutine, updateRoutineRun, humanizeSchedule`. Not exported: the tables, `resolveRoutineRunRequest`, cron internals.

### 1.3 `routines` table (`schema.ts:600-687`)
`id` · `name` default `""` · `owner_agent_id` NOT NULL → users RESTRICT (the only ownership axis; **no team_id**) · `trigger_type` (`calendar|event|heartbeat|continuous`; only calendar/event creatable) · `trigger_config` JSON (`{"cron":…}` / `{"transitionTo":…}`; seed also stuffs `taskId`) · `event_type` · `state_key` (unused) · `human_review` · `autonomy_level` · `silent` · `active` (deprecated-but-live, synced with state) · `state` (`active|paused|error`) · `last_run_at` · `next_run_at` · `deleted_at` (soft delete) · `last_run_summary` · `created_at` · `stub_task_id` (AA2 legacy, never written).
**Prompt is not a column** — a `documents` row with `parentKind='routine', parentId=<id>, slot='prompt'` (migration 0077 dropped `prompt_knowledge_id`).

### 1.4 `routine_runs` (`schema.ts:717-742`)
`id` · `routine_id` NOT NULL → routines **RESTRICT** (why delete is soft everywhere) · `started_at` · `ended_at` · `outcome` (`success|error|skipped|running|timeout`) · `error_message` · `session_id` → sessions SET NULL · `summary`.

### 1.5 Scheduler mechanics (`routine-scheduler.ts`)
- `registerRoutineEventMatcher` (604–662): one `eventBus.on` **per member of `EVENT_TYPES` (all 20)**, compile-time set. Per delivery: `canProvision` gate → `listRoutines({triggerType:"event", eventType, active:true})` → `originRoutineId` loop guard → `assembleTriggerEvent` → transition-constraint filter (`parseTransitionTo`; constraint set but event has no `transition` → no fire) → `fireGenericRoutine` fire-and-forget.
- `originRoutineId` (285–302): only when event carries `sourceKind` `routine`/`routine_run`; header admits an event caused by the routine agent's *actions* (edit task → `task_state_changed`) returns null — not guarded.
- `fireGenericRoutine` (123–258): coalescing guard on a running run row → `skipped`; one tx: `insertRoutineRun({outcome:"running"})` + `resolveRoutineRunRequest`; `agent_not_runnable` → terminal error run + `updateRoutine({state:"error", active:false})`; then **outside tx** `ports.workIntents.enqueueWorkIntent({kind:"routine_run", sourceKind:"routine_run", sourceId: runId, requestedBy: defaultAgentId, idempotencyKey:"routine:<runId>", bakedRequest})`; then emit `agent_work_intent_recorded`; then `updateRoutine({lastRunAt, nextRunAt})`. **A routine firing produces an intent, not a session.** Port wired at `routine-scheduler-bindings.ts:97` → `port.intents.submit`.
- Cron: no library. `cron.ts` 146 lines, 5-field parser, `nextCronMatch` brute-forces minute by minute up to 400 days, UTC. `computeRoutineNextRunAt`: heartbeat/continuous → now + intervalSeconds; calendar → cron; else null.
- Tick: `startRoutineScheduler` (705–771) `setInterval(fn, pollIntervalMs)` (default 30 s, `service-bootstrap.ts:66`), `tickRunning` flag, optional `reap()` every 5 min, `listRoutines({active:true})` filtered `triggerType!=="event" && nextRunAt<=now`. Started `service-bootstrap.ts:387-418`.

### 1.6 How a run becomes a session
`resolveRoutineRunRequest` (`routine-service.ts:479-604`) bakes `{ defaultAgentId: ownerAgentId, sourceKind:"routine", sourceId: runId, streamId:"routine:<id>", teamId?, userId?, taskId:null, sourceCorrelation:{routineId, routineRunId, teamId?}, contextBundle?, agentConfig, harnessDisabled? }`. Gate: run `running`, routine non-deleted/active/state active, owner `requireRunnableAgent`. Prompt read via injected `getRoutinePrompt` → production binding `search_documents` `parent:{kind:"routine",id}, slot:"prompt"`, **no status filter**, actor = owner. Body lands in `contextBundle.routine.prompt` and drives document ranking.

### 1.7 Routes and UI
`routes/routines-routes.ts` 709 lines: `GET /event-types` (287; `RoutineCreateDialog.tsx:100`, `RoutineDetailPane.tsx:213`) · `POST /` (292; `RoutineCreateDialog.tsx:157`) · `GET /` (427; no UI caller — list comes from `GET /teams/:id`) · `DELETE /:id` (452; `RoutineDetailPane.tsx:340`) · `GET /:id` (490; `useRoutine.ts:38`) · `PATCH /:id` (585; `RoutineDetailPane.tsx:279,312`) · `POST /:id/trigger` (677; `RoutineDetailPane.tsx:327`).
Notes: `eventTransitionTo` legal only on `task_state_changed` (359); create/patch write the prompt via `edit_document` internal with `scopeKind: ownerTeamId ? "team" : "factory"`; DELETE archives every document parented to the routine; trigger 403s on inactive; "previous run still in progress" → `coalesced`.
Team page: `teams-routes.ts:600-645` resolves routines by `listRoutines({ownerAgentIds})` + latest run + `humanizeSchedule`; `:205-227` `routineCount`.
UI: `pages/WorkRoutine.tsx` 151 (route `work/routine/:routineId`, `router.tsx:83`), `pages/work/RoutineDetailPane.tsx` 718, `pages/work/RoutineCreateDialog.tsx` 340, `hooks/useRoutine.ts` 61, routine block in `WorkTeam.tsx` ~446–520 (`?routine=` split pane).

### 1.8 Tools
`create_routine` (`tool-definitions.ts:221-301`), `update_routine` (320–361), registered 392–393, `roles:["assistant"]`, via `ports.coreApi.insertRoutine`/`getRoutineById` seams. **No trigger tool.** Both in `LEGACY_TOOLS`.

### 1.9 Plugin-contributed routines
`plugin_contributions` kind includes `routine`. `platform-actions.ts` install: 207–226 pushes prompt doc spec `ki_rp_<routineDbId>`; 589–624 Phase 1 tx `deps.agents.insertIfAbsent` + `deps.routines.insert(… onConflictDoNothing)` + `setNonDocumentContributionsLive`; Phase 2 documents; Phase 3 `recordContribution`/`forgetContributionsExcept`, stale routines → `softDelete`, stale agents → `inactive`; Phase 4 archive stale docs. Disable/enable → `setRoutinesLive` (`routine-service.ts:627-645`).
Shipped plugin routines (`plugins/document-management/plugin.json`, owner `librarian`): `document-decay` calendar `0 3 * * 0`; `document-triage` calendar `0 4 * * 0`; `post-task-retro` event `task_state_changed` `{"transitionTo":"done"}`. `role-personas` contributes none.

### 1.10 Routine reactions in core
`services/routine-run-session-end-reactions.ts` 159 (`session_ended`, `agent_run_lifecycle_changed` → finalize `routine_runs` + `routines.lastRunAt`; requires `sourceKind==="routine" && sourceId && routineRunOutcome`) · `services/agent-run-admission-reactions.ts` 280 (`routine_run` case 213–220 → run error) · `services/routine-scheduler-bindings.ts` 189 (composition root).
`routineRunOutcome` emitters: `transition-run.ts:240, :319`, `runtime-reapers.ts:210` (timeout), `session-store.ts:211`.

## 2. Package `layers/core-api/notifications`

### 2.1 Files
`install.ts` 299 · `notification-queue.ts` 299 · `ports.ts` 79 · `index.ts` 37 = **714**. Zero tests in package; tests in `layers/core-api/src/__tests__/notifications/` (3 files) + `notifications-test-deps.ts` (knip-ignored). Exports `enqueue, listNotifications, markNotifications, reap, deliver, readPreferences, updatePreferences`; deps bag `serverConfig: {read, update}`.

### 2.2 `notification_queue` (`schema.ts:962-1016`)
`id` · `event_type` · `subject_id` (the subject, not an addressee) · `severity` · `title` · `body` · `reason` · `channel` · `status` (`pending→sending→sent|failed|dropped`) · `attempts` · `last_error` · `created_at` · `sent_at` · `claimed_at` · `type_key` · `urgency` · `source_link` · `seen_at` · `read_at`. **No recipient column, no FK to users.** `GET /inbox` reads `readAt IS NULL` for everybody; `POST /seen` marks **all** rows.

### 2.3 `NOTIFICATION_TYPES` (`framework/domain-model/src/notifications.ts`, 75)
Two: `review_request`, `blocker_alert`. `cost_alert` hard-deleted; `agent.health.degraded`, `auto_unblock` deliberately absent.

### 2.4 Mute singleton
`server_config.config.notifications.mutedTypes: string[]`; `install.ts:190-215` `getMutedTypeKeys`/`setMuted`. Global.

### 2.5 Routes and UI
`routes/notifications-routes.ts` 125: `GET /inbox` (39; `useNotifications.ts:45`; cap 50, immediate first, never returns body) · `POST /seen` (72; `useNotifications.ts:64`) · `POST /:id/read` (82; `:73`) · `GET /mute` (99; `useNotificationMute.ts:28`) · `PUT /mute/:key` (109; `useNotifications.ts:82`, `useNotificationMute.ts:49`).
UI: `hooks/useNotifications.ts` 95, `useNotificationMute.ts` 60, `shell/NotificationPopover.tsx` 390, `shell/notification-display.ts` 12, `ds/NotificationRow.tsx` 72, `settings/SettingsNotifications.tsx` 66, badge click `shell/Sidebar.tsx:125`. **UI subscribes to nothing** — fetch on mount + manual refetch.

### 2.6 `notification` bus event
Emitters: two, `layers/core-api/task/src/dependency-watcher.ts:83, :155`, both `kind:"auto_unblock"`. Subscribers: **zero** (BC3 deleted the listener). `kind` typed `"attention"|"auto_unblock"`; nothing emits `attention`.

### 2.7 Off-registry writer
`services/agent-health-session-end-reactions.ts` 201: on `session_ended` `outcome==="crashed"`, writes queue rows `eventType:"agent.health.degraded"`, **no typeKey** (unmutable, fallback label). Window 7 days, threshold 3; below threshold rows born `dropped` with seen/read stamped (count over the queue itself). Non-transactional read-then-insert.

### 2.8 SMTP
`install.ts:deliver()` (216–286) is **test-send only** (`{kind:"test"}`, from=to=`smtpFrom`), never touches the queue; `password: null` hardcoded (`readNotificationConfig` 95–113, lore: credential row had no writer since BC1); auth always omitted. **No production caller of `deliver`.** `nodemailer` still a dependency. Retained: `scrubErrorMessage`, `classifySmtpRetriable`.

### 2.9 Desktop OS notifications
None.

## 3. Events

### 3.1 `EVENT_TYPES` — 20 members (`framework/event-bus/src/events.ts`)

| # | type | emitter | subscriber (besides the routine matcher, which takes all 20) |
|---:|---|---|---|
| 1 | `agent_work_intent_recorded` | `routine-scheduler.ts:241` | `start-runtime.ts:325` (wake drain) |
| 2 | `agent_run_admission_failed` | `runtime.ts:317`; `session-requests/service.ts:508` | `agent-run-admission-reactions.ts:261` |
| 3 | `agent_run_lifecycle_changed` | `transition-run.ts:110` | `routine-run-session-end-reactions.ts:145`; `work-session-end-reactions.ts:145` |
| 4 | `task_state_changed` | `task-actions.ts:819, :830` | `lifecycle-propagation.ts:407`; `app.ts:620` (dep-watcher, done only) |
| 5 | `session_started` | `provisioner.ts:1304` | `session-activity-gateway.ts:71`; `work-session-started-reactions.ts:109` |
| 6 | `session_ended` | `transition-run.ts:212, :302`; `runtime-reapers.ts:201`; `session-store.ts:138, :203` | gateway:74; `session-activity-buffer.ts:100`; `lifecycle-propagation.ts:391`; `routine-run-session-end-reactions.ts:137`; `work-session-end-reactions.ts:154`; `agent-health-session-end-reactions.ts:187` |
| 7 | `session_handoff_completed` | handoff-protocol | `start-runtime.ts:393` |
| 8 | `session_not_returned` | `provisioner.ts:2000` | `session-not-returned-notice.ts:63` |
| 9–12 | `thread_created` / `thread_message_appended` / `thread_resolved` / `thread_reopened` | `thread-actions.ts:1130 / 1120 / 1141 / 1150` | routine matcher only |
| 13 | `sandbox_writeback_changes_detected` | `file-watcher.ts:77` | `writeback-processor.ts:631` |
| 14 | `team_created` | `teams-routes.ts:326`; `tool-definitions.ts:118` | matcher only |
| 15 | `agent_added` | `tool-definitions.ts:183` | matcher only |
| 16 | `user_created` | `routes/users.ts:177` | matcher only |
| 17 | `notification` | `dependency-watcher.ts:83, :155` | **none** |
| 18 | `propagation_applied` | `lifecycle-propagation.ts:137, :258, :272` | matcher only |
| 19 | `propagation_failed` | `lifecycle-propagation.ts:156, :291` | matcher only |
| 20 | `tool_call_recorded` | `provisioner.ts:1870` | gateway:77; `session-activity-buffer.ts:99` |

Bus: `framework/event-bus/src/event-bus.ts` 120 lines, synchronous in-process, per-handler try/catch, no persistence, `streamId` carried but unused.

### 3.2 Target nine vs `changes` rows today
`changes` (`schema.ts:574-598`, migration 0083; kind widened by 0085): `id, object, object_id, kind, actor → users RESTRICT, before, after, at`. Written today: `task` created (`task-actions.ts:711`) / changed (380, 730); `thread` created (`thread-actions.ts:891, 1303`) / message (1053; objectId = thread id) / changed (1087, 1397); `document` created (`document-actions.ts:741`) / changed (776, 829 cascade). **Seven of nine exist; `user.created`/`user.changed` do not** (nothing writes `object:"user"`).
**The bus emits nothing per `changes` row.** task/thread append rows *and* emit legacy events; document emits no bus event at all. Per-row is only the websocket push.

### 3.3 Governance rule (`tools/governance/src/rules/actions-projected.ts`)
Clause 4 parses `EVENT_TYPES` textually; every member must be in `OBJECT_EVENTS` (the nine; none in `EVENT_TYPES` today), `PLATFORM_EVENTS` (eight: `agent_work_intent_recorded, agent_run_admission_failed, agent_run_lifecycle_changed, session_handoff_completed, sandbox_writeback_changes_detected, tool_call_recorded, propagation_applied, propagation_failed`) or `LEGACY_EVENTS`; a legacy entry no longer in `EVENT_TYPES` is also a finding.
`LEGACY_EVENTS` verbatim: `task_state_changed, session_started, session_ended, session_not_returned, thread_created, thread_message_appended, thread_resolved, thread_reopened, team_created, agent_added, user_created, notification` (comment: "`task_state_changed` … still emitted from `edit_task` until subscriptions replace it").

### 3.4 Session events' consumers
Lifecycle propagation (`policy/src/lifecycle-propagation.ts` 423) · agent health (crashed only) · routine finalize · `work-session-started-reactions.ts` 122 (`markRunning` + `edit_task` → in_progress) · `work-session-end-reactions.ts` 169 (dispatch-attempt finalize + `tokensByTier` via `edit_task`) · `session-not-returned-notice.ts` 77 (`send_message` into `callingThreadId`; no-op for routine runs).

## 4. The one websocket
- `ws-connection-hub.ts` 143 (`broadcast(topic, data)`), `routes/ws.ts` 166 (`GET /ws`, one-shot `?token=`, subscribe/unsubscribe/forbidden acks). Bound `remote-server/create-server.ts:384`, `desktop/create-server.ts:268`; `app.ts:359-361` threads `wsPush` into `buildCoreActions`.
- Topics: `conversations` (`thread-actions.ts:316` → `useThreads.ts:83`) · `thread:<id>` (293 → `useThread.ts:96`, `useThreadTasks.ts:72`) · `documents` (`document-actions.ts:326` → `useDocuments.ts:83`) · `document:<id>` (311 → `useDocument.ts:82`) · `session:<id>` (gateway → `useSessionActivity.ts:111`). `work` gone (BC1). **Tasks have no topic** — `task-actions.ts` has no `wsPush`.
- Authorizer `ws-subscribe-authorizer.ts` 199: `conversations`/`documents` any identity; `thread:` via `canReadThread`; `document:` via `canReadDocument` with owned agents + viewerTeamId; `session:` `Boolean(sessionId)`; else false. `forbidden` ack ignored by `ws-client.ts` (silence).
- Payloads: thread/document push the **full changes row** `{type:"update", topic, kind:"thread.message"|…, data:{id, object, objectId, kind, actor, before, after, at}}` post-commit on both per-object and global topic (global topics redact fields); session pushes a content-free nudge.
- Client `services/ws-client.ts` 271, singleton `getWsClient().subscribe(topic, handler)`, backoff `[1,2,4,8,15]s`. **No `useLiveTopic` hook** — six hooks hand-roll subscribe in `useEffect`; `useNotifications` subscribes to nothing.

## 5. Reactions (`layers/core-api/src/services/`, registered `service-bootstrap.ts:220-294`)
`agent-run-admission-reactions.ts` 280 · `routine-run-session-end-reactions.ts` 159 · `agent-health-session-end-reactions.ts` 201 · `work-session-started-reactions.ts` 122 · `work-session-end-reactions.ts` 169 · `session-not-returned-notice.ts` 77 · `policy/src/lifecycle-propagation.ts` 423 · `task/src/dependency-watcher.ts` 163 (wired `app.ts:620`; killed path called synchronously from `cascadeTaskKill`) · orchestration: `session-activity-gateway.ts`, `writeback-processor.ts:631`, `start-runtime.ts:325, :393`, `session-activity-buffer.ts:99-100`. All core reactions use a `WeakSet<EventBus>` idempotency guard.

## 6. Mention wake path (BC3)
`thread-actions.ts:1200-1238`, post-commit in `send_message`: `agentsToWake` (`domain-model/actions/thread.ts:503-517`: every mentioned AI + the other member of a 2-member thread if AI, minus sender) → `resolveThreadTurnRequest` → `deps.agentWorkIntentRecorder({kind:"thread_turn", sourceKind:"thread_message", sourceId:"<messageId>:<agentId>", requestedBy: actor, idempotencyKey:"thread-turn:<messageId>:<agentId>", bakedRequest})`; bake failure drops that wake only.
"One intent per agent" is per identity tuple: `uniqueIndex agent_work_intents_identity_uq (kind, source_kind, source_id, idempotency_key)` (`schema.ts:428-433`); CHECK `agent_work_intents_kind_source_compat_ck` closed pairing map (456–467; still spells `assistant_turn` while code/0085 use `thread_turn`); `insertIntentInternal` (`session-requests/service.ts:767-814`) onConflictDoNothing; status `superseded` (AU21 B‴: fresher idempotencyKey for same `(kind, sourceId)` wins). `AGENT_WORK_INTENT_KINDS = [thread_turn, session_start, knowledge_action, routine_run, task_run]`. **A new kind/source pairing needs a migration widening the CHECK.**

## 7. Seeds
Routines: `tools/setup/src/demo-fixture.ts:330-347` one row `demo-routine-daily_digest` (calendar `0 8 * * *`, `state:"active"` but `active:false` — contradictory, never fires), owner `seed-agent-cos`; `demo-world/activity.ts:262-281` one run row. Ritual routines removed from demo (plugin supplies them).
Notifications: `demo-world/activity.ts:195-260` three rows (`review_requested`×2, `task_blocked`; eventType values match nothing in code).
Eval: `tools/eval/src/scenarios/routine-sessions.ts` 451 (heartbeat routine, reads tables directly).

## 8. Counts
Production that would go: routine pkg 2056 · notifications pkg 714 · `routines-routes.ts` 709 · `notifications-routes.ts` 125 · `routine-scheduler-bindings.ts` 189 · `routine-run-session-end-reactions.ts` 159 · `agent-health-session-end-reactions.ts` 201 · UI 1965 (`useRoutine` 61, `useNotifications` 95, `useNotificationMute` 60, `WorkRoutine` 151, `RoutineCreateDialog` 340, `RoutineDetailPane` 718, `NotificationPopover` 390, `notification-display` 12, `SettingsNotifications` 66, `NotificationRow` 72) · domain-model `routine.ts` 139 + `notifications.ts` 75 · tools ~164 = **≈ 6,496**. Partially affected: `teams-routes.ts` ~50, `WorkTeam.tsx` ~80, `platform-actions.ts` ~60, `service-bootstrap.ts` ~40.
Tests: routine pkg 1773; 11 routine integration under core-api/src; 3 notification integration; 8 core-ui; eval 451. 20 test files hit these routes by URL.
Vitest projects `layers/core-api/routine`, `layers/core-api/notifications`; knip ignores `notifications-test-deps.ts`.

## Surprises (census agent's summary)
1. `notification_queue` has no recipient — already one global feed; `POST /seen` marks everything for whoever clicks.
2. `notification` bus event has zero subscribers; both emitters send `auto_unblock` — a no-op channel since BC3.
3. The only real inbox writer (agent health) writes an off-registry type with no typeKey — never mutable.
4. Email is dead: test-send only, password null, no production caller of `deliver`.
5. Matcher subscribes to all 20 events and queries the DB per delivery even with zero event routines.
6. Loop guard misses the common case (routine agent's own edits).
7. Cron: 146 hand-rolled lines, brute-force scan, errors swallowed by `safeNextRunAt`.
8. `user.created`/`user.changed` rows don't exist; no `edit_user`.
9. Bus emits nothing per `changes` row; document emits no bus event; task/thread run both mechanisms.
10. Tasks have no websocket topic.
11. `session:<id>` authorised by `Boolean(sessionId)`; `forbidden` silently ignored by the client.
12. No `useLiveTopic`; six hand-rolled subscriptions; notifications subscribe to nothing.
13. Demo routine row contradicts itself (`state:active`, `active:false`).
14. Schema CHECK still spells `assistant_turn`.
15. Governance already names the exit: 12 legacy events, 12 routes, 2 tools in shrink-only lists — deleting them means editing the rule in the same PR.
