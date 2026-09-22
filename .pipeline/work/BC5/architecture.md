# BC5 — architecture

Technical shape of `.pipeline/work/BC5/plan.md`. Census: `facts-user.md`, `facts-subscriptions.md`.
Every claim is checked against `feature/user-subscriptions` @ `ffc7caa83` (base `84b4626fb`) with a
`file:line`; anything not checked says `UNVERIFIED`. Tasks and decisions below are PROPOSED — the
pipeline planner creates them.

## 0. What the census and the plan got wrong

1. **`teams.capacity` is read.** `edit_task` refuses an accept with `capacity_exceeded` from
   `team.capacity` (`layers/core-api/task/src/task-actions.ts:559-567`); `WorkTeam.tsx` shows it. The
   column has never been written (DEFAULT 5, `framework/db/src/schema.ts:49`), but dropping it (plan:
   "every other column goes") deletes the team WIP limit. **PLAN AMENDMENT PROPOSED:** drop the WIP
   limit with the column (invariant, its tests, `docs/process-layer/wip-and-cost-limits.md`) — the
   founder's "id and a name, nothing else" — or keep `capacity`. Blocks assume the drop (T11).
2. **Some users have neither team nor owner.** The two system users (`bootstrap/factory-state.ts`) and
   every factory-scope plugin agent — the librarian, owner of all three shipped subscriptions
   (`plugins/document-management/plugin.json`) — have `teamId` and `ownerUserId` null. Under "global +
   my team + my own" they would hear no task event (tasks are never global: `tasks.team_id` NOT NULL,
   `schema.ts:171`). **PLAN AMENDMENT PROPOSED (reading):** a user with neither team nor owner is
   factory-wide — its team is every team. Nothing new is stored.
3. **The transition filter is lost.** `post-task-retro` fires only on `done`
   (`plugin.json:39-40`, `transitionTo`). A subscription row has no filter (D-42sbt2); converted to
   `task.changed` it wakes the librarian — one harness session — on every task edit. **PLAN AMENDMENT
   PROPOSED**, founder choice: (a) convert, with a first prompt line "if this change did not move the
   task to done, stop" and accept the session cost; (b) drop `post-task-retro` from the plugin; (c) a
   filter field (a new outcome — not recommended). Blocks assume (a).
4. **Setup makes two agents today, the plan names one.** `POST /users` scaffolds the person's owned
   assistant (`routes/users.ts:145-173`); `POST /teams` scaffolds a nameless team agent with a null
   prompt (`teams-routes.ts:269-299`), then stamps the picked harness on the assistant (`:348-385`) and
   posts a welcome. **PLAN AMENDMENT PROPOSED:** "then `edit_user` (new agent)" is the person's own
   assistant, owned, carrying the picked harness — onboarding lands on the assistant overlay
   (`SetupFlow.tsx:240`, `/work?onboarding=true`). The team agent goes with the scaffold.
5. **The welcome screen needs the harness list before anyone exists.** `SetupFlow.tsx:165` reads
   `GET /harnesses` on mount; the API-key actor then is the literal `"u-founder"` with no row
   (`middleware/auth.ts:142-149`). Settled in §7: `open_user` with no id opens the caller and answers
   `user: null` for that one moment. Folder inspection (`SetupFlow.tsx:218,:325`) moves inside
   `edit_user`; the post-pick confirmation row keeps the path but loses the git-branch detail — the
   only visible change on that screen. Founder may veto (then: a preload `shell.inspectFolder`).
