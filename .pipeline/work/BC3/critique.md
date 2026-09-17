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

---

# Round 2 — re-test against `f8c3a20ce` (architecture, 1,704 lines) and `2dff3bc64` (plan)

**PASS WITH BLOCKERS** — one blocker, new, and it is a consequence of the round-1 fixes rather than a
survivor of them. All ten of B1–B10 are genuinely fixed: I re-tested each against the code, not against
the response table, and every code claim the response makes checks out. No non-blocking fix broke a
locked contract.

## Remaining blocker

### B11 — membership has no join path, and four live paths now dead-end on `not_a_member`

Round 1's B1 fix made the read/write split explicit (§3.4, §6.3–6.4, `plan.md` Confusion 6) and B10's
fix made every task thread `team`-hosted. Together they produce a shape the document does not name:
**`team`-, `knowledge_item`- and `factory`-hosted threads are readable by any signed-in principal and
writable only by their members, and nothing anywhere adds a member to one.** `adjust_thread` refuses a
non-member too (`architecture.md:429` — `not_a_member` is "for **both** send and adjust"), so a
non-member cannot add themselves. The only join is an `@mention` by someone already inside
(§3.6 step 5). `rg` over the revised document for handoff/join/"adds the owner" returns two hits, both
about task *creation* (`architecture.md:652, 1496`).

Today all four of these work, because `canWrite` delegates to `canRead`, which returns `true` for
host-scoped kinds (`layers/core-api/src/auth/access-boundary.ts:35-37, 60-62, 76-77`):

- **A handoff.** `edit_task` changing `ownerAgentId` on an existing task touches no thread — §3.9's
  member seeding is creation-only (`architecture.md:626-628, 652-654`). B3 makes the new owner's
  session talk in `task.threadId` (`architecture.md:994-1005`), whose members are the original creator
  and the original owner. The handed-off agent's `send_message` — including the review it files, since
  `submit_review` is gone — returns `not_a_member`.
- **A review's verdict.** B4 deletes `submit_review`'s "task-thread resolve-or-create **seeded with
  review recipients**" with "**gone.** The task already has a thread and the review goes in it"
  (`architecture.md:1022`). That thread contains the creator and the owner. A human reviewer who is
  neither can read the review (`team` host ⇒ `canReadThread` true) and cannot verdict it — the verdict
  is a `send_message`, so `not_a_member` fires before §3.4's verdict trio ever runs. That breaks the
  review→resume chain `plan.md:81-82` explicitly keeps.
- **The knowledge page.** `KnowledgeDetail.tsx:699` and `HostThreadSection.tsx:181,187` (§5 B9)
  become `search_threads({host})` + `call("send_message")`. Any authenticated user may post into a
  `knowledge_item` thread today; after this item only its members may, and B9's stated replacement for
  `resolveOrCreateHostThread` — "`search_threads`+`adjust_thread`" (`architecture.md:1222`) — cannot
  help, because `adjust_thread` on an existing thread refuses the same non-member.
- **B7b's own successor.** The new stalled-knowledge-action review posts as `system:propagation` into
  the knowledge item's thread, resolved with `search_threads({host})` and created only when absent
  (`architecture.md:1159-1177`). The *point* of that change is to stop making a new thread on every
  failure — so the normal case is a thread `system:propagation` did not create and is not in.
  `not_a_member`, silently, on the second failure onward.

§4 step 4 makes the same shape visible in the migration and calls it honest: "Zero members is legal and
produces `'[]'` — nothing can post in it until someone is added" (`architecture.md:859-861`). There is
no "someone adds you" in the document.

