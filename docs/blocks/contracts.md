## 8. Contracts

### 8.1 Cardinality

- One markdown body produces N Blocks (N ≥ 0). Empty body → empty array.
- One Block belongs to exactly one body. Cross-body references happen through threads anchored on blockIds, never by sharing block instances across bodies.
- One Block hosts exactly one BlockAnchor (its own `{ blockId }`). The anchor is a derived property, not a row.
- One Block is referenced by 0..N Threads (per L1, anchored via `{ kind: "block", blockId }`).

### 8.2 Closure

- The `BlockKind` enum is **closed** (§6). New kinds require a concept-doc update first.
- The `BlockDerivation` function is **closed**: callers do not pass options that change the kind set or the id algorithm. Per-surface rendering options (e.g. "render frontmatter" yes/no) are renderer-side, not derivation-side.
- The `BlockAnchor` shape is **closed**: `{ blockId }` only. No `{ rangeStart, rangeEnd }`, no `{ selector }`, no `{ paragraphIndex }`. Future range-based annotation is a separate primitive if it ever ships; it does not reshape this one.

### 8.3 Mutability

- A Block has **no mutable identity**. Blocks are values, not entities. The source markdown is the only mutable thing.
- A Block's `id` is a **pure function** of its (normalised) content and its outline path. It is not assigned, not generated, not stored. Recomputation must produce the same id given the same input.
- A Block's `payload` is mutable across re-derivation runs (different body → different payload), but within a single derivation it is frozen.
- The block-derivation cache, if present, is mutable but the Blocks inside it are not.

### 8.4 Identity — the BlockId stability algorithm

The BlockId algorithm is a **structure-aware content hash**. Stability requirements:

- Re-parsing the same body produces identical ids.
- Editing block X does not change the id of block Y when Y's normalised content and outline position are unchanged.
- Re-ordering blocks at the same outline level changes the affected blocks' ids only as far as the outline-position component differs (see below).
- Two blocks with byte-identical content under different outline parents get *different* ids (a `## Approach` paragraph under "Bet A" is not the same block as a `## Approach` paragraph under "Bet B").

Algorithm sketch. The output width is fixed at **128 bits**; the primitive is **blake2s** (the choice of which 128-bit-output primitive is implementation-side, but the contract is 128 bits and a cryptographic hash). The version tag (`blk:v1`) covers any future migration:

```
blockId(block, body) =
  base16( blake2s_128(
    "blk:v1\0"                              // version tag — bumping invalidates cache, never collides
    || kind || "\0"                         // BlockKind discriminator
    || outlinePath(block, body) || "\0"     // see below — slug-stable structure path
    || normalised(payload(block))           // see below — content normalisation
  ) )

outlinePath(block, body) =
  if headingAncestors(block) is empty:
    return "<root>"                         // sentinel for pre-heading content; cannot
                                            // collide with any real slug because the slug
                                            // function strips angle brackets (see slug spec)
  return joinWith("/",
    map(headingAncestors(block), h =>
      slug(text(h)) + "@" + intraLevelOrdinal(h)
    )
  )

headingAncestors(block) =
  // For any block (including a `heading` block), this is the list of strictly
  // higher-level headings that *precede* the block in document order. A heading
  // is NEVER in its own ancestor list — its own contribution to the id appears
  // through the kind+payload terms, not through the outline path. So a top-level
  // `# Title` heading at the top of the body has empty headingAncestors and
  // therefore outlinePath = "<root>".

intraLevelOrdinal(node) =
  // 1-indexed ordinal in document order among ALL same-level siblings under the
  // same parent — NOT only same-slug siblings. So two `## Approach` siblings
  // under the same parent get @1 and @2; a `## Approach` followed by a
  // `## Background` under the same parent get @1 and @2 regardless of slug.
  // Why ordinal-among-all: renaming `## Approach` → `## Background` does not
  // shift the existing `## Background`'s ordinal, so its id (and the ids of
  // every block under it) stays stable. The trade-off: REORDERING siblings
  // does shift ordinals (and ids) for affected siblings — but that is a
  // structural rewrite the user explicitly performed.

slug(text) =
  // GitHub-flavoured slug, spec-pinned (implementation may use the
  // `github-slugger` JS package or any byte-identical equivalent):
  //   1. Lowercase.
  //   2. NFKD-normalise.
  //   3. Strip emoji and punctuation.
  //   4. Collapse whitespace runs to a single hyphen.
  //   5. Drop leading and trailing hyphens.
  // If the result is empty (e.g. heading text was "!!!" or all-emoji),
  // return the literal string "<empty>". The angle brackets in "<root>"
  // and "<empty>" are stripped by step 3, so neither sentinel can ever
  // collide with a real slugged heading.