6. **The lint cannot see dotted event names.** Clause 4 extracts `EVENT_TYPES` members with
   `/["'`]([a-z_]+)["'`]/g` (`tools/governance/src/rules/actions-projected.ts:329`); `"task.changed"`
   never matches, so the nine would be invisible. Widen to `[a-z_.]+` (T3).
7. **`agent_work_intent_recorded` dies with the scheduler.** One emitter (`routine-scheduler.ts:241`),
   one subscriber (`run-orchestration/src/start-runtime.ts:325`). A mention never emitted it — the
   seam recorder is a bare `port.intents.submit` (`services/agent-orchestration-port-composition.ts:
   336-340`) and the drain picks intents up within a second. Delete the type, the subscriber and its
   `PLATFORM_EVENTS` row (eight → seven) (T8).
8. **The four tools are all of `tool-definitions.ts`** (`:57,:146,:225,:324`) and the only consumer
   of `CoreApiPort` (`agent-orchestration/src/services/tool-handlers-bindings.ts:88-151`). Deleting
   them deletes `CoreApiPort` (`framework/api-contract/src/core-api-port.ts`), orchestration's
   `core-api-port-composition.ts` (387) and both applications' `coreApiTransport`
   (`remote-server/src/create-server.ts:287-292,:391,:449`; `desktop/src/create-server.ts:195-200,
   :275,:321`). `CORE_API_ACTOR_OVERRIDE_HEADER` survives: `middleware/auth.ts:146` reads it and 16
   test files send it.
9. **Connections and folders cannot move into core.** LAYER-BELOW §8 says they "move to the user
   module". Orchestration reads both at provisioning (held tokens: `connections/src/service-connection-
   resolver.ts`; mounts: `filesystems/src/injected-filesystems-for-provisioning.ts`), so a move makes
   the executor read core — against the founder's blind-executor rule. Reading taken: the user module
   owns the *verbs*; the rows stay where the executor reads them, reached through
   `AgentOrchestrationPort` exactly as `runConfig` already is (`api-contract/src/agent-orchestration-
   port.ts`, `runConfig`/`filesystems`). Same for `agent_run_config`.
10. **Three migrations, not one.** Tests build PGlite from migrations, so the new tables must exist
    before the user module's tests; a dropped table or column must go in the same block as its last
    reader, or `npm run check` goes red mid-chain. 0088 adds (T2), 0089 cuts routines and
    notifications over (T7), 0090 cuts teams, sessions and the intent vocabulary (T11). The journal
    ends at idx 87 (`framework/db/drizzle/meta/_journal.json`).
11. **No `document_id` column.** `doc_parent_slot_uq` allows one `prompt` document per parent
    (`schema.ts:944-946`), so the librarian's three prompts cannot all hang off the agent. Migration
    0077 already chose parenting over a pointer. A subscription's document is the `prompt`-slot
    document parented `('subscription', <id>)`; subscription ids reuse routine ids, so the migration
    only respells `parent_kind`.
12. **Agent health notices go.** `services/agent-health-session-end-reactions.ts` (201) writes queue
    rows with no type key (facts-subscriptions §2.7). With the queue gone it has nowhere to write, and
    a notification object of its own was rejected. Consequence: "agent crashed 3× in 7 days" is no
    longer surfaced. Deleted in T7.
13. **"Email goes" = delivery.** `nodemailer`, `install.ts:deliver`, the SMTP config. The
    `users.email` profile column stays (SettingsProfile edits it).
14. **An owned agent reads no team documents today.** `resolveViewer` takes `actor.teamId`
    (`document/src/document-actions.ts:115-127`), as does the socket check
    (`ws-subscribe-authorizer.ts:168-177`); an assistant's is null. "An owned agent takes its owner's"
    team means both use the owner's team — a small visible widening for assistants, in T7 with reach.

## 1. The three declarations — `framework/domain-model/src/actions/user.ts`

Shaped like `actions/document.ts`/`platform.ts`: zod `input`/`output` that `z.toJSONSchema` accepts,
a `sentence`, pure invariants returning `Problem[]`, a `USER_ACTIONS` map; exported from `src/index.ts`;
`layers/core-ui/src/services/call.ts:20` gains `& typeof USER_ACTIONS`.

**Vocabulary** (same file): `OBJECT_EVENTS` — the nine, `as const` (`task.created`, `task.changed`,
`thread.created`, `thread.message`, `thread.changed`, `document.created`, `document.changed`,
`user.created`, `user.changed`). `USER_KINDS = ["human","ai"]`. `USER_STATUSES` derived by the builder
from the writers (seen: `active`, `idle`, `inactive`, `retired` — `routes/agents.ts:430`,
`users/src/runnable-agent.ts`, `platform-actions.ts:146`). `ChangeRowSchema` `{ id, object, objectId,
kind: created|changed|message, actor, before: record|null, after: record, at }` — the parsed
`changes` row, shared by the inbox, the bus and the wake.

**`UserRowSchema`** `{ id, kind, name, role, status, email|null, avatarUrl|null, createdAt,
agentCategory|null, ownerUserId|null, team: {id,name}|null, edges: EdgeSchema[] }`. `team` is the
*effective* team: own, else the owner's. `edges` = this user's outgoing `org_edges`
(`{ id, mechanism, target }`) so the org chart needs one call.

**`search_users`** `{ ids?, kind?, teamId?, name?, ownerUserId?, status?, limit? (≤500) }` `.strict()`
→ `UserRow[]`, name order. No filter lists everyone (the roster, the picker). `teamId` matches the
effective team. `name` is a case-insensitive contains. No invariants.

**`open_user`** `{ id? }` — absent = the caller. → `UserView`:

```
{ user: UserRow | null,                 // null only when the caller has no row (first run, §7)
  runsOn: HarnessDescriptor[],          // this machine's harnesses, disabled stamped; same on every view
  runConfig: { harnessType, modelId, modelProvider, maxConcurrentSessions, modelOptions } | null, // agents
  documentIds: { slot, id }[],          // agent-parented identity/skill/rule documents
  folders: FolderView[],                // agent: folders given to it; person: its team's folders
  subscriptions: { id, event|null, schedule|null, paused, documentId|null, nextRunAt|null }[],
  connections: { connections: ConnectionView[], inherited: InheritedReachView[] } | null, // self only
  behaviour: BehaviourEntry[] | null,   // self only — the configuration defaults + overrides
  inbox: { change: ChangeRow, seenAt|null, readAt|null }[] | null }   // self only, newest 50
```

`HarnessDescriptor`, `ConnectionView`, `FolderView`, `BehaviourEntry` become zod schemas here, the
same shape the deleted routes returned (`HarnessCapabilityDescriptor`; `routes/connections.ts` list
row, no token; `routes/filesystems.ts:88-100` view; `AgentBehaviorConfigView`,
`domain-model/src/agent-behavior-config.ts`) — one declaration of each, the TS interfaces go.
Problem: `not_found`.

**`edit_user`** — one partial; no `id` creates. Returns `UserView`.

```
{ id?, kind? (create-only), name?, role?, email?, avatarUrl?, status?,
  team?: { name },                                   // found by name (oldest) or created
  ownerUserId? (create-only, agents),
  runConfig?: { harnessType?, modelId?, modelProvider?, modelOptions?, maxConcurrentSessions? },
  edges?: { add?: {mechanism, target}[], remove?: edgeId[] },
  folders?: { add?: {path}[], remove?: id[], give?: id[], take?: id[] },
  connections?: { add?: {service, authSource, token?, serverUrl?}[], remove?: id[] },
  subscriptions?: { add?: {event?, schedule?, prompt?: string|null, paused?}[],
                    change?: {id, event?, schedule?, prompt?: string|null, paused?}[],
                    remove?: id[] },
  inbox?: { seen?: "all" | changeId[], read?: changeId[] },
  behaviour?: { id, fields: Record<string, string|boolean|null> }[],
  redetectHarnesses?: true }
```

`event` is `z.enum(OBJECT_EVENTS)` — an unknown event is refused by the parse, not a problem code.

**Pure** (`editUserInvariants(input)`): `kind_required`, `name_required` (create);
`belonging_required` (create with neither `team` nor `ownerUserId` — every user is in a team);
`owned_agent_has_no_team` (`ownerUserId` with `team`); `person_has_no_owner`;
`kind_is_create_only`, `owner_is_create_only` (with `id`); `event_or_schedule` (exactly one per added
subscription). **Need the database** (inside `run`): `not_found`, `unknown_actor` (a rowless caller
may only create the first person, §7), `unknown_owner` (owner is not a person), `owned_agent_has_no_team`
(team set on an existing owned agent), `unknown_user` (edge target), `schedule_for_agents_only`,
`prompt_for_agents_only`, `agent_not_runnable` (a subscription on an agent `requireRunnableAgent`
refuses — `users/src/runnable-agent.ts`), `invalid_schedule` (`parseCron` throws), `unknown_subscription`,
`unknown_edge`, `unknown_folder`, `folder_other_team`, `invalid_path`, `unknown_connection`,
`connection_invalid`, `yourself_only` (connections, inbox, behaviour on someone else — today's
per-caller scoping, `routes/connections.ts:10`), plus `validate-agent-config.ts`'s harness/model codes
carried verbatim.

## 2. Tables and migrations

**0088_user_subscriptions.sql (T2, additive).**

```sql
CREATE TABLE "subscriptions" (
  "id" text PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "event" text, "schedule" text,
  "paused" boolean NOT NULL DEFAULT false,
  "next_run_at" text,                                   -- schedule rows only
  "created_at" text NOT NULL, "updated_at" text NOT NULL,
  CONSTRAINT "subscriptions_trigger_ck" CHECK (("event" IS NULL) <> ("schedule" IS NULL)),
  CONSTRAINT "subscriptions_event_ck" CHECK ("event" IS NULL OR "event" IN (<the nine>)),
  CONSTRAINT "subscriptions_next_run_ck" CHECK ("next_run_at" IS NULL OR "schedule" IS NOT NULL));
CREATE INDEX "subscriptions_user_idx" ON "subscriptions" ("user_id");
CREATE INDEX "subscriptions_event_idx" ON "subscriptions" ("event") WHERE "event" IS NOT NULL;
CREATE TABLE "inbox" (
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "change_id" text NOT NULL REFERENCES "changes"("id") ON DELETE CASCADE,
  "seen_at" text, "read_at" text,
  PRIMARY KEY ("user_id", "change_id"));
```

Plus: `agent_work_intents` kind / source-kind / compat checks and `documents.doc_parent_kind_ck` gain
`subscription_run` / `subscription` / `subscription` beside the routine members (removed by
0089/0090). `schema.ts` gains `subscriptions`, `inbox`; `table-owners.json` gains both → `user`.
`next_run_at` exists because a laptop asleep at 03:00 must still run the weekly job on wake — the
routine behaviour (`routine-scheduler.ts` tick, `nextRunAt <= now`).

**0089_routines_become_subscriptions.sql (T7).** (1) `INSERT INTO subscriptions` from live routines
(`deleted_at IS NULL`, trigger `event`/`calendar`): same `id`, `user_id = owner_agent_id`,
`event` mapped (`task_state_changed`→`task.changed`, `thread_created`→`thread.created`,
`thread_message_appended`→`thread.message`, `thread_resolved`/`thread_reopened`→`thread.changed`;
any other name `RAISE EXCEPTION`), `schedule = trigger_config::json->>'cron'`, `paused = (state <>
'active' OR NOT active)`, `next_run_at`, timestamps. (2) `UPDATE documents SET parent_kind =
'subscription'` where the parent is a migrated routine; `DELETE` the prompt documents of routines not
migrated. (3) `plugin_contributions.kind`, `plugin_configuration_defaults.kind`,
`configuration_overrides.kind` `routine` → `subscription` and their checks respelled
(`schema.ts:1172,1227,1254`). (4) `DROP TABLE routine_runs, routines, notification_queue`. (5)
documents parent-kind check loses `routine`. Hand-written, journal entry, `framework/db/drizzle/
README.md` steps. No deployments exist, so no row is preserved beyond this.

**0090_team_is_a_name.sql (T11).** (1) Every human with no team gets the target of its
`mechanism='team'` org edge, else the oldest team; then `DELETE FROM org_edges WHERE mechanism =
'team'` (membership is the column now; the vocabulary loses `team` — whether `org_edges.mechanism`
has a CHECK is `UNVERIFIED`, builder checks). (2) `ALTER TABLE teams DROP` `phase`, `brief_path`,
`architecture_path`, `brand_path`, `principles_path`, `factory_db_path`, `lead_agent_id`, `capacity`,
`formed_at`. (3) `sessions.source_kind`, `agent_session_requests.source_kind/prompt_mode`,
`agent_work_intents.kind/source_kind` `routine*` → `subscription*`; `DROP INDEX
sessions_routine_id_idx`, `DROP COLUMN sessions.routine_id`; intent checks narrowed to the final set.
`users.team_id` stays nullable: owned agents must keep it null (`users_belonging_ck`,
`schema.ts:90-93`) and the system users exist before any team; "every user is in a team" is the
`belonging_required` invariant plus the migration, not a column constraint.
Check `framework/db/src/__tests__/pg-migration.integration.test.ts` for table lists in all three.

## 3. Events — every change row is one

- `framework/event-bus/src/events.ts`: one `ObjectChangeEvent` `{ type: <one of the nine>, streamId:
  objectId, change: ChangeRow, timestamp, cascade?: true }` in `DomainEvent`; the nine spelled out in
  `EVENT_TYPES` (the lint parses the literal). A helper `objectEvent(row, opts?)` builds it from a
  `changes` row (`${object}.${kind}`, JSON parsed).
- **The emit lives in each module, post commit, over the rows it appended** — the idiom thread and
  document already use for the socket (`thread-actions.ts:1241`, `document-actions.ts:870`). Task
  collects the rows `appendChange` returns (`task-actions.ts:380,:711,:730`; its dep type widens from
  `Promise<unknown>` to the row) and emits after `:811`; the kill cascade's descendant rows carry
  `cascade: true` (`:380` loop). The user module does the same. No wrapper: four modules, four loops
  of one line; a shared helper that knew about commit would need the transaction.
- **`task_state_changed` → `task.created`/`task.changed`**: lifecycle propagation
  (`policy/src/lifecycle-propagation.ts:407`) and the dependency watcher (`app.ts:620`) read
  `change.after.state` (present only when state moved — `diffFields` keeps differing fields) and
  keep the cascade skip. Emits at `task-actions.ts:818,:829` go.
- **Emits removed** in T3: `thread-actions.ts:1119,:1129,:1140,:1149`; `dependency-watcher.ts:82,:154`
  (`notification`, zero subscribers). **Types removed** with their last listener, the routine matcher,
  in T7: `task_state_changed`, the four `thread_*`, `notification`. `team_created`, `agent_added`,
  `user_created` go with their emitters in T11. `session_started/ended/not_returned` stay (D-e3zm2j).
- Subscribers that change: the two above; the routine matcher (deleted); nothing else listens to
  the deleted names (facts-subscriptions §3.1). The socket authorizer changes for `user:` only (§4).

## 4. The firing mechanism — `@hyperidle/user`

**Fire** (`subscription-fire.ts`), registered in `app.ts` beside the dependency watcher, on the nine
types. Per event, after the emitter's commit (the bus handler starts a `void` async — no open
transaction, so PGlite's one connection is free):

1. `listSubscriptions({ event: e.type, paused: false })`; drop the change's own actor — **a user is
   never woken or told about its own change** (the one loop cut: a routine re-triggering itself).
2. Reach, per subscriber `u`, where `teamsOf(u)` = own team, else owner's, else every team (§0.2):
   - task: `open_task` once (system) → `task.teamId ∈ teamsOf(u)` or `task.ownerAgentId === u.id`;
   - thread: `open_thread` **as `u`** answers ok (`canReadThread`, `thread-actions.ts:408`);
   - document: `open_document` **as `u`** answers ok (`canReadDocument`, `document-actions.ts:428-432`);
   - user: the changed user's effective team `∈ teamsOf(u)`, or it is `u`, or `u` owns it.
   Global falls out of the modules' own read rules (host-scoped threads, factory documents). Reach
   is computed at fire time, never stored. A subscription never reaches more than `open` would.
3. Agent → `resolveSubscriptionWakeRequest` then `deps.agentWorkIntentRecorder` — the function a
   mention calls (`thread-actions.ts:1217`, bound `compose.ts:93`):
   `{ kind: "subscription_run", sourceKind: "subscription", sourceId: "<subId>:<changeId>",
   requestedBy: change.actor, idempotencyKey: "subscription:<subId>:<changeId>", bakedRequest }`.
   A bake failure drops that wake and is logged, never thrown (`thread-actions.ts:1226-1236` idiom).
4. Person → insert `inbox (u.id, change.id)` `onConflictDoNothing`; if inserted,
   `wsPush("user:"+u.id, { type:"update", topic:"user:"+u.id, kind:"inbox", data:{ changeId } })`.

**Baked request** — the routine shape (`routine-service.ts:479-604`) renamed, reusing
`assembleSessionDocuments`, `bakeAgentRunnableConfig` and `getAgentIdentity` through deps:
`{ defaultAgentId, sourceKind:"subscription", sourceId, streamId:"subscription:<subId>", teamId?,
userId? (owner), taskId:null, sourceCorrelation:{ subscriptionId, changeId?, teamId? },
contextBundle:{ kind:"subscription", subscription:{ id, event, schedule }, prompt: string|null,
change: ChangeRow|null, agent, team|null, documents }, agentConfig, harnessDisabled? }`.
`prompt` is the body of the subscription's `prompt` document (`search_documents` parent
`('subscription', id)`), ranking input when present, else the event name.

**Clock** (`subscription-clock.ts`): `cron.ts` moved verbatim from `layers/core-api/routine/src/`;
`setInterval` (default 30 s, `AppOptions.subscriptionClockMs` replaces `routinePollIntervalMs`), a
running guard, and each due row (`schedule` set, not paused, `next_run_at <= now`) wakes with
`change: null`, `sourceId "<subId>:<next_run_at>"`, then `next_run_at = nextCronMatch(now)`. The wake
message says it is a scheduled run of `<cron>`. Started and stopped in `app.ts` with the fire (both
need the composed runners, which `registerAgentLayerServices` never had —
`service-bootstrap.ts:393-419`).

**Socket**: `ws-subscribe-authorizer.ts` gains `user:<id>` → `topic.slice(5) === senderId`
(beside `:192-195`). Content-free nudge; the hook re-runs `open_user`.

**"Run it now"** is `send_message` to the agent — no code.

## 5. Orchestration — the routine flavour becomes the subscription flavour

T6 adds, T8 deletes; the pair lands as a rename.

- Vocabulary: `AGENT_WORK_INTENT_KINDS` (both copies — `event-bus/src/events.ts:26`,
  `domain-model/src/work-intent.ts:632`), `AgentWorkIntentRecorderInput` (`work-intent.ts:585`),
  `AgentWorkIntentSourceKind`, intake `WORK_INTENT_KINDS` (`agent-orchestration-intake.ts:34`),
  `AgentOrchestrationWorkIntentKind`, `session-requests/src/guards.ts:17`, `errors.ts:18`:
  `routine_run` → `subscription_run`. `AGENT_SESSION_SOURCE_KINDS`/`PROMPT_MODES`
  (`session-request.ts:9-31`) `routine` → `subscription`; `routineSessionRequestInputSchema` →
  `subscriptionSessionRequestInputSchema` with the §4 correlation.
- `BakedContextBundle` `kind:"routine"` (`work-intent.ts:508-525`) → `kind:"subscription"`;
  `RoutineTriggerEvent` (`:343-470`) deleted — the change row replaces it; `lastRunSummary` deleted.
- `run-orchestration/src/context.ts`: `RoutineSessionContextData`/`assembleRoutinePrompt`/
  `buildRoutineTaskSection` (`:101-626`) → subscription versions: `## Subscription` (event or
  schedule), `### Instruction` (prompt), `### What happened` (the change; values over 2,000 chars cut
  with "open the object for the rest").
