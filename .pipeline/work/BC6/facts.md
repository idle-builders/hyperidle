# BC6 — code facts (census 2026-09-22, origin/main b3ffde4f3)

Working file for the run. Deleted at ship; what outlives the run goes into plan.md.

## The session surface today

**Routes** — the plan says "six routes in one folder, close to the shape". They are eight
registrations in four files with four different mounts:

| Route | File | Caller |
|---|---|---|
| `GET /api/sessions` | `agent-orchestration/src/routes/sessions.ts` | **none in production** (5 Playwright stubs) |
| `GET /api/sessions/:id/activity` | same | `useSessionActivity` → session viewer |
| `GET /api/agent-orchestration/runs` | `routes/agent-orchestration-sessions.ts` | task page sessions list, agent profile, team roster |
| `GET /api/agent-orchestration/runs/active-counts` | same | Settings→Agents, recipient picker live dot |
| `GET /api/agent-orchestration/sessions/:sessionId` | same | port `sessions.getById` |
| `POST /api/agent-orchestration/runs/abort` | `routes/agent-orchestration-intake.ts` (350 lines, mixed with filesystems + review-gate) | **none** — port method exists, nobody calls it; only live abort is layer-internal (`provisioner.ts:1599`, opencode return action) |
| `POST /api/agent-orchestration/runs/stop-for-tasks` | same | `edit_task` after commit for killed tasks (`task-actions.ts:812`) via `AgentOrchestrationPort.runs.stopForTasks` — CAS-marks rows `stopped`, **never emits `session_ended`, never kills the harness process** |
| `GET /api/agent-orchestration/ws` | `routes/session-stream-ws.ts` (pre-auth on the app router) | `getSessionStreamClient()` in `core-ui/src/services/ws-client.ts` |

So: a user or agent **cannot stop a session today**. The only way is killing its task.

**Two websockets, two protocols.** Core's `GET /api/ws` (`core-api/src/routes/ws.ts`) sends
`{type:"update", topic, kind, data}` nudges on `thread:<id>`, `document:<id>`, `conversations`,
`documents`; authorizer `ws-subscribe-authorizer.ts` **explicitly denies `session:`**. The
session socket (`SessionStreamHub`, `session-activity-gateway.ts`) tees raw event JSON —
`session_started`, `session_ended`, `tool_call_recorded` — on `session:<id>`. The client
(`ws-client.ts:243-250`) has two matching branches. Only one subscriber: `useSessionActivity`.
The session socket keys upgrade identity per request (WeakMap); core's socket still uses the
module-scoped slot the session socket's @lore calls a race.

**Data.** One table `sessions` (`framework/db/src/schema.ts:262-327`, 18 columns incl.
`taskId`, `agentId`, `state`, `startedAt/endedAt`, `outcome`, `notes`, `routineId`,
`harnessSessionId`); "runs" are the same rows (`listRunSummaries`). Also
`agent_session_requests` (23 cols), `agent_work_intents`, `explicit_session_starts`,
`agent_run_config`, `review_sessions`, `task_dispatch_attempts`. **Session activity is never
persisted** — in-memory ring buffer `session-activity-buffer.ts` (100 entries/session, evicted
5 min after end, by decision). Owner: `run-orchestration/src/session-store.ts` + friends.

**Stopping.** `sessionRunRegistry.abort(sessionId)` (`session-requests/src/session-run-registry.ts:79-91`)
flips a cooperative flag and calls `adapter.stopSession(handle)` — the real harness kill.
`stop-for-tasks` never reaches it. `writeSessionNotes` exported, no caller; the notes write
that happens is a direct update in `writeback-processor.ts:572`.

**Ports.** core→orch `AgentOrchestrationPort` (`framework/api-contract/src/agent-orchestration-port.ts`):
`sessions.getById`, `intents.submit/recordReviewVerdict`, `requests.failExplicitSessionStart`,
`runs.stopForTasks/endForHandoff/abort`, `runConfig.read/readBatch/write`,
`filesystems.getTeamId/persistInjection`, `gate.linkReview` — all HTTP over an in-process
transport (`applications/*/src/create-server.ts`). orch→core `CoreApiPort`: `users`, `org`,
`routine` only. Run outcomes cross back on the shared in-process EventBus (no port). `CoreApiBoot`
hands orchestration `actionTools`, `editDocument`, `searchDocuments`, `wsHub`, `upgradeTokenStore`.

**Session events.** `session_started` (provisioner) → activity gateway (WS) + `work-session-started-reactions`
(→ `edit_task`); `session_ended` (transition-run, reapers, session-store) → WS, buffer eviction,
lifecycle-propagation, `work-session-end-reactions`, agent-health, routine-run reactions;
`session_not_returned` → `send_message` notice; `agent_run_lifecycle_changed` (platform);
`session_handoff_completed` **has no emitter**. `tool_call_recorded` → WS + buffer.

**UI.** Session viewer `SessionView.tsx` (743 lines) + `SessionViewPanel` on the Conversations
page + `useSessionActivity` — **unreachable in production**: its two entry points
(`session-reference` embed, `opensSession` tool part) are set only by stories and tests. Task page
"Sessions" section: one-shot `GET /runs?task_id=`, rows not clickable, no live update. Agent
profile / team roster / Settings→Agents / recipient picker read `/runs` or `/runs/active-counts`.
`sessions` is **banned from `TaskView`** by founder ruling (`domain-model/src/actions/task.ts:151-154`).

**Agent tools about sessions: none.** Tool set = 10 action tools + `create_team · add_agent ·
create_routine · update_routine` + per-session `return_status`.

