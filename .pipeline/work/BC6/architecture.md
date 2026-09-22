# BC6 — architecture

Technical shape of `.pipeline/work/BC6/plan.md`. Census: `facts.md`. Every claim below is checked
against `origin/main` b3ffde4f3 with a `file:line`; anything not checked says so.

## 0. What the census got wrong

Seven disagreements found while verifying the symbols the plan names. Each is handled below.

1. **`@hyperidle/credentials` cannot be deleted whole.** Its cipher (`credential-encryption.ts`,
   169 lines, env-only, no DB) is the AES-256-GCM used for **connection tokens** in
   agent-orchestration: `boot.ts:414` exposes `CoreApiBoot.cipher`, both applications pass it
   (`remote-server/src/create-server.ts:426`, `desktop/src/create-server.ts:303`),
   `bootAgentOrchestration` threads it to `createConnectionRoutes` and `resolveHeldToken`
   (`agent-orchestration/src/app.ts:68,74`). §7 rehomes the cipher; only the *store* dies.
2. **`GET /agent-orchestration/sessions/:sessionId` has a live production caller** —
   `port.sessions.getById` at `core-api/src/services/routine-scheduler-bindings.ts:112` (session_*
   routine triggers). Core may not call an orchestration action, so the route and the port method
   **stay**; only their classification moves (§8).
3. **`POST /runs/stop-for-tasks` stays too** — `task-actions.ts:816` calls it after commit. It is
   rewritten, not deleted (§3).
4. **Nine server-side plugin integration tests** hit `/api/plugins` (48 references), not the six the
   plan implies: `plugins.integration.test.ts` (13), `plugins.ba9d-lifecycle` (6),
   `BA9g-plugin-agent-identity` (6), `plugins.ba9d-skill-restore` (4), `BA9g-reinstall-revives` (4),
   `BA9g-detach-restore` (4), `plugins.ba9d-km-plugin` (2), `plugin-skill-reinstall` (2),
   `BA9g-contributions-view` (2). Plus two UI tests. All re-point to `POST /api/actions/edit_plugin`.
5. **`search_plugins` cannot list "the bundled ones not installed" on the shipped app.** Nothing
   packages `plugins/` into the desktop bundle (no reference in `applications/desktop/package.json`),
   and no code has a "bundled directory" concept — only `pluginsBaseDir`
   (`create-server.ts:239`, the *installed* dir). **PLAN AMENDMENT PROPOSED:** `search_plugins`
   returns installed plugins only; the bundled listing rides BC7 with "nothing installs the bundled
   plugins" (plan.md, Proposed items). Founder call — do not build it silently either way.
6. **The `LEGACY_ROUTES` edits cannot be one task.** `npm run lint` runs `actions-projected` and a
   stale row is itself an error (`actions-projected.ts:400-409`), so every task that deletes a route
   edits the list in the same task.
7. **The AC's "added lines under 1,000" collides with the platform module.** ~520 of
   `routes/plugins.ts`'s 984 lines are lifecycle logic that *moves* into the settings module. Budget
   §11 totals ~1,500 added / ~3,000 deleted. **PLAN AMENDMENT PROPOSED:** read the AC as "net red,
   and no more than 1,000 *new* lines — a verbatim relocation is not an addition".

Superseded ruling to know about before you "fix" it back: AU26 J3 (founder, quoted at
`ws-subscribe-authorizer.ts:8` and `session-stream-ws.ts:4`) put `session:<id>` on its own socket
because "core should not know about this session live stuff at all". **D-4ew9fm supersedes it.**

## 1. The five declarations

`framework/domain-model/src/actions/session.ts` and `.../platform.ts`, exported from
`src/index.ts`, shaped exactly like `actions/document.ts`: zod `input`/`output` that
`z.toJSONSchema` accepts (no `Date`, no `.transform()`), a `sentence` an agent reads, pure
invariant functions returning `Problem[]`, and a `*_ACTIONS` const map. `layers/core-ui/src/
services/call.ts:16` becomes `TASK & THREAD & DOCUMENT & SESSION & PLATFORM`.

