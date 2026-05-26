## 3. The Canonical Store

Everything lives in SQLite. One database per factory instance. The store is split into **kernel** (structural, stable) and **strategy** (fabric-computed, evolving).

### Kernel table — `knowledge_items`

The kernel carries identity, content, scope, and concurrency control. No strategy signals — those live in the fabric extension.

```sql
knowledge_items (
  id              TEXT PRIMARY KEY,
  scope_kind      TEXT NOT NULL,        -- 'factory','product','practice','team','bet','task','user'
  scope_id        TEXT,                 -- which entity (null for factory — there's only one)
  topic           TEXT,                 -- grouping within a scope: 'auth','deployment','onboarding',...
  title           TEXT,
  body            TEXT,                 -- markdown
  format          TEXT DEFAULT 'markdown',  -- 'markdown','toon'
  status          TEXT DEFAULT 'captured',  -- captured/provisional/validated/active/stale/archived
  version         INTEGER DEFAULT 1,    -- optimistic concurrency control
  updated_by      TEXT,                 -- agent_id or user_id
  created_at      TEXT,
  updated_at      TEXT
)
```

**Scope (kernel).** Every knowledge item attaches to exactly one entity via `scope_kind + scope_id`. Scope determines where the item lives and who naturally sees it:

- `factory` — strategic decisions, principles, constraints across all products. `scope_id` null.
- `product` — product-specific context, architecture decisions. `scope_id` = product id.
- `practice` — cross-product learning for a discipline. `scope_id` = practice community id.
- `team` — team-level knowledge. `scope_id` = team id.
- `bet` — conceptual context for a specific bet. `scope_id` = bet id.
- `task` — notes, findings, failures for a specific task. `scope_id` = task id.
- `user` — personal notes, private scratch. `scope_id` = user id.

`scope_kind` is a closed enum. Adding a scope kind requires a concept-doc update first.

Scope is mutable — a user can change an item's scope (e.g., `user` → `product` to share a private note). Scope changes are tracked in version history.

> **Read-side projection.** `knowledge_items.body` is plain markdown. The Block primitive is derived from this body during rendering — see `docs/blocks/`. There is no `blocks` table, no per-block row, no on-disk dialect. Blocks emerge only when a UI surface renders the body.

### Strategy extension — `knowledge_strategy_fabric`

Strategy signals computed by the Knowledge Fabric. Joined to kernel by `knowledge_item_id`. See `packages/db/src/schema.ts` for the current column set (layer, kind, attention_score, relevance_score, citation_count, confidence, meta).

**Layer (strategy).** The fabric assigns an L0-L4 layer to items that participate in the maturity flow. Layer is *optional* — not every scope maps to a layer:

| Scope kind | Default layer mapping | Notes |
|---|---|---|
| factory | L4 | Monthly rhythm, human-owned |
| product | L2 | Per-cycle, human-readable + agent-native |
| practice | L3 | Weekly, cross-product learning |
| task | L1 | Per-task, failures first-class |
| session | L0 | Ephemeral, rebuilt every session |
| bet | — | No layer. Attached to bet lifecycle. |
| team | — | No layer. Between L2 and L3. |
| user | — | No layer. Private, below fabric concern. |

Items without a layer assignment are not materialized by the fabric into agent sessions unless explicitly promoted (scope change to a layer-mapped scope kind).

### Kernel vs. strategy — the separation

The O2 migration moved strategy signals (`layer`, `kind`, `attention_score`, `confidence`, etc.) off the kernel table into the fabric extension. This concept formalizes the reason: **scope is structural (where does this item live?), layer is strategic (what maturity flow does it follow?)**. They are different axes. Scope is mandatory and kernel-level. Layer is optional and strategy-level.

### Why one table, not many?

Because the Knowledge Fabric needs to project arbitrary slices of knowledge into agent workspaces. A query like "give me all practices relevant to building + all product decisions from the last cycle + the factory principles" is one SQL query against one table with a join to the strategy extension. With multiple databases and file trees, that same query is a multi-source join with file I/O — slow, fragile, hard to version.

The existing process primitives (bets, tasks, sessions, teams, routines) stay in their own tables in the Primitive Store. `knowledge_items` is specifically for knowledge artifacts.

### Indexes

```sql
CREATE INDEX idx_ki_scope ON knowledge_items(scope_kind, scope_id);
CREATE INDEX idx_ki_topic ON knowledge_items(topic);
CREATE INDEX idx_ki_status ON knowledge_items(status);
CREATE INDEX idx_ki_updated ON knowledge_items(updated_at DESC);
```

Strategy-layer indexes (layer, kind, attention_score) live on the `knowledge_strategy_fabric` table.

### What about the markdown files in Git?

The human-authored files (L2: `BRIEF.md`, `ARCHITECTURE.md`, `BRAND.md`, `PRINCIPLES.md`; L4: `PRINCIPLES.md`, `FOCUS.md`, `PORTFOLIO.md`) become **exports** from SQLite, not the source of truth. A routine runs after human edits to re-export them to the Git repo for version history and human reading outside the app. Git is the backup and audit trail, not the canonical store.

---
