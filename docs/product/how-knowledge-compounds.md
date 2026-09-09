# How Knowledge Compounds

HyperIdle stores everything agents learn in one structured knowledge system: a nested tree, one canonical store, and human curation built into the workflow. What one agent learns on one product becomes available to every agent working in the same practice. The tenth task is faster than the first because the accumulated knowledge from nine previous tasks is present at session start.

Where a knowledge item sits in the tree says what it is about; `scope` (`factory | team | user`) says only who sees it. There is no separate maturity ladder. See [Knowledge Architecture](../knowledge-architecture/index.md).

---

## One canonical store, two projections

All knowledge traces back to one table: `knowledge_items` (`framework/db/src/schema.ts:883`). It holds identity and content — scope, title, body, format, status, version, and the tree position (`parent_kind`, `parent_id`, `position`). Confidence and scoring live in the app projection extension table (`knowledgeAppProjection` / `knowledge_app_projection`, `schema.ts:1004`).

| Projection | Audience | Format |
|-----------|----------|--------|
| **Knowledge view** in the HyperIdle app | Humans | Rich cards, inline editing, scope filters (`KnowledgeList` / `KnowledgeDetail` / `KnowledgeCreate` pages) |
| **Sandbox files** | Agents | Markdown prose for reading, TOON packs for structured data |

Both projections read and write the same store. The web Knowledge pages hit the `/api/knowledge` routes; agent edits in the sandbox's `knowledge/` directory flow back through the file watcher and writeback against the same table (`layers/agent-orchestration/run-orchestration/src/file-watcher.ts`, `writeback-processor.ts`). No synchronization problem, because there is one source of truth. Full sync mechanics: [Sync and Conflict Resolution](../knowledge-architecture/sync-and-conflict-resolution.md).

---

## How knowledge moves — where the depth lives

- **Context assembly** — at session start, the relevant slice for the agent's role and task is assembled into the sandbox. Selection and budget: [Relevance and Attention](../knowledge-architecture/relevance-and-attention.md); projection model: [The Knowledge Fabric](../knowledge-architecture/the-knowledge-fabric-how-knowledge-moves.md).
- **Lifecycle and curation** — items move `proposed` → `active` when a human or the auto-promotion sweep vouches for them; the weekly decay sweep sets `stale` on what goes unused; `archived` is terminal. Facilitators organize, score, and promote continuously. Store semantics in [The Canonical Store](../knowledge-architecture/the-canonical-store.md), curation duties in [Facilitators](../knowledge-architecture/facilitators.md).
- **Learning flows back up** — retros run as builtin routines: [Routines and Retros](../process-layer/routines-and-retros.md).

---

## What makes this different from agent memory

| Dimension | Typical agent memory | HyperIdle knowledge |
|-----------|---------------------|-------------------|
| **Structure** | Strings in a vector index | Scope, status, tree position in the canonical table; confidence, scores in the app projection |
| **Cross-product** | Per-agent or per-project silo | Practice knowledge, nested under a factory-scoped Practices root, shared across all products by design (`SCOPE_KINDS`, `framework/domain-model/src/types.ts:171`) |
| **Curation** | Raw captures accumulate | Facilitators organize, score, and promote continuously |
| **Human oversight** | AI-generated and trusted automatically | AI-generated, facilitator-organized, human-curated |

The result: a company that gets better at what it does with every task it ships.

---

Next: [What is HyperIdle?](./what-is-hyperidle.md) — return to the system overview, or start with [How Work Flows](./how-work-flows.md) for the process model.
