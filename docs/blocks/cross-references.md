## 14. Cross-references

- Story: `plans/work-packages/TRACK-L.md` § L2 (lines 69–108).
- Consumers: `plans/work-packages/TRACK-L.md` § L16 (bet pitch), § L23 (knowledge body), § L26 (per-block discussion). All three depend on this document.
- Companion section: `docs/human-interface-layer/` § "Block primitive" links here and points the reader to the surfaces.
- Shared contract: `docs/blocks/canonical-shapes.md` carries the canonical type signatures so downstream stories reference one shape.
- Sibling primitives: `docs/human-interface-layer/` § Thread (L1) and § Artifact (L3). Threads attach to Blocks via the anchor; Artifacts do not interact with Blocks (Artifacts are produced by tasks, not derived from prose).
- Persistence: `docs/knowledge-architecture/` §4 (canonical `knowledge_items` shape), §5 (file watcher and writeback) — Blocks attach to the read path of these flows.
