# Canonical shapes — Block primitive (L2)

The shape every consumer of structured prose imports. Concept: see the rest of `docs/blocks/`. Hard rule: on-disk format stays GitHub-flavoured markdown — Blocks are derived during ingestion, never stored as a dialect.

```ts
// Closed enum: nine content kinds + one `unknown` sentinel = ten total.
// New kinds require updating docs/blocks/blockkind-the-closed-vocabulary.md
// first. Body-level metadata (front matter) is NOT a kind — it rides on the
// sibling `metadata` field below.
type BlockKind =
  | 'heading'
  | 'paragraph'
  | 'list'
  | 'quote'
  | 'code'
  | 'table'
  | 'divider'
  | 'image'
  | 'html'
  | 'unknown'

// Stable id derived from normalised content + outline path. Algorithm:
// docs/blocks/contracts.md § 8.4. Format: hex-encoded 128-bit cryptographic
// hash of (version || kind || outlinePath || normalisedPayload).
type BlockId = string  // opaque

// The anchor IS the primitive's own affordance — no separate linking primitive.
// Threads attach via { kind: 'block', blockId, hostKind, hostId } per L1.
// L1's closed attachment-kind enum is bet | task | knowledge_item | artifact |
// agent | user; L2 extends it by adding `block` as the seventh kind (see
// docs/blocks/composition.md / docs/blocks/contracts.md § 8.5 hard rule 4).
type BlockAnchor = { blockId: BlockId }

// `hostKind` is the closed L1 host enum — no `string` escape hatch. This file
// is single-source-of-truth for the canonical block-type signatures, not a
// place where one story can quietly weaken another's closure.
type BlockHostKind = 'bet' | 'task' | 'knowledge_item' | 'artifact' | 'agent' | 'user'

type Block = {
  id: BlockId
  kind: BlockKind
  source: { hostKind: BlockHostKind; hostId: string; bodyDigest: string; range: { start: number; end: number } }
  payload: BlockPayload  // discriminated by kind; see docs/blocks/blockkind-the-closed-vocabulary.md
  anchor: BlockAnchor
  order: number          // informational only — never used for identity
}

// Pure, deterministic. No I/O, no clock, no DB. Same input -> same output.
// Lives in `packages/shared` and is imported by both server and web — both
// processes use byte-identical code paths (see docs/blocks/where-derivation-attaches-in-the-pipeline.md).
//
// L2 ships without body-level metadata parsing — front matter is treated as
// markdown by remark and either becomes a `divider` + `paragraph` pair (when
// the host body uses three-dash fences) or routes to `unknown`. A typed
// metadata pipeline is deferred until a concrete consumer arrives.
function deriveBlocks(
  body: string,
  host: { kind: BlockHostKind; id: string },
): { blocks: Block[] }
```

Consumer rules (every story below references these, not its own copy):
- L16 (bet pitch) and L23 (knowledge body) render through `Block[]` derived by the shared `deriveBlocks`. Both round-trip GFM losslessly for the nine content kinds.
- L26 (per-block discussion on Knowledge) attaches L1 Threads via `BlockAnchor`. There is no parallel comment table; there is no L24 (linking primitive) dependency.
- The `bodyDigest` field on the source body is the cache key. Re-derivation on body edit is automatic.
- `unknown` is the safety valve — derivation never throws. New GFM features land before the kind set is updated.