- `provisioner.ts`: `params.routineId` (`:881,:1230,:1271,:1285,:1331,:1508`) goes; the flavour is
  `contextBundle.kind === "subscription"`. `runtime.ts:522` goes.
- Deleted outright (T8): `routineRunOutcome` (`events.ts` `SessionEndedEvent`; emitters
  `transition-run.ts:238-240,:319`, `session-store.ts:211`, `runtime-reapers.ts:210`),
  `context.routineId` (`transition-run.ts:171`), `reapStaleRoutineSessions` + `reapers.routines`
  (`runtime-reapers.ts:131-238`, `start-runtime.ts:417-418`, `contracts.ts:309-312`, both apps'
  `reapers.routines`) — it healed routine-run coalescing, which no longer exists;
  `SessionRow.routineId` + `search_sessions.routineId` (`domain-model/src/actions/session.ts:60,:79`,
  `session-actions.ts:87,:107`, `session-store.ts:44,:61`), `AgentOrchestrationSessionWireRow.routineId`;
  `agent_work_intent_recorded` + `start-runtime.ts:316-325` (§0.7).
- Core `agent-run-admission-reactions.ts:213-224` `routine_run` case → `subscription_run`: log the
  refused wake; there is nothing to finalize.

## 6. Where the module lives, and what it reaches

