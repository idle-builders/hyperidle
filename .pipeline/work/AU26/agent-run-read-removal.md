# AU26 — Getting agent-run reads out of the core API

**Founder ruling (verbatim, 2026-08-04):** *"agent run tables should not be read from the core api. find a
structurally correct way to get this information to where it belongs, and question if that read is really
truly necessary."*

This doc answers the ruling in the order the ruling states it: **necessity first**, then the mechanism for
what survives, then the increments. It supersedes the "Scope note" in `architecture.md` §D-A that held every
core-api Layer read constant, and it supersedes the "AU26 adds no new `AgentOrchestrationPort` methods"
constraint in that same section — that constraint came from the pipeline, not from the founder, and the
ruling replaces it.

Every `file:line` below was re-enumerated from source at HEAD (`94f17245`, after C3 / B1b / F1 landed) with
`rg -a`. The earlier counts in `architecture.md` §14 were wrong in two directions: they said "ten Layer
routes" (the real figure is **thirteen read sites across nine route files**, because three files hold more
than one) and they carried `routes/sessions-routes.ts` as a raw toucher, which B1a already closed.

---

## 1. The census — what actually touches an agent-run table at HEAD

### 1.1 Which tables count

`sessions`, `agent_work_intents`, `agent_session_requests`, `explicit_session_starts`,
`agent_lifecycle_inbox`, `trigger_resolution_history`, `filesystem_captures`, `agent_run_config`,
`team_run_config_defaults`, `service_connections` — every table an `agent-orchestration` package owns after
this WP's moves.

**Result of the sweep: only `sessions` is still touched raw from core-api.** Every other table on that list
already has zero raw core-api access:

| Table | Owner | Core-api access at HEAD |
|---|---|---|
| `agent_work_intents`, `agent_session_requests`, `explicit_session_starts`, `agent_lifecycle_inbox`, `trigger_resolution_history` | `agent-orchestration/session-requests` | none raw — all through exported functions / Mechanism-C DI (`work/src/session-start-resolver.ts`, `src/services/durable-agent-queue.ts`) |
| `agent_run_config`, `team_run_config_defaults` | `agent-orchestration/agent-run-config` (G1) | none raw — `readAgentRunConfig(s)` / `writeAgentRunConfig` downward calls |
| `service_connections` | `agent-orchestration/connections` (E3) | none raw — `settings/src/plugin-configuration.ts:762` goes through an injected `deps.serviceConnections` port |
| `filesystem_captures` | `agent-orchestration/filesystem-mounting` (F1) | none |
| `sessions` | **unowned**; de-facto `agent-orchestration/run-orchestration` | **15 raw sites in 11 files** — the whole of this doc |

**Two exclusions, stated rather than assumed:**

- **`task_dispatch_attempts` is not an agent-run table.** Every toucher is core-api
  (`work/src/work-service.ts:65,79,97,105`, `work/src/task-state-machine.ts:117,120`,
  `policy/src/handoff-protocol.ts:319,322`); no `agent-orchestration` package reads or writes it. It is
  task-dispatch bookkeeping that `work` owns de facto, which is exactly what `architecture.md` §14
  Finding 2 already concluded. Out of this ruling.
- **Core-api holds zero *writes* to any agent-run table.** H1, H2 and B1a closed the last three. The 15 sites
  are all reads.

### 1.2 The sites

