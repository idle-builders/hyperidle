# Blocks

All block logic lives in `layers/core-ui/src/block/`.

## What a block is

A Block is a typed section of a markdown document, derived at read time. Blocks are never stored — `deriveBlocks()` runs client-side on every render with no cache. The input is always GFM markdown on disk.

Derivation pipeline: byte-cap check → `unified().use(remarkParse).use(remarkGfm)` → walk top-level mdast nodes → map to `BlockKind` → normalise payload → URL allowlist gates (image + link) → compute `outlinePath` → `blockId()` → assemble `Block[]`.

The function is pure: no I/O, no clock, no DB.

## Block kinds (closed)

`heading`, `paragraph`, `list`, `quote`, `code`, `table`, `divider`, `image`, `html`, `unknown`.

`unknown` is the safety valve for any top-level mdast node the derivation does not recognise. Adding a kind requires updating `BLOCK_KINDS` in `block/types.ts` and bumping `BLOCK_ID_VERSION`.

## Host kinds

`BlockHostKind` in `block/types.ts` is the set of objects that can host blocks: `task`, `document`, `artifact`, `agent`, `user`. This is not the same as the thread's `HOST_KINDS` (`document`, `agent`, `user`, `team`, `factory`) — do not conflate the two.

## BlockId algorithm

`blockId()` in `block/block-id.ts`:

1. Inputs: `BLOCK_ID_VERSION`, `kind`, `outlinePath`, `normalisedPayload` — joined with single spaces.
2. Hash: `blake2s` with `dkLen: 16` (128 bits), hex-encoded → 32-char hex string.

`outlinePath` encodes the heading ancestry of the block. The root sentinel is `<root>`; an empty slug gets `<empty>`. Slugs are produced by `github-slugger`, with emoji stripped first and hyphen-runs collapsed.

Per-kind normalisation is in `block/normalise.ts`. Heading text is slugged; paragraph text is NFC-normalised, CRLF-normalised, and whitespace-collapsed. The normalised payload is fed verbatim into the hash.

## Message block anchors

A comment on a block is a plain message in the document's thread whose `anchor.part` is the block's id, with `anchor.label` naming the spot. It is the same anchor a review comment uses; see [reviews.md](reviews.md#comments).

## Render surfaces

`deriveBlocks()` is called by: `DocumentBody` and `ImagePayload`. Task bodies are not rendered as blocks.
