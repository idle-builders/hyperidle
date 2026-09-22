# Knowledge Movement

The system has two kinds of client. Humans interact through a rich web UI — inline editing, cards, scope pills. Agents interact through files in a session sandbox — markdown they can read, grep, and write, plus one TOON pack.

Both read and write the same knowledge, but this is **not** a real-time collaborative editing problem. Two humans typing in the same paragraph at the same millisecond is what Figma and Google Docs solve with CRDTs and OT. HyperIdle has two actor types, two interface paradigms, bounded work sessions, and rare concurrent edits.

The right model is **projection, not collaboration**. One canonical store. Two projection layers that render the store into the format each actor type needs. Continuous sync via file watcher, with conflict resolution for the rare overlap — the whole write flow (watcher, debounce, writeback rules, LWW vs escalation) is owned by [sync-and-conflict-resolution.md](sync-and-conflict-resolution.md).

## 1. The storage split at a glance

One canonical store: the `knowledge_items` table (`framework/db/src/schema.ts:835`) — Postgres, via embedded PGlite locally or postgres-js on a server. Derived signals live on the companion `knowledge_app_projection` extension table, not the kernel table; store semantics — the kernel/projection field split, the parent/role/scope attachment, the tree, `SCOPE_KINDS` — are owned by [the-canonical-store.md](the-canonical-store.md).

App-runtime projects the same rows two ways:

| Reader | Projection |
|---|---|
| Agents | One writable, watched `knowledge/` directory tree, shaped like the real tree, plus a read-only `context/session.toon` |
| Humans | Knowledge and Work views in the web UI |

