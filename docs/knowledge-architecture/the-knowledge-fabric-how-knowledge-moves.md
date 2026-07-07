# The Knowledge Fabric: How Knowledge Moves

The system has two kinds of client. Humans interact through a rich web UI — inline editing, cards, scope pills. Agents interact through files in a session sandbox — markdown they can read, grep, and write, plus one TOON pack.

Both read and write the same knowledge, but this is **not** a real-time collaborative editing problem. Two humans typing in the same paragraph at the same millisecond is what Figma and Google Docs solve with CRDTs and OT. HyperIdle has two actor types, two interface paradigms, bounded work sessions, and rare concurrent edits.

The right model is **projection, not collaboration**. One canonical store. Two projection layers that render the store into the format each actor type needs. Continuous sync via file watcher, with conflict resolution for the rare overlap — the whole write flow (watcher, debounce, writeback rules, LWW vs escalation) is owned by [sync-and-conflict-resolution.md](sync-and-conflict-resolution.md).

## 1. The storage split at a glance

One canonical store: the `knowledge_items` table (`packages/db/src/schema.ts:580`) — Postgres, via embedded PGlite locally or postgres-js on a server. Strategy fields (layer, kind, scores) live on the companion `knowledge_strategy_fabric` extension table, not the kernel table; store semantics are owned by [the-canonical-store.md](the-canonical-store.md).

The fabric projects the same rows two ways:

| Reader | Projection |
|---|---|
| Agents | Plain files in the session sandbox (`context/factory`, `context/product`, `context/practices`) + one TOON pack (`context/session.toon`) |
| Humans | Knowledge and Work views in the web UI |

Scope maps to layer via `SCOPE_TO_LAYER` (`packages/fabric/src/types.ts:25-33`): factory→L4, product→L2, practice→L3, task→L1; bet/team/user carry no layer. The L0–L4 taxonomy is owned by [the-five-layers.md](the-five-layers.md).

**If a file is human-readable, that means a human will actually read it.** Not "could theoretically read." Will. If no human will ever read it, it has no business being markdown — that's just token waste and version-control noise. Agent-only session state ships as TOON; human-curated knowledge ships as markdown.

### Knowledge → bet

Promoting a knowledge item into a draft bet (and the forward/reverse edge distinction) is owned by [bets-shape-commit-change-ship.md §5.1](../process-layer/bets-shape-commit-change-ship.md); the forward edge is documented at the `bets.source_knowledge_item_id` schema comment (`schema.ts:186-191`).

## 2. Projection for humans (Web UI)

The API server reads `knowledge_items` and serves the Knowledge view (`packages/server/src/routes/knowledge.ts`). The kernel API is `/:id`-shaped and layer-free. The UI's scope pills are **All / Shared / Team / Private**, filtering on `scopeKind` (`packages/web/src/utils/scope-labels.ts:47-52`) — not on layer.

**Body-as-blocks.** `knowledge_items.body` stays markdown text; the Block list is derived on read (`packages/shared/src/blocks/derive-blocks.ts`) with stable derived ids, and per-block discussion anchors via `messages.block_id` (`schema.ts:477`). No `blocks` table mirrors the body; clients never compute block ids; optimistic locking stays at body granularity. The Block primitive is owned by [docs/blocks/](../blocks/index.md).

**Write path.** Optimistic locking on the `version` column — no locks held during editing:

```
Human edits an item in the Knowledge view
  → PATCH /:id with { body, version }
  → version mismatch → 409 CONFLICT with { currentVersion } (knowledge.ts:612-617)
  → match → update, version+1, edit log entry
  → change fans out over WebSocket via knowledge_updated (ws-broadcaster.ts:45)
```

## 3. Projection for agents (session sandbox)

At session provisioning, the fabric assembles a slice of the store into real files in the agent's sandbox (`ContextAssemblyConfig.sandboxPath`, `packages/fabric/src/context-assembly.ts:18`).

**Sandbox layout** (exact — `CONTEXT_ASSEMBLY_DIRS`, `context-assembly.ts:102-110`):

```
<sandbox>/
  .fabric/
    manifest.json            # version tracking (hidden from the agent)

  context/                   # READ-ONLY (chmod 0o444) — reference material
    product/                 # L2 items
    practices/               # L3 items
    factory/                 # L4 items
    session.toon             # TOON pack: task, bet, team, user, routines

  work/                      # READ-WRITE — session scratch
    task-notes.md            # created empty at assembly
    artifacts/

  knowledge/                 # READ-WRITE — proposed knowledge changes
    practices/
    decisions/
    failures/
```

Item filenames are slugified `<title>_<id8>.md` (`toFilename`, `context-assembly.ts:58-70`) — there are no fixed `BRIEF.md`-style filenames; each item is written verbatim as its body.

**Three zones, three intentions:**

| Zone | Permission | Purpose | Fate |
|------|-----------|---------|------|
| `context/` | read-only | Reference material for this session | Changes discarded |
| `work/` | read-write | Session scratch, artifacts | Captured back at session end (see [run-unit-model.md](../architecture/run-unit-model.md)) |
| `knowledge/` | read-write | Proposed edits to the knowledge base | Diffed and written back to `knowledge_items` |

The split makes agent intent unambiguous: anything written in `knowledge/` is explicitly a proposed knowledge change; working notes in `work/` never pollute the knowledge base. The watcher observes `knowledge/` and `work/` only (`writeback.ts:73-75`); writeback mechanics live in [sync-and-conflict-resolution.md](sync-and-conflict-resolution.md).

**The manifest** (`.fabric/manifest.json`, invisible to the agent) tracks the version of every assembled item so writeback can detect conflicts (`context-assembly.ts:25-38`):

```json
{
  "session_id": "sess-042",
  "assembled_at": "2026-04-10T09:00:00Z",
  "items": {
    "ki-practice-file-handling": {
      "version": 14,
      "source_path": "context/practices/file-handling_a1b2c3d4.md",
      "format": "markdown"
    }
  }
}
```

Writeback matches files to items by `source_path` and checks versions against the manifest. There is no `editable_path` — assembly writes only `context/`; agents create files in `knowledge/` themselves.

**Assembly selection — what gets loaded** (`context-assembly.ts:215-239`):

```
L4 factory:    all items
L2 product:    items scoped to the team (productId kept for back-compat, U1)
L3 practices:  items for communityForRole(agentRole)   (role-community-map.ts)
```

Only L4/L2/L3 are assembled; L0/L1 items are never projected. The combined set is then scored against the task description and trimmed to the token budget via `rankAndBudget(…, DEFAULT_KNOWLEDGE_BUDGET)` (`context-assembly.ts:239`) — "load what you need, nothing more" is implemented, not aspirational. Scoring and budget are owned by [relevance-and-attention.md](relevance-and-attention.md).

**TOON reality** (spec: [github.com/toon-format/toon](https://github.com/toon-format/toon); codec at `packages/shared/src/toon-codec.ts`): the only TOON artifact is `context/session.toon`, built by `buildSessionContext` from task, bet, team, user, and routine state. Knowledge items — including practices — are always written as markdown; per-item TOON packing was never built.

## 4. Why context assembly, not FUSE

FUSE would let agents see database rows as a virtual filesystem without copying files. Elegant in theory. In practice: every file read becomes a DB query (unpredictable latency; an agent that runs `grep -r` hammers the database); agent harnesses expect real files (builtin, claude-code, codex, opencode, cursor-agent all read, write, and diff plain files); and a crashed FUSE daemon takes the sandbox away mid-session. Agents run directly on the host ([run-unit-model.md](../architecture/run-unit-model.md)). Context assembly is boring and correct.
