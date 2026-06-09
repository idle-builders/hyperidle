# AE5 Concept — Communication Refinements

## Required reading (for `/architecture` and `/pipeline`)

- `docs/blocks/canonical-shapes.md` — Block type signatures, InlineRef vocabulary
- `docs/blocks/composition.md` — BlockRef, InlineRef, anchor vs reference distinction
- `docs/blocks/definition.md` — Block is derived, read-path only
- `docs/human-interface-layer/thread-primitive.md` — Thread contract, host kinds, message types, participants, blocking
- `docs/human-interface-layer/interaction-cadences-notification-discipline.md` — notification model
- `docs/process-layer/handoff-the-coordination-primitive.md` — handoff protocol (related attention mechanism)
- `packages/shared/src/thread.ts` — Thread/Message/PlainPayload/InlineRef types
- `packages/shared/src/team.ts` — AgentOperationalStatus, RosterMember (existing presence)
- `packages/shared/src/events.ts` — DomainEvent union, KernelEvent types

---

## Noun classification

| Noun | Classification | Concept work needed |
|---|---|---|
| **Mention** | New primitive | Yes — enters all phases below |
| Thread context link | Stable concept | No — `Thread.hostKind` + `Thread.hostId` already carry this. UI affordance only. |
| Agent presence | Stable concept | No — `AgentOperationalStatus` (active/idle/error) exists on `RosterMember` since AB2. UI surfacing only. |

---

## Mention primitive

**Definition.** A Mention is an inline attention-routing element within a message's text that resolves to a participant identity, adds that identity to the thread's participant list, and renders as a highlighted token. It composes with the existing Thread participant model — the thread appearing in the mentioned person's Conversations view IS the notification.

### Essential properties

- **`identityId: IdentityId`** — the resolved target of the mention. Always a single identity (agent or human), never a team, role, or group.
- **`displayName: string`** — the human-readable name rendered in the highlighted token. Derived from the identity at write-time and cached on the mention ref so rendering doesn't require a lookup.
- **`sourceText: string`** — the original `@name` token as written in the message text. Preserved for round-trip fidelity (the text field stays human-readable).

### What a Mention is NOT

1. **Not a Block-level element.** Despite the AE5 spec saying "inline element within the block primitive," mentions live at the message level (PlainPayload), not inside markdown bodies (knowledge items, bet pitches). Block-level mentions are deferred — without a notification mechanism for document readers, recording them has no action. **Why:** Blocks are derived, read-path projections of GFM markdown. Adding `@mention` syntax to GFM would require a custom markdown dialect, violating the hard rule "GFM only on disk" (docs/blocks/contracts.md §8.5 hard rule 1).

2. **Not a new message type.** A mention is an inline element within `PlainPayload.text`, not a new `MessageType` variant. The `MESSAGE_TYPES` closed enum stays unchanged. **Why:** A mention is content decoration inside a message, not a structurally different kind of message. Adding a message type would force every renderer to handle a new discriminant for what is fundamentally a paragraph with highlighted tokens.

3. **Not a standalone notification primitive.** There is no `Notification` entity created by a mention. The semantic action is "add participant to thread" — the thread's presence in Conversations is the notification surface. **Why:** Building a separate notification primitive for mentions alone is premature. The existing `notification_queue` table handles push notifications for blocking reviews; mentions use the simpler path of thread membership.

4. **Not a group/fan-out mechanism.** No `@team`, `@role`, `@everyone`, `@here`. A mention resolves to exactly one `IdentityId`. **Why:** Group mentions create fan-out complexity (adding N participants) and require resolving team membership at write-time, which introduces coupling to team composition. Individual mentions keep the action predictable and the participant list auditable.

5. **Not an EntityRef or BlockRef.** A mention is a new third variant in the `InlineRef` discriminated union — it shares the `refs[]` array on PlainPayload but has a different shape and rendering. EntityRef/BlockRef embeds render as cards; mentions render as highlighted inline tokens. **Why:** Collapsing mentions into the existing `EntityRef` shape would require repurposing `kind` values and losing the mention-specific `displayName` field. MentionRef needs its own interface in the union.

### Composition

- **Lives inside** a `PlainPayload` message. The `@name` syntax appears in `PlainPayload.text`; the parsed mention is stored as a new variant in `PlainPayload.refs[]`.
- **Resolves to** an `IdentityId` — the same identity type used for `Thread.participants`, `Message.senderId`, and throughout the system.
- **Triggers** a side effect at message-write time: the mentioned identity is added to `Thread.participants` if not already present.
- **Is rendered by** the message renderer as a highlighted inline token (styled differently from plain text and from InlineRef entity embeds).

