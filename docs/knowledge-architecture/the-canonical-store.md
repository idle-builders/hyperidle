# The Canonical Store

All knowledge lives in one Postgres database — **PGlite embedded locally (laptop/test), postgres-js on a server (VPS/cloud)**. Both drivers satisfy the same Drizzle `HyperIdleDb` type, so callers are driver-agnostic (`framework/db/src/connection.ts:1-16`). PGlite is the deliberate default: a zero-ops embedded Postgres — no separate process, one data directory, laptop-first — with the identical schema running unchanged on server Postgres when a deployment outgrows a single machine.

Knowledge has a core row plus app-owned projection data on a separate extension table.

## Kernel table — `knowledge_items`

The core row carries identity, content, scope, role, parent, and concurrency control: `id`, `scope_kind` (default `factory`), `scope_id`, `topic`, `title`, `body` (markdown), `format` (`markdown` | `toon`), `status`, `role` (default `ordinary`), `parent_kind`, `parent_id`, `version` (optimistic concurrency), `updated_by`, `created_at`, `updated_at`. Derived signals live on the projection extension table below. The authoritative shape is `framework/db/src/schema.ts`; this doc never mirrors it.

`status` is the 7-value taxonomy `captured` / `provisional` / `validated` / `active` / `stale` / `archived` / **`needs_human`** (`framework/domain-model/src/knowledge.ts` `KNOWLEDGE_STATUSES`). `needs_human` marks items a human must resolve before they can progress — it is a pre-validation state, never exported.

### Attachment: parent, role, scope — three fields, three questions

A knowledge item answers three separate questions about how it relates to the rest of the system, each on its own field:

- **`parent_kind` + `parent_id`** — where it hangs. Both nullable, both-or-neither (`ki_parent_pair_ck`). `parent_kind` is a closed 5-value enum — `knowledge_item | task | thread | routine | agent` (`KNOWLEDGE_PARENT_KINDS`, `framework/domain-model/src/knowledge.ts:86-92`; DB CHECK `ki_parent_kind_ck`). There is no FK — the column points at five different tables, so existence is validated at the API boundary, not the database. `ki_parent_slot_uq` is a partial UNIQUE on `(parent_kind, parent_id, role) WHERE role <> 'ordinary'`: a named role is a singular slot per parent (a routine has exactly one prompt, an agent exactly one identity), while `ordinary` items can be many under one parent.
- **`role`** — where the item lands in the session. Closed 5-value enum — `ordinary | skill | rule | agent_file | prompt` (`KNOWLEDGE_ROLES`, `framework/domain-model/src/knowledge.ts:76`; DB CHECK `ki_role_ck`). `ordinary` lands as a file under `knowledge/`, `skill` in the harness's skills directory, `rule` in `knowledge/rules`, `agent_file` as the `## Identity` section of AGENTS.md, `prompt` as the run's instruction (never a file). Role is set once, by whatever creates the item, and cannot be changed afterwards: it is excluded from `KERNEL_EDITABLE_FIELDS`, and a PATCH body has the `role` key stripped before it reaches the update path (`layers/core-api/knowledge/src/knowledge-repository.ts`).
- **`scope_kind` + `scope_id`** — how far it reaches (below). Stored on the item and never derived from its parent. The two questions happen to coincide for an agent identity (`parent_kind='agent', parent_id=X` and `scope_kind='user', scope_id=X` name the same agent), but that is a coincidence of that one case, not a rule — an item parented to a task, say, can still be team-wide or private.

A routine's prompt is `parent_kind='routine', parent_id=<routine id>, role='prompt'`, read through `getParentedItem` (`layers/core-api/knowledge/src/knowledge-repository.ts`). An agent's identity is `parent_kind='agent', parent_id=<agent id>, role='agent_file'`. Both used to be recorded a different way — `routines.prompt_knowledge_id`, an FK column on the `routines` table, and a `role='agent_file' AND scope_kind='user' AND scope_id=<agentId>` reverse lookup, respectively — and both mechanisms are gone as of migration `framework/db/drizzle/0077_one_attachment_slot.sql`, which also dropped `routines.prompt_knowledge_id`.

**Deleting a parent archives its parented knowledge; a hard delete is impossible.** `knowledge_edit_log`, `knowledge_access_log` and `knowledge_conflicts` all hold `onDelete: "restrict"` foreign keys on `knowledge_items.id` (`framework/db/src/schema.ts:910`, `:940`, `:958`), deliberately, so an agent can never wipe its own authored history. A parent's delete route calls `setKnowledgeStatus(exec, ids, "archived")` on its children instead (`layers/core-api/knowledge/src/knowledge-repository.ts`); archived items are excluded from session assembly and the knowledge surfaces (`status='active'` predicate). There is no un-archive path in the UI today — a parent deleted by mistake leaves its knowledge recoverable in the database but not through the app.

