# The Knowledge Fabric

How knowledge moves between the canonical store, the human interface, and agent workspaces. This is the sync layer — the plumbing that makes one store feel like two very different tools depending on who's looking at it.

---

## The Core Idea

The factory has two kinds of client. Humans interact through a rich web UI — inline editing, cards, dropdowns, scope selectors. Agents interact through files in a workspace directory — markdown they can read, TOON packs they can parse, plain files they can grep and write to.

Both need to read and write the same knowledge. But this is **not** a real-time collaborative editing problem. Two humans typing in the same paragraph at the same millisecond — that's what Figma, Google Docs, and Notion solve with CRDTs and OT. HyperIdle has something different: two actor types, two interface paradigms, bounded work sessions, and rare concurrent edits.

The right model is **projection, not collaboration**. One canonical store. Two projection layers that render the store into the format each actor type needs. Continuous sync via file watcher. Conflict resolution for the rare overlap.

The closest analogy is a continuously-syncing working copy: the Knowledge Fabric materializes SQLite rows into files at session start, then watches for changes throughout the session and writes them back incrementally. No "big bang" sync at session end — knowledge flows back to the canonical store as soon as the agent writes it.

---

## 1. The Canonical Store

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

## 2. Projection Layer 1: The Web UI (Humans)

Standard web application architecture. The API server reads from `knowledge_items` and renders the Knowledge view with its three scopes (practice, product, factory).

### Read path

```
Browser → API → SELECT * FROM knowledge_items WHERE layer='L3' AND status='active'
                                                  → render as Knowledge view cards
```

The UI renders items as rich, editable cards — inline markdown editing (Notion-style blocks), status badges, confidence indicators, approve/retire/merge actions. The Knowledge view's scope selector (`Practice | Product | Factory`) maps directly to the `layer` column (L3, L2, L4).

### Write path

```
Human edits a practice in the Knowledge view
  → API receives { id, body: "updated text", version: 14 }
  → UPDATE knowledge_items SET body=?, version=version+1, updated_by='human', updated_at=now()
     WHERE id=? AND version=14
  → If 0 rows affected: version conflict → reload and show diff
  → If 1 row affected: success → broadcast update via WebSocket to other open tabs
```

Optimistic locking via the `version` column. No locks held during editing. Conflicts are detected at write time.

---

## 3. Projection Layer 2: The Agent Workspace (Agents)

This is the interesting engineering. When the Knowledge Fabric provisions a session, it **materializes** a slice of SQLite into files in the agent's workspace.

### 3.1 Workspace layout

```
workspace/
  .fabric/
    manifest.json              # version tracking (hidden from agent)

  context/                     # READ-ONLY — reference material
    product/
      BRIEF.md                 # L2 prose, materialized from knowledge_items
      ARCHITECTURE.md
      BRAND.md
      PRINCIPLES.md            # product-level principles
    practices/
      relevant-practice-1.toon # L3, TOON-packed for token efficiency
      relevant-practice-2.toon
    factory/
      PRINCIPLES.md            # L4 factory principles
      FOCUS.md                 # L4 current focus
    session.toon               # L0 context pack: task state, team, bet, handoffs

  work/                        # READ-WRITE — session scratch space
    task-notes.md              # agent's working notes
    artifacts/                 # code, content, whatever the task produces

  knowledge/                   # READ-WRITE — proposed knowledge changes
    practices/                 # agent can edit/create practices
    decisions/                 # agent can log decisions
    failures/                  # agent can log failures
```

**Three zones, three intentions:**

| Zone | Permission | Purpose | What happens at writeback |
|------|-----------|---------|--------------------------|
| `context/` | read-only | Reference material for this session | Changes discarded |
| `work/` | read-write | Session scratch, artifacts | Linked to task as session artifacts |
| `knowledge/` | read-write | Proposed edits to the knowledge base | Diffed and written back to `knowledge_items` |

The three-zone split makes the agent's intent unambiguous. Anything the agent writes in `knowledge/` is explicitly a proposed knowledge change. Working notes in `work/` never accidentally pollute the knowledge base.