`layers/core-api/user` (`@hyperidle/user`) owns `users`, `teams`, `org_edges`, `login_sessions`,
`invite_codes`, `subscriptions`, `inbox` (`table-owners.json`; `architecture.json` rows naming
`users`/`org`/`routine`/`notifications`/`tool-handlers` checked). Relocated verbatim: all of
`layers/core-api/users/src/*`, `org/src/team-lookup.ts`, `org/src/org-edges.ts`, `routine/src/cron.ts`.
`org-routing.ts` (zero production callers, facts-user §8) is deleted, not moved.

Actions: `user-actions.ts` returns `Action[]` with a local structural `Action`/`ActionContext`
mirror (`platform-actions.ts:98-120` idiom). `compose.ts` builds it fifth, after platform. Deps bag:

```
{ changes: { appendChange },
  runConfig, folders, connections  — from AgentOrchestrationPort,
  agentWorkIntentRecorder,
  harnesses?: { describe(): HarnessDescriptor[], redetect(): Promise<void> },   // adapterPool + onHarnessRedetect, app.ts:131,:168
  readServerConfig,                 // harnessDisabled stamp, as routes/harnesses.ts does
  behaviour: { list(db), patch(db, id, fields, actor) },   // @hyperidle/settings
  searchDocuments, editDocument,    // prompt documents, documentIds
  requireRunnableAgent, getAgentIdentity, assembleSessionDocuments, wsPush? }
```

