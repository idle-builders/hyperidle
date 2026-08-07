# How Knowledge Compounds

HyperIdle stores everything agents learn in one structured knowledge system: five layers, one canonical store, and human curation built into the workflow. What one agent learns on one product becomes available to every agent working in the same practice. The tenth bet is faster than the first because the accumulated knowledge from nine previous bets is present at session start.

The layer taxonomy (L0 session working set through L4 factory principles) is defined in [The Five Layers](../knowledge-architecture/the-five-layers.md).

---

## One canonical store, two projections

All knowledge traces back to one table: `knowledge_items` (`framework/db/src/schema.ts:883`). It holds identity and content — scope, topic, title, body, format, status, version. Layer, confidence, and scoring live in the app projection extension table (`knowledgeAppProjection` / `knowledge_app_projection`, `schema.ts:1004`).

| Projection | Audience | Format |
|-----------|----------|--------|
| **Knowledge view** in the HyperIdle app | Humans | Rich cards, inline editing, scope filters (`KnowledgeList` / `KnowledgeDetail` / `KnowledgeCreate` pages) |
| **Sandbox files** | Agents | Markdown prose for reading, TOON packs for structured data |

Both projections read and write the same store. The web Knowledge pages hit the `/api/knowledge` routes; agent edits in the sandbox's `knowledge/` directory flow back through the file watcher and writeback against the same table (`layers/agent-orchestration/run-orchestration/src/file-watcher.ts`, `writeback-processor.ts`). No synchronization problem, because there is one source of truth. Full sync mechanics: [Sync and Conflict Resolution](../knowledge-architecture/sync-and-conflict-resolution.md).

---

## How knowledge moves — where the depth lives

- **Context assembly** — at session start, the relevant slice for the agent's role and task is assembled into the sandbox. Selection and budget: [Relevance and Attention](../knowledge-architecture/relevance-and-attention.md); projection model: [The Knowledge Fabric](../knowledge-architecture/the-knowledge-fabric-how-knowledge-moves.md).
- **Lifecycle and curation** — items move draft → active → archived, with `needs_human` routing items that require founder judgment; facilitators organize, score, and promote continuously. Store semantics in [The Canonical Store](../knowledge-architecture/the-canonical-store.md), curation duties in [Facilitators](../knowledge-architecture/facilitators.md).
- **Learning flows back up** — retros run as builtin routines: [Routines and Retros](../process-layer/routines-and-retros.md).

---

## What makes this different from agent memory

| Dimension | Typical agent memory | HyperIdle knowledge |
|-----------|---------------------|-------------------|
| **Structure** | Strings in a vector index | Scope, status, topic, lifecycle in the canonical table; layer, confidence, scores in the app projection |
| **Cross-product** | Per-agent or per-project silo | L3 practice layer shared across all products by design (`SCOPE_KINDS`, `framework/shared/src/types.ts:181`) |
| **Curation** | Raw captures accumulate | Facilitators organize, score, and promote continuously |
| **Human oversight** | AI-generated and trusted automatically | AI-generated, facilitator-organized, human-curated |

The result: a company that gets better at what it does with every bet it ships.

---

Next: [What is HyperIdle?](./what-is-hyperidle.md) — return to the system overview, or start with [How Work Flows](./how-work-flows.md) for the process model.