### 3.2 The manifest

Hidden in `.fabric/manifest.json`, invisible to the agent. Tracks the version of every materialized item so the writeback can detect conflicts.

```json
{
  "session_id": "sess-042",
  "materialized_at": "2026-04-10T09:00:00Z",
  "items": {
    "ki-practice-file-handling": {
      "version": 14,
      "source_path": "context/practices/file-handling.toon",
      "editable_path": "knowledge/practices/file-handling.md",
      "format": "toon"
    },
    "ki-brief-nimmly": {
      "version": 7,
      "source_path": "context/product/BRIEF.md",
      "format": "markdown"
    },
    "ki-principle-factory-01": {
      "version": 3,
      "source_path": "context/factory/PRINCIPLES.md",
      "format": "markdown"
    }
  }
}
```

### 3.3 Materialization: what gets loaded

The Knowledge Fabric selects items based on the session's context:

```
Given: task T, owned by agent A, on team for product P, agent's role R

Load:
  L4 factory:    all items WHERE layer='L4'                     → context/factory/
  L2 product:    all items WHERE layer='L2' AND scope_id=P      → context/product/
  L3 practices:  items WHERE layer='L3' AND scope_id=R          → context/practices/
                 (filtered by relevance to task T's domain)
  L1 task:       task state, handoffs, recent failures           → session.toon
  L0:            assembled from all of the above                 → session.toon
```

The "load what you need, nothing more" principle from L0: not every practice gets materialized. The Knowledge Fabric uses the task description, the agent's role, and tag matching to select the relevant subset. A Builder working on file uploads doesn't need Growth practices about email subject lines.

