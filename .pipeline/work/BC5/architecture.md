# BC5 — architecture (revision 2, after critique 1)

Technical shape of `.pipeline/work/BC5/plan.md`. Census: `facts-user.md`, `facts-subscriptions.md`.
Decisions in force: D-42sbt2, D-e3zm2j, D-c7jgxy. Every claim is checked against
`feature/user-subscriptions` (base `84b4626fb`) with a `file:line`; anything unchecked says
`UNVERIFIED`. Tasks and decisions below are PROPOSED — the pipeline planner creates them.

## 0. What the census and the plan got wrong, and how it is settled

**Two founder calls are still open** (blocks assume the default shown; either answer changes one
block only):

- **F1 — agent-health notices** (`services/agent-health-session-end-reactions.ts`, 201 lines) are the
  only live writer of the inbox people see: a crashed session writes a queue row
  (facts-subscriptions §2.7). The queue goes. **Default in the blocks: kept**, rewritten as an
  `edit_user({ id: agent, health })` from the same `session_ended(crashed)` reaction — a `health`
  note on the agent (`users.health`, added by 0088) that lands as `user.changed`, so whoever
  subscribes to `user.changed` in reach (the owner, the team) sees it. The note text carries the
  crash count of the last 7 days, counted from the agent's own `user` change rows; every crash is a
  change (the old "silent below 3" threshold cannot be kept without a second store). If the founder
  says drop: T7b deletes the file and 0088 adds no column.
- **F2 — factory agents and the retro.** (a) System users (`bootstrap/factory-state.ts`) and
  factory-scope plugin agents — the librarian, owner of all three shipped subscriptions — have
  neither team nor owner, and tasks are never global (`tasks.team_id` NOT NULL, `schema.ts:171`).
  **Default:** such a user is factory-wide — it reaches every team. (b) `post-task-retro` fires only
  on `done` today (`plugin.json:39-40`, `transitionTo`); a subscription row has no filter
  (D-42sbt2). **Default:** it converts to `task.changed` with a first prompt line "if this change
  did not move the task to done, stop" — one harness session per task edit is the accepted cost.