### Lifecycle

Mentions have no independent lifecycle — they are immutable once the message is persisted (per the Thread contract: "Message payload immutable after persistence"). The participant-addition side effect is atomic with the message write.

| Event | What happens |
|---|---|
| Message with `@name` is submitted | Parse `@name` tokens → resolve each to IdentityId → store as MentionRef in `refs[]` → add to `thread.participants` → persist message |
| Message is soft-deleted | Mention refs remain in payload (audit invariant). Participant membership is NOT reverted — once added, a participant stays. |
| Message is redacted | Mention refs are stripped (redaction replaces the entire payload). Participant membership is NOT reverted. |

### Authority

- **Write-time resolution:** The server resolves `@name` tokens to `IdentityId` at message creation time. The client sends raw text with `@name` tokens; the server parses, validates, and returns the message with structured `MentionRef` entries.
- **Server-authoritative:** Same as all Thread/Message operations. The server owns participant management.

### Vocabulary

| Term | Definition | Aliases not to use |
|---|---|---|
| **Mention** | Inline attention-routing element in a message that resolves to a participant identity. | tag, ping, at-mention, notification |
| **MentionRef** | The structured entry in `PlainPayload.refs[]` representing a parsed mention. Discriminated by `kind: "mention"`. | mention-ref, mention-link, participant-ref |

### Contracts

**Cardinality.** A message carries 0..N mentions. Each mention resolves to exactly one identity. Multiple mentions of the same identity in one message produce one MentionRef (deduplicated).

**Closure.** `MentionRef` is a new variant in the `InlineRef` discriminated union, adding `kind: "mention"` as the seventh kind (after `knowledge_item | task | artifact | bet | message | block`). The `InlineRefKind` type must be updated. This follows the same extension pattern as L2's addition of `kind: "block"`.

**Mutability.** Immutable after message persistence. No editing mentions after the fact. Participant addition is a one-way operation.

**Identity.** A MentionRef is identified by `(kind: "mention", identityId)`. No separate id — the identity reference IS the identity.

**Hard rules.**
1. **Resolution is server-side.** The client never resolves `@name` to `IdentityId`. The server validates that the identity exists and is resolvable from the thread's context (same team, same factory, or globally known).
2. **Participant addition is atomic with message write.** The mention and the participant-list update happen in the same transaction. No mention without participant addition; no participant addition without a mention message.
3. **No self-mention.** Mentioning yourself is a no-op — the sender is already a participant.
4. **Unknown `@name` tokens are left as plain text.** If `@foo` doesn't resolve to a known identity, it stays as literal text in the message. No error, no special rendering. The client may offer autocomplete to prevent this, but the server is lenient.

### Rationale

The founder confirmed that a mention's semantic action is "add this person to this thread so it appears in their Conversations." This reframing — mention as participant-routing, not as notification — means the concept composes entirely with the existing Thread participant model. No new notification primitive, no new event type, no new table. The thread's appearance in Conversations IS the attention signal. This is the simplest possible shape that delivers the AE5 acceptance criterion "Users can @mention a specific participant, and the mentioned user receives a notification" — the "notification" is the thread showing up in their view.

Block-level mentions (inside knowledge items, bet pitches) are explicitly deferred. The hard rule "GFM only on disk" means we cannot store `@mention` syntax in markdown bodies without violating the Block primitive contract. A future workpackage could introduce block-level mentions as a separate concern if a notification mechanism for document readers is ever built.

---

## Type signature sketch (for `/architecture` to refine)

```ts
// New variant in InlineRef discriminated union
export interface MentionRef {
  readonly kind: "mention";
  readonly identityId: IdentityId;
  readonly displayName: string;
}

// Updated InlineRef union (was 6 kinds, now 7)
export type InlineRefKind = "knowledge_item" | "task" | "artifact" | "bet" | "message" | "block" | "mention";
export type InlineRef = EntityRef | BlockRef | MentionRef;
```

---

## Stable concepts (no concept work, noted for downstream)

### Thread context link

`Thread.hostKind` and `Thread.hostId` already carry the full backlink to the host entity. The AE5 feature is a UI affordance: render the host reference as a clickable breadcrumb/chip in the thread header within the Conversations view. No new data, no new contract. `/design` handles the visual treatment.

### Agent presence

`AgentOperationalStatus` ("active" | "idle" | "error") already exists on `RosterMember` (AB2). `activeTaskTitle` and `activeTaskId` carry the current work context. The AE5 feature is surfacing this indicator in additional places (conversation participant list, thread headers). No new derivation logic. `/design` handles where and how to display it.
