# Canonical shapes — the Block type contracts

This file is the canonical signature home for the Block primitive — `framework/domain-model/src/blocks/types.ts:2-3` cites it by path (path frozen, never move). The TypeScript shapes themselves live in `types.ts`; this doc owns the contracts those shapes must honour and the closed kind vocabulary. Concept: [definition.md](./definition.md).

**Hard rule:** the on-disk format stays plain GitHub-flavoured markdown. Blocks are derived at read time and never stored — no dialect, no blocks table (`framework/db/src/schema.ts` stores bodies as markdown).

## 1. The shapes (owned by code)

`framework/domain-model/src/blocks/types.ts` defines `BlockKind`, `BlockHostKind`, `BlockId`, `BlockAnchor`, `BlockPayload`, `Block`, and `BlockDerivationResult`. Do not restate them here or anywhere else in `docs/` — this section records only the contracts behind them:

- **`BlockId`** — hex-encoded 128-bit blake2s of `blk:v1 ‖ kind ‖ outlinePath ‖ normalisedPayload` (`framework/block-derivation/src/blocks/block-id.ts:19-23`, dkLen 16, bytesToHex). Algorithm and normalisation rules: [contracts.md](./contracts.md).
- **`BlockHostKind`** — closed, six kinds: `bet | task | knowledge_item | artifact | agent | user`. No `string` escape hatch.
- **`Block.order`** — informational only, never used for identity.
- **The anchor IS the primitive's own affordance** — `BlockAnchor { blockId }`; there is no separate linking primitive in the codebase.

## 2. How anchoring shipped

Block-anchored discussion is **message-level**, not a thread-attachment kind. Thread `HOST_KINDS` is a closed eight-kind enum (`bet | task | knowledge_item | artifact | agent | user | team | factory` — `framework/domain-model/src/thread.ts:19-28`) and does **not** contain `block`. Instead a message carries an optional `payload.blockId` (`PlainPayloadWithBlockId`, `thread.ts:480-491`), dual-written to the queryable `messages.block_id` column (`framework/db/src/schema.ts:787-794`). There is no parallel comment table. Thread/Message depth: [../human-interface-layer/thread-primitive.md](../human-interface-layer/thread-primitive.md).

## 3. BlockKind — the closed vocabulary

`BlockKind` is **closed**: nine content kinds plus an `unknown` sentinel, ten total (`BLOCK_KINDS`, `framework/domain-model/src/blocks/types.ts`). Adding a kind is doc-first: update this document, then `types.ts`, then the consumers.

| Kind | Semantics |
|---|---|
| `heading` | Section header, level 1–6. Participates in the document outline used for id stability. |
| `paragraph` | Run of inline text. |
| `list` | Bullet or ordered list, possibly nested. **The whole list is one block** — list items are payload children (`ListItem`), not separate blocks. |
| `quote` | Blockquote; nested blocks stay inside its payload. |
| `code` | Fenced code block with optional language tag; body preserved verbatim. |
| `table` | GFM table; rows and column alignment in payload. |
| `divider` | Thematic break (`---` on its own line). |
| `image` | Block-level image — a paragraph that is solely an image is promoted to an `image` block. |
| `html` | Raw HTML block GFM permits, rendered as a sanitised region; if the sanitiser strips it, it falls back to `unknown` with reason `sanitiser-stripped`. |
| `unknown` | Catch-all so derivation **never throws**. Reasons: `parser-unrecognised \| body-too-large \| sanitiser-stripped` (`framework/domain-model/src/blocks/types.ts`). Renders the original source. |

`unknown` is the safety valve: new GFM features land before the kind set is updated, and derivation must emit a useful block instead of crashing or dropping content. When `unknown` blocks start appearing in real bodies, that is the signal to update this list.

## 4. Derivation contract

`deriveBlocks(body, host: { kind, id }) → { blocks }` (`framework/block-derivation/src/blocks/derive-blocks.ts:295-298`). Pure and deterministic — no I/O, no clock, no DB; same input, same output. Lives in `framework/block-derivation`, the one package that carries the markdown parser.

- **No body-level metadata parsing.** `BlockDerivationResult` has only `blocks` (`framework/domain-model/src/blocks/types.ts`); there is no `metadata` sibling field. Three-dash front matter derives as markdown — a `divider` + `paragraph` pair, or `unknown`. A typed metadata pipeline is deferred until a concrete consumer arrives.
- **Derivation is client-side, per render.** The server does not derive blocks at runtime; where derivation attaches, caching, and render surfaces: [derivation-and-rendering.md](./derivation-and-rendering.md). `bodyDigest` on `Block.source` identifies the source body snapshot — it is not used as a cache key.

## 5. Rendering-layer relationship (AM5 outcome)

`BlockKind` stays its own closed AST vocabulary — it was **not** merged into the shared content-Kind set. Text-family artifact bodies render through the same `deriveBlocks` Block stream (`framework/design-system/src/kinds/compose-artifact-body.tsx:88`); the `data` kind renders its own freeform rows table, not `TablePayload` (its `Record<string,string>[]` rows are not GFM-table compatible — `compose-artifact-body.tsx:38-42`). Artifact embed shapes: [../process-layer/artifact-primitive.md](../process-layer/artifact-primitive.md).

## 6. Consumers

Bet bodies, knowledge bodies, and review canvases all render through `Block[]` derived by the shared `deriveBlocks` (`WorkBet.tsx`, `KnowledgeBody.tsx`, `review-canvas.tsx` in `layers/core-ui`). All round-trip GFM losslessly for the nine content kinds; the `unknown` sentinel ensures derivation never throws for unrecognised GFM features. Block-anchored discussion attaches per §2 — message `blockId`, no comment table.
