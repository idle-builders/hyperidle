# Contracts

The invariants of the Block primitive: cardinality, closure, mutability, the BlockId identity algorithm, and the hard rules. Type shapes and the ten-kind vocabulary live in [canonical-shapes.md](canonical-shapes.md); what a Block is and the no-dialect rationale live in [definition.md](definition.md).

## Cardinality

- One markdown body produces N Blocks (N ≥ 0). Empty or whitespace-only body → `[]`; oversize body (> 256 KB UTF-8, `MAX_BODY_BYTES`) → a single `unknown` block (`framework/shared/src/blocks/derive-blocks.ts`).
- One Block belongs to exactly one body. Cross-body reference happens through inline `BlockRef`s and message block anchors (rules 3–4 below), never by sharing block instances across bodies.
- One Block hosts exactly one BlockAnchor — its own `{ blockId }`. The anchor is a derived property on the Block (`derive-blocks.ts:414`), not a row; no anchors table exists.
- One Block is referenced by 0..N messages (via the optional message `blockId` anchor) and 0..N inline `BlockRef`s.

## Closure

- The `BlockKind` vocabulary is **closed** — ten kinds, owned by [canonical-shapes.md](canonical-shapes.md). New kinds require a concept-doc update first.
- Derivation is **closed**: `deriveBlocks(body, host)` takes no options that change the kind set or the id algorithm. Per-surface rendering options (e.g. "render frontmatter" yes/no) are renderer-side, not derivation-side.
- `BlockAnchor` is **closed**: `{ blockId }` only. No `{ rangeStart, rangeEnd }`, no `{ selector }`, no `{ paragraphIndex }`. Range-based annotation would be a separate primitive if it ever ships; it does not reshape this one.

## Mutability

- A Block has **no mutable identity**. Blocks are values, not entities. The source markdown is the only mutable thing.
- A Block's `id` is a **pure function** of its (normalised) content and its outline path (`framework/shared/src/blocks/block-id.ts`). It is not assigned, not generated, not stored. Recomputation must produce the same id given the same input.
- A Block's `payload` is mutable across re-derivation runs (different body → different payload), but within a single derivation it is frozen.
- Caches are mutable, the Blocks inside them are not. The web-side cache stores bodies, not blocks (`layers/core-ui/src/hooks/useBlockResolution.ts`).

## Identity — the BlockId stability algorithm

The BlockId algorithm is a **structure-aware content hash**. Stability requirements (pinned by `golden-ids.test.ts` and `id-stability.test.ts`):

- Re-parsing the same body produces identical ids.
- Editing block X does not change the id of block Y when Y's normalised content and outline position are unchanged.
- Re-ordering blocks at the same outline level changes the affected blocks' ids only as far as the outline-position component differs.
- Two blocks with byte-identical content under different outline parents get *different* ids (a `## Approach` paragraph under "Bet A" is not the same block as a `## Approach` paragraph under "Bet B").

The output is **128 bits** — blake2s with `dkLen` 16, hex-encoded to a 32-char string (`block-id.ts:19-23`). The `BLOCK_ID_VERSION` constant `blk:v1` (`framework/shared/src/blocks/types.ts`) covers any future migration. Fields are joined with **single spaces**:

```
blockId = hex( blake2s_128(
  "blk:v1" + " "               // version tag — bumping invalidates cache, never collides
  + kind + " "                 // BlockKind discriminator
  + outlinePath + " "          // slug-stable structure path, see below
  + normalisedPayload          // per-kind content normalisation, see below
) )

outlinePath(block, body) =
  if headingAncestors(block) is empty:
    return "<root>"            // sentinel for pre-heading content; cannot collide
                               // with any real slug (slugger strips angle brackets)
  return joinWith("/",
    map(headingAncestors(block), h =>
      slug(text(h)) + "@" + intraLevelOrdinal(h)
    )
  )
```

**headingAncestors** — for any block (including a `heading` block), the list of strictly higher-level headings that *precede* the block in document order. A heading is never in its own ancestor list — its own contribution to the id appears through the kind + payload terms, not through the outline path. So a top-level `# Title` at the top of the body has empty headingAncestors and `outlinePath = "<root>"`. (Implemented as pop-then-emit, push-after-emit on the heading stack — `derive-blocks.ts:379-429`.)

**intraLevelOrdinal** — 1-indexed ordinal in document order among ALL same-level siblings under the same parent, NOT only same-slug siblings. Two `## Approach` siblings under the same parent get `@1` and `@2`; a `## Approach` followed by a `## Background` under the same parent get `@1` and `@2` regardless of slug. Why ordinal-among-all: renaming `## Approach` → `## Background` does not shift the existing `## Background`'s ordinal, so its id (and the ids of every block under it) stays stable. Trade-off: REORDERING siblings does shift ordinals (and ids) for affected siblings — a structural rewrite the user explicitly performed.

**slug** — pinned to `github-slugger` ^2.0.0 (`slug.ts`), with an emoji pre-strip and a hyphen-run collapse (github-slugger preserves `---` verbatim) plus leading/trailing-hyphen trim. If the result is empty (heading text was `!!!` or all-emoji), the literal sentinel `"<empty>"` is returned. The angle brackets in `"<root>"` and `"<empty>"` are stripped by the slugger, so neither sentinel can ever collide with a real slugged heading.

