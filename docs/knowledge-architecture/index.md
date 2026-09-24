# Knowledge Architecture

How HyperIdle stores, syncs, and surfaces knowledge — one canonical store (the `documents` table) shaped as a tree, two projection layers.

- [the-canonical-store.md](./the-canonical-store.md) — Store semantics: the `documents` table, the 3-value `scope` enum, the parent/slot/scope attachment split, the `as` vocabulary (memory/artifact/document), the tree and its write-time invariants (no cycles, scope no wider than parent, depth ≤ 32), the status ladder, `changes` as the one history table, blocks-as-projections, PGlite-locally / postgres-js-server line.
- [the-knowledge-fabric-how-knowledge-moves.md](./the-knowledge-fabric-how-knowledge-moves.md) — Projection model: one writable, watched `knowledge/` sandbox tree shaped like the real tree, the manifest, context-assembly selection and its scoring/budget, the `document-triage`/`document-decay` plugin subscriptions, TOON reality, human-readable principle.
- [sync-and-conflict-resolution.md](./sync-and-conflict-resolution.md) — The full write flow: two-phase sync, `fs.watch` + 500 ms debounce + move detection by filename id-suffix, writeback rules, what a stale version does (refused and discarded, not reviewed).

**Where a document sits in the tree says what it is about; `scope` says only who sees it — and scope is a readability filter, not access control.** There is no separate maturity ladder: every document lives in the same tree, at whichever scope its author gave it, nested under whatever it is about. See [the-canonical-store.md](./the-canonical-store.md#the-tree).

Two archived pages describe machinery that no longer exists: [relevance-and-attention.md](../archive/relevance-and-attention.md) (the deleted facilitator scoring engines) and [facilitators.md](../archive/facilitators.md) (the deleted fixed facilitator role catalog).
