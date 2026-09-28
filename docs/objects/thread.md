# Thread

A thread is a conversation attached to one host entity. It holds an append-only sequence of typed messages.

Source: `framework/domain-model/src/thread.ts`, `framework/domain-model/src/actions/thread.ts`.

## Host kinds (closed)

`HOST_KINDS` (`thread.ts`): `document | agent | user | team | factory`.

There is no `task` host kind. A task's thread is `team`-hosted; the task holds a `threadId` column pointing to it. One thread can belong to many tasks (e.g. all tasks created inside that team conversation share it); a task has exactly one thread.

- **document** — thread on a document, visible to anyone who can read the document.
- **agent** — thread between a person and an agent (direct message shape).
- **user** — thread between two people.
- **team** — team-wide conversation, visible to the whole team.
- **factory** — factory-wide, visible to everyone.

`team` and `factory` threads are readable by any signed-in principal. `agent` and `user` threads are readable by members only.

## Thread fields

From `ThreadSchema` (`actions/thread.ts`):

- `hostKind`, `hostId` — the entity the thread is about.
- `initiatorId` — who opened it (not the owner; threads have no owner).
- `members` — parsed from the `participants` JSON column.
- `title` — stored column (null ⇒ use `computedTitle`).
- `computedTitle` — viewer-relative, never empty.
- `pinned`, `resolvedAt`, `deletedAt`, `lastActiveAt`, `createdAt`.

Host is immutable after creation.

## Message types (closed)

`MESSAGE_TYPES` (`thread.ts`): `plain | review | questionnaire | verdict`.

- **plain** — text, optional inline refs (entity refs, mention refs, canvas refs), optional `blockId` anchor.
- **review** — agent submits evidence for a human to decide on; has a `title`, `reasoning`, optional `artifacts` (canvas payloads).
- **questionnaire** — agent asks a constrained question; has a `title`, `question`, `options`.
- **verdict** — human answers a review or questionnaire; carries `decision` and `resolvesMessageId`.

Messages are append-only. Payload is immutable after persistence. Soft-delete via `deletedAt`. Redaction replaces payload with `{ redacted: true, redactedBy, redactedAt, reason }`.

## Inline refs

A plain message may carry `refs: InlineRef[]`. `InlineRef` is a discriminated union:

- `EntityRef` — kind `document | task | message`.
- `MentionRef` — kind `mention`; carries `identityId`, `displayName`, `sourceText`.
- `CanvasArtifactRef` — kind `artifact`; points to a `ReviewCanvasArtifact` id inside a review message payload, not a stored artifacts-table row.

## Verdict grammar

Five decisions: `approve`, `approve-with-comments`, `request-changes`, `edit`, `reject`. Declared in `VERDICT_DECISIONS` (`thread.ts`).

A verdict message carries `decision` + `resolvesMessageId` pointing at the review or questionnaire it terminates. Resolving sets `resolvedAt` on that message.

Display labels: approve / approve-with-comments → APPROVED; reject → REJECTED; request-changes → CHANGES REQUESTED; edit → EDITED.

## The review flow

An agent asks for a human decision by sending a review message (`send_message({ review: ... })`). That session ends. The `review_sessions` table records the link between review message and session. When a human sends a verdict, the verdict handler (`thread-actions.ts`) calls `recordVerdictAndQueueResume` which queues a `session_resume` work intent. The agent's session is resumed with the verdict as input.

No interception exists. The agent elects to ask; nothing blocks a tool call pending approval.

## Idempotency

Appends carry a `clientKey`. The unique constraint `(thread_id, sender_id, client_key)` dedupes retries: a duplicate returns the canonical id, not a new row.

## Who may post

Anyone who can read a thread may also post to it (`canWriteThread = canReadThread`). For `team` and `factory` hosts that is any signed-in user; for `agent` and `user` hosts it is members only.

## Wake rule

After a message lands, agents are woken if:

- They were mentioned in the message text.
- The thread has exactly two members and the other one is an agent.

The sender is never woken. Code: `agentsToWake`, `actions/thread.ts`.

## Review canvas kinds

Nine kinds, declared in `REVIEW_CANVAS_KINDS` (`thread.ts`): `outcome_summary`, `field_change_set`, `action_operation`, `rendered_in_context`, `metrics_moved`, `visual_diff`, `code_diff`, `batch`, `browser_preview`. Plus an unknown fallback.

See [interface/reviews.md](../interface/reviews.md) for how the review page renders these.