**Settled** (D-c7jgxy and the planner's calls):

1. **Capacity goes.** `edit_task`'s `capacity_exceeded` reads `team.capacity`
   (`layers/core-api/task/src/task-actions.ts:559-567`; column DEFAULT 5, never written,
   `schema.ts:49`). The column, the invariant, its tests and the WorkTeam display go (T11);
   `docs/process-layer/wip-and-cost-limits.md` is rewritten (T13).
2. **Setup keeps its two agents.** Today `POST /users` scaffolds the person's owned assistant with a
   one-line persona (`routes/users.ts:145-173`, `org/src/resolve-scaffold-specs.ts:27-28,:72-81`) and
   `POST /teams` scaffolds `<Team> Agent`, `agentCategory:"team"`, with the picked harness
   (`resolve-scaffold-specs.ts:50-60`, `teams-routes.ts:273-301`), then stamps that harness on the
   assistant (`:348-385`). §7: three `edit_user` calls reproduce these rows. The welcome message,
   `team_created` and the founder→team org edge are not written — membership is `users.team_id`.
3. **Folder detail after the pick stays.** `POST /filesystems/inspect-path` (`SetupFlow.tsx:218,:325`)
   is a plumbing lookup: its row moves from `LEGACY_ROUTES` (`actions-projected.ts:153`) to
   `PLUMBING_ROUTES` in T11, where the rest of `agent-orchestration/src/routes/filesystems.ts` is
   deleted. `SetupFlow` keeps the call and builds the folder body exactly as today.
4. **The welcome screen needs harnesses before anyone exists.** `SetupFlow.tsx:165`; the API-key
   caller is then the rowless `"u-founder"` (`middleware/auth.ts:142-149`). `open_user` with no id
   opens the caller and answers `user: null` in that one moment (§7).
5. **The lint cannot see dotted names.** Clause 4 matches `/["'`]([a-z_]+)["'`]/g`
   (`actions-projected.ts:329`); widen to `[a-z_.]+` (T3).
6. **`agent_work_intent_recorded` dies with the scheduler.** Its one emitter is
   `routine-scheduler.ts:241`, its one subscriber `start-runtime.ts:325`; the mention door never
   emitted it (`agent-orchestration-port-composition.ts:336-340`). Type, subscriber and the
   `PLATFORM_EVENTS` row go (T8).
7. **The four tools are all of `tool-definitions.ts`** (`:57,:146,:225,:324`) and the only consumer of
   `CoreApiPort` (`tool-handlers-bindings.ts:88-151`). With them go `CoreApiPort`
   (`api-contract/src/core-api-port.ts`), orchestration's `core-api-port-composition.ts` and every
   `coreApiTransport` (§9). `CORE_API_ACTOR_OVERRIDE_HEADER` (`core-api-port.ts:257`, read at
   `middleware/auth.ts:146`, sent by 16 test files) moves to `api-contract/src/actor-override-header.ts`.
8. **Connections, folders and run config stay in orchestration** behind port methods, as `runConfig`
   already is (`api-contract/src/agent-orchestration-port.ts`): orchestration reads them at
   provisioning (`connections/src/service-connection-resolver.ts`,
   `filesystems/src/injected-filesystems-for-provisioning.ts`); moving them would make the executor
   read core. LAYER-BELOW §8 is corrected on this point.
9. **Three migrations**, each with the code it retires: 0088 adds (T2), 0089 cuts routines and
   notifications over (T7b), 0090 cuts teams, sessions and the intent vocabulary (T11). The journal
   ends at idx 87.
10. **No `document_id` column.** `doc_parent_slot_uq` allows one `prompt` per parent
    (`schema.ts:944-946`); migration 0077 chose parenting over pointers. A subscription's document is
    the `prompt` document parented `('subscription', <id>)`; subscription ids reuse routine ids.
11. **Org edges keep all three kinds** (`direct`, `function`, `team` — `domain-model/src/types.ts:136`,
    offered at `SettingsOrgChart.tsx:61,:92`). `org_edges.mechanism` has no CHECK
    (`schema.ts:837-853`). 0090 touches no edge.
12. **"Email goes" = delivery** (`nodemailer`, `install.ts:deliver`, SMTP config). `users.email` stays.
13. **An owned agent reads no team documents today** — `resolveViewer` (`document-actions.ts:115-127`)
    and the socket check (`ws-subscribe-authorizer.ts:168-177`) take `actor.teamId`. "An owned agent
    takes its owner's team" makes both use the owner's team: assistants see their owner's team
    documents (T7a).
14. **Route count.** 48 `LEGACY_ROUTES` rows belong to these families (listed in §10): 47 are
    deleted, `inspect-path` becomes plumbing. The goal's "45" was an earlier count; 47 is the number.
15. **Backends and behaviour are install-wide.** The harness list is this machine's; behaviour
    overrides are unique on `(kind, key)` for the whole install (`configuration_overrides`,
    facts-user §2.8) and `settings-agent-behavior.ts` scopes nothing to a caller. They sit behind the
    user door as the founder asked; one person's override changes it for everyone.

Known limits, stated not fixed: the fire runs in memory after commit, so a process death between a
change's commit and its emit loses that change's wakes and inbox rows — the mention door has the same
gap (`thread-actions.ts:1200-1238`). The subscription prompt and the change land in the agent's
context file and the session opens with "proceed" (`cli-harness-adapter.ts:521-528`,
`provisioner.ts:1401-1416,:1564`), as mentions and routines do today.

## 1. The three declarations — `framework/domain-model/src/actions/user.ts`

Shaped like `actions/document.ts`/`platform.ts`: zod `input`/`output` that `z.toJSONSchema` accepts,
a `sentence`, pure invariants returning `Problem[]`, a `USER_ACTIONS` map; exported from
`src/index.ts`; `layers/core-ui/src/services/call.ts:20` gains `& typeof USER_ACTIONS`.

**Vocabulary** (same file): `OBJECT_EVENTS` — the nine, `as const`. `USER_KINDS = ["human","ai"]`.
`USER_STATUSES` derived from the writers (seen: `active`, `idle`, `inactive`, `retired` —
`routes/agents.ts:430`, `users/src/runnable-agent.ts`, `platform-actions.ts:146`).
`AGENT_CATEGORIES` reused. `ASSISTANT_IDENTITY` — the persona text moved verbatim from
`resolve-scaffold-specs.ts:27-28` (the welcome screen passes it). `ChangeRowSchema` `{ id, object,
objectId, kind: created|changed|message, actor, before: record|null, after: record, at }`.

**`UserRowSchema`** `{ id, kind, name, role, status, email|null, avatarUrl|null, createdAt,
agentCategory|null, ownerUserId|null, health|null, team: {id,name}|null, edges: {id, mechanism,
target}[] }`. `team` is the effective team (own, else the owner's); `edges` are the user's outgoing
`org_edges`, so the org chart needs one call.

**`search_users`** `{ ids?, kind?, teamId?, name?, ownerUserId?, status?, limit? (≤500) }` `.strict()`
→ `UserRow[]`, name order. No filter lists everyone. `teamId` matches the effective team; `name` is a
case-insensitive contains. No invariants.

**`open_user`** `{ id? }` — absent = the caller. → `UserView`:

```
{ user: UserRow | null,               // null only for a caller with no row (first run, §7)
  runsOn: HarnessDescriptor[],        // install-wide: this machine's harnesses, disabled stamped
  runConfig: {harnessType, modelId, modelProvider, maxConcurrentSessions, modelOptions} | null,
  documentIds: { slot, id }[],        // agent-parented identity / skill / rule documents
  folders: FolderView[],              // agent: folders given to it; person: its team's folders
  subscriptions: { id, event|null, schedule|null, paused, documentId|null, nextRunAt|null }[],
  connections: { connections: ConnectionView[], inherited: InheritedReachView[] } | null, // self
  behaviour: BehaviourEntry[] | null, // self view; install-wide values (§0.15)
  inbox: { change: ChangeRow, seenAt|null, readAt|null }[] | null }  // self, newest 50
```

`HarnessDescriptor`, `ConnectionView` (no token), `FolderView` (`routes/filesystems.ts:88-100`),
`BehaviourEntry` (`AgentBehaviorConfigView`, `domain-model/src/agent-behavior-config.ts`) become zod
schemas here; the TS interfaces go. Problem: `not_found`.

**`edit_user`** — one partial; no `id` creates. Returns `UserView`.

```
{ id?, kind? (create), name?, role?, email?, avatarUrl?, status?, health?: string|null,
  team?: { name },                                   // found by name (oldest) or created
  ownerUserId? (create, agents), agentCategory? (create, agents; default: owned → "individual",
  else "team", as routes/agents.ts:268), identity?: string|null (create, agents),
  runConfig?: { harnessType?, modelId?, modelProvider?, modelOptions?, maxConcurrentSessions? },
  edges?: { add?: {mechanism, target}[], remove?: edgeId[] },
  folders?: { add?: {kind, resourceRef, writeback, connectionId}[],   // today's POST /filesystems body
              remove?: id[], give?: id[], take?: id[] },
  connections?: { add?: {service, authSource, token?, serverUrl?}[], remove?: id[] },
  subscriptions?: { add?: {event?, schedule?, prompt?: string|null, paused?}[],
                    change?: {id, event?, schedule?, prompt?: string|null, paused?}[], remove?: id[] },
  inbox?: { seen?: "all" | changeId[], read?: changeId[] },
  behaviour?: { id, fields: Record<string, string|boolean|null> }[],
  redetectHarnesses?: true }
```

`identity` is written after commit, internally, as the agent's `agent_file` document through the
existing helper (`routes/agent-identity.ts`, 155 lines — moved verbatim into `@hyperidle/user`, its
`ActionContext` import swapped for the package's mirror) — written when given, as the scaffold did
(`org/src/scaffold-agents.ts:191-195`). `status:"retired"` archives the agent's child documents after
commit through the same helper's `archiveChildren`, as `routes/agents.ts:432-437` does. `event` is
`z.enum(OBJECT_EVENTS)`: an unknown event is refused by the parse.

**Pure** (`editUserInvariants(input)`): `kind_required`, `name_required`; `belonging_required` (create
with neither `team` nor `ownerUserId`); `owned_agent_has_no_team`; `person_has_no_owner`;
`agent_fields_for_agents` (`identity`/`agentCategory`/`runConfig` on a person create);
`kind_is_create_only`, `owner_is_create_only`, `identity_is_create_only` (with `id`);
`event_or_schedule` (exactly one per added subscription).

**Need the database** (inside `run`): `not_found`; `unknown_actor` (a rowless caller may only create
the first person, §7); `unknown_owner`; `owned_agent_has_no_team` (team on an existing owned agent);
`own_profile_only` — name/email/avatar of a person change only by that person (kept from
`routes/users.ts:236-249`); `cannot_retire` — people and `role:"system"` agents are not retired
(kept from `routes/agents.ts:423-425`); `unknown_user` (edge target); `schedule_for_agents_only`;
`prompt_for_agents_only`; `agent_not_runnable`; `invalid_schedule` (`parseCron` throws);
`unknown_subscription`, `unknown_edge`, `unknown_folder`, `folder_other_team`, `unknown_connection`,
`connection_invalid`; `yourself_only` (connections and inbox — today's per-caller scoping,
`routes/connections.ts:10`; behaviour on your own view only, a door shape, not privacy §0.15); plus
`validate-agent-config.ts`'s harness/model codes verbatim.

**The runnable check** is `requireRunnableAgent` — kind `ai`, status `active|idle`
(`users/src/runnable-agent.ts`). It reads no run config (a harness is optional; the pool picks one at
admission — `org/src/scaffold-agents.ts:32-36`), so it runs inside the edit's transaction against the
row being written: an agent created with a run config and subscriptions in one call passes. Plugin
installs write agents active in the same phase-1 transaction before their subscriptions
(`platform-actions.ts:589-624`) and disable pauses both, so the check holds by construction there and
the install path does not repeat it.

## 2. Tables and migrations

**0088_user_subscriptions.sql (T2, additive).**

```sql
CREATE TABLE "subscriptions" (
  "id" text PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "event" text, "schedule" text,
  "paused" boolean NOT NULL DEFAULT false,
  "next_run_at" text,
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
ALTER TABLE "users" ADD COLUMN "health" text;          -- F1 default
```

Plus: the `agent_work_intents` kind / source-kind / pairing checks (`0085_thread_module.sql:119-125`)
and `documents.doc_parent_kind_ck` gain `subscription_run` / `subscription` / `subscription` beside
the routine members. `schema.ts` and `table-owners.json` gain `subscriptions`, `inbox` → `user`.
`next_run_at` keeps the routine behaviour: a laptop asleep at 03:00 runs the weekly job on wake.

**0089_routines_become_subscriptions.sql (T7b).** (1) `INSERT INTO subscriptions` from live routines
(`deleted_at IS NULL`, trigger `event`/`calendar`): same `id`; `user_id = owner_agent_id`; `event`
mapped (`task_state_changed`→`task.changed`, `thread_created`→`thread.created`,
`thread_message_appended`→`thread.message`, `thread_resolved`/`thread_reopened`→`thread.changed`;
any other `RAISE EXCEPTION`); `schedule = trigger_config::json->>'cron'`; `paused = (state <>
'active' OR NOT active)`; `next_run_at`; `created_at = COALESCE(created_at, last_run_at,
<migration instant>)`, `updated_at = created_at`. The demo seed's `demo-routine-daily_digest` converts
like any other (paused, since it is `active:false`). (2) Prompt documents of migrated routines get
`parent_kind = 'subscription'`; those of unmigrated routines are deleted. (3)
`plugin_contributions.kind`, `plugin_configuration_defaults.kind`, `configuration_overrides.kind`
`routine` → `subscription`, checks respelled (`schema.ts:1172,1227,1254`). (4) `DROP TABLE
routine_runs, routines, notification_queue`. (5) documents parent-kind check loses `routine`.

**0090_team_is_a_name.sql (T11).** (1) Every human with no team gets the target of its oldest
`mechanism='team'` edge, else the oldest team; edges are untouched. (2) `ALTER TABLE teams DROP`
`phase`, `brief_path`, `architecture_path`, `brand_path`, `principles_path`, `factory_db_path`,
`lead_agent_id`, `capacity`, `formed_at`. (3) `DELETE FROM agent_work_intents WHERE kind =
'routine_run'` (their stored request is routine-shaped and no code runs it); `sessions.source_kind`
and `agent_session_requests.source_kind/prompt_mode` `routine` → `subscription` (history rows; no
CHECK on either); `DROP INDEX sessions_routine_id_idx; DROP COLUMN sessions.routine_id`; intent checks
narrowed to the final set. `users.team_id` stays nullable: owned agents must keep it null
(`users_belonging_ck`, `schema.ts:90-93`) and system users exist before any team; "every user is in a
team" is `belonging_required` plus (1). All three: hand-written, journal entry
(`framework/db/drizzle/README.md`); check `framework/db/src/__tests__/pg-migration.integration.test.ts`.

## 3. Events — every change row is one

- `framework/event-bus/src/events.ts`: one member per name, as a distributive mapped union so
  `EventByType = Extract<DomainEvent, {type:T}>` (`events.ts:565`) resolves each —
  `type ObjectChangeEvent = { [T in ObjectEventName]: { type: T; streamId: string; change:
  ChangeRow; timestamp: number; cascade?: true } }[ObjectEventName]`, in `DomainEvent`; the nine
  spelled out in `EVENT_TYPES` (the lint parses the literal). `objectEvent(row, opts?)` builds one
  from a `changes` row.
- **The emit lives in each module, post commit, over the rows it appended** — the idiom thread and
  document use for the socket (`thread-actions.ts:1241`, `document-actions.ts:870`). Task collects the
  rows `appendChange` returns (`task-actions.ts:380,:711,:730`; the dep type widens from
  `Promise<unknown>` to the row) and emits where `:817-830` emit today; the kill loop's descendant rows
  carry `cascade: true` (the loop skips the root, `:355-366`). The user module does the same.
- `task_state_changed` → `task.created`/`task.changed`: lifecycle propagation
  (`policy/src/lifecycle-propagation.ts:407`) and the dependency watcher (`app.ts:620`) read
  `change.after.state` (present only when state moved) and keep the cascade skip.
- **Emits removed** in T3: `task-actions.ts:817-830`, `thread-actions.ts:1119,:1129,:1140,:1149`,
  `dependency-watcher.ts:82,:154`. **Types removed** with their last listener, the routine matcher, in
  T7b: `task_state_changed`, four `thread_*`, `notification`. `team_created`, `agent_added`,
  `user_created` go with their emitters in T11. `session_*` stay (D-e3zm2j).

## 4. The firing mechanism — `@hyperidle/user`

**Fire** (`subscription-fire.ts`), registered in `app.ts` beside the dependency watcher, on the nine.
Per event, after the emitter's commit (a `void` async handler — PGlite's one connection is free):

1. `listSubscriptions({ event, paused: false })`, minus the change's own actor (D-c7jgxy: never
   woken by its own change).
2. Reach per subscriber `u`, with `teamsOf(u)` = own team, else owner's, else every team (F2):
   - task: `search_tasks({ ids:[id] })` once → `teamId ∈ teamsOf(u)` or `ownerAgentId === u.id`;
   - thread: `search_threads({ ids:[id] })` **as `u`** returns the row (`canReadThread`);
   - document: `search_documents({ ids:[id] })` **as `u`** returns the row (`canReadDocument`);
   - user: the changed user's effective team `∈ teamsOf(u)`, or it is `u`, or `u` owns it.
   Search is read-only: `open_document` bumps the read count that ranks search
   (`document-actions.ts:441`), so no `open_*` is ever called here. Reach is computed, never stored.
3. Agent → `resolveSubscriptionWakeRequest` → `deps.agentWorkIntentRecorder` (the function a
   mention calls, `thread-actions.ts:1217`, bound `compose.ts:93`): `{ kind:"subscription_run",
   sourceKind:"subscription", sourceId:"<subId>:<changeId>", requestedBy: change.actor,
   idempotencyKey:"subscription:<subId>:<changeId>", bakedRequest }`. A bake failure drops that wake
   and is logged (`thread-actions.ts:1226-1236` idiom).
4. Person → `inbox (u.id, change.id)` `onConflictDoNothing`; if inserted, `wsPush("user:"+u.id,
   { type:"update", topic:"user:"+u.id, kind:"inbox", data:{ changeId } })`.

**Baked request** — the routine shape (`routine-service.ts:479-604`) renamed, reusing
`assembleSessionDocuments`, `bakeAgentRunnableConfig`, `getAgentIdentity` through deps:
`{ defaultAgentId, sourceKind:"subscription", sourceId, streamId:"subscription:<subId>", teamId?,
userId? (owner), taskId:null, sourceCorrelation:{ subscriptionId, changeId?, teamId? },
contextBundle:{ kind:"subscription", subscription:{ id, event, schedule }, prompt: string|null,
change: ChangeRow|null, agent, team|null, documents }, agentConfig, harnessDisabled? }`. `prompt` is
the subscription's `prompt` document body.

**Clock** (`subscription-clock.ts`): `cron.ts` moved verbatim; `setInterval` (default 30 s,
`AppOptions.subscriptionClockMs` replaces `routinePollIntervalMs`), a running guard; each due row
(`schedule`, not paused, `next_run_at <= now`) wakes with `change: null`, `sourceId
"<subId>:<next_run_at>"`, then `next_run_at = nextCronMatch(now)`. Started and stopped in `app.ts`
with the fire (both need the composed runners, which `registerAgentLayerServices` never had —
`service-bootstrap.ts:393-419`).

**Inbox clean-up**: the retention sweep that ran the deleted `reap` (`service-bootstrap.ts:328-333`,
every 6 h) calls the user module's `reapInbox(db, cutoff)` instead: read rows whose change is older
than `TERMINAL_LOG_TTL_MS` = 30 days (`service-bootstrap.ts:77`) are deleted — the queue's own rule.

**Socket**: `ws-subscribe-authorizer.ts` gains `user:<id>` → `topic.slice(5) === senderId` (beside
`:192-195`). "Run it now" is `send_message` to the agent — no code.

## 5. Orchestration — the routine flavour becomes the subscription flavour

T6 adds, T8 deletes; together a rename.

- `routine_run` → `subscription_run` in `AGENT_WORK_INTENT_KINDS` (`event-bus/src/events.ts:26`,
  `domain-model/src/work-intent.ts:632`), `AgentWorkIntentRecorderInput` (`work-intent.ts:585`),
  `AgentWorkIntentSourceKind`, intake `WORK_INTENT_KINDS` (`agent-orchestration-intake.ts:50`),
  `AgentOrchestrationWorkIntentKind`, `session-requests/src/guards.ts:17`, `errors.ts:18`.
  `AGENT_SESSION_SOURCE_KINDS`/`PROMPT_MODES` (`session-request.ts:9-31`) `routine` → `subscription`;
  `subscriptionSessionRequestInputSchema` with the §4 correlation.
- `BakedContextBundle` `kind:"routine"` (`work-intent.ts:508-525`) → `kind:"subscription"`;
  `RoutineTriggerEvent` (`:343-470`) and `lastRunSummary` deleted — the change row replaces them.
- `run-orchestration/src/context.ts:101-626`: subscription versions of the routine context and prompt
  — `## Subscription`, `### Instruction` (prompt), `### What happened` (the change; values over 2,000
  chars cut with "open the object for the rest").
- `provisioner.ts`: `params.routineId` (`:881,:1230,:1271,:1285,:1331,:1508`) goes; the flavour is
  `contextBundle.kind === "subscription"`. `runtime.ts:522` goes.
- Deleted in T8: `routineRunOutcome` (`SessionEndedEvent`; `transition-run.ts:238-240,:319`,
  `session-store.ts:211`, `runtime-reapers.ts:210`); `context.routineId` (`transition-run.ts:171`);
  `reapStaleRoutineSessions` + `reapers.routines` (`runtime-reapers.ts:131-238`,
  `start-runtime.ts:417-418`, `contracts.ts:309-312`, both apps) — it healed routine-run coalescing,
  which no longer exists; `SessionRow.routineId` + `search_sessions.routineId`
  (`actions/session.ts:60,:79`, `session-actions.ts:87,:107`, `session-store.ts:44,:61`);
  `AgentOrchestrationSessionWireRow.routineId`; `agent_work_intent_recorded` + `start-runtime.ts:313-326`.
- `agent-run-admission-reactions.ts:213-224` `routine_run` case → `subscription_run`: log the
  refused wake; nothing to finalize.

## 6. Where the module lives, and what it reaches

`layers/core-api/user` (`@hyperidle/user`) owns `users`, `teams`, `org_edges`, `login_sessions`,
`invite_codes`, `subscriptions`, `inbox`. Moved verbatim: `layers/core-api/users/src/*`,
`org/src/team-lookup.ts`, `org/src/org-edges.ts`, `routine/src/cron.ts`, `routes/agent-identity.ts`,
`routes/validate-agent-config.ts` (descriptors through deps). `org/src/org-routing.ts` (zero
production callers) is deleted. `agent-behavior-config-impl.ts` moves into `@hyperidle/settings`.

`user-actions.ts` returns `Action[]` with a local structural mirror (`platform-actions.ts:98-120`);
`compose.ts` builds it fifth, after platform. Deps bag:

```
{ changes: { appendChange, listByIds },        // listByIds: open_user's inbox (listChanges gains ids)
  runConfig, folders, connections — from AgentOrchestrationPort,
  agentWorkIntentRecorder,
  harnesses?: { describe(), redetect() },       // adapterPool + onHarnessRedetect, app.ts:131,:168
  readServerConfig,                             // harnessDisabled stamp, as routes/harnesses.ts
  behaviour: { list(db), patch(db, id, fields, actor) },   // @hyperidle/settings
  searchDocuments, editDocument,                // prompts, identity, documentIds
  searchTasks, searchThreads,                   // reach (§4)
  requireRunnableAgent, getAgentIdentity, assembleSessionDocuments, wsPush? }
```

- **Port additions (T4)** on `AgentOrchestrationPort`, each an intake PLUMBING route plus its client
  in `core-api/src/services/agent-orchestration-port-composition.ts`: `folders { list({teamId} |
  {agentUserId}), add(teamId, body), remove(id), give(id, agentUserId) (= today's persistInjection),
  take(id, agentUserId) }`; `connections { list(userId) → {connections, inherited}, add(userId, input)
  (validates, encrypts), remove(userId, id) }`. Bodies are extracted from
  `agent-orchestration/src/routes/{connections,filesystems}.ts`, which call the same functions until
  T11. `filesystems.getTeamId` and its row die with their only caller (`core-api/src/routes/
  filesystems.ts`) in T11; `give` checks the team with `folders.list({teamId})`.
- `edit_user` order: validate → one transaction (users, teams, edges, subscriptions, one `user`
  change row, runnable check) → commit → port calls (run config, folders, connections), identity and
  prompt documents through `editDocument` with `internal: true` set inside the module, retire
  archive, behaviour writes, redetect → emit. No port or document call sits inside the transaction.
- **Change rows** (`object:'user'`): one per edit changing identity fields, `health`, team, run
  config, edges or subscriptions. Inbox marks, folders, connections, behaviour, redetect append none.
- `DOCUMENT_PARENT_KINDS` (`actions/document.ts:36`) and `edit_document`'s system-only parent set:
  `routine` → `subscription`; `compose.ts:189-192` `systemParentExists` asks the user module.
- Platform: `PlatformActionsDeps.routines` (`platform-actions.ts:154-163`) → `subscriptions { insert,
  setLive (paused = !live), remove, get }`; manifest `routines[]` → `subscriptions[] { id, agentId,
  event? | schedule?, prompt? }` (`plugin-manifest.ts:121-156`); `routineItemId` →
  `subscriptionItemId` with the hash input kept byte-for-byte (`plugin-installer.ts:322-328`, a
  `@lore` says why the literal stays) so installed ids do not churn; label = event or schedule.

## 7. The welcome screen

`SetupFlow.tsx` keeps its markup and calls the authed door with the key every client sends
(`services/api-fetch.ts`). Mount → `open_user({})` for `runsOn`. Folder pick → `POST
/filesystems/inspect-path` as today (plumbing). Start:

1. `edit_user({ kind:"human", name, team:{ name: <folder basename | "My Team"> }, folders:{ add:[<the
   body SetupFlow builds today, SetupFlow.tsx:343-360>] }? })`
2. `edit_user({ kind:"ai", name:"<name>'s Assistant", role:"assistant", agentCategory:"individual",
   ownerUserId: <person>, identity: ASSISTANT_IDENTITY, runConfig: <picked harness> })`
3. `edit_user({ kind:"ai", name:"<Team> Agent", role:"agent", agentCategory:"team", team:{ name },
   runConfig: <picked harness> })`

then navigate to `/work?onboarding=true` as today (`SetupFlow.tsx:240`). Ids are generated; nothing
reads the `ast-` prefix any more (`service-bootstrap.ts:285`).

**First-run rule** in `edit_user`: a caller with no `users` row may create a person only while no
person exists (else `unknown_actor`); that change row's actor is the new person (`changes.actor` is a
FK, `schema.ts:582-584`). This is the pre-auth route's guard (`routes/users.ts:107-126`) behind the auth
middleware instead of in front — strictly tighter. `createUserSetupRoute` and its mount
(`app.ts:320-329`) go. `FirstRunRedirect.tsx` → `search_users({ kind:"human" })` non-empty with a team
→ `/work`, else `/setup`. `GET /auth/me` stays plumbing; `useCurrentUser` is untouched.

