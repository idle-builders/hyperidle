# Block primitive

A **Block** is the unit a markdown body breaks into when HyperIdle renders it as structured prose. Blocks are *derived during ingestion*, never stored on disk as a separate artifact, never written by an agent in a custom dialect. Bet pitches (L16), knowledge bodies (L23), and any future structured-prose surface render through Blocks; per-block discussion (L26) attaches to them.

This document is the load-bearing concept for Track L story L2 and the upstream contract for L16, L23, and L26.

---

<!-- @anchor: definition -->
## 1. Definition

**A Block is a derived, addressable, renderable region of a markdown body.** It is a *projection* — the output of running a deterministic, GitHub-flavoured-markdown parser over a stored markdown body and grouping the resulting AST into one of a closed set of **BlockKind** shapes. Each block carries a stable **BlockId**, the structural data needed to render it (the parsed AST node, normalised), and an **anchor** affordance that lets external surfaces attach to it (a comment, a link target, a hover popover).

Body-level metadata (front matter, etc.) is **not** a Block. It rides alongside the block list as a sibling field on the derivation result (see §6 and §10) — addressable for diagnostics, but not part of the renderable block stream.

Blocks live entirely on the read path. The on-disk format is plain markdown. The database stores plain markdown. The Knowledge Fabric watches plain markdown. The user sees, comments on, and links to Blocks.

---

<!-- @anchor: essential-properties -->
## 2. Essential properties

Every Block has:

- **`id: BlockId`** — a stable identifier derived from the block's normalised content plus its position in the document outline. Stable across re-parses with identical content; stable when neighbour blocks change but the block itself does not. (See §8 for the algorithm.)
- **`kind: BlockKind`** — one of the closed set in §6.
- **`source: { path, sha, range }`** — the markdown body it was derived from (the knowledge_items / pitch source), the SHA of the body the derivation ran against, and the byte range inside that body. Range is informational only — never load-bearing for identity.
- **`payload`** — the kind-specific structured shape the renderer needs (heading text + level; paragraph inline AST; list items; code language + text; table rows; etc.).
- **`anchor: BlockAnchor`** — the affordance the block exposes to non-content surfaces. The anchor is a `{ blockId }` reference that any consumer (a thread, a link, a hover preview) can use as its attachment key. The anchor is *not* a separate primitive; it is a property of the block itself.

That is the **essential** field set. Anything else (hover preview text, syntax-highlighted HTML, the rendered React node) is the renderer's job, not the block's shape.

### 2.1 Informational fields (debug / render-order only)

These ride alongside the essential fields but **never** carry identity. Consumers must not use them for thread attachment, link targets, or any persistent reference.

- **`order: number`** — the block's position in the document, 0-indexed. Useful for debug logging and stable render order. **Never identity.** Two re-derivations of the same body produce the same `order` for the same block, but a re-derivation after an edit will re-assign `order` based on document position — so `order` is structurally unstable across edits. Use `id` for identity, always.

---

<!-- @anchor: what-a-block-is-not -->
## 3. What a Block is NOT

The rejection list is load-bearing. Get any of these wrong and the primitive collapses.

1. **A Block is NOT a new on-disk markdown dialect.** This is the founder's hard rule, quoted twice in the L2 story:

   > these blocks need to work without agents having to follow formatting or us introducing a new markdown dialect, that will fail. this block element needs to be something that we translate in when ingesting the markdown from the files watched back to the application.

   > we do not introduce a new markdown dialect. the markdown dialect stay github dialect compatible

   Agents continue writing GitHub-flavoured markdown to the workspace. The Knowledge Fabric continues watching plain markdown files. Blocks emerge during *ingestion* — the moment the markdown body becomes a thing the UI renders. There is no `<block id="...">` syntax, no fenced JSON, no front-matter contract beyond the project's existing one, no MDX, no agent-side awareness of blocks at all.

2. **A Block is NOT a chat message.** Conversations does not use Blocks. Threads carry messages (per L1); messages are independent shapes (plain, review, questionnaire). Folding "block" and "message" together because both are "things in a list" would create one shape with two sets of contracts and break both. The L2 story explicitly states "blocks are shared between Work and Knowledge; Conversations does not use them."

