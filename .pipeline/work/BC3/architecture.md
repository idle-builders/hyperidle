# BC3 — architecture

Technical reading of `plan.md` § How it works and § How we work on this. Decides nothing the plan does
not; names the contracts a builder needs. Tier: suite. **Every citation is against this branch's base
`50cb93785`** (`feature/thread-module`, cut from `origin/main` with BC2 merged). BC2's own
architecture (`git show 270489dbb:.pipeline/work/BC2/architecture.md`) is the template; this document
copies its shape and only says what is different.

Locked here: the four declarations and their exact input/output shapes, `ThreadActionsDeps`, the one
widening of `ActionContext`, the invariant split including the read/post predicate and the join that
replace the deleted access boundary, the three `changes` row shapes, the wake rule and its intent
identity, the task↔thread
creation ordering and the host a task's thread carries, the migration's step order, the full consumer
list of every deleted symbol, the return-set edit. Left to the builder: file layout inside the thread
module, helper names, query shapes, the exact wording of every `Problem.message`. **Not locked — the one
open amendment:** whether the websocket carries a nudge or a payload (§3.12).

**What BC2 already built and BC3 only extends.** `framework/domain-model/src/actions/action.ts`
(`ActionDeclaration`, `Problem`, `ActionResult`), `layers/core-api/changes` (`appendChange`,
`listChanges`), `layers/core-api/src/actions/{action,compose,actions-router,actions-as-tools}.ts`,
`layers/core-ui/src/services/call.ts`, `tools/governance/src/rules/actions-projected.ts`. None of
these gain a mechanism in this item. `compose.ts` gains one `createThreadActions(...)` call,
`call.ts`'s `Actions` type gains `& typeof THREAD_ACTIONS`, and the rule's three shrink lists lose
their thread rows. That is the whole of the loop work.

---

## Reconciliation

Nine places where the plan and the code at `50cb93785` do not line up. Each is resolved here inside
the plan's scope; none needs a new outcome. Anything that would have needed one is under
§ Proposed plan amendments (there is one).

| # | Plan says | Code at `50cb93785` | Resolution |
|---|---|---|---|
| R1 | "the gate compares two undefineds" (Confusion 2) | `isReturnAction` already returns false first on `!taskId` (`framework/harness-protocol/src/harness/return-actions.ts:106`). The `undefined === undefined` fall-through is unreachable. | **No fix is needed in the predicate.** The obligation becomes: do not weaken that guard, and add the regression case (`edit_task` with no `id` and no session task ⇒ not terminal) to `return-actions.closure.test.ts`. The forcing half of Confusion 2 is real and stands: `provisioner.ts:568` and `:1566` must name `send_message`. |
| R2 | delete `register-policy.ts` | it registers `registerPolicyEngine` **and** `registerLifecyclePropagation` (`layers/core-api/policy/src/register-policy.ts:19-20`); lifecycle propagation survives BC3 | delete the file; export `registerLifecyclePropagation` from `policy/src/index.ts` and call it directly at `service-bootstrap.ts:374`. The wrapper existed only to collapse two registrations into one; with one left it is noise. |
| R3 | delete "policy bindings" | `layers/core-api/src/services/policy-bindings.ts` also wires `computeApprovalRate`, whose live caller is `routes/agent-profile.ts:127` (the agent profile's track record) | the file survives, holding only `approvalRateDeps` + `computeApprovalRate`. Its `work.listItemIdsBySourceAgent` and `conversation.listVerdictMessagesByItemIds` entries die with `items`. |
| R4 | "+ `approval-rate.ts` if it becomes unused" | it does **not** become unused — `agent-profile.ts:127` | `approval-rate.ts` stays. Its Path 1 (`legacyItemId` → `items.sourceAgentId`, `:26,50-55`) is deleted with the column; Path 2 (`threads.initiatorId`) becomes the only attribution, and the `noLegacyItem: true` filter goes with the column. `ApprovalRateDeps` loses its `work` half entirely. |
| R5 | `search_threads` filters "mine / by task / by host / text" | the task→thread link lives on `tasks.thread_id`, which the thread module may not read (module-link rule) | "by task" is served by the **caller**: `open_task(id).threadId` → `open_thread(threadId)`. `search_threads` takes `mine`/`host`/`text`/`ids`. No capability is lost and no cross-module read is introduced. |
| R6 | verdict authz: "a human who is not the review author" | today the check is the literal string `role === "founder"` (`routes/threads.ts:1333-1339`), and `"founder"` is not in `USER_ROLES` | the invariant becomes `users.kind === "human"`. That is a real widening the plan states; it is the reason the literal disappears rather than moving. |
| R7 | `ActionContext` — BC2 locked "carries no session id and gains none" | `send_message` must (a) reach the session's calling thread for the reply fallback, (b) write `review_sessions` keyed by session id, (c) check `producedItemId` against the calling task. None is derivable from a core table. | `ActionContext` gains **one** optional field, `caller`, filled only by the MCP loop from `ToolContext` (`framework/harness-protocol/src/harness/tool-seam.ts:48-69`), never from a body. §3.2. BC2's lock was scoped to what `edit_task` step 5 needed; this is the narrowest widening that makes the plan's own rules expressible. |
| R8 | `send_message` input as one shape | `toClaudeToolSpec` reads `json.properties`/`json.required` off `z.toJSONSchema` (`layers/agent-orchestration/tool-handlers/src/tool-types.ts:59-72`). A top-level `z.discriminatedUnion` emits `anyOf` with **no** top-level `properties`, so the Anthropic direct-API tool spec would ship an empty schema. | `SendMessageInput` is a **flat `z.object`**, not a discriminated union. The four payload shapes survive as four optional nested fields; "exactly one" is a pure invariant, not a schema rule. §3.1. |
| R9 | `plainPayloadSchema` accepts `notice`, stripped by `sanitizeNoticeForSender` for non-`ast-*` senders | **nothing in production writes `notice`.** `rg AssistantNotice` finds only `framework/domain-model/src/thread.ts`, the two schema declarations, `AssistantOverlay.tsx`'s renderer and one e2e fixture. | `notice` is not on `send_message`'s input; `sanitizeNoticeForSender` (`routes/threads.ts:629-634`) is deleted with the route. It stays on the **read** shape so historical rows still render. The overlay's renderer is left alone — deleting a dead renderer is not this item's work. |

---

## 1. What the plan requires, and what each obligation costs

`plan.md` has no numbered AC list; its § How it works paragraphs are the obligations and the § Gates
line is the proof. One row per paragraph.

| Plan § | Obligation | Where it lands |
|---|---|---|
| One list (`:20-24`) | four declarations, one place, nothing else about thread public | §3.1, `framework/domain-model/src/actions/thread.ts`; §3.3 `createThreadActions` |
| Send is the write that posts (`:26-37`) | thread-id **or** recipients; overwrite by message id; create-only `clientKey` dedupe; agent fallback; the four invariants; message + one `changes` row in one transaction; mentions add members in that transaction | §3.1 `SendMessageInput`, §3.4 invariants, §3.5 `changes` rows, §3.6 `send_message.run` |
| Reads and posts follow membership (Confusion 6) | shared threads (`team`/`knowledge_item`/`factory`) readable **and** postable by any signed-in principal, first post joins; direct threads members-only for read, post and adjust | §3.4 `canReadThread`/`canWriteThread` and the join, §3.6 step 5, §6.3–6.5 |
| A task's thread is hosted by its team (Confusion 7) | one host in a migrated and a fresh database | §3.7, §3.9, §4 steps 4 and 7 |
| Adjust is the other write (`:39-43`) | title · members · resolved/reopen · pinned · deleted; no id ⇒ empty thread; stored title wins, computed name is the fallback; members only; one `thread.changed` | §3.1 `AdjustThreadInput`, §3.7 |
| Two reads (`:45-48`) | one filtered list carrying `hasUnresolvedReview`; open returns thread + members + messages; neither writes; **membership governs reading as well as posting** | §3.1 `SearchThreadsInput`/`ThreadView`, §3.4 `canReadThread`, §3.8 |
| Every task has a thread (`:50-55`) | `tasks.threadId` NOT NULL and real; created with the task; host kind `task` gone; sessions talk in it | §3.9 (ordering), §4 (migration), §5 B3 |
| A message wakes agents (`:57-64`) | mentioned agents + the other member of a two-member thread; the existing post-commit intent, generalised; the thread module never creates a task | §3.10 wake rule, §5 B5 (`assistant_turn` → `thread_turn`) |
| The assistant is your agent (`:66-69`) | overlay stays a screen over the user's direct thread; the route, the structural `ast-` recognition, the pin reaction and the coherence trigger go | §5 B6 |
| Items die; the policy engine dies (`:71-75`) | `items` dropped, `policy-engine.ts` deleted, no auto-approve | §4 step 6, §5 B7 |
| Everything else is the BC2 loop (`:77-83`) | HTTP · MCP · `call` · governance rule gain thread; hand-pushed WS sites go; legacy bus names emitted from the change row; neighbours call send/adjust in-process | §3.11 loops, §3.12 websocket, §5 B8 |
| Gates (`:106-108`) | conversations page, a task's thread, the overlay, a bad send returning problems, a mention waking an agent that makes a task, items and the policy engine gone, the rule green with the lists shrunk | §9 |

**Rejected (`plan.md:85-88`) is a constraint, not commentary.** No `item` message kind. No separate
edit-message action. No create-on-read anywhere. No wake of every agent in a thread. The thread
module never creates a task. No thread-hosted-by-task lookup beside `tasks.threadId`. A builder that
adds any of these has added an outcome.

## 2. Reuse versus change

**Reused unchanged.** The `messages` table and its four types; the `threads` table's existing
columns and its `threads_direct_key_uq` partial unique index; `messages_idempotency_uq`
(`framework/db/src/schema.ts:794`) — the create-only dedupe is that index, not new code; the four
payload schemas (`routes/threads-schema.ts:190-241`), moved not rewritten; the five-rung title ladder
(`routes/threads.ts:426-559`), moved and given a rung 0; `headCollapsePredicate`; the mention
resolver (`threads.ts:313-352`); `findOrCreateDirectThread` and its `directKey` composition
(`conversation-store.ts:157-197`); the websocket hub, its two topics, its participant authorizer
(`ws-connection-hub.ts:103-114`, `ws-subscribe-authorizer.ts:77-101`) and the client's
`messageMatchesTopic` (`core-ui/src/services/ws-client.ts:218-231`); `review_sessions` and both
recorder function types (`AgentWorkIntentRecorderFn`, `ReviewVerdictRecorderFn`); the whole
orchestration drain, provisioner and runtime — `runtime.ts:228-233` already generalised the
transcript mapping off `assistantAgentId` to `agentId`.

**Changed.** Where a thread write lives (route handler → module action); where the read/post predicate
lives (`authorizeRead`/`authorizeWrite` in a route → `canReadThread`/`canWriteThread` in the actions,
same reach, §3.4) and how anyone joins a shared thread (nothing → posting in it); who may verdict (role
string → `users.kind`); what wakes (the assistant thread → the wake rule); what a task's thread is (a
`(task, id)` host lookup → a `team`-hosted column); what the websocket carries (a hand-built row → the
change row); the intent kind (`assistant_turn` → `thread_turn`).

**Deleted.** §5, in full, with every consumer.

**Edited, not replaced.** `framework/domain-model/src/thread.ts` — §3.1 says exactly which of its
exports move and which stay. It is neither a deletion nor a duplicate; a builder who writes a second
`HOST_KINDS` has made the compat shape the house rule forbids.

**Not touched, and a builder must not touch it.** `questionnaire` as a kind (`plan.md:121`);
`GET /recipients` (`plan.md:124`); `useRecipients`, `RecipientPicker`'s recipient list;
`knowledge_conflicts`; `blocks`/`PartList` rendering; the `session:<id>` websocket; `useTaskSessions`;
anything under `layers/agent-execution`.

## 3. Contracts

### 3.1 Declarations — `framework/domain-model/src/actions/thread.ts`

Same file shape as `actions/task.ts`. `domain-model` already ships zod and is already what `core-ui`
imports; no new package, no `architecture.json` surface edit. Names on the wire, one name in four
places, exactly as BC2 locked:

| Action | `name` | HTTP | MCP tool | UI |
|---|---|---|---|---|
| Search threads | `search_threads` | `POST /api/actions/search_threads` | `search_threads` | `call("search_threads", …)` |
| Open a thread | `open_thread` | `POST /api/actions/open_thread` | `open_thread` | `call("open_thread", …)` |
| Send a message | `send_message` | `POST /api/actions/send_message` | `send_message` | `call("send_message", …)` |
| Adjust a thread | `adjust_thread` | `POST /api/actions/adjust_thread` | `adjust_thread` | `call("adjust_thread", …)` |

`send_message` reuses the name of the tool it replaces. That is deliberate: the return set, the
forcing message and every harness prompt already say `send_message`, and the new action is a strict
superset of the old tool's job.

**`framework/domain-model/src/thread.ts` (426 lines) already owns this vocabulary and is edited, never
duplicated.** It exports `HOST_KINDS` (**with `"task"`**), `MESSAGE_TYPES`, `VERDICT_DECISIONS`,
`REVIEW_CANVAS_KINDS`, `Thread`, `Message`, the four payload interfaces, `RedactedPayload`,
`AssistantNotice`, `isRedactedPayload`, `headCollapsePredicate`, `isBlocking`, `verdictDecisionLabel`
and `AnchorRef`/`BlockId`/`BlockHostKind` (`thread.ts:21-38,55-66,88-104,208-266,284-333,360-419`), and
the barrel re-exports every one (`framework/domain-model/src/index.ts:203-246`). Declaring any of them
a second time in `actions/thread.ts` is a duplicate barrel export — a hard TS error — or two live
host-kind vocabularies, which is the compat shape `CLAUDE.md` rule 2 forbids. So:

- **`thread.ts` keeps and is edited**: `HOST_KINDS` loses `"task"` (one line, :25). The one `HostKind`
  consumer outside the files this item deletes is `framework/event-bus/src/events.ts:394`
  (`ThreadCreatedEvent.hostKind`); it needs no edit — nothing assigns `"task"` once task hosting is
  gone — and it is named here so a builder does not go looking for a second vocabulary that is not
  there. `VERDICT_DECISIONS`, `REVIEW_CANVAS_KINDS`, `MESSAGE_TYPES`, `isRedactedPayload`,
  `headCollapsePredicate`, `isBlocking`, `verdictDecisionLabel`, `AnchorRef` and `InlineRef` with its
  three arms are untouched — display helpers and vocabulary, not action shapes. **`BlockHostKind` keeps `"task"` (:21)**: it names where a *block*
  is anchored (a task page is a real anchor host), not who hosts a thread. Do not conflate them.
- **`thread.ts` loses**: the hand-written `Thread` (:94-104) and `Message` (:284-299) interfaces and
  the four payload interfaces (:214-264). They move to `actions/thread.ts` as zod schemas and are
  re-exported from the barrel under **the same names**, so `ds/thread-display.ts`,
  `ds/status-mapping.ts`, `ds/ThreadShell.tsx`, `pages/review/review-artifact.ts` and
  `domain-model/src/mention.ts` keep compiling against the name they already import. That is the same
  move BC2 made when `TaskSchema` replaced `core-ui/src/types/task.ts`.
- **`actions/thread.ts` imports the vocabulary** — `import { HOST_KINDS, MESSAGE_TYPES,
  VERDICT_DECISIONS, REVIEW_CANVAS_KINDS } from "../thread.js"` — exactly as `actions/task.ts:2`
  imports `TASK_STATES`/`TASK_OUTCOME_VERDICTS` from `../types.js`.

**One rename, stated once: `Thread.participants` becomes `Thread.members`.** The plan says members
(`plan.md:39`), the input field is `members`, and one object must not have two names. The **column**
stays `participants` — renaming it buys nothing and costs a migration — so the mapping lives in exactly
one place, the thread module's row-to-view function. Consumers to re-point:
`hooks/useConversationsThreads.ts:30,87-88,254` (deleted anyway, B9), `ds/ThreadShell.tsx:277`,
`components/RecipientPicker.tsx:91`. `components/ConversationSurface.tsx:70,142` and `ds/ThreadHostBanner.tsx:85` declare their own local
`participants` prop of a different type and are **not** touched.

```ts
// actions/thread.ts — the zod row shapes. They REPLACE thread.ts's hand-written
// Thread/Message/payload interfaces; the vocabulary above is imported, not redeclared.
export const ThreadSchema = z.object({
  id: z.string(),
  hostKind: z.enum(HOST_KINDS),
  hostId: z.string(),
  initiatorId: z.string(),
  members: z.array(z.string()),          // the parsed `participants` JSON column
  title: z.string().nullable(),          // the STORED column; null ⇒ use `computedTitle`
  computedTitle: z.string(),             // the ladder's answer, viewer-relative, never empty
  pinned: z.boolean(),
  resolvedAt: z.string().nullable(),
  deletedAt: z.string().nullable(),
  lastActiveAt: z.string(),
  createdAt: z.string(),
});

export const MessageSchema = z.object({
  id: z.string(), threadId: z.string(), senderId: z.string(),
  type: z.enum(MESSAGE_TYPES),
  payload: z.unknown(),                  // one of the four payload shapes, or the redacted variant
  clientKey: z.string(),
  blockId: z.string().nullable(),
  resolvedAt: z.string().nullable(),
  deletedAt: z.string().nullable(), redactedAt: z.string().nullable(),
  createdAt: z.string(),
});

export const IdentitySchema = z.object({
  id: z.string(), name: z.string(), role: z.string(), isAgent: z.boolean(),
});
```

