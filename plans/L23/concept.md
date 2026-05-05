# L23 — Concept context

**Status.** Phase 1 (designer). Concept of the **Block primitive itself** is locked in `docs/blocks/`. This doc only captures the L23-specific framing.

## What L23 is

L23 is the **Knowledge body renderer** — the surface that takes the markdown text persisted at `knowledge_items.body` and renders it as styled, structured Blocks in `KnowledgeDetail`. It is the second consumer of the L2 Block primitive (the first will be L16, bet pitch). Concretely: a swap of the `<pre whitespace-pre-wrap>` at `KnowledgeDetail.tsx:301-307` for an array of `<Block />` elements derived from the same body.

## Knowledge body — the noun

A "Knowledge body" is the **markdown text** stored in `knowledge_items.body` (column type `TEXT`). It is:

- **Markdown on disk**, always. GFM only. No JSON. No `{::block id="..."::}` annotation. Persistence in this story stays exactly what it is today — a text column. (Contracts § 8.5 hard rule 1.)
- **Opaque to the persistence layer** — the server stores and returns the string verbatim. Block derivation is a render-side concern (`docs/blocks/where-derivation-attaches-in-the-pipeline.md`).
- **Versioned** by the existing `version` integer column on `knowledge_items` (used by L25's optimistic locking). L23 adds no new column.

## What L23 is NOT

- **Not a re-definition of Block.** The primitive lives in `docs/blocks/` and ships in `@hyperidle/shared` + `@hyperidle/design-system` (L2). L23 imports both.
- **Not a new view kit.** Knowledge does not get a customizable layout. The Block component renders identically in every host surface (Knowledge, future Bet pitch). Per-host variation is per-host CSS scope only — never per-host payload reshaping.
- **Not a new block kind.** The closed `BlockKind` enum (`heading | paragraph | list | quote | code | table | divider | image | html | unknown`) is unchanged.
- **Not the linking primitive.** `[[id]]` chips, hover previews, backlinks — all deferred to L24 (parked).
- **Not the block-action surface.** `BlockHandle` / `BlockActionsPopover` exist as L2 deliverables but L23 does not wire them up beyond what `Block.tsx` already exposes by default. Per-block discussion threads land in L26.
- **Not the manage/edit verbs.** Save-actually-persists, optimistic-locking, approve/refine/deprecate verbs land in L25. L23 keeps the existing local-state edit flow intact while replacing only the saved-view rendering.
- **Not a server endpoint change.** No new route, no schema migration. The deriver runs client-side from the body returned by today's `GET /api/knowledge/:layer/:id`.

## Block-id stability

Block ids are computed by `deriveBlocks` from the body string per the L2 algorithm in `docs/blocks/contracts.md` § 8.4 (a structure-aware blake2s_128 over kind + outline path + normalised payload, with version tag `blk:v1`). Stability rules — neighbour edits don't ripple, rename-to-collide doesn't corrupt unchanged siblings, same-content-under-different-parents stays distinct — are L2's contract, not L23's. L23's only commitment is to call `deriveBlocks(body, { kind: "knowledge_item", id: <itemId> })` exactly once per render and use the resulting `block.id` as the React key. The ids must therefore be the **only** keying signal the renderer uses.

## What this story commits us to

Paraphrasing the spec § L23:

1. The legacy `<pre>` at `KnowledgeDetail.tsx:301-307` is gone in favour of structured Block rendering.
2. Block ids are stable per L2 (proven by unit test, not just asserted).
3. **The on-disk format remains valid markdown.** No serialisation change. No `format` column flipped.
4. Round-trip is lossless for the supported kinds — the markdown that came out of the store, when re-derived after a no-op edit, produces an identical block list with identical ids.
5. Hardcoded legacy detail text (the `LEGACY_DETAILS` constant in `KnowledgeDetail.tsx`) is removed; bodies come from the data layer. The matching L6 inventory rows close. **Note:** L6 ships the `hardcoded-data-inventory.md` document; that file does not exist yet at the time of this plan. L23's contribution is to delete `LEGACY_DETAILS` + `LEGACY_SOURCES` and call `getKnowledgeItem(id)` against the existing API for **all** ids (`k1`, `k2`, fixtures alike) — when L6 lands and L29 walks the inventory, the Knowledge-body row is already closed.

## Vocabulary fences

- "Block body" is the **markdown text** of the source. Not the array of derived Blocks.
- A "section" colloquially means a heading + the blocks under it; in the data model there is no Section primitive — sections are **emergent** from the heading-stack outline-path. Don't introduce a Section noun in code, comments, or types.
- "Render the body" = call `deriveBlocks` once, map to `<Block />`. There is no intermediate "Body" entity, no `KnowledgeBodyModel`, no `BlockTree`.