- **Port additions (T4)** on `AgentOrchestrationPort`, each an intake PLUMBING route plus the client
  in `core-api/src/services/agent-orchestration-port-composition.ts`:
  `folders { list({teamId}|{agentUserId}), add({teamId, path}) (inspects, picks code|doc_set),
  remove(id), give(id, agentUserId) (= today's persistInjection), take(id, agentUserId) }`;
  `connections { list(userId) → {connections, inherited}, add(userId, input) (validates, encrypts),
  remove(userId, id) }`. Bodies move out of `agent-orchestration/src/routes/{connections,filesystems}.ts`
  into functions both call until T11 deletes the routes. `filesystems.getTeamId` and its row
  `GET /filesystems/:id/team` die with their only caller (`core-api/src/routes/filesystems.ts`) in
  T11; `give` checks team by `folders.list({teamId})`.
- `validate-agent-config.ts` moves into `@hyperidle/user`, taking descriptors through deps;
  `agent-behavior-config-impl.ts` moves into `@hyperidle/settings` (owner of the configuration tables).
  Both old route files import the moved ones until T11.
- `edit_user` order: validate → one transaction for users/teams/edges/subscriptions + one `user`
  change row → commit → port calls (run config, folders, connections), prompt documents through
  `editDocument` with `internal: true` set inside the module, behaviour writes, redetect → emit. The
  port and document calls never sit inside the module's transaction.
- **Change rows** (`object:'user'`): one per edit that changes identity fields, team, run config,
  edges or subscriptions. Inbox marks, folders, connections, behaviour and redetect append none —
  marking your inbox read must not notify anyone.
- `DOCUMENT_PARENT_KINDS` (`actions/document.ts:36`) and `edit_document`'s system-only parent set:
  `routine` → `subscription`; `compose.ts:189-192` `systemParentExists` asks the user module.
- Platform: `PlatformActionsDeps.routines` (`platform-actions.ts:154-163`) → `subscriptions
  { insert, setLive (paused = !live), remove, get }`; manifest `routines[]` → `subscriptions[]
  { id, agentId, event? | schedule?, prompt? }` (`plugin-manifest.ts:121-156`); `routineItemId` →
  `subscriptionItemId` (new hash input — a reinstall reconciles through `forgetContributionsExcept`);
  contribution label = event or schedule.

## 7. The welcome screen

`SetupFlow.tsx` keeps its markup and calls the authed door with the key every client already sends
(`services/api-fetch.ts` injects `X-API-Key` on every `/api/*`): mount → `open_user({})` for
`runsOn`; Start → `edit_user({ kind:"human", name, team:{ name: <folder basename | "My Team"> },
folders:{ add:[{ path }] }? })` → `edit_user({ kind:"ai", name:"<name>'s Assistant",
role:"assistant", ownerUserId, runConfig:<picked harness> })` → navigate as today.

**First-run rule** inside `edit_user`: a caller with no `users` row may create a person only while no
person exists (else `unknown_actor`); that change row's actor is the new person (`changes.actor`
is a FK, `schema.ts:582-584`). This is the pre-auth route's guard (`routes/users.ts:107-126`) behind
the auth middleware instead of in front of it — strictly tighter. `createUserSetupRoute` and its mount
(`app.ts:320-329`) go; the scaffold, the welcome message and `team_created` go.
`FirstRunRedirect.tsx` → `search_users({ kind:"human" })` non-empty with a team → `/work`, else
`/setup`. `GET /auth/me` stays plumbing; `useCurrentUser` is untouched.

## 8. UI re-pointing