There is no `bet` scope kind and no `product`/`practice` scope kind — migration `0068` re-scoped every `bet` row to `task`, and migration `0080` retired `product`/`practice` into ordinary knowledge items near the root (a "Product" root, a "Practices" root — see [the-canonical-store.md](the-canonical-store.md#the-tree)). `SCOPE_KINDS` is `factory | team | user` — three concentric rings of *who sees it*, unrelated to *what it is about*.

**If a file is human-readable, that means a human will actually read it.** Not "could theoretically read." Will. If no human will ever read it, it has no business being markdown — that's just token waste and version-control noise. Agent-only session state ships as TOON; human-curated knowledge ships as markdown.

### Knowledge → task

Promoting a document into a task creates a new task with `sourceDocumentId` set to the document's id. The task header links back to the source document. This edge is owned by the task create flow; the provenance column is `tasks.source_document_id` (`framework/db/src/schema.ts`). This is the opposite direction from **graduating** a task's own knowledge into the tree (a reparent, owned by [the-canonical-store.md](the-canonical-store.md#the-tree)) — one turns a note into a task, the other turns a task's note into a tree item.

## 2. Projection for humans (Web UI)

The API server reads `knowledge_items` and serves the Knowledge view (`layers/core-api/src/routes/knowledge.ts`). The UI's scope pills are **All / Shared / Team / Private**, filtering on `scopeKind` (`layers/core-ui/src/utils/scope-labels.ts`, `SCOPE_PILL_OPTIONS`) — Shared is `factory`, Team is `team`, Private is `user`. The create/change flow's scope picker mirrors it 1:1 (`SCOPE_CREATE_OPTIONS`); there is no fourth "Role" option any more — a role-scoped pattern is filed by nesting it under the Practices root, not by picking a scope.

**Body-as-blocks.** `knowledge_items.body` stays markdown text; the Block list is derived on read (`framework/block-derivation/src/blocks/derive-blocks.ts`) with stable derived ids, and per-block discussion anchors via `messages.block_id` (`framework/db/src/schema.ts:788`). No `blocks` table mirrors the body; clients never compute block ids; optimistic locking stays at body granularity. The Block primitive is owned by [docs/blocks/](../blocks/index.md).

**Write path.** Optimistic locking on the `version` column — no locks held during editing:

```
Human edits an item in the Knowledge view
  → PATCH /:id with { body, version }
  → version mismatch → 409 CONFLICT with { currentVersion } (`layers/core-api/src/routes/knowledge.ts`)
  → match → update, version+1, edit log entry
```

There is no live WebSocket push for this event today — the generic `knowledge_updated`/`item_created`/`artifact_created` broadcast forwarder was deleted (AU21 §6 Decision L4): it had zero real frontend consumers. The Knowledge view picks up the change on its next fetch, not via a live socket push.

**Nesting and moving** happen on the same detail surface: create names a `knowledge_item` parent directly on `POST` (never create-then-PATCH), and Move reparents an existing item, subject to the same tree invariants a sandbox move obeys — see [the-canonical-store.md](the-canonical-store.md#the-tree).

## 3. Projection for agents (session sandbox)

Selection, ranking, and budgeting are done **before** a session starts, not at provisioning time. A per-kind resolver (`@hyperidle/work`'s task-run resolver, `@hyperidle/knowledge`'s knowledge-action resolver, the routine resolver) calls the shared `assembleSessionKnowledge` (`layers/core-api/knowledge/src/session-knowledge-assembler.ts`) to fetch the factory-wide, the agent's team, and the agent's own ordinary items, plus its capability items (skill/rule/agent_file), then rank+budget the ordinary set into a baked `contextBundle`. That bundle rides along on the session request. `assembleAgentContext` (`layers/agent-orchestration/run-orchestration/src/context.ts`) then does zero DB reads — it only writes the already-baked bundle into files in the agent's sandbox.

**Sandbox layout** (`CONTEXT_ASSEMBLY_DIRS`, `context.ts:698`):

```
<sandbox>/
  .fabric/
    manifest.json            # version tracking (hidden from the agent)

  context/                   # READ-ONLY (chmod 0o444)
    session.toon             # TOON pack: task, ancestors, agent, team, routine state

  knowledge/                 # READ-WRITE, watched — the real tree, shaped like the real tree
    rules/                   # role='rule' items land here regardless of tree position
    <ancestor title>/
      index.md                # the ancestor's own body
      <child title>_<id8>.md

  work/                       # READ-WRITE — session scratch
    task-notes.md             # created empty at assembly
    artifacts/

  .claude/skills/<dir>/SKILL.md   # role='skill' items — every harness-skill dir gets a copy
  .agents/skills/<dir>/SKILL.md
```

**There is one writable, watched `knowledge/` tree, not a set of layer buckets.** The per-layer `context/product|practices|factory` zones and the `knowledge/practices|decisions|failures` kind-inference subdirectories are gone — an agent's own materialised knowledge writes wherever its parent chain says, exactly the tree a human sees on the same items. `knowledge/rules` is the one fixed subdirectory that survives, because `role='rule'` items land there regardless of tree position — placement follows role, not tree position, same as skill items landing in the harness's own skill directories (`HARNESS_SKILL_DIRS`, `context.ts`).

**Materialising the tree** (`writeOrdinaryItems`, `context.ts`): every selected item is placed under `knowledge/` following its real ancestor chain (`item.parentChain`, baked at emit time — zero DB reads here). An ancestor directory gets an `index.md` — a title-only placeholder if that ancestor itself wasn't independently selected ("a path with a missing middle means nothing" — an unselected ancestor still needs a name for the path to make sense, so it gets one, incomplete rather than fabricated), or its real body if the ancestor *was* selected too (a parent-with-children materialises as a directory whose `index.md` holds its own real content, never a stray sibling file). Item filenames are slugified `<title>_<id8>.md` (`toFilename`, `context.ts`) — the `_<id8>` suffix is what makes a move self-identifying; see [sync-and-conflict-resolution.md](sync-and-conflict-resolution.md).

**Three zones, three intentions:**

| Zone | Permission | Purpose | Fate |
|------|-----------|---------|------|
| `context/` | read-only | This session's own context (task, ancestors, agent, team, routine state) | Changes discarded |
| `work/` | read-write | Session scratch, artifacts | Captured back at session end (see [run-unit-model.md](../architecture/run-unit-model.md)) |
| `knowledge/` | read-write, watched | The real knowledge tree — reading it is reading the knowledge base, writing to it proposes a change | Diffed and written back to `knowledge_items` |

The watcher observes `knowledge/` and `work/` only (`isWatchedPath`, `file-watcher.ts`); writeback mechanics live in [sync-and-conflict-resolution.md](sync-and-conflict-resolution.md).

**The manifest** (`.fabric/manifest.json`, invisible to the agent) tracks the version and `source_path` of every assembled item, including the directory items materialised for its ancestors, so writeback can detect conflicts and moves (`Manifest`/`ManifestEntry`, `manifest-types.ts`):

```json
{
  "session_id": "sess-042",
  "assembled_at": "2026-04-10T09:00:00Z",
  "items": {
    "ki-practice-file-handling": {
      "version": 14,
      "source_path": "knowledge/Practices/Building/file-handling_a1b2c3d4.md",
      "format": "markdown",
      "scopeKind": "factory"
    }
  }
}
```

Writeback matches files to items by `source_path` and checks versions against the manifest; a create whose filename carries the same `_<id8>` suffix as an already-tracked path is treated as that item, moved.

**Assembly selection — what gets loaded** (`assembleSessionKnowledge`, `session-knowledge-assembler.ts`): factory-wide ordinary items (all of them), the agent's team's ordinary items, and the agent's own — no subtree selection, no replacement for the old layer ladder. What an agent receives is answered entirely by scope now. The combined set is then scored against the task description and trimmed to the token budget via `rank(…)`, which defaults to `DEFAULT_KNOWLEDGE_BUDGET` from `scoring-config.ts` — "load what you need, nothing more" is implemented, not aspirational. Capability items (skill/rule/agent_file) bypass ranking entirely — plugin installation is a deliberate act. Scoring and budget are owned by [relevance-and-attention.md](relevance-and-attention.md).

**TOON reality** (spec: [github.com/toon-format/toon](https://github.com/toon-format/toon); codec at `framework/toon-codec/src/toon-codec.ts`): the only TOON artifact is `context/session.toon`, built from task (with its subtree context), team, user, and routine state. Knowledge items — including practices — are always written as markdown; per-item TOON packing was never built.

## 4. Why context assembly, not FUSE

FUSE would let agents see database rows as a virtual filesystem without copying files. Elegant in theory. In practice: every file read becomes a DB query (unpredictable latency; an agent that runs `grep -r` hammers the database); agent harnesses expect real files (claude-code, codex, opencode, cursor-agent all read, write, and diff plain files); and a crashed FUSE daemon takes the sandbox away mid-session. Agents run directly on the host ([run-unit-model.md](../architecture/run-unit-model.md)). Context assembly is boring and correct.