3. **A Block has NO per-block primary key in any table.** Operationally: there is no `blocks` table, no `block_id` column on any other table, no per-block row anywhere — and none must be introduced by L2, L16, L23, L26, or any consumer. The canonical `knowledge_items` table stores `body TEXT` (markdown); that body is the only stored form. This rejection is *operational* (a database constraint) and stands distinct from #1 (which is *agent-facing*: no on-disk dialect that would let agents write blocks). A *derivation cache* keyed by `(body_sha, parser_version)` MAY exist as an optimisation, but it is not a source of truth, it can be rebuilt at any time, and cache invalidation is by `body_sha` mismatch only — never by id reconciliation. The cache may key its rows by `blockId` for lookup, but that is an opaque value computed from §8.4, never an authority.

4. **A Block is NOT a UI component.** This rejection prevents collision with `UI_DESIGN.md`'s "Tier 2 — Blocks" tier (ThreadRow, BetCard, etc.). UI tier-2 components are React building blocks — coarse-grained reusable widgets in the design system. The L2 Block primitive is a *content* primitive — a derived region of a markdown body. They share the English word "block" and nothing else. The renderer that materialises a Block on screen *is* a UI component (a `BlockView` of some shape), but the Block itself is data, not a component. The vocabulary table (§7) names the disambiguation.

5. **A Block is NOT the verb "block" or the state "blocked".** HyperIdle uses both heavily — blocking review threads, blocked tasks, blocked agents. Those are runtime workflow states (per `PROCESS_LAYER.md` §6 and the 8-state task lifecycle). The noun "Block" introduced here is a content primitive. The vocabulary table marks both senses; in code and docs, "Block" with a capital B always refers to the content primitive, lower-case "blocked" / "blocking" always refers to the workflow state. No code symbol mixes them.

