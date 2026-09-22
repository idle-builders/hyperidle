# The Three Views

The app has exactly three views — **Conversations**, **Work**, **Knowledge** — plus the always-present shell. They share one data store, one identity model, and one [Thread primitive](thread-primitive.md); each has its own affordances tuned for its purpose. Shell layout structure (sidebar, routes, shortcuts) lives in [information-architecture/app-shell-always-present.md](../information-architecture/app-shell-always-present.md); per-view page structure lives in the [information-architecture view docs](../information-architecture/index.md).

## One door

The human never thinks "which app do I open?". They open HyperIdle, scan Conversations, and work through review threads. Once or twice a week the main pane shifts to Work or Knowledge. The assistant overlay is always one action away. One door — the day/week/month rhythm this enables is narrated in [guides/user/running-your-team.md](../guides/user/running-your-team.md).

## Decidability, not brevity

**15-second decidability is the target for simple review items, but the view never *forces* a 15-second decision.** When the human wants a conversation, the view lets them — a good chat thread is worth 5 minutes of back-and-forth far more than a bad 15-second approve. Fast when fast is enough, conversational when the problem warrants it. This is the canonical statement of the principle; [requirements](../requirements/users-and-their-modes-of-engagement.md) links here.

## Conversations — review and chat

The messaging surface. Reviews and chat — all as threads, on the same infrastructure agents use to talk to each other: one shared message store with identities, threads, and delivery rules. Humans are identities in the matrix, not a special category outside it (`messages.senderId → users.id`, `framework/db/src/schema.ts`).

Consequence: **agents can initiate conversations with humans**, not just surface things for approval. An agent noticing a cross-task pattern starts a thread; the human replies, ignores, or escalates. Humans start threads too, via the RecipientPicker (`layers/core-ui/src/components/RecipientPicker.tsx`) — pick an agent, type, send; replies arrive over WebSocket.

"Review thread" and "chat thread" are experience shorthand, not thread types. A thread has no `kind` column — shape lives on typed *messages* (a review message embeds an artifact + verdict affordance; a plain message is text), and a thread moves between the two experiences as messages are appended. The full Thread/Message model, the five-verdict grammar, and derived blocking are owned by [thread-primitive.md](thread-primitive.md).

What the thread list must make decidable at a glance, without reading content:

1. **Review vs. chat** — a pending verdict is visibly marked on the ThreadRow.
2. **Blocking vs. non-blocking** — a blocking thread means an agent is paused waiting; it gets distinct treatment and sorts first.

Each ThreadRow shows sender, subject/first-line summary, timestamp, and those two indicators. The assistant's thread is pinned on top (`threads.pinned`, schema.ts). The `ConversationsFilter` enum is `all | blocking | async` (`framework/domain-model/src/thread.ts`); filtering is programmatic state. The visible chip bar (Blocking / Unread) was removed in AF14 AC4 — neither chip matched real state (`Conversations.tsx`).

**Session dial-in.** The founder can dial into a running session to observe the agent's live activity stream — read-only tool calls and reasoning, with `All | Tools | Reasoning` filter tabs (`layers/core-ui/src/components/SessionActivityPanel.tsx`). Toggled with the `D` key inside Conversations (`layers/core-ui/src/pages/Conversations.tsx`); the panel opens as a right-hand split. UI detail: [information-architecture/conversations-view.md](../information-architecture/conversations-view.md).

Artifact embeds inside review messages (the five `ArtifactView` shapes) are owned by [process-layer/artifact-primitive.md](../process-layer/artifact-primitive.md). The review page itself — canvases, verdict UI, trust surface — is [review-primitive.md](review-primitive.md); notification cadence is [notification-primitive.md](notification-primitive.md).

## Work — plan and track

Tasks: planning what to do and tracking what's in flight. The Work landing page is a flat, attention-sorted team list — one row per team with status chip and in-progress task count (`WorkOverview.tsx`, AD9) — drilling into team → task detail → subtask to any depth. Task lifecycle (`proposed | accepted | hold | in_progress | blocked | review | done | killed`) is owned by [process-layer/tasks-and-sessions.md](../process-layer/tasks-and-sessions.md); page structure by [information-architecture/work-view.md](../information-architecture/work-view.md). Task bodies render as Blocks with anchored discussion — see [docs/blocks/](../blocks/index.md).

Two view-level principles:

- **Tasks are agent-owned.** Humans do not drag tasks between states — there is no board. Humans request state changes through the thread attached to the task (`tasks.ownerAgentId`, `tasks.threadId`, schema.ts,225). The task list gives visibility without requiring the human to dive into individual threads.

## Knowledge — curate

The company wiki — a nested tree of documents, not a page hierarchy. Think Confluence, not Jira. The human searches, filters, reads, edits inline, and **creates** documents directly; agents contribute through `edit_document`, in their sessions or through the sandbox. It is **not an approval gate** — knowledge flows freely without per-change human review. It is *async curation* that prevents AI-only drift. This is the most critical view to get right and the easiest to skip, because nothing forces you to open it; without it the knowledge base is a community of bots talking to itself.

**Scopes.** Documents are authored at any of three scopes — `factory, team, user` (`SCOPE_KINDS`, `framework/domain-model/src/types.ts`); `user`-scoped documents are private and show a "Private" badge. There is no topic grouping — where a document sits in the tree is what it is about, and the Curated tab renders that tree directly (`DocumentList.tsx`, `DocumentTreeList.tsx`). Store semantics: [knowledge-architecture/the-canonical-store.md](../knowledge-architecture/the-canonical-store.md).

**Curation through exploration.** The corpus is too small (hundreds of documents) and interaction too infrequent for algorithmic recommendation to carry the view — no algorithm has enough signal. The view must excel at **browsing**: Curated is the tree itself, and Triage is every `proposed` document, plain recency order — there is no attention score behind it, and no scoring engine of any kind. A librarian agent (the document-management plugin's `document-triage`/`document-decay` routines) does the first pass by judgement on a schedule; the human's own Triage pass catches what it didn't.

**Read and edit in one surface.** Opening a document shows the full body, editable inline — no separate edit mode. Changes auto-save with a version check, refusing and discarding a stale save rather than silently overwriting it, and **every edit lands in the shared `changes` table** (`document.changed`, `schema.ts`) — the same history table every other primitive uses. Shipped grammar: search (case-insensitive `ILIKE` over title and body, `layers/core-api/document/src/document-store.ts`), filter, inline edit, archive (soft-delete to `archived`), create at any scope, change scope, move within the tree, and per-document threads plus per-block anchored discussion (`messages.blockId`, schema.ts — see [docs/blocks/](../blocks/index.md)).

**Design principle: editing collective intelligence, not grading homework.** The human is a senior member of the practice tending the garden, not an auditor signing off on every contribution.

Why enterprise knowledge tools fail, and the counters built in: stale content → facilitator attention scoring and health signals; volume without structure → topics as the browsable mid-level; no curation workflow → the needs-attention triage as a starting point; bad search → results carry scope, topic, and status context.

## Cross-cutting primitives

Each view renders the same primitives; none owns them:

- **Thread / Message / verdicts** — [thread-primitive.md](thread-primitive.md)
- **Blocks** — [docs/blocks/](../blocks/index.md)
- **Artifacts and embed shapes** — [process-layer/artifact-primitive.md](../process-layer/artifact-primitive.md)
- **Review surface and trust** — [review-primitive.md](review-primitive.md)
- **Notifications and cadence** — [notification-primitive.md](notification-primitive.md)
