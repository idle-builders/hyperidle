## 4. Composition

A Block:

- **Belongs to** exactly one source markdown body. The body's host (a knowledge item, a bet pitch, a future surface) owns the body; the body owns the Blocks derived from it. There is no orphan Block.
- **Hosts** zero or one **anchor** as its own property. The anchor is the attachment key that other primitives use to reference this block.
- **Is referenced by** Threads (per L1) when a thread is anchored to this specific block — for L26 (per-block discussion on Knowledge) and any future per-block discussion surface. Block-anchored threads are stored as plain L1 threads with `attachedTo = { kind: "block", blockId, hostKind, hostId }`. The "block-anchor" the L2 story names is this reference shape, not a separate linking primitive.

  **L1 attachment-vocabulary extension.** L1 (Thread, story L1 in `plans/work-packages/TRACK-L.md` lines 23–67) declares a **closed** attachment-kind enum: `bet | task | knowledge_item | artifact | agent | user`. L2 **extends** that closed set by adding `block` as a seventh attachment kind. This is a concept-level coordination — until the L1 concept doc lands in `docs/`, L2 carries the registered claim. When the L1 concept doc is drafted (or its canonical-shapes row is finalised), it MUST list `block` in the closed attachment vocabulary. `docs/blocks/canonical-shapes.md` records the closed L1 host pair as `'bet' | 'task' | 'knowledge_item' | 'artifact' | 'agent' | 'user'` with no open-ended escape hatch.

  > NOTE — to L1 author: the L1 concept doc, when drafted, must include `block` in the closed attachment vocabulary. The seventh kind is L2's contribution; closing the enum without it breaks L26 (per-block discussion).
- **Is cited by** Messages (per L1) when a message carries a **Block Reference** in its `refs` array — `{ kind: "block", blockId, hostKind, hostId }`. Unlike block-anchored threads (which live within the host's own thread), block references travel on ANY thread: DMs, the assistant chat, team discussions. The message's rendering surface resolves the ref at read time (fetches body → derives blocks → finds match → renders inline embed). If the block no longer exists (body was edited), the embed shows "source changed."

  **InlineRef vocabulary extension.** `InlineRef.kind` (on `PlainPayload.refs[]`) is a closed enum: `knowledge_item | task | artifact | bet | message`. Block references extend it by adding `block` as a sixth kind. The `block` variant carries additional fields (`blockId`, `hostKind`, `hostId`) making `InlineRef` a discriminated union. This parallels the L2 extension of L1's attachment vocabulary above — both add `block` to a closed enum.

  **Distinction: block anchor vs block reference.** A block anchor (`payload.blockId` on a message within the host's own thread) is _positional_ — the message renders next to the block in the body view. A block reference (`refs[].kind = "block"` on any message in any thread) is _contextual_ — the block content renders as an embed card in the thread. Both use the same `(blockId, hostKind, hostId)` coordinate. Both coexist; neither replaces the other.

- **Carries** a `payload` whose shape depends on `kind`. Payloads are normalised AST nodes (typed per kind) — never raw HTML, never markdown source, never a re-flattened string when structure exists.

The composition is one-way: blocks know nothing about who references them. A thread knows it is anchored to `blockId X on body Y`; a message knows it references `blockId X on body Y`; the block does not know its inbound threads or references. This keeps derivation pure (§8).

---
