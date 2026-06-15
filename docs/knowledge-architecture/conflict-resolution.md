## 6. Conflict Resolution

Concurrent edits are rare but possible. Two scenarios:

**Agent vs. human:** A human edits a practice in the Knowledge view while an agent is in a session that assembled the same practice. The human's edit goes directly to SQLite (§4.1). When the agent next writes to that same practice file, the file watcher's writeback detects a version mismatch.

**Agent vs. agent:** Two agents in concurrent sessions both assembled the same practice. Both propose edits. The first writeback succeeds. The second finds a version mismatch.

### 6.1 Resolution strategy: per-field LWW

Inspired by Figma's server-authoritative model. Not pure CRDTs (too complex for rare conflicts), not whole-document locking (too coarse).

For **structured items** (practices, decisions, failures — items with distinct fields in `meta`):

```
On version conflict:
  1. Load the current row (version N+1, written by the first editor)
  2. Load the writeback's proposed changes
  3. Compare field-by-field:
     - Fields changed only by the first editor → keep
     - Fields changed only by the second editor → apply (last-writer-wins per field)
     - Fields changed by both → create a conflict record for the facilitator
  4. Bump version to N+2
```

Most of the time, two editors change different fields. The Builder updates `what_works` while the human sharpens `title` — both edits apply cleanly. True same-field conflicts are vanishingly rare and get routed to the relevant facilitator.

For **prose items** (briefs, principles, reflections — items where `body` is the main content):

```
On version conflict:
  1. Both versions are stored
  2. A conflict record is created in the facilitator's queue
  3. The facilitator (or human) sees a side-by-side diff and picks/merges
  4. Until resolved, the earlier version (lower version) remains active
```

No auto-merge on prose. Prose conflicts need judgment — that's what facilitators are for.

### 6.2 Conflict records

```sql
knowledge_conflicts (
  id              TEXT PRIMARY KEY,
  item_id         TEXT REFERENCES knowledge_items(id),
  version_base    INTEGER,           -- the version both editors started from
  version_current INTEGER,           -- the version now in knowledge_items
  proposed_body   TEXT,              -- the losing editor's version
  proposed_meta   TEXT,              -- the losing editor's field changes
  proposed_by     TEXT,              -- agent_id or 'human'
  status          TEXT DEFAULT 'open',  -- open/resolved/discarded
  resolved_by     TEXT,
  created_at      TEXT,
  resolved_at     TEXT
)
```

Open conflicts surface in the relevant facilitator's queue with high attention score. They block promotion — an item with an open conflict cannot move to VALIDATED status.

### 6.3 Layer precedence

When conflicting guidance exists across layers, higher layers win: **L4 > L3 > L2 > L1.** A factory principle always overrides a practice recommendation. A practice recommendation overrides a product-level convention. Within L2, human-authored items (briefs, principles) carry more weight than agent-drafted items (decisions, task learnings), encoded via the `confidence` field.

This matters at context assembly time: when the Knowledge Fabric assembles the `session.toon` context pack, it can flag contradictions between layers and include the higher-layer item as authoritative. It also matters at promotion time: a proposed L3 practice that contradicts an existing L4 principle is flagged for human review rather than auto-promoted.

### 6.4 Edit log

Every human edit to a knowledge item is logged:

```sql
knowledge_edit_log (
  id              TEXT PRIMARY KEY,
  item_id         TEXT REFERENCES knowledge_items(id),
  editor          TEXT,              -- 'human' or agent_id
  field           TEXT,              -- which field was edited
  old_value       TEXT,
  new_value       TEXT,
  edit_type       TEXT,              -- 'correction', 'refinement', 'rejection'
  created_at      TEXT
)
```

Two purposes: (a) facilitators can review what humans correct and adjust future proposals accordingly, and (b) the accumulated corrections become training signal for improving the promotion pipeline over time. The log captures every delta silently — humans edit directly in the Knowledge view, and the API writes the log entry alongside the update.

---
