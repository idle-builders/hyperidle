# Block — Definition

## 1. What a Block is

**A Block is a derived, addressable, renderable region of a markdown body.** It is a *projection* — the output of running a deterministic, GitHub-flavoured-markdown parser (remark-parse + remark-gfm, `framework/block-derivation/src/blocks/derive-blocks.ts:18-20`) over a stored markdown body and grouping the resulting AST into one of a closed set of **BlockKind** shapes (`framework/domain-model/src/blocks/types.ts:6-18`). Each block carries a stable **BlockId**, the normalised structural data the renderer needs, and an **anchor** affordance that lets external surfaces attach to it (a comment, a link target, a hover popover).

Blocks live entirely on the read path. The on-disk format is plain markdown. The database stores plain markdown (`documents.body` and peers). The Knowledge Fabric watches plain markdown files (see [sync and conflict resolution](../knowledge-architecture/sync-and-conflict-resolution.md)). Blocks exist only at render time — derivation is client-side, per-render, uncached (`layers/core-ui/src/hooks/useBlockResolution.ts:12-14`); the only cache is a client-side *body* cache keyed by `(hostKind, hostId)` for the page session.

Front matter is **not** surfaced as body-level metadata — that was deferred; front matter derives as ordinary markdown blocks. See [canonical-shapes.md](canonical-shapes.md).

## 2. Essential properties

Every Block has (`framework/domain-model/src/blocks/types.ts:94-106`):

- **`id: BlockId`** — a stable identifier derived from the block's kind, outline path, and normalised payload (`framework/block-derivation/src/blocks/block-id.ts:13-23`). Stable across re-parses with identical content; stable when neighbour blocks change but the block itself does not — neighbour content is never a hash input. Algorithm in [contracts.md](contracts.md).
- **`kind: BlockKind`** — one of the ten-kind closed set. Owned by [canonical-shapes.md](canonical-shapes.md).
- **`source: { hostKind, hostId, bodyDigest, range }`** — the host body it was derived from. `hostKind` is one of `task | document | agent | user` (`BlockHostKind`, `framework/domain-model/src/thread.ts`; there is no `bet` host kind — a bet is a task with no parent). `bodyDigest` is a blake2s_256 hash of the body — the field name reflects the algorithm (blake2s, not sha); it is not named `shaDigest` (`derive-blocks.ts:41-43`). `range` is the byte range inside the body — informational only, never load-bearing for identity.
- **`payload`** — the kind-specific structured shape the renderer needs (`BlockPayload` union, `framework/domain-model/src/blocks/types.ts`).
- **`anchor: BlockAnchor`** — a `{ blockId }` reference any consumer (a thread, a link, a hover preview) uses as its attachment key (`framework/domain-model/src/blocks/types.ts`; set on every block, `derive-blocks.ts:414`). The anchor is *not* a separate primitive; it is a property of the block itself.

That is the essential field set. Anything else (hover preview text, highlighted HTML, the rendered React node) is the renderer's job, not the block's shape.

### 2.1 Informational fields (debug / render-order only)

- **`order: number`** — the block's 0-indexed position in the document, assigned positionally (`derive-blocks.ts:415`). Stable within one derivation, unstable across edits — a re-derivation after an edit re-assigns `order` by position. **Never identity.** Never use it for thread attachment, link targets, or any persistent reference; use `id`, always.

The derivation result is `BlockDerivationResult = { blocks }` — nothing else rides alongside (`framework/domain-model/src/blocks/types.ts`).

## 3. What a Block is NOT

The rejection list is load-bearing. Get any of these wrong and the primitive collapses.

1. **NOT a new on-disk markdown dialect.** The founder's hard rule:

   > these blocks need to work without agents having to follow formatting or us introducing a new markdown dialect, that will fail. this block element needs to be something that we translate in when ingesting the markdown from the files watched back to the application.

   > we do not introduce a new markdown dialect. the markdown dialect stay github dialect compatible

   Agents write GitHub-flavoured markdown to the sandbox. The Knowledge Fabric watches plain markdown files. Blocks emerge at render — there is no `<block id="...">` syntax, no fenced JSON, no MDX, no agent-side awareness of blocks at all.

2. **NOT a chat message.** Messages are independent payload shapes; no conversation surface derives Blocks. Conversations may *reference* blocks (`BlockRefEmbed.tsx`, the `messages.block_id` anchor) — that is anchoring, not folding the two shapes together. See [thread-primitive](../human-interface-layer/thread-primitive.md).

3. **NO per-block source-of-truth row.** There is no `blocks` table; the host's `body TEXT` (e.g. `documents.body`) is the only stored form. An anchor column does exist — `messages.block_id` (`framework/db/src/schema.ts:787-788`, a structured queryable anchor dual-written with the message payload) — but it stores an opaque derived reference, never a per-block primary key. No derivation cache was ever built; derivation is per-render and pure.

4. **NOT a UI component.** The Block is data (`framework/block-derivation/src/blocks/`); the things that paint it are design-system components (`framework/design-system/src/block/`). Block primitive ≠ the design system's Tier-2 component tier — naming (`*Payload` components + `<Block />`) is owned by [ui-design/our-components](../ui-design/our-components.md).

5. **NOT the verb "block" or the state "blocked".** Task lifecycle states `hold` and `blocked` (`framework/domain-model/src/types.ts:13-15`) are workflow states owned by [tasks-and-sessions](../process-layer/tasks-and-sessions.md). Capital-B "Block" is always the content primitive; lower-case "blocked"/"blocking" is always the workflow state. No code symbol mixes the senses.

