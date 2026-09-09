# Knowledge Architecture

How HyperIdle stores, syncs, scores, and surfaces knowledge — one canonical store shaped as a tree, two projection layers, facilitator agents keeping it alive.

- [the-canonical-store.md](./the-canonical-store.md) — Store semantics: kernel table, the 3-value `scope` enum, the parent/role/scope attachment split, the tree and its write-time invariants (no cycles, scope no wider than parent, depth ≤ 32), the status ladder, blocks-as-projections, PGlite-locally / postgres-js-server line.
- [the-knowledge-fabric-how-knowledge-moves.md](./the-knowledge-fabric-how-knowledge-moves.md) — Projection model: one writable, watched `knowledge/` sandbox tree shaped like the real tree, the manifest, context-assembly selection, TOON reality, human-readable principle.
- [sync-and-conflict-resolution.md](./sync-and-conflict-resolution.md) — The full write flow: two-phase sync, `fs.watch` + 500 ms debounce + move detection by filename id-suffix, writeback rules, LWW vs escalation.
- [relevance-and-attention.md](./relevance-and-attention.md) — Three scoring engines: `relevanceScore` (Knowledge view ranking), attention score (facilitator review-item queue), assembly scoring + 40 K token budget.
- [facilitators.md](./facilitators.md) — Facilitator roster, the 4-value status lifecycle, auto-promotion pipeline, practices as ordinary tree items, the flat-org rule, and the unimplemented git-export sketch. Load-bearing: `promotion-pipeline.ts:17-24` embeds content from this doc (its code comment still references the old `KNOWLEDGE_ARCHITECTURE.md` monolith path — update it when renaming).

**Where an item sits in the tree says what it is about; `scope` says only who sees it — and scope is a readability filter, not access control.** There is no separate maturity ladder any more: every knowledge item lives in the same tree, at whichever scope its author gave it, nested under whatever it is about. See [the-canonical-store.md](./the-canonical-store.md#the-tree).
