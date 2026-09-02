# Artifacts become knowledge items

The `artifacts` table, the word "artifact", and the separate content model behind
it are deleted. What an agent produces during a task is a knowledge item
parented to that task. What an agent produces in a conversation is a knowledge
item parented to that thread. Giving either one a knowledge-item parent later is
how it graduates into the team's knowledge tree.

**Vocabulary note.** The noun is **knowledge item**, and the table stays
`knowledge_items`. "Document" appeared during the design conversation and is not
the word — founder call. The parallel nested-knowledge strand currently writes
"knowledge documents"; that is the same object under a word we are not keeping.

**It has already leaked into merged production code.** `upsertPluginDocument` and
`UpsertPluginDocumentInput`
(`layers/core-api/knowledge/src/knowledge-repository.ts:1358`, exported from that
package's index) landed with the BA9 plugin work, and the BA9e/BA9f commit
messages say "knowledge document" throughout. Two identifiers, cheap to respell — but
**the nested-knowledge strand claimed them on 2026-09-02** and is doing it in
their vocabulary sweep. Leave those two symbols alone here (see AC13).

## Why

Two nouns were doing one job badly.

An artifact today is a receipt: `id`, `producingTaskId`, `kind`, `label`,
`previewJson`, `createdAt` (`framework/db/src/schema.ts:1048`). No body, no
status, no version, no scope, no history. It cannot exist without a task, it is
never edited, and its entire content lives in a JSON preview column.

A knowledge item is a real thing: scope, title, markdown body, status, version,
role, an edit log, an access log, and a place in the knowledge tree.

They are the same thing at different stages of being kept. An artifact is a
knowledge item nobody has decided to keep yet. Modelling that as a second table
bought a receipt that can never grow into a knowledge item, and a knowledge item
that can never be produced by a task.

Removing the second table also closes the product thesis: everything is a
thread, a task, or a knowledge item.

**This is now the third time the same move has been made, not the first.** The
BA9 plugin work already moved two other pieces of entity text into
`knowledge_items`:

- **A routine's prompt** — `routines.prompt` was dropped and replaced by
  `routines.prompt_knowledge_id`, an FK to a knowledge item (BA9f, `7aea1084e`).
  The commit's own reasoning is the same as this plan's: the prompt "could not be
  read, edited or reused the way the knowledge it plainly is can be".
- **An agent's identity** — resolved as a knowledge item with `role='agent_file'`,
  `scopeKind='user'`, `scopeId=<agentId>`, `status='active'`
  (`getAgentIdentityIds`, `layers/core-api/knowledge/src/knowledge-repository.ts:1339`).

Artifacts are the same argument applied to produced content. The precedent is
established; this strand does not have to make the case from scratch.

## What was already true

Three things made this smaller than it looks, each verified in code rather than
assumed.

- **The rendering already unified.** AM5 established one Kind basis with three
  compositions — Artifact = single, Review = diff, Block = mixture. Blocks
  already derive from artifact bodies and knowledge bodies alike.
- **Threads are already polymorphic-hosted.** `threads.hostKind`/`hostId`
  (`framework/db/src/schema.ts:687`) already hangs a thread off a bet, task,
  knowledge item, artifact, agent, user, team or factory. The parent slot is the
  same pattern applied once more.
- **The maturity ladder is already leaving.** O2 moved `layer` and `kind` off
  the kernel table onto `knowledge_app_projection`, and BA9 is moving the ritual
  out of core into a plugin. The nested-knowledge strand deletes `L0`-`L4`,
  `kind` and `topic` outright. Nothing here builds on them.

## Decisions

Each of these is a founder call made during the design interview.

### One object. The word "artifact" survives — but only as a name for produced content

**Founder call, 2026-09-02, reversing this plan's earlier decision.** An earlier
draft said the word died outright and was "not kept as a view word", on the
reasoning that a surviving word keeps the old mental model alive. The founder
reversed that: *"we keep the tool called artifact, that's an established name by
now — what's behind is just a knowledge item attached to a task or whatever the
context."*

So the line is no longer "the word appears nowhere". It is:

**"artifact" may name produced content. It may not name a storage concept.**

| Survives | Dies |
|---|---|
| The `create_artifact` agent tool — now writing a knowledge item parented to the current context | The `artifacts` TABLE |
| The word users see for content an agent produced into a task or a conversation | `previewJson` and the separate content model behind it |
| The sandbox frame that runs an interactive one | `layers/core-api/src/routes/artifacts.ts` — a produced item is a knowledge item and is read as one |
| The section on a task listing what was produced there | `ArtifactRef` — a pointer to a row that no longer exists |
| | `ARTIFACT_KINDS`, the kind registry and the preview schemas — kind is derived from blocks, not stored |
| | The `artifact` value in `HOST_KINDS` / `BLOCK_HOST_KINDS` — a thread now hosts on the knowledge item itself |

An artifact is a **view** of a knowledge item: one that has a `task` or `thread`
parent rather than a `knowledge_item` parent. There is no second table, no second
content model, and no second lifecycle — which is the whole point of the change.
What the reversal buys back is a word people already use for the thing.

`knowledge_items` is **not** renamed.

### The parent slot is `knowledge_item | task | thread`

`parentId` + `parentKind`, built by the nested-knowledge strand. Three kinds,
not four — `bet` is deleted as a primitive by BB1, every bet id becomes a task
id, so a bet-parented item is just a task-parented item.

Accepted cost, on the record: no database-level foreign key on the parent,
because it points at three tables. Existence is validated at the API boundary.
`org_edges` is the precedent (`framework/db/src/schema.ts:783`).

### Content is markdown only. No payload column.

`knowledge_items.body` stays the single content store. Every artifact kind is
already expressible as markdown, and blocks already derive them: an image item's
body is an image, a code item's is one fenced block, a data item's is one table.

**An interactive HTML item stores its content as a fenced ```html block.** This
is not cosmetic. Measured against the real `deriveBlocks`: a realistic
self-contained HTML document placed raw in a markdown body derives to **six**
blocks and mis-parses a chunk of CSS as a paragraph, leaving `</style>` as
literal text — CommonMark terminates HTML blocks at blank lines. Fenced, it
derives to exactly one `code` block with `lang: "html"` and the text returns
byte-identical.

The deciding argument against a payload column was the file watcher. A payload
item could only ever be made through an API call, never by writing a file —
which would split the system into file-backed and payload-backed items forever,
and break the property the nested-knowledge strand depends on.

What is lost: image width and height, which were stored in `previewJson` and are
now measured at render. Code path and language survive in the fence tag and
title; an HTML item's title becomes the item title.

### Kind is derived, not stored

An item's kind is a property of its blocks, computed at render, the same way
blocks themselves are. There is no `kind` column and no stored discriminant.
(`knowledge_app_projection.kind` is deleted by the nested-knowledge strand
anyway.)

Known consequence: "show me every diagram in this task" becomes a derivation
over bodies rather than an indexed lookup. If that query is ever needed at
scale, the answer is a derived cache column, never a second source of truth.

### Provenance is history, not a column

`producingTaskId` is not replaced. `parentId` means where an item sits, not
where it came from, and graduating an item overwrites it.

This is recoverable and was checked: the create entry records only the editor
and `editType: "create"` with null values
(`layers/core-api/knowledge/src/knowledge-repository.ts:275`), but the update
path logs per-field old and new values, so the first reparent writes
`parentId: <task> -> <knowledge item>`. The original task is always in that
entry's `oldValue`. Looking for provenance means reading history, which is the
natural place to look.

### Status and role of a produced item

**Role `ordinary`.** Unchanged.

**Status: `captured` when this strand lands, `proposed` immediately after.**

`captured` is already what the writeback path sets when an agent creates a
knowledge item from its sandbox (`handleCreate` in `writeback-processor.ts`,
`docs/knowledge-architecture/sync-and-conflict-resolution.md:28`). It is the
pre-validation draft state, which is exactly what an artifact was: produced, not
yet vouched for. So a produced item is written `captured` here, because that is
the value the column actually accepts at the moment this lands.

**The 7-value ladder does not stay** — that line in an earlier draft of this plan
is superseded by a founder call on 2026-09-02, relayed by the nested-knowledge
strand and verified in code. The ladder collapses to
**`proposed | active | stale | archived`**, with `draft`/`captured`/`provisional`
-> `proposed`, `validated`/`active` -> `active`, `stale` -> `stale`, and
`archived`/`needs_human` -> `archived`. `active` was picked over `approved`
deliberately: the word should say "this is the current document", not "this
passed a review".

**That collapse is the nested-knowledge strand's migration, not this one's.**
This strand lands first, so `captured` still exists when it does, and their
mapping carries a produced item to `proposed` for free. Writing `proposed` here
would mean writing a value the CHECK constraint rejects. Nothing to build, and no
compat layer — one line to change in their migration's blast radius, already
covered by their mapping.

Worth knowing why the collapse is more than a rename, because it explains the
duplication this strand deletes around: there are **two** status enums today.
`KNOWLEDGE_STATUSES` (7 values, `framework/domain-model/src/knowledge.ts:19`) and
`KERNEL_KNOWLEDGE_STATUSES` (`draft | active | archived | needs_human`,
`framework/domain-model/src/types.ts:61`), with `ALLOWED_TRANSITIONS`
(`tool-handlers/src/tool-definitions.ts:946`) spanning both. `POST /api/knowledge`
defaults to `draft` while writeback writes `captured` — the same state under two
names depending on whether a human or an agent made it. Both verified on `main`
at `bed7972d8`.

### Thread-parented items are leaves

A thread can be hosted on a knowledge item and a knowledge item can be parented
to a thread, so `item -> thread -> item` is expressible and can close a loop. The
cycle is made **inert, not illegal** — forbidding it at write time would forbid
an item hosting a thread that produces an item, which is the use case. Every tree
walk stops at the first non-knowledge-item parent. A thread-parented item has no
ancestors and inherits nothing.

Consequence for this strand: nothing that renders a breadcrumb or resolves an
inherited value may climb past a thread hop.

### The knowledge tree shows only item-parented items

Task-parented and thread-parented items never appear in the tree. The task
surface and the thread surface list their own. This is what keeps the tree from
filling with per-task residue.

### Human and agent parity is the requirement

**A human and an agent must have the same ability to put a knowledge item into a
conversation.** Founder call, and it is the goal this change is measured
against, not a nice-to-have.

For a human that is the "+" affordance (below). For an agent it is a way to
respond with, or attach, a knowledge item.

**This is the one place where a mechanism still has to be built.** Today the
agent writeback path is *session*-scoped — `updatedBy: session:${sessionId}`
(`layers/agent-orchestration/run-orchestration/src/writeback-processor.ts:241`)
— and sessions belong to tasks. An agent answering in a conversation has no path
to produce a thread-parented knowledge item. Designing that path is the first
job of the next phase; everything else here is subtraction.

**Confirmed by the nested-knowledge strand: this is a second production path, not
a variation on theirs.** Their writeback only ever derives a parent from the
directory a file sits in, which is always inside the session's own tree. Nothing
they are building reaches a thread. Do not plan to extend their path; plan to add
one.

### `BlockRef`-as-embed is retired, and the "+" button is rewired

Two mechanisms exist and point opposite ways. Only the second dies.

**Kept** — a thread hosted *on* a knowledge item, anchored to a block:
`threads.hostKind`/`hostId` plus `messages.block_id`. That is a comment on a
region of an item, and it is per-block discussion.

**Deleted** — a block embedded *into* a chat message: `BlockRef` (`kind:
"block"`) in a message's refs, `BlockRefEmbed.tsx`, `blockRefSchema` in
`layers/core-api/src/routes/threads-schema.ts`, and the type in
`framework/domain-model/src/thread.ts`. Written from
`layers/core-ui/src/shell/AssistantOverlay.tsx:339` and
`layers/core-ui/src/pages/KnowledgeDetail.tsx:870`.

A block id is a hash of content plus outline path, so an embed's reference rots
the moment anyone edits the source and degrades to a "source changed"
placeholder. The embed has no body, status, scope or history. A knowledge item
parented to the thread has all four.

**The "+" affordance survives and is rewired.** It is the human half of parity —
"attach a knowledge item" is the "+" button. Clicking it puts a knowledge item
into the conversation, parented to the thread. The button stays; the rotting
reference behind it is what dies.

### Three attachment mechanisms now exist — worth a ruling, not a blocker

Saying "this knowledge item belongs to that entity" is now done three different
ways, and ours is the third:

| Mechanism | Used by | Shape |
|---|---|---|
| FK pointer on the entity | routine prompt | `routines.prompt_knowledge_id` |
| Scope + role reverse lookup | agent identity | `role='agent_file'`, `scopeKind='user'`, `scopeId=<agentId>` |
| Parent slot | **this strand**, nested knowledge | `parentKind` + `parentId` |

The parent slot is right for artifacts and stays: a produced item is not a fixed
named slot on an entity, it is one of many things that appeared under it, and it
has to be able to graduate. The other two are fixed singular slots, which is a
genuinely different relationship — a routine has exactly one prompt.

So this is not an argument to fold them together, and nothing here is blocked on
it. But three answers to one question is the kind of drift that is cheap to
notice now and expensive later. Worth a founder ruling on whether they converge
once the parent slot exists — **not in this strand's scope**.

### Surfaces

Clicking a knowledge item in a thread or on a task **opens it in the split
view**. The pattern is already standardised — `layers/core-ui/src/ds/SplitView.tsx`,
in use across the settings surfaces. No new interaction is designed here.

## Sequencing

Three strands touch the same tables. This one lands last.

1. **BB1 / task-hierarchy — MERGED** as `870bd0bdc` ("Everything is a task, and
   a task has subtasks", #537). Verified on `origin/main` after rebase: the
   `bets` table is gone; `tasks.parentTaskId`, `tasks.position` and
   `tasks.needsReview` exist; `bet` is gone from `SCOPE_KINDS`, `HOST_KINDS` and
   `BLOCK_HOST_KINDS`. `SCOPE_KINDS` is now
   `factory | product | practice | team | task | user`.
2. **Nested knowledge** (`feature/knowledge-doc-nesting-480d3f`) — NOT yet
   merged. Builds
   `parentId` + `parentKind`, deletes `layer`, `kind`, `topic`, and removes
   `product`, `practice` and `task` from `SCOPE_KINDS`, leaving
   `factory | team | user`.
3. **This.** Deletes the artifacts table and the word.

Do not edit `SCOPE_KINDS` in this strand. Both other strands are already
changing it; sequence against them.

**Migration numbering: take 0071 or higher.** BB1 holds
`framework/db/drizzle/0068_*.sql` and nested-knowledge holds `0070_*.sql`. Do not
race for a number below that.

Settled with BB1 directly:

- **`tasks.artifacts` is DEAD — drop it, do not rename it.** The plan previously
  said this column had to be renamed to `handoffFiles` by hand, warning that a
  blind replace would hit unrelated `artifacts:` keys. That warning still stands
  for the *other* keys, but the column itself needs no rename because **nothing
  uses it**. Verified on `main` at `bed7972d8`:

  - **Zero writers.** The only production task INSERT is `work-service.ts:732`,
    fed from `layers/core-api/src/routes/tasks.ts`, and that path never sets
    `artifacts`. Every other `insert(tasks)` in the repo is under `tools/`.
  - **Zero readers.** `work-service.ts` selects `*`, so the column rides along
    into the row and is mirrored as `artifacts: string | null` at
    `layers/core-ui/src/types/task.ts:34` — but no UI code ever reads
    `task.artifacts`.
  - **The handoff filename array never went through this column.** It travels in
    the thread message payload: `layers/core-api/src/routes/tasks.ts:134` and
    `:617` are the handoff *request body*, forwarded to
    `layers/core-api/policy/src/handoff-protocol.ts:28` and written into
    `messages.payload` at `:283`.

  So: drop the column in the migration, delete the field from the core-ui `Task`
  type, and leave `HandoffMetadata.artifacts` alone — that is a message-payload
  field naming real handoff filenames, a separate question from either artifact
  concept, and renaming it is not this strand's job.

  **The by-hand warning still applies to everything else.** `artifacts:` is a key
  in several unrelated shapes that must NOT be touched: the handoff array
  (`tool-definitions.ts:310`), the review canvas (`tool-definitions.ts:691`),
  review composition (`review-composition.ts:86`), the core-api port
  (`core-api-port-composition.ts:192`), and `threads-schema.ts:200`.
- **The FK is a non-issue.** `artifacts.producing_task_id` NOT NULL RESTRICT
  never fires against their migration 0068 — it only ADDs columns, INSERTs root
  tasks, UPDATEs parentage, then drops `bet_id` and the `bets` table. RESTRICT
  guards deletes of the referenced row, and there are none.
- **No legacy bet-scoped data to special-case.** Bet-scoped knowledge re-scoping
  is done and tested, projection row included. The `scope_id` did not change —
  only the kind string — and `"bet"` is already gone from `SCOPE_KINDS`,
  `SCOPES_REQUIRING_ID`, `BlockHostKind`, `HOST_KINDS`, `InlineRefKind` and
  `EntityRef`. Threads whose `host_kind` was `bet` are flipped to `task` with
  host ids unchanged, so every anchor still resolves.

Three shape constraints from BB1 to respect:

- **No denormalised aggregates on a task.** Per-task `tokensActualJson` values
  are deliberately never rolled up onto ancestors; a subtree total is summed at
  read time by `GET /api/tasks/:id/tree`, and a test asserts no ancestor row is
  written. If anything aggregate about a task's knowledge items is ever added,
  keep that shape.
- **A task now closes to `done` by default**, reaching `review` only when
  `tasks.needs_review` is set. Previously every task went to `review` when its
  session ended. Nothing in this plan reacts to a task reaching `review` — but
  if that changes, know it fires far less often now, deliberately.
- **`tasks.position` is real** — an explicit sibling order, assigned on create
  and reparent, settable via `PATCH /api/tasks/:id` and the agent tool. If
  task-parented knowledge items ever need to interleave with subtasks in one
  list, that is the ordering to read. It is the same shape the nested-knowledge
  strand chose, deliberately. Note `tasks.position` and `tasks.needs_review` were
  both added this session — the row has moved since this plan was first written.

## Scope

**Deleted:** the `artifacts` table; `layers/core-api/src/routes/artifacts.ts`;
`ARTIFACT_KINDS` and `framework/domain-model/src/kinds/registry.ts`;
`artifact-preview.ts`; the `create_artifact` agent tool and its port; the
`artifact` value in `HOST_KINDS` and `BLOCK_HOST_KINDS`; `ArtifactRef`;
`BlockRef` and `BlockRefEmbed.tsx`; `compose-artifact-body.tsx`; the artifact
sections on the task and bet surfaces; the artifact e2e specs.

**Built:** an agent-side path to produce or attach a thread-parented knowledge
item (parity requirement above) — the only genuinely new mechanism in this
change.

**Changed:** `threads.hostKind = "artifact"` rows become `knowledge_item`; the
renderer gains one rule — an item whose only block is a code fence tagged `html`
renders in the AZ6 sandbox frame; the "+" affordance is rewired from a block ref
to a thread-parented knowledge item; **`tasks.artifacts` is renamed to
`handoffFiles`** (BB1 handed this back — see Sequencing for the inherited detail
and the by-hand warning).

**Not in scope, deliberately:** turning entity descriptions into knowledge items.
After BB1 there is exactly one case rather than two: every task carries a full
markdown `description` that derives blocks — their migration writes
`bets.description` onto the root task's `description` byte-for-byte, and
`deriveBlocks(description, { kind: "task", id })` is the straight port of what
`WorkBet.tsx:216` did. So a task's description is a knowledge item in all but
name. The parent slot it would use is the same one built here, so nothing decided
now blocks it later — and BB1 collapsing bets into tasks makes it a smaller job
later than it would have been.

**The reason for excluding it has changed, and is now weaker.** It was "this is
unproven and would double the change". Since then BA9f moved routine prompts and
agent identities into `knowledge_items` successfully, so the pattern is proven
and `tasks.description` is the last large holdout. The exclusion now rests only
on sequencing — keeping this strand to one subtraction — not on risk. Re-decide
it deliberately rather than inheriting this line.

## Existing data

**Purge. Founder call.** Existing artifact rows are dropped, not converted into
markdown bodies. AM5 set the pre-alpha precedent — incompatible preview shapes
were dropped rather than migrated, with unrenderable rows returning a null
preview. There is no content-conversion work in this strand.

## Acceptance criteria

| # | Criterion | How it is verified |
|---|---|---|
| AC1 | The `artifacts` table, its routes, `ARTIFACT_KINDS` and the kind registry no longer exist. | Typecheck plus a governance lint rule asserting the symbols are absent. |
| AC2 | The word "artifact" names produced content and nothing else: it appears on no table, no route path, no stored kind or preview shape, and no ref type. | Lint rule over production files listing the banned positions; it must be shown failing before it passes. |
| AC3 | A knowledge item whose only block is a fenced ```html block renders inside the AZ6 sandbox frame, scripts running, with the source byte-identical to what was written. | Component test on the renderer plus a derivation test asserting one `code` block, `lang: "html"`, round-trip identity. |
| AC4 | A knowledge item parented to a task appears on that task and never in the knowledge tree. | Component test on both surfaces. |
| AC5 | A knowledge item parented to a thread appears in that conversation, has no ancestors, and no breadcrumb or inherited-value resolution climbs past the thread. | Component test plus a unit test on the tree walk. |
| AC6 | Reparenting a task-parented item to a knowledge-item parent writes an edit-log entry whose `oldValue` is the original task id. | Service integration test against a real database. |
| AC7 | An agent writing a markdown file in its sandbox produces a knowledge item parented to the task, status `captured`, role `ordinary`, with no artifact-specific tool involved. | Harness integration test against the real installed binary. |
| AC8 | **Parity:** an agent can put a knowledge item into a conversation, and the result is indistinguishable from one a human attached with "+" — same parent, same status, same role, same render. | Harness integration test driving a real conversation, asserting the row and the rendered thread against the human-created equivalent. |
| AC9 | Clicking "+" on a block creates a knowledge item parented to the thread carrying that block's content, and the conversation shows it. Nothing degrades to a "source changed" placeholder when the source is later edited. | Component test on the composer, plus a test that edits the source body and asserts the item is unaffected. |
| AC10 | Clicking a knowledge item in a thread or on a task opens it in the split view. | Component test asserting `SplitView` renders with the item. |
| AC11 | `BlockRef`, `BlockRefEmbed` and `blockRefSchema` are gone, with every caller moved — no compat layer, alias or dead code. | Typecheck plus knip. |
| AC12 | `tasks.artifacts` is renamed to `handoffFiles`, the handoff write path still round-trips, and no unrelated `artifacts:` key (review canvas, review composition, core-api port) was renamed by mistake. | Service integration test on the handoff round-trip; AC2's lint rule catches any survivor. |
| AC13 | ~~No production identifier says "document" for a knowledge item.~~ **Handed to the nested-knowledge strand** on 2026-09-02 — they are respelling `upsertPluginDocument` / `UpsertPluginDocumentInput` in their own vocabulary sweep. Not this strand's work; do not touch those two symbols. | n/a |

AC2, AC3 and AC8 are the three that carry the change. AC3 is the one that would
have been shipped broken without the derivation probe. AC8 is the goal.

## Status

**Unparked 2026-09-02.** The park reason is gone and the sequencing in the
section above is stale in one respect — recorded here rather than silently
rewritten, because the change of order matters.

- **BB1 merged** (`870bd0bdc`, #537). Unchanged.
- **The parent slot exists and is on `main`** — but it was NOT built by the
  nested-knowledge strand. A separate strand
  (`.pipeline/work/knowledge-attachment-slot/`) built it and merged it as
  `bed7972d8` (#545). `knowledge_items.parent_kind` + `parent_id` are live, with
  `ki_parent_kind_ck`, `ki_parent_pair_ck`, `ki_parent_slot_uq` and
  `ki_parent_idx`. The allowed kinds are
  `knowledge_item | task | thread | routine | agent` — five, not the three this
  plan assumed, because that strand also folded the routine-prompt FK and the
  agent-identity reverse lookup onto the same slot. `task` and `thread` are both
  already allowed, so nothing here needs a constraint change.

  That also settles the "three attachment mechanisms" ruling above: they
  converged, and it was done by that strand rather than deferred.
- **Nested knowledge has not started.** `feature/knowledge-doc-nesting-480d3f`
  carries two planning commits and no implementation, and is not pushed.
  **So this strand no longer lands last — it lands first.** Verified 2026-09-02:
  `SCOPE_KINDS` on `main` is still the six BB1 left
  (`factory | product | practice | team | task | user`), and
  `knowledge_app_projection.layer` / `.kind` still exist.

  Two consequences. **Still do not edit `SCOPE_KINDS`** — nested knowledge
  narrows it and this strand has no reason to touch it. And the line under
  "Kind is derived" that leans on nested knowledge deleting
  `knowledge_app_projection.kind` cannot be leaned on yet; it is still their
  column to remove. Nothing here writes it, which is all this strand needs.

Re-verified on `main` at `bed7972d8`: the `artifacts` table, `tasks.artifacts`,
`ARTIFACT_KINDS`, the artifacts routes, `BlockRef` and the `artifact` value in
`HOST_KINDS` / `BLOCK_HOST_KINDS` all still exist. Nothing this strand planned to
delete has been deleted by someone else.

Refine is complete. Program design is complete except for one thing, which is
the first job now: **how an agent produces or attaches a thread-parented
knowledge item**, given that writeback is session-scoped today. That is a
mechanism to design, not a question to ask.

**Migration numbering: take 0078 or higher.** The attachment-slot strand landed
`framework/db/drizzle/0077_one_attachment_slot.sql`. The 0071 floor in
Sequencing above is superseded.

---

## Decisions taken during the build

Recorded here because each changes what the plan above said, and each was
checked in code rather than assumed.

### `create_artifact` keeps its name and writes a knowledge item

Input is `title` + `body` (markdown). No `kind`, no `label`, no `preview` — kind
is derived from the body's blocks at render time and nothing is stored. Parent is
resolved from context and never passed as input: `ctx.taskId` when the agent is
in a task session, otherwise `ctx.threadId` when it is answering in a
conversation, and an error when it has neither, because a produced item must
belong to something. Note `ctx.taskId` is the empty string rather than
`undefined` in an assistant session (`provisioner.ts:1336`), so the branch tests
truthiness, not presence. Scope reuses `write_memory`'s existing rule verbatim
(`teamId ? "product" : "factory"`) rather than inventing a second one.

### The routine artifact subject folds into the knowledge-item subject

`routine-scheduler.ts` had a dedicated artifact branch (STEP 2) that read the
artifacts table to build a `kind:"artifact"` subject, fired by
`ArtifactCreatedEvent`. Both retire.

Nothing is lost, and the fold is clean rather than a cut: a `kind:"knowledge-item"`
subject already exists in the scheduler, already resolves off any event carrying
`itemId` that is not `item_created`, and already carries `id`, `title`, `body`,
`format` and `version` — strictly more than the artifact subject's
`id`/`kind`/`label`/`producingTaskId`. `POST /api/knowledge` already emits
`knowledge_created` with `itemId`, so a routine that triggered on produced
content keeps triggering, on a richer subject.

`ArtifactCreatedEvent` is defined twice (`framework/domain-model/src/events.ts`
and `framework/event-bus/src/events.ts`); both go, along with the
`ws-connection-hub` topic routing.

### `POST /api/knowledge` validates the parent; the contract now says so

The slot shipped with phase 1 but was reachable only from inside core-api. The
route did not accept `parentKind`/`parentId` at all, so zod stripped them and a
client that sent a parent got a `201` with a null parent and **no error** —
verified against the running server before the fix. The route now accepts a
parent, refuses a half-named one, and confirms existence through the service that
owns the parent's table (`work` for a task, `conversation` for a thread — both
already imported there, so no new dependency). Only `task` and `thread` are
accepted from a client; `knowledge_item`, `routine` and `agent` stay writable
only by the routes that already hold the parent row, so a client cannot forge a
routine prompt or an agent identity.

### Agent writeback had never worked, and that was in this strand's path

`buildKnowledgeWritebackPort.create` sent no `scopeKind` (the route requires one)
and `status: "captured"` (the route validates against its own four-value list and
has never accepted it). Two independent rejections, so no agent has ever produced
a knowledge item by writing a file. Proven live: that exact payload returns `400`
naming both problems; the corrected one returns `201`.

Fixed at the type level rather than by patching the call.
`CreateKnowledgeItemRequest.scopeKind` was optional while the route's zod was
required, so an omitting caller typechecked clean and failed only at runtime.
Making the contract honest turned the drift into two `npm run check` failures
that named both callers — the enforcement CLAUDE.md asks for on a static
property, rather than a test that would have to remember to look.

A written-back item now also carries a parent, read from the session's own row:
`sessions.taskId`, else `threadId` out of `sourceCorrelationJson`. Resolving it
is total by construction — an unresolvable parent writes a parentless item and
never discards the agent's work. The first version threw and would have dropped
the whole writeback batch; the existing subscriber test caught it.

### The frame is reached by a sole fenced ```html block, and only that

A knowledge item whose **only** derived block is a fenced ```html block renders
in the AZ6 sandbox frame. One sitting alongside other blocks stays a code
listing. The sole-block rule is what separates "this document IS an interactive
artifact" from "this document contains an HTML sample", and it is deliberate — an
earlier reading that let any fenced html block run was rejected.

The decision lives in `KnowledgeBody`, where the whole block list is visible, not
in `renderPayload`, which sees one payload at a time. `ArtifactFrame`'s props are
untouched: `build-srcdoc.ts` deliberately exposes no sandbox or CSP knobs and a
call site must not be able to loosen the seal.

### AC2 is a boundary rule, and it names symbols rather than the word

`tools/governance/src/rules/artifact-is-not-a-storage-concept.ts`. The banned
list names identifiers — `ArtifactRow`, `producingTaskId`, `previewJson`,
`ARTIFACT_KINDS`, `ArtifactRef`, `/api/artifacts` and so on — never the bare word
`artifacts`. That is load-bearing: `artifacts:` is a live key in five unrelated
shapes that all survive (the handoff filename array, the review canvas, review
composition, the core-api port client, the threads write arm), and a rule that
banned the word would need a carve-out for each one.

### Graduation had no mechanism, and this plan opens with it

This plan's first paragraph says *"Giving either one a knowledge-item parent
later is how it graduates into the team's knowledge tree"*, and AC6 tests exactly
that. It cannot happen today.

Phase 1 made the parent **create-only**, on purpose:
`KERNEL_EDITABLE_FIELDS` (`knowledge-repository.ts`) omits both `role` and the
parent, and `updateKnowledgeSchema` omits them too, so `z.object` strips a parent
out of a PATCH body before it reaches the repository. That was the right call for
the defect it closed — a person could otherwise repoint a routine's prompt or an
agent's identity at something else — and reopening the field generically would
undo it.

So graduation is a **narrow, dedicated transition**, not a reopened field:

- Allowed only when the item's role is `ordinary`. A skill, rule, agent file or
  routine prompt can never be reparented by this path, which is the guarantee
  phase 1 bought.
- Allowed only when the current parent is `task` or `thread` — that is what a
  produced item is. An item already in the tree is not graduating.
- The new parent is a `knowledge_item` that exists, or nothing at all, which
  means the top of the tree.
- It writes an edit-log entry carrying the old parent, which is what makes AC6
  satisfiable and what the plan's "provenance is history, not a column" decision
  depends on: the original task id survives as that entry's `oldValue` and there
  is nowhere else it is kept.

The narrow shape is the point. One transition, with its own preconditions, cannot
be pointed at a routine prompt however it is called.
