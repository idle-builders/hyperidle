# Knowledge Architecture

How HyperIdle stores, syncs, scores, and surfaces knowledge — one canonical store, two projection layers, facilitator agents keeping it alive.

- [the-five-layers.md](./the-five-layers.md) — L0–L4 maturity taxonomy: layer names, rhythms, actor ownership, and the five provenance one-liners (sole home of inspiration credits).
- [the-canonical-store.md](./the-canonical-store.md) — Store semantics: kernel/strategy split, 7-scope enum, `needs_human` flag, blocks-as-projections, git-export pointer, PGlite-locally / postgres-js-server line.
- [the-knowledge-fabric-how-knowledge-moves.md](./the-knowledge-fabric-how-knowledge-moves.md) — Projection model: three-zone sandbox layout, manifest, context-assembly selection, TOON reality, human-readable principle.
- [sync-and-conflict-resolution.md](./sync-and-conflict-resolution.md) — The full write flow: two-phase sync, `fs.watch` + 500 ms debounce + polling fallback, writeback rules, LWW vs escalation, layer precedence.
- [relevance-and-attention.md](./relevance-and-attention.md) — Three scoring engines: `relevanceScore` (L22 ranking), attention score (needs-human triage), assembly scoring + 40 K token budget.
- [facilitators.md](./facilitators.md) — Facilitator roster, 7-state lifecycle, auto-promotion pipeline, flat-org rule, git-export structure. Load-bearing: `promotion-pipeline.ts:17-24` and `git-export.ts:36-42` embed content from this doc (code comments still reference the old `KNOWLEDGE_ARCHITECTURE.md` monolith path — update them when renaming).