`payload` is `z.unknown()` on the **output** only, exactly as the wire carries it today
(`messageRowSchema`'s per-type union, `threads-schema.ts:246-266`, moves here as an exported
`parseMessagePayload` used by the UI, not as an output schema arm). Reason: the output schema is
never used to validate — it is used to type `call()` and to describe the tool — and a
four-arm discriminated union in an *output* buys nothing while making `z.toJSONSchema` noisy. The
**input** side validates each payload precisely.

```ts
// ── search_threads ─────────────────────────────────────────────────────────
export const SearchThreadsInputSchema = z.object({
  mine: z.boolean().optional(),                 // threads the actor is a member of
  host: z.object({ kind: z.enum(HOST_KINDS), id: z.string().min(1) }).optional(),
  text: z.string().min(1).optional(),           // across message text and stored title
  ids: z.array(z.string()).optional(),
  includeResolved: z.boolean().optional(),      // default true — the sidebar shows both
  limit: z.number().int().min(1).max(50).optional(),
}).strict();

export const ThreadListRowSchema = ThreadSchema.extend({
  hasUnresolvedReview: z.boolean(),             // the sidebar badge; one batched query, never N+1
  lastMessagePreview: z.string().nullable(),
});

export const searchThreads: ActionDeclaration<SearchThreadsInput, ThreadListRow[]> = {
  name: "search_threads",
  sentence: "Search conversations. No parameter lists the ones you are in; filter by host or text.",
  input: SearchThreadsInputSchema, output: z.array(ThreadListRowSchema),
};

// ── open_thread ────────────────────────────────────────────────────────────
export const OpenThreadInputSchema = z.object({
  id: z.string().min(1),
  blockId: z.string().min(1).max(128).optional(),   // the block-anchored comment filter, unchanged
}).strict();

export const ThreadViewSchema = z.object({
  thread: ThreadSchema,
  members: z.array(IdentitySchema),      // replaces GET /threads/:id's `identities` map
  messages: z.array(MessageSchema),      // createdAt DESC, id tiebreak — today's order, unchanged
  headMessageId: z.string().nullable(),
  hostTitle: z.string().nullable(),
});

export const openThread: ActionDeclaration<OpenThreadInput, ThreadView> = {
  name: "open_thread",
  sentence: "Open a conversation: its members and every message in it, newest first.",
  input: OpenThreadInputSchema, output: ThreadViewSchema,
};

// ── send_message ───────────────────────────────────────────────────────────
// FLAT object, never a discriminated union — Reconciliation R8.
export const SendMessageInputSchema = z.object({
  threadId: z.string().min(1).optional(),
  recipients: z.array(z.string().min(1)).min(1).optional(),
  /** Present ⇒ overwrite that message instead of creating one. */
  messageId: z.string().min(1).optional(),
  /** Create-only retry key, unique per (thread, sender). Generated when absent. */
  clientKey: z.string().min(8).max(128).regex(/^[A-Za-z0-9_\-:.]+$/).optional(),
  // exactly one of the four bodies below — a pure invariant, not a schema rule
  text: z.string().max(16_384).optional(),
  refs: z.array(inlineRefSchema).optional(),          // plain only; moved verbatim
  blockId: z.string().max(128).optional(),            // plain only
  spotLabel: z.string().max(128).optional(),          // plain only
  review: reviewPayloadSchema.optional(),             // { title, reasoning[], producedItemId?, artifacts? }
  questionnaire: questionnairePayloadSchema.optional(),
  verdict: verdictPayloadSchema.optional(),           // { decision, resolvesMessageId, note? }
}).strict();

export const SendMessageOutputSchema = z.object({
  message: MessageSchema,
  thread: ThreadSchema,
});

export const sendMessage: ActionDeclaration<SendMessageInput, SendMessageOutput> = {
  name: "send_message",
  sentence:
    "Send a message. Name a thread, or name recipients to start one; leave both out to answer in " +
    "the conversation you were called from. Send text, a review, a question or a verdict. " +
    "Give a message id to replace what you already sent.",
  input: SendMessageInputSchema, output: SendMessageOutputSchema,
};

// ── adjust_thread ──────────────────────────────────────────────────────────
export const AdjustThreadInputSchema = z.object({
  id: z.string().min(1).optional(),                   // absent ⇒ create an empty thread
  host: z.object({ kind: z.enum(HOST_KINDS), id: z.string().min(1) }).optional(), // create only
  title: z.string().max(512).nullable().optional(),   // null clears the stored title
  members: z.array(z.string().min(1)).min(1).optional(),   // full replacement list
  resolved: z.boolean().optional(),                   // true ⇒ resolvedAt = now; false ⇒ reopen
  pinned: z.boolean().optional(),
  deleted: z.boolean().optional(),                    // true ⇒ deletedAt = now; false ⇒ restore
}).strict();

export const adjustThread: ActionDeclaration<AdjustThreadInput, ThreadView> = {
  name: "adjust_thread",
  sentence: "Adjust a conversation, new or existing: its title, who is in it, whether it is " +
            "resolved, pinned, or deleted.",
  input: AdjustThreadInputSchema, output: ThreadViewSchema,   // same shape open_thread returns
};

export const THREAD_ACTIONS = {
  search_threads: searchThreads, open_thread: openThread,
  send_message: sendMessage, adjust_thread: adjustThread,
} as const;
```

**Three fields the plan's four filters do not name, stated as additions rather than smuggled in.**
`search_threads.ids` is what the review page and any batch lookup need and is the arm R5 uses to serve
"by task" from the caller — without it `open_task().threadId` has nowhere to go but `open_thread`, one
call per row. `includeResolved` defaults to `true`, i.e. today's behaviour, and exists so the sidebar
can offer the filter it already offers (`l10-conversations-filter.spec.ts`). `ThreadListRow
.lastMessagePreview` is what the conversations list renders per row today and would otherwise need one
`open_thread` per row. Each is one field on a read; none adds an outcome. If the plan owner wants the
list literally four filters, `ids` is the one to keep and the other two to cut.

`adjust_thread` returns a `ThreadView`, and `send_message` returns `{message, thread}` rather than a
`ThreadView` — a send does not re-read the whole transcript it just appended to, which for a long
thread would be the most expensive read in the app on the hottest path. `edit_task` returns a full
`TaskView` because a task view is bounded; a thread's is not.

### 3.2 `ActionContext` — the one widening (Reconciliation R7)

```ts
// layers/core-api/src/actions/action.ts
export interface ActionContext {
  readonly actor: string;
  readonly db: HyperIdleDb;
  readonly eventBus: EventBus;
  readonly now: string;
  /**
   * Who is calling and from where, when the caller is a running session.
   * Filled ONLY by the MCP loop from `ToolContext` — never from a request
   * body, never from a header. Absent for every HTTP call.
   */
  readonly caller?: {
    readonly sessionId: string;
    readonly taskId: string | null;      // ToolContext.taskId, "" normalised to null
    readonly threadId: string | null;    // the session's baked calling thread
  };
}
```

Filled in `actions-as-tools.ts`'s handler, which already receives the full `ToolContext`:
`caller: { sessionId: ctx.sessionId, taskId: ctx.taskId || null, threadId: ctx.threadId ?? null }`.
`createActionsRouter` passes no `caller` at all. That is the whole change to both loops.

Three obligations in the plan need exactly this and nothing more: the agent's no-thread fallback
(`caller.threadId`), the review→session link (`caller.sessionId`), and the
produced-item-parented-to-the-calling-task check (`caller.taskId`). No action reads `caller` for
authorization — the actor is still `ctx.actor` alone.

### 3.3 `ThreadActionsDeps` — `layers/core-api/thread/src/index.ts`

The public surface is a factory, not a value, for the same reason BC2's is: a Service-imported value
may not reach the layer face, and a bare Service identifier in direct callee position is the
sanctioned shape (`tools/governance/README.md`, "A layer's face").

```ts
export interface ThreadActionsDeps {
  readonly changes: { appendChange(exec: WriteExecutor, row: NewChange): Promise<unknown> };
  readonly users: {
    getUserById(exec: WriteExecutor, id: string): Promise<User | undefined>;
    listByIds(exec: WriteExecutor, ids: readonly string[]): Promise<readonly User[]>;
    /** The one human an agent answers to when it has no thread and named no
     *  recipient — `plan.md:58`'s "the sole human in its team". The agent's own
     *  team's humans first, then any human; **the first by `createdAt`, `id`**, so a
     *  team with two humans still resolves to exactly one direct thread rather than
     *  an ambiguous list. Replaces `reply`'s `findSoleHumanUser`
     *  (`tool-definitions.ts:134`), which had no team scope at all. The team-then-all
     *  ladder itself already exists and is not being written here —
     *  `resolveReviewRecipients` (`layers/core-api/org/src/org-routing.ts:26`) survives
     *  this item; only its seam wrapper and route do not. */
    soleHumanForAgent(exec: WriteExecutor, agentId: string): Promise<User | undefined>;
  };
  readonly knowledge: {
    /** Title rung for a `knowledge_item` host, and the produced-item parent check. */
    getItemById(exec: WriteExecutor, id: string): Promise<{ readonly id: string; readonly title: string } | null>;
    findParent(exec: WriteExecutor, id: string):
      Promise<{ readonly parentKind: string; readonly parentId: string } | undefined>;
  };
  readonly org: { getTeam(exec: WriteExecutor, q: { id: string }): Promise<Team | undefined> };
  readonly settings: { readServerConfig(db: HyperIdleDb): Promise<{ readonly harnessDisabled: readonly string[] }> };
  readonly agents: {
    requireRunnableAgent(db: HyperIdleDb, agentId: string): Promise<User>;
    getAgentIdentity(db: HyperIdleDb, agentId: string): Promise<string | null>;
  };
  /** Mechanism C, exactly as `routes/threads.ts:659-668` injects them today. */
  readonly agentWorkIntentRecorder: AgentWorkIntentRecorderFn;
  readonly reviewVerdictRecorder: ReviewVerdictRecorderFn;
  /** The review→session link `submit_review` writes today (`tool-definitions.ts:537`).
   *  A seam write keyed by session id; core may not touch `review_sessions`. */
  readonly linkReviewToSession: (sessionId: string, reviewMessageId: string) => Promise<void>;
  /** The push half of §3.12. Optional — tests build the module with no hub. */
  readonly wsPush?: (topic: string, envelope: unknown) => void;
}

export function createThreadActions(deps: ThreadActionsDeps): readonly Action[];
```

Every dep is a sibling Service, the seam, or the websocket hub — the Mechanism-C shape
`TaskActionsDeps` already uses. Bound in `layers/core-api/src/actions/compose.ts`, next to
`buildTaskActionsDeps`. `linkReviewToSession` binds to the same
`AgentOrchestrationPort` route `buildGateAccessor` reaches today
(`run-orchestration-composition.ts:352-357`); it is one new port operation on the core→orchestration
direction, and it is one the seam already serves from the other side — see §5 B4 for why it moves
rather than dies.

**`thread` may not import `@hyperidle/task`, and does not.** Nothing in `ThreadActionsDeps` names a
task. `tasks.thread_id` is written by `edit_task`, read by `open_task`, and never read here.

### 3.4 The invariants, split pure / server

**Pure** — `framework/domain-model/src/actions/thread.ts`, runs in the browser to grey a control and
again on the server as the first pass. No database.

```ts
export function sendMessageInvariants(
  input: SendMessageInput,
  caller: { readonly hasCallingThread: boolean },
): Problem[];
export function adjustThreadInvariants(input: AdjustThreadInput): Problem[];
```

| code | rule |
|---|---|
| `no_target` | neither `threadId` nor `recipients` and the caller has no calling thread |
| `two_targets` | both `threadId` and `recipients` given |
| `no_body` / `two_bodies` | not exactly one of `text` · `review` · `questionnaire` · `verdict` |
| `plain_fields_on_non_plain` | `refs`/`blockId`/`spotLabel` given without `text` |
| `overwrite_needs_thread` | `messageId` given without `threadId` |
| `overwrite_with_recipients` | `messageId` and `recipients` together — an overwrite cannot open a thread |
| `verdict_on_new_thread` | a `verdict` with `recipients` — today's `threads.ts:957` rule, kept |
| `adjust_empty` | an `adjust_thread` with an `id` and no other field |
| `adjust_host_on_existing` | `host` given with an `id` |
| `members_empty` | `members: []` |

**Server** — inside `send_message.run` / `adjust_thread.run`, same `Problem` shape, never a throw.

| code | rule | replaces |
|---|---|---|
| `not_found` | the thread, or the message being overwritten, does not exist | 404 |
| `thread_deleted` | `threads.deletedAt` is set | new |
| `not_a_member` | `canWriteThread(ctx.actor, thread) === false` — for send **and** adjust. Reachable only on a `user`/`agent`-hosted thread, where "not a member" is literally the reason | `authorizeWrite`'s host-kind predicate (`auth/access-boundary.ts:32-77`), moved |
| `recipient_not_found` | a `recipients` entry has no `users` row | `send_message` tool's `getUserById` guard |
| `verdict_not_human` | the verdict's sender is not `users.kind === "human"` | `role === "founder"` (R6) |
| `verdict_self` | the verdict's sender is the review's own sender | `threads.ts:1336` |
| `verdict_foreign_review` | `resolvesMessage.threadId !== thread.id` | `threads.ts:1330` |
| `verdict_race` | the review was already resolved (first-verdict-wins CAS returned zero rows) | 409 `VerdictRaceConflict` |
| `idempotency_conflict` | `(threadId, senderId, clientKey)` exists with a different type or payload | 409 |
| `produced_item_not_owned` | `review.producedItemId` is not parented to `(task, ctx.caller.taskId)` | `submit_review`'s check (`tool-definitions.ts:487-500`) |
| `no_reply_recipient` | an agent with no thread, no recipients, no calling thread, and no human to fall back to | `reply`'s `NO_REPLY_RECIPIENT` |

**`produced_item_not_owned` runs only when `ctx.caller?.taskId` is present.** An HTTP caller naming a
`producedItemId` is not checked against a task, because a browser is not running a task. That is the
same reach the check has today — it only ever ran inside `submit_review`, which only ever ran in a
session.

**Deliberately absent: an "only the author may overwrite" rule.** `plan.md:92` says "Who may post is
membership, nothing more." A member may therefore rewrite any message in a thread it is in. Named,
not overlooked; see §6.

#### Who may read, who may post, and how anyone ever joins

`plan.md` Confusion 6 settles all three, and they have to be read together or the first two produce a
thread nobody outside can ever enter. Two pure functions in `actions/thread.ts`, and **one of them
delegates to the other, exactly as the code being deleted does**:

```ts
const HOST_SCOPED: ReadonlySet<HostKind> = new Set(["team", "knowledge_item", "factory"]);

/** `canRead` + `HOST_SCOPE` (`layers/core-api/src/auth/access-boundary.ts:32-66`), moved,
 *  with `task` gone from the vocabulary. */
export function canReadThread(
  actor: string,
  thread: { readonly hostKind: HostKind; readonly members: readonly string[] },
): boolean {
  if (HOST_SCOPED.has(thread.hostKind)) return true;   // a shared surface: any signed-in principal
  return thread.members.includes(actor);               // `user`/`agent` hosts — every DM: members only
}

/** `canWrite`, which delegates to `canRead` today (`access-boundary.ts:76-77`) and
 *  still does. Kept as its own name so a future write-only tightening has the same
 *  seam that file's own `@lore` at `:72-74` asks for. */
export const canWriteThread = canReadThread;
```

`factory` is on the host-scoped list because it is host-scope in `HOST_SCOPE` today
(`access-boundary.ts:32-39`) and this is that predicate moved, not a new policy. `task` leaves by
leaving `HOST_KINDS`; a task's thread is host `team` (§3.9, §4 step 4), so it stays exactly as reachable
as it is today.

**Posting to a host-scoped thread you are not in joins you to it, in the same transaction as the
message.** That is the join path, and without it every shared thread is write-once by whoever happened
to be seeded into it. Stated precisely:

- the join is a consequence of a successful post, never a request — there is no "join" input and no
  `adjust_thread` call;
- it happens only on a **host-scoped** thread. A `user`/`agent`-hosted thread refuses a non-member
  with `not_a_member` before anything is written, so a DM can never be joined by posting into it;
- **no `thread.changed` row is appended for the join.** The `thread.message` row's `after` carries the
  resulting member list (§3.5). One row records one act — the post and the joining are the same act,
  and a second row would say a member list changed for no visible reason;
- the same rule covers the mention-add, so there is one representation of "this send changed who is in
  the thread" rather than two. `adjust_thread` remains the only writer of a `thread.changed` row whose
  diff names `members`.

**`adjust_thread` follows the same predicate: whoever may read a thread may adjust it.** On a
host-scoped thread that is any signed-in principal; on a direct thread it is its members. No role check
anywhere — `plan.md:42`'s "only a member may adjust" is the direct-thread case of one rule, not a
second rule. An adjust does **not** join the actor: renaming a team thread is not speaking in it.

Applied to the two reads:

- **`open_thread`** — a thread the actor cannot read returns the **same `not_found` problem** as a
  deleted one. Not a distinct `forbidden`: the two answers must be indistinguishable or the action is
  an existence oracle for thread ids.
