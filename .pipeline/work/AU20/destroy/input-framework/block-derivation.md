# Destroyer input — `block-derivation` (framework)

Package: `framework/block-derivation`
Surface: 6 exported functions, 0 classes (0 member methods), 1 interface/type declarations, 2 const/enum exports.

## A. Exported functions — EVERY ONE NEEDS A VERDICT

| # | Method | Public | Location |
|---|---|---|---|
| 1 | `blockId` | yes | `framework/block-derivation/src/blocks/block-id.ts:18` |
| 2 | `deriveBlocks` | yes | `framework/block-derivation/src/blocks/derive-blocks.ts:293` |
| 3 | `assertNoCollisions` | yes | `framework/block-derivation/src/blocks/derive-blocks.ts:459` |
| 4 | `derivePayloads` | yes | `framework/block-derivation/src/blocks/derive-payloads.ts:254` |
| 5 | `slug` | yes | `framework/block-derivation/src/blocks/normalise.ts:41` |
| 6 | `normalisedPayload` | yes | `framework/block-derivation/src/blocks/normalise.ts:86` |

## C. Interface / type declarations — the DI-port surface

Verdict each DECLARATION (not every member individually) unless a member is independently interesting. A port member whose only implementation you are deleting dies with it — say so.

- `BlockIdInput` (interface, internal) `framework/block-derivation/src/blocks/block-id.ts:12` — members: `kind`, `outlinePath`, `normalisedPayload`

## D. Const / enum exports

- `EMPTY_SLUG_SENTINEL` (const, public) `framework/block-derivation/src/blocks/normalise.ts:21`
- `ROOT_OUTLINE_SENTINEL` (const, internal) `framework/block-derivation/src/blocks/normalise.ts:22`
