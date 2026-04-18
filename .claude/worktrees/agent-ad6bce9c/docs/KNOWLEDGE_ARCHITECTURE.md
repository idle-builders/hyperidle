# The Factory Knowledge System

A knowledge layer for an agentic company. Five layers, each with its own rhythm, its own scope, and its own human moment.

The core move: **separate what humans read from what agents process, and optimize each for its reader.** Most agent systems dump everything into markdown files and hope for the best. Markdown is for humans. Agents work better with structured data they can query. We present the same knowledge differently to each — through the **Knowledge Fabric** (§4–7 below), which projects one canonical SQLite store into rich web UI for humans and file-based workspaces for agents.

For how the human interface is designed — views, navigation, interaction grammar — see `HUMAN_INTERFACE_LAYER.md`. This document covers: the five knowledge layers, the canonical store, the sync protocol, conflict resolution, materialization, the facilitator agents, and design trade-offs.

---

## 1. The Five Layers

```
L4  FACTORY        monthly        humans write & read, agents propose
L3  PRACTICE       weekly         agents read/write, humans curate
L2  PRODUCT        per cycle      both — split by artifact type
L1  TASK           per task       agents own, humans sample
L0  SESSION        minutes        pure agent memory
```

The lower you go, the more agent-native. The higher you go, the more human-native. Knowledge flows up through promotion (L1 discoveries become L3 practices become L4 principles) and down through loading (the factory's rules shape what products do).

### L0: Session — the working set

An agent spinning up for a specific task. Minutes to hours.

Borrows from how Letta/MemGPT treats the context window like RAM in an operating system — the agent explicitly manages what's in its working set rather than stuffing everything in upfront. We don't need to implement Letta; we take the idea: **load what you need, nothing more.**

- **Storage**: ephemeral. Rebuilt every session by the Knowledge Fabric's materialization engine (§5).
- **Format**: TOON-style compact pack loaded from L1/L2/L3. TOON gives ~40% fewer tokens than JSON for structured data with minimal parsing loss. This is the difference between an agent that can hold a whole product's context vs. one that burns its window on boilerplate.
- **Materialization budget**: the Knowledge Fabric applies relevance scoring and a token budget to decide what gets loaded. Not everything — just what this task needs (§7).
- **Human touch**: none.

### L1: Task — the unit of work

A task is a tiny experiment. It has an expected outcome. When reality differs, that's the signal worth capturing.

Inspired by Toyota Kata's "every piece of work is learning" — but we're not writing hypothesis documents. A task row is just: what we tried, what happened, what was different, what broke. Four fields. No ritual.

- **Storage**: **SQLite.** Not markdown. A task is structured data — id, parent bet, type, state, expected, actual, failures[], links. Google's Always-On Memory Agent (open-sourced late 2025) made the same call: for structured agent state, SQLite beats vector DBs. Queryable, fast, zero ops.
- **Format for agents**: direct SQL or a thin CLI wrapper — `factory task log TASK-42 "5MB chunks → OOM on Coolify"`.
- **Failures are first-class**. Not buried in logs. A dedicated `failures` table linked to tasks. This is what makes "learning from failures" actually work — it's data, not lore.
- **Human touch**: sampling only. Humans don't read the task DB. They see generated views when something matters (via L2).

### L2: Product — the department

A product runs for months. Some things about it are for humans to read and shape (the brief, the brand, the architecture). Some things are state that only agents care about (task graph, decision links, handoffs).

Don't force either into the wrong format.

**The human-readable part** (markdown files in the product repo):

These are beautiful, short, and stable. A human authors them. An agent reads them.

- `BRIEF.md` — what the product is, who it's for, why it exists
- `ARCHITECTURE.md` — how it's built and why
- `BRAND.md` — voice, positioning
- `PRINCIPLES.md` — the hard rules for this product, distilled over time from what works

These are the product's **soul**. If the files disappear, the product doesn't know who it is.

**The agent-native part** (rows in `knowledge_items` with `layer='L2'` and `scope_id` = product name):

- `tasks` (L1 lives here)
- `decisions` — lightweight rows: topic, choice, why, alternatives, outcome, links. Not 2-page ADRs. A decision is a row. The "decisions become wisdom" bit comes from their *connections*, not their prose.
- `handoffs` — what each agent session left for the next
- `cycles` — bet cycles, with start/end, intent, reality, reflection
- `bets` — active and historical

Agents read and write this directly. Humans only see it through generated views.

**The SECI bit, in practice:** SECI (knowledge converting between tacit and explicit) is a nice theory but we're not running SECI rituals. We just take the essence: **when an agent learns something, capture it inline with the work, not in a separate docs pass.** The capture happens automatically through the task outcome. Promotion to a reusable practice (L3) happens when the same learning shows up twice.

### L3: Practice — cross-product learning

**The highest-leverage layer.** Most agent systems skip this entirely.

Inspired by Knowledge-Centered Service (how good support teams work): before solving a problem from scratch, check if someone already solved it. That single behavior — *reuse before create* — is worth more than any other knowledge management practice.

- **Storage**: unified `knowledge_items` table (§3), `layer='L3'`, scoped by `scope_id` per community of practice (building, product, growth, ops). `topic` is a first-class column for grouping items (e.g. 'auth', 'deployment'). Additional fields in `meta` JSON: summary, what_works, anti_patterns, evidence_task_ids, last_used, tags.
- **Loading into sessions**: TOON-formatted packs, loaded JIT when an agent queries. A practice pack for "file handling" is maybe 200 tokens instead of a 3KB markdown file.
- **Anti-patterns are first-class**. When a task fails in L1, the failure promotes to a candidate anti-pattern. The agent that wrote it or a later reviewer confirms, and it becomes searchable: "don't do X because Y (see TASK-042)."
- **Human touch**: the Knowledge view in the Factory app (see `HUMAN_INTERFACE_LAYER.md` §4.4). Humans review new/updated practices weekly. Sharpen wording. Retire stale ones. Add tacit knowledge agents can't generate — customer taste, market intuition.

This is where Communities of Practice comes in as an inspiration, not a label: all Builders across all products share the same practice community (`layer='L3'`, `scope_id='building'` in `knowledge_items`). Knowledge that emerges in Nimmly is available to HyperIdle immediately. No copy-paste. No "did you know Ambrovia already solved this?" moments.

### L4: Factory — the meta

The company's own brain. What we believe. What we're trying to get to. Which products get energy right now.

- **Storage**: **human-readable markdown only.** This is where humans live. If a file in L4 is hard to read, the architecture is wrong.

Four files:
- `PRINCIPLES.md` — the short list of hard rules (5–10 lines, slow-changing)
- `FOCUS.md` — what we're trying to improve this month (the current target)
- `PORTFOLIO.md` — which products get energy this cycle, and why
- `REFLECTIONS/` — monthly notes from the coaching sessions (one file per month)

The Chief of Staff agent proposes changes to these files. Humans approve, edit, or reject. Git is the history.

The inspiration is double-loop learning (question the rules, not just the work) and the Kata improvement cycle (explicit target, explicit current state, explicit next experiment). We're not naming them anywhere in the interface. We're just structuring the monthly conversation around those bones.

---

## 2. The Storage Split, at a Glance

All knowledge lives in a single canonical SQLite store (`knowledge_items` table — see §3). The Knowledge Fabric projects it into the right format for each reader:

```
Layer      Artifact type              Agent projection       Human projection
─────      ────────────               ────────────────       ────────────────
L4         principles, focus          markdown files         Knowledge view (factory scope)
L3         practices, anti-patterns   TOON packs (read)      Knowledge view (practice scope)
                                      + markdown (write)
L2         brief, brand, arch         markdown files         Knowledge view (product scope)
L2         tasks, decisions, state    session.toon pack      Work view
L1         task state, failures       session.toon pack      Work view (sampled)
L0         working context            session.toon pack      not shown
```

**Same data, two projections.** Agents get token-efficient TOON packs and plain files they can grep. Humans get a rich web UI with inline editing. The Knowledge Fabric syncs continuously — materialization at session start, then a file watcher writes back changes incrementally as the agent works.

**If a file is human-readable, that means a human will actually read it.** Not "could theoretically read." Will. If no human will ever read it, it has no business being markdown — that's just token waste and version-control noise.

---

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

## 4. The Knowledge Fabric: How Knowledge Moves

The factory has two kinds of client. Humans interact through a rich web UI — inline editing, cards, dropdowns, scope selectors. Agents interact through files in a workspace directory — markdown they can read, TOON packs they can parse, plain files they can grep and write to.

Both need to read and write the same knowledge. But this is **not** a real-time collaborative editing problem. Two humans typing in the same paragraph at the same millisecond — that's what Figma, Google Docs, and Notion solve with CRDTs and OT. HyperIdle has something different: two actor types, two interface paradigms, bounded work sessions, and rare concurrent edits.

The right model is **projection, not collaboration**. One canonical store. Two projection layers that render the store into the format each actor type needs. Continuous sync via file watcher. Conflict resolution for the rare overlap.

### 4.1 Projection for humans (Web UI)

Standard web application architecture. The API server reads from `knowledge_items` and renders the Knowledge view with its three scopes (practice, product, factory).

**Read path:**
```
Browser → API → SELECT * FROM knowledge_items WHERE layer='L3' AND status='active'
                                                → render as Knowledge view cards
```

The UI renders items as rich, editable cards — inline markdown editing (Notion-style blocks), status badges, confidence indicators, approve/retire/merge actions. The Knowledge view's scope selector (Practice | Product | Factory) maps directly to the `layer` column (L3, L2, L4).

**Write path:**
```
Human edits a practice in the Knowledge view
  → API receives { id, body: "updated text", version: 14 }
  → UPDATE knowledge_items SET body=?, version=version+1, updated_by='human', updated_at=now()
     WHERE id=? AND version=14
  → If 0 rows affected: version conflict → reload and show diff
  → If 1 row affected: success → broadcast update via WebSocket to other open tabs
```

Optimistic locking via the `version` column. No locks held during editing. Conflicts are detected at write time.

### 4.2 Projection for agents (Workspace)

When the Knowledge Fabric provisions a session, it **materializes** a slice of SQLite into files in the agent's workspace.

**Workspace layout:**

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

**The manifest** (hidden in `.fabric/manifest.json`, invisible to the agent):

Tracks the version of every materialized item so the writeback can detect conflicts.

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
    }
  }
}
```

**Materialization — what gets loaded:**

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

"Load what you need, nothing more" — not every practice gets materialized. The Knowledge Fabric uses the task description, the agent's role, and tag matching to select the relevant subset. A Builder working on file uploads doesn't need Growth practices about email subject lines.

**Format choice per item** (TOON spec: [github.com/toon-format/toon](https://github.com/toon-format/toon)):

| Destination | Format | Why |
|------------|--------|-----|
| `context/practices/*.toon` | TOON | ~40% fewer tokens than markdown for structured data |
| `context/product/*.md` | Markdown | Human-authored prose, agent reads as-is |
| `context/factory/*.md` | Markdown | Same — human prose |
| `session.toon` | TOON | Packed working set: task state, bet context, handoffs |
| `knowledge/practices/*.md` | Markdown | Agent writes in markdown, easier to diff |

Practices are loaded as TOON (compact, token-efficient) in `context/` for reading, but the editable copy in `knowledge/` is markdown — because agents write markdown naturally and diffs are cleaner.

**Why materialization, not FUSE:**

FUSE (Filesystem in Userspace) would let agents see SQLite rows as a virtual filesystem without copying files. Elegant in theory. In practice: doesn't work in containers (Docker, E2B, Daytona — agent runtime environments — don't support FUSE without privileged mode, which is a security hole); every file read becomes a DB query (unpredictable latency, agents that `grep -r` hammer the database); agent harnesses expect real files (Claude Code, Goose, OpenHands read files, write files, run `diff`); no offline capability (if the FUSE daemon crashes, the workspace disappears mid-session). Materialization is boring and correct.

---

## 5. The Sync Protocol

Two phases: materialization at session start, then continuous writeback via file watcher throughout the session. No dependency on a session-end hook — knowledge flows back to the canonical store incrementally, as the agent works.

### 5.1 Materialization (session start)

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

### 5.2 Continuous writeback (during session)

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
        - If versions differ → conflict (see §6)
     e. On successful write → push update via WebSocket to open Knowledge view tabs
  3. For work/ changes:
     a. Link artifacts to the task record incrementally
     b. Update session notes
```

The agent has no awareness of the sync. It reads and writes files normally. The file watcher is invisible infrastructure.

### 5.3 Session close

When a session ends (normally or abruptly), the Knowledge Fabric:

```
1. Stops the file watcher
2. Runs one final writeback pass (catches any writes between the last
   watcher event and shutdown)
3. Records session outcome in the sessions table
4. Cleans up the workspace directory
```

Because writeback is continuous, the final pass is a lightweight delta — usually zero changes. **If the agent crashes or the session terminates abruptly, almost all knowledge is already synced.** The worst case is losing the last 500ms of writes (the debounce window), not an entire session's worth.

### 5.4 Why continuous sync

The original design was session-boundary sync: materialize at start, write back at end. This had a critical fragility — it depended on a clean session-end hook that may never fire if the agent crashes, the container is killed, or the harness doesn't support pre-termination callbacks. With continuous sync: no data loss on crash; humans see progress in real time; no hoarding incentive; simpler harness adapter contract (the adapter doesn't need to guarantee a session-end callback).

### 5.5 Session notes and knowledge promotion

When a session ends, the agent writes **session notes** — a structured summary of what happened, what was learned, and what should be promoted:

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

The writeback parses these notes and creates the appropriate records: learned items → new `knowledge_items` rows with status `CAPTURED`; proposed edits → modifications to existing items through the normal writeback path; failures → linked to the task's failure records AND promoted as candidate anti-patterns.

The facilitator pipeline (§9) then scores, organizes, and routes these items through the CAPTURED → PROVISIONAL → VALIDATED lifecycle.

### 5.6 File watcher implementation notes

The watcher must handle: **debouncing** (agents often write files in bursts — a 500ms debounce window collapses rapid writes into one writeback event); **atomic writes** (some editors write to a temp file then rename — trigger on the rename); **container environments** (Docker volumes may not support `inotify` — fall back to polling every 2s); **concurrency** (the watcher runs in its own thread/process, writeback operations use a mutex to prevent concurrent writes to the same row); **manifest updates** (after each successful writeback, the manifest is updated with new version numbers for accurate conflict detection on subsequent writes).

---

## 6. Conflict Resolution

Concurrent edits are rare but possible. Two scenarios:

**Agent vs. human:** A human edits a practice in the Knowledge view while an agent is in a session that materialized the same practice. The human's edit goes directly to SQLite (§4.1). When the agent next writes to that same practice file, the file watcher's writeback detects a version mismatch.

**Agent vs. agent:** Two agents in concurrent sessions both materialized the same practice. Both propose edits. The first writeback succeeds. The second finds a version mismatch.

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

This matters at materialization time: when the Knowledge Fabric assembles the `session.toon` context pack, it can flag contradictions between layers and include the higher-layer item as authoritative. It also matters at promotion time: a proposed L3 practice that contradicts an existing L4 principle is flagged for human review rather than auto-promoted.

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

## 7. The Materialization Budget

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

## 8. Future Upgrade: Real-Time Co-Editing

Continuous file-watcher sync (§5) handles the normal case: agents write files, the fabric syncs them back within seconds. This is near-real-time but not keystroke-level.

If we ever need true real-time co-editing of a specific document (two humans, or a human and an agent editing the same practice simultaneously at the character level), we can layer Yjs (CRDT library) on top for that specific editing session, with the canonical store still being SQLite. Yjs handles the keystroke-level merge; the Knowledge Fabric handles the durable write. This is purely additive — the canonical store, workspace layout, manifest, and conflict resolution all stay the same.

---

## 9. The Facilitators — the most undervalued role in the factory

Most agent systems have workers (agents that do things) and maybe an orchestrator (routes work). They're missing the role that actually makes knowledge compound: **the facilitator**. A dedicated agent per layer whose entire job is to organize the layer's knowledge, score what needs human attention, and collect exactly the feedback that converts information into knowledge.

This is the role that a great chief of staff, a great librarian, a great community manager, or a great editor plays in a human org. Without them, information accumulates but knowledge doesn't. With them, the signal finds the right eyes at the right time.

We already had the Chief of Staff at L4. The missing insight: **the same function needs to exist at L2 and L3**, specialized to those layers.

### The facilitator family

| Layer | Facilitator | Role analogy | What they organize |
|-------|------------|-------------|-------------------|
| L4 Factory | **Chief of Staff** | COO / chief of staff | Factory principles, portfolio, cross-product patterns, coaching the Product Managers |
| L3 Practice | **Practice Facilitator** (one per community: build/product/growth/ops, plus facilitation itself) | Guild lead / master craftsperson | Role-specific practices, anti-patterns, conflicts, community-wide learnings |
| L2 Product | **Product Manager** (one per product) | Team lead | Product cycles, team coordination, shaped pitches, cross-function handoffs — AND its own facilitation quality |

Facilitators don't do the work itself. They don't write code, write copy, talk to customers, or deploy — that's what the worker agents (Builder, Product Agent, Growth, Ops) are for. The facilitators coordinate, organize, score, and route. Think of them as the factory's nervous system: sensing where attention is needed and directing it there.

The worker agents sit in a **matrix**: each reports vertically to their Product Manager (team lead for this product) and horizontally belongs to a Practice Facilitator-led community (their craft guild across products). Exactly like a well-run engineering org where you have a team lead for your squad *and* a guild lead for your discipline.

### What facilitators do, concretely

1. **Continuously organize.** Merge duplicates. Resolve conflicts. Archive stale items. Link related artifacts. Tag for retrievability.
2. **Score every information item for human attention.** (See the attention scoring model below.)
3. **Shape the human's queue for their layer.** The L3 Practice Facilitator prepares the weekly Knowledge view curation queue. The L2 Product Manager shapes pitches for the weekly Bet Canvas. The L4 Chief of Staff prepares the monthly coaching conversation.
4. **Ask for the right kind of feedback.** Different items need different human input. A contradicting pair needs *resolution*. A novel pattern needs *validation*. A stable-but-stale practice needs *retirement or extension*. The facilitator picks the question.
5. **Close the loop.** When a human gives feedback, the facilitator writes it back into the knowledge store and bumps the confidence/attention scores accordingly.

### Information → Knowledge: the state machine

Raw capture is not knowledge. A task outcome, a failed attempt, a decision record — these are *information*. They become *knowledge* only when they've been validated, contextualized, and proven reusable.

Every item in the factory has a status:

```
CAPTURED      ─┐
               │  (a task failed, a decision was made, a pattern appeared)
               ▼
PROVISIONAL    ─┐
               │  (picked up by a facilitator, organized, linked)
               ▼
NEEDS HUMAN    ─┐
               │  (scored high enough to surface for human review)
               ▼
VALIDATED      ─┐
               │  (human confirmed, sharpened, or explicitly retired)
               ▼
ACTIVE         ─┐
               │  (in use by other agents, being referenced)
               ▼
STALE          ─┐
               │  (no reads, no references, decaying)
               ▼
ARCHIVED
```

**Most items never need a human.** If the same pattern shows up in 5 products and never gets contradicted, the facilitator can auto-promote it from PROVISIONAL straight to VALIDATED via repetition. Human attention is the scarcest resource in the factory — the facilitators exist so humans only see the items where their specific judgment actually matters.

### The attention score

Each item gets a continuous score. When it crosses a threshold, it enters a human's queue. The score is a weighted sum of:

| Signal | Why it matters | Weight |
|--------|----------------|--------|
| **Novelty** | Have we seen this pattern before? New patterns carry more information. | high |
| **Impact** | If wrong, how many agents/products would be affected? | high |
| **Conflict** | Does this contradict something we already believe? Contradictions force choice. | high |
| **Repetition** | Has this shown up multiple times independently? (Auto-validates without human.) | reduces need |
| **Confidence** | How sure are we? Based on outcome data, agent uncertainty, agreement. | reduces need |
| **Taste sensitivity** | Is this the kind of thing that needs human judgment? (Brand voice, aesthetics, strategic framing, customer intuition — things agents can't generate.) | high |
| **Recency of review** | Has a human looked at this part of the system recently? | medium |
| **Usage frequency** | Is this actually being used, or just sitting there? | medium |

Low score → the facilitator handles it autonomously. High score → it surfaces in the Knowledge view's "needs attention" list. The facilitator also chooses *what kind* of feedback to ask for:

| Signal | Question to ask |
|--------|-----------------|
| Novelty + high impact | "Is this pattern real? Should we make it a rule?" (validation) |
| Conflict | "A and B contradict. Which applies when?" (resolution) |
| Stale but popular | "This is old but still referenced. Still true?" (refresh) |
| Taste-sensitive | "Does this feel right for our brand/customer?" (judgment) |
| Cross-layer promotion | "Should this practice become a factory principle?" (elevation) |

This last column is the real point. Most agent systems either dump everything on humans (inbox hell) or auto-act on everything (drift). The facilitator's job is to ask the *right kind of question* about the *right item* at the *right time*. That's the work that converts information into knowledge.

### The Product Manager as team lead

The Product Manager isn't just a librarian. It's the **team lead** — the CEO of the product. Classic matrix structure: vertical line management (it leads the product team) plus horizontal community membership (each team member also belongs to a cross-product community of practice led by a Practice Facilitator).

```
                 │ Build community   │ Product community │ Growth community  │ Ops community
                 │ (Practice Facil.) │ (Practice Facil.) │ (Practice Facil.) │ (Practice Facil.)
─────────────────┼───────────────────┼───────────────────┼───────────────────┼───────────────────
Nimmly           │                   │                   │                   │
  (Product       │     Builder       │   Product Agent   │      Growth       │       Ops
   Manager)      │                   │                   │                   │
─────────────────┼───────────────────┼───────────────────┼───────────────────┼───────────────────
HyperIdle        │                   │                   │                   │
  (Product       │     Builder       │   Product Agent   │      Growth       │       Ops
   Manager)      │                   │                   │                   │
─────────────────┼───────────────────┼───────────────────┼───────────────────┼───────────────────
Ambrovia         │                   │                   │                   │
  (Product       │     Builder       │   Product Agent   │      Growth       │       Ops
   Manager)      │                   │                   │                   │
```

Two jobs running in parallel:

**Job 1 — Coordinator:** Runs the product's cycles: kicks off bets, tracks status, calls the end-of-cycle reflection. Resolves cross-function handoffs within the team. Unblocks the team. Shapes 2–4 pitches for the next cycle's Bet Canvas. Escalates to the Chief of Staff when something is beyond product scope.

**Job 2 — Self-improver:** Watches its own coordination and asks: *am I running this team well?* Captures facilitation-level learnings. Runs its own end-of-cycle reflection on facilitation quality. Proposes process changes. Learns from the Chief of Staff's coaching.

**This self-improvement loop is the critical move.** Without it, the Product Manager is just a static process runner. With it, the facilitator gets better at facilitating over time. It's also the lever that makes the 5th product cheaper than the 4th: the Nimmly Product Manager's facilitation learnings transfer via the Practice Facilitator for "product leadership" to HyperIdle's Product Manager.

And yes — **the facilitators themselves form a community of practice.** There's a fifth Practice Facilitator for "facilitation itself" — it organizes how the Product Managers learn from each other. Turtles, but only this far down.

### The team layer stays flat

The agent side of the factory is **always flat**. There is one layer of product teams, each with its own Product Manager. There is never a Business Facilitator or any other middle-management agent layer between the Product Managers and the Chief of Staff.

A product team owns *a unit of value*, in two shapes: a standalone product that IS a business (example: Ambrovia), or a product that is part of a larger multi-product business (example: an "SME Finance Suite" that bundles Ambrovia + Nimmly). Each product still has its own team and Product Manager. **The business leaders are always the humans.** They own suite-level strategy, pricing, positioning, cross-product bundling, and the decision about whether a product is standalone or part of a suite. The Chief of Staff surfaces cross-product items to the humans but doesn't delegate to another agent layer below itself.

```
                        Humans
                    (business level)
                           │
                  Chief of Staff (Factory)
                           │
           ┌───────────────┼───────────────┐
           │               │               │
  Product Manager  Product Manager  Product Manager
      (Ambrovia)       (Nimmly)        (HyperIdle)
```

File structure reflects this — the business dimension lives as metadata the humans maintain, not as a nested agent hierarchy. The markdown files below are **exports** from the canonical `knowledge_items` table, maintained in Git for version history:

```
exports/
  products/
    ambrovia/
      BRIEF.md, ARCHITECTURE.md, BRAND.md, PRINCIPLES.md
    nimmly/
      BRIEF.md, ARCHITECTURE.md, BRAND.md, PRINCIPLES.md
    hyperidle/
      ...

  factory/
    PRINCIPLES.md
    FOCUS.md
    PORTFOLIO.md       # human-maintained: which products belong to which business
    BUSINESSES.md      # human-maintained: the business-level framing
```

No `businesses/` directory. No nesting. The business-level thinking lives in two human-maintained markdown files at the factory level. This keeps the agent structure dead simple and puts strategic business judgment exactly where it belongs — with the people.

### What the Practice Facilitator does

One per community (build, product, growth, ops). They: ingest task outcomes and failures flagged as potentially reusable by Product Managers; merge duplicates across products ("Nimmly and Ambrovia both hit this chunk-size issue"); resolve conflicts ("practice X says one thing, practice Y says the opposite — surface for human"); score everything for attention; curate the weekly Knowledge view queue for the founders; retire practices that aren't being used.

They're the community's librarian. They don't write the practices. They make sure the right ones exist, are findable, and are trusted.

### The cost of NOT having facilitators

Without these agents, every information item either (a) sits in the database unread until it's too late, (b) gets dumped on the founders who drown in inbox overload, or (c) gets auto-applied without validation and the factory drifts. Most agent frameworks today do (a) and call it "memory." Some try (b) and users quit. Almost nobody does (c) well because the validation step is genuinely hard.

The facilitators are where the human-in-the-loop idea actually becomes sustainable. Without them, "humans validate" is just another word for "humans become a bottleneck."

---

## 10. The Facilitator Stack in Action

Each human view is fed by a matching facilitator. The facilitators do all the organizing, scoring, and routing. The humans just show up to their views and find the right work waiting.

| Human view | Fed by | Score type that surfaces items |
|------------|--------|-------------------------------|
| Conversations (Review) | **All facilitators** — plus agents directly for approvals | High impact + high novelty + risk-tier ≥ medium |
| Rail (Prioritize) | **Product Managers** + Chief of Staff | Items awaiting human ordering but not urgent |
| Work (Bet) | **Product Managers** shape pitches; **Chief of Staff** shapes portfolio bets | Shaped pitches ready for the weekly cycle |
| Knowledge (Curate) | **Practice Facilitators** (one per community) | Novelty, conflict, staleness, taste-sensitive |
| Chief of Staff's chat | **Chief of Staff** | Cross-product patterns, recurring obstacles, rule-change proposals |

This is the loop: agents produce information → facilitators organize and score → humans validate the highest-signal items in their matched view → facilitators write the validated knowledge back and update scores → agents use the validated knowledge. The factory becomes smarter every cycle without drowning the humans.

**Without the facilitators, this whole architecture is just a database with a pretty frontend.** With them, it's an actual learning system.

---

## 11. Design Decisions and Trade-offs

**Why SQLite, not Postgres, as the canonical store?** SQLite is the right default: zero ops, single-file backup, fast reads, works on a laptop. The factory is built for small teams — the write throughput ceiling of SQLite (WAL mode, ~50K writes/sec) far exceeds anything a factory of <50 agents will produce. If a deployment grows beyond SQLite's comfort zone, the Postgres adapter extends to `knowledge_items` with the same schema.

**Why not CRDTs everywhere?** CRDTs (Yjs, Automerge) solve real-time keystroke-level collaboration. HyperIdle's concurrent edit rate is near zero — the median session has zero conflicts. Paying the complexity cost for a problem that barely exists is over-engineering. The upgrade path to Yjs for specific editing sessions (§8) gives us the option without baking it into the foundation.

**Why not OT (Operational Transform)?** OT requires a persistent connection between clients and server during editing. Agent sessions are disconnected — the agent works on local files, syncs at boundaries. OT doesn't fit the session model.

**Why materialization over FUSE?** See §4.2. The short version: FUSE doesn't work in containers, turns file reads into DB queries, and breaks when the daemon crashes. Materialization is boring and correct.

**Why three workspace zones instead of one?** Without the `context/` vs `knowledge/` vs `work/` split, the writeback can't distinguish "the agent read this file and happened to modify it while experimenting" from "the agent intentionally proposes this knowledge change." The zones make intent explicit, which makes the writeback reliable.

**Why continuous sync instead of session-boundary?** Session-boundary sync depends on a clean session-end hook — fragile when agents crash, containers are killed, or harnesses don't support pre-termination callbacks. Continuous sync via file watcher eliminates this fragility: knowledge flows back within seconds of being written. The worst-case data loss is the 500ms debounce window, not an entire session.

---

## 12. Implementation Sequence

1. **`knowledge_items` table + basic CRUD API.** The canonical store. All other work depends on this.
2. **Materialization engine.** Given a session context, produce a workspace directory. This unlocks agent sessions with real knowledge loading.
3. **File watcher + continuous writeback engine.** Watch `knowledge/` and `work/` for changes, diff and write back to `knowledge_items` incrementally. Includes debouncing, atomic-write handling, and polling fallback. This closes the sync loop.
4. **Knowledge view API + WebSocket push.** The read/write API for the human-facing Knowledge view, with real-time updates pushed when the file watcher writes back agent changes.
5. **Manifest + conflict detection.** Version tracking and the per-field LWW merge.
6. **Materialization budget + relevance scoring.** The intelligence layer that decides what gets loaded.
7. **Git export routine.** Re-export human-readable files to Git after edits.

---

## 13. Summary

1. **One canonical store.** All knowledge lives in a single `knowledge_items` table in SQLite. No split across multiple databases and file trees.
2. **Two projections.** The Knowledge Fabric projects the store into rich web UI for humans (the Knowledge view) and materialized file workspaces for agents (TOON packs + markdown).
3. **Continuous sync.** Knowledge is materialized at session start, then written back incrementally via file watcher. Optimistic concurrency with per-field last-writer-wins for the rare conflict.
4. **Three views for humans**: Conversations (messaging, reviews), Work (bets, tasks), Knowledge (wiki — practice, product, and factory scope). Plus the Rail. See `HUMAN_INTERFACE_LAYER.md` for full specs.
5. **A family of facilitator agents** — Product Manager per product, Practice Facilitator per community, Chief of Staff at the factory — continuously organizes information, scores it for human attention, and routes the right question to the right view at the right time.
6. **Every information item has a state** (captured → provisional → needs-human → validated → active → stale → archived) and an attention score. Most items never need a human. The ones that do carry exactly the signal humans add value on.
7. **Knowledge flows up through promotion**: L1 discoveries → L3 practices → L4 principles. Failures travel the same path as anti-patterns.
8. **Layer precedence: L4 > L3 > L2 > L1.** Higher layers are more absolute.
9. **Edit log for facilitator learning.** Every human edit is logged in `knowledge_edit_log` so facilitators can learn from corrections.

---

## 14. Inspirations

**Storage and memory:**
- **Letta/MemGPT** — memory tiered like an OS; the agent manages its own working set (L0)
- **Google's Always-On Memory Agent** — SQLite beats vector DBs for structured agent state (L1, L2)
- **Memori** — structured extraction of facts/events/preferences at ~5% of full-context tokens (L2, L3)
- **MemPalace** — wings/rooms/halls metaphor with temporal validity (informs L3 decay)
- **TOON format** — ~40% fewer tokens than JSON for the agent-to-agent context packs (L0 loading)

**Multi-agent coordination:**
- **MCP Agent Mail** (Dicklesworthstone / Steve Yegge's fork) — identities, inboxes, file leases, git+SQLite
- **LangChain Agent Inbox** — inbox UX for human-in-the-loop
- **Mission Control (builderz-labs)** — the Aegis blocking review gate for high-risk items
- **OpenAgents** — "Slack for agents" shared-thread pattern

**Interface metaphors:**
- **Shape Up** — pitches-and-appetite as the bet-making model
- **oh-my-codex HUD** — ambient heads-up display
- **Windsurf Cascade** — anticipation by watching the human's workspace
- **Read AI** — persistent conversation as knowledge graph

**Human knowledge theory:**
- **Toyota Kata** — treat work as experiments; conversation-shaped coaching (L1, L4)
- **SECI** — capture what you learned inline with the work (L1→L2→L3)
- **KCS** — reuse before create. The single highest-leverage behavior. (L3)
- **Communities of Practice** — share by function across products (L3)
- **Shape Up** — bets over backlog, shaped pitches with appetite (L2, Work view)
- **Double-loop learning** — change the rules, not just the work (L4)
