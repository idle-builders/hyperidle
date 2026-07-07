# Blocks

Content primitives: the unit a markdown body breaks into when HyperIdle renders it as structured prose — derived at read time, never stored, never written in a custom dialect.

- [definition.md](./definition.md) — what a Block is: derived/addressable/renderable, source shape, six rejections, term table, no-dialect rationale, sole-producer/blk:v1 authority, derive-render-discard lifecycle.
- [canonical-shapes.md](./canonical-shapes.md) — **path frozen** (cited by `types.ts:2-3`): all Block type contracts + ten-kind closed vocabulary + derivation semantics.
- [contracts.md](./contracts.md) — cardinality and closure rules, BlockId hash algorithm (single-space separators), outlinePath/ordinal/slug invariants, per-kind normalisation, T4 BlockRef and T5 message blockId rules.
- [derivation-and-rendering.md](./derivation-and-rendering.md) — client-only per-render derivation, ingestion-free write paths, render-surface table, anchor-vs-reference composition (7 InlineRefKinds).