- **`search_threads`** — every arm filters on `canReadThread`, not only `mine`. `ids` and
  `host:{kind:"user"|"agent"}` are the two arms that would otherwise enumerate another person's DMs;
  `mine` is already narrower than the predicate and keeps its SQL probe as a pre-filter.
- **The websocket is unchanged and stays the reference.** `ws-subscribe-authorizer.ts:95-100` gates
  `thread:<id>` on the participant list. A read through the action is **no looser than** a read through
  the socket for a `user`/`agent` thread. For a host-scoped thread it is looser *until the first post* —
  the socket wants membership, the action does not — which is today's asymmetry unchanged
  (`GET /threads/:id` returns a `team`-hosted thread to any principal while the socket refuses the
  subscription), and which the join closes for anyone who actually participates. Named, not new.

`actionsAsTools` registers every action for every actor with no `roles` filter
(`layers/core-api/src/actions/actions-as-tools.ts:14-28`), so an agent session reaches these with the
same predicate a browser does — which is why the predicate, and not the projection, is where it lives.

#### The four paths this keeps alive

Each of these works today because `canWrite` delegates to `canRead`; each is a task- or
knowledge-hosted thread, so each still works, and each joins its actor on the first post.

| Path | The thread | Why it works |
|---|---|---|
| **A handoff.** `edit_task` moves `ownerAgentId`; the new owner's session talks in `task.threadId` (§5 B3), whose members are the original creator and original owner | host `team` (§3.9) | host-scoped ⇒ the new owner may post; its first `send_message` — including the review it files, now that `submit_review` is gone — joins it. §3.9's member seeding stays creation-only; no handoff-time seeding is added |
| **A verdict from a reviewer who is not on the task.** The review lives in the task's thread; the verdict is a `send_message` | host `team` | host-scoped ⇒ the reviewer may post, and the join happens in the same transaction as the verdict. Order inside `send_message.run`: `canWriteThread` first (passes), then the verdict trio (`verdict_not_human`, `verdict_self`, `verdict_foreign_review`), then the write. `not_a_member` never fires, so the review→resume chain `plan.md:81-82` keeps is intact |
| **A visitor on a knowledge page.** `KnowledgeDetail.tsx:699` / `HostThreadSection.tsx:181,187` (§5 B9) | host `knowledge_item` | host-scoped ⇒ any authenticated user may post, as today. B9's `resolveOrCreateHostThread` replacement is `search_threads({host})` → `send_message({threadId})`, with `adjust_thread({host})` only when no thread exists yet |
| **B7b's `system:propagation` successor.** Posts the stalled-knowledge-action review into a thread it did not create, on the second failure onward | host `knowledge_item` | host-scoped ⇒ it may post, and it joins on its first one. This is the case that made B7b's "stop creating a thread per failure" possible at all |

The case that is still refused, and must be: a signed-in principal posting into someone else's DM. A
`user`- or `agent`-hosted thread has no join path by design, which is the whole content of "direct
threads stay members-only".

### 3.5 The `changes` rows

`changes.object` already accepts `'thread'` (`framework/db/src/schema.ts:584`); `changes_kind_ck` is the
next line (`:585`) and widens
to `created | changed | message` (§4 step 2). `objectId` is always the **thread** id, never a message
id — that is what lets BC5 read a thread's history with one `listChanges({object:'thread', objectId})`
and what lets the `thread:<id>` websocket topic be keyed on it.

| when | `kind` | `actor` | `before` | `after` |
|---|---|---|---|---|
| a send opened a thread | `created` | sender | `null` | `{id, hostKind, hostId, initiatorId, members, title, pinned, createdAt}` |
| `adjust_thread` with no id | `created` | actor | `null` | same |
| every message created **or overwritten** | `message` | sender | `null` on create; `{messageId, type, payload}` as it was, on overwrite | `{messageId, type, payload, clientKey, blockId, createdAt}`, **plus `members` when this send changed who is in the thread** |
| every `adjust_thread` with an id | `changed` | actor | only the fields that differ | only the fields that differ |
| a send that resolved / reopened / bumped the thread | `changed` | sender | `{resolvedAt}` before | `{resolvedAt, lastActiveAt}` after |

**A send never appends a `changed` row for membership.** Both ways a send can change the member list —
the sender joining a host-scoped thread (§3.4) and an `@mention` pulling someone in — ride
`after.members` on the `message` row, present only when the list actually moved and absent otherwise.
One act, one row: the post and the joining are the same act, and a second row would assert that
membership changed for no visible reason. `adjust_thread` stays the **only** writer of a `thread.changed`
row whose diff names `members`, which is what lets BC5 tell "someone spoke and thereby joined" from
"someone was added".

A send that opens a thread with a first message therefore writes **two** rows in one transaction —
`created` and `message` — and a send into an existing thread writes `message` plus, when the thread's
own state moved, `changed`. Every row lands in the same transaction as the write it records; nothing is
appended after commit.

`changes.actor` is `NOT NULL REFERENCES users(id)`, so every actor must be a real row. There is no
synthetic sender in this module — `"policy_engine"` (`policy-engine.ts:164`, a sender id with no
`users` row) dies with the engine, and that is one of the reasons it dies.

### 3.6 `send_message.run`, in order

**Before the transaction**

1. `sendMessageInvariants(input, { hasCallingThread: ctx.caller?.threadId != null })`; problems ⇒ return.
2. **Resolve the thread.** In this order, first match wins:
   a. `input.threadId`;
   b. `input.recipients` ⇒ a thread will be **created** in step 5 with members `[ctx.actor, ...recipients]`
      (a single recipient goes through `findOrCreateDirectThread`'s `directKey` so a DM is never
      duplicated — `conversation-store.ts:157-197`, moved);
   c. `ctx.caller?.threadId`;
   d. the sole human for `ctx.actor`'s team, then any human (`deps.users.soleHumanForAgent`, which
      returns **one** user, never a list) ⇒ a direct thread with them, again through
      `findOrCreateDirectThread`;
   e. none ⇒ `no_reply_recipient`.
   (c) and (d) are the `reply` tool's rule (`tool-definitions.ts:130-146`), now an invariant of send.
   **A human HTTP caller never reaches (c) or (d)** — `ctx.caller` is absent, so a browser that names
   neither is stopped by the pure `no_target` invariant instead.
3. **Idempotency.** Create only, and only when `input.clientKey` was supplied: look up
   `(threadId, ctx.actor, clientKey)`. Same type and payload ⇒ return that message with `ok: true`,
   no write. Divergent ⇒ `idempotency_conflict`. An overwrite carries a `messageId` and is not
   deduped — last write wins (`plan.md:90-91`).
4. **Server invariants** (§3.4), in this order: `not_found` / `thread_deleted`, then
   `canWriteThread` ⇒ `not_a_member`, then the `producedItemId` parent check, then the verdict trio
   (`verdict_not_human`, `verdict_self`, `verdict_foreign_review`). Any problem ⇒ return, no write.
   **The order is what makes a reviewer's verdict work**: `canWriteThread` passes on the task's
   `team`-hosted thread even though the reviewer is not yet a member, so the verdict trio is the thing
   that actually decides, and `not_a_member` never pre-empts it.

**Inside one transaction (step 5)**

5. create the thread when (2b/2d) resolved to one, and `appendChange(created)`; **join the sender**
   when the thread is host-scoped and `ctx.actor ∉ members` (§3.4) and resolve mentions in `text`,
   adding both sets of ids to `participants` in one atomic update (`threads.ts:1348-1364, 1428-1437`,
   moved) — **no `changed` row for either; the resulting list rides the `message` row's
   `after.members`** (§3.5); `insertMessage` (create) or `update` the
   named message's `type`/`payload`/`blockId` (overwrite); for a verdict,
   `resolveMessageIfUnresolved` — zero rows ⇒ throw the private `VerdictRaceConflict`, caught outside
   and returned as `verdict_race`; then the thread's own state: verdict ⇒ `resolvedAt = now`, a
   `review`/`questionnaire` into a resolved thread ⇒ `resolvedAt = null` (reopen), otherwise
   `lastActiveAt = now`; `appendChange(message)` and, when the thread's own fields moved,
   `appendChange(changed)`.

**After commit (step 6), in this order**

6. a. **the legacy bus names**, derived from the rows just written, not from the input:
      `thread_created` · `thread_message_appended` · `thread_resolved` / `thread_reopened`, with
      today's payloads byte for byte (`threads.ts:1473-1482, 1544-1563`). They die in BC5.
   b. **link the review to its session.** `message.type === "review"` and `ctx.caller?.sessionId`
      present ⇒ `deps.linkReviewToSession(ctx.caller.sessionId, message.id)`. Post-commit, so the
      link can never point at a message that does not exist — the same reason the intent is
      post-commit (`threads.ts:1438-1451`). Absent a caller session (a human filing a review from the
      browser) nothing is linked, which is correct: there is no session to bring back.
   c. **resume the agent whose review a verdict decided.** `deps.reviewVerdictRecorder(…)`, moved
      verbatim from `threads.ts:1496-1525` including the five-decisions-to-two collapse and the
      `try/catch` that turns a seam failure into `{status:"not_resumable"}`. `not_resumable` ⇒ a
      second **plain** message telling the human, posted by a nested `send_message.run` call as the
      same actor in its own transaction (`threads.ts:1530-1542` does this with a raw
      `insertMessage` today; through the action it now records a `changes` row like everything else).
   d. **wake** (§3.10).
   e. **push** (§3.12).

A crash between commit and step 6 loses the nudge, never the record — §7.

### 3.7 `adjust_thread.run`

No id ⇒ create: `initiatorId = ctx.actor`, `members = [ctx.actor]` unioned with `input.members`, one
`created` row, and the host is **whatever the caller passed in `host`**. With an id, the gate is
`canWriteThread` (§3.4), not bare membership: any signed-in principal may adjust a host-scoped
(`team`/`knowledge_item`/`factory`) thread, and only its members may adjust a direct one. An adjust
never joins the actor — renaming a team thread is not speaking in it. When `host` is omitted it
defaults to `{kind:"user", id: ctx.actor}` — a personal thread, the only sensible answer when nobody
named a home. **A task's thread never takes that default**: `edit_task` always passes
`host: { kind:"team", id: task.teamId }` (§3.9), which is the host §4 steps 4 and 7 give every migrated
task thread, so the same object has the same host in a fresh database and a migrated one. With an id:
load, refuse
`not_a_member` (i.e. `canWriteThread` false) and `thread_deleted`, then one `UPDATE` and one `changed` row carrying only the
fields that differ. `deleted: true` writes `deletedAt`; nothing is ever `DELETE`d. `resolved` maps to
`resolvedAt`; `pinned` to `pinned`; `title: null` clears the stored title so the ladder answers again.
Returns `open_thread.run(ctx, { id })` — bounded here, because an adjust is rare and the caller is a
screen that wants the whole thing.

A deleted thread is invisible to `search_threads` and returns `not_found` from `open_thread`. It is
**not** invisible to `send_message`'s idempotency lookup or to the `messages` FK — the rows survive,
which is what makes `deleted: false` a real restore.

### 3.8 The two reads

`search_threads.run`: `mine` ⇒ the participant LIKE probe plus the JS membership re-verify that
`threads.ts:773-790` already does (the probe is a pre-filter, never the authorization); `host` ⇒ the
`threads_host_idx` lookup; `text` ⇒ `searchConversations` (`conversation-store.ts:357`), moved,
extended to also match the new stored `title`; `ids` ⇒ a batched `IN`. `deletedAt IS NULL` always, and
**every arm filters the result through `canReadThread` before returning** — including `ids` and
`host`, the two that would otherwise list another person's DMs.
`hasUnresolvedReview` is one batched `listMessages({threadIds, types:["review","questionnaire"],
unresolved:true})` for the whole page — the shape `threads.ts:793-805` already uses; never per row.
Titles come from the batched ladder (`resolveThreadTitles`, `threads.ts:426-559`, moved) with a new
**rung 0: the stored `threads.title`**, and with the host-`task` rung deleted.