| Screen / hook | Now | Becomes |
|---|---|---|
| `SettingsProfile.tsx:67` | `PATCH /users/:id` | `edit_user({ id: me, name, email })` |
| `SettingsOrgChart.tsx:111,:129,:153` | `/org` ×3 | `search_users()` (rows carry `team`, `edges`); `edit_user({ id: from, edges })` |
| `SettingsAgents.tsx`, `AgentEditor.tsx`, `AgentAddDialog.tsx:97`, `work/AgentDetailPane.tsx:83` | `/agents` CRUD, `/harnesses`, `/org`, `/filesystems`, injections | `search_users({ kind:"ai" })`; `open_user({ id })` (`runsOn`, `runConfig`, `folders`); `edit_user` create / patch / `status:"retired"` / `folders.give|take` |
| `SettingsFilesystems.tsx:77,:94` | `/org`, `/filesystems?teamId` | `open_user({})`.folders; `edit_user({ id: me, folders })` |
| `SettingsHarnesses.tsx:177,:196` | `/harnesses`, redetect | `open_user({})`.runsOn; `edit_user({ id: me, redetectHarnesses: true })` |
| `SettingsConnections.tsx:106,:370,:392` | `/connections` | `open_user({})`.connections; `edit_user({ id: me, connections })` |
| `SettingsAgentBehavior.tsx:78,:133` | `/settings/agent-behavior` | `open_user({})`.behaviour; `edit_user({ id: me, behaviour })` |
| `SettingsNotifications.tsx` + `useNotificationMute.ts` | global mute | the nine events, one toggle each over my event subscriptions (off = paused); hook deleted |
| `NotificationPopover.tsx` + `useNotifications.ts` | `/notifications` ×3 | `open_user({})`.inbox; `edit_user({ id: me, inbox })`; `getWsClient().subscribe("user:"+me)` refetch; renders the change row, links to the object |
| `WorkTeam.tsx`, `useTeam.ts`, `useTeams.ts`, `useTeamAgents.ts`, `WorkOverview.tsx` | `/teams`, `/agents` | `search_users({ teamId })` + `search_tasks({ teamId })`; teams = distinct `team` of `search_users()`; routines block (~446-520) and capacity display deleted |
| `AgentProfile.tsx`, `useAgentProfile.ts:39` | `/agents/:id/profile` | `open_user({ id })` + new `SubscriptionsSection.tsx` (+ story): list, add (event select or cron text, prompt text), pause, remove; raw cron shown |
| `RecipientPicker.tsx`, `useRecipients.ts:114` | `/recipients` | `search_users({ status:"active", name })` |
| `AssistantOverlay.tsx` | `/agents` | `search_users({ kind:"ai", ownerUserId: me })` |
| `FirstRunRedirect.tsx`, `SetupFlow.tsx` | §7 | §7 |
| `WorkRoutine.tsx`, `work/RoutineDetailPane.tsx`, `work/RoutineCreateDialog.tsx`, `useRoutine.ts`, `router.tsx:83` | routines | deleted with stories and tests |

`useAgents.ts`, `useAgentRunState.ts` comments, `settings-types.ts`, `model-options-for-harness.ts`
follow their callers. No redesign; each screen keeps its markup.

## 9. Deletions and their real consumers

- **Packages** `layers/core-api/{routine,notifications,org}` (users is relocated): vitest PROJECTS rows
  (`vitest.config.ts:26,28,29,32`), `layers/core-api/package.json:26-31`,
  `layers/core-api/task/package.json:22-23`, `tools/eval/package.json:24,26`, knip ignore
  `layers/core-api/src/__tests__/notifications-test-deps.ts` (`knip.json:28`), `nodemailer` +
  `@types/nodemailer`, `tools/repo-gates/src/__tests__/dep-manifest-verdict.test.ts`,
  `framework/db/src/__tests__/governance-crossings.test.ts`; 59 files import the four names (21
  production — rg census).
- **Core routes** `users` (297), `agents` (447), `agent-profile` (222), `org` (259), `teams-routes`
  (683), `recipients` (70), `routines-routes` (709), `notifications-routes` (125), `filesystems` (107),
  `harnesses` (97), `settings-agent-behavior` (78), `agent-identity` (155 — its only callers are the
  deleted routes); orchestration `routes/connections.ts` (520), `routes/filesystems.ts` (319). 51
  server tests, 38 UI tests, 37 Playwright specs + `__e2e__/fixtures.ts` +
  `known-pre-existing-failures.ts` hit them by URL (rg). A test of deleted behaviour is deleted; a
  test that only *seeds* through a route re-seeds through `edit_user` or a direct row.
- **Services** `routine-scheduler-bindings.ts`, `routine-run-session-end-reactions.ts`,
  `agent-health-session-end-reactions.ts` and their `service-bootstrap.ts` registrations (`:215-235`,
  `:393-419`); `reap` (`service-bootstrap.ts:16,:332`).
- **Tools** all four + `tool-handlers/src/ports.ts` seams + `tool-handlers-bindings.ts` +
  `core-api-port-composition.ts` + `CoreApiPort` (§0.8); `buildToolRegistry`/`toRegistered` stay if
  still imported (builder checks; else the package goes too).
- **Domain model** `routine.ts`, `notifications.ts`; `team.ts` shrinks to what survives the UI
  re-point; `agent-behavior-config.ts` becomes the zod in `user.ts`; `routine-detail` link target.
- **Seed/eval** `tools/setup/src/demo-fixture.ts:330-347`, `demo-world/activity.ts:195-281` (queue
  and routine-run rows), `cast.ts:39-50` (Maya gets `teamId`); `tools/eval/src/scenarios/
  routine-sessions.ts` converted to a schedule subscription (registered in `scenarios/index.ts`).
- **Plugin** `plugins/document-management/plugin.json` three entries → `subscriptions` (§0.3).

## 10. Governance (`actions-projected.ts`)

Each row leaves in the block that deletes its subject (a stale row is itself an error, `:396-406`).
`LEGACY_ROUTES`: T7 the 5 notifications + 7 routines rows; T11 the other 36 (agents 5, core
filesystems 1, harnesses 2, org 7, recipients 1, settings-agent-behavior 2, teams 4, users 4,
connections 4, orchestration filesystems 6). `PLUMBING_ROUTES`: T4 adds the new intake rows; T11
removes `GET /filesystems/:id/team`. `LEGACY_TOOLS`: T7 `create_routine`, `update_routine`; T11
`add_agent`, `create_team` (leaves `return_status`). `LEGACY_EVENTS`: T7 six; T11 three (leaves the
three `session_*`). `PLATFORM_EVENTS`: T8 −1. Clause-4 regex (§0.6) in T3. Header prose (`:2-4`) →
six modules, eighteen names (T1). Clause 1 is red on `search_users`/`open_user`/`edit_user` from T1
until the UI lands (D-9p94bz precedent): no decoy call, no rule edit.

## 11. Builder blocks

Every block ends with `npm run check` green and `npm run lint` red only on the clause-1 rows still
waiting for the UI (listed in the report). Tests of behaviour a later block deletes may stay red
until then; each block lists them. One pathspec commit each; ids never in code.

