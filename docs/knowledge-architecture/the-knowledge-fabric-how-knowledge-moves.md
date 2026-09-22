# Knowledge Movement

The system has two kinds of client. Humans interact through a rich web UI — inline editing, cards, scope pills. Agents interact through files in a session sandbox — markdown they can read, grep, and write, plus one TOON pack — or through the three document tools (`search_documents`/`open_document`/`edit_document`) directly.

Both read and write the same documents, but this is **not** a real-time collaborative editing problem. Two humans typing in the same paragraph at the same millisecond is what Figma and Google Docs solve with CRDTs and OT. HyperIdle has two actor types, two interface paradigms, bounded work sessions, and rare concurrent edits.

The right model is **projection, not collaboration**. One canonical store. Two projection layers that render the store into the format each actor type needs. Continuous sync via file watcher, with a stale write simply refused — the whole write flow (watcher, debounce, writeback rules, what a version clash does) is owned by [sync-and-conflict-resolution.md](sync-and-conflict-resolution.md).

## 1. The storage split at a glance

One canonical store: the `documents` table (`framework/db/src/schema.ts`) — Postgres, via embedded PGlite locally or postgres-js on a server. There is no separate projection table; usage signals live on the same row. Store semantics — the parent/slot/scope attachment, the tree, `SCOPE_KINDS` — are owned by [the-canonical-store.md](the-canonical-store.md).

App-runtime projects the same rows two ways:

| Reader | Projection |
|---|---|
| Agents | One writable, watched `knowledge/` directory tree, shaped like the real tree, plus a read-only `context/session.toon` — and the three tools directly, for anything not materialised (a memory, a search by title, a document outside the assembled set) |
| Humans | The Knowledge view and Work view in the web UI |

`SCOPE_KINDS` is `factory | team | user` — three concentric rings of *who sees it*, unrelated to *what it is about*.

**If a file is human-readable, that means a human will actually read it.** Not "could theoretically read." Will. If no human will ever read it, it has no business being markdown — that's just token waste and version-control noise. Agent-only session state ships as TOON; human-curated knowledge ships as markdown.

### Document → task

