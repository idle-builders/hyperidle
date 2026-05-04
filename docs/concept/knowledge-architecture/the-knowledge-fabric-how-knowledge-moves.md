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

The UI renders items as rich, editable cards — inline markdown editing, status badges, confidence indicators, approve/retire/merge actions. The Knowledge view's scope selector (Practice | Product | Factory) maps directly to the `layer` column (L3, L2, L4).

**Body-as-blocks projection.** The `knowledge_items.body` column stores GitHub-flavoured markdown text. When the API serves the body to the Web UI, the **Block primitive** (TRACK-L L2; full spec at `docs/concept/BLOCKS.md`; cross-cutting section at `HUMAN_INTERFACE_LAYER.md` §4.6) derives a structured view: an ordered list of blocks (heading, paragraph, list, code, quote, table, hr, image), each with a stable id, scoped by `host_id = knowledge_item:<id>`. The body stays markdown text; the block list is recomputed on read. Per-block discussion (L26) attaches a thread message to a `(host_id, block_id)` anchor without introducing any markdown-dialect markers — block ids are reproducible from content + position, never written into the source. Concept rules to honour from the architecture side: (1) no `blocks` table that mirrors `knowledge_items.body`; (2) clients never compute block ids; (3) optimistic-locking remains at body granularity, not per-block.

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