**T1 — declarations.** Goal §1. Scope `framework/domain-model/src/actions/user.ts`,
`framework/domain-model/src/index.ts`, `framework/domain-model/src/__tests__/`,
`layers/core-ui/src/services/call.ts`, `tools/governance/src/rules/actions-projected.ts` (prose).
Needs —. Red: each pure problem code once. Lint red: clause 1 ×3. ~+420.

**T2 — the package and 0088.** Goal §6 relocation + §2 0088. Scope `layers/core-api/user/`,
`layers/core-api/users/`, `layers/core-api/org/src/{team-lookup,org-edges,org-routing}.ts`,
`routine/src/cron.ts`, every importer of `@hyperidle/users` and of the two org files (repoint),
`framework/db/{src/schema.ts,drizzle/0088_*,drizzle/meta/_journal.json}`,
`tools/governance/{table-owners,architecture}.json`, `vitest.config.ts`, package manifests,
`tools/eval/src/provision-harness.ts`. Needs T1. Red: a `subscriptions` row violating each check is
refused. Deletes `org-routing.ts` + test. ~+120 new, ~1,030 moved, −273.

**T3 — nine events.** Goal §3 (T3 part). Scope `framework/event-bus/src/events.ts`,
`layers/core-api/{task,thread,document}/src/*-actions.ts`, `task/src/dependency-watcher.ts`,
`policy/src/lifecycle-propagation.ts`, `layers/core-api/src/app.ts` (watcher only),
`actions-projected.ts` (regex). Needs T2. Red: an `edit_task` state move emits exactly one
`task.changed` carrying the row; a kill emits `cascade:true` for descendants; propagation still
completes a parent. Expected red until T7: routine-scheduler event tests. ~+120/−90.

**T4 — folders and connections behind the port.** Goal §6 port. Scope
`framework/api-contract/src/agent-orchestration-port.ts`, `agent-orchestration-intake.ts`,
`agent-orchestration/src/routes/{connections,filesystems}.ts` (extract only),
`core-api/src/services/agent-orchestration-port-composition.ts`, `actions-projected.ts`
(PLUMBING). Needs T2. Red: through the composed app, add → list → give → take → remove a folder and a
connection. ~+260, ~300 moved.

**T5 — the user module.** Goal §1 runs, §6. Scope `layers/core-api/user/src/user-actions.ts` (+
validate-agent-config move), `layers/core-api/settings/src/` (behaviour impl move),
`layers/core-api/src/actions/compose.ts`, `app.ts` (deps), `layers/core-api/user/src/__tests__/`.
Needs T1, T2, T4. Red: every DB problem code; create person with team by name; owned agent inherits
the owner's team in `search_users`; subscription add writes the prompt document parented to it;
inbox marks. ~+900, ~430 moved.

**T6 — orchestration accepts a subscription wake.** Goal §5 (additive half). Scope
`framework/domain-model/src/{work-intent,session-request}.ts`, `framework/event-bus/src/events.ts`
(kinds), `framework/api-contract/src/agent-orchestration-port.ts`,
`layers/agent-orchestration/{session-requests,run-orchestration}/src/`, intake enum. Needs T2. Red:
a baked `subscription` bundle assembles a prompt with the instruction and the change. ~+200.

**T7 — one mechanism: fire, clock, cut-over, 0089.** Goal §4, §2 0089, §0.12, §0.14. Scope
`layers/core-api/user/src/{subscription-fire,subscription-clock,subscription-wake}.ts`,
`ws-subscribe-authorizer.ts`, `document-actions.ts` (`resolveViewer`), `app.ts`,
`service-bootstrap.ts`, `boot.ts`, delete `layers/core-api/{routine,notifications}/`,
`routes/{routines,notifications}-routes.ts`, the three services, `agent-run-admission-reactions.ts`,
`compose.ts` (platform + systemParentExists), `layers/core-api/settings/src/{platform-actions,
plugin-manifest,plugin-installer,plugin-configuration}.ts`, `plugins/document-management/plugin.json`,
`framework/domain-model/src/{routine,notifications,configuration,agent-behavior-config}.ts`,
`actions/document.ts`, the six event types, `tool-definitions.ts` (two routine tools) +
`tool-handlers/src/ports.ts` + `tool-handlers-bindings.ts` + `core-api-port.ts` routine seams,
`tools/setup/src/`, `tools/eval/src/scenarios/`, `framework/db/{schema.ts,drizzle/0089_*}`,
`table-owners.json`, `actions-projected.ts`. Needs T3, T5, T6. Red (service integration, the fire):
`task.changed` in team A wakes the A agent, not the B agent; a factory agent hears both; the actor
is not woken by its own edit; a person gets one inbox row and one `user:<id>` frame; paused → nothing;
a due schedule wakes once and advances `next_run_at`; a plugin install creates the three
subscriptions. ~+450, −4,500.

**T8 — orchestration forgets routines.** Goal §5 deletions, §0.7. Scope
`layers/agent-orchestration/run-orchestration/src/{context,provisioner,runtime,transition-run,
session-store,runtime-reapers,start-runtime,contracts,errors,session-actions}.ts`,
`session-requests/src/{service,guards}.ts`, `framework/domain-model/src/{work-intent,
session-request,actions/session}.ts`, `framework/event-bus/src/events.ts`, `framework/api-contract/`,
both `create-server.ts` (`reapers.routines`), `actions-projected.ts`. Needs T7. Red: a crashed
subscription session ends with no routine finalize (event carries no `routineRunOutcome`). ~−600.

**T9 — UI: people, agents, profile, routines out.** Goal §8 rows Profile … AssistantOverlay +
routine pages. Scope those files, their hooks, stories, `__tests__`, `router.tsx`. Needs T5, T7. Red:
component tests per re-pointed screen (`call` mocked at the door); SubscriptionsSection story. Lint:
clause 1 clears for `search_users`/`open_user`/`edit_user`. ~+500/−2,000.

**T10 — UI: settings attributes, inbox, welcome screen.** Goal §8 remaining rows, §7. Scope
`layers/core-ui/src/settings/Settings{Filesystems,Harnesses,Connections,AgentBehavior,
Notifications}.tsx`, `shell/NotificationPopover.tsx`, `shell/notification-display.ts`,
`ds/NotificationRow.tsx`, `hooks/useNotifications.ts`, `hooks/useNotificationMute.ts`,
`pages/{SetupFlow,FirstRunRedirect}.tsx`, their tests/stories. Needs T5, T7. ~+400/−300.

