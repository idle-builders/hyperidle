# Derivation and Rendering

Blocks are derived, never stored. This doc covers where derivation runs, which surfaces render Blocks, and how other primitives attach to a Block (anchor vs reference). Block type contracts and the kind vocabulary are owned by [`canonical-shapes.md`](./canonical-shapes.md); the BlockId hash contract by [`contracts.md`](./contracts.md).

## 1. Where derivation runs

**Client-only, per-render.** `deriveBlocks` lives in `framework/block-derivation/src/blocks/` — pure and deterministic. In production it runs client-side at render time only: no server derivation, no cache of any kind, no `body_sha` column, no `parser_version` key. The per-render cost is accepted because derivation is fast (<1ms for typical bodies) — the web app caches resolved *bodies* (strings), never derived blocks (`layers/core-ui/src/hooks/useBlockResolution.ts:12-14`, @lore T4). The once-considered derivation cache was resolved as **no cache**: pure per-render derivation, including on React re-renders.

**Ingestion is derivation-free.** Both write paths store markdown only:

- **Watcher writeback** — an agent edits a markdown file in the sandbox; the watcher debounces and writes the body back to the canonical store. Mechanics (debounce, polling fallback, conflict handling) are owned by [`sync-and-conflict-resolution.md`](../knowledge-architecture/sync-and-conflict-resolution.md).
- **Direct Knowledge-view edit** — the API writes the body to the canonical store and bumps `knowledge_items.version`.

Neither path derives anything. Derivation happens when a surface renders the body.

**Version safety.** `BLOCK_ID_VERSION = "blk:v1"` (`framework/domain-model/src/blocks/types.ts:36`) is hashed into every BlockId. Any change to derivation semantics requires bumping it — enforced by `framework/domain-model/src/__tests__/blocks/assert-version-bumped.test.ts`.

## 2. Where Blocks render

| Surface | Source body | Renderer |
|---|---|---|
| Bet description | `bets.description` | `layers/core-ui/src/pages/WorkBet.tsx:210` — co-located adapter, `deriveBlocks(description, { kind: "bet", id: betId })` → `<Block />` |
| Knowledge body | `knowledge_items.body` | `layers/core-ui/src/pages/knowledge/KnowledgeBody.tsx` — includes the per-block action popover and inline anchored-message slots (per-block discussion) |
| Review canvas / artifact prose | artifact text bodies | `layers/core-ui/src/pages/review/review-canvas.tsx:78` (`deriveProseBlocks`) and `framework/design-system/src/kinds/compose-artifact-body.tsx`, `{ kind: "artifact" }` |

Artifact embed layouts and the Artifact contract itself are owned by [`artifact-primitive.md`](../process-layer/artifact-primitive.md) — only the Block-derivation side is documented here.

**Conversations never derive.** Chat, review, and questionnaire messages are message payload shapes, not markdown bodies — no conversation or message component calls `deriveBlocks`. Conversations only *reference* blocks (embeds and anchors, §3).

## 3. Composition: anchor vs reference

A Block **belongs to** exactly one source markdown body — `Block.source` carries `(hostKind, hostId, bodyDigest)` — and **hosts** zero or one anchor as its own property (set to its own id, `framework/block-derivation/src/blocks/derive-blocks.ts:414`). There is no orphan Block. Shapes: [`canonical-shapes.md`](./canonical-shapes.md).

Two distinct block-linking shapes, both shipped and coexisting:

1. **Block anchor** (positional). A message *inside the host's own thread* carries `payload.blockId` (+ optional `spotLabel`, AL4) — `PlainPayloadWithBlockId` (`framework/domain-model/src/thread.ts:484`). Dual-written to the queryable `messages.block_id` column (`framework/db/src/schema.ts:788`, T5). The message renders next to its block in the body view (anchored-message slots, `KnowledgeBody.tsx:45`); if the block no longer resolves after an edit, the message shows as orphaned.
2. **Block reference** (contextual). `refs[].{ kind: "block", blockId, hostKind, hostId }` (`BlockRef`, `framework/domain-model/src/thread.ts:117-121`) on any message in **any** thread — DMs, assistant chat, team discussions. The rendering surface resolves the ref client-side at read time (fetch body → derive → find match → embed). If the block no longer exists, the embed degrades to a "source changed" indicator (`layers/core-ui/src/components/BlockRefEmbed.tsx:10`).

Both shapes use the same `(blockId, hostKind, hostId)` coordinate; neither replaces the other.

`InlineRef.kind` is a **closed** discriminated union of seven kinds: `knowledge_item | task | artifact | bet | message | block | mention` (`framework/domain-model/src/thread.ts:102-109`; `mention` added by AE5). The `block` variant is the only one carrying extra fields.

**Not a thread attachment kind.** `HOST_KINDS` closed at eight kinds (`bet | task | knowledge_item | artifact | agent | user | team | factory`, `framework/domain-model/src/thread.ts:19-28`) — there is no `block` attachment kind. Per-block discussion rides the message-level anchor above, not thread attachment. Thread and Message primitives are owned by [`thread-primitive.md`](../human-interface-layer/thread-primitive.md).

**Composition is one-way.** A thread or message knows which block it targets; the Block carries no inbound-ref fields. This keeps derivation pure — the same body always derives to the same Block list, regardless of who references it.
