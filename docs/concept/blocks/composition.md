## 4. Composition

A Block:

- **Belongs to** exactly one source markdown body. The body's host (a knowledge item, a bet pitch, a future surface) owns the body; the body owns the Blocks derived from it. There is no orphan Block.
- **Hosts** zero or one **anchor** as its own property. The anchor is the attachment key that other primitives use to reference this block.
- **Is referenced by** Threads (per L1) when a thread is anchored to this specific block — for L26 (per-block discussion on Knowledge) and any future per-block discussion surface. Block-anchored threads are stored as plain L1 threads with `attachedTo = { kind: "block", blockId, hostKind, hostId }`. The "block-anchor" the L2 story names is this reference shape, not a separate linking primitive.

  **L1 attachment-vocabulary extension.** L1 (Thread, story L1 in `docs/work-packages/TRACK-L.md` lines 23–67) declares a **closed** attachment-kind enum: `bet | task | knowledge_item | artifact | agent | user`. L2 **extends** that closed set by adding `block` as a seventh attachment kind. This is a concept-level coordination — until the L1 concept doc lands in `docs/concept/`, L2 carries the registered claim. When the L1 concept doc is drafted (or its SHARED.md row is finalised), it MUST list `block` in the closed attachment vocabulary. SHARED.md (`docs/work-packages/SHARED.md` § "Block primitive") records the closed L1 host pair as `'bet' | 'task' | 'knowledge_item' | 'artifact' | 'agent' | 'user'` with no open-ended escape hatch.

  > NOTE — to L1 author: the L1 concept doc, when drafted, must include `block` in the closed attachment vocabulary. The seventh kind is L2's contribution; closing the enum without it breaks L26 (per-block discussion).
- **Carries** a `payload` whose shape depends on `kind`. Payloads are normalised AST nodes (typed per kind) — never raw HTML, never markdown source, never a re-flattened string when structure exists.

The composition is one-way: blocks know nothing about who references them. A thread knows it is anchored to `blockId X on body Y`; the block does not know its inbound threads. This keeps derivation pure (§8).

---