**Format choice per item** (TOON spec: [github.com/toon-format/toon](https://github.com/toon-format/toon)):

| Destination | Format | Why |
|------------|--------|-----|
| `context/practices/*.toon` | TOON | ~40% fewer tokens than markdown for structured data |
| `context/product/*.md` | Markdown | Human-authored prose, agent reads as-is |
| `context/factory/*.md` | Markdown | Same — human prose |
| `session.toon` | TOON | Packed working set: task state, bet context, handoffs |
| `knowledge/practices/*.md` | Markdown | Agent writes in markdown, easier to diff |

Practices are loaded as TOON (compact, token-efficient) in `context/` for reading, but the editable copy in `knowledge/` is markdown — because agents write markdown naturally and diffs are cleaner.

### 3.4 Why materialization, not FUSE

FUSE (Filesystem in Userspace) would let agents see SQLite rows as a virtual filesystem without copying files. Elegant in theory. In practice:

- **Doesn't work in containers.** Docker, E2B, Daytona — the agent runtime environments in the architecture — don't support FUSE without privileged mode, which is a security hole.
- **Every file read becomes a DB query.** Unpredictable latency. Agents that `grep -r` across the workspace would hammer the database.
- **Agent harnesses expect real files.** Claude Code, Goose, OpenHands — they read files, write files, run `diff`, use `sed`. They don't handle I/O errors from a virtual filesystem gracefully.
- **No offline capability.** If the FUSE daemon crashes, the workspace disappears mid-session.

Materialization is boring and correct. Copy the files at session start. The agent gets real files on real disk. Fast, portable, works in every runtime environment.

---

## 4. The Sync Protocol

Two phases: materialization at session start, then continuous writeback via file watcher throughout the session. No dependency on a session-end hook — knowledge flows back to the canonical store incrementally, as the agent works.

### 4.1 Materialization (session start)

```
Session provisioner calls Knowledge Fabric:
  fabric.materialize(session_id, task, agent, product, role)

Knowledge Fabric:
  1. Queries knowledge_items for the relevant slice
  2. Converts each item to its target format (TOON or markdown)
  3. Writes files to the workspace directory
  4. Writes .fabric/manifest.json with item versions
  5. Starts file watcher on knowledge/ and work/ directories
  6. Returns the workspace path to the session provisioner
```

The workspace is now a live-syncing working copy. The agent starts working immediately; the file watcher handles the rest.

### 4.2 Continuous writeback (during session)

A file watcher (e.g., `inotify` on Linux, `FSEvents` on macOS, or a polling fallback in containers) monitors the `knowledge/` and `work/` directories for changes. When a file is written:

```
File watcher detects change in knowledge/ or work/:
  1. Debounce: wait 500ms for additional writes to settle
  2. For knowledge/ changes:
     a. Modified files → diff against materialized version
     b. New files → new knowledge_items rows (status: CAPTURED)
     c. Deleted files → flag for facilitator review (not auto-deleted)
     d. For each changed item:
        - Read current version from knowledge_items
        - Compare to manifest version
        - If versions match → apply update, bump version, update manifest
        - If versions differ → conflict (see §5)
     e. On successful write → push update via WebSocket to open Knowledge view tabs
  3. For work/ changes:
     a. Link artifacts to the task record incrementally
     b. Update session notes
```

The agent has no awareness of the sync. It reads and writes files normally — markdown, TOON, whatever the task needs. The file watcher is invisible infrastructure.

### 4.3 Session close

When a session ends (normally or abruptly), the Knowledge Fabric:

```
1. Stops the file watcher
2. Runs one final writeback pass (catches any writes between the last
   watcher event and shutdown)
3. Records session outcome in the sessions table
4. Cleans up the workspace directory
```

Because writeback is continuous, the final pass is a lightweight delta — usually zero changes. This is the key advantage: **if the agent crashes or the session terminates abruptly, almost all knowledge is already synced.** The worst case is losing the last 500ms of writes (the debounce window), not an entire session's worth.

### 4.4 Why continuous sync

The original design was session-boundary sync: materialize at start, write back at end. This had a critical fragility — it depended on a clean session-end hook that may never fire if the agent crashes, the container is killed, or the harness doesn't support pre-termination callbacks. With continuous sync:

- **No data loss on crash.** Knowledge written 30 minutes into an hour-long session is already in SQLite, even if the agent dies at minute 45.
- **Humans see progress in real time.** A human watching the Knowledge view sees agent-proposed practices appearing as the agent writes them, not in a batch dump at session end.
- **No hoarding incentive.** Session length is decoupled from sync frequency. Long sessions and short sessions both sync continuously.
- **Simpler harness adapter contract.** The adapter doesn't need to guarantee a session-end callback. It just needs to start the session (which triggers materialization + watcher) and optionally signal session end (which triggers the final pass). If the signal never comes, the watcher has already done its job.

### 4.5 File watcher implementation notes

The watcher must handle:

- **Debouncing.** Agents often write files in bursts (save, re-save, overwrite). A 500ms debounce window collapses rapid writes into one writeback event.
- **Atomic writes.** Some editors and agents write to a temp file then rename. The watcher should trigger on the rename, not the temp-file write.
- **Container environments.** Docker volumes may not support `inotify` reliably. The watcher falls back to polling (every 2s) when native events aren't available.
- **Concurrency.** The watcher runs in its own thread/process. Writeback operations use a mutex to prevent concurrent writes to the same `knowledge_items` row.
- **Manifest updates.** After each successful writeback, the manifest is updated with the new version numbers. This keeps the conflict detection accurate for subsequent writes in the same session.

---

## 5. Conflict Resolution

Concurrent edits are rare but possible. Two scenarios:

### 5.1 Agent vs. human

A human edits a practice in the Knowledge view while an agent is in a session that materialized the same practice. The human's edit goes directly to SQLite (§2). When the agent next writes to that same practice file, the file watcher's writeback detects a version mismatch.

### 5.2 Agent vs. agent

Two agents in concurrent sessions both materialized the same practice. Both propose edits. The first writeback succeeds. The second finds a version mismatch.

### 5.3 Resolution strategy: per-field LWW

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
  4. Until resolved, the earlier version (lower `version`) remains active
```

No auto-merge on prose. Prose conflicts need judgment — that's what facilitators are for.

### 5.4 Conflict records

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

Open conflicts surface in the relevant facilitator's queue with high attention score (the `conflict` signal from the scoring model in KNOWLEDGE_ARCHITECTURE.md). They block promotion — an item with an open conflict cannot move to VALIDATED status.

### 5.5 Layer precedence

When conflicting guidance exists across layers, higher layers win: **L4 > L3 > L2 > L1.** A factory principle always overrides a practice recommendation. A practice recommendation overrides a product-level convention. Within L2, human-authored items (briefs, principles) carry more weight than agent-drafted items (decisions, task learnings), encoded via the `confidence` field.

This matters at materialization time: when the Knowledge Fabric assembles the `session.toon` context pack, it can flag contradictions between layers and include the higher-layer item as authoritative. It also matters at promotion time: a proposed L3 practice that contradicts an existing L4 principle is flagged for human review rather than auto-promoted.

### 5.6 Edit log

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

## 6. Future Upgrade: Real-Time Co-Editing

Continuous file-watcher sync (§4) handles the normal case: agents write files, the fabric syncs them back within seconds. This is near-real-time but not keystroke-level.

If we ever need true real-time co-editing of a specific document (two humans, or a human and an agent editing the same practice simultaneously at the character level), we can layer Yjs (CRDT library) on top for that specific editing session, with the canonical store still being SQLite. Yjs handles the keystroke-level merge; the Knowledge Fabric handles the durable write. This is purely additive — the canonical store, workspace layout, manifest, and conflict resolution all stay the same.

---

## 7. How This Maps to the Five Layers

```
Layer   Canonical store                    Agent projection              Human projection
─────   ───────────────                    ────────────────              ────────────────
L4      knowledge_items (layer='L4')       context/factory/*.md          Knowledge view → Factory scope
L3      knowledge_items (layer='L3')       context/practices/*.toon      Knowledge view → Practice scope
                                           + knowledge/practices/*.md
L2      knowledge_items (layer='L2')       context/product/*.md          Knowledge view → Product scope
        + process primitives (bets, etc)   via session.toon              Work view
L1      knowledge_items (layer='L1')       via session.toon              Work view (sampled)
        + tasks table
L0      assembled at materialization       session.toon                  not shown
```

The Knowledge Fabric is the component that does the projection. It knows what each actor type needs and how to format it. For agents: files (TOON for structured data, markdown for prose). For humans: API responses rendered as the Knowledge view's rich UI.

---

## 8. The Materialization Budget

Not all knowledge is equal. Loading everything into every session wastes tokens and context window. The Knowledge Fabric applies a **materialization budget** — a cap on how much knowledge gets loaded, enforced by relevance scoring.

### Scoring factors

| Factor | Weight | Example |
|--------|--------|---------|
| Task relevance | high | Practice tagged "file-handling" for a file-upload task |
| Role match | high | Builder practices for a Builder agent |
| Recency | medium | Recently updated practices score higher |
| Confidence | medium | VALIDATED items score higher than PROVISIONAL |
| Usage frequency | medium | Practices referenced in recent sessions score higher |
| Layer proximity | low | Same-product items score higher than cross-product |

### Budget enforcement

```
Given: a session with context window size W (e.g., 200K tokens)

Reserve:
  - 40% for task execution (tool calls, reasoning, code)
  - 30% for L0 session pack (task state, handoffs, bet context)
  - 20% for L2+L3 knowledge (practices, product docs)
  - 10% for L4 factory context

The 20% knowledge budget (~40K tokens) determines how many practices
and product docs get materialized. At ~200 tokens per TOON practice,
that's ~200 practices — far more than any session needs.
```

The budget is generous by design. The real filter is relevance, not size. But having a budget prevents degenerate cases (a practice community with 10,000 items) from blowing up session costs.

---

## 9. Session Notes and Knowledge Promotion

When a session ends, the agent writes **session notes** — a structured summary of what happened, what was learned, and what should be promoted. This is the raw material for the L1→L3 promotion pipeline.

```
Session notes (written by agent to work/session-notes.md):

## Outcome
Completed file upload feature. Chunk size of 2MB works for Coolify.

## Learned
- 5MB chunks cause OOM on Coolify's free tier (failure)
- Multipart upload with 2MB chunks handles files up to 500MB reliably

## Proposed
- Update practice "file-handling" → add 2MB chunk size guidance for Coolify
- New anti-pattern: "large chunk sizes on memory-constrained hosts"
```

The writeback parses these notes and creates the appropriate records:

- Learned items → new `knowledge_items` rows with status `CAPTURED`
- Proposed edits → modifications to existing items (through the normal writeback path)
- Failures → linked to the task's failure records AND promoted as candidate anti-patterns

The facilitator pipeline (described in KNOWLEDGE_ARCHITECTURE.md) then scores, organizes, and routes these items through the CAPTURED → PROVISIONAL → VALIDATED lifecycle.

---

## 10. Design Decisions and Trade-offs

### Why SQLite, not Postgres, as the canonical store?

SQLite is the right default for the same reasons it's right for the Primitive Store: zero ops, single-file backup, fast reads, works on a laptop. The factory is built for small teams — the write throughput ceiling of SQLite (WAL mode, ~50K writes/sec) far exceeds anything a factory of <50 agents will produce.

If a deployment grows beyond SQLite's comfort zone, the Postgres adapter (already in the architecture for the Primitive Store) extends to `knowledge_items` with the same schema.

### Why not CRDTs everywhere?

CRDTs (Yjs, Automerge) solve real-time keystroke-level collaboration. HyperIdle's concurrent edit rate is near zero — the median session has zero conflicts. Paying the complexity cost (CRDT document format, operation log, garbage collection, merge semantics) for a problem that barely exists is over-engineering.

The upgrade path to Yjs for specific editing sessions (§6) gives us the option without baking it into the foundation.

### Why not OT (Operational Transform)?

OT requires a persistent connection between clients and server during editing. Agent sessions are disconnected — the agent works on local files, syncs at boundaries. OT doesn't fit the session model.

### Why materialization over FUSE?

See §3.4. The short version: FUSE doesn't work in containers, turns file reads into DB queries, and breaks when the daemon crashes. Materialization is boring and correct.

### Why three workspace zones instead of one?

Without the `context/` vs `knowledge/` vs `work/` split, the writeback can't distinguish "the agent read this file and happened to modify it while experimenting" from "the agent intentionally proposes this knowledge change." The zones make intent explicit, which makes the writeback reliable.

### Why continuous sync instead of session-boundary?

Session-boundary sync depends on a clean session-end hook — fragile when agents crash, containers are killed, or harnesses don't support pre-termination callbacks. Continuous sync via file watcher eliminates this fragility: knowledge flows back within seconds of being written, regardless of how the session ends. The worst-case data loss is the 500ms debounce window, not an entire session. The file watcher adds modest complexity (debouncing, atomic-write handling, polling fallback for containers), but this is well-understood infrastructure — far simpler than the alternative of guaranteeing reliable session-end hooks across every harness adapter.

---

## 11. Implementation Sequence

1. **`knowledge_items` table + basic CRUD API.** The canonical store. All other work depends on this.
2. **Materialization engine.** Given a session context, produce a workspace directory. This unlocks agent sessions with real knowledge loading.
3. **File watcher + continuous writeback engine.** Watch `knowledge/` and `work/` for changes, diff and write back to `knowledge_items` incrementally. Includes debouncing, atomic-write handling, and polling fallback. This closes the sync loop.
4. **Knowledge view API + WebSocket push.** The read/write API for the human-facing Knowledge view, with real-time updates pushed when the file watcher writes back agent changes. This unlocks the Knowledge view in the UI with live agent visibility.
5. **Manifest + conflict detection.** Version tracking and the per-field LWW merge. This handles the concurrent edit edge case.
6. **Materialization budget + relevance scoring.** The intelligence layer that decides what gets loaded. This is where the fabric gets smart.
7. **Git export routine.** Re-export human-readable files to Git after edits. This preserves the audit trail.

---

*This document is the companion to KNOWLEDGE_ARCHITECTURE.md (what knowledge exists and who curates it) and ARCHITECTURE.md (how the system's components fit together). The Knowledge Fabric is the bridge between them — it's how knowledge moves.*