| # | Site (`file:line`) | What it reads | Truly necessary? | Mechanism | Verdict |
|---|---|---|---|---|---|
| 1 | `packages/core-api/src/routes/status.ts:61` | every `state="active"` row → `.length` into `GET /api/status`'s `activeSessions` | **No** — `GET /api/status` (root) has **zero consumers repo-wide**: `packages/web`, `packages/web/e2e`, `packages/desktop`, `packages/eval` reference only `/api/status/health` (a rate-limit skip path, `api-middleware-stack.ts:68`) and `/api/status/digest`. `SettingsWorker.tsx`'s `status.activeSessions` is the Electron `WorkerStatus` bridge (`window.d.ts:16`), a different object | Delete | **DELETE** |
| 2 | `packages/core-api/src/routes/users.ts:220` | every `state="active"` row → per-user `activeSessions` count on `GET /api/users` | **No** — the only consumer of the `GET /api/users` list is `CoreApiPort.users.listUsersByTeam` (`core-api-port-composition.ts:462`), typed `UserView` = `{id, name, role, teamId}` (`api-contract/src/core-api-port.ts:167-173`). No `packages/web` file fetches the list at all | Delete | **DELETE** |
| 3 | `packages/core-api/src/routes/threads.ts:254-259` | newest run per AI sender → `identities[].operationalStatus` | **No** — zero production readers. `Conversations.tsx` reads `name`/`role`/`isAgent` only (`:71-91`); `HostThreadSection.tsx:112-124` the same; `ReviewPage.tsx:74` the same. `useThreadDetail.ts:86` merely passes it through. This is also an N+1 (one query per AI participant per thread open) | Delete | **DELETE** |
| 4 | `packages/core-api/src/routes/teams-routes.ts:248-258` | 5 cols × every run of every team agent → `activeAgentCount` + `agentHealthWarning` on the team list | **No** — both fields are declared on `TeamListItem` (`shared/src/team.ts:111,113`) and read by **nothing** in production web; the only hits are `.stories.tsx`, `__tests__`, and `sortTeamsByAttention.ts:7`, which is a comment saying the simplified row deliberately does *not* use `agentHealthWarning` | Delete (also drops the `readAgentRunConfigs` call at `:246`, which exists only to feed the health computation) | **DELETE** |
| 5 | `packages/core-api/src/routes/tasks.ts:295-299` | whole row → `SessionContext` for `POST /tasks/:id/handoff` | **Partly** — `handoff` takes `PolicySessionContext = {sessionId, agentId, taskId}` (`policy/src/ports.ts:17-21`) and reads exactly those three (`handoff-protocol.ts:80-367`). `sandboxPath`, `ingestion` and `traceId` are constructed at `:308-325` and **never read** — so the `sandboxSnapshot` read is dead. Existence (404) + `agentId` are genuinely needed | Shrink first, then **existing** `AgentOrchestrationPort.sessions.getById` | **SURVIVES** (no new port surface) |
| 6 | `packages/core-api/src/routes/bets.ts:36-40` | `taskId`/`outcome`/`startedAt` → `latestSessionOutcome` per task | **Yes** — `TaskSheet.tsx:422-427` renders a `StatusChip` from it and `WorkBet.tsx:105-106` sorts on it | Port read: `latestOutcomeByTaskIds` | **SURVIVES** |
| 7 | `packages/core-api/src/routes/tasks.ts:189-193` | full rows for one task → `GET /tasks/:id/sessions` | **Yes** — `useTaskSessions` → `WorkTask.tsx:171,271`. Uses `id`, `agentId`, `state`, `effectivenessScore` | Port read: `listRunsByTaskId` | **SURVIVES** |
| 8 | `packages/core-api/src/routes/agent-profile.ts:249-260` | 6 cols × every run of one agent → `activeSession`, `recentSessions`, `performance`, `healthSignals` | **Yes** — all four render on `AgentProfile.tsx` (`:154-190`, the health banner, the performance block) | Port read: `listRunsByAgentIds` | **SURVIVES** |
| 9 | `packages/core-api/src/routes/teams-routes.ts:753-765` | 7 cols × every run of every roster agent → `operationalStatus`, health, active task | **Yes** — `WorkTeam.tsx:304,493` reads `member.operationalStatus` | Port read: `listRunsByAgentIds` (same method as #8) | **SURVIVES** |
| 10 | `packages/core-api/src/routes/agents.ts:175-179` | `count()` grouped by `agentId`, `state="active"` | **Yes** — `SettingsAgents.tsx:455` renders `${agent.activeSessions} active` | Port read: `activeRunCounts` | **SURVIVES** |
| 11 | `packages/core-api/src/routes/agents.ts:384-388` | `count()` for one agent (assistant PATCH response) | **Yes** — the PATCH response is spliced straight into the list row (`SettingsAgents.tsx:296`), and `AgentConfig.activeSessions` is non-optional (`settings-types.ts:96`); dropping it renders `undefined active` | `activeRunCounts` (same method) | **SURVIVES** |
| 12 | `packages/core-api/src/routes/agents.ts:461-465` | `count()` for one agent (agent PATCH response) | **Yes** — same path | `activeRunCounts` (same method) | **SURVIVES** |
| 13 | `packages/core-api/src/routes/recipients.ts:54-55` | every `state="active"` row → `hasActiveSession` per recipient | **Yes** — `RecipientPicker.tsx:198` renders a live indicator | `activeRunCounts` with no id filter | **SURVIVES** |
| 14 | `packages/core-api/src/ws-subscribe-authorizer.ts:163-167` | whole row → `taskId`, `sourceKind`, `sourceCorrelationJson` for `session:<id>` topic authz | **Yes** — fail-closed authorization; removing it re-opens the AF11 bypass | Decompose: a downward call `getRunSubscribeContext` injected as a fifth DI port | **SURVIVES** — §3 |
| 15 | `packages/core-api/policy/src/lifecycle-propagation.ts:289-294` | rows → `.length` only | **Yes**, but only as a **count** — the rows are never inspected; the only consumer is `${n} other active session(s) still running` in the skip message at `:300` | Downward call on the `runOrchestration` DI bag H1 already created: `countOtherActiveRunsForTask` | **SURVIVES** |

**Totals: 15 sites. 4 delete outright. 1 shrinks and then closes on port surface that already exists.
10 survive and need a mechanism.** Two of the ten (#8, #9) share one method and three (#10–#12) share
another, so the ten sites resolve to **four distinct reads**.

### 1.3 Two sites outside the ruling, examined anyway

- **`packages/agent-orchestration/tool-handlers/src/tool-definitions.ts:519-522`** — `write_session_notes`
  does `ctx.db.update(sessions).set({notes})`. **This is not a violation of the founder's ruling.** Both the
  caller and the table are inside `agent-orchestration`; nothing crosses into core-api. Whether one
  orchestration Service may write another's table is an intra-layer interface rule, and writing rules is
  AU28's axis by the founder's own dividing line. **But there is a genuine finding underneath it that is a
  move, not a rule:** `run-orchestration/src/writeback-processor.ts:338` performs the *identical* write
  (`update(sessions).set({notes: body})`). One column, two writers, in two packages. Exporting
  `recordRunNotes(exec, sessionId, notes)` from `run-orchestration` and pointing both callers at it removes a
  duplicate implementation — that is a code move and needs no rule to justify. See J-optional in §5.
- **`packages/core-api/src/routes/sessions-routes.ts`** — carries **no** raw `sessions` access at HEAD. B1a
  moved the legacy bare insert to `run-orchestration`'s `createBareRun` and put the 202 row read on
  `AgentOrchestrationPort.sessions.getById`. `architecture.md` §14 lists it as an open toucher; that is
  stale.

---

## 2. Why deletion was not possible, per surviving site

Ten sites survive. Each gets one paragraph, because "it renders something" is not on its own a reason to
keep a cross-layer read — the reason has to be that *core's own domain output depends on it*.

**#5 `tasks.ts` handoff.** The route is the handoff *trigger*: a human or an agent names a run and a target,
and core's policy engine decides where the work goes. Deciding that requires knowing which agent is being
handed off *from* — `sessionContext.agentId` is the author of every thread, message and item the handoff
creates (`handoff-protocol.ts:164,172,229,238,286,305`). That agent identity is a property of the run, not of
the task, so core cannot derive it from anything it owns. The 404 is likewise real: handing off a
non-existent run must fail. What is *not* real is `sandboxSnapshot` — it feeds `sandboxPath`, which the
handoff never reads, and the `/tmp/.hyperidle-noop-*` sentinel at `:308-309` guards a code path
(`endSession`'s `fs.promises.rm`) that this route no longer reaches now that H1 moved the run-end write down.

**#6 `bets.ts` `latestSessionOutcome`.** Two real renders depend on it: the outcome chip on the task sheet
and the sort order of the task list. It cannot come from `tasks` — a task's own `state` is a work-domain
fact, and the chip deliberately shows the *run's* verdict, which differs (a task can sit in `review` after a
run ended `crashed`). H2 already deleted the version of this read that lived inside the `work` Service; the
remaining one is at the Layer route, which is the right *place* but still the wrong *layer* for the data.

**#7 `tasks.ts` run list.** `GET /tasks/:id/sessions` is a list *of runs*. There is nothing to delete — the
route's entire payload is agent-run data. Its host stays core-api under `architecture.md` §D-A rule 3
(the handler also gates on `tasks` via `work.get`), so the read has to come down a seam.

**#8 `agent-profile.ts`.** Four separate outputs depend on it — the live/idle/error chip, the recent-runs
list, the success-rate block and the degraded-health banner. All four are the agent-profile page's reason to
exist. `computeHealthSignals` needs `startedAt`/`endedAt`/`outcome` per run; nothing narrower works.

**#9 `teams-routes.ts` roster.** Same four outputs as #8, batched across a team's agents, and `WorkTeam.tsx`
renders them. Note this is the *roster* read at `:753`; the *team-list* read at `:248` is site #4 and dies.

**#10–#12 `agents.ts` active counts.** The Settings → Agents list renders `N active` per agent, and both
PATCH handlers must return the same field because the response is spliced into that list client-side. The
count is genuinely about runs; `maxConcurrentSessions` (the configured ceiling) already lives in
`agent_run_config` and is a different number.

**#13 `recipients.ts`.** The recipient picker shows which agents are currently working, so a person does not
address one that is mid-run. That is a live-run fact by definition.

**#14 WS subscribe authorizer.** See §3 — it cannot be deleted and it cannot be moved whole.

**#15 `lifecycle-propagation.ts`.** The rule is "a task moves `in_progress → review` only when no *other*
run on it is still active". That is a core policy decision whose input is a run fact. The read cannot be
deleted, but it can shrink to a scalar: the rows are never inspected, only counted.

---

## 3. The WS subscribe authorizer — the hard one

**Why it is hard.** `createDbSubscribeAuthorizer` decides whether a sender may subscribe to `session:<id>`.
To decide, it needs a run fact (*what does this run correlate to?* — `taskId`, `sourceKind`,
`sourceCorrelationJson`, `ws-subscribe-authorizer.ts:132-144,163-174`) **and** three core facts (*is the
sender a participant of that thread?* → `threads`; *is the sender in that team?* → `users` + `team_members`).
Neither layer can hold the whole decision: core-api must not read the run, and `agent-orchestration` must not
read `threads`/`users`/`team_members` in any form — `architecture.md` §D-A's rejected-alternative paragraph
already forecloses the "inject a core reader into orchestration" escape, and the composition-edge
anti-regrowth guard fires on it.

**The structurally correct answer: split the decision along the layer line, not the file line.**
Orchestration answers *what the run is*; core decides *who may see it*.

```
agent-orchestration/run-orchestration exports:
  getRunSubscribeContext(db, sessionId):
    Promise<{ taskId: string | null; sourceKind: string | null; sourceCorrelationJson: string | null } | null>
      // null  → the run does not exist  → the authorizer denies (unchanged fail-closed semantics)

core-api/src/ws-subscribe-authorizer.ts:
  SubscribeAuthorizerDeps gains a fifth Mechanism-C port:
    readonly runOrchestration: { getSubscribeContext(db, sessionId): Promise<RunSubscribeContext | null> }
  wired by the Application (packages/remote-server/src/create-server.ts:537-544) to the real export.
```

Three notes on why this shape and not another:

- **Not `AgentOrchestrationPort`.** The authorizer is not a route; it is Application-composed infrastructure
  that already takes a four-port DI bag (`conversation`/`users`/`org`/`work`). A fifth port is the mechanism
  this file already uses. It also runs on every WS subscribe, where a `Request`/`Response` marshal buys
  nothing.
- **Not "move the whole authorizer to orchestration."** That would require orchestration to evaluate thread
  participation and team membership — the forbidden direction.
- **Not "split the socket."** Making orchestration host its own WS for `session:` topics was considered and
  rejected in `architecture.md` §D-A (the `/api/ws` row: *one* user socket, core-hosted). Session activity is
  already published by orchestration *through* core's hub (`agent-orchestration/src/services/
  session-activity-gateway.ts:51-57`), so the transport is settled; only the authorization fact needs to come
  down.

**Free rider, proved and worth taking now.** The `deps.work.getTaskById` existence check at `:172-174` is
redundant: `sessions.taskId` is an FK to `tasks.id` with `onDelete:"restrict"` (`packages/db/src/schema.ts:
229`), so a non-null `taskId` implies the task exists. `taskId !== null → true` is behaviour-identical.
`architecture.md` §14 recorded this as proved-and-not-taken; with the authorizer being edited anyway, taking
it removes one of the four DI edges outright (`RealtimeTaskReader` and the whole `work` port disappear).

---

## 4. Mechanism for the eight Layer-route sites — and why the port, not a direct import

Sites #5–#13 are all **core-api Layer routes**. `architecture.md` §D-A rule 3 already says a core Layer route
reading orchestration data goes through `AgentOrchestrationPort.sessions.*`. That rule stands, and this
section justifies it rather than assuming it, because a direct `import { … } from "@hyperidle/run-orchestration"`
is genuinely available — core-api already imports that package for `requestRunStopForTasks` (`routes/bets.ts:10`)
and `createBareRun` (`routes/sessions-routes.ts:3`).

**Why the port wins here:**

1. **One door, and it is enumerable.** After this work, the answer to "how does core-api read a run?" is a
   single interface in `packages/api-contract/src/agent-orchestration-port.ts`. Mixing two mechanisms across
   eight sibling sites — some direct import, some port — is the worse outcome regardless of which is
   marginally cheaper.
2. **It matches the shipped precedent exactly.** `sessions-routes.ts:63` already reads a run through
   `port.sessions.getById`. Site #5 closes with **zero new surface** by reusing it.
3. **Read-only is structural, not a convention.** The port's backing router registers GET handlers only and
   an integration test asserts no non-GET handler exists (`agent-orchestration-sessions.ts` header). A direct
   barrel import hands core the same module that exports `runSession`, `transitionRun` and `startRuntime`.
4. **Location transparency survives.** The transport is `(req) => Promise<Response>`, satisfied in-process by
   `app.fetch` today. Nothing about these call sites assumes colocation.

**The cost, stated plainly, because it is real:** `api-contract` is zero-runtime-deps, so every port row type
is a hand-written mirror, and fidelity is a *tested* obligation, never a compiler guarantee (that file's own
header says so). Three new methods means three new fidelity tests. If the reviewer judges that burden heavier
than benefits 1–4, the fallback is a direct import of the same four read functions from
`@hyperidle/run-orchestration`, at the cost of benefit 1. I do not recommend it, but it is a real option and
it is not structurally wrong.

**Why not "core keeps its own record" (a core-owned projection maintained from events).** Rejected on
evidence, not on taste. A projection of run state into a core-owned table would have to be fed by
`session_started`/`session_ended`, and **two terminal transitions deliberately emit no `session_ended`**:
`run-orchestration/src/end-run-for-handoff.ts:17` (*"No `session_ended`. `endSession`'s caller emits it"*)
and `run-orchestration/src/request-run-stop-for-tasks.ts:9` (*"@lore AU26 H2: no `session_ended` is
emitted"*). A run ended by handoff or by a bet kill would stay `active` in core's mirror **forever** — and
"is this agent active right now" is precisely what sites #10–#13 render. The projection would also cost a
table, a migration, a backfill for existing installs and a reactor, to hold a copy of data another layer
owns. It is the wrong mechanism here.

**Why not "already on the event".** Checked: `SessionStartedEvent`/`SessionEndedEvent`
(`packages/shared/src/events.ts:120-153`) carry `sessionId`, `agentId`, `taskId`, `timestamp`, `outcome` and
the source triple. They carry no `state`, no `startedAt`/`endedAt` as ISO strings, no `effectivenessScore`,
no `sandboxSnapshot`. More decisively, sites #5–#13 are **request handlers**, not event subscribers — there
is no event in hand to read from. This mechanism already did its work in H3, which is why H3 was possible and
these are not.

### 4.1 The port surface — exactly what is added and what is returned

Three new methods on `AgentOrchestrationSessionsPort`, plus a **new, narrow** row type. `getById` and
`AgentOrchestrationSessionWireRow` (18 columns) are **untouched** — the hazard `architecture.md` §14 flagged
is that `POST /api/sessions`'s 202 branch returns the raw row and no `packages/web` file consumes it, so a
narrowing there would silently drop 11 fields with no test catching it. The decoration family must therefore
be a **separate** type, never a re-use.

```ts
/** The eight fields every decoration read in core-api actually consumes. Deliberately NOT
 *  AgentOrchestrationSessionWireRow — see the 18-column hazard above. */
export interface AgentOrchestrationRunSummary {
  readonly id: string;
  readonly agentId: string;
  readonly taskId: string | null;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly state: string;
  readonly outcome: string | null;
  readonly effectivenessScore: string | null;
}

listRunsByTaskId(taskId: string): Promise<ReadonlyArray<AgentOrchestrationRunSummary>>;
  // newest-first. Backs site #7.
listRunsByAgentIds(agentIds: readonly string[]): Promise<ReadonlyArray<AgentOrchestrationRunSummary>>;
  // newest-first across all given agents; [] for []. Backs sites #8 and #9.
activeRunCounts(agentIds?: readonly string[]): Promise<Readonly<Record<string, number>>>;
  // state="active" counts keyed by agentId; agents with zero are absent.
  // Omitted argument = every agent (site #13 needs the unscoped form). Backs sites #10-#13.
latestOutcomeByTaskIds(taskIds: readonly string[]): Promise<Readonly<Record<string, string | null>>>;
  // outcome of the newest run per task by startedAt; task absent from the map = no run. Backs site #6.
```

**Field-by-field justification, so nothing is dropped silently:**

| Field | Who needs it |
|---|---|
| `id` | #7 (`sessions[].id`), #8 (`activeSession.sessionId`, `recentSessions[].sessionId`), #9 |
| `agentId` | #7 (`sessions[].agent`), #9 (grouping) |
| `taskId` | #8 (`activeSession.taskId` → the bet link), #9 (active-task title/bet resolution) |
| `startedAt` | #8, #9 (ordering + `computeHealthSignals`) |
| `endedAt` | #8, #9 (`computeHealthSignals`) |
| `state` | #7 (`status`, drives the live dot), #8, #9 (`operationalStatus`) |
| `outcome` | #6, #8 (`successCount`), #9 (`computeHealthSignals`) |
| `effectivenessScore` | #7 only |

`sandboxSnapshot`, `notes`, `requestId`, `routineId`, `modelTier`, the source triple and the three
`effectivenessRecorded*` columns are consumed by **no** core-api decoration site and are deliberately absent.

**Backing routes** land on `packages/agent-orchestration/src/routes/agent-orchestration-sessions.ts` (the
existing read-door router, mounted at `/api/agent-orchestration`), **not** on `/api/sessions`. This keeps the
public `/api/sessions` surface byte-identical and keeps the read-only assertion in one place. Four new GET
registrations:

| Route | Query | Backs |
|---|---|---|
| `GET /agent-orchestration/runs?task_id=` | one task id | `listRunsByTaskId` |
| `GET /agent-orchestration/runs?agent_ids=a,b,c` | comma-separated | `listRunsByAgentIds` |
| `GET /agent-orchestration/runs/active-counts[?agent_ids=…]` | optional filter | `activeRunCounts` |
| `GET /agent-orchestration/runs/latest-outcomes?task_ids=a,b,c` | comma-separated | `latestOutcomeByTaskIds` |

Two things the builder must not get wrong: the existing `GET /api/sessions` list defaults to `limit=50`
(`agent-orchestration/src/routes/sessions.ts:234`) and **is not** a substitute for `listRunsByAgentIds` —
sites #8/#9 need *every* run of an agent for the health window, so the new routes must not inherit that cap;
and `agent_ids`/`task_ids` must be length-guarded on the orchestration side so a large roster cannot produce
an unbounded URL.

---

## 5. Ordered increments — proposed for `architecture.md` §12/§13

Letters `A`–`H` are taken. This is the **J** series. Every row is an independently shippable PR to `main`
with `npm run verify` green; no stacking. Sizes omitted per the founder's standing instruction.

| # | Wave | Increment | Depends on | Verification |
|---|---|---|---|---|
| **J1** | 0 | **The four deletions.** `routes/status.ts:61` (drop `activeSessions` from `GET /api/status`); `routes/users.ts:220-225` (drop `activeSessions` from the user list); `routes/threads.ts:251-267` (drop the per-agent `operationalStatus` derivation and its N+1); `routes/teams-routes.ts:242-301` (drop the session batch, `activeAgentCount`, `agentHealthWarning`, and the now-orphaned `readAgentRunConfigs` at `:246`). Strip the three dead fields from `TeamListItem` (`shared/src/team.ts:111-113`) and from `identities` (`web/src/hooks/useThreadDetail.ts:86-87,123`). `status.ts`, `users.ts`, `threads.ts`, `teams-routes.ts` all shed their `sessions` import | — | Existing route integration tests re-asserted against the narrowed bodies; `npm run check` proves no production consumer existed (only `.stories.tsx`/`__tests__` fixtures need editing — if a *production* `.tsx` fails to compile, the necessity finding was wrong and the deletion is reverted for that field); Playwright pass on Work → Overview, Work → Team, Conversations, Settings → Agents |
| **J2** | 0 | **Handoff shrink + existing port.** `routes/tasks.ts:295-325` — delete `resolvedWorkspacePath`, `sandboxPath`, `ingestion` and `traceId` from the constructed context (none is read by `handoff`); replace the raw row read with `AgentOrchestrationPort.sessions.getById`, obtained the same way `sessions-routes.ts:62` obtains it. **No new port surface** | — | `handoff-to.integration.test.ts` unweakened; `af7-handoff-revokes-tools.test.ts` green; a 404 for an unknown `sessionId` still returns the same body |
| **J3** | 0 | **Policy count.** `PolicyDeps.runOrchestration` (added by H1) gains `countOtherActiveRunsForTask(exec, taskId, excludeSessionId): Promise<number>`; new `run-orchestration` export; wired at `services/policy-bindings.ts:105`. `lifecycle-propagation.ts:289-303` reads the scalar. `packages/core-api/policy` sheds its `sessions` import | — | `lifecycle-propagation.integration.test.ts` unweakened — a sibling active run must still block `in_progress → review`, and the skip message must still read `${n} other active session(s) still running` |
| **J4** | 0 | **WS authorizer decomposition** (§3). `run-orchestration` exports `getRunSubscribeContext`; `SubscribeAuthorizerDeps` gains a fifth port; the Application wires it (`remote-server/src/create-server.ts:537-544`). **Free rider:** drop the redundant `deps.work.getTaskById` check and the whole `RealtimeTaskReader`/`work` edge with it. `packages/core-api/src/ws-subscribe-authorizer.ts` sheds its `sessions` import | C3 (landed) | `ws-subscribe-authz.integration.test.ts` unweakened: unknown session denies; task-backed session allows any authenticated principal; task-free session allows only `userId`-match / thread participant / same team. Add one case proving a run whose `taskId` points at a deleted task is unreachable (the FK proof, so the free rider is covered by a test and not only by an argument) |
| **J5a** | 1 | **`activeRunCounts`** — the port method, its backing GET route, its fidelity test; re-point sites #10, #11, #12, #13. `routes/recipients.ts` sheds its `sessions` import | B1a (landed) | `GET /api/agents`, both `PATCH` branches and `GET /api/recipients` return byte-identical bodies before/after; `git diff --stat packages/web` empty |
| **J5b** | 1 | **`listRunsByAgentIds`** — method, route, fidelity test; re-point sites #8 and #9. `routes/agent-profile.ts` sheds its `sessions` import; `routes/teams-routes.ts` is already clean after J1 | B1a, J1 | `GET /api/agents/:id/profile` and `GET /api/org/teams/:id` byte-identical, **including the degraded-health banner and the recent-runs list for an agent with more than 50 runs** (the cap trap in §4.1) |
| **J5c** | 1 | **`listRunsByTaskId` + `latestOutcomeByTaskIds`** — methods, routes, fidelity tests; re-point sites #6 and #7. `routes/tasks.ts` and `routes/bets.ts` shed their `sessions` imports. **After this increment `packages/core-api` imports the `sessions` table object in zero production files** | B1a, J2 | `GET /api/tasks/:id/sessions` and `GET /api/bets/:id` byte-identical incl. `latestSessionOutcome: null` for a task with no run (`bets.session-enrichment.integration.test.ts` unweakened); `git diff --stat packages/web` empty |
| **J-opt** | 0 | **Optional, orthogonal (§1.3).** `run-orchestration` exports `recordRunNotes(exec, sessionId, notes)`; both existing writers (`tool-handlers/src/tool-definitions.ts:519-522`, `run-orchestration/src/writeback-processor.ts:338`) call it. Removes a duplicated write of one column across two packages. Not required by the ruling | — | `write-session-notes.integration.test.ts` green; the writeback path still persists notes |

**Ordering rationale.** J1–J4 are dependency-free and delete or close five sites with no new port surface —
they should land first so the J5 series is smaller and its blast radius is only the read family. J5a/b/c are
split by *method*, not by *file*, so each is independently green and no increment ships a port method with no
caller (which `knip` would flag as dead surface).

**No collision with the live builder.** F2 (`filesystem_injections` → `agent-orchestration/agent-filesystems`)
is the outstanding increment and touches `routes/filesystems.ts` and `SettingsAgents.tsx`. The J series
touches neither. J1 and J5b both edit `routes/teams-routes.ts`, which is why J5b depends on J1.

---

## 6. What this cannot close cleanly

Three honest gaps. None of them is papered over with an invented mechanism.

1. **There is no anti-regrowth guard at the end of this, and there must not be one in AU26.**
   `scripts/table-ownership-guard.ts` structurally never walks `packages/core-api/src/` — it enumerates
   `packages/<layer>/<service>/` only (`:426-435`, and the `@lore` at `:36`). **Thirteen of the fifteen
   sites are invisible to it.** Closing that means either giving `sessions` a `TABLE_OWNER` row or widening
   the guard's scan scope — both are explicitly listed as out of AU26 in `plan.md` ("Still out": *giving
   `sessions` an owner*; *the guard's scan scope*) and both are rule-writing under the founder's
   moving-code-vs-writing-rules line. So AU26 can reach zero core-api reads and cannot *keep* it at zero.
   **AU28 inherits a one-line job it could not have had before:** with the J series landed,
   `TABLE_OWNER.sessions = "packages/agent-orchestration/run-orchestration"` plus the scan-scope widening
   becomes mechanically satisfiable, where today it would fire on fifteen sites. That is a genuine
   improvement in AU28's starting position and should be recorded in `architecture.md` §14 Finding 1 in place
   of its current site list.

2. **`write_session_notes` needs a rule, not a move.** §1.3. The duplicate-writer half is a move and is
   offered as J-opt; the "may `tool-handlers` write `run-orchestration`'s table" half is an intra-layer
   interface definition and is AU28's by the founder's own line. Saying otherwise would be inventing a
   boundary to look complete.

3. **Four deletions change response shapes, and that sits slightly against AC7.** AC7 says the UI works
   identically with zero required frontend behavior changes. J1 satisfies the *behavior* half exactly — no
   pixel moves, because nothing rendered these fields — but it does remove `activeSessions` from
   `GET /api/status` and `GET /api/users`, `operationalStatus` from thread identities, and
   `activeAgentCount`/`agentHealthWarning` from the team list. `packages/web` type declarations and test
   fixtures change even though no component does. That is a deliberate call: the founder asked whether the
   read is truly necessary, and an unread field is the clearest possible "no". It is flagged here rather than
   buried, because the alternative reading — "the wire shape is frozen, so keep the read" — would preserve
   four cross-layer reads to serve nothing.

   A related note on `GET /api/status` specifically: the root route has **no** consumer at all after
   `activeSessions` is dropped, since `agentStates` and `uptime` are equally unread. Deleting the whole route
   is the honest end state, but deleting a route is a product call, not a layering fix, so J1 scopes itself
   to the read and records the route as a candidate for whoever next audits dead HTTP surface.

---

## 7. Built (the founder's rulings, not §5's J series)

§5's J1–J5c were written before the founder ruled on the shape. The ruling replaced §4's port-based
mechanism outright — *"its all for UI? thats why orchestration now has an api so that the ui can get the
agent run state from the orchestration directly and combine this information in the ui instead of in the
core api service"* — and replaced §3's WS decomposition with a whole move — *"session dial in is 1000%
orchestration and has nothing to do with core."* What shipped, in four commits:

| # | What | Sites closed |
|---|---|---|
| **J1** | The four deletions (`status.ts`, `users.ts`, `threads.ts`, `teams-routes.ts` team list) + the handoff shrink (`sandboxPath`/`ingestion`/`traceId` deleted; the surviving run read goes down the EXISTING `AgentOrchestrationPort.sessions.getById`, no new port surface) | 1, 2, 3, 4, 5 |
| **J2** | The policy sibling-run guard **deleted outright** — no event, no counter, no downward call (`policy-sibling-guard.md`) | 15 |
| **J3** | `session:<id>` moved wholly onto `agent-orchestration`'s own socket (`/api/agent-orchestration/ws`), its own `SessionStreamHub`, its own authorizer (authenticated user + the run exists). Core's authorizer lost the branch, the `sessions` read, and three of its four DI ports | 14 |
| **J4** | Four run reads on orchestration's own read-door router (`/runs?task_id=`, `/runs?agent_ids=`, `/runs/active-counts`, `/runs/latest-outcomes`); core-api stopped returning run fields; the six screens fetch and combine client-side. `computeHealthSignals`/`deriveHealthLevel`/`deriveHealthDetail` moved to `@hyperidle/shared` so the browser runs the same derivations | 6, 7, 8, 9, 10, 11, 12, 13 |

**14 of 15 closed. `packages/core-api` imports the `sessions` table object in exactly ONE production file.**

### The one that remains — a BLOCKER, not an oversight

`packages/core-api/src/routes/teams-routes.ts` (the roster read inside `GET /api/org/teams/:teamId`).

The six run-derived roster fields are gone from the response as ruled. The read itself could not go, because
this route has a **second consumer of run state that is not a render at all**: `maybeNotifyAgentError`
enqueues an `agent.health.degraded` row into core's own `notification_queue` when a roster member is in the
error state. That is a real product feature — a notification the user sees in the popover — with **no other
producer anywhere in the repo** (`rg agent.health.degraded` hits only this file and its tests).

Removing it is a feature deletion, not a layering fix, and no founder ruling covers it. The read is therefore
left standing, scoped down to the three columns the health computation needs, with the reasoning inline at the
read site.

**What closing it needs:** a founder decision on where degraded-agent notification belongs. A reactor on
run-end is the obvious candidate — and note that a `GET` that writes a notification row is a smell
*independent* of layering: the notification fires only when somebody happens to open the team page.