**normalisedPayload** — per-kind, `framework/shared/src/blocks/normalise.ts` is the sole source:

| kind | normalisation |
|---|---|
| `paragraph` | NFC + collapsed whitespace of inline text with mark sentinels (`STRONG`/`EM`/`CODE`/`LINK_HREF`) so bold-vs-plain edits change the hash but trailing-newline edits do not |
| `heading` | level + slug(text) + `\|` + raw NFC text — the raw-text disambiguator keeps emoji-only / punctuation-only headings (both slugged to `"<empty>"`) distinct |
| `list` | `ol`/`ul` discriminator prefix + flat string of items, each item normalised recursively |
| `code` | language tag + `"\n"` + verbatim body with CRLF → LF only — a Windows-edited and a Unix-edited body with otherwise identical code hash to the same id; no other normalisation |
| `table` | header cells joined + body rows joined |
| `quote` | normalised payloads of inner blocks joined |
| `divider` | empty |
| `image` | alt-text NFC + url |
| `html` | CRLF → LF **only** — inter-tag whitespace is NOT collapsed, because that would silently change the hash of meaningfully different HTML (`<pre>` content) |
| `unknown` | raw source range verbatim, CRLF → LF |

### Why this works

- **Neighbour edits don't ripple.** A block's id depends on its own content and its *path* in the outline (heading ancestors + intra-level ordinal). Editing block Y leaves block X's path intact. Adding a paragraph between X and Y under the same heading doesn't affect X's path either — paragraph siblings don't enter the path.
- **Rename-to-collide does not corrupt unchanged siblings.** Because the ordinal counts ALL same-level siblings, renaming `## Approach` → `## Background` next to an existing `## Background` does not change the existing one's ordinal; its id (and every block id under it) is preserved.
- **Reorder under the same parent shifts only the affected blocks.** Reordering paragraphs leaves their ids stable (paragraphs aren't in the outline). Reordering headings shifts ordinals for the moved siblings — accepted as the price of a structural rewrite.
- **Same content under different parents stays distinct.** The outline path encodes the heading ancestry.
- **Pre-heading content has a defined path.** Two pre-heading paragraphs share `outlinePath = "<root>"` and differ only by normalised payload.
- **Renaming a heading invalidates the ids of blocks under it.** Acceptable: a structural rewrite. References to the old ids stop resolving; the referencing messages themselves are preserved.

### Collision acknowledgment

A 128-bit cryptographic hash gives a collision probability deeply below the realistic ceiling of `(bodies × blocks-per-body)` any deployment will see. No disambiguation suffixes exist for theoretical collisions. A real collision is a CRITICAL incident — dev mode runs `assertNoCollisions` (`derive-blocks.ts:432-477`; suppressed in production for cost) — and would bump the algorithm version to `blk:v2`. The `blk:v1` tag is the migration handle for any future contract change (guarded by `assert-version-bumped.test.ts`).

## Hard rules

Violated only by code that has misunderstood the primitive.

1. **GFM only on disk.** The on-disk format is GitHub-flavoured markdown. No HyperIdle-specific dialect, no fenced JSON, no id annotations, no MDX. The knowledge sync watcher and writeback path treat bodies as opaque markdown text — neither imports `deriveBlocks`. Rationale in [definition.md](definition.md); watcher/writeback mechanics in [sync-and-conflict-resolution.md](../knowledge-architecture/sync-and-conflict-resolution.md).
2. **Derivation is deterministic and pure.** `deriveBlocks(body, host)` has no I/O, no clock access, no DB calls. Same input → same output, byte-for-byte, including ids (enforced by `purity.test.ts` + `golden-ids.test.ts`). There is no parser-version parameter — the version is the baked `BLOCK_ID_VERSION` constant. This is what makes caching safe and the identity contract hold.
3. **Inline block references are `BlockRef`.** `{ kind: "block", blockId, hostKind, hostId }` is one entry in the closed `InlineRefKind` vocabulary (`framework/shared/src/thread.ts:116-121`, validated by `blockRefSchema`, `layers/core-api/src/routes/threads-schema.ts:42-47`). Shipped (T4). Anchor-vs-reference composition in [derivation-and-rendering.md](derivation-and-rendering.md).
4. **Per-block discussion is a plain message with a block anchor.** A "comment on a block" is an ordinary message on the host's thread carrying an optional, server-opaque `blockId` (`threads-schema.ts:107`), dual-written to the structured `messages.block_id` column + index (`framework/db/src/schema.ts:787-794`, migration `0020_T5`). There is no `block_comments` table, no parallel comment primitive, no special-case message shape — and no block-level thread attachment: `"block"` is **not** a thread host kind (the Thread host vocabulary is owned by [thread-primitive.md](../human-interface-layer/thread-primitive.md)).

   **Why `BlockRef` carries the host pair.** Bodies move and clone — a knowledge item is duplicated to bootstrap a new product; a bet's body is forked into a sibling bet. The duplicated body has identical content, so its derived blocks have *identical* `blockId`s. A bare blockId would silently resolve against both copies, bleeding two discussion streams together. `(hostKind, hostId)` on the `BlockRef` scopes the reference to its specific host — same `blockId` under a different host pair is a different reference. (Message block anchors need no pair: the host's thread already scopes them.)