**T11 — the old doors go; 0090.** Goal §9 routes/tools/seam, §0.1, §2 0090, §7 pre-auth. Scope the
eleven core route files, orchestration `routes/{connections,filesystems}.ts`,
`layers/agent-orchestration/{tool-handlers,src/services}/`, `framework/api-contract/src/`,
`layers/core-api/org/`, `layers/core-api/src/{app,boot}.ts`, both `create-server.ts`,
`task-actions.ts` (capacity), `framework/event-bus/src/events.ts` (three creation events),
`framework/db/{schema.ts,drizzle/0090_*}`, `actions-projected.ts`, the server tests hitting the routes.
Needs T8, T9, T10. Red: after 0090 every human in the seed has a team and no `team` edge remains.
~+60/−4,700.

**T12 — Playwright and fixtures.** Scope `layers/core-ui/__e2e__/` (37 specs, `fixtures.ts`,
`known-pre-existing-failures.ts`). Needs T11. Full e2e run, not the affected slice.

**T13 — docs.** §14. Needs T11.

**T14 — integrate.** §12. Needs T12, T13.

## 12. Verification

- **Unit**: the pure invariants (T1); the prompt section (T6).
- **Service integration** (`{db, app, eventBus}`): the user module (T5), the fire and clock (T7), the
  port (T4), the migrations against PGlite with the demo seed.
- **The seam test — the integrate block's evidence.**
  `applications/remote-server/src/__tests__/user-subscription-seam.integration.test.ts`, modelled on
  `session-platform-seam.integration.test.ts` (real `createServer`, real socket, real `ws` client):
  `search_users`/`open_user`/`edit_user` each driven as a person (`POST /api/actions/<name>`) and as
  an agent (the joined `ServerHandle.actionTools` handler), same answers; then a person and an agent
  subscribe to `task.changed`, a third user edits a task in reach — the person's `user:<id>` frame
  arrives and `open_user` shows the inbox row; an intent `subscription_run` exists for the agent; an
  out-of-reach agent got none; pausing stops both.
- **Real harness**: `layers/core-api/src/__tests__/subscription-wake-live-harness.integration.test.ts`
  modelled on `thread-turn-live-harness.integration.test.ts` — all four `requireHarness` lanes; a
  subscribed agent woken by a change reads the change and acts (edits a document named in its
  prompt). `npm run test:integration:harness -- <file>` locally; it has no CI job.
- **Packaged desktop, by hand** (fresh userData): welcome screen looks as before, finishes, lands on
  the assistant; the plugin's subscriptions appear on the librarian's profile; subscribe yourself to
  `task.changed`, move a task in another window — the badge lights without reload; subscribe an agent,
  move a task — a session starts; Settings: profile, org chart edge, agent add/edit/retire, folder
  add/give, connection add/remove, backends re-detect, behaviour override.
- Gates at T14: `npm run verify`, `npm run test:full`, `npm run test:integration:service`, full e2e.

## 13. Size budget (production lines)

T1 +420 · T2 +120 (1,030 moved, −273) · T3 +120/−90 · T4 +260 (300 moved) · T5 +900 (430 moved) ·
T6 +200 · T7 +450/−4,500 · T8 −600 · T9 +500/−2,000 · T10 +400/−300 · T11 +60/−4,700.
**≈ 3,430 new, ≈ 1,760 moved, ≈ 12,460 deleted — net ≈ −9,000.** New code passes 1,000; accepted on
net change (D-e3zm2j). If T5 passes ~1,200 new, stop and report which assumption made it so.

## 14. Docs made false (list; T13 edits)

`docs/guides/user/{getting-started,settings,agents,running-your-team,connections,the-interface,
three-core-views}.md` · `docs/process-layer/{teams,the-four-primitives,wip-and-cost-limits}.md` ·
`docs/requirements/{users-and-their-modes-of-engagement,functional-requirements,system-requirements}.md`
· `docs/architecture/{authorization-model,as-implemented-domain-architecture,system-overview,
connection-model,plugins}.md` · `docs/agent-layer/agent-model.md` · `docs/ui-design/settings-
consistency.md` · `docs/information-architecture/app-shell-always-present.md` ·
`docs/deployment/shared-backend.md` (first-run creation) · `plans/reviews/LAYER-BELOW.md` §8 note
(connections stay in orchestration). Anything else naming routines, notification queue, `/api/teams`
or `create_team`: `rg` in T13.

## 15. Proposed decisions

1. The three declarations are §1 exactly; `open_user({})` opens the caller. — One door for self and
   others; the welcome screen and settings need "me".
2. Reach = the owning module's `open` as the subscriber (thread, document) or the team rule (task,
   user); a user with neither team nor owner is factory-wide. — Never more than search; plugin agents
   keep working.
3. A user is never woken or notified by its own change. — The one loop cut; no other loop guard.
4. Wake = `subscription_run`/`subscription`, key `subscription:<subId>:<changeId|dueAt>`, baked
   bundle `kind:"subscription"` carrying the change and the prompt. — The routine flavour renamed;
   the executor stays blind.
5. The prompt is the `prompt` document parented to the subscription; no pointer column. — Slot
   uniqueness; migration 0077's precedent.
6. Run config, folders and connections stay in orchestration behind port methods. — The executor
   reads them at provisioning.
7. Every change row is emitted once, post commit, by the module that appended it (`objectEvent`),
   descendants of a kill flagged `cascade`. — No shared transaction-aware wrapper.
8. `user` change rows only for identity, team, run config, edges and subscriptions. — Inbox marks
   must not fan out.
9. Connections, inbox and behaviour are read and written on yourself only. — Today's per-caller
   scoping kept, nothing added.
10. The welcome screen calls the authed door; a rowless caller may create only the first person. —
    Replaces the pre-auth route with the same guard.
11. Three migrations, each with its readers' removal. — Every block ends check-green.
12. The team page loses its routines block; subscriptions are edited on the agent profile and in
    Notifications settings. — No team page of its own; smallest surface.
13. The team WIP limit goes with `capacity` (pending §0.1). — "Id and a name, nothing else."
14. Clause 1 stays red on the three user actions until T9 (D-9p94bz precedent).
