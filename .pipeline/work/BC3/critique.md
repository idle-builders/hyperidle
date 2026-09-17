# BC3 architecture — independent critique

**FAIL** — 10 blockers. The document is unusually well-researched (line refs are overwhelmingly
accurate, the e2e/governance/migration-number work is right), but it opens a read-authorization hole,
two of the plan's own outcomes cannot be proven as designed, and three "every consumer" lists are not
exhaustive.

---

## Blockers

### B1 — the two reads carry no membership invariant, and the boundary that enforced one is deleted

Claim: after BC3 any authenticated principal — and every agent session, since `actionsAsTools`
registers every action for every actor with no `roles` filter — can read any DM or assistant thread.

Evidence: §3.4's server-invariant table scopes `not_a_member` to "**both** send and adjust"
(`architecture.md:378`); §3.8 gives `open_thread` no authorization clause and gives
`search_threads` one only on the `mine` arm (`architecture.md:494-507`); §6 reasons about writes only
(`architecture.md:1025-1031`). Today `GET /threads/:id` calls `authorizeRead`
(`layers/core-api/src/routes/threads.ts:857`), and `canRead` is participant-scope for `user` and
`agent` hosts — every DM and every assistant thread
(`layers/core-api/src/auth/access-boundary.ts:32-39,58-66`); `GET /threads` refuses a foreign
`participant_id` (`threads.ts:758`). §5 B13 deletes `access-boundary.ts` and `authorize.ts`
(`architecture.md:988-995`) with nothing replacing the read half. `search_threads({host:{kind:"user",
id:<victim>}})` and `search_threads({ids})` also enumerate. The websocket keeps its participant gate
(`layers/core-api/src/ws-subscribe-authorizer.ts:95-100`), so reads through the action are looser than
reads through the socket carrying the same thread.

Fix: state a read invariant for `open_thread` and every non-`mine` `search_threads` arm — at minimum
participant-scope for `user`/`agent` hosts, which is what exists today — before deleting the boundary.

### B2 — waking two agents from one message silently drops all but one

Claim: §3.10 records one `thread_turn` intent per woken agent, all sharing `sourceId = message.id`,
distinguished only by `idempotencyKey` (`architecture.md:567-580`). The drain supersedes on
`(kind, sourceId)` alone, ignoring `idempotencyKey`:

```ts
// layers/agent-orchestration/session-requests/src/service.ts:534-538
eq(agentWorkIntents.kind, intent.kind),
eq(agentWorkIntents.sourceId, intent.sourceId),
sql`${agentWorkIntents.id} != ${intent.id}`,
inArray(agentWorkIntents.status, ["pending", "claimed"]),
```

and `processIntentsInternal` marks the older one `superseded` and `continue`s
(`service.ts:724-728`). `assistant-turn-coherence-trigger.ts:30` says so outright: "identity is
`(kind, sourceId)` only". So "a message wakes **every** agent mentioned" (`plan.md:57-60`) resolves to
exactly one agent. §9's own assertion "two mentioned agents record two intents with distinct
idempotency keys" (`architecture.md:1141`) would pass while the behaviour is broken — it counts rows,
not dispatches.

The arch reasoned about the unique index (`framework/db/src/schema.ts:421-426`) and missed the
supersede predicate.

Fix: make the wake's `sourceId` per (message, agent), or state the change to the supersede predicate.
Either way the §9 assertion must be "two sessions start", not "two rows exist".

### B3 — `items` has a second production writer and a second `item_created` emitter, neither listed

Claim: §5 B7 says `item_created` is "emitted at `routes/conversations.ts:158`"
(`architecture.md:903`) and lists every `items` reader/writer (`architecture.md:900`). Both lists miss
`layers/core-api/knowledge/src/review-item-factory.ts`, which inserts a thread with a synthetic
initiator (`:80-88`), writes an `items` row (`:105-114`) and emits `item_created` (`:116-125`). It is
live: `layers/core-api/src/services/agent-run-admission-reactions.ts:48-67`
(`flagStalledKnowledgeAction`, the `knowledge_action` arm of `reactToAdmissionFailure` at `:98-100`).
Also missed: its two barrel exports (`layers/core-api/knowledge/src/index.ts:89-90`),
`attentionReviewReasoningMarker`'s reader `like(items.reasoning, …)`
(`layers/core-api/task/src/task-service.ts:487-488`), and
`agent-run-admission-reactions.ts:33`'s `import { insertThread } from "@hyperidle/conversation"`,
absent from B2's importer table (`architecture.md:781`).