normalised(payload) =
  for paragraph: utf8 NFC + collapsed whitespace runs of inline text concatenated
                 with inline-mark sentinels (e.g. STRONG/EMPH/CODE/LINK_HREF) so
                 bold-vs-plain edits change the hash but trailing-newline edits do not
  for heading:   utf8 NFC + level + slugged text
  for list:      flat-string of items joined with "", each item = normalised(paragraph)
  for code:      language tag + "\n" + verbatim body, with line-ending
                 normalisation only (CRLF → LF before hashing) — a Windows-
                 edited body and a Unix-edited body with otherwise identical
                 code hash to the same id; no other normalisation applies
  for table:     header cells joined "" + "" + body rows joined ""
  for quote:     normalised payloads of inner blocks joined ""
  for divider:   empty
  for image:     alt-text NFC + url
  for html:      raw HTML (whitespace-normalised at tag boundaries only)
  for unknown:   raw source range (verbatim) with line-ending normalisation
                 (CRLF → LF) before hashing
```

Why this works:

- **Neighbour edits don't ripple.** A block's id depends on its own content and on its *path* in the outline (heading ancestors and intra-level ordinal). Editing the *body* of block Y leaves block X's path intact, so X's id is stable. Adding a new paragraph between X and Y under the same heading parent does not affect X's path either — paragraph siblings don't enter the path.
- **Rename-to-collide does not corrupt unchanged siblings.** Because `intraLevelOrdinal` counts ALL same-level siblings (not only same-slug ones), renaming `## Approach` → `## Background` next to an existing `## Background` does not change the existing `## Background`'s ordinal. Its id (and every block id under it) is preserved.
- **Reorder under the same parent shifts only the affected blocks.** Reordering paragraphs leaves their ids stable (paragraphs aren't in the outline). Reordering headings *does* shift `intraLevelOrdinal` for the moved siblings — accepted as the price of a structural rewrite the user explicitly performed.
- **Same-content under different parents stays distinct.** The outline path encodes the heading ancestry, so the two `## Approach` blocks under different bets hash differently.
- **Pre-heading content has a defined path.** Two pre-heading paragraphs share `outlinePath = "<root>"` and so differ only by their normalised payload, exactly as they should.
- **Renaming a heading invalidates ids of the headings under it.** Acceptable: that is a structural rewrite. Anchored threads under a renamed section show the "block deleted" indicator (per L26); the thread is preserved.

**Collision acknowledgment.** A 128-bit cryptographic hash gives a collision probability deeply below the realistic ceiling of `(bodies × blocks-per-body)` HyperIdle will ever see in a deployment. We do **not** add disambiguation suffixes for theoretical collisions; if a real collision is ever observed, that is a CRITICAL incident and the algorithm version is bumped (`blk:v2`). The `blk:v1` version tag is the migration handle for any future contract change.

### 8.5 Hard rules

These are violated only by code that has misunderstood the primitive. CI guards / type checks should make them physically uncomfortable to break.

1. **GFM only on disk.** The on-disk format is GitHub-flavoured markdown. No HyperIdle-specific dialect. No fenced JSON. No `{::block id="..."::}` annotations. No MDX. The file watcher (`packages/fabric/src/file-watcher.ts`) and writeback (`packages/fabric/src/writeback.ts`) treat bodies as opaque markdown text.
2. **Derivation is deterministic and pure.** `BlockDerivation(body, parserVersion)` has no I/O, no clock access, no DB calls. Same input → same output, byte-for-byte (including ids). This is what makes the cache safe and the contracts §8.4 hold.
3. **The anchor is the primitive's own affordance.** Per-block discussion (L26) attaches via `{ kind: "block", blockId }` directly. There is no separate linking primitive (L24) introduced as a dependency. L26's only dependencies are L1 (Thread) and L23 (which itself depends on L2). If a future story introduces inline `[[id]]` links (L24, deferred), it composes with the anchor; it does not replace it.
4. **Per-block discussion uses L1 Thread.** A "comment on a block" is a Thread with `attachedTo = { kind: "block", blockId, hostKind, hostId }`. There is no `block_comments` table, no parallel comment primitive, no special-case message shape. The `kind: "block"` value is the seventh entry in L1's closed attachment vocabulary (see §4); `hostKind` is one of `'bet' | 'task' | 'knowledge_item' | 'artifact' | 'agent' | 'user'` (the same closed L1 host enum, no `string` escape hatch).

   **Why the host pair is carried.** Bodies move and clone. A knowledge item is duplicated to bootstrap a new product; a bet pitch is forked into a sibling bet. The duplicated body has identical content, so its derived blocks have *identical* `blockId`s. Without the host pair, threads attached to the original would silently appear on the duplicate (and vice-versa), bleeding two separate discussion streams together. The `(hostKind, hostId)` pair scopes a block-anchored thread to its specific host — same `blockId` under a different `(hostKind, hostId)` is a different anchor.

---
