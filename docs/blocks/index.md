# BLOCKS

# Block primitive

A **Block** is the unit a markdown body breaks into when HyperIdle renders it as structured prose. Blocks are *derived during ingestion*, never stored on disk as a separate artifact, never written by an agent in a custom dialect. Bet pitches (L16), knowledge bodies (L23), and any future structured-prose surface render through Blocks; per-block discussion (L26) attaches to them.

This document is the load-bearing concept for Track L story L2 and the upstream contract for L16, L23, and L26.

---

---

## Sections

- [Definition](./definition.md)
- [Essential properties](./essential-properties.md)
- [What a Block is NOT](./what-a-block-is-not.md)
- [Composition](./composition.md)
- [Lifecycle](./lifecycle.md)
- [BlockKind — the closed vocabulary](./blockkind-the-closed-vocabulary.md)
- [Vocabulary](./vocabulary.md)
- [Contracts](./contracts.md)
- [Where Blocks render](./where-blocks-render.md)
- [Where derivation attaches in the pipeline](./where-derivation-attaches-in-the-pipeline.md)
- [Authority](./authority.md)
- [Rationale](./rationale.md)
- [Open questions parked for `/design`](./open-questions-parked-for-design.md)
- [Cross-references](./cross-references.md)
- [Canonical shapes](./canonical-shapes.md)