6. **NOT a transclusion target (yet).** No `{{transclude}}`, no `![[…]]` inclusion. Composition is one body → N blocks, full stop; a block belongs to exactly one body. Cross-body references happen through thread anchors on `blockId` (`BlockRef` in `framework/domain-model/src/thread.ts`, `BlockRefEmbed.tsx`), not through inclusion. Adding transclusion later means bumping `blk:v1` → `blk:v2` (the bump is guarded by `assert-version-bumped.test.ts`).

## 4. Lifecycle

Blocks have no independent lifecycle. They are derived at read time, used for the render, and discarded. The state of a block is exactly the state of its source body:

1. **Body created or written** — by a human in the app or by an agent through the file-watcher writeback path ([sync mechanics](../knowledge-architecture/sync-and-conflict-resolution.md)).
2. **A surface derives on read** — task bodies, knowledge bodies, review canvases, artifact bodies all call the same `deriveBlocks`. Render-surface table in [derivation-and-rendering.md](derivation-and-rendering.md).
3. **Body is edited.** Re-derivation runs. Blocks whose normalised content + outline path are unchanged keep their ids; changed blocks get new ids; vanished blocks are gone. Inbound anchors pointing at a now-missing blockId degrade to a **"source changed"** indicator (`BlockRefEmbed.tsx:10`, `review-canvas.tsx:176`) — the thread or message survives.
4. **Body is deleted.** All derived blocks are gone (nothing stored to delete). Anchored threads render the same degraded indicator and continue under their own lifecycle.

There is no block status, no block draft, no block archived — the Block type carries no state fields.

## 5. Authority

- **Owner of the source body:** the host entity (document, task, artifact, agent, user). Its existing authority model governs; see [process-layer](../process-layer/index.md) for work primitives.
- **Sole producer of Blocks:** `deriveBlocks` (`framework/block-derivation/src/blocks/derive-blocks.ts` — the only `blocks.push`, :409-416). No other code emits Blocks. Resolution is client-side at render time; there is no server-side pre-resolution endpoint (`useBlockResolution.ts` @lore T4).
- **Mutator of Block instances:** nothing. Blocks are values — recompute, never edit. To change a block, edit the source markdown.
- **Mutator of the BlockKind set:** doc-first. Update this folder's concept docs, then [canonical-shapes.md](canonical-shapes.md) (the canonical signature `framework/domain-model/src/blocks/types.ts` cites), then consumers. PRs that change the kind set without the doc update are non-conformant.
- **Owner of the BlockId algorithm:** [contracts.md](contracts.md). `BLOCK_ID_VERSION = "blk:v1"` (`framework/domain-model/src/blocks/types.ts`) is the first hash input; bumping it is a global migration event — every derived id changes, every anchored thread degrades to "source changed" until re-anchored.

## 6. Vocabulary

| Term | Definition | Aliases not to use |
|---|---|---|
| **Block** | The content primitive defined here — a derived, addressable region of a markdown body. Always capitalised in this sense. | section, node, chunk, fragment, segment, slice, partial, snippet |
| **BlockKind** | The closed enum of block shapes (`framework/domain-model/src/blocks/types.ts`). | block-type, block-shape, block-class |
| **BlockId** | The stable identifier of a Block (`blockId()` + `BLOCK_ID_VERSION`). | block-key, block-uid, block-hash (hash is the algorithm, not the term) |
| **BlockAnchor** | A `{ blockId }` reference exposed by a Block as the attachment key for external surfaces. Live as `messages.block_id` and `BlockRef`. | block-link, block-target, block-marker, block-pin |
| **BlockDerivation** | The deterministic function (`deriveBlocks`) that turns a markdown body into an ordered list of Blocks. | parsing, ingestion (larger pipelines that *contain* derivation) |

Two collisions stay distinct from the Block primitive:

- **`block` (verb) / `blocked` (state) / `blocking` (adjective)** — always lower-case; workflow states in the task lifecycle ([tasks-and-sessions](../process-layer/tasks-and-sessions.md)). A status field is `taskStatus` or `reviewBlocking`, never `block`.
- **Design-system "Blocks" component tier** — React widgets, not Block primitives; the components that *render* a Block are `*Payload` + `<Block />`. Naming owned by [ui-design/our-components](../ui-design/our-components.md).

## 7. Rationale

The no-dialect rule (§3.1) forces the whole shape:

- **Agents stay dumb about Blocks.** They write GFM; they cannot write "wrong" markdown — any GFM body yields a valid block list, with `unknown` as the safety valve (`reason: "parser-unrecognised"`, rendered by `UnknownPayload.tsx`).
- **The Knowledge Fabric stays simple.** The watcher copies markdown, never parses blocks; markdown stays a transparent storage format humans can `cat`, `grep`, `git diff` directly (see [knowledge-architecture](../knowledge-architecture/index.md)).
- **Block-anchored discussion is independent of any linking primitive.** The anchor is a property of the block — `{ blockId }` — usable by threads without any wiki-link system (linking remains deferred). This is what let per-block discussion ship first.
- **Re-derivation is cheap and safe.** Derivation is pure (no I/O, no clock, no DB) and fast (<1ms for typical bodies), so every render re-derives; no cache is needed for correctness or shipped at all.

The cost is the BlockId algorithm complexity — paid once, behind a stable contract ([contracts.md](contracts.md)). The payoff is proven: one primitive renders task bodies, document bodies, review canvases, and artifact bodies (`WorkTask.tsx`, `DocumentBody.tsx`, `review-canvas.tsx`, `compose-artifact-body.tsx`) with zero ceremony at the writing surface.
