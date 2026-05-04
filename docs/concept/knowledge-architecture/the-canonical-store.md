## 3. The Canonical Store

Everything lives in SQLite. One database per factory instance. Every piece of knowledge — from a factory principle to a task-level failure — is a row in a single table.

```sql
knowledge_items (
  id              TEXT PRIMARY KEY,
  layer           TEXT NOT NULL,        -- 'L0','L1','L2','L3','L4'
  scope_id        TEXT,                 -- which product or practice community (null for L4, L0, L1)
  kind            TEXT NOT NULL,        -- 'pattern','anti_pattern','brief','principle',
                                        --  'decision','failure','reflection','focus'
  topic           TEXT,                 -- grouping within a scope: 'auth','deployment','onboarding',...
  title           TEXT,
  body            TEXT,                 -- markdown
  format          TEXT DEFAULT 'markdown',  -- 'markdown','structured','toon'
  status          TEXT DEFAULT 'captured',  -- captured/provisional/validated/active/stale/archived
  attention_score REAL DEFAULT 0.0,
  confidence      REAL DEFAULT 0.0,
  version         INTEGER DEFAULT 1,    -- optimistic concurrency control
  updated_by      TEXT,                 -- agent_id or 'human'
  created_at      TEXT,
  updated_at      TEXT,
  meta            TEXT                  -- JSON blob for kind-specific fields
)
```

`layer` determines scope implicitly: L2 = product, L3 = practice, L4 = factory, L0/L1 = session/task. No separate `scope` column — it was fully redundant with `layer`. `scope_id` identifies *which* product or practice community. `topic` is first-class because it is the primary grouping axis in the Knowledge view. `kind='pattern'` replaces the old `kind='practice'` to avoid collision with "practice" meaning community of practice.

> **Read-side projection.** `knowledge_items.body` is plain markdown. The L2 Block primitive is derived from this body during ingestion — see [`docs/concept/BLOCKS.md`](BLOCKS.md). There is no `blocks` table, no per-block row, no on-disk dialect; the file watcher (§5) treats the body as opaque markdown. Blocks emerge only when a UI surface renders the body.

This replaces the current split across multiple SQLite databases (`factory.db`, `practice.db`) and markdown file trees. One table. The `layer` + `kind` + `topic` fields carry all the structure. The `version` column is the concurrency primitive — every write bumps it.

**Why one table, not many?** Because the Knowledge Fabric needs to project arbitrary slices of knowledge into agent workspaces. A query like "give me all practices relevant to building + all product decisions from the last cycle + the factory principles" is one SQL query against one table. With multiple databases and file trees, that same query is a multi-source join with file I/O — slow, fragile, hard to version.

The existing process primitives (bets, tasks, sessions, teams, routines) stay in their own tables in the Primitive Store. `knowledge_items` is specifically for knowledge artifacts — the things that flow through the L0–L4 layers and get projected into workspaces and the Knowledge view.

### Indexes

```sql
CREATE INDEX idx_ki_layer_scope ON knowledge_items(layer, scope_id);
CREATE INDEX idx_ki_kind ON knowledge_items(kind);
CREATE INDEX idx_ki_topic ON knowledge_items(topic);
CREATE INDEX idx_ki_status ON knowledge_items(status);
CREATE INDEX idx_ki_attention ON knowledge_items(attention_score DESC);
CREATE INDEX idx_ki_updated ON knowledge_items(updated_at DESC);
```

### What about the markdown files in Git?

The human-authored files (L2: `BRIEF.md`, `ARCHITECTURE.md`, `BRAND.md`, `PRINCIPLES.md`; L4: `PRINCIPLES.md`, `FOCUS.md`, `PORTFOLIO.md`) become **exports** from SQLite, not the source of truth. A routine runs after human edits to re-export them to the Git repo for version history and human reading outside the app. Git is the backup and audit trail, not the canonical store.

---