**`SessionRowSchema`** — the 8 fields `AgentRunSummary` already carries
(`framework/domain-model/src/agent-run-view.ts:25`) plus `routineId`, `notes`, `modelTier`,
`sourceKind`. `state` stays a plain string on the row (the column is free text,
`schema.ts:281`); the *filter* uses `SESSION_STATES`, which the builder derives from the actual
writers (`transition-run.ts`, `session-store.ts`, `runtime-reapers.ts`,
`request-run-stop-for-tasks.ts:26`) and records in the declaration. If the real set differs from
`["active","done","stopped","failed"]`, the declaration follows the writers, not this note.

**`search_sessions`** `{ ids?, taskId?, agentIds?, state?, routineId?, limit?≤500, offset? }`
(`.strict()`) → `SessionRow[]`, newest first, no cap by default (the agent-profile health window
needs every run — `agent-orchestration-sessions.ts:72`). Pure invariant: `taskId` and `agentIds`
together is fine; **no** filter at all is refused (`filter_required`) — the deleted `GET /runs`
already required one (`agent-orchestration-sessions.ts:99`) and an unbounded table scan is not a
door. `AgentRunsResponse`/`AgentRunActiveCountsResponse` in `agent-run-view.ts` die with the routes;
`AgentRunSummary` stays (the browser's health derivations use it) or is replaced by `SessionRow` —
builder's call, one of the two, not both.

**`watch_session`** `{ id }` → `{ session: SessionRow, activity: ActivityEntry[] }`.
`ActivityEntry` already exists (`framework/domain-model/src/session-activity.ts`). The activity is
the in-memory ring buffer verbatim (D-4ew9fm); an unknown id is `not_found` (DB-dependent),
an ended-and-evicted session returns `activity: []` and is not an error.

**`stop_session`** `{ id }` → `{ session: SessionRow, stopped: boolean }`. `stopped: false` means
the row was already terminal — best-effort, not a problem (plan "Left simple"). DB-dependent
problem: `not_found`. **No authorization invariant**: anyone signed in may stop any session
(D-bsjkae); do not add one.

**`search_plugins`** `{ ids?, state? ("enabled"|"disabled"), text? }` → `PluginView[]`.
`PluginView`/`PluginContributionView` move out of `routes/plugins.ts:106-132` into the declaration
as zod schemas, unchanged in shape.

**`edit_plugin`** — one partial, discriminated by which field is present:

```
{ id?: string,
  source?: { kind:"folder", path, scope } | { kind:"git", url, scope } | { kind:"zip", path, scope },
  state?: "enabled" | "disabled",
  remove?: true,
  restore?: { contribution: string } }      // the key `listContributions` returns
scope = { kind:"factory", teamId:null } | { kind:"team", teamId: string }
```

`scope` nests **inside** `source` (install-only; nesting makes "scope without source" unrepresentable
instead of an invariant). Pure invariants: `one_change` (exactly one of source/state/remove/restore);
`id_with_source` (a source install never names an id — `installPlugin` derives the id from the
manifest); `plugin_id_required` (state/remove/restore need `id`); `builtin_locked` (`id ===
BUILTIN_PLUGIN_ID` with `remove` or `state:"disabled"` — the installer throws today,
`plugin-installer.ts:614-647`; it becomes a problem code instead of a 500). DB-dependent, inside
`run`: `unknown_plugin`, `unknown_contribution`, `install_failed` (carries `result.reason`),
`plugin_removed`.

## 2. Where each module lives

| Module | Package | Why |
|---|---|---|
| session (3) | `@hyperidle/run-orchestration` (`layers/agent-orchestration/run-orchestration/src/session-actions.ts`) | `table-owners.json` names it the owner of `sessions`; `listRunSummaries`/`findSessionById`/`countActiveRunsByAgent`/`transition-run` all live there |
| platform (2) | `@hyperidle/settings` (`layers/core-api/settings/src/platform-actions.ts`) | owns `plugins`, `plugin_contributions`, `plugin_configuration_defaults` |

Both return the same structural `Action[]` shape core's nested services already return
(`core-api/src/actions/action.ts:53-64` — "agree by shape, not by import"). Neither package gains a
dependency on a neighbour: everything outside its own tables arrives in a deps bag bound at the
layer's composition root, exactly as `TaskActionsDeps`/`DocumentActionsDeps` do.

**Session deps bag** (bound in `layers/agent-orchestration/src/services/run-orchestration-composition.ts`):

```
{ sessions: { list(exec, filter), getById(exec, id) },        // in-package
  stop: (sessionId) => Promise<"aborted"|"marked"|"already_ended">,   // §3
  activity: (sessionId) => readonly ActivityEntry[] }          // src/session-activity-buffer.ts
```

The buffer sits at the layer root (`agent-orchestration/src/session-activity-buffer.ts`) and stays
there — `createAgentOrchestrationApp` already passes `getRecentActivity` (`app.ts:38`); that
parameter moves onto the action bag and the `/sessions` routes die with it.

**Platform deps bag** (bound in `layers/core-api/src/actions/compose.ts`, a fourth group after
`document`): `{ agents: { insertIfAbsent, setStatus, list }, routines: { insert, setLive,
softDelete, get }, editDocument, searchDocuments, pluginsBaseDir? }` — the same functions
`routes/plugins.ts:49-74` imports today, injected instead of imported, because `@hyperidle/settings`
may not import `@hyperidle/users`/`@hyperidle/routine`. `editDocument`/`searchDocuments` come from
the composed list through `runnerFor` and the existing lazy-binding idiom (`compose.ts:139`).

**`internal: true` is set inside the module's `run`**, on the ctx it hands to `editDocument` —
never read off the caller's ctx. `routes/plugins.ts:144-157`'s `ctxFor` is the thing being moved;
the door (HTTP/MCP) never sets it (`action.ts:37-50`).

## 3. Stop, and the kill path

One internal function in `@hyperidle/run-orchestration`, used by both doors:

```
stopSessionRun(exec, sessionId, abort, eventBus): "aborted" | "marked" | "already_ended"
```

1. read the row; terminal → `already_ended`, no write, no emit.
2. `abort(sessionId)` (`sessionRunRegistry.abort` — `session-run-registry.ts:82`, signals the
   cooperative flag **and** calls `adapter.stopSession(handle)`, the real process kill). True →
   `aborted`: **write nothing, emit nothing**; the provisioning teardown writes the terminal row and
   emits `session_ended` as it does for any end (D-bsjkae).
3. False (no live runtime entry — a restart, another process, an already-dead child) → CAS
   `state='stopped', outcome='stopped', endedAt=now` guarded on `state='active'` (exactly
   `request-run-stop-for-tasks.ts:51-56`) and emit `session_ended` ourselves, so the task page,
   agent health and routine reactions see the same end.

`sessionRunRegistry` is injected as `abort`, not imported: `@hyperidle/run-orchestration` names
`@hyperidle/session-requests` only as a devDependency and the layer composition root already holds
both (`run-orchestration-composition.ts:325`).

**The kill path.** `requestRunStopForTasks` is rewritten to select the task's active sessions and
call `stopSessionRun` per session. `task-actions.ts:816` and
`AgentOrchestrationPort.runs.stopForTasks` are **unchanged** — one port method, one meaning, and
"killing a task goes through the same abort" (D-bsjkae) becomes true without core learning session
ids. `runs.abort` on the port, `POST /agent-orchestration/runs/abort` and their composition arm
(`agent-orchestration-port-composition.ts`) are **deleted** — `stop_session` is the caller that
never existed, and the only in-layer abort (`provisioner.ts:1599`) calls the registry directly.

Consequence to expect, not to fix: the kill path now emits `session_ended`, which
`work-session-end-reactions.ts:154` answers with an `edit_task` token writeback on a task that was
just killed. A refused edit is logged (`install`'s own `logger.warn`, line 97) and nothing else
happens. `lifecycle-propagation.ts:391` only acts on `outcome:'completed'`, so a stop is inert
there. The `session-review-creator` the old `@lore` warns about no longer exists.

## 4. One websocket

- `registerSessionActivityGateway(eventBus, push)` keeps its three subscriptions
  (`session_started`/`session_ended`/`tool_call_recorded`) and pushes a **nudge**, not the event:
  `push("session:"+id, { type:"update", topic:"session:"+id, kind:"session.activity", data:{ sessionId } })`
  — the envelope `document-actions.ts:311` already uses. `kind` is a websocket word only; it is
  **not** added to `EVENT_TYPES` (that is BC5's nine, and `actions-projected` clause 4 would
  demand a classification).
- The handle orchestration receives: a `wsPush?: (topic: string, envelope: unknown) => void` option
  on `bootAgentOrchestration`, bound by each application to `coreApi.wsHub.broadcast(topic,
  JSON.stringify(envelope))` — byte-identical to core's own binding at `app.ts:437`. Orchestration
  never sees `WsConnectionHub`; core never learns a session id.
- `SessionStreamHub`, `createRunStreamSubscribeAuthorizer`, `routes/session-stream-ws.ts`,
  `AgentOrchestrationBoot.sessionStreamHub` and the `sessionStream` boot option (with its
  `upgradeTokens` handoff in both applications) are deleted.
- **Authorizer**: `ws-subscribe-authorizer.ts` gains `if (topic.startsWith("session:")) return
  Promise.resolve(Boolean(sessionId))` — anyone signed in, no table read, so core still reads no
  orchestration table (D-bsjkae's visibility, and the same rule the deleted hub applied).
- **Identity handoff**: `routes/ws.ts:68`'s single `pendingIdentity` slot becomes the
  `WeakMap<object, string>` keyed on the Hono `Context`, copied from `session-stream-ws.ts:71`
  (`upgradeWebSocket((c) => …)`), closing the race that file's `@lore` names instead of deleting the
  fix with the file.
- **Client**: `ws-client.ts` loses `getSessionStreamClient`, `SESSION_STREAM_WS_PATH`,
  `sessionStreamClientInstance` and the `session:` arm of `messageMatchesTopic` (lines 243-250) —
  an `{type:"update"}` envelope already matches on its own `topic`.

## 5. The join

`runtime.actionTools` (`agent-orchestration/src/boot.ts:159`) changes from
`readonly RegisteredTool<HyperIdleDb>[]` to `() => readonly RegisteredTool<HyperIdleDb>[]`.
`buildToolProvider` (`run-orchestration-composition.ts:287-315`) already builds every registry
lazily per session, so it calls the thunk. `AgentOrchestrationBoot` exposes its own
`actionTools` (its three, MCP-projected).

The join site is each application's `createServer`, in the deferred-binding idiom that file already
uses three times (transports, `onHarnessRedetect`):

```ts
let actionTools = coreApi.actionTools;                       // type inferred — no import
const agentOrchestration = await bootAgentOrchestration({ runtime: { actionTools: () => actionTools, … } });
actionTools = [...coreApi.actionTools, ...agentOrchestration.actionTools];
```

`ServerHandle.actionTools` returns the joined list (both `applications/remote-server/src/
create-server.ts` and `applications/desktop/src/create-server.ts`), which is what the seam test
drives as "the agent".

**The HTTP door does not need the join.** Both layer apps mount at `/` on one `/api` router
(`composeApiApplication`, proven by `core-api/src/__tests__/two-app-mount-session-routes.integration.test.ts`),
so orchestration mounts its own `app.route("/actions", …)` and
`POST /api/actions/stop_session` resolves there while `edit_task` resolves in core. Orchestration
gets its own ~60-line `src/actions/` directory: a structural `Action`/`ActionContext` mirror, the
`createActionsRouter` loop (`core-api/src/actions/actions-router.ts`, 46 lines) and the
`actionsAsTools` loop (43 lines). This is deliberate duplication: `ActionContext` carries `db` and
`eventBus`, which is exactly why it is not in `framework/domain-model`
(`core-api/src/actions/action.ts:14-17`), and `@hyperidle/task` already declares its own mirror of
`Action` for the same reason. Do not invent a shared framework package for it.

**The lint needs no join either** — `actions-projected` scans
`framework/domain-model/src/actions/` for names and `layers/core-ui/src/` for `call("<name>"`
(clause 1, `actions-projected.ts:35,366`). All five declarations therefore need a real `call()`
site in the UI, including `stop_session`.

## 6. The platform module

`routes/plugins.ts` (984 lines) is deleted whole. What moves into `edit_plugin.run`, in the same
order and with the same phase discipline its header documents (lines 16-30 — `edit_document` opens
its own transaction, so no document call may sit inside the module's own `db.transaction`):

- install: validate (zod replaces ~120 lines of hand-rolled body checking) → `installPlugin` →
  phase 1 agents+routines in one transaction (`insertUserIfAbsent`, `insertRoutine`,
  `setNonDocumentContributionsLive`) → phase 2 `upsertContributedDocuments` through `editDocument`
  → phase 3 `recordContribution`/`forgetContributionsExcept` → phase 4 archive the stale documents;
- enable/disable: `enablePlugin`/`disablePlugin` + `setNonDocumentContributionsLive` + the document
  archive loop;
- remove: `removePlugin` + the same two;
- restore: `restorePluginContribution` + `clearDetached` + `readPluginDocumentSource`.

`search_plugins.run` is `GET /`'s body (lines 415-477) unchanged. `markDetached` stays bound as
`edit_document`'s `onBodyChanged` in `compose.ts:205` — untouched.

## 7. The key, the table, the migration

**Deleted:** `layers/core-api/src/routes/credentials.ts` (242) and its 4 routes;
`layers/core-api/credentials/src/{credential-store,credential-resolver,index}.ts` and the package;
`CoreApiBoot.credentialResolver` + `AppOptions.credentialResolver` and the `ServerHandle.
credentialResolver` both applications re-export; `notifications`' `credentialStore`/
`credentialCipher` ports and `readSecret` (`install.ts:87-91`, `ports.ts:94-96`) with the
`notifications_smtp_password` read — it has had no writer since BC1 and the table is going;
`layers/core-ui/src/components/CredentialsTab.tsx` (312) and its tab in `SettingsPage.tsx`;
`framework/db/src/schema.ts:1109` `serverCredentials` + `ServerCredential` + the `db` barrel export
(`index.ts:64`); the `server_credentials` row in `tools/governance/table-owners.json`;
`layers/core-ui/__scripts__/ah5-test-server.ts`'s seeding block (and its e2e config if that leaves
it empty); `fail-loud-secret.integration.test.ts`, `credentials.{routes,store}.integration.test.ts`,
`credential-resolver.integration.test.ts`, `server-factory.resolver.test.ts`,
`notifications-test-deps.ts`'s credential arms.

**Kept, rehomed:** `credential-encryption.ts` moves verbatim to
`layers/agent-orchestration/connections/src/token-cipher.ts` (`@hyperidle/connections` — the only
consumer left is connection tokens), exported from that package's barrel and used directly by
`agent-orchestration/src/app.ts`. `CoreApiBoot.cipher`, the `cipher` option on
`bootAgentOrchestration`/`createAgentOrchestrationApp` and both applications' `cipher:
coreApi.cipher` lines go: a layer stops being handed another layer's cipher. Behaviour is
unchanged for the absent-secret case — `createConnectionRoutes:196` already throws
"Encryption secret not configured" on encrypt and returns null on decrypt, which is exactly what
`encryptCredentialValue`/`decryptCredentialValue` do without a secret.

**Migration `framework/db/drizzle/0087_drop_server_credentials.sql`** (next free index; `_journal.json`
ends at `0086_document_module`, idx 86) — hand-written, plus its `meta/_journal.json` entry
(`framework/db/drizzle/README.md`): `DROP TABLE IF EXISTS server_credentials;` and nothing else.
No data move: the only two names it ever held are `shared_backend_key` (now the keychain's) and
`notifications_smtp_password` (no writer). No deployments exist
(memory: `project_no_active_deployments`). Check whether
`framework/db/src/__tests__/pg-migration.integration.test.ts` enumerates migrations and update it.

**The desktop field.** `SettingsWorker.tsx` gains one password input in the shared-mode branch that
calls the existing `window.__HYPERIDLE__.credentials.set("shared_backend_key", value)`
(`preload.ts:22` → `safe-credentials.ts:108`), shows the `{stored, warning}` result, and **never
reads the value back**. `main.ts:664`'s `readCredentialFromStore` already reads that same file, so
the worker connects on the next `worker:enable`. Deleted with it: the `credentials:get`
(plaintext readback), `list`, `delete`, `status`, `validate` and `encryption-available` channels —
**no renderer has called any of them since `CredentialsTab` stopped using the bridge**;
`credential-validator.ts` (88 lines, validates against the wrong server per facts.md);
`framework/domain-model/src/credential.ts` (`CREDENTIAL_NAMES`, `CREDENTIAL_CATALOG`,
`CREDENTIAL_STATES`, `isCredentialName`) and its test, with `safe-credentials.ts` keeping the one
name as a local constant; the `credentials` block in `window.d.ts` except `set`;
`applications/desktop/__tests__/safe-credentials-p3.test.ts`'s catalog cases.

## 8. Governance

`tools/governance/src/rules/actions-projected.ts`. **Out of `LEGACY_ROUTES`** (16 rows, each in the
task that deletes its route): the four `credentials.ts` rows; the six `plugins.ts` rows;
`sessions.ts|GET /`; `sessions.ts|GET /:id/activity`; `agent-orchestration-sessions.ts|GET /runs`;
`…|GET /runs/active-counts`; `agent-orchestration-intake.ts|POST /runs/abort`;
`session-stream-ws.ts|GET /agent-orchestration/ws`. **LEGACY → PLUMBING** (2 rows):
`agent-orchestration-sessions.ts|GET /sessions/:sessionId` and
`agent-orchestration-intake.ts|POST /runs/stop-for-tasks` — both are `AgentOrchestrationPort` seams
with live core callers (§0.2, §0.3), which is what `PLUMBING_ROUTES` means
(`actions-projected.ts:74`, which already holds seven intake rows). `LEGACY_TOOLS` and
`LEGACY_EVENTS` are untouched. The rule's own prose and its `taskActionNames` variable
(lines 1-6, 28-35, 357, 414) still say "the task action list"; rename to `declaredActionNames` and
say five modules. Also check `tools/governance/src/rules/retired-surfaces-absent.ts` (it names
deleted run routes at lines 98/155) and `architecture.json` for the deleted `credentials` package.

## 9. Verification

- **Unit** (`vitest`, in-package): the pure invariants of all five declarations
  (`framework/domain-model/src/__tests__/`), each problem code once.
- **Service integration** (`{db, app}` fixtures): `session-actions.integration.test.ts` in
  run-orchestration (search filters; watch returns buffer; stop with a registered runtime entry
  calls `adapter.stopSession`; stop with none CAS-marks and emits `session_ended`; stop twice →
  `stopped:false`); `platform-actions.integration.test.ts` in settings, plus the nine re-pointed
  plugin tests; the kill path through `edit_task` proving the abort is reached.
- **The one end-to-end proof — the integrate task.**
  `applications/remote-server/src/__tests__/session-platform-seam.integration.test.ts`, modelled on
  `document-ws-e2e.integration.test.ts` (real `createServer`, real TCP socket, real `ws` client):
  each of the five entries driven **twice** — once as a human (`POST /api/actions/<name>` with
  `X-API-Key`) and once as an agent (the joined `ServerHandle.actionTools` handler) — asserting the
  same answer, plus one `session:<id>` nudge arriving on `GET /api/ws` after a `tool_call_recorded`.
- **Manual, on the packaged desktop app** (no lane can prove these): stop a live session and watch
  the harness process die; open the viewer from a task row and see it update; install a plugin from
  a folder and disable it; enter the key in Worker settings and see the log say the worker enabled
  rather than "not found in safeStorage".
- Every task: `npm run check && npm run lint` green at its end. The full suite is green only at the
  integrate task — a task that deletes a route before its caller moves leaves tests red on purpose.

## 10. Docs made false

`docs/architecture/credential-model.md` (whole file), `docs/architecture/authorization-model.md`,
`docs/architecture/as-implemented-domain-architecture.md`, `docs/requirements/system-requirements.md`
(`server_credentials`, `/api/credentials`, `/api/plugins`, the second websocket),
`docs/ui-design/settings-consistency.md` (the Credentials tab), and the `docs/architecture/
connection-model.md` mention of the shared cipher. Also `layers/core-ui/__e2e__/
known-pre-existing-failures.ts` and the five Playwright specs that stub `/api/sessions`.

## 11. Order and budget

`T1 declarations → T2 session module+join → T3 websocket → T4 platform module → T5 session reads
(UI) → T6 viewer door (UI) → T7 plugins UI → T8 credentials+migration → T9 desktop key → T10
governance prose → T11 docs → T12 integrate`. The chain is linear because five files (`app.ts`,
`boot.ts`, both `create-server.ts`, `actions-projected.ts`) are touched by several steps; nothing
else forces it.

Production lines, added/deleted: T1 320/0 · T2 260/200 · T3 60/330 · T4 520/1000 · T5 80/120 ·
T6 90/80 · T7 60/120 · T8 40/800 · T9 70/380 · T10 15/15 · T11 40/60. **≈1,555 added,
≈3,105 deleted, net ≈ −1,550.** See §0.7.

## 12. Critique amendments (2026-09-22, critique 1: BLOCKED on B1, B2 — both fixed here)

**B1 — teardown could not write "stopped".** `updateSessionRow` (`transition-run.ts:380-393`) only knew
`done/completed|not_returned` and `crashed`, so an aborted session ended as `completed` and
`lifecycle-propagation.ts:83` would have finished the task. **Fix (D-njr2es):** the provisioner's
existing `aborted` flag (`provisioner.ts:1455`, already used at `:1971` for `returnEndReason`) is
threaded into the normal-teardown `transitionRun` call (`provisioner.ts:2027`) as `terminalOutcome:
"stopped"`; `endSession`/`updateSessionRow` accept `state:"stopped"`, `outcome:"stopped"`;
`session_ended` carries `outcome:"stopped"` and `routineRunOutcome:"error"` for a routine session.
Both doors now converge on one vocabulary: abort path → teardown writes `stopped`; no-live-entry
path → CAS writes `stopped`. `search_sessions({state:"stopped"})` finds both. Propagation
(`completed` only) and health (`crashed` only) stay inert on a stop. `SESSION_STATES` includes
`stopped`. Red tests in T-vtknk9 change accordingly: "stop with a live entry → adapter.stopSession
called, and after the detached teardown drains the row reads `stopped/stopped` and `session_ended`
carries `outcome:"stopped"`"; "stop twice → second call answers `stopped:false` once the row is
terminal, `true` while teardown is still draining" (F1: the response on the abort path is the
pre-stop row; the terminal state arrives by nudge — say so in the declaration's sentence).
Also prove F2 in that test: `harness.stopSession` is called twice on the abort path (registry, then
`provisioner.ts:1877`) and the adapter tolerates it.

**B2 — lint cannot be green between the declarations and the UI.** `actions-projected` clause 1 is
error-severity and wants a `call("<name>"` site for every declared name. **Fix (D-9p94bz):** tasks
T-dn7k7y, T-vtknk9, T-fgkg97, T-nmhrw7 verify with `npm run check` green and `npm run lint` red on
exactly those five clause-1 rows (fewer as the UI tasks land) and nothing else; the builder lists the
remaining rows in its report. No decoy call site, no rule edit. Full green at T-42x5hb.

**N1 — missed consumers**, now owned by the named tasks: `layers/core-api/src/__testing__/test-fixtures.ts:6,99,147,184`
and `test-utils.ts:8,116-117` import `@hyperidle/credentials` (T-kbw42e); dependency rows in
`layers/core-api/package.json:19`, `layers/core-ui/package.json:48`, `layers/agent-orchestration/package.json:30`,
`layers/agent-orchestration/connections/package.json:19`, `layers/agent-orchestration/filesystems/package.json:19`
(T-kbw42e; `deps:check` will flag them); `layers/core-ui/src/__testing__/test-setup.ts:30` mocks
`getSessionStreamClient` (T-fgkg97); `framework/db/src/__tests__/pg-migration.integration.test.ts:48`
lists `server_credentials` (T-kbw42e).

**N2 — `requestRunStopForTasks` return contract:** returns the session ids it stopped, aborted or
marked alike (`{ stopped: [{sessionId, taskId}] }` as today), and its `@lore` is rewritten: it now
takes the bus and emits on the no-live-entry path; on the abort path teardown emits.

**N3 — governance prose:** `actions-projected.ts:69-71` "sixteen plumbing doors" becomes "eighteen"
in T-vtknk9 (the task that moves the two rows), not T-ep5ydm.

**N4 — `filter_required` dropped.** `search_sessions` with no filter lists newest first with
`limit` defaulting to 100 (the profile health window passes `agentIds` and its own limit). Matches
`search_tasks`' "no parameter lists them".

**N5 — order:** the tree is a DAG, not a chain: T-fgkg97 ∥ T-7gy3zv; T-9v5m2t ∥ T-kbw42e;
T-b2qg8y ∥ T-ep5ydm ∥ T-bgr5ct. No concurrently claimable pair shares a file (critique checked).

**N6 — citation corrections:** `task-actions.ts:812`; `provisioner.ts:1599` reaches the registry
through `ports.sessionRequests.abortSessionRun` (bound at `run-orchestration-composition.ts:329`);
`ws-client.ts:238-242`; `resolveHeldToken` at `agent-orchestration/src/app.ts:76`; `pluginsBaseDir`
at `remote-server/src/create-server.ts:238/254` and `desktop/src/create-server.ts:154/166`;
`table-owners.json` key `serverCredentials`.

**F3:** `retired-surfaces-absent.ts` needs no change and gets no new tombstones (maintainer-curated).
**F5:** the seam test is a third file beside `document-ws-e2e` / `thread-ws-e2e`, same model.
