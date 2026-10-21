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

`MESSAGE_TYPES` (`thread.ts`): `plain | review | questionnaire | verdict | answer`.

- **plain** — text, optional inline refs (entity refs, mention refs), optional `anchor`: where a comment points — a pin on a part of a review, or on a stretch of the text of the thread's document (see [Comments on a document](#comments-on-a-document)), and optional `change`: a change to that text it proposes.
- **review** — something produced, put to a person to judge; has a `title`, `reasoning`, and optionally `stage`, `parts`, `flags`, `previousReviewId` and `changed` (see below).
- **questionnaire** — agent asks a constrained question; has a `title`, `question`, `options` (up to 16).
- **verdict** — a human approves or rejects a review; carries `decision`, `resolvesMessageId` and an optional `note`.
- **answer** — answers a questionnaire; carries `resolvesMessageId` and exactly one of `option` (one of the questionnaire's options, word for word) or `text` (the sender's own words).

Messages are append-only. Payload is immutable after persistence. Soft-delete via `deletedAt`. Redaction replaces payload with `{ redacted: true, redactedBy, redactedAt, reason }`.

## Comments on a document

A comment on a document is a plain message in the document's thread (host kind `document`) whose `anchor` has no `review`: `part` is the document's id and `spot` a `range` — characters `start` up to `end` of its body, as they were when it was sent. `label` holds the covered words, so the page can find them again after the text around them changes. The server refuses such an anchor on a thread that is not a document's (`anchor_needs_review`), or a range outside the body (`pin_range_outside`). A reply repeats the pin, so each pin is its own little comment; the newest message's range is what it covers now.

- **A proposed change** — `change: { from, to }`: the covered text as it was, and as it should become. Anyone proposes one, on a document anchor only (`change_needs_document_anchor`). Applying it puts `to` into the body through `edit_document`; `adjust_thread` with `message: { id, change: "applied" | "dismissed" }` then records who settled it (`change.settled: { state, by, at }`). It settles once (`change_settled`).
- **Resolve** — `adjust_thread` with `message: { id, resolved: true }` on the comment's first message sets its `resolvedAt`; `resolved: false` reopens it.

## Inline refs

A plain message may carry `refs: InlineRef[]`. `InlineRef` is a discriminated union:

- `EntityRef` — kind `document | task | message`.
- `MentionRef` — kind `mention`; carries `identityId`, `displayName`, `sourceText`.

## Verdicts and answers

A review is resolved by a verdict; a questionnaire is resolved by an answer. Nothing else resolves either. Resolving sets `resolvedAt` on the resolved message.

- **Verdict** — two decisions, `approve` and `reject` (`VERDICT_DECISIONS`, `thread.ts`). A `reject` must carry a non-empty `note` saying why; `send_message` refuses one without (`reject_needs_reason`). There is no "request changes" verdict — to ask for a change, comment. Only a human gives a verdict, and never on their own review.
- **Answer** — names one of the questionnaire's options (`answer_unknown_option` if it is not one of them) or gives non-empty text of its own. Humans and agents answer the same way.

Display labels: approve → APPROVED; reject → REJECTED (`verdictDecisionLabel`).

## The review flow

An agent asks for a human decision by sending a review or a questionnaire (`send_message({ review: ... })` / `send_message({ questionnaire: ... })`). That session ends. The `review_sessions` table records the link between the asking message and the session. When the verdict or answer arrives, `send_message` (`thread-actions.ts`) calls the review-verdict recorder, which queues a `session_resume` work intent. The session resumes with a message that says what came back — approved (with the note), rejected (with the reason), or the option picked or words written (`verdict-message.ts`).

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

## Review parts, pins, flags and rounds

Source: `framework/domain-model/src/review.ts`.

- **Parts** — a review is made of parts of six kinds: `preview`, `code`, `image`, `numbers`, `text`, `items`. Each has an `id`, a `label` and a `title`.
- **Pins** — where a flag or a comment points: a part, a few words naming the spot, and a `spot` pointed at the way that part is (an element, a line, a region, a figure, a range of text, an item).
- **Flags** — the sender's own pointers, in the review payload: a pin and what it `says`.
- **Comments** — plain messages whose `anchor` is a pin plus the `review` they are on; a reply repeats the pin, so each pin is its own little thread.
- **Rounds** — a retry is a new review naming the one it follows in `previousReviewId`, in the same thread.

See [interface/reviews.md](../interface/reviews.md) for the whole account.
