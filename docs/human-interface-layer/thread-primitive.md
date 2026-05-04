# Thread primitive (TRACK-L L1 — full spec at `docs/human-interface-layer/the-three-views-the-rail.md` §4.5)

A Thread is a *container* (no shape of its own) — an append-only chronologically-ordered sequence of typed Messages, attached to exactly one host entity. Differences between "review", "chat", "coach" live on the *messages* (typed shapes) and on the thread's *configuration* (host + pinning + membership), never on the thread itself.

```
Thread {
  id, host_kind, host_id, initiator, participants[],
  pinned, blocking (derived), resolved_at, last_active_at, created_at
}

Message {
  id, thread_id, sender, type, payload, client_key, deleted_at, created_at
}
```

- **Host kinds (closed):** `bet | task | knowledge_item | artifact | agent | user | team | factory`. Adding a host kind requires a concept-doc update first (HIL §4.5). No orphan threads — coach-style threads attach to the user themselves.
- **Message types (closed):** `plain | review | questionnaire | verdict`. Adding a type requires a concept-doc update first. Renderer dispatches via TypeScript discriminant exhaustiveness. A `verdict` message carries `decision` (one of the 5 binding actions) AND `resolvesMessageId` pointing at the review/questionnaire message it terminates.
- **Configurations (descriptive, not enum):** DM (host=agent/user, two participants), coach (host=user, pinned), feed (host=team/factory, broadcast). Recognisable patterns — not a typed enum.
- **Blocking (derived):** a thread is *blocking* iff the agent participating in the thread cannot continue to work without an answer to a message in the thread. Drives ordering (blocking threads sort first).
- **Verdict semantics:** five verdict-grammar actions are binding verdicts that emit a `verdict`-payload message and terminate the review (`approve`, `approve-with-comments`, `request-changes`, `edit`, `reject`). Three emit `plain` messages and do not terminate (`comment`, `inline-comment`, `reply`). Two are sidecar workflow operations and emit no message in the thread (`snooze`, `escalate`).
- **Mutability:** thread `host_kind`/`host_id` immutable after creation, except the `user → factory` re-home on user offboarding. `pinned`, `resolved_at`, `last_active_at` mutable. Message `payload` immutable after persistence (audit invariant); soft-delete via `deleted_at` allowed; redaction allowed via structured replacement payload preserving id/sender/type/created_at.
- **Identity / idempotency:** opaque server ids; ordering by `(created_at, id)` ascending; appends carry `client_key`; uniqueness constraint `(thread_id, sender, client_key)` to dedupe at-least-once retries.
- **Authority:** server-authoritative; every write emits an event to the Event Bus (ARCHITECTURE.md §2.6). Agents and humans are equal participants.
- **Migration policy (L1):** forward-only. Legacy `threads.kind`, `messages.recipient_id`, `messages.subject`, `messages.body`, `messages.file_lease_ids` columns are dropped. Existing rows project: legacy `threads.kind = 'coach'` → host_kind=`user`, host_id=initiator, pinned=true; legacy `kind = 'review' / 'chat'` → host_kind set from the referencing item or task; `recipient_id` folds into `participants`; `subject` + `body` fold into `payload.text` for `type = 'plain'`. The legacy `responses` table is dropped — verdict-payload messages replace it. Rollback: revert the migration; existing data is preserved through a snapshot taken at migration start.

Implementation stories that consume this contract: L7 (verdict commit unblocks agent), L8 (Submenu thread sections), L9 (one detail surface per thread), L11 (rich review messages), L18 (bet detail threads), L21, L26 (per-block discussion via threads on knowledge items).