**The composition root joins routers, not action lists.** `composeApiApplication` mounts
`[coreApi.app, agentOrchestration.app]` on one `/api` router behind one auth. But
`buildCoreActions` is called once inside `createCoreApiApp` (`core-api/src/app.ts:431`) and the
applications only ever see `coreApi.actionTools` (already MCP-projected). There is no join site for
a second layer's action list yet. HTTP mount loop `actions/actions-router.ts` (`POST /api/actions/<name>`),
MCP loop `actions-as-tools.ts`, UI `call.ts` (`Actions = TASK & THREAD & DOCUMENT`), governance
rule `tools/governance/src/rules/actions-projected.ts` (468 lines; `LEGACY_ROUTES` 72 entries,
`LEGACY_TOOLS` 5, `LEGACY_EVENTS` 12; `PLUMBING_ROUTES` already holds seven intake rows incl.
`runs/end-for-handoff`; `abort` and `stop-for-tasks` sit in LEGACY).

## The platform surface today

**Routes — counts match the plan exactly.** Six in `core-api/src/routes/plugins.ts` (984 lines):
`GET /`, `POST /` (install), `POST /:id/enable`, `POST /:id/disable`, `DELETE /:id`,
`POST /:id/contributions/restore`. Four in `routes/credentials.ts` (242): `GET /`, `PUT /:name`,
`DELETE /:name`, `POST /:name/validate`. Callers: only `SettingsPlugins.tsx` (491, raw `apiFetch`)
and `CredentialsTab.tsx` (312, raw `apiFetch`). **No agent tool** touches either; `manage_plugins`
exists only as prose in ACTIONS.md.

**Settings package** `layers/core-api/settings` (2,306 src lines: installer 701, manifest 602,
configuration 406, server-config 235, contributions 174, fetch 121). Owns `plugins`,
`plugin_configuration_defaults`, `plugin_contributions`, `configuration_overrides`, `server_config`.
`disable/enable/removePlugin` only flip `plugins.state`; **all domain-row work lives in the route**
(agents → users rows, routines → routines rows, identity/prompt/skill files → `edit_document` with
`internal: true`). Only `plugins.ts`, `routines-routes.ts`, `agent-identity.ts` set `internal`.
`markDetached` is bound as `edit_document`'s `onBodyChanged` (a person's edit detaches a
contributed document; reinstall leaves it alone).

**Two contribution vocabularies.** `CONFIGURATION_KINDS` = agent · skill · routine · tool ·
mcp_server · harness_descriptor → `plugin_configuration_defaults` rows, read only by the
Agent-behavior settings page (`harness_descriptor` read by nothing). `PLUGIN_CONTRIBUTION_KINDS` =
agent · routine · document · configuration_default → registry rows (`configuration_default` never
written). Real end-to-end paths: agents, routines, documents, `mcp.json` (→ provisioner).
**Neither bundled plugin uses `contributions[]`** — both `plugins/document-management` (librarian
agent; routines document-decay, document-triage, post-task-retro; three skills) and
`plugins/role-personas` (seven agents with identity files) go through the registry only. The
406-line configuration engine + `configuration_overrides` serve a path no shipped plugin uses.

**Nothing installs the bundled plugins.** `installPlugin` has one production caller:
`POST /api/plugins`. Factory-state comment and `docs/deployment/shared-backend.md` claim the
document-management plugin seeds things; it does not. Sources: folder, git clone, zip → copied into
`<dbdir>/installed-plugins/<id>` (never `plugins/`). `plugin_contributions` has no scope column;
reinstall for one team can drop another team's registry row (known, documented at `plugins.ts:184-201`).

**The one key.** `CREDENTIAL_NAMES = ["shared_backend_key"]` (`domain-model/src/credential.ts:20`);
the three model keys were deleted ("a harness is what a person brings"). Who reads it: only the
desktop worker (`applications/desktop/src/main.ts:664`, safeStorage → `RemoteWorkerClient` →
`POST /api/auth/worker-token`). `credentialResolver` is built and threaded in boot but **never
called** in production. Validate = `fetch http://127.0.0.1:$PORT/api/health/auth` with the key —
validates against *this* server, not the remote backend it is for. No rate limiter despite the
docblock. Table also holds `notifications_smtp_password` (notifications package) that the catalog
and routes never see. The desktop registers seven `credentials:*` IPC channels
(`safe-credentials.ts`, 251 lines) incl. plaintext `get`; the web UI no longer uses them.

**Events.** No plugin or credential bus event. Plugin install yields `changes` rows + `documents`
WS nudges through `edit_document`, and nothing else. Connections (orch, 520 lines) share the cipher
with credentials; harnesses and agent-behavior share `@hyperidle/settings`. Those four route
families move to the user module in BC5 (ACTIONS.md) — not this item.

## Surprises vs the plan text

1. Session write side is in a 350-line intake file mixed with filesystems and review gate — four
   shapes, not one.
2. No user or agent can stop a session; `abort` is a dead port method; `stop-for-tasks` marks rows
   and leaves the process running.
3. `GET /api/sessions` has no caller. The 743-line session viewer, `useSessionActivity` and the
   whole second websocket serve a panel no one can open.
4. Activity is in-memory only, by decision; lost on restart.
5. The composition root joins routers, not action lists — the join site has to be built.
6. Plugin lifecycle emits nothing on the bus; the "changed" event exists only as WS nudges.
7. Bundled plugins are not installed by anything; docs say otherwise.
8. `harness_descriptor` and `configuration_default` are dead kinds; the `contributions[]`
   engine (406 lines + a table) has no shipped user.
9. Credential validation checks the wrong server; the resolver is dead; the table hides a second
   secret.