`open_thread.run`: load the thread; `deletedAt` set **or** `canReadThread(ctx.actor, thread) === false`
⇒ the same `not_found` problem, before any message is read. Then the thread, its members resolved to
`IdentitySchema` rows (today's `identities` map, `threads.ts:229-248`), its messages `createdAt DESC`
with the id tiebreak, `headMessageId`, and `hostTitle`. The `blockId` filter is passed straight through
to the existing `messages_block_id_idx` query. **Neither read writes anything** — that is what kills
`GET /threads/assistant`'s create-on-read (`assistant.ts:203`) with no replacement.

`open_thread` is what the review page reads. It finds its review by message id in `messages`, and it
gets the task from `open_task(taskId).threadId` — the caller already knows the task (§5 B9).

### 3.9 Task ↔ thread: the ordering, locked

`edit_task` creating a task with no `threadId` **creates the thread before it opens its own
transaction**, by calling the thread action in-process as the same actor (the module-link rule: through
the action, never the table):

```ts
await deps.adjustThread(ctx, {
  host:    { kind: "team", id: next.teamId },        // NOT the {user, actor} default — §3.7
  members: [ctx.actor, ...(next.ownerAgentId ? [next.ownerAgentId] : [])],
});
```

The returned `thread.id` goes into the `tasks` INSERT. `ownerAgentId` is spread, not listed:
`tasks.owner_agent_id` is nullable (`framework/db/src/schema.ts:174`) and a task may legitimately be
created with no owner, which `members: z.array(z.string().min(1)).min(1)` would reject. `ctx.actor`
alone is a valid member list.

**Host is `team`, in both directions.** A task's conversation belongs to the team that owns the task.
That is what §4 step 4 backfills, what §4 step 7 re-hosts surviving task-hosted threads to, and what
this call passes — one host for one kind of object, whether the database was migrated or seeded fresh.
It also keeps a task thread readable exactly as widely as it is today, because `team` is host-scope in
the predicate `canReadThread` inherits (§3.4). Direct threads keep host `user`, unchanged.

Why before rather than after: `tasks.thread_id` becomes `NOT NULL` (§4 step 5). A thread created
after commit would need the task row to exist first with a null `thread_id`, which the constraint
forbids, and then a second `UPDATE` — two writes, a nullable window, and a second `changes` row for
the same decision. Creating it first is one write each, in the right order, with no window.

The residue, accepted by `plan.md`: if the task transaction then fails, an empty thread with the
creator as its only member is left behind. It is reachable — `search_threads({mine:true})` lists it —
and the actor can delete it with `adjust_thread`. That is the price of the constraint being real, and
it is cheaper than a nullable column plus a repair path.

Creating a task **with** a `threadId` uses that thread and adds the owner as a member if absent
(`plan.md:124`, Confusion 5) — a second `deps.adjustThread(ctx, { id: threadId, members: [...] })`
before the transaction, same actor, skipped when the owner is already a member.

**The crossing is a dep, never an import.** `layers/core-api/task` may not name `@hyperidle/thread`:
"a service never names a sibling, it receives one through a port"
(`tools/governance/src/lib/governance-model.ts:176-177`) — the rule that made BC2 inject `edit_task`
into `LifecyclePropagationDeps` rather than import it. So `TaskActionsDeps` gains exactly one entry, a
function value:

```ts
// layers/core-api/task/src/task-actions.ts — added to TaskActionsDeps
readonly adjustThread: (
  ctx: ActionContext,
  input: AdjustThreadInput,
) => Promise<ActionResult<ThreadView>>;
```

Both types come from `@hyperidle/domain-model`, which `task` already imports; neither package names the
other. Bound in `layers/core-api/src/actions/compose.ts`, which is layer code and may name both:

```ts
export function buildCoreActions(bindings: …): readonly Action[] {
  const threadActions = createThreadActions(buildThreadActionsDeps(bindings));       // FIRST
  const adjustThread = runnerFor(threadActions, "adjust_thread");                    // by declaration name
  const taskActions  = createTaskActions(buildTaskActionsDeps(bindings, adjustThread));
  return [...taskActions, ...threadActions];
}
```

**Thread actions are built before task actions**, because the task bag needs `adjust_thread`'s runner
and the thread bag needs nothing from task (§3.3: `ThreadActionsDeps` names no task). The dependency
is one-way, so no lazy indirection or two-phase wiring is needed — build order alone settles it. The
returned array's order is irrelevant; the router and the tool adapter both loop.

`EditTaskInputSchema` gains one optional field, `threadId: z.string().optional()`; `TaskSchema.threadId`
**and** `TaskViewSchema.threadId` (`framework/domain-model/src/actions/task.ts:156`, the field
`task-actions.ts:253` fills and §5 B9's UI reads) both stop being nullable. Those are the only three
edits to `framework/domain-model/src/actions/task.ts`; in particular **nothing is added to
`SearchTasksInput`** — R5.

### 3.10 The wake rule

```ts
/** plan.md:57-60. Pure. Runs post-commit over the thread's FINAL member list —
 *  after the mention-adds AND after the sender's own join (§3.4), which is why
 *  it is computed from what step 5 wrote, never from what step 2 loaded. */
export function agentsToWake(input: {
  readonly members: readonly string[];      // after the send's mention-adds
  readonly senderId: string;
  readonly mentionedIds: readonly string[]; // resolved from the message text, this send only
  readonly isAgent: (id: string) => boolean;
}): readonly string[] {
  const woken = new Set<string>();
  for (const id of input.mentionedIds) if (input.isAgent(id)) woken.add(id);
  if (input.members.length === 2) {
    const other = input.members.find((m) => m !== input.senderId);
    if (other !== undefined && input.isAgent(other)) woken.add(other);
  }
  woken.delete(input.senderId);
  return [...woken];
}
```

The two-member arm is what makes a direct thread with your own agent work with no `@`
(`plan.md:58-59`); it is evaluated on the **final** member list, so a mention that added a third
member turns the arm off — correct, because the mention already woke whoever it named. A sender
joining a host-scoped thread has the same effect and is equally correct: a two-member team thread that
a third person posts into is a three-member thread by the time the wake is computed, so their post does
not wake the agent that was sitting in it. If they want it, they `@` it.

For each woken agent, post-commit:

```ts
const bakedRequest = await resolveThreadTurnRequest(ctx.db, message.id, agentId, deps); // §5 B5
await deps.agentWorkIntentRecorder({
  kind: "thread_turn",                            // was "assistant_turn"
  sourceKind: "thread_message",
  sourceId: `${message.id}:${agentId}`,           // was `messageId` — see below
  requestedBy: ctx.actor,
  idempotencyKey: `thread-turn:${message.id}:${agentId}`,   // was `assistant:${messageId}`
  bakedRequest,                                   // bakedRequest.sourceId stays `message.id`
});
```

**`sourceId` is `(message, agent)`, and that is load-bearing, not cosmetic.** The drain's
supersede check is on `(kind, sourceId)` **alone** — `findNewerPendingSiblingInternal`
(`layers/agent-orchestration/session-requests/src/service.ts:526-545`) filters on
`eq(kind)`, `eq(sourceId)`, `id != intent.id` and `status in ('pending','claimed')`, and
`processIntentsInternal` then calls `markSupersededInternal` and `continue`s
(`service.ts:723-728`). `idempotencyKey` is **not** in that predicate. With a bare `message.id` the
second mentioned agent's intent supersedes the first's and exactly one agent ever runs — which is
`plan.md:57`'s outcome silently not happening. Widening the identity to `(message, agent)` gives the
right supersede semantics for free: a **re-emit for the same agent on the same message** still
supersedes, a **different agent** does not.

Nothing downstream reads the intent's `sourceId` as a bare message id. The session request is built
from `baked.sourceId`, not `intent.sourceId` (`service.ts:641`), so
`agent_session_requests.sourceId` stays the message id and `sourceCorrelation.messageId` is unchanged;
the request's own dedupe is `(sourceKind, sourceId, idempotencyKey)` (`service.ts:112-124, 145-153`),
which is per-agent either way. The one function that **did** assume "sourceId IS the triggering message
id" is `listPendingIntentsByKind` (`service.ts:1284-1302`, and that assumption is written into its own
doc comment); its only caller is `assistant-turn-coherence-trigger.ts:65`, which this item deletes.
With the caller gone the function, its port method (`framework/api-contract/src/agent-orchestration-port.ts:164-165`),
its route (`agent-orchestration-intake.ts:158-172`), its client
(`agent-orchestration-port-composition.ts:223-233`) and its barrel export
(`session-requests/src/index.ts:11`) have no reader and are **deleted with it** — leaving a live
function whose doc comment is now false is the worse option. Two more sites go with the route, and
neither is compile-caught in the first case:

- its **`PLUMBING_ROUTES` entry**
  `layers/agent-orchestration/src/routes/agent-orchestration-intake.ts|GET /requests/pending-intents`
  (`tools/governance/src/rules/actions-projected.ts:83`). Clause 2 has a reverse check for
  `LEGACY_ROUTES` entries whose route is gone (`actions-projected.ts:433-442`) but **none** for
  plumbing entries, so a stale row here is inert rather than red. Delete it anyway: the list is a claim
  about what exists, and the one clause that cannot enforce itself is the one a reviewer has to.
- `layers/core-api/src/services/__tests__/agent-orchestration-port-writes.integration.test.ts:121-137`
  tests the deleted port method. Deleted with it (compile-caught, but it belongs on §9's list).

`agent_work_intents_identity_uq` is `(kind, sourceKind, sourceId, idempotencyKey)`
(`framework/db/src/schema.ts:421-426`), so the rows were always distinct; the index was never the
problem. The supersede predicate was.

**Nothing else wakes on a message.** Humans get theirs from BC5 subscriptions. The thread module
never creates a task; the woken agent's session does, through `edit_task` (`plan.md:60-63`).

A bake that throws (`requireRunnableAgent` refusing a deactivated agent) must not lose the other
agents' wakes and must not lose the message: each wake is attempted independently, a failure is
logged and dropped, the message stays committed. That is a change from today, where a failed bake
throws out of the route and the caller sees a 5xx (`threads.ts:1438-1451`) — §7.

### 3.11 The loops

Three one-line edits, no mechanism:

- `layers/core-api/src/actions/compose.ts` — `buildThreadActionsDeps(...)` alongside
  `buildTaskActionsDeps`, thread actions built **first** so the task bag can receive `adjust_thread`'s
  runner (§3.9). `buildCoreActions`'s signature grows the bindings the thread deps need (the two
  recorders, the ws hub, the gate link), which `app.ts` already holds (`app.ts:189-193`, `:415-424`).
- `layers/core-ui/src/services/call.ts` — `type Actions = typeof TASK_ACTIONS & typeof THREAD_ACTIONS`.
- `tools/governance/src/rules/actions-projected.ts` — the three shrink lists lose their rows (§5 B10).

`createActionsRouter` and `actionsAsTools` are untouched except for `caller` (§3.2). Mounting stays
structural: the loop mounts every declaration or none, which is why the rule has no "is it mounted"
clause.

### 3.12 The websocket, precisely

**This section is conditional on the one open amendment and is written that way deliberately.** The
nudge-versus-payload choice is with the plan owner (§ Proposed plan amendments); everything below
describes the nudge reading, which is what the rest of the document is costed against. If the payload
reading wins, what changes is this section and the two new hooks in §5 B9 — nothing else in the
document moves. Both readings are costed in the amendment; neither is being decided here.

**The hub, its two topics, its participant authorizer and the client's `messageMatchesTopic` all
stay.** What goes is `pushUpdate` and its nine call sites, `buildThreadListRowForPush` (with its
viewer-relative title bug, `threads.ts:113-146`) and `buildSenderIdentityForPush`.

After commit, `send_message` and `adjust_thread` push **the `changes` row itself**, once per row, on
both topics:

```
topic `thread:<threadId>`  and  topic "conversations"
{ type: "update", topic, kind: "thread.created" | "thread.changed" | "thread.message",
  data: { id, object, objectId, kind, actor, before, after, at } }
```

The envelope shape is unchanged (`{type, topic, kind, data}`), so `messageMatchesTopic`
(`ws-client.ts:218-231`) needs no edit and no new protocol exists. `kind` carries the dotted object
event name the plan already uses; the field was typed `EventType` in the deleted `pushUpdate` and is
typed `string` in the new pusher.

**What the browser does with it: re-run its own `call()`.** That is `plan.md:81`'s "hooks are
replaced by `call()` + the same subscription" read literally. A `thread:<id>` row ⇒
`call("open_thread", {id})`; a `conversations` row ⇒ `call("search_threads", {mine:true})`. One rule,
both topics, no payload assembly on the server.

The cost, stated: one extra round trip per message instead of the message riding in the push. The
gain: `buildThreadListRowForPush`'s per-viewer title is computed by the viewer that asked, so the
long-standing wrong-title-for-non-creators bug (`threads.ts:113-123`'s own `@lore`) is gone rather
than carried, and `PATCH`/`direct`/`assistant` — which push **nothing** today, so their writes are
invisible until a refetch (`facts.md:112`) — start pushing like every other write.

`conversations` is a global topic any authenticated identity may subscribe to
(`ws-subscribe-authorizer.ts:83`). A change row broadcast there carries `actor`, `objectId` and the
changed thread fields, which is a small widening over today's list row; the *message* body never
rides `conversations`, and `thread:<id>` stays participant-gated. §6.

## 4. Data and migration

One hand-written file, `framework/db/drizzle/0085_thread_module.sql` (0084 is taken by the open BA5 PR #554; if BA5 has not merged when this ships, the two do not collide by number, and whichever lands second rebases the journal), plus one `meta/_journal.json`
entry `{"idx":85,"version":"7","when":1785693612000,"tag":"0085_thread_module","breakpoints":true}`.
`0083_changes_and_task_edit` is the highest today. There is no generator
(`framework/db/drizzle/README.md`). The steps are ordered; a later one depends on an earlier one.

```sql
-- 1. a thread gets its own title and a soft delete.
ALTER TABLE "threads" ADD COLUMN "title" text;
ALTER TABLE "threads" ADD COLUMN "deleted_at" text;

-- 2. a post is its own kind of change (plan.md Confusion 1).
ALTER TABLE "changes" DROP CONSTRAINT "changes_kind_ck";
ALTER TABLE "changes" ADD CONSTRAINT "changes_kind_ck"
  CHECK ("kind" in ('created','changed','message'));

-- 3. a task that already has a task-hosted thread keeps it. Oldest wins when
--    several exist — nothing forbade a second one, so pick deterministically.
UPDATE "tasks" t SET "thread_id" = (
  SELECT th."id" FROM "threads" th
  WHERE th."host_kind" = 'task' AND th."host_id" = t."id"
  ORDER BY th."created_at" ASC, th."id" ASC LIMIT 1)
WHERE t."thread_id" IS NULL
  AND EXISTS (SELECT 1 FROM "threads" th2
              WHERE th2."host_kind" = 'task' AND th2."host_id" = t."id");

-- 4. every remaining task gets one. Deterministic id so a re-run is a no-op.
--    Host is the task's TEAM: a task conversation belongs to the team that owns
--    the task, `host_kind` stays NOT NULL with no new vocabulary, and it matches
--    what `edit_task` passes for a task created after this migration (§3.9).
--
--    INTENDED MEMBERSHIP, stated so it can be re-derived rather than copied:
--    the task's owner agent when it has one, plus the first human by
--    (created_at, id) when one exists. Both, not one. Zero members is legal and
--    produces '[]': the thread is host-scoped ('team'), so anyone signed in can
--    still read it and the first person to post joins it (§3.4). A task nobody
--    owns in a database with no humans is not a dead thread, just an empty one.
WITH seed AS (
  SELECT t."id" AS task_id, t."team_id", t."created_at", t."updated_at",
         t."owner_agent_id",
         (SELECT u."id" FROM "users" u WHERE u."kind" = 'human'
          ORDER BY u."created_at" ASC, u."id" ASC LIMIT 1) AS human_id
  FROM "tasks" t WHERE t."thread_id" IS NULL
)
INSERT INTO "threads"
  ("id","host_kind","host_id","initiator_id","participants","pinned","last_active_at","created_at")
SELECT 'thr-' || s.task_id, 'team', s."team_id",
       COALESCE(s."owner_agent_id", s.human_id, 'system:propagation'),
       COALESCE(
         (SELECT json_agg(m)::text FROM (
            SELECT s."owner_agent_id" AS m WHERE s."owner_agent_id" IS NOT NULL
            UNION
            SELECT s.human_id AS m WHERE s.human_id IS NOT NULL) u),
         '[]'),
       false, s."updated_at", s."created_at"
FROM seed s;

UPDATE "tasks" SET "thread_id" = 'thr-' || "id" WHERE "thread_id" IS NULL;

-- 5. the column becomes real. Guard first — a silent NULL here is a broken app.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "tasks" WHERE "thread_id" IS NULL) THEN
    RAISE EXCEPTION '0085: % tasks still have no thread',
      (SELECT count(*) FROM "tasks" WHERE "thread_id" IS NULL);
  END IF;
END $$;
ALTER TABLE "tasks" ALTER COLUMN "thread_id" SET NOT NULL;

-- 6. items die, and the pointer at them with it. Destructive, no compat column.
ALTER TABLE "messages" DROP COLUMN "legacy_item_id";
DROP TABLE "items";

-- 7. no thread is hosted by a task any more. A thread a task now claims is
--    re-hosted onto that task's team; an orphan (no task claims it) onto its
--    initiator, which is always a real identity.
UPDATE "threads" th SET "host_kind" = 'team', "host_id" = t."team_id"
FROM "tasks" t WHERE th."host_kind" = 'task' AND t."thread_id" = th."id";
UPDATE "threads" SET "host_kind" = 'user', "host_id" = "initiator_id"
WHERE "host_kind" = 'task';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "threads" WHERE "host_kind" = 'task') THEN
    RAISE EXCEPTION '0085: threads still hosted by a task';
  END IF;
END $$;

-- 8. the intent kind says what it is. Same three constraints 0078 wrote.
UPDATE "agent_work_intents" SET "kind" = 'thread_turn' WHERE "kind" = 'assistant_turn';
ALTER TABLE "agent_work_intents" DROP CONSTRAINT "agent_work_intents_kind_ck";
ALTER TABLE "agent_work_intents" DROP CONSTRAINT "agent_work_intents_kind_source_compat_ck";
ALTER TABLE "agent_work_intents" ADD CONSTRAINT "agent_work_intents_kind_ck"
  CHECK ("kind" in ('thread_turn','session_start','knowledge_action','routine_run','task_run','session_resume'));
ALTER TABLE "agent_work_intents" ADD CONSTRAINT "agent_work_intents_kind_source_compat_ck" CHECK (
     ("kind" = 'thread_turn'      and "source_kind" = 'thread_message')
  or ("kind" = 'session_start'    and "source_kind" = 'explicit_session_start')
  or ("kind" = 'knowledge_action' and "source_kind" = 'knowledge_action')
  or ("kind" = 'routine_run'      and "source_kind" = 'routine_run')
  or ("kind" = 'task_run'         and "source_kind" = 'task_dispatch_attempt')
  or ("kind" = 'session_resume'   and "source_kind" = 'review_verdict'));
```

Step 4 is the one place a builder should re-derive rather than copy, against the intent the comment
states. Three traps, all of which an earlier draft of this document fell into and which the migration
test (§9) is written to catch:

- **the `LIMIT` must not bind to the union.** `SELECT a UNION SELECT b ORDER BY 1 LIMIT 1` limits the
  *whole* union to one row, so the derived table yields one member, not two. The `WITH seed` form above
  resolves `human_id` once, outside, and the inner union then has nothing to limit.
- **a derived table in `FROM` cannot correlate to the outer row** without `LATERAL`. `seed` sidesteps it
  by making the correlation a CTE column.
- **`initiator_id` must be an identity.** The last `COALESCE` arm is `'system:propagation'`, the real
  seeded user row (`layers/core-api/src/bootstrap/factory-state.ts:36-41`) — never `t."id"`, a task id
  in an identity column. There is **no FK** on `threads.participants` or `threads.initiator_id`
  (`schema.ts:734-769`), so nothing catches a bad value at write time; `changes.actor`'s FK
  (`schema.ts:574-576`) is what makes it bite later, on the first `adjust_thread` against that thread.

**`framework/db/src/schema.ts`** mirrors every step: `threads` gains `title`/`deletedAt`; `tasks.threadId`
loses `.references(...)`'s nullability by gaining `.notNull()`; `messages` loses `legacyItemId`; the
`items` table declaration and its `Item`/`NewItem` types are deleted; `changes_kind_ck` and the two
`agent_work_intents` checks are respelled.

**`tools/governance/table-owners.json`** — four edits, and one of them is a number:
`"threads": "thread"`, `"messages": "thread"` (from `"conversation"`), delete the `"items"` row, and
`totals.tables` / `totals.owned` go **34 → 33**. `validateTableOwners` throws when
`registry.totals.tables !== liveTables.size` (`tools/governance/src/lib/governance-registry.ts:165-169`),
so dropping the table without the totals fails the whole lint run with a registry error rather than a
finding.

**`ATTACK_ANCHORS`** (`tools/governance/src/lib/governance-attacks.ts:119-122`) points `serviceDir` /
`serviceBarrel` at `layers/core-api/task/src`; unaffected. But any attack case whose `mutate` path is
`layers/core-api/src/routes/threads.ts` breaks when that file is deleted — the harness asserts a
mutated path exists. BC2 added exactly one such control (`actions-projected-legacy-route-control`);
re-point it at a file that survives, e.g. `layers/core-api/src/routes/knowledge.ts`.

## 5. Every deleted symbol, and who reaches it

Derived by `rg` over the worktree at `50cb93785`, not from `facts.md`. Each block names its step in §8.

### B1 — the five route files (step 7)

`routes/threads.ts` (1,619) · `routes/threads-schema.ts` (324) · `routes/conversations.ts` (167) ·
`routes/assistant.ts` (234) · `routes/reviews.ts` (142). Their mounts: `app.ts:405` (`/reviews`),
`:414` (`/conversations`), `:415-424` (`/threads`). `routes/recipients.ts` and its `app.ts:428` mount
**stay** (`plan.md:124`).

Importers outside the files themselves:

| Reaches | File | Becomes |
|---|---|---|
| `messageInputSchema`, `threadParticipantsSchema`, `plainPayloadSchemaWithToolCalls`, `entityRefSchema`, `inlineRefSchema`, `mentionRefSchema`, `assistantNoticeSchema` | `routes/threads-schema.ts` | moved into `framework/domain-model/src/actions/thread.ts`; `notice` drops off the write side (R9) |
| `createThreadRoutes` | `app.ts:415` | deleted with the mount |
| `createAssistantThreadRoute` | `routes/threads.ts:674` | deleted |
| `createReviewRoutes` / `createConversationRoutes` | `app.ts:405,414` | deleted |
| `listThreads`/`listMessages`/`searchConversations` | `routes/search.ts:24,146` | the search route re-points to the thread module's own read functions; the route itself survives as a legacy row |

### B2 — the `conversation` package (step 3)

`layers/core-api/conversation/` — `conversation-store.ts` (392) + `assistant-turn-resolver.ts` (164)
+ `session-not-returned-notice.ts` (86) + `index.ts` (70) = 712 lines. Replaced by
`layers/core-api/thread/`. Every function survives somewhere; nothing is dropped silently.

| Export | Importers outside the package | Where it goes |
|---|---|---|
| `findThread` · `listThreads` · `findMessage` · `listMessages` · `insertThread` · `insertMessage` · `updateThread` · `resolveMessageIfUnresolved` · `findOrCreateDirectThread` · `searchConversations` | `routes/threads.ts`, `routes/reviews.ts`, `routes/search.ts:24`, `routes/conversations.ts`, `services/calling-thread-bindings.ts:35`, `services/policy-bindings.ts:12`, `services/assistant-turn-coherence-trigger.ts:49`, `service-bootstrap.ts:190-212`, `ws-subscribe-authorizer.ts` (via its `deps.conversation`), `routine-scheduler-bindings.ts` | private to `layers/core-api/thread/src/thread-service.ts`. The three surviving outside readers (`search.ts`, the ws authorizer, the routine scheduler binding) get typed read functions from the new module's barrel, exactly as they get them from `conversation`'s barrel today |
| `resolveAssistantTurnRequest`, `AssistantTurnResolverDeps`, `BakedAssistantTurnRequest` | `routes/threads.ts:22`, `assistant-turn-coherence-trigger.ts:49` | generalised to `resolveThreadTurnRequest` — B5 |
| `registerSessionNotReturnedNotice`, `SESSION_NOT_RETURNED_NOTICE_TEXT` | `service-bootstrap.ts:17,361` | moves to `layers/core-api/src/services/session-not-returned-notice.ts` and posts through `send_message.run` instead of a raw `insertMessage` |

`@hyperidle/conversation` disappears from every `package.json` that names it; `@hyperidle/thread`
replaces it. `rg -l "@hyperidle/conversation"` is the list.

### B3 — `calling-thread-bindings.ts` (step 4)

`resolveOrCreateCallingThread` (`layers/core-api/src/services/calling-thread-bindings.ts:74`) resolves
the `(task, taskId)` host thread and **creates one** if absent. Its only consumer is
`services/task-run-resolver-bindings.ts:38`, feeding `TaskRunResolverDeps.resolveOrCreateCallingThread`
(`layers/core-api/task/src/task-run-resolver.ts:91`), used at `:238` and `:301`.

**Delete the file and the dep.** `task-run-resolver.ts` already holds the loaded `task` row at both
sites; `callingThreadId` becomes `task.threadId`, now NOT NULL, so the `?:` optionality at `:133`,
`:251` and `:316` collapses to a required field. That is the whole of "sessions talk in the task's
thread" (`plan.md:53`) — no lookup, no create, one column read.

**A handed-off owner is not seeded into that thread and does not need to be.** The thread's members
stay whoever §3.9 seeded at creation plus whoever has spoken since. Because it is `team`-hosted it is
host-scoped, so the new owner may post, and its first `send_message` joins it (§3.4). No handoff-time
membership write is added anywhere — `edit_task` touches `tasks`, never `threads`, on an owner change.

### B4 — the four tools and the seam they ride (step 5)

`send_message` (`tool-definitions.ts:52-85`) · `reply` (`:118-160`) · `create_item` (`:286-36x`) ·
`submit_review` (`:465-560`). All four are deleted from `buildToolDefinitions`. `send_message`
reappears as an action; the other three do not reappear at all.

What each carried, and where it lands:

| Carried | Lands |
|---|---|
| `send_message`'s recipient-exists check and `subject\n\n body` concatenation | `recipient_not_found` invariant; the agent writes one `text` |
| `reply`'s no-thread rule and `NO_REPLY_RECIPIENT` | §3.6 step 2c/2d, `no_reply_recipient` |
| `create_item`'s thread-create, review-recipient resolution and participant mutation | **gone.** Items are gone; a review is a `send_message` with `review` |
| `submit_review`'s produced-item-parented check (`:487-500`) | `produced_item_not_owned` (§3.4) |
| `submit_review`'s `linkReviewToSession` (`:537`) | `ThreadActionsDeps.linkReviewToSession`, §3.6 step 6b |
| `submit_review`'s task-thread resolve-or-create seeded with review recipients (`:430-463`) | **gone.** The task already has a thread (§3.9) and the review goes in it. Seeding reviewers is not needed either: that thread is `team`-hosted, so any human can read the review and post the verdict, joining on that post (§3.4). `resolveReviewRecipients` itself survives in `layers/core-api/org/src/org-routing.ts:26`; only its seam wrapper and route die |
| `submit_review`'s `rootTaskId` parent-chain walk (`:543-553`) | **gone** with the tool. Nothing consumes the returned `rootTaskId` — `rg 'rootTaskId'` finds only this tool and its own tests |

Seam methods with zero remaining callers once those four are gone — verified by
`rg 'coreApi\.(getThreadById|insertThread|updateThread|insertMessage|findOrCreateDirectThread|getFirstThreadByHost|getItemById|updateItemById|createItem|resolveReviewRecipientsForItem)'`,
which returns only `tool-definitions.ts` lines:

- the whole `conversation` block on `CoreApiPort` — `getThreadById`, `insertThread`, `updateThread`,
  `insertMessage`, `findOrCreateDirectThread`, `getFirstThreadByHost`
  (`core-api-port-composition.ts:427-467`, `framework/api-contract/src/core-api-port.ts`,
  `tool-handlers/src/ports.ts`, `tool-handlers-bindings.ts:131-150`);
- `work.getItemById` / `work.updateItemById` / `work.createItem` (`core-api-port-composition.ts:390-406`);
- **`users.findSoleHumanUser`** — `reply` (`tool-definitions.ts:134`) is its only production caller, so
  it dies too. Its five other sites go with it: `framework/api-contract/src/core-api-port.ts:123`,
  `core-api-port-composition.ts:421-424`, `tool-handlers-bindings.ts:141`,
  `tool-handlers/src/ports.ts:204`, `tool-handlers/src/__tests__/stub-ports.ts:22`. The `kind=human`
  filter it dialled (`GET /users?kind=human`) **stays** — `routes/users.ts` survives this item — only
  its comment at `:178` naming `reply` is corrected. The replacement for the behaviour is
  `deps.users.soleHumanForAgent`, read in-process, team-scoped, never over the seam (§3.3);
- `org.resolveReviewRecipientsForItem` (`:492-506`), its `ReviewRecipientsQuery` type
  (`core-api-port.ts:247-252`), its binding (`tool-handlers-bindings.ts:165`) **and its route
  `GET /org/review-recipients` (`routes/org.ts:190`)** — the route exists only for the two deleted
  tools.

`ports.gate.linkReviewToSession` (`tool-handlers/src/ports.ts:401`) and `buildGateAccessor`
(`run-orchestration-composition.ts:352`) invert: today core→orchestration is dialled by a tool; after
this item core calls it directly through `AgentOrchestrationPort`. One new port operation,
`gate.linkReview(sessionId, reviewMessageId)`, alongside the `POST /agent-orchestration/review-verdicts`
route the verdict half already uses. `unusableGateAccessor` and
`layers/agent-orchestration/src/__testing__/review-accessor.ts` go with the tool-side accessor.

### B5 — `assistant_turn` becomes `thread_turn` (step 4)

`resolveAssistantTurnRequest(db, messageId, deps)` derives its target agent as `ast-${message.senderId}`
(`conversation/src/assistant-turn-resolver.ts:112-114, 129`). That single line is the assistant special
case in the wake path. It becomes:

```ts
export async function resolveThreadTurnRequest(
  db: HyperIdleDb, messageId: string, agentId: string, deps: ThreadTurnResolverDeps,
): Promise<BakedThreadTurnRequest>
```

Everything else in that function is already general and is kept verbatim: the transcript bake, the
`callingThreadId`, `requireRunnableAgent`, `getAgentIdentity`, `readServerConfig`,
`bakeAgentRunnableConfig`. `BakedAssistantTurnRequest.sourceCorrelation.assistantAgentId` is renamed
to `agentId`, which means `assistantSessionRequestInputSchema`
(`framework/domain-model/src/session-request.ts:67-77`) respells that one field.
`AGENT_SESSION_SOURCE_KINDS` and `AGENT_SESSION_PROMPT_MODES` are **not** touched: a thread turn is
still `sourceKind:"assistant"`, `promptMode:"conversation"`, because those name what the session
*is* (a conversation turn with a transcript and no task), not who it belongs to, and renaming them
would drag in the `agent_session_requests` check constraint for no behavioural gain.

Every site that names the intent kind or the `ast-` convention, and what happens to it:

There are **seven** value-level sites, not four; three of them are typed unions a builder only finds by
compiling. The full list:

| Site | Today | After |
|---|---|---|
| `framework/event-bus/src/events.ts:26-32` | `AGENT_WORK_INTENT_KINDS` — the raw-column vocabulary, five members, no `session_resume` | `"thread_turn"` replaces `"assistant_turn"` |
| `framework/domain-model/src/work-intent.ts:663-671` | a **second** `AGENT_WORK_INTENT_KINDS`, six members — the recorder input's own list, deliberately differently scoped (its own `@lore` at `:658-662` says so) | same replacement; both lists are edited |
| `framework/domain-model/src/work-intent.ts:586-595` | `AgentWorkIntentRecorderInput`'s first union arm, `kind: "assistant_turn"` — **the discriminant `ThreadActionsDeps.agentWorkIntentRecorder` is typed against** | `kind: "thread_turn"` |
| `layers/agent-orchestration/session-requests/src/service.ts:1074-1090` | `WorkIntentInput`'s `kind` union | `"thread_turn"` |
| `framework/api-contract/src/agent-orchestration-port.ts:87` | `AgentOrchestrationWorkIntentKind`'s union member | `"thread_turn"` |
| `layers/agent-orchestration/src/routes/agent-orchestration-intake.ts:52` | the intake zod enum | `"thread_turn"` |
| `layers/core-api/src/services/agent-run-admission-reactions.ts:102` | `case "assistant_turn":` — informational, no mutation | `case "thread_turn":`, body unchanged |
| `framework/db` check constraints | `0078`'s three | respelled in `0085` step 8 |

The two `AGENT_WORK_INTENT_KINDS` lists are not a duplicate to collapse in this item: `event-bus`'s is
the raw `agent_work_intents.kind` column vocabulary and `domain-model`'s is the recorder input's, which
adds `session_resume`. There is a drift test that derives the DB accept-list from the `event-bus` one
(`framework/event-bus/src/events.ts:18-25`'s own `@lore`); it must go green with the new name, and if it
does not, that is the list that was missed.
| `layers/core-api/src/services/assistant-turn-coherence-trigger.ts` (127) | re-bakes pending same-thread intents | **deleted** with its `service-bootstrap.ts:40,347` registration and its `__testing__/test-fixtures.ts:20,157` wiring |
| `layers/core-api/src/services/assistant-thread-pin-reaction.ts` (64) | pins the assistant thread on the first AI reply | **deleted**, `service-bootstrap.ts:39,334` |
| `routes/threads.ts:1368-1371` `recordsAssistantIntent`, `:396-404` `isAssistantThread`, `:492`, `:508`, `:630` | the structural `ast-<userId>` recognition | **deleted** — the wake rule replaces all of it |
| `routes/assistant.ts:124-127,199` | `ast-${userId}` / `thr-ast-${userId}` | deleted with the file |
| `routes/teams-routes.ts:333-334` | seeds a welcome message into the literal thread id `thr-ast-${userId}` | rewritten as one `send_message.run(ctx, { recipients: [assistantId], text })` as the user; the assistant-stub upsert around it (`:340-380`) stays — it is agent provisioning, not thread code |
| `framework/domain-model/src/team.ts:166` | prose naming `thr-ast-{userId}` | comment corrected |
| `layers/core-api/org/src/resolve-scaffold-specs.ts:79` | `idHint: ast-${ownerUserId}` — where the id is **created** | **unchanged.** `users.ownerUserId` already carries the ownership (`schema.ts:84-92`, backfilled from `ast-%` by `0059_BA1_agent_belonging.sql:10-13`), so the prefix is now only a readable id. Nothing reads it structurally once the thread code stops. |
| `layers/core-api/src/routes/users.ts:145` | `agentIds[0] ?? ast-${id}` fallback on the `user_created` payload | unchanged, same reason |
| `layers/core-ui/src/settings/AgentEditor.tsx:177` | `agentId.startsWith("ast-")` to disable the role field | unchanged — a UI affordance, not a rule |
| `layers/core-ui/src/shell/AssistantOverlay.tsx:355` | `!lastMessage.senderId.startsWith("ast-")` decides "the last message is human", which drives the thinking indicator and the retry card (`:356-360`) | **rewritten.** The overlay knows its counterpart — it opened a direct thread with one specific agent — so the test becomes `lastMessage.senderId !== myAgentId`, an identity comparison against the id the overlay already holds (§5 B6). Left as a prefix check it reads an ordinary owned agent's reply as the human's own and shows "thinking…" forever |
| `layers/core-ui/src/settings/SettingsAgents.tsx:449` | `agent.id.startsWith("ast-")` suppresses the delete affordance | **rewritten** to `agent.ownerUserId !== null`, the fact the row already carries (`users.ownerUserId`, `framework/db/src/schema.ts:84-92`). Same behaviour — you cannot delete a person's own agent — expressed by the column that means it rather than by a prefix that merely correlates |

Those two are the only production `ast-` **behaviour** left after the thread code stops. Both are
rewritten rather than deleted: the behaviour each produces is right, only the way it recognises the
agent is wrong. `resolve-scaffold-specs.ts:79`'s `idHint` and `users.ts:145`'s fallback keep the prefix,
which after this item is a readable id and nothing more.

That table is the answer to "what, if anything, must change where the id is created": **nothing.**

### B6 — the assistant route and overlay (steps 4, 6)

`routes/assistant.ts` (234) creates a thread on a `GET` (`:203`). Deleted whole; `open_thread` never
writes. `hooks/useAssistantThread.ts` (191) is deleted. `shell/AssistantOverlay.tsx` (544) **stays as
a screen** and changes exactly three things: it resolves its thread with
`call("send_message", { recipients: [myAgentId], text })` on the first send rather than reading
`/api/threads/assistant`; it reads with `call("open_thread", { id })`; and it posts with
`call("send_message", { threadId, text })` instead of its direct `apiFetch` at `:285`. "My agent" is
`users` where `ownerUserId = me` — one `GET /api/users?…` the overlay already has a door for via
`useCurrentUser`/`useAgents`. `contexts/AssistantContext.tsx` follows the overlay.

The overlay before its first send has no thread. That is the create-on-first-send the plan asks for
(`plan.md:67-68`), and it is why the empty state must render without a thread id.

### B7 — items, the policy engine, and the notification listener (steps 2, 5)

| Symbol | Every production reader/writer | Step |
|---|---|---|
| `items` table | `task-service.ts`'s `"item"` arm of `WorkEntity` (`:238-244, 264-269, 340, 381, 466, 754, 781, 813`) and its `marker`/`bodyMarker` filters (`:318, 487-494`), `routes/conversations.ts` (4 sites), `policy-engine.ts:57,105,169,187`, **`knowledge/src/review-item-factory.ts:100-114` (B7b)**, `notifications/install.ts:265-301`, `notifications/ports.ts:62-63,101`, `routine-scheduler.ts:479-521`, `routine-scheduler-bindings.ts:69-75`, `agent-run-admission-reactions.ts:55-68`, `policy-bindings.ts:19-22`, `service-bootstrap.ts:151,177-181`, `app.ts`'s `work.getItemById` | dropped; `WorkEntity` collapses to `"task"`, and every generic `<E extends "task" \| "item">` signature in `task-service.ts` loses its union |
| `RoutineDeps`' four item/thread ports — `work.createItem`, `work.findRetroItemByThreadIds`, `conversation.getThreadIdsByHost`, `conversation.insertThread` (`layers/core-api/routine/src/ports.ts:66-75`) | **nothing in `layers/core-api/routine/src` calls any of them** — `rg` finds only the two completeness fixtures that stub them. The post-bet-retro path that used them is already gone | deleted with their bindings (`routine-scheduler-bindings.ts:69-80`) and their two test stubs |
| `messages.legacyItemId` | `policy-engine.ts:169`, `approval-rate.ts:26,50-55`, `policy-bindings.ts:31-33`, `service-bootstrap.ts:211`, `policy/ports.ts:62`, the `noLegacyItem`/`legacyItemIds` filters in `conversation-store.ts` | dropped; R4 |
| `policy-engine.ts` (206) | registered only via `register-policy.ts:19` ← `service-bootstrap.ts:374` | deleted; R2 |
| `item_created` event | **two** production emitters — `routes/conversations.ts:158` and `review-item-factory.ts:116` (B7b) — consumed by `policy-engine.ts:26-48` and matched by `routine-scheduler.ts:481` | deleted from `EVENT_TYPES` and from `LEGACY_EVENTS` |
| routine subject `kind:"item"` | the union arm at `framework/domain-model/src/work-intent.ts:432-442`, built at `routine-scheduler.ts:483-497,521`, consumed at `run-orchestration/src/context.ts` | **deleted, not rewired.** Its only trigger was `item_created`. A routine that wants to hear about a message already gets the `kind:"thread"` subject (`work-intent.ts:403-414`, built at `routine-scheduler.ts:459-476`), which stays |
| notification classification of items | `classifyListenerItem` / `buildSourceLink` / `NotificationsWorkReader` / `registerNotificationListener` (`notifications/install.ts:244-356`) | **deleted.** `rg 'type: "notification"'` finds two production emitters: `policy-engine.ts:192` (deleted) and `dependency-watcher.ts:83,155`, whose `kind:"auto_unblock"` the listener returns early on (`install.ts:295`). With the engine gone the listener can never enqueue a row. The `notification` event type and the two `auto_unblock` emits stay; the listener does not |

Everything a human needs from that machinery is a BC5 subscription (`plan.md:74-75`).

### B7b — the second `items` writer: the stalled-knowledge-action review (step 5)

`layers/core-api/knowledge/src/review-item-factory.ts` is a **second** production writer of `items` and
a **second** emitter of `item_created`, and neither is in B7's tables above. It is live:
`reactToAdmissionFailure`'s `knowledge_action` arm
(`layers/core-api/src/services/agent-run-admission-reactions.ts:98-100`) calls
`flagStalledKnowledgeAction` (`:49-68`), which builds `createReviewItem` and, per invocation, inserts a
`threads` row (`review-item-factory.ts:79-88`), an `items` row (`:100-114`) and emits `item_created`
(`:116-125`). Dropping `items` breaks compilation in `@hyperidle/knowledge`, a package §2 lists as
untouched, and silently deletes a behaviour — "a knowledge action that could not be admitted gets
flagged for a human" — that `plan.md:71-75` never asked to remove.

**It keeps its behaviour and loses the table.** Same trigger, same moment, same thread; the row it
writes becomes a message:

```ts
// agent-run-admission-reactions.ts, the knowledge_action arm
const threadId = await resolveKnowledgeThread(knowledgeItemId);   // search_threads({host}) → adjust_thread
await sendMessage(
  { actor: "system:propagation", db, eventBus, now },
  { threadId,
    clientKey: `knowledge-stall:${event.intentId}`,               // the idempotency, see below
    review: { title: "Agent work stalled: knowledge action",
              reasoning: [`Knowledge item ${knowledgeItemId} could not be admitted for agent work (${event.failureCode}).`] } },
);
```

Four things this pins, each because the naive translation gets it wrong:

- **The thread is the knowledge item's, not a task's.** The trigger's source id is `knowledge:<itemId>`
  (`agent-run-admission-reactions.ts:44-46`) and there is no task anywhere in that path. The factory
  already hosts its thread on `knowledge_item` (`review-item-factory.ts:81-82`); that host survives
  `HOST_KINDS`' shortening, so the thread is resolved with
  `search_threads({ host: { kind: "knowledge_item", id } })` and created with `adjust_thread` when
  absent — instead of the factory's unconditional `insertThread`, which made a **new** thread on every
  single admission failure.
- **`system:propagation` can post into a thread it did not create.** That is the point of resolving the
  thread instead of making a new one per failure, and it works because a `knowledge_item` host is
  host-scoped: it may post, and its first post joins it (§3.4). From the second failure onward it is
  already a member.
- **The actor is `system:propagation`, not `"attention_engine"`.** The factory writes
  `initiatorId: ATTENTION_REVIEW_SOURCE` and `participants: ["attention_engine"]`
  (`:83-84`) — a synthetic identity with no `users` row, the same defect that kills the policy engine's
  `"policy_engine"` sender. `changes.actor`'s FK (`schema.ts:574-576`) would reject it outright.
  `system:propagation` is a real seeded row (`bootstrap/factory-state.ts:36-41`) and is the actor BC2
  already uses for every reaction of this class.
- **Idempotency moves from a LIKE probe to the `clientKey` that already exists.**
  `attentionReviewReasoningMarker` (`review-item-factory.ts:26`) exists so a caller can ask "did I
  already flag this?" with `like(items.reasoning, '%…%')` (`task-service.ts:488`). `send_message`'s
  create-only unique `(threadId, senderId, clientKey)` answers the same question with an index. The
  marker function, its barrel export (`knowledge/src/index.ts:90`) and the `marker`/`bodyMarker` arms of
  `WorkFilter` (`task-service.ts:318, 487-494`) are all deleted.
- **`riskTier`, `verb`, `kind`, `blocking` have no successor and need none.** Their only reader was
  `classifyListenerItem` (§5 B7), which is deleted; the review message carries its title and reasoning,
  which is what a human reads.

Everything else that falls out, so the compile is not a surprise: `createReviewItem`,
`CreateReviewItemInput`, `CreateReviewItemResult`, `CreateReviewItemDeps` and the whole file are
deleted; both barrel exports go (`layers/core-api/knowledge/src/index.ts:89-90`);
`agent-run-admission-reactions.ts:33`'s `import { insertThread } from "@hyperidle/conversation"` —
**missing from B2's importer table, added here** — goes with the arm that used it; and
`agent-run-admission-failed-subscribers.integration.test.ts:57,379` re-points from the marker to the
message.

That leaves **exactly two** production emitters of `item_created` at this base — `routes/conversations.ts:158`
and `review-item-factory.ts:116` — and both are deleted, which is what makes B10's `LEGACY_EVENTS` row
removal honest.

### B8 — the websocket push plumbing (step 6)

`pushUpdate` (`threads.ts:98-105`) and its nine call sites (`:936, :1057, :1181, :1230, :1236, :1574,
:1584, :1591, :1596`), `buildThreadListRowForPush` (`:124-146`), `buildSenderIdentityForPush`
(`:154-160`). `WsPushTarget`, `app.ts`'s `options.wsHub` threading, `ws-connection-hub.ts` and
`ws-subscribe-authorizer.ts` all **stay** — §3.12. The authorizer's `deps.conversation.getThreadById`
re-points to the thread module's read.

### B9 — the UI (step 6)

| Deleted | Lines | Callers, and what each becomes |
|---|---|---|
| `hooks/useThreadDetail.ts` | 248 | `pages/Conversations.tsx:296`, `pages/review/ReviewPage.tsx:119` → a `useThread(id)` hook over `call("open_thread")` + the `thread:<id>` subscription |
| `hooks/useAssistantThread.ts` | 191 | `shell/AssistantOverlay.tsx:260` → B6 |
| `hooks/useConversationsThreads.ts` | 270 | `layouts/AppShell.tsx:493` (the sidebar badge) → `call("search_threads", {mine:true})` + the `conversations` subscription |
| `hooks/useHostThread.ts` | 108 | `shell/HostThreadSection.tsx:145`, `pages/KnowledgeDetail.tsx:699` → `call("open_thread", { id })`. **The task page's id comes from `open_task().threadId`; the knowledge page's from `call("search_threads", { host: { kind:"knowledge_item", id } })`** |
| `services/host-threads.ts` | 151 | `HostThreadSection.tsx:181,187`, `ReviewPage.tsx:151,184` → `call("send_message", …)`; `resolveOrCreateHostThread` has no replacement for a task (the task owns its thread) and becomes `search_threads({host})` → `adjust_thread({host})` **only when none exists** for a knowledge item. Posting needs no membership step: a `knowledge_item` thread is host-scoped, so any signed-in visitor may post and joins by posting (§3.4) — which is the reach `KnowledgeDetail.tsx:699` has today |
| direct `apiFetch` posts | — | `Conversations.tsx:351`, `AssistantOverlay.tsx:285`, `RecipientPicker.tsx:85` (`POST /api/threads` to start a thread → `call("send_message", { recipients })`) |
| `GET /api/reviews/:id` fetch | — | `ReviewPage.tsx:32` → `call("open_thread", { id })` for the messages + `call("open_task", { id })` for the task, parent title and prompt. The page composes the fields `routes/reviews.ts:107-139` composes today |

`pages/RedirectLegacyConversation.tsx`, `hooks/useRecipients.ts`, `components/RecipientPicker.tsx`'s
recipient list, `PartList`/`ConversationSurface`/`ThreadSections` are render-only or recipient-only
and are **not** touched beyond the one `POST /api/threads` above.

`core-ui` already depends on `zod` and `@hyperidle/domain-model` (BC2 added the manifest row); no
`deps:check` edit.

### B10 — the governance shrink lists (step 7)

`tools/governance/src/rules/actions-projected.ts`. Eleven `LEGACY_ROUTES` rows, four `LEGACY_TOOLS`
rows, one `LEGACY_EVENTS` row. The rule stays at `error`, stays green, gains no clause and no
per-file exemption; a row for a route that no longer exists is itself a finding, which is what forces
the deletion and the row into the same PR.

`LEGACY_ROUTES` — delete `assistant.ts|GET /` (:156); `conversations.ts|GET /items/:id`,
`|PATCH /items/:id`, `|POST /items` (:157-159); `org.ts|GET /review-recipients` (:186);
`reviews.ts|GET /:reviewMessageId` (:198); all six `threads.ts` rows (:213-218). **Keep**
`recipients.ts|GET /` (:197), `search.ts|GET /` and `ws.ts|GET /ws`.

`LEGACY_TOOLS` — delete `create_item`, `reply`, `send_message`, `submit_review`. `send_message` leaves
the list because the population clause 3 scans is hand-written `ToolDefinition` **literals**; an
action-projected tool never appears in it.

`LEGACY_EVENTS` — delete `item_created`. `thread_created`, `thread_message_appended`,
`thread_resolved`, `thread_reopened` **stay** — they are still emitted, from the change row, until
BC5 (`plan.md:80`).

### B11 — the return set (step 4)

`RETURN_ACTION_NAMES` (`framework/harness-protocol/src/harness/return-actions.ts:47`) names two tools
that cease to exist. It becomes `["edit_task", "send_message"]`. Consequences, all in the same file
unless named:

- `RETURN_ACTION_HINTS` loses its `submit_review` and `reply` entries.
- `FORCE_RETURN_MESSAGE` (`:141-144`) is rewritten to name only the two survivors — it names
  `submit_review` today, which after this item is a tool an agent cannot call.
- `provisioner.ts:568` — `literalToolNamerForAdapterType(adapterType)("reply")` → `("send_message")`,
  and the orientation sentence with it.
- `provisioner.ts:1566` — `["reply"]` → `["send_message"]`. **A thread turn's required set stays a
  single member**, and `send_message` is the only way it ends: creating a task with `edit_task` does not
  satisfy it and is not meant to (§9's gate chain, step 6). The agent creates the task and then says so.
- `provisioner.ts:1588` — `isReturnAction(toolName, args)` inside the MCP bridge's `onToolCall` is
  called with neither `args.id` nor a `taskId`, so it has never been able to observe an `edit_task`
  return. Pre-existing, unchanged by this item, and named so it is not read as new: the gate that
  actually verdicts is `createGate(requiredReturnActions, taskId)`
  (`layers/agent-execution/harness-registry/src/return-enforcement.ts:42-57`), which receives both.
- `isReturnAction`'s `edit_task` arm is **unchanged** — R1. Its `!taskId` early return
  (`:106`) is what makes a thread turn's `edit_task` non-terminal, and a regression test pins it.
- `return-actions.closure.test.ts`'s exception list grows from `edit_task` to both action-projected
  names, and its "exactly the four members" assertion becomes two.

### B12 — seeds and evals that name a deleted thing (step 7)

- `tools/setup/src/demo-world/conversations.ts` seeds nine `hostKind: "task"` threads
  (`:94,102,110,118,152,160,168,200`) and writes `tasks.threadId` directly. Re-point: each seeded task
  thread becomes `hostKind: "team"` with the task's team, and `tasks.threadId` keeps pointing at it —
  the same shape §4 step 3/7 produces for a real database. `THREAD_ASSISTANT` (`:231`) becomes an
  ordinary direct thread between `DEMO_FOUNDER` and `ASSISTANT_ID`.
- `tools/eval/src/scenarios/` — `create-item.ts`, `send-message.ts`, `submit-review.ts` and
  `read-inbox.ts` grade tools that no longer exist. `send-message.ts` re-points to the action.
  `create-item.ts` and `submit-review.ts`'s subject becomes `send_message` with a `review`.
  `read-inbox.ts` already names a tool the destroyer pass deleted and should be checked against
  `main` before being touched. `force-return.ts` and `tool-authorization.ts` name `reply` and must
  follow B11. Evals are not tests and are not a gate here (`.claude/rules/testing.md`); they are named
  so they are not left silently red.

### B13 — the access boundary, and the guard that guarded it (step 7)

`rg 'authorizeRead|authorizeWrite|canRead|canWrite|HOST_SCOPE'` finds exactly one production caller:
`routes/threads.ts:65, 857, 1295`. Deleting that file leaves `layers/core-api/src/auth/authorize.ts`
and `layers/core-api/src/auth/access-boundary.ts` with no production reader at all — only their own
`auth/__tests__/access-boundary.test.ts`. Test-only reachable code is dead code. **Both files and that
test are deleted**, and `HOST_SCOPE`'s `task: "host"` entry goes with them rather than being edited to
match the shortened `HOST_KINDS`.

**Both halves have named successors and the deletion is not allowed to land without them.**
`canReadThread` is `canRead` + `HOST_SCOPE` moved into `actions/thread.ts` with `task` dropped and
nothing else changed; `canWriteThread` is `canWrite`, still delegating to the read predicate exactly as
`access-boundary.ts:76-77` does (§3.4). Neither is stronger or weaker than what it replaces — the one
behavioural addition is the join, which grants no read the actor did not already have. Delete
`access-boundary.ts` in the same commit that adds the two predicates, not before; the ordering is what
stops a window where reads or posts are unguarded.

That has a consequence a builder must not walk past. Two ESLint rules key on those names:

- `authz/no-header-identity-in-authz` (`tools/eslint-plugin-authz/src/rules/no-header-identity-in-authz.ts:19`)
  fires only on a call to one of the four. After this item its sink set is empty — a guard that
  matches zero sites reads as passing forever, which is the failure mode `CLAUDE.md` names outright.
  **Delete the rule, its file and its `eslint.config.ts:483` registration** along with the functions it
  guarded. Its property — "the actor never comes from a header" — is now structural: the actions
  router reads `c.get("userId")` and nothing else, and there is no other door.
- `authz/no-raw-db-in-route-bypassing-policy` fires only on a route marked
  `requireBoundary({kind:"enforced"})`, **which was already deleted before this item**: the config's
  own comment says so (`eslint.config.ts:462-464`, "the no-raw-db rule becomes a no-op until it is
  rekeyed"). It is a pre-existing dead guard, not one BC3 creates, and re-keying it is not this
  item's work. Named here so the next reviewer does not mistake it for collateral damage.

## 6. Security — reasoned from the surfaces this change reaches

Seven surfaces move. Nothing else is touched: no credential, sandbox, outbound request, plugin install
or artifact rendering path is in this change.

1. **`POST /api/actions/*`** — behind the existing auth middleware; the actor is `c.get("userId")`
   from the middleware only (`middleware/auth.ts:142-149`), never a body field, never `X-Identity`.
   That is the AF11 IDOR fix (`routes/threads.ts:1272-1276`) preserved by construction: the router
   does not read an actor from anywhere else, so there is no second path to close.
2. **MCP `send_message` / `adjust_thread`** — actor is `ToolContext.agentId`, the session's own
   identity, which is what `tool-handlers-bindings.ts:146-150` passes as the seam actor today. The new
   `ctx.caller` bag is filled from the same `ToolContext` and is never read for authorization — only
   for the reply fallback, the review link and the produced-item check. An agent cannot put a session
   id in its arguments and reach another session's review link, because the argument does not exist.
3. **Who may read and who may post: one predicate, `HOST_SCOPE` moved.** §3.4. `user`- and
   `agent`-hosted threads — every DM, every thread with someone's own agent — are members-only for
   reading, posting **and** adjusting, which is `HOST_SCOPE`'s participant scope
   (`access-boundary.ts:33-34`) moved into the actions. `team`/`knowledge_item`/`factory` stay readable
   and postable by any signed-in principal, which is `HOST_SCOPE`'s host scope (`:35-38`) and
   `canWrite`'s delegation to `canRead` (`:76-77`) moved unchanged. **Neither half is a tightening and
   neither is a loosening** — it is the same predicate, at the same reach, expressed once instead of
   behind a route. `task` leaves the vocabulary; a task's thread is `team`-hosted, so it keeps exactly
   the reach it has today.
4. **The reads apply it on every path, so nothing enumerates.** `open_thread` per thread,
   `search_threads` per row on **every** arm — so neither `ids` nor `host:{kind:"user"}` lists a
   stranger's DMs, which is the hole `GET /threads`' foreign-`participant_id` refusal
   (`threads.ts:758`) plugs today and which would otherwise have been reopened by an action with no
   route around it. A thread the actor may not read answers `not_found`, the same answer a deleted one
   and a nonexistent one give, so no action is an existence oracle.
   The websocket's participant gate (`ws-subscribe-authorizer.ts:95-100`) is unchanged and is the
   reference for the `user`/`agent` case: the action is no looser. For a host-scoped thread the action
   is looser than the socket until the first post, which is **today's** asymmetry
   (`GET /threads/:id` already serves a `team`-hosted thread to any principal while the socket refuses
   the subscription) and is not introduced here.
5. **Posting to a shared thread joins you to it, and that is the only way to join one.** No input
   requests it, `adjust_thread` does not grant it, and it cannot happen on a DM — a `user`/`agent`
   thread refuses a non-member before any write. What it changes in practice: the member list of a
   team or knowledge thread grows to whoever actually spoke there, which is what makes a handoff, a
   third-party verdict and a knowledge-page comment work at all (§3.4's table) and what the mention
   path already did for anyone pulled in by name. It grants no read the actor did not already have —
   they could read the thread before they posted.
6. **Verdict.** Human (`users.kind`), not the review's author, and the review must live in this
   thread. Same three conditions as today, with the role string replaced by the identity fact (R6),
   and the first-verdict-wins CAS (`resolveMessageIfUnresolved`) kept — it is what stops two humans
   double-resolving one review.
7. **The `conversations` websocket topic** is global (`ws-subscribe-authorizer.ts:83`). After this
   item it carries a `changes` row rather than a composed list row, so it exposes `actor`, `objectId`
   and the changed **thread** fields to every authenticated identity. No message body and no member
   list beyond what a thread `changed` row names ever rides it, and `thread:<id>` stays
   participant-gated in the hub. This is a shared single-organisation backend; every subscriber is an
   authenticated member of it. Accepted; if it ever needs narrowing, the narrowing belongs in BC5
   where subscriptions are the subject.

**Three deliberate non-restrictions**, named so a reviewer sees them as choices:

- **Any member may overwrite any message in a thread** (`plan.md:92`). There is no author check on
  `messageId`. A thread is a room you were let into; the people in it can edit what is on the wall.
  If that turns out to be wrong it will be wrong for a reason someone can point at, which is the bar
  `ETHOS.md` sets.
- **Any signed-in principal may rename, resolve, pin or delete a shared thread.** `adjust_thread`
  follows `canWriteThread`, so on a `team`/`knowledge_item`/`factory` thread there is no restriction at
  all — including soft-delete. `PATCH /threads/:id` is even wider today: it takes **no** check of any
  kind and lets any principal rewrite any thread's participant list, on a DM included
  (`threads.ts:705-731`). So this is a tightening for direct threads and unchanged for shared ones.
  Soft-delete is reversible (`deleted: false`) and every adjust leaves a `thread.changed` row naming its
  actor, which is the accountability this trades for the absence of a role check.
- **A deleted review is still resolvable and a deleted thread still accepts an idempotency lookup.**
  `deletedAt` hides a thread from search and open; it is not a capability revocation. Making it one
  would need a rule nobody has asked for.

No new gate, per `.pipeline/rules/security.md`.

## 7. Failure behaviour that changes

- **A refused send or adjust is `422 { ok:false, problems }` on HTTP and an `err(code, messages)`
  `ToolResult` on the MCP seam**, replacing today's mix of 400 / 403 / 404 / 409 / 422. The five
  codes that carried meaning — `verdict_authorization`, `verdict_race`, `idempotency_conflict`,
  `NO_REPLY_RECIPIENT`, `FORBIDDEN` on a foreign produced item — each become a `Problem` code
  (§3.4). Nothing throws out of an action.
- **A failed bake no longer fails the send.** Today `resolveAssistantTurnRequest` throwing takes the
  whole `POST /threads/:id/messages` down with a 5xx after the message is committed
  (`threads.ts:1438-1451`'s own `@lore` names this). With two agents possibly woken by one message,
  a throw would also lose the second agent's turn. Each wake is now attempted independently; a
  failure is logged and dropped, the message stays, the send returns `ok`. The observable change: a
  message to an unrunnable agent now succeeds silently instead of returning a 5xx the human retried.
  That is the right trade — the message is the user's, the wake is the system's.
- **No coherence re-bake.** `assistant-turn-coherence-trigger.ts` exists because a transcript baked at
  emit goes stale when a second message lands before the drain claims the intent. Deleting it
  (`plan.md:69`) means a thread turn may answer a transcript one message behind. Accepted: the agent
  reads the thread with `open_thread` anyway, which is the whole point of the thread being an action.
- **No auto-approval.** A low-risk review from a high-approval-rate agent used to resolve itself
  (`policy-engine.ts:139-177`). It now waits for a human verdict. That is the plan's decision
  (`plan.md:73-75`) and it is the single largest behavioural change in this item.
- **No notification rows from a review.** §5 B7. "Tell me when a review waits" is a BC5 subscription.
- **A crash between commit and post-commit** loses the nudge, never the record: the message, the
  thread and the `changes` rows are committed; what is skipped is a bus emit, a review link, a resume,
  a wake or a push. Each is named, none is silent. BC5's `listChanges` is the replay.
- **An orphan thread** is possible when `edit_task`'s transaction fails after §3.9 created the thread.
  Visible in `search_threads({mine:true})`, deletable with `adjust_thread`. Accepted by the plan.

## 8. Order of work — one technical task, ordered steps

One PR (`plan.md:100`). Net red expected; size is not a gate. Each step compiles on the one before.

1. **Declarations.** `framework/domain-model/src/actions/thread.ts` — the four declarations, the row
   schemas, the four payload schemas moved from `routes/threads-schema.ts`, the two pure invariant
   functions, `canReadThread`, `agentsToWake`, `THREAD_ACTIONS`. In the **same** step,
   `framework/domain-model/src/thread.ts` is edited rather than duplicated (§3.1): `HOST_KINDS` loses
   `"task"`, the hand-written `Thread`/`Message`/payload interfaces move out, and the barrel keeps every
   existing name. `actions/task.ts` gains `EditTaskInput.threadId`, makes `TaskSchema.threadId` **and**
   `TaskViewSchema.threadId` non-nullable, and `TaskActionsDeps` gains `adjustThread` (§3.9).
   `ActionContext` gains `caller` (§3.2). `Thread.participants` → `Thread.members` and its three
   consumers. Red tests first.
2. **Schema and migration.** `0085_thread_module.sql` + the journal entry + every mirroring edit in
   `framework/db/src/schema.ts` + the four `table-owners.json` edits including the totals. This comes
   before the module because step 3's reads and writes depend on `threads.title`, `threads.deletedAt`,
   `changes.kind = 'message'` and `tasks.thread_id NOT NULL`.
3. **The thread module.** `layers/core-api/thread/` — `createThreadActions`, the four `run`s, the
   moved store (`conversation-store.ts`), the moved title ladder with its new rung 0, the moved
   mention resolver, `resolveThreadTurnRequest` (B5). `layers/core-api/conversation/` deleted;
   `session-not-returned-notice.ts` relocated. Every `@hyperidle/conversation` importer re-pointed.
   The HTTP loop and the seam test (§9). Red, then green.
4. **The seam and the wake.** `compose.ts` builds the thread deps; `actionsAsTools` fills `caller`;
   the four tools and every orphaned seam method deleted (B4); `GET /org/review-recipients` deleted;
   `gate.linkReview` added to `AgentOrchestrationPort`; `assistant_turn` → `thread_turn` at all six
   sites (B5); the coherence trigger and the pin reaction deleted; `calling-thread-bindings.ts`
   deleted and `task-run-resolver.ts` re-pointed at `task.threadId` (B3); the return set and the two
   provisioner literals (B11).
5. **Items and the policy engine.** B7 in full, including `WorkEntity` collapsing to `"task"`,
   `register-policy.ts` (R2), `policy-bindings.ts`'s item half (R3), `approval-rate.ts`'s Path 1 (R4),
   the four dead `RoutineDeps` ports, and the notification listener. **B7b in the same step** — the
   stalled-knowledge-action review becomes a `send_message`, `review-item-factory.ts` is deleted, and
   `@hyperidle/knowledge` loses its two barrel exports. Nothing here compiles until both writers are
   converted, so they are one step, not two.
6. **The UI and the websocket.** B8 and B9: `call.ts`'s type, the four hooks and `host-threads.ts`
   deleted, the six surfaces re-pointed, the new `useThread`/`useThreads` subscription hooks, the
   `pushUpdate` sites replaced by the change-row projection.
7. **Deletion and governance.** The five route files and their mounts (B1); the dead access boundary
   and the dead guard that guarded it (B13); the shrink lists (B10); the attack-case control re-point
   (§4); the seeds and evals (B12); the docs sweep (§10).

Splitting this leaves the old routes and the new actions both alive across a merge — a bridge, which
the house rule forbids. One PR stands.

## 9. Verification

**New seam test** — `layers/core-api/src/__tests__/thread-actions.integration.test.ts`, on the
`{ db, app, eventBus }` fixture, red first. It asserts, at minimum:

- `send_message` with `recipients` creates a thread with sender + recipients as members and writes a
  `thread.created` **and** a `thread.message` row in one transaction, both with the sender as actor;
- a second send with the same `clientKey` returns the same message and writes **no** second row; a
  divergent payload returns `idempotency_conflict`;
- `send_message` with a `messageId` overwrites and writes a `message` row whose `before` carries the
  old payload;
- a non-member send into a `user`-hosted DM returns `not_a_member`; into a `team`-hosted thread it
  succeeds and joins — the two halves of §3.4, asserted together below;
- a verdict from a non-human returns `verdict_not_human`; from the review's own author,
  `verdict_self`; naming a review in another thread, `verdict_foreign_review`; a second concurrent
  verdict, `verdict_race`;
- an `@mention` adds the mentioned user as a member **in the send's transaction** and appends a
  `changed` row;
- **the wake rule**: a mention of an agent records one `thread_turn` intent for that agent; a
  two-member thread with one agent records one for it with no mention; a three-member thread with no
  mention records none; **two mentioned agents produce two dispatches, not two rows** — drain the
  intent queue and assert **two session requests exist**, one per agent. Counting
  `agent_work_intents` rows passes whether or not the supersede bug is present (§3.10) and proves
  nothing; only a drained queue does. A re-send that wakes the same agent again on the same message
  must still supersede;
- an agent calling `send_message` with neither thread nor recipients, with `caller.threadId` set,
  posts to that thread; with no `caller.threadId`, to a direct thread with its team's human; with
  neither and no human, `no_reply_recipient`;
- a `review` with `caller.sessionId` calls `linkReviewToSession` with that session and the new
  message id; a verdict on it calls `reviewVerdictRecorder`; a `not_resumable` outcome posts a
  second plain message **through the action**, so a `changes` row exists for it;
- `adjust_thread` with no id creates a thread with the actor as its only member and host
  `{user, actor}`; `deleted:true` hides the thread from `search_threads` and makes `open_thread`
  return `not_found`; a stored `title` wins over the computed one and `title:null` restores the
  fallback;
- `search_threads({mine})` returns only threads the actor is in and carries `hasUnresolvedReview`
  correctly for a thread with an open review and one with a resolved review;
- **the read/write/join invariant** (§3.4), which is the assertion set a reviewer should look for first
  because it replaces a deleted boundary. Reads: a non-member `open_thread` on a `user`-hosted DM
  returns `not_found`, **byte-identical** to the answer for a deleted thread and for an id that never
  existed; `search_threads({ ids: [<a stranger's DM>] })` returns `[]`;
  `search_threads({ host: { kind: "user", id: <victim> } })` returns `[]`; a non-member **can** open a
  `team`- and a `knowledge_item`-hosted thread; and the same cases through the MCP door as an agent
  actor, since `actionsAsTools` registers every action for every actor. Posts: a non-member
  `send_message` into a `user`-hosted DM returns `not_a_member` and **writes nothing** (assert the
  `messages` and `changes` counts are unchanged); a non-member `send_message` into a `team`-hosted
  thread succeeds **and** leaves the sender in `thread.members` afterwards, with the `thread.message`
  row's `after.members` carrying the new list and **no `thread.changed` row appended** — the row count
  is the assertion that catches a builder re-adding one; a second post by the same sender adds no
  duplicate member. Adjust: a non-member `adjust_thread` on a `team` thread succeeds and does **not**
  add them as a member; on a `user`-hosted DM it returns `not_a_member`;
- **the four paths §3.4's table keeps alive**, one assertion each, because each is a chain the round-1
  shape broke: a **handed-off** agent that was never seeded posts in its task's thread and is a member
  afterwards; a **human who is not on the task** posts a verdict on a review in it and the verdict trio
  — not `not_a_member` — is what decides; a **visitor** posts into a `knowledge_item` thread they did
  not create; and **`system:propagation`** posts a second stalled-knowledge-action review into the
  thread it made on the first (B7b), proving the resolve-don't-recreate path;
- `open_thread` returns members as identities, messages newest-first, `headMessageId` and
  `hostTitle`, and **writes nothing** (assert the `changes` row count is unchanged);
- `edit_task` with no `threadId` creates a task whose `threadId` is a real thread with creator and
  owner as members; with a `threadId`, uses it and adds the owner;
- the four legacy bus names still fire with today's payloads.

**The `caller`-dependent cases have their own door.** `ctx.caller` is filled only by the MCP loop
(§3.2), so the three fallback assertions above cannot go through the fixture's HTTP `app`. They call
`action.run(ctx, input)` directly with a hand-built `ActionContext` — the same `{db, eventBus}` the
fixture yields plus a literal `caller` — which is also how the `producedItemId` and
`linkReviewToSession` cases are driven. The HTTP `app` is still used for everything else, so both doors
are exercised in one file.

**New migration test** — `framework/db/src/__tests__/migration-0085-brownfield.integration.test.ts`,
the shape `migration-0078-brownfield.integration.test.ts` already uses: seed a task with a task-hosted
thread, a task with two of them, a task with none, an `items` row and a message carrying its
`legacyItemId`; migrate; assert every task has a thread, **every task thread has `host_kind = 'team'`
and `host_id` = its task's team** (the B10 agreement with §3.9), no thread is hosted by a task, the
double-hosted task took the oldest, and step 4's `participants` is a JSON array holding **both** the
owner agent and the first human where both exist — the assertion that catches N2's `LIMIT`-binds-to-the-
union trap — with `initiator_id` a real `users.id`.

**`framework/db/src/__tests__/schema.integration.test.ts:41`** asserts `"items"` is in the live table
list; the entry is deleted with the table. It is not optional — the test is the census
`validateTableOwners` cross-checks (§4).

**Deleted, their assertions moved into the seam test.** The route- and tool-suite files whose subject
is a door that no longer exists: `src/__tests__/policy-engine.integration.test.ts` ·
`src/__tests__/AD4-policy-engine.integration.test.ts` ·
`src/routes/__tests__/review-verdict-resume.integration.test.ts` ·
`src/services/__tests__/core-api-port-assistant-reply-seam.integration.test.ts` ·
`src/services/__tests__/assistant-turn-b3-coherence-trigger.integration.test.ts` ·
`src/services/__tests__/assistant-thread-pin-coreapi-subscriber.integration.test.ts` ·
`conversation/src/__tests__/assistant-turn-resolver*.integration.test.ts` (two files) ·
`tool-handlers/src/__tests__/submit-review-*.integration.test.ts` (four files) ·
`src/services/__tests__/agent-orchestration-port-writes.integration.test.ts:121-137`'s
`listPendingIntentsByKind` case (the file survives; that one test does not). The builder runs
`rg -l 'api/threads|/conversations/items|api/reviews|threads/assistant|submit_review|create_item'` under
every `__tests__` directory and closes the list; none is dropped silently.

**Re-pointed, core-api** — `AF11-authz` · `AD7-search` · `agent-profile` · `AD4-agent-profile` ·
`agent-session-request-sources` · `agent-run-admission-failed-subscribers` ·
`access-boundary.test.ts` · `tool-registry` · `tool-registry-role` · `tool-schemas` (the roster loses
four names and gains four) · `return-actions.closure` (B11) ·
`tool-handlers-completeness-contract` · `stub-ports.ts` · `routine-scheduler-completeness` ·
`api-availability` · `api-e2e`.

**Re-pointed, core-ui** — every file in the `rg` list of §5 B9, plus the two stories
`RecipientPicker.stories.tsx` and `HostThreadSection.stories.tsx`, which mock the deleted routes and
are required to keep working per `.claude/rules/testing.md`.

**Re-pointed, e2e** — `__e2e__/fixtures.ts` is the shared route mock and moves first. Forty-three
specs name a thread route; the ones whose subject **is** the thread must be read individually rather
than swept: `conversations.spec.ts` · `threads.spec.ts` · `thread-response.spec.ts` ·
`task-thread.spec.ts` · `knowledge-thread.spec.ts` · `bet-thread.spec.ts` ·
`q1-new-dm-thread.spec.ts` · `block-anchor-comment.spec.ts` · `T5-block-discussion.spec.ts` ·
`AH3-assistant-responds.spec.ts` · `L21-coc-overlay.spec.ts` · `M3-api-wiring.spec.ts` ·
`W3-conversations-filter.spec.ts` · `l10-conversations-filter.spec.ts` ·
`conversations-submenu.spec.ts` · `L11-rich-messages.spec.ts`. E2E is local-only and the affected
slice passes with zero tests — **run the full suite and compare against `origin/main`.**

**Harness lane** (local, obligatory — the tool roster and the forcing message both change):
`npm run test:integration:harness` green on all four harnesses. Compare against `origin/main` first;
that lane has known red there. The specific claim this lane proves and nothing else can: a real CLI,
given the new `send_message` schema through the real MCP bridge, calls it and satisfies the return
gate with `required = ["send_message"]`.

**Governance** — `npm run lint` green with the three shrink lists shorter, and the attack pair
demonstrated red once by deleting a `LEGACY_ROUTES` entry whose route still exists.

**`npm run verify` · `npm run test` · `npm run test:integration:service`** all green.

**The one end-to-end proof for the gate.** Run the app. In a thread with a human and an agent, post
`@<agent> please do X`. Then, without touching anything else, show in order:

1. the `messages` row;
2. the `changes` row with `kind = 'message'`;
3. the `agent_work_intents` row with `kind = 'thread_turn'`,
   `source_id = <messageId>:<agentId>` and `idempotency_key = thread-turn:<messageId>:<agentId>`;
4. the session that starts from it, with a calling thread and no task;
5. the `edit_task` call that session makes, carrying `threadId` = this thread, and the new `tasks` row
   with that `thread_id`;
6. **the `send_message` the same session then makes into the same thread, saying it made the task** —
   this is what ends the turn;
7. the session's outcome recorded `returned`, not `not_returned`;
8. the task and the agent's message both visible on the thread's own page.

**Step 6 is not decoration, and an earlier draft of this chain ended at step 5, which cannot pass.** A
thread turn has a calling thread and no task, so `provisioner.ts:1566` gives it
`requiredReturnActions = ["send_message"]` after B11's edit, and `isRequiredReturnAction`
(`framework/harness-protocol/src/harness/return-actions.ts:129-138`) admits only a member of that
required subset. `edit_task` is separately non-terminal for such a session — `isReturnAction` returns
false on `!taskId` (`:106`), which is R1 and is correct. So a turn that creates a task and stops is
verdicted `not_returned`.

**That is the right design, not a gap to close by widening the set.** `plan.md:60-63` reads "answer
back, **or** create a task"; the second branch is really "create a task **and say so**", because a task
created silently is a task the person who asked never hears about. Making `edit_task` terminal for a
task-free session would have to compare `args.id` against a session task that does not exist — the
`undefined === undefined` shape R1 shows the guard already refuses — and would let any task edit end a
conversation turn. Requiring the agent to report back costs one tool call and is the behaviour a human
in that thread actually wants. The plan's wording is being adjusted to match; nothing in this document
changes.

That single chain is the whole of `plan.md:57-63` and it is the thing a screenshot cannot prove — judge
it in the running app and in the database, not from the diff.

The other gate items are each one look: the conversations page, a task's thread and the overlay all
running through the action list; a send with two bodies returning a `two_bodies` problem in the UI;
`SELECT * FROM items` failing because the table is gone; `rg policy-engine` finding nothing.

## 10. Documentation made false

Prose, so it does not count toward the size of the change, and it lands in the same PR.

- `docs/human-interface-layer/items-and-routing.md` — its whole subject (the `items` table, risk-tier
  routing, the policy engine's push/queue/auto-resolve) ceases to exist. This one is a **deletion**,
  not an edit; `docs/human-interface-layer/index.md` loses its link.
- `docs/human-interface-layer/thread-primitive.md` — the route list, `POST /threads/:id/messages` as
  the door, the host-kind write predicate, "thread hosted by a task".
- `docs/human-interface-layer/review-primitive.md` — `submit_review` as a tool, `GET /reviews/:id` as
  the review page's door, auto-approval by approval rate.
- `docs/human-interface-layer/notification-primitive.md` and `overview.md` — item-derived
  notifications.
- `docs/agent-layer/return-gate-enforcement.md` — names `submit_review` and `reply` as return
  actions; both are gone (B11).
- `docs/agent-layer/agent-model.md` — the assistant as a special agent kind with its own thread.
- `docs/architecture/as-implemented-domain-architecture.md` and `system-overview.md` — the
  `conversation` package, the `items` table, the thread route surface.
- `docs/architecture/authorization-model.md` — the host-kind read/write predicate this item replaces
  with membership (§6).
- `docs/process-layer/the-four-primitives.md` and `docs/process-layer/tasks-and-sessions.md` — a
  task's thread is a host lookup; the calling thread is resolve-or-create.
- `docs/information-architecture/app-shell-always-present.md` — the overlay's own thread route.

The builder greps `POST /api/threads`, `/api/reviews`, `submit_review`, `create_item`, `reply`,
`items table`, `policy engine` and `assistant thread` under `docs/` and closes every hit.

## Confusions

1. **`changes.kind = 'message'` (plan Confusion 1)** — resolved as the plan states: the check widens
   (§4 step 2) and `objectId` stays the **thread** id so BC5 can read a thread's history in one query.
2. **The return gate (plan Confusion 2)** — half resolved by the code already (R1), half real: the two
   provisioner literals (B11). A builder that "fixes" `isReturnAction` is fixing something that is
   not broken and will weaken it.
3. **`questionnaire` (plan Confusion 3)** — untouched, as stated. It appears here only as one of the
   four bodies `send_message` accepts and one of the two types that reopen a resolved thread.
4. **`GET /recipients` (plan Confusion 4)** — stays, with its `LEGACY_ROUTES` row, its route file and
   `useRecipients`. `GET /org/review-recipients` does **not** stay: it is a different route with a
   different purpose and both its callers are deleted tools (B4).
5. **A task created inside a thread (plan Confusion 5)** — §3.9, second paragraph.
6. **Reads, posts and the join (plan Confusion 6)** — §3.4, in one place, with the four paths it keeps
   alive tabulated there and asserted in §9. One thing the plan's sentence does not spell out and this
   document decides: the join writes **no** `thread.changed` row, and the `@mention`-add moves onto the
   same representation, so a send has exactly one way of saying "this changed who is in the thread"
   (§3.5). If the plan owner wants mentions to keep their own `changed` row, that is a one-row edit to
   §3.5 and nothing else moves.
7. **A task's thread is team-hosted (plan Confusion 7)** — §3.7, §3.9, §4 steps 4 and 7, asserted in the
   migration test. Direct threads keep host `user`.
8. **`approval-rate.ts` and the policy package survive** — R2/R3/R4. `plan.md:75` says the policy
   engine's *one unique effect* goes; the package's other half (lifecycle propagation) and the
   approval-rate computation the agent profile renders are not that effect.
9. **`notice` has no writer** — R9. Not a decision this item makes; a fact it uncovered.

## Proposed plan amendments

One. It is a founder call, not mine, and I have not resolved it in the document above beyond stating
the reading I recommend.

**The websocket push becomes a nudge, and the browser refetches.** `plan.md:81` says the hand-pushed
sites go, "the change row is projected onto the existing topics", and "hooks are replaced by `call()`
+ the same subscription". §3.12 reads that as: the change row arrives, the hook re-runs its own
`call()`, and nothing else is composed server-side. That directly reverses a founder derivation
recorded in the code — *"there is no refetch … core submits the changed version … zero ways back"*
(`layers/core-api/src/routes/threads.ts:91-96`, AU21 Decision L4) — for every thread surface.

The two options, honestly:

- **Nudge (recommended).** The push carries the `changes` row; the hook calls `open_thread` /
  `search_threads`. Cost: one extra round trip per message, on a local or LAN backend. Gain:
  `buildThreadListRowForPush` and `buildSenderIdentityForPush` are deleted outright, and with them
  the viewer-relative title bug the code documents against itself
  (`threads.ts:113-123`) — a non-creator seeing their own name as a thread's title until they
  refetch. The three writes that push **nothing** today (`PATCH /threads/:id`, `POST /threads/direct`,
  `GET /threads/assistant`) start pushing like everything else, because there is one push path
  instead of nine hand-placed ones.
- **Payload.** The push carries the composed list row and the new message, as today. Cost:
  `buildThreadListRowForPush` survives with its bug, and the module must compose a viewer-relative
  title for a broadcast that reaches every viewer — which is what makes the bug unfixable in that
  shape. Gain: no refetch.

Both fit `plan.md:81`'s words. The recommendation is the nudge; a two-line answer at the gate settles
it, and the difference is contained to §3.12 and the two new UI hooks.

## Critique response — round 1

All ten blockers re-verified against the code at `50cb93785`. **Ten confirmed, none refuted.** Where a
finding was right but its proposed shape was not the one taken, the reason is here; everything else is
fixed in place above.

| # | Verdict | Where it is fixed | Note |
|---|---|---|---|
| B1 read hole | **Confirmed.** `HOST_SCOPE` is participant-scope for `user`/`agent` (`access-boundary.ts:33-34`) and §5 B13 deleted it with nothing in its place. | §3.4 `canReadThread`, §3.8 both reads, §6.4, §5 B13's ordering clause, §9's read assertions | The plan owner's ruling is taken literally: members-only for `user`/`agent` hosts, open for `team`/`knowledge_item` — plus **`factory`**, the third host-scope kind in `HOST_SCOPE` today, included so this is that predicate moved rather than a new policy. A non-member gets `not_found`, indistinguishable from deleted. |
| B2 supersede | **Confirmed, and worse than the row-count framing.** `findNewerPendingSiblingInternal` filters on `(kind, sourceId)` with no `idempotencyKey` (`session-requests/src/service.ts:534-538`) and `processIntentsInternal` supersedes and `continue`s (`:723-728`). | §3.10 (`sourceId = ${message.id}:${agentId}`, `bakedRequest.sourceId` unchanged), §9's assertion | Verified that nothing downstream reads the intent's `sourceId` as a bare message id: the session request is built from `baked.sourceId` (`service.ts:641`) and deduped on `(sourceKind, sourceId, idempotencyKey)` (`:112-124`). The one function that did assume it — `listPendingIntentsByKind` — loses its only caller and is deleted with its port, route, client and barrel export. |
| B3 second items writer | **Confirmed.** `review-item-factory.ts:79-125` writes a thread, an item and `item_created`; reached live from `agent-run-admission-reactions.ts:98-100`. | new §5 B7b | Two corrections to the finding's framing, both from the code: it is **not** a knowledge-*conflict* review (`knowledge-conflicts.ts` is a separate table that never touches threads) and there is **no task** in that path — the source id is `knowledge:<itemId>` and the thread is already hosted on `knowledge_item`. So the successor posts into the knowledge item's thread, not a task's. Its actor cannot be "the same actor" either: today's is the literal string `"attention_engine"` (`:83`), which has no `users` row and which `changes.actor`'s FK rejects — it becomes `system:propagation`. Also added: `agent-run-admission-reactions.ts:33`'s `insertThread` import, `attentionReviewReasoningMarker`'s LIKE-probe reader, and the four `RoutineDeps` item/thread ports that turn out to have **no** production caller at all. |
| B4 intent-kind unions | **Confirmed, and one more than listed.** | §5 B5's table, now seven sites | Added the three named plus the fact that `event-bus` and `domain-model` carry two deliberately different `AGENT_WORK_INTENT_KINDS` lists, and the drift test that derives from the first. |
| B5 no `edit_task`→`adjust_thread` contract | **Confirmed.** | §3.9 | `TaskActionsDeps.adjustThread` as a function value, the `compose.ts` build order (thread first — the dependency is one-way, so no lazy wiring), and the governance rule (`governance-model.ts:176-177`) that forbids the import spelled out. |
| B6 gate proof cannot end | **Confirmed.** A thread turn gets `required = ["send_message"]` and `edit_task` is non-terminal for it by the very `!taskId` guard R1 defends. | §9's chain, now eight steps; §5 B11 | The chain gains step 6: the agent says it made the task, and that ends the turn. Not a widening of the return set — making `edit_task` terminal for a task-free session would need exactly the `undefined === undefined` comparison the guard exists to refuse. |
| B7 two `ast-` UI sites | **Confirmed.** | §5 B5's table | `AssistantOverlay.tsx:355` → compare against the overlay's own counterpart id; `SettingsAgents.tsx:449` → `ownerUserId !== null`. Both rewritten, not deleted: the behaviour is right, the recognition is not. |
| B8 `domain-model/src/thread.ts` | **Confirmed.** 426 lines, exports `HOST_KINDS` (with `"task"`), `MESSAGE_TYPES`, `Thread`, `Message` and the payload interfaces, all re-exported from the barrel (`index.ts:203-246`). | §3.1's new preamble, §2, §8 step 1 | Edited, never duplicated: the vocabulary is imported by `actions/thread.ts`; the row interfaces move out and are re-exported under the same names. **`BlockHostKind` keeps `"task"`** (`thread.ts:21`) — a block anchor host is not a thread host. The `participants` → `members` rename is stated once with its three consumers, and the column keeps its name. |
| B9 `findSoleHumanUser` | **Confirmed.** `reply` (`tool-definitions.ts:134`) is the only production caller; five sites go dead. | §5 B4 | The `GET /users?kind=human` filter it dialled stays — `routes/users.ts` survives; only its comment naming `reply` is corrected. |
| B10 two hosts | **Confirmed.** §3.9 passed no host and §3.7's default is `user`, while the migration writes `team`. | §3.7, §3.9, §9's migration test | One host: `team`, the task's own team, in both directions, with the migration test asserting it. Direct threads keep `user`. |

Non-blockers: N1, N2, N4, N5, N6, N7, N8 and N9's two real drifts are all fixed above. **N3** is
answered rather than fixed, per the plan owner: §3.12 now opens by saying it describes the nudge
reading only and that the choice is still open, which is the honest shape while the amendment stands.
On **N9's first item** — `tool-seam.ts:48-69` is the whole declaration including its `export interface`
line and closing brace, `:50-68` is its body; not a drift, and not worth an edit either way.

One thing the critique credited that is worth repeating so it is not "fixed" later: **R1 must not be
touched.** `isReturnAction`'s `!taskId` early return (`return-actions.ts:106`) is what makes a thread
turn's `edit_task` non-terminal, and B6's resolution depends on it staying exactly as it is.

## Critique response — round 2

One blocker, three non-blockers. **B11 confirmed** — the round-1 read/write split plus B10's
`team`-hosted task threads did produce a shape with no join path, and all four paths the critic named
were genuinely dead. The finding was right and the reasoning was right; the four `rg`-backed dead-ends
were the useful part, because each one is now an assertion in §9.

| # | Verdict | Where it is fixed |
|---|---|---|
| **B11** join path | **Confirmed.** Verified the four dead-ends myself against the revised document and the code: nothing but `@mention` added a member, and `adjust_thread` refused the non-member who would have to do the adding. `canWrite`'s delegation to `canRead` (`access-boundary.ts:76-77`) is what all four rely on today. | The plan owner's ruling (`plan.md` Confusion 6) applied in one place, §3.4: `canWriteThread = canReadThread`, so shared (`team`/`knowledge_item`/`factory`) threads are readable **and** postable by any signed-in principal and direct threads stay members-only for read, post and adjust; **posting a host-scoped thread you are not in joins you to it in the same transaction**; `adjust_thread` follows the same predicate. Threaded through §3.5 (`after.members` on the `message` row, **no** `thread.changed` for the join), §3.6 step 4's invariant order and step 5's join, §3.7's adjust gate, §3.10's wake over the post-join list, §4 step 4's note, §5 B3/B4/B7b/B9, §6.3–6.5, §5 B13, and §9's new post/adjust/join assertions plus one per dead-end path. |

Three things inside the ruling that it did not spell out and this document decides, each flagged so
the plan owner can reverse it in one edit:

- **the `@mention`-add moves onto `after.members` too.** The ruling puts the *join* there; leaving
  mentions on a `thread.changed` row would mean one act has two representations depending on why the
  member list moved. One rule instead: a **send** never writes a `changed` row naming `members`;
  `adjust_thread` is the only thing that does — which is also how BC5 tells "spoke and thereby joined"
  from "was added". Reversing it is one row in §3.5's table.
- **an adjust does not join its actor.** Renaming or pinning a shared thread is not speaking in it, so
  the member list only grows from real participation. The ruling says any principal who can read a
  shared thread may adjust it; it does not say adjusting puts them in it.
- **the wake rule runs over the post-join list.** A stranger posting into a two-member team thread makes
  it three, so their post does **not** wake the agent sitting in it. Consistent with the existing
  mention rule, and the alternative — computing the arm on the pre-join list — would wake an agent
  because of who *used* to be in the room.

One asymmetry this creates that §6.4 states rather than hides: for a **host-scoped** thread the action
is looser than the websocket until the first post, because the socket wants membership and the action
does not. That is today's asymmetry unchanged — `GET /threads/:id` already serves a `team`-hosted
thread to any principal while `ws-subscribe-authorizer.ts:95-100` refuses the subscription — and the
join closes it for anyone who actually participates.

| # | Verdict | Fix |
|---|---|---|
| **N10** | **Confirmed, both sites.** `actions-projected.ts:83` carries the `GET /requests/pending-intents` plumbing row, and clause 2's reverse check covers `LEGACY_ROUTES` only (`:433-442`), so a stale plumbing row is inert — the critic is right that this is why it is not a blocker, and right that it should still go. `agent-orchestration-port-writes.integration.test.ts:121-137` does test the deleted method. | Both added to §3.10's deletion list, with the missing-reverse-check explained rather than just asserted; the test case added to §9's deleted list. |
| **N11** | **Confirmed.** `ThreadHostBanner.tsx` is under `ds/`, not `components/`. | Path corrected in §3.1's rename list; the claim about it was already right. |
| **N12** | **Confirmed.** `framework/event-bus/src/events.ts:394` is `ThreadCreatedEvent.hostKind: HostKind`, the one `HostKind` consumer outside the deleted files. | Named in §3.1 with the reason it needs no edit, so a builder does not go looking for a second vocabulary. |

Nothing in round 2 touched the open amendment: §3.12 still describes the nudge reading only, and the
websocket envelope is still the one thing this document does not lock.