### Scope (kernel)

Scope answers reach, not attachment: it is the materialisation filter session assembly applies, not the mechanism that says which entity an item belongs to (see above). `SCOPE_KINDS` is a closed 6-value enum (`framework/domain-model/src/types.ts:160`):

- `factory` — strategic decisions, principles, constraints across all products. No `scope_id`.
- `product` — product-specific context and architecture decisions. `scope_id` = product id.
- `practice` — cross-product learning for a discipline. `scope_id` = practice community id.
- `team` — team-level knowledge. `scope_id` = team id.
- `task` — notes, findings, failures for a specific task. `scope_id` = task id. A bet is a task with no parent, so knowledge produced under a bet is `task`-scoped like any other task's knowledge. There is no `bet` scope kind: migration `0068` re-scoped every `bet` row to `task`, keeping the same `scope_id` because each bet became a root task that kept its own id.
- `user` — personal notes, private scratch. No `scope_id`.

`factory` and `user` are the two scopes that never need an id (`SCOPES_REQUIRING_ID`). Adding a scope kind requires a concept-doc update first — the enum is closed by contract (@lore Q2, `framework/domain-model/src/types.ts:164-172`).

Scope is mutable — a user can change an item's scope (e.g., `user` → `product` to share a private note) via the scope-change dialog. Every field edit, including scope changes, lands in `knowledge_edit_log` (`framework/db/src/schema.ts:912-922`), which deliberately outlives its subject (RESTRICT, not cascade — an agent can never wipe its own authored history).

Session assembly reads scope as a pure reach filter: it loads `scope_kind='factory'` (global) plus the session's own team (`scope_kind='team' AND scope_id=<teamId>`) plus the session's own agent (`scope_kind='user' AND scope_id=<agentId>`) — global, plus your team, plus your user context (`layers/core-api/knowledge/src/session-knowledge-assembler.ts:333-337`).

## App projection table — `knowledge_app_projection`

Derived signals live in a separate table, 1:1 with the core row by `knowledge_item_id` (unique, cascade delete): `layer`, `scope_id`, `kind`, `attention_score`, `relevance_score`, `confidence`, `citation_count`, `last_cited_at`, `meta` (`framework/db/src/schema.ts:1004-1021`). Migrations and older code comments still call this table `knowledge_strategy_fabric` — same table, renamed in AU19.

### Layer

App-runtime assigns a layer to items that participate in the maturity flow — layer definitions live in [the-five-layers](the-five-layers.md). Layer is **optional**; the mapping is `SCOPE_TO_LAYER` (`framework/domain-model/src/knowledge.ts:6-14`):

| Scope kind | Layer |
|---|---|
| factory | L4 |
| product | L2 |
| practice | L3 |
| task | L1 |
| team | — |
| user | — |

There is no `session` scope kind — L0 is the ephemeral per-session pack, never a `knowledge_items` row. Layer assignment is projection work; the creation flow never sets it.

Items without a layer are invisible to context assembly — session context assembly loads only L4, product-scoped L2, and community-scoped L3 items into agent sessions (`layers/agent-orchestration/run-orchestration/src/context.ts`). Promoting a layer-less item means changing its scope to a layer-mapped scope kind.

## The axis rule

**Scope is structural (where does this item live?) and mandatory. Layer is derived projection data (what maturity flow does it follow?) and optional.** They are different axes; the O2 split formalizes that in the schema.

## Why one table, not many?

The Knowledge service projects arbitrary slices of knowledge into agent sandboxes. "All practices relevant to building + all product decisions from the last cycle + the factory principles" is one SQL query against one table with a join to the projection table. Multiple databases or file trees would turn that into a multi-source join with file I/O — slow, fragile, hard to version.

The process primitives (tasks, sessions, teams, routines) stay in their own tables. `knowledge_items` is for knowledge artifacts only.

## Blocks are projections

`knowledge_items.body` is plain markdown. The Block primitive is derived from the body at render time — there is no `blocks` table, no per-block row, no on-disk dialect. Blocks exist only while a UI surface renders the body. See [docs/blocks/](../blocks/index.md).

## Git is an export, never the source of truth

**Not implemented:** there is no git export. The exporter was deleted in AU26 (increment C1), and the paths this paragraph used to cite had not existed since AU19. The database is canonical and is the *only* store — there is no markdown mirror, no git backup, and no audit trail outside the DB. The design sketch is kept in [facilitators](facilitators.md), marked as unimplemented.