Fix (the planner's call, three shapes exist): let `adjust_thread`'s `members` add **yourself** to a
thread you can read; or make posting follow `canReadThread` rather than membership on host-scoped
kinds, keeping members-only for `user`/`agent`; or seed the memberships the deleted code seeded
(handoff adds the new owner, a review adds `soleHumanForAgent`/`resolveReviewRecipients`,
`system:propagation` joins the thread it posts into). Whichever it is, §3.4, §3.9, §5 B4, §5 B7b, §5 B9
and §6.3 all have to say the same thing, and §9 needs a "a handed-off agent can post in its task's
thread" assertion — that case is absent today.

## B1–B10 — re-tested, all confirmed fixed

- **B1.** `canReadThread` (`architecture.md:453-473`) is `HOST_SCOPE` moved verbatim — I checked it
  against `access-boundary.ts:32-39,58-66`, including `factory`, which the response is right to keep.
  Applied on `open_thread` and on **every** `search_threads` arm (`:477-482, 600-613`), `not_found`
  rather than `forbidden` so it is not an existence oracle, and §9 asserts the `ids` and
  `host:{kind:"user"}` arms and the MCP door (`:1486-1492`). The websocket-as-reference argument
  (`:483-486`) holds: `ws-subscribe-authorizer.ts:95-100` is unchanged and the action is no looser.
- **B2.** `sourceId = ${message.id}:${agentId}` (`architecture.md:725`). Verified the three downstream
  claims myself: the session request is built from `baked.sourceId`
  (`session-requests/src/service.ts:641`), its dedupe is `(sourceKind, sourceId, idempotencyKey)` with
  `idempotencyKey = intent.idempotencyKey` (`service.ts:113-124, 145-153, 648`) — per-agent either way,
  so no new collision; and `listPendingIntentsByKind` really is the only reader of the old assumption
  (`service.ts:1293`, one production caller at `assistant-turn-coherence-trigger.ts:65`). §9's
  assertion is now "drain the queue and assert two session requests exist" with the row-count trap
  named (`:1469-1473`) — that is the right proof.
- **B3.** New §5 B7b (`architecture.md:1142-1201`). `system:propagation` is a real seeded row
  (`layers/core-api/src/bootstrap/factory-state.ts:40-47`); the `knowledge:<itemId>` source id and the
  `knowledge_item` host are both as described; the `clientKey`-for-LIKE-probe swap is sound; B7's tables
  now carry the second writer and the second emitter, `agent-run-admission-reactions.ts:33`'s import and
  the four dead `RoutineDeps` ports. Verified the last one — nothing in `layers/core-api/routine/src`
  calls them.
- **B4.** Seven sites, and the three I named are all there with correct refs
  (`architecture.md:1081-1088`); the two deliberately-different `AGENT_WORK_INTENT_KINDS` lists
  (`event-bus/src/events.ts:26-32` five members, `domain-model/src/work-intent.ts:663-671` six) are
  distinguished correctly rather than collapsed.
- **B5.** `TaskActionsDeps.adjustThread` as a function value, the governance rule quoted, and the
  build order fixed with a reason (`architecture.md:656-685`). Thread-first is right: `ThreadActionsDeps`
  names no task, so the dependency is one-way and no lazy wiring is needed.
- **B6.** §9's chain is eight steps, ends with the agent's `send_message`, and asserts the session
  verdicts `returned` (`architecture.md:1563-1593`). The plan gained "and say so … A turn ends with the
  agent's message" (`plan.md:62-63`). The reasoning for not widening the return set is correct and
  R1 is preserved.
- **B7.** `AssistantOverlay.tsx:355` → identity comparison against the overlay's own counterpart;
  `SettingsAgents.tsx:449` → `ownerUserId !== null` (`architecture.md:1104-1105`). Both are the right
  shape — the behaviour kept, the recognition replaced.
- **B8.** §3.1's new preamble (`architecture.md:121-151`) edits `framework/domain-model/src/thread.ts`
  rather than shadowing it, keeps `BlockHostKind`'s `"task"` (correct — `thread.ts:21` is a block anchor
  host, not a thread host), and re-exports the moved row types under the same names. The
  `participants` → `members` rename names its three real consumers; I verified `ds/ThreadShell.tsx:277`
  and `components/RecipientPicker.tsx:91`, and that the column keeps its name so
  `ws-subscribe-authorizer`'s raw JSON read is untouched.
- **B9.** `users.findSoleHumanUser` and its five sites are on B4's list with
  `deps.users.soleHumanForAgent` named as the successor (`architecture.md:1035-1042`).
- **B10.** One host, `team`, in `edit_task`'s call (`architecture.md:626`), §3.7's explicit
  "a task's thread never takes that default" (`:581-583`), §4 steps 4 and 7, and a migration-test
  assertion (`:1509-1510`). Direct threads keep `user`. Consistent everywhere I looked.

Non-blockers N1, N2, N4–N8 are fixed, and correctly: N1's `soleHumanForAgent` is singular and
team-scoped and matches `plan.md:58` (`architecture.md:350-359`); N2's `WITH seed` form fixes both the
`LIMIT`-binds-to-the-union trap and the missing `LATERAL`, and names them (`:862-880, 929-938`); N3 is
answered honestly — §3.12 now opens by saying it describes the nudge reading only and that the choice
is open (`:785-789`), which is the right shape while the amendment stands. N9's `tool-seam.ts:48-69`
rebuttal is fair (declaration vs body); the `eslint.config.ts` ref is corrected to `:483`.

## New non-blocking defects

- **N10 — the `listPendingIntentsByKind` deletion (§3.10) misses two sites.** Its `PLUMBING_ROUTES`
  entry `layers/agent-orchestration/src/routes/agent-orchestration-intake.ts|GET /requests/pending-intents`
  (`tools/governance/src/rules/actions-projected.ts:83`) is left behind — inert, because clause 2 has no
  reverse check for plumbing entries the way it has one for `LEGACY_ROUTES`
  (`actions-projected.ts:433-442`), which is why this is not a blocker. Also
  `layers/core-api/src/services/__tests__/agent-orchestration-port-writes.integration.test.ts:122-135`
  tests the deleted port method and is not in §9's deleted/re-pointed lists (compile-caught).
- **N11 — small path drift in the B8 rename list.** `ThreadHostBanner.tsx` is
  `layers/core-ui/src/ds/ThreadHostBanner.tsx:85`, not `components/` (`architecture.md:150`); the claim
  about it (a local prop of a different type, not touched) is correct.
- **N12 — `framework/event-bus/src/events.ts:394` carries `hostKind: HostKind`** on a thread event
  payload and is not named alongside §3.1's `HOST_KINDS` edit. Harmless — nothing assigns `"task"` once
  task hosting is gone — but it is the one remaining `HostKind` consumer outside the deleted files.