Promoting a document into a task creates a new task with `sourceDocumentId` set to the document's id. The task header links back to the source document. This edge is owned by the task create flow; the provenance column is `tasks.source_document_id` (`framework/db/src/schema.ts`). This is the opposite direction from **reparenting** a task's own artifact into the tree (an ordinary `edit_document` move, owned by [the-canonical-store.md](the-canonical-store.md#the-tree)) — one turns a note into a task, the other turns a task's artifact into a tree document.

## 2. Projection for humans (Web UI)

The browser calls the same three actions a person or an agent ever calls — `POST /api/actions/search_documents` / `open_document` / `edit_document` — never a bespoke `/api/knowledge` route; there is no separate HTTP surface for the Knowledge view. `core-ui`'s `useDocument`/`useDocuments` hooks (`layers/core-ui/src/hooks/`) wrap `call("open_document", …)`/`call("search_documents", …)`, kept live by the websocket nudge (below) rather than polling.

**Write path.** Optimistic locking on the `version` field — no locks held during editing:

```
Human edits a document in the Knowledge view
  → call("edit_document", { id, body, version })
  → version mismatch → problem "stale" — reload and retry
  → match → update, version+1, one `document.changed` row
```

**There is a live websocket push.** Every `document.created`/`document.changed` row pushes once on `document:<id>` and once on the broad `documents` topic — an open document view and an open list both refresh themselves without polling. See [the-canonical-store.md](the-canonical-store.md#history-changes-not-an-edit-log).

**Nesting and moving** happen on the same detail surface: create names a `document` parent directly on the create call, and Move reparents an existing document, subject to the same tree invariants a sandbox move obeys — see [the-canonical-store.md](the-canonical-store.md#the-tree).

## 3. Projection for agents (session sandbox)

Selection, ranking, and budgeting are done **before** a session starts, not at provisioning time. A per-kind resolver (the task-run resolver, the routine resolver, the knowledge-action resolver) calls the shared `assembleSessionDocuments` (`layers/core-api/document/src/session-documents.ts`) to fetch the factory-wide, the agent's team, and the agent's own ordinary documents, plus its capability documents (skill/rule/agent_file), then rank+budget the ordinary set into a baked `contextBundle`. That bundle rides along on the session request. Context assembly then does zero DB reads — it only writes the already-baked bundle into files in the agent's sandbox, and `assembleSessionDocuments`'s own last step bumps `session_use_count`/`last_used_at` on exactly the documents it is about to hand over.

**Sandbox layout:**

```
<sandbox>/
  .fabric/
    manifest.json            # version tracking (hidden from the agent)

  context/                   # READ-ONLY (chmod 0o444)
    session.toon             # TOON pack: task, ancestors, agent, team, routine state

  knowledge/                 # READ-WRITE, watched — the real tree, shaped like the real tree
    rules/                   # slot='rule' documents land here regardless of tree position
    <ancestor title>/
      index.md                # the ancestor's own body
      <child title>_<id8>.md

  work/                       # READ-WRITE — session scratch
    task-notes.md             # created empty at assembly
    artifacts/

  .claude/skills/<dir>/SKILL.md   # slot='skill' documents — every harness-skill dir gets a copy
  .agents/skills/<dir>/SKILL.md
```

**There is one writable, watched `knowledge/` tree, not a set of layer buckets.** A document's own materialised place writes wherever its parent chain says, exactly the tree a human sees on the same documents. `knowledge/rules` is the one fixed subdirectory that survives, because `slot='rule'` documents land there regardless of tree position — placement follows slot, not tree position, same as skill documents landing in the harness's own skill directories.

**Materialising the tree:** every selected document is placed under `knowledge/` following its real ancestor chain, baked at emit time — zero DB reads here. An ancestor directory gets an `index.md` — a title-only placeholder if that ancestor itself wasn't independently selected ("a path with a missing middle means nothing" — an unselected ancestor still needs a name for the path to make sense, so it gets one, incomplete rather than fabricated), or its real body if the ancestor *was* selected too (a parent-with-children materialises as a directory whose `index.md` holds its own real content, never a stray sibling file). Document filenames are slugified `<title>_<id8>.md` — the `_<id8>` suffix is what makes a move self-identifying; see [sync-and-conflict-resolution.md](sync-and-conflict-resolution.md).

**Three zones, three intentions:**

| Zone | Permission | Purpose | Fate |
|------|-----------|---------|------|
| `context/` | read-only | This session's own context (task, ancestors, agent, team, routine state) | Changes discarded |
| `work/` | read-write | Session scratch, artifacts | Captured back at session end (see [run-unit-model.md](../architecture/run-unit-model.md)) |
| `knowledge/` | read-write, watched | The real document tree — reading it is reading the knowledge base, writing to it proposes a change | Diffed and written back to `documents` via `edit_document`, as the session's own agent |

The watcher observes `knowledge/` and `work/` only; writeback mechanics live in [sync-and-conflict-resolution.md](sync-and-conflict-resolution.md).

**The manifest** (`.fabric/manifest.json`, invisible to the agent) tracks the version and `source_path` of every assembled document, including the directory documents materialised for its ancestors, so writeback can detect a stale write and a move:

```json
{
  "session_id": "sess-042",
  "assembled_at": "2026-04-10T09:00:00Z",
  "items": {
    "doc-practice-file-handling": {
      "version": 14,
      "source_path": "knowledge/Practices/Building/file-handling_a1b2c3d4.md",
      "format": "markdown",
      "scopeKind": "factory"
    }
  }
}
```

Writeback matches files to documents by `source_path` and checks versions against the manifest; a create whose filename carries the same `_<id8>` suffix as an already-tracked path is treated as that document, moved.

**Assembly selection — what gets loaded:** factory-wide ordinary documents (all of them), the agent's team's ordinary documents, and the agent's own — no subtree selection. What an agent receives is answered entirely by scope. The combined set is then scored against the task description and trimmed to a token budget (`session-documents.ts`):

| Factor | Default weight | Semantics |
|---|---|---|
| Tag match | 0.55 | Document title + `meta.tags` vs task tags |
| Recency | 0.20 | 30-day linear decay from `updatedAt` |
| Confidence | 0.15 | Stored `confidence` in [0,1] |

Weights are fixed constants, not DB-tunable. Budget: `CONTEXT_WINDOW_TOKENS = 200,000`, `DOCUMENT_ALLOCATION_RATIO = 0.2` → a 40,000-token document budget, filled greedily by score descending, with one exception — **factory-scoped documents are always included first, non-negotiable, even over budget**. Capability documents (skill/rule/agent_file) bypass ranking entirely and load unconditionally — plugin installation is a deliberate act. "Load what you need, nothing more" is implemented, not aspirational; the cap exists to prevent a degenerate case (a scope with thousands of documents) from blowing up session costs.

**Nothing scores a document for human attention any more.** There is no facilitator review queue and no attention engine. Instead, the document-management plugin's `document-triage` routine reads every `proposed` document and promotes or archives it by judgement, and its `document-decay` routine archives `ordinary`, in-tree documents nobody has read or been handed in 90+ days (`search_documents({unusedSince, sort:"least_used"})`) — both real agent routines, not a scoring formula. See `plugins/document-management/`.

**TOON reality** (spec: [github.com/toon-format/toon](https://github.com/toon-format/toon); codec at `framework/toon-codec/src/toon-codec.ts`): the only TOON artifact is `context/session.toon`, built from task (with its subtree context), team, user, and routine state. Documents are always written as markdown; per-document TOON packing was never built.

## 4. Why context assembly, not FUSE

FUSE would let agents see database rows as a virtual filesystem without copying files. Elegant in theory. In practice: every file read becomes a DB query (unpredictable latency; an agent that runs `grep -r` hammers the database); agent harnesses expect real files (claude-code, codex, opencode, cursor-agent all read, write, and diff plain files); and a crashed FUSE daemon takes the sandbox away mid-session. Agents run directly on the host ([run-unit-model.md](../architecture/run-unit-model.md)). Context assembly is boring and correct.