Impact: dropping `items` breaks compilation in a package §2 lists as untouched, and silently deletes
"flag a stalled knowledge action for review" — a behaviour `plan.md:71-75` never asked to remove (it
names the policy engine's auto-approve as the one effect that goes).

Fix: add the file to B7 with a named successor, or state its deletion as a decision.

### B4 — B5's "every site that names the intent kind" misses three typed unions

`architecture.md:861-879` claims exhaustiveness and lists six sites. Missing value-level sites, all
compile-breaking on `kind: "thread_turn"`:

- `framework/domain-model/src/work-intent.ts:588` — `AgentWorkIntentRecorderInput`'s discriminant.
- `framework/domain-model/src/work-intent.ts:664` — `AGENT_WORK_INTENT_KINDS`.
- `layers/agent-orchestration/session-requests/src/service.ts:1077` — `WorkIntentInput`'s union.

(`framework/event-bus/src/events.ts:26-32` also carries its own `AGENT_WORK_INTENT_KINDS` list, which
the arch cites only as `:27`.)

Fix: complete the table; it is the contract a builder works from.

### B5 — no contract for how `edit_task` reaches `adjust_thread`

§3.9 has `edit_task` call `adjust_thread.run(ctx, …)` in-process (`architecture.md:514-516`) and then
says "Those are the only two edits to `framework/domain-model/src/actions/task.ts`"
(`architecture.md:535`). Nothing states the corresponding edit to `TaskActionsDeps` /
`createTaskActions` (`layers/core-api/task/src/task-actions.ts`,
`layers/core-api/src/actions/compose.ts:16-38`). That matters because the crossing is governed:
"a service never names a sibling, it receives one through a port"
(`tools/governance/src/lib/governance-model.ts:176-177`), which is why BC2 injected `edit_task` into
`LifecyclePropagationDeps` rather than importing it. The arch locks the reverse direction only
("`thread` may not import `@hyperidle/task`", `architecture.md:343`).

It also inverts BC2's stated module-link rule — "in-process, **after the caller's own commit**"
(BC2 `architecture.md:408`) — by creating the thread *before* `edit_task`'s transaction. The reason
given (NOT NULL) is sound and the orphan residue is costed; the missing piece is the dep contract and
the `buildCoreActions` ordering it forces.

Fix: name the new `TaskActionsDeps` entry, its binding in `compose.ts`, and the build order.

### B6 — the gate's own end-to-end proof cannot pass the return gate as specced

§9's single gate proof is: mention → intent → session → `edit_task` carrying `threadId` → task row
(`architecture.md:1210-1217`). A thread turn has a calling thread and no task, so after B11's edit
(`architecture.md:967`, `provisioner.ts:1566`) that session's `requiredReturnActions` is
`["send_message"]`:

```ts
// layers/agent-orchestration/run-orchestration/src/provisioner.ts:1566
params.callingThreadId != null && params.taskId == null ? ["reply"] : undefined;
```

and `isRequiredReturnAction` admits only the required member
(`framework/harness-protocol/src/harness/return-actions.ts:134-137`). `edit_task` is separately
non-terminal for that session by R1's `!taskId` early return (`return-actions.ts:106`) — correct, and
verified. So the proven chain ends in a session the gate verdicts `not_returned`, and `plan.md:60-63`'s
"answer back, **or** create a task" has no gate-satisfiable second branch.

Fix: decide and state what a thread turn's required return set is once creating a task is a legitimate
outcome, and make §9's chain include whatever closes the session.

### B7 — two structural `ast-` recognitions survive, both contradicting "the assistant is an ordinary owned agent"

B5's table claims to cover "every site that names … the `ast-` convention" and lists one UI site,
`AgentEditor.tsx:177` (`architecture.md:878`). Missing:

- `layers/core-ui/src/shell/AssistantOverlay.tsx:355` —
  `!lastMessage.senderId.startsWith("ast-")` decides "the last message is human". The overlay is kept
  as a screen (§5 B6) and this line is inside it. Once the assistant is an ordinary owned agent whose
  id need not carry the prefix (`layers/core-api/org/src/resolve-scaffold-specs.ts:79` is an
  `idHint`; `scaffold-agents.ts:15` allows it only "when free"), the check misreads agent replies as
  human.
- `layers/core-ui/src/settings/SettingsAgents.tsx:449` — `agent.id.startsWith("ast-")` suppresses the
  delete affordance, i.e. an "ordinary agent" you cannot delete.

Fix: list both and say what each becomes (`users.ownerUserId`, per §5 B5's own reasoning).

### B8 — `framework/domain-model/src/thread.ts` is never mentioned, and it already owns these names

`framework/domain-model/src/thread.ts` (426 lines) exports `HOST_KINDS` (**including `"task"`**),
`MESSAGE_TYPES`, `Thread`, `Message`, `PlainPayload`, `ReviewPayload`, `VerdictPayload`,
`AssistantNotice`, `headCollapsePredicate` (`thread.ts:25-28,94,284`), and all of them are re-exported
from the package barrel (`framework/domain-model/src/index.ts:203-246`). §3.1 declares `HOST_KINDS`,
`MESSAGE_TYPES`, `ThreadSchema` and `MessageSchema` in `actions/thread.ts`
(`architecture.md:118-145`). The file appears in neither §2's "not touched" list, §5's deletion list,
nor §8's step list.

Impact: duplicate barrel exports (a hard TS error), or two live host-kind vocabularies — one with
`task` and one without — which is exactly the compat shape `CLAUDE.md` rule 2 forbids. Its consumers
are real (`layers/core-ui/src/ds/thread-display.ts`, `ds/status-mapping.ts`,
`pages/review/review-artifact.ts`, `framework/domain-model/src/mention.ts`).

Fix: say what happens to it — folded into `actions/thread.ts`, or kept with its overlaps removed.

### B9 — `users.findSoleHumanUser` becomes dead across five files and is not on the list

B4's dead-seam list (`architecture.md:818-830`) is derived from an `rg` whose pattern does not include
the name. `reply` (`layers/agent-orchestration/tool-handlers/src/tool-definitions.ts:134`) is its only
production caller. After deletion these have no reader:
`framework/api-contract/src/core-api-port.ts:123`,
`layers/agent-orchestration/src/services/core-api-port-composition.ts:421-424`,
`layers/agent-orchestration/src/services/tool-handlers-bindings.ts:141`,
`layers/agent-orchestration/tool-handlers/src/ports.ts:204`,
`tool-handlers/src/__tests__/stub-ports.ts:22`, plus its backing filter comment at
`layers/core-api/src/routes/users.ts:178`.

Fix: add it to B4. (The six `conversation`-block methods, the three `work.*item*` methods and
`org.resolveReviewRecipientsForItem` in that list I re-verified by `rg` — those are correct.)

### B10 — a task's thread gets two different hosts depending on whether it was migrated or created

§4 step 4 backfills task threads as `host_kind='team'`, `host_id = t.team_id`, and step 7 re-hosts
surviving task-hosted threads the same way, with a `RAISE EXCEPTION` guard
(`architecture.md:669-712`). §3.9 creates a new task's thread via
`adjust_thread.run(ctx, { members: [...] })` with no `host` (`architecture.md:514-516`), and §3.7's
default is `{kind:"user", id: ctx.actor}` (`architecture.md:480`). So the same object has host `team`
in a migrated database and host `user` in a fresh one — which changes `search_threads({host})`,
`hostTitle`, and the computed-title ladder's host rung (`threads.ts:361-378`, moved per §3.8).

"The task↔thread creation ordering" is listed as locked (`architecture.md:11`); this part of it
contradicts the migration in the same document.

Fix: pick one host for a task's thread and make §3.9, §4 step 4 and §4 step 7 agree.

---

## Non-blocking defects

- **N1 — `humansForAgent`'s ladder contradicts the flow that uses it.** §3.3 documents "Team humans
  first, all humans as the fallback — the ladder the founder ruled on at `tool-definitions.ts:441-453`"
  (`architecture.md:307-308`), but that is `submit_review`'s `resolveReviewRecipientsForItem` ladder,
  and B4 deletes both the seam method and `GET /org/review-recipients`. §3.6 step 2d wants the
  *singular* "sole human" (`architecture.md:432-433`), matching `plan.md:58` and `reply`'s actual
  `findSoleHumanUser` (`tool-definitions.ts:134`). A returned list has no rule for which member the
  direct thread is with. (The underlying `resolveReviewRecipients` does survive in
  `layers/core-api/org/src/org-routing.ts:26`, so the logic exists — only the intent is unclear.)
- **N2 — §4 step 4's participants SQL does not do what the comment says.** `UNION SELECT … ORDER BY 1
  LIMIT 1` binds to the whole union, so the derived table yields **one** row, not owner+human; the
  derived table also correlates to the outer `t` from inside a `FROM` item without `LATERAL`; and
  `initiator_id`'s last `COALESCE` arm is `t."id"` — a task id written into an identity column with no
  FK to catch it (`architecture.md:672-684`). The arch delegates this expression to the builder
  (`:729-732`) but never states the intended membership in prose, so there is nothing to re-derive
  against.
- **N3 — §3.12 is written as decided while the amendment says it is not.** "Proposed plan amendments"
  says "I have not resolved it in the document above" (`architecture.md:1270-1271`), but §3.12 states
  the nudge as fact (`architecture.md:613-630`), §6.5's security paragraph reasons only about the
  change-row envelope (`architecture.md:1036-1042`), and B9's two new hooks are specified for it
  (`architecture.md:921-924`). The costing of both options is otherwise fair and the blast radius
  claim ("§3.12 and the two new UI hooks") is about right.
- **N4 — `TaskViewSchema.threadId` is also nullable** (`framework/domain-model/src/actions/task.ts:150`)
  and is the field R5/B9 read (`task-actions.ts:253`). §3.9 names only `TaskSchema.threadId`
  (`architecture.md:534`).
- **N5 — `adjust_thread.run(ctx, { members: [ctx.actor, ownerAgentId] })`** (`architecture.md:515`)
  passes `null` when a task is created with no owner (`tasks.owner_agent_id` is nullable,
  `framework/db/src/schema.ts:174`), which `members: z.array(z.string().min(1)).min(1)` rejects.
- **N6 — `framework/db/src/__tests__/schema.integration.test.ts:41`** asserts `"items"` is in the live
  table list; it is not in §9's deleted/re-pointed lists.
- **N7 — §9's caller-dependent assertions have no stated door.** `caller` is filled only by the MCP
  loop (`architecture.md:285-287`), so "an agent calling `send_message` with `caller.threadId` set"
  (`architecture.md:1142`) cannot go through the `{db, app, eventBus}` HTTP fixture. Name the direct
  `action.run` path.
- **N8 — small additions the plan's four filters do not name:** `search_threads.ids`,
  `includeResolved`, `ThreadListRow.lastMessagePreview` (`architecture.md:161-173`). Each is
  defensible; none is stated as an addition.
- **N9 — line-ref drift (all trivial):** `tool-seam.ts:48-69` → the interface is `:50-68`;
  `eslint.config.ts:481` → `:483`; `schema.ts:585` is `changes_kind_ck`, the object check is `:584`;
  `task-service.ts`'s item sites drift 1–2 lines.

## What is right, and was checked

- Migration `0084` is the next free number and the journal entry shape matches
  (`framework/db/drizzle/meta/_journal.json`); step 8 reproduces `0078`'s three constraints exactly
  (`0078_BA2_review_return_half.sql:32-38`); the `table-owners.json` totals edit 34→33 is required by
  `validateTableOwners` (`tools/governance/src/lib/governance-registry.ts:165-169`) and `items` is
  indeed owned by `task` today.
- **R1 verified true** — `isReturnAction` returns false on `!taskId` first
  (`return-actions.ts:106`); the fall-through is unreachable and must not be "fixed".
- **R6 verified true** — `role === "founder"` at `routes/threads.ts:1333-1339`, with the `@lore`
  saying it is not in `USER_ROLES`.
- **R8 verified true** — `toClaudeToolSpec` reads `json.properties`/`json.required`
  (`layers/agent-orchestration/tool-handlers/src/tool-types.ts:57-72`); a top-level union would ship an
  empty schema. The flat-object resolution is right.
- B10's eleven `LEGACY_ROUTES` line numbers are exact, the four `LEGACY_TOOLS` and one `LEGACY_EVENTS`
  rows are right, and the rule's shrink clauses behave as described
  (`tools/governance/src/rules/actions-projected.ts:433-467`).
- §9's e2e work is real: 43 specs match the thread-route grep, all sixteen named specs exist, and
  `__e2e__/fixtures.ts`, both named stories and `migration-0078-brownfield.integration.test.ts` exist.
- B13's finding is correct — `authorizeRead`/`authorizeWrite` have exactly one production caller
  (`routes/threads.ts:65,857,1295`), and `no-header-identity-in-authz`'s sink set
  (`tools/eslint-plugin-authz/src/rules/no-header-identity-in-authz.ts:19`) does empty out. Deleting
  the rule with the functions is right; what is missing is B1's replacement invariant, not the guard.
