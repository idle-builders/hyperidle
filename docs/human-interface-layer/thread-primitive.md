# Thread primitive

A Thread is a *container* — an append-only, chronologically ordered sequence of typed Messages attached to exactly one host entity. The thread itself has no shape: there is no `kind` column on threads, ever. All variation lives on the *messages* (typed payloads) and on the thread's derived *configuration* (host + participants + pinning), never on the thread row.

```
Thread {
  id, host_kind, host_id, initiator_id, members[],
  pinned, resolved_at, last_active_at, created_at, direct_key
}

Message {
  id, thread_id, sender_id, type, payload, client_key,
  deleted_at, redacted_at, resolved_at, block_id, created_at
}
```

Thread columns: `framework/db/src/schema.ts`. Message columns: `schema.ts`. `blocking` is derived, never stored.

## Host kinds (closed)

`HOST_KINDS` (`framework/domain-model/src/thread.ts`): `knowledge_item | agent | user | team | factory`. There is no `bet` host kind, no `task` host kind and no `artifact` host kind: a task's own thread is hosted by the task's team, and `tasks.threadId` is a real column set when the task is created — a thread can hold many tasks, and a task has exactly one thread.

- Host = the entity the thread is *about* — not the creator (that is `initiator_id`); no thread has an owner.
- No orphan threads. An assistant-style thread with no domain object attaches to the user themselves.
- Hosts reference threads by query, never own them. A host cannot be hard-deleted while threads reference it — soft-archive only.

## Message types (closed)

`MESSAGE_TYPES` (`thread.ts`): `plain | review | questionnaire | verdict`.

- Rich messages render via a typed dispatch — a TypeScript discriminant with compiler-checked exhaustiveness. No untyped HTML payloads.
- `plain` carries text; `review` carries an artifact reference plus a verdict affordance; `questionnaire` carries a constrained answer set plus an answer slot.
- Verdicts and questionnaire answers are themselves Messages appended to the thread — never hidden state on the review/questionnaire message. The audit trail lives in the message sequence.

## Verdict grammar (five decisions)

`VERDICT_DECISIONS` (`thread.ts`): `approve`, `approve-with-comments`, `request-changes`, `edit`, `reject`. These are the only verdict decisions; the set is locked by `framework/domain-model/src/__tests__/message-types.test.ts`.

- A `verdict` message carries `decision` plus `resolvesMessageId` (`thread.ts`) pointing at the review or questionnaire message it terminates. A binding verdict resolves the review.
- Non-binding discussion — replies, comments — is `plain` messages in the same thread; they never terminate the review.
- Display labels (`verdictDecisionLabel`, `thread.ts`): approve / approve-with-comments → APPROVED, reject → REJECTED, request-changes → CHANGES REQUESTED, edit → EDITED.
- UI is buttons-only: Approve and Request changes as primary buttons, approve-with-comments / edit / reject in the ⋯ overflow menu (`layers/core-ui/src/pages/review/ReviewComposition.tsx`). There are no verdict keyboard shortcuts; Escape is the only bound key (closes the examine pane, `ReviewComposition.tsx`).
- The decision UI lives on the review surface — see [Review primitive](./review-primitive.md).

## Configurations (derived, not an enum)

A configuration is a recognisable pattern of host + participants + pinning — described, never stored. `classifyThreadConfiguration` (`thread.ts`):

- **assistant** — host = user, pinned. (Starts unpinned → classifies as `dm` until the assistant's first response.)
- **feed** — host = team or factory; broadcast.
- **dm** — host = agent or user, exactly two participants.
- **attached** — everything else (thread on a document or artifact).

Post-spec extension: `direct_key` (AF14, `schema.ts`) dedupes direct two-participant threads only, via a partial unique index; null for group/feed/host-scoped threads, and the assistant thread is exempt.

## Blocking (derived)

A thread is **blocking** iff the agent participating in the thread cannot continue to work without an answer to a message in the thread. Never stored — derived (`isBlocking`, `thread.ts`):

- With an unresolved `review`/`questionnaire` HEAD: blocking iff the agent has a session active for this thread.
- Without a HEAD (plain quick-question case): blocking iff the agent explicitly paused on this thread.

An unanswered review whose agent finished and walked away is *not* blocking. Blocking threads sort first in any rendered list — an agent is literally waiting.

## Lifecycle and mutability

- Threads open with `resolved_at` null; it is set when the underlying ask settles (a verdict, an answer, a close). `resolved_at` is not terminal — re-opening clears it.
- Thread host is **immutable** after creation. Single contracted exception: on user offboarding, that user's assistant thread re-homes to `factory` (contract only; not yet exercised in code). `pinned`, `resolved_at`, `last_active_at` are mutable.
- Messages are **append-only**: payload is immutable after persistence (audit invariant — what a participant saw at decision time stays the same). Soft-delete via `deleted_at`; no in-place edits.
- **Redaction** replaces the payload with a structured `{ redacted: true, redactedBy, redactedAt, reason }` payload while preserving the message's id, sender, type, and created_at (`redacted_at`, `schema.ts`).

## Identity and idempotency

- Thread and message ids are opaque and server-generated.
- Message ordering is `(created_at, id)` ascending — the id tiebreaks same-millisecond collisions for deterministic re-render.
- Appends carry a client-generated `client_key`; the unique constraint `(thread_id, sender_id, client_key)` (`messages_idempotency_uq`, `schema.ts`) dedupes at-least-once retries — a duplicate returns the canonical id, not a new row.

## Authority

- Server is the source of truth; every write emits an event (`framework/domain-model/src/actions/thread.ts`, the `send_message` and `adjust_thread` actions; delivery guarantees documented in the `framework/event-bus/src/event-bus.ts` docblock).
- Agents and humans are equal participants: either can initiate a thread to the other. Who may post is exactly who may read: a direct thread is members-only, a team/knowledge-item/factory thread is open to any signed-in principal, and posting to one you can read but are not yet a member of joins you to it in the same transaction.
- Views never own threads. Conversations is one renderer of threads; task detail, knowledge-item detail, artifact detail, and the assistant overlay are others. Threads exist whether or not any view is open.

## Closure discipline

Adding a new message type, a new host kind, or a new verdict decision requires updating this document first — not the schema, not the renderer.

## Relationships

- **Items.** There is no `items` table. The legacy `responses` table is gone too — verdicts project as `verdict`-typed messages (`schema.ts`). A review, a question, an escalation are messages on a thread; the Conversations queue reads `threads` directly.
- **Rendering.** A *Conversation* is the deliberate-messaging reading of a Thread, rendered through the Part model — see [Part model](./part-model.md). It adds no data shape. The conversation rendering unit is a **Part**, never a "Block" — that word is reserved for the content primitive ([Blocks](../blocks/definition.md)).