6. **A Block is NOT a transclusion target (yet).** HyperIdle does not currently support including one body inside another body (no `{{transclude blockId}}`, no `![[…]]` inclusion). The composition is one body → N blocks, full stop. If transclusion is added later, the BlockId outline path needs to compose under the *including* body (a transcluded block's identity must depend on which document includes it, not on its source), and that is a future concept-doc update bumping `blk:v1` → `blk:v2`. Until then, a block belongs to exactly one body and only one body. Cross-body references happen through threads anchored on `blockId`, not through inclusion.

---

<!-- @anchor: composition -->
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

<!-- @anchor: lifecycle -->
## 5. Lifecycle

Blocks have no independent lifecycle. They are derived, used by the renderer for the duration of a request (or cached by `body_sha`), and discarded. Their "lifecycle" is the lifecycle of the source markdown body:

1. **Body created or written** (by a human in the Knowledge view or by an agent through the file watcher writeback path).
2. **Ingestion runs derivation** (§8): the markdown body is parsed, blocks are emitted, ids are computed, the cache (if any) is populated.
3. **Surfaces render the derived blocks** (L16 bet pitch, L23 knowledge body, future surfaces).
4. **Body is edited.** Re-derivation runs. Blocks whose normalised content + outline path didn't change keep their ids; blocks whose content changed get new ids; blocks that disappeared are gone. Inbound thread anchors that pointed at a now-missing blockId are preserved with a "block deleted" indicator (per L26).
5. **Body is deleted.** All derived blocks are gone. Inbound thread anchors render with a "block deleted" indicator. The L1 thread itself remains under its own lifecycle.

There is no "block status", no "block draft", no "block archived". The state of a block is exactly the state of its source body.

---

<!-- @anchor: blockkind-the-closed-vocabulary -->
## 6. BlockKind — the closed vocabulary

The `BlockKind` set is **closed**. Adding a new kind requires updating this document first, then SHARED.md, then the consumers. The set ships with **nine content kinds plus an `unknown` sentinel** (ten total), picked to cover the existing GitHub-flavoured markdown the project already uses in pitches and knowledge bodies:

| Kind | Description | Example markdown |
|---|---|---|
| `heading` | Section header (level 1–6). Renders as a styled heading; participates in the document outline used for id stability. | `## Problem` |
| `paragraph` | Run of inline text. Renders as a styled paragraph. | `We see X happening when Y.` |
| `list` | Bullet or ordered list, possibly nested. The whole list is one block; list items are payload children, not separate blocks. | `- one\n- two` |
| `quote` | Blockquote. May contain other inline content; nested blocks inside a quote remain inside its payload. | `> some quoted text` |
| `code` | Fenced code block with optional language tag. Body is preserved verbatim. | ` ```ts\nconst x = 1;\n``` ` |
| `table` | GFM table. Rows and column alignment in payload. | GFM table syntax |
| `divider` | Thematic break (`---` on its own line). | `---` |
| `image` | Block-level image (a paragraph that is solely an image). | `![alt](url)` |
| `html` | Raw HTML block GFM permits. Rendered as a sanitised HTML region; if sanitiser strips it, falls back to a paragraph showing the original source. | `<details>...</details>` |
| `unknown` | Catch-all for AST nodes the parser produces that don't match a known kind. Renders the original source as a paragraph. Exists so derivation never throws. | parser-dependent |

`unknown` is the safety valve. New GFM features land before we close the kind set: derivation must emit a useful block instead of crashing or silently dropping content. When `unknown` blocks start appearing in real bodies, that is the signal to update this list.

**Body metadata is not a Block.** YAML/TOML front matter (and any future body-level metadata) is **not** in `BlockKind`. It is parsed once and returned as a sibling `metadata: BodyMetadata` field on the derivation result:

```
deriveBlocks(body, host) → { blocks: Block[]; metadata: BodyMetadata }
```

`BodyMetadata` is the parsed front-matter object (or `null` when the body has none). The default renderer does not paint it; consumers that need it (a diagnostics panel, the Knowledge index, a chip in the body header) read it from the sibling field. This keeps `BlockKind` aligned with §1's "renderable region" definition — front matter is addressable as data, not as a renderable region.

**Tabs / front-matter exposure / sanitiser policy** are designer/architect calls during the L2 design pass. The kind set is fixed.

---

<!-- @anchor: vocabulary -->
## 7. Vocabulary

| Term | Definition | Aliases not to use |
|---|---|---|
| **Block** | The content primitive defined in this document — a derived, addressable region of a markdown body. Always capitalised when used in this sense. | section, node, chunk, fragment, segment, slice, partial, snippet |
| **BlockKind** | The closed enum of block shapes (§6). | block-type, block-shape, block-class |
| **BlockId** | The stable identifier of a Block (§8). | block-key, block-uid, block-hash (hash is the algorithm, not the term) |
| **BlockAnchor** | A `{ blockId }` reference exposed by a Block as the attachment key for external surfaces. | block-link, block-target, block-marker, block-pin |
| **BlockDerivation** | The deterministic function that turns a markdown body into an ordered list of Blocks. Sometimes "derivation" alone in context. | parsing, ingestion (those are larger pipelines that *contain* derivation) |
| **block-derivation cache** | The optional `(body_sha, parser_version) → Block[]` cache. Lower-case to mark it as infrastructure, not the primitive. | block store, block table |

**Disambiguation against existing vocabulary.** Three collisions exist; all three are in active use elsewhere in the codebase, and all three must stay distinct from the Block primitive:

- **`block` (verb) / `blocked` (state) / `blocking` (adjective).** Always lower-case. Refer to the workflow states defined in `PROCESS_LAYER.md` (the 8-state task lifecycle: …`hold`, `blocked`…) and to blocking review threads in `HUMAN_INTERFACE_LAYER.md`. Never collapse with the Block primitive in code: a status field is `taskStatus` or `reviewBlocking`, never `block`.
- **"Tier 2 — Blocks" in `UI_DESIGN.md`.** Refers to a tier of design-system *components* (ThreadRow, BetCard, PitchCard, TaskCard, KnowledgeRow, NotificationRow, `ReasoningBlockView`). These are React widgets, not Block primitives. When the L2 implementation adds renderer components for the Block primitive (e.g. `HeadingBlockView`, `ParagraphBlockView`), those are still UI components in the design system; they happen to *render* a Block. The two senses are kept apart by capitalisation in prose ("Block primitive" vs. "Tier 2 Blocks") and by naming in code (the renderer suffix `*BlockView` belongs to the UI layer; the data type `Block` belongs to the content layer).
- **`ReasoningBlock` in the Tier-2 component list (SHARED.md line 108) and "agent reasoning block" in `INFORMATION_ARCHITECTURE.md` § 2.2.** Refers to a UI component — a row in a review-thread chat surface that visually groups an agent's reasoning steps + confidence indicator. It is a *design-system component*, not a Block primitive. **Resolution:** rename `ReasoningBlock` → `ReasoningBlockView` in SHARED.md and the design system on adoption (preferred — names the disambiguation in code, aligns with the `*BlockView` renderer convention above). The TSX rename is an implementation concern for whichever story (L11 / L18 / L23) first touches the component; SHARED.md's component-list entry is updated in this concept-doc pass so the canonical name is unambiguous from now on.

---

<!-- @anchor: contracts -->
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

<!-- @anchor: where-blocks-render -->
## 9. Where Blocks render

| Surface | Source body | When it ships | Notes |
|---|---|---|---|
| Bet pitch (`WorkBet`) | `bets.pitch` (markdown) | L16 | Replaces the current `<pre>` fallback at `WorkBet.tsx:262-267`. |
| Knowledge body (`KnowledgeDetail`) | `knowledge_items.body` (markdown) | L23 | Replaces the `<pre>` block at `KnowledgeDetail.tsx:301-307`. |
| Knowledge per-block discussion | (uses the anchor of L23's blocks) | L26 | Anchors L1 Threads to the block. |
| Future structured-prose surfaces (task notes, retro templates, etc.) | future markdown bodies | future stories | Compose this primitive without re-implementing it. |

Conversations does **not** render Blocks. Chat messages, review messages, and questionnaire messages are L1 message shapes — they have nothing to do with this primitive.

---

<!-- @anchor: where-derivation-attaches-in-the-pipeline -->
## 10. Where derivation attaches in the pipeline

The L2 spec is explicit: derivation runs "during ingestion" — the moment a markdown body lands in HyperIdle. There are two ingestion paths today and Blocks attach to both:

- **File watcher writeback** (`packages/fabric/src/writeback.ts` / `file-watcher.ts`). When an agent edits a markdown file in the materialised workspace, the watcher debounces, reads the body, and writes back to the canonical store. Block derivation is a *read-side* concern — the watcher does not need to derive on write. Derivation runs when a UI surface (or its API) asks for the body. Storing a `body_sha` alongside the body lets the renderer key the cache.
- **Knowledge view direct edit.** When a human edits a body in the Knowledge view, the API writes to the canonical store and bumps the body's `version` (and `body_sha`). The same read-side derivation applies. Cache invalidation is automatic by `body_sha` mismatch.

**Two-process derivation.** Both client and server may derive Blocks from the same body — the server when responding to an API request without a fresh-enough cache, the client when re-rendering on focus or after an optimistic edit. They MUST share the same derivation function (or one is the source of truth and the other proxies). Concretely: `deriveBlocks` lives in `packages/shared` and is imported by both the server and the web bundle. Both processes use byte-identical code paths and the same `parser_version` constant. The cache is a pure optimisation that never gates correctness — if the cache is empty, both processes can re-derive locally and reach identical Block lists with identical ids.

The contract concern is **parser-version negotiation across processes** — when a deployment ships a new `parser_version`, in-flight clients on the old version may still produce ids that disagree with the server's freshly-derived ids. The version tag in the BlockId algorithm (§8.4, `blk:v1`) covers content-shape changes; the `parser_version` cache key covers parser-implementation changes. Both bump together when the derivation function changes.

**Architect call** during the L2 design pass: cache *placement* (in memory per-process, a derived `block_cache` table keyed by `(body_sha, parser_version)`, or only in the renderer's React Query cache). The *existence* of derivation in two places is fixed by the architecture; it is not a placement choice.

---

<!-- @anchor: authority -->
## 11. Authority

- **Owner of the source body**: the host entity (a knowledge item, a bet pitch). Their existing authority model (L25 for knowledge edit/manage; bets per `PROCESS_LAYER.md`) governs.
- **Producer of Blocks**: the BlockDerivation function. No other code emits Blocks. Server-side renderers and client-side renderers call the *same* derivation.
- **Mutator of Block instances**: nothing (Blocks are values; recompute, never edit). To change a block, the user (or an agent) edits the source markdown.
- **Mutator of the BlockKind type set**: this concept doc. Adding or removing a kind requires updating §6 first, then SHARED.md, then consumers. PRs that change the kind set without the §6 update are non-conformant.
- **Owner of the BlockId algorithm**: this document (§8.4). Bumping the version tag (`blk:v1` → `blk:v2`) is a global migration event — every cached id is invalidated, every anchored thread re-resolves through the "block deleted" indicator until the next user action re-anchors.

---

<!-- @anchor: rationale -->
## 12. Rationale

The founder reframe in the L2 story is the entire reason this primitive has the shape it does. Two quoted lines from the spec:

> these blocks need to work without agents having to follow formatting or us introducing a new markdown dialect, that will fail. this block element needs to be something that we translate in when ingesting the markdown from the files watched back to the application.

> we do not introduce a new markdown dialect. the markdown dialect stay github dialect compatible

The shape this forces:

- **Agents stay dumb about Blocks.** They write GFM. They do not annotate blocks. They do not learn a new format. They cannot break the block model by writing the "wrong" markdown — because there is no "wrong" markdown. Any GFM body produces a valid block list, with `unknown` as the safety valve.
- **The Knowledge Fabric stays simple.** The file watcher does not parse; it copies. Markdown remains a transparent storage format that humans can `cat`, `grep`, `git diff` directly (per `KNOWLEDGE_ARCHITECTURE.md` §123: "if a file is human-readable, that means a human will actually read it").
- **Block-anchored discussion (L26) is independent of any linking primitive.** The block-anchor is a property of the block — `{ blockId }` — usable today by L1 threads without waiting for L24 (deferred). This is what unblocks L26 from any linking story.
- **Re-derivation is cheap and safe.** Because derivation is pure, every render re-derives if it must; the `body_sha` cache is an optimisation, not a correctness requirement.

The cost is the BlockId algorithm complexity in §8.4 — paid once, in one place, behind a stable contract. The benefit is that every story downstream of L2 (L16, L23, L26, and all future structured-prose surfaces) inherits the same rendering, anchoring, and discussion contract for free, with zero ceremony at the writing surface.

---

<!-- @anchor: open-questions-parked-for-design -->
## 13. Open questions parked for `/design`

Designer call during L2's design + critique pass — these do not block the concept:

- Designer call: visual treatment of the per-block anchor (gutter dot, hover-only chip, focus ring on click) and the gutter width.
- Designer call: how the "block deleted" indicator reads on an anchored thread (per L26 contract — concept fixes the data, design fixes the look).
- Designer call: in-block hover affordances for `code` and `table` (copy, expand, language label position) and density of `list` rendering.
- Designer call: typography scale across `heading` levels 1–6 inside the bet-pitch and knowledge-body surfaces (these are different reading densities).
- Designer call: how / whether body-level metadata (front matter, exposed via the sibling `metadata` field per §6) is surfaced to readers — silent, summary chip in the body header, or fully hidden.

Architect call during L2's architecture pass — concept-shaped:

- Architect call: cache placement (in-memory, dedicated `block_cache` table, React-Query-only) and parser-version invalidation flow. (The *existence* of derivation in both client and server, sharing one function in `packages/shared`, is fixed by §10 — placement is the open question, not whether to fork.)
- Architect call: which markdown parser (remark + remark-gfm; micromark; markdown-it) — the contract is GFM-faithful + deterministic + pure; the choice is implementation-side.

---

<!-- @anchor: cross-references -->
## 14. Cross-references

- Story: `docs/work-packages/TRACK-L.md` § L2 (lines 69–108).
- Consumers: `docs/work-packages/TRACK-L.md` § L16 (bet pitch), § L23 (knowledge body), § L26 (per-block discussion). All three depend on this document.
- Companion section: `docs/concept/HUMAN_INTERFACE_LAYER.md` § "Block primitive" links here and points the reader to the surfaces.
- Shared contract: `docs/work-packages/SHARED.md` § "Block primitive" carries the canonical type signatures so downstream stories reference one shape.
- Sibling primitives: `docs/concept/HUMAN_INTERFACE_LAYER.md` § Thread (L1) and § Artifact (L3). Threads attach to Blocks via the anchor; Artifacts do not interact with Blocks (Artifacts are produced by tasks, not derived from prose).
- Persistence: `docs/concept/KNOWLEDGE_ARCHITECTURE.md` §4 (canonical `knowledge_items` shape), §5 (file watcher and writeback) — Blocks attach to the read path of these flows.