## 8. UI re-pointing

| Screen / hook | Now | Becomes |
|---|---|---|
| `SettingsProfile.tsx:67` | `PATCH /users/:id` | `edit_user({ id: me, name, email })` |
| `SettingsOrgChart.tsx:111,:129,:153` | `/org` ×3 | `search_users()` (rows carry `team`, `edges`); `edit_user({ id: from, edges })` — all three kinds as today |
| `SettingsAgents.tsx`, `AgentEditor.tsx`, `AgentAddDialog.tsx:97`, `work/AgentDetailPane.tsx:83` | `/agents` CRUD, `/harnesses`, `/org`, `/filesystems`, injections | `search_users({ kind:"ai" })`; `open_user({ id })`; `edit_user` create (`identity` = the prompt it collects; `team` defaults to the caller's team when the form leaves it empty — today it is optional, `agents.ts:57`) / patch / `status:"retired"` / `folders.give|take` |
| `SettingsFilesystems.tsx:77,:94` | `/org`, `/filesystems?teamId` | `open_user({})`.folders |
| `SettingsHarnesses.tsx:177,:196` | `/harnesses`, redetect | `open_user({})`.runsOn; `edit_user({ id: me, redetectHarnesses: true })` |
| `SettingsConnections.tsx:106,:370,:392` | `/connections` | `open_user({})`.connections; `edit_user({ id: me, connections })` |
| `SettingsAgentBehavior.tsx:78,:133` | `/settings/agent-behavior` | `open_user({})`.behaviour; `edit_user({ id: me, behaviour })` |
| `SettingsNotifications.tsx` + `useNotificationMute.ts` | global mute | one toggle per event over my event subscriptions (off = paused); hook deleted |
| `NotificationPopover.tsx` + `useNotifications.ts` | `/notifications` ×3 | `open_user({})`.inbox; `edit_user({ id: me, inbox })`; `getWsClient().subscribe("user:"+me)` refetch; renders the change row, links to the object |
| `WorkTeam.tsx`, `useTeam.ts`, `useTeams.ts`, `useTeamAgents.ts`, `WorkOverview.tsx` | `/teams`, `/agents` | `search_users({ teamId })` + `search_tasks({ teamId })`; teams = distinct `team` of `search_users()`; routines block (~446-520) and capacity display deleted |
| `AgentProfile.tsx`, `useAgentProfile.ts:39` | `/agents/:id/profile` | `open_user({ id })` + new `SubscriptionsSection.tsx` (+ story): list, add (event select or cron text, prompt text), pause, remove; raw cron shown |
| `RecipientPicker.tsx`, `useRecipients.ts:114` | `/recipients` | `search_users({ status:"active", name })` |
| `AssistantOverlay.tsx` | `/agents` | `search_users({ kind:"ai", ownerUserId: me })` |
| `FirstRunRedirect.tsx`, `SetupFlow.tsx` | §7 | §7 |
| `WorkRoutine.tsx`, `work/RoutineDetailPane.tsx`, `work/RoutineCreateDialog.tsx`, `useRoutine.ts`, `router.tsx:83` | routines | deleted with stories and tests |

## 9. Deletions and their real consumers (each lands in the block named)

- **T2** `layers/core-api/users` → `user` rename: vitest PROJECTS (`vitest.config.ts:29`),
  `tools/repo-gates/src/typecheck-gate.ts:527-533` leaf list (`users` → `user`), manifests
  (`layers/core-api/package.json:31`, `task/package.json:23`, `tools/eval/package.json:26`), the 20+20
  importers (facts-user §1.1), `tools/eval/src/provision-harness.ts`.
- **T5** `document-read-test-ports.ts:19`'s `agent-identity` import follows the move.
- **T7b** packages `routine`, `notifications`: vitest rows (`:26,:32`), typecheck-gate rows,
  `layers/core-api/package.json:26,29`, `nodemailer` + `@types/nodemailer`, knip ignore
  `notifications-test-deps.ts` (`knip.json:28`), `tools/repo-gates/src/__tests__/dep-manifest-verdict
  .test.ts`, `framework/db/src/__tests__/governance-crossings.test.ts`; routes `routines-routes.ts`,
  `notifications-routes.ts`; services `routine-scheduler-bindings.ts` (and `fireRoutine`,
  `layers/core-api/src/index.ts:67`), `routine-run-session-end-reactions.ts`;
  `agent-health-session-end-reactions.ts` rewritten (F1); `service-bootstrap.ts` registrations
  (`:215-235`, `:393-419`) and `reap` (`:16,:332`); tools `create_routine`/`update_routine` and their
  `CoreApiPort.routine` seams; `domain-model/src/{routine,notifications}.ts`; `document-read-test-
  ports.ts:19` routine import; eval `scenarios/routine-sessions.ts` converted to a schedule
  subscription (`scenarios/index.ts`), `scenarios/delegation.ts:35-36`, `judges.ts:15,:383-395`; seed
  `tools/setup/src/demo-fixture.ts:330-347` inserts the subscription (same row 0089 would make),
  `demo-world/activity.ts:195-281` drops the three queue rows and the run row — the demo inbox starts
  empty; `plugins/document-management/plugin.json` → `subscriptions` (F2b).
- **T11** routes `users` (297), `agents` (447), `agent-profile` (222), `org` (259), `teams-routes`
  (683), `recipients` (70), core `filesystems` (107), `harnesses` (97), `settings-agent-behavior`
  (78); orchestration `routes/connections.ts` (520) and `routes/filesystems.ts` except `POST
  /inspect-path`; tools `create_team`/`add_agent`, `tool-handlers/src/ports.ts`,
  `tool-handlers-bindings.ts`, knip's `tool-handlers/src/__tests__/stub-ports.ts` row (`knip.json:31`),
  `core-api-port-composition.ts`, `CoreApiPort`, every `coreApiTransport` (`remote-server/src/
  create-server.ts:287-292,:391,:449`, `desktop/src/create-server.ts:195-200,:275,:321`,
  `run-orchestration-composition.ts:66,:305`, `tools/eval/src/provision-harness.ts:69,:128,:141,:303`),
  `tools/trace/trace-lib.ts:699-701` (`SEAM_FILES` loses the orchestration row),
  `tools/repo-gates/src/lib/dep-manifest-verdict.ts:80-84` (reason text); package `org` (scaffold,
  `resolve-scaffold-specs`, `ports`) with its vitest (`:28`), typecheck-gate and manifest rows
  (`package.json:27`, `task/package.json:22`, `tools/eval/package.json:24`); the dropped team
  columns' writers and types: `user/src/team-lookup.ts:93-103` (`createTeam`),
  `tools/setup/src/demo-fixture.ts:192,:271`, `demo-world/cast.ts:139`,
  `framework/domain-model/src/team.ts:38-102` (shrinks to what the re-pointed UI still imports);
  `buildToolRegistry`/`toRegistered` stay if still imported (builder checks; else `tool-handlers`
  goes too). 51 server tests, 38 UI tests and 37 Playwright specs hit these URLs: a test of deleted
  behaviour is deleted; a test that only seeds through a route re-seeds through `edit_user` or a row.

## 10. Governance (`actions-projected.ts`)

A stale row is itself an error (`:396-406`), so each row leaves with its subject.

- **T7b — 12 `LEGACY_ROUTES` rows:** `notifications-routes.ts` `GET /inbox`, `POST /seen`,
  `POST /:id/read`, `GET /mute`, `PUT /mute/:key`; `routines-routes.ts` `GET /event-types`, `POST /`,
  `GET /`, `DELETE /:id`, `GET /:id`, `PATCH /:id`, `POST /:id/trigger`.
- **T11 — 35 rows deleted, 1 reclassified:** `agents.ts` ×5 (`GET /:id/profile`, `GET /`, `POST /`,
  `PATCH /:id`, `DELETE /:id`); core `filesystems.ts` `POST /:id/injections`; `harnesses.ts` ×2;
  `org.ts` ×7 (`GET /`, `PUT /edges`, `DELETE /edges/:id`, `GET /teams/:teamId`, `GET
  /teams/:teamId/membership`, `POST /teams`, `POST /scaffold-request`); `recipients.ts` `GET /`;
  `settings-agent-behavior.ts` ×2; `teams-routes.ts` ×4; `users.ts` ×4; orchestration
  `connections.ts` ×4; orchestration `filesystems.ts` ×5 (`POST /`, `GET /`, `GET /:id`, `DELETE
  /:id`, `DELETE /:id/injections/:agentUserId`); `filesystems.ts|POST /inspect-path` → `PLUMBING_ROUTES`.
  **47 deleted in all.**
- `PLUMBING_ROUTES`: T4 adds the folder/connection intake rows; T11 removes
  `GET /filesystems/:id/team` and adds `inspect-path`; the "nineteen registrations" prose follows.
- `LEGACY_TOOLS`: T7b `create_routine`, `update_routine`; T11 `add_agent`, `create_team`.
- `LEGACY_EVENTS`: T7b six; T11 three (leaves `session_*`). `PLATFORM_EVENTS`: T8 −1. Regex: T3.
- Header prose → six modules, eighteen names (T1). Clause 1 is red on the three user actions from
  T1 until T9 (D-9p94bz precedent): no decoy call, no rule edit.

## 11. Builder blocks

Every block ends with `npm run check` green and `npm run lint` red only on clause-1 rows still waiting
for the UI (listed in its report). Tests of behaviour a later block deletes may stay red until then;
each block names them. One pathspec commit each; ids never in code. Blocks that share a file are
ordered by `needs`; blocks without an order between them have disjoint scopes.

**T1 — declarations.** §1. Scope `framework/domain-model/src/actions/user.ts`,
`framework/domain-model/src/index.ts`, `framework/domain-model/src/__tests__/`,
`layers/core-ui/src/services/call.ts`, `tools/governance/src/rules/actions-projected.ts` (prose).
Needs —. Red: each pure code once. ~+450.

**T2 — the package and 0088.** §6 moves (users, team-lookup, org-edges, cron; org-routing deleted),
§2 0088. Scope `layers/core-api/user/`, `layers/core-api/users/`,
`layers/core-api/org/src/{team-lookup,org-edges,org-routing}.ts` (+ test), `routine/src/cron.ts`,
importers of `@hyperidle/users` and those org files, `framework/db/{src/schema.ts,drizzle/0088_*,
drizzle/meta/_journal.json}`, `tools/governance/{table-owners,architecture}.json`,
`vitest.config.ts`, `tools/repo-gates/src/typecheck-gate.ts`, manifests,
`tools/eval/src/provision-harness.ts`. Needs T1. Red: each `subscriptions` check refuses a bad row.
~+120, ~1,030 moved, −273.

**T3 — nine events.** §3. Scope `framework/event-bus/src/events.ts`,
`layers/core-api/{task,thread,document}/src/*-actions.ts`, `task/src/dependency-watcher.ts`,
`policy/src/lifecycle-propagation.ts`, `layers/core-api/src/app.ts`, `actions-projected.ts` (regex).
Needs T2. Red: a state move emits exactly one `task.changed` with the row; a kill flags descendants;
propagation still completes a parent. Red until T7b: routine-scheduler event tests. ~+130/−90.

**T4 — folders and connections behind the port.** §6. Scope
`framework/api-contract/src/agent-orchestration-port.ts`, `agent-orchestration-intake.ts`,
`agent-orchestration/src/routes/{connections,filesystems}.ts` (extract only),
`core-api/src/services/agent-orchestration-port-composition.ts`, `actions-projected.ts` (plumbing).
Needs T3 (shares `actions-projected.ts`). Red: through the composed app, add → list → give → take →
remove a folder and a connection. ~+260, ~300 moved.

**T5 — the user module.** §1 runs, §6. Scope `layers/core-api/user/src/{user-actions,agent-identity,
validate-agent-config}.ts` + tests, `layers/core-api/src/routes/{agent-identity,validate-agent-config,
agent-behavior-config-impl}.ts` (moved out; importers repointed),
`layers/core-api/settings/src/`, `layers/core-api/changes/src/` (`listChanges` ids),
`layers/core-api/src/actions/compose.ts`, `layers/core-api/src/app.ts` (deps),
`layers/core-api/src/__testing__/document-read-test-ports.ts`. Needs T4 (and T3 for `app.ts`). Red:
every DB code; the two kept guards; person + team by name; owned agent's effective team; agent
created with run config + identity + subscriptions in one call; retire archives the identity;
subscription prompt parented to it; inbox marks. ~+900, ~580 moved.

**T6 — orchestration accepts a subscription wake.** §5 additive half. Scope
`framework/domain-model/src/{work-intent,session-request}.ts`, `framework/event-bus/src/events.ts`
(kinds), `framework/api-contract/src/agent-orchestration-port.ts` (kind),
`layers/agent-orchestration/{session-requests,run-orchestration}/src/`, intake enum. Needs T4 (shares
port file and intake; T3 via T4 for `events.ts`). Disjoint from T5. Red: a `subscription` bundle
assembles a prompt with the instruction and the change. ~+200.

**T7a — fire and clock (additive).** §4, §0.13. Scope `layers/core-api/user/src/{subscription-fire,
subscription-clock,subscription-wake}.ts` + tests, `ws-subscribe-authorizer.ts`,
`document/src/document-actions.ts` (`resolveViewer`), `layers/core-api/src/app.ts` (register fire and
clock). Needs T5, T6. Red (service integration): `task.changed` in team A wakes the A agent, not the B
agent; a factory agent hears both; no self-wake; a person gets one inbox row and one `user:<id>`
frame; a subscriber's document reach does not change the document's `readCount`; paused → nothing; a
due schedule wakes once and advances `next_run_at`. ~+450.

**T7b — cut-over and 0089.** §2 0089, §9 T7b list, F1 rewrite, §10 T7b rows. Scope everything in the
§9 T7b bullet plus `layers/core-api/src/{service-bootstrap,boot,index}.ts`,
`agent-run-admission-reactions.ts`, `compose.ts` (platform deps, `systemParentExists`),
`layers/core-api/settings/src/{platform-actions,plugin-manifest,plugin-installer,plugin-configuration}
.ts`, `framework/domain-model/src/{configuration,agent-behavior-config}.ts`, `actions/document.ts`,
`framework/event-bus/src/events.ts` (six types), `tool-definitions.ts` (two tools),
`tool-handlers/src/ports.ts`, `tool-handlers-bindings.ts`, `core-api-port.ts` (routine seams),
`framework/db/{schema.ts,drizzle/0089_*}`, `table-owners.json`, `actions-projected.ts`. Needs T7a.
Red: a plugin install creates the three subscriptions with stable ids; a crashed session writes the
agent's `health` and a `user.changed`; 0089 converts a seeded routine. ~+120/−4,300.

**T8 — orchestration forgets routines.** §5 deletions, §0.6. Scope
`layers/agent-orchestration/run-orchestration/src/{context,provisioner,runtime,transition-run,
session-store,runtime-reapers,start-runtime,contracts,errors,session-actions}.ts`,
`session-requests/src/{service,guards}.ts`, `framework/domain-model/src/{work-intent,session-request,
actions/session}.ts`, `framework/event-bus/src/events.ts`, `framework/api-contract/` (session wire
row), both `create-server.ts` (`reapers.routines`), `actions-projected.ts`. Needs T7b. Red: a crashed
subscription session's `session_ended` carries no routine outcome. ~−600.

**T9 — UI: people, agents, profile; routine pages out.** §8 rows Profile … AssistantOverlay + routine
rows. Scope those files, hooks, stories, `__tests__`, `router.tsx`. Needs T7b. Disjoint from T8 and
T10. Red: component tests per screen (`call` mocked at the door); `SubscriptionsSection` story. Clause
1 clears. ~+500/−2,000.

**T10 — UI: settings attributes, inbox, welcome screen.** §8 remaining rows, §7. Scope
`layers/core-ui/src/settings/Settings{Filesystems,Harnesses,Connections,AgentBehavior,
Notifications}.tsx`, `shell/{NotificationPopover.tsx,notification-display.ts}`, `ds/NotificationRow.tsx`,
`hooks/{useNotifications,useNotificationMute}.ts`, `pages/{SetupFlow,FirstRunRedirect}.tsx`, their
tests and stories. Needs T7b. Red: SetupFlow makes the three calls and still calls `inspect-path`.
~+400/−300.

**T11 — the old doors go; 0090.** §9 T11 list, §0.1, §2 0090, §7 pre-auth, §10 T11 rows. Scope the
§9 T11 bullet plus `layers/core-api/src/{app,boot}.ts`, `task-actions.ts` (capacity),
`framework/event-bus/src/events.ts` (three creation events), `framework/api-contract/src/`
(`actor-override-header.ts`), `framework/db/{schema.ts,drizzle/0090_*}`, `actions-projected.ts`, the
server tests hitting the routes. Needs T8, T9, T10. Red: after 0090 every seeded human has a team, org
edges are unchanged, no `routine_run` intent remains. ~+60/−4,700.

**T12 — Playwright and fixtures.** `layers/core-ui/__e2e__/` (37 specs, `fixtures.ts`,
`known-pre-existing-failures.ts`). Needs T11. Full e2e run, not the affected slice.

**T13 — docs.** §14. Needs T11. **T14 — integrate.** §12. Needs T12, T13.

## 12. Verification

- **Unit**: pure invariants (T1); the prompt section (T6).
- **Service integration** (`{db, app, eventBus}`): user module (T5), fire and clock (T7a), port (T4),
  cut-over and 0089 (T7b), 0090 against the demo seed (T11).
- **The seam test — T14's evidence.**
  `applications/remote-server/src/__tests__/user-subscription-seam.integration.test.ts`, modelled on
  `session-platform-seam.integration.test.ts` (real `createServer`, socket, `ws` client): the three
  entries driven as a person (`POST /api/actions/<name>`) and as an agent (the joined
  `ServerHandle.actionTools`), same answers; then a person and an agent subscribe to `task.changed`, a
  third user edits a task in reach — the person's `user:<id>` frame arrives and `open_user` shows the
  inbox row; a `subscription_run` intent exists for the agent; an out-of-reach agent got none; pausing
  stops both.
- **Real harness**: `layers/core-api/src/__tests__/subscription-wake-live-harness.integration.test.ts`,
  modelled on `thread-turn-live-harness.integration.test.ts`, all four `requireHarness` lanes: a
  subscribed agent woken by a change reads it and edits the document its prompt names. Local only.
- **Packaged desktop, by hand** (fresh userData): the welcome screen looks and behaves as today —
  branch shown after the pick, lands on the assistant, the team agent exists with the picked harness;
  the librarian's three subscriptions show on its profile; subscribe yourself to `task.changed`, move a
  task elsewhere — the badge lights without reload; subscribe an agent — a session starts; Settings:
  profile, org chart edge of each kind, agent add/edit/retire, folder give, connection add/remove,
  re-detect, behaviour override.
- T14 gates: `npm run verify`, `npm run test:full`, `npm run test:integration:service`, full e2e.

## 13. Size budget (production lines)

T1 +450 · T2 +120 (1,030 moved, −273) · T3 +130/−90 · T4 +260 (300 moved) · T5 +900 (580 moved) ·
T6 +200 · T7a +450 · T7b +120/−4,300 · T8 −600 · T9 +500/−2,000 · T10 +400/−300 · T11 +60/−4,700.
**≈ 3,590 new, ≈ 1,910 moved, ≈ 12,260 deleted — net ≈ −8,700.** Accepted on net change
(D-e3zm2j). If T5 passes ~1,200 new, stop and report which assumption made it so.

## 14. Docs made false (T13)

`docs/guides/user/{getting-started,settings,agents,running-your-team,connections,the-interface,
three-core-views}.md` · `docs/process-layer/{teams,the-four-primitives,wip-and-cost-limits}.md` ·
`docs/requirements/{users-and-their-modes-of-engagement,functional-requirements,system-requirements}.md`
· `docs/architecture/{authorization-model,as-implemented-domain-architecture,system-overview,
connection-model,plugins}.md` · `docs/agent-layer/agent-model.md` ·
`docs/ui-design/settings-consistency.md` · `docs/information-architecture/app-shell-always-present.md`
· `docs/deployment/shared-backend.md` · `plans/reviews/LAYER-BELOW.md` §8 note. Anything else naming
routines, the notification queue, `/api/teams` or `create_team`: `rg` in T13.

## 15. Proposed decisions

1. The three declarations are §1 exactly, including create-only `identity` and `agentCategory`;
   `open_user({})` opens the caller. — Every current caller can be served.
2. Reach reads through `search_*({ ids })` as the subscriber (thread, document) or the team rule
   (task, user); never `open_*`. — Same rule as search, no read-count writes.
3. Wake = `subscription_run`/`subscription`, key `subscription:<subId>:<changeId|dueAt>`, bundle
   `kind:"subscription"` with the change and the prompt. — The routine flavour renamed; the executor
   stays blind.
4. The prompt is the `prompt` document parented to the subscription; no pointer column.
5. Every change row is emitted once, post commit, by the module that appended it; one event member per
   name. — Types resolve per name; no transaction-aware wrapper.
6. `user` change rows for identity fields, health, team, run config, edges, subscriptions only.
7. Kept guards: own profile only; people and system agents are not retired. Connections and inbox
   are your own; backends and behaviour are install-wide behind the user door.
8. The runnable check reads the row inside the transaction; plugin installs satisfy it by
   construction.
9. Inbox rows read and older than 30 days are deleted by the existing 6-hour retention sweep.
10. Plugin subscription ids keep the routine hash input.
11. The team page loses its routines block; subscriptions are edited on the agent profile and in
    Notifications settings.
12. Clause 1 stays red on the three user actions until T9 (D-9p94bz precedent).
