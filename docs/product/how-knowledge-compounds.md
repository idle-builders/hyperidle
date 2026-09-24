# How Knowledge Compounds

HyperIdle stores everything agents learn in one structured document system: a nested tree, one canonical store, and human curation built into the workflow. What one agent learns on one product becomes available to every agent working in the same team. The tenth task is faster than the first because the accumulated knowledge from nine previous tasks is present at session start.

Where a document sits in the tree says what it is about; `scope` (`factory | team | user`) says only who sees it. There is no separate maturity ladder. See [Knowledge Architecture](../knowledge-architecture/index.md).

---

## One canonical store, two projections

All knowledge traces back to one table: `documents` (`framework/db/src/schema.ts`). It holds identity and content — scope, title, body, format, status, version, slot, tree position (`parent_kind`, `parent_id`, `position`), and usage (`confidence`, `meta`, plus how often and how recently it has been read or handed to a session). There is no separate projection table.

| Projection | Audience | Format |
|-----------|----------|--------|
| **Knowledge view** in the HyperIdle app | Humans | Rich cards, inline editing, scope filters |
| **Sandbox files** | Agents | Markdown prose for reading, TOON packs for structured data |

Both projections read and write the same store. The web Knowledge pages and every agent's `search_documents`/`open_document`/`edit_document` tool calls go through the same three actions; agent edits in the sandbox's `knowledge/` directory flow back through the file watcher and writeback against the same table, calling `edit_document` as the session's own agent (`layers/agent-orchestration/run-orchestration/src/file-watcher.ts`, `writeback-processor.ts`). No synchronization problem, because there is one source of truth. Full sync mechanics: [Sync and Conflict Resolution](../knowledge-architecture/sync-and-conflict-resolution.md).

---

## How knowledge moves — where the depth lives

- **Context assembly** — at session start, the relevant slice for the agent's role and task is assembled into the sandbox, scored and budgeted; see [The Knowledge Fabric](../knowledge-architecture/the-knowledge-fabric-how-knowledge-moves.md).
- **Lifecycle and curation** — documents move `proposed` → `active` when a human, or the document-management plugin's `document-triage` subscription, judges them ready; its `document-decay` subscription archives ordinary tree documents unused for 90+ days; `archived` is terminal. There is no scoring formula behind either — both subscriptions read and decide by judgement, through the same tools any agent uses. Store semantics in [The Canonical Store](../knowledge-architecture/the-canonical-store.md).
- **Learning flows back up** — retros run as a plugin subscription: [Subscriptions and Retros](../process-layer/subscriptions-and-retros.md).

---

## What makes this different from agent memory

| Dimension | Typical agent memory | HyperIdle knowledge |
|-----------|---------------------|-------------------|
| **Structure** | Strings in a vector index | Scope, status, slot, tree position, and usage all on the one canonical row |
| **Cross-product** | Per-agent or per-project silo | Team knowledge, shared across a team by design (`SCOPE_KINDS`, `framework/domain-model/src/types.ts`) |
| **Curation** | Raw captures accumulate | A librarian agent triages and decays it on a schedule, by judgement |
| **Human oversight** | AI-generated and trusted automatically | AI-generated, agent-curated, human-editable at any time |

The result: a company that gets better at what it does with every task it ships.

---

Next: [What is HyperIdle?](./what-is-hyperidle.md) — return to the system overview, or start with [How Work Flows](./how-work-flows.md) for the process model.
