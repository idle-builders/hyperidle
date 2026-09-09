# The Canonical Store

All knowledge lives in one Postgres database — **PGlite embedded locally (laptop/test), postgres-js on a server (VPS/cloud)**. Both drivers satisfy the same Drizzle `HyperIdleDb` type, so callers are driver-agnostic (`framework/db/src/connection.ts:1-16`). PGlite is the deliberate default: a zero-ops embedded Postgres — no separate process, one data directory, laptop-first — with the identical schema running unchanged on server Postgres when a deployment outgrows a single machine.

Knowledge has a core row plus app-owned projection data on a separate extension table.

## Kernel table — `knowledge_items`

The core row carries identity, content, scope, role, tree position, and concurrency control: `id`, `scope_kind` (default `factory`), `scope_id`, `title`, `body` (markdown), `format` (`markdown` | `toon`), `status`, `role` (default `ordinary`), `parent_kind`, `parent_id`, `position`, `version` (optimistic concurrency), `updated_by`, `created_at`, `updated_at` (`framework/db/src/schema.ts:835`). Derived signals live on the projection extension table below. The authoritative shape is `framework/db/src/schema.ts`; this doc never mirrors it.

`status` is the 4-value lifecycle `proposed` / `active` / `stale` / `archived` (`framework/domain-model/src/knowledge.ts` `KNOWLEDGE_STATUSES`). A new item starts `proposed`; it becomes `active` when a human or the auto-promotion sweep vouches for it; `stale` is what the weekly decay sweep sets on an unused `active` item; `archived` is terminal. This collapses two older, wider vocabularies (a 7-value kernel enum and a 4-value strategy-side one) into one — see [facilitators](facilitators.md) for the lifecycle and the auto-promotion rule.

There is no `topic` column and no `kind` column — both are deleted from the kernel table. Where an item is about something is answered by where it sits in the tree (below), not by a flat vocabulary word stamped on the row.

### Attachment: parent, role, scope — three fields, three questions

A knowledge item answers three separate questions about how it relates to the rest of the system, each on its own field:

- **`parent_kind` + `parent_id`** — where it hangs. Both nullable, both-or-neither (`ki_parent_pair_ck`). `parent_kind` is a closed 5-value enum — `knowledge_item | task | thread | routine | agent` (`KNOWLEDGE_PARENT_KINDS`, `framework/domain-model/src/knowledge.ts:60-67`; DB CHECK `ki_parent_kind_ck`). There is no FK — the column points at five different tables, so existence is validated at the API boundary, not the database. `ki_parent_slot_uq` is a partial UNIQUE on `(parent_kind, parent_id, role) WHERE role <> 'ordinary'`: a named role is a singular slot per parent (a routine has exactly one prompt, an agent exactly one identity), while `ordinary` items can be many under one parent — which is what lets a `knowledge_item` parent hold an arbitrary number of children.
- **`role`** — where the item lands in the session. Closed 5-value enum — `ordinary | skill | rule | agent_file | prompt` (`KNOWLEDGE_ROLES`, `framework/domain-model/src/knowledge.ts:45`; DB CHECK `ki_role_ck`). `ordinary` lands as a file under `knowledge/`, `skill` in the harness's skills directory, `rule` in `knowledge/rules`, `agent_file` as the `## Identity` section of AGENTS.md, `prompt` as the run's instruction (never a file). Role is set once, by whatever creates the item, and cannot be changed afterwards: it is excluded from `KERNEL_EDITABLE_FIELDS`, and a PATCH body has the `role` key stripped before it reaches the update path (`layers/core-api/knowledge/src/knowledge-repository.ts`).
- **`scope_kind` + `scope_id`** — who sees it (below). Stored on the item and never derived from its parent. The two questions happen to coincide for an agent identity (`parent_kind='agent', parent_id=X` and `scope_kind='user', scope_id=X` name the same agent), but that is a coincidence of that one case, not a rule — an item parented to a task, say, can still be team-wide or private.

A routine's prompt is `parent_kind='routine', parent_id=<routine id>, role='prompt'`, read through `getParentedItem` (`layers/core-api/knowledge/src/knowledge-repository.ts`). An agent's identity is `parent_kind='agent', parent_id=<agent id>, role='agent_file'`.

**Deleting a parent archives its parented knowledge; a hard delete is impossible.** `knowledge_edit_log`, `knowledge_access_log` and `knowledge_conflicts` all hold `onDelete: "restrict"` foreign keys on `knowledge_items.id` (`framework/db/src/schema.ts:910`, `:940`, `:958`), deliberately, so an agent can never wipe its own authored history. A parent's delete route calls `setKnowledgeStatus(exec, ids, "archived")` on its children instead (`layers/core-api/knowledge/src/knowledge-repository.ts`); archived items are excluded from session assembly and the knowledge surfaces (`status<>'archived'` predicate). There is no un-archive path in the UI today — a parent deleted by mistake leaves its knowledge recoverable in the database but not through the app.

## The tree

A `knowledge_item` parent turns the flat table into a tree: a knowledge item can be the child of another knowledge item, and children order by an explicit `position` (default creation order, ties by title) — there is no drag-to-reorder interface; the column exists so one can be added later. An item with no parent is a root. **Only `knowledge_item`-parented items appear in the tree.** An item parented to a task, thread, routine, or agent never appears there; every tree walk stops at the first non-`knowledge_item` parent, so a task- or thread-parented item is both a leaf and a walking root — it has no ancestors and inherits nothing.

Three invariants hold on every write that sets a `knowledge_item` parent, checked **inside the same transaction as the write** (`assertParentInvariants`, `layers/core-api/knowledge/src/knowledge-repository.ts:98`):

- **No cycles.** A knowledge item can never become its own ancestor.
- **Scope no wider than the parent's.** A child's `scope_kind` must be the same as or narrower than its parent's (`factory` > `team` > `user`) — narrowing a parent's own scope cascades this rule down its whole subtree (`cascadeScopeNarrowing`, `knowledge-repository.ts:158`): a descendant already narrower than the new parent scope is left alone, since cascading must never widen a scope someone deliberately narrowed.
- **Depth ≤ 32.** A backstop, not the real guard — the real guard is the cycle check (`MAX_TREE_DEPTH`, `knowledge-repository.ts:52`).

Running the check inside the write's own transaction, against live state rather than a pre-transaction snapshot, is what keeps two concurrent reparents from each looking legal and together producing a loop.

A move — reparenting an existing item — is recorded as an ordinary `update` edit-log entry on the item, not a separate event type; see [sync and conflict resolution](sync-and-conflict-resolution.md).

Knowledge produced under a task or thread reaches the tree by **graduating**: reparenting it onto a `knowledge_item` — one field, no copy, no status change. Graduation runs the same three invariants as any other reparent (`knowledge-repository.ts:508`) and logs a distinct `graduate` edit type so that provenance stays visible.

## Scope (kernel)

Scope answers **who sees it**, not what an item is about or where it hangs (see above). `SCOPE_KINDS` is a closed 3-value enum (`framework/domain-model/src/types.ts:171`):

- `factory` — reaches every agent and every human. No `scope_id`.
- `team` — reaches one team. `scope_id` = team id. The only scope kind that requires an id (`SCOPES_REQUIRING_ID`, `framework/domain-model/src/types.ts:184`).
- `user` — reaches one person or one agent. No `scope_id` (the row's `updated_by`/parent already identify the owner where that matters).

There is no `product`, `practice`, `task`, or `bet` scope kind. `product` and `practice` were the old filing vocabulary wearing a scope costume — "Product" and "Practices" are knowledge items near the root now (see [the tree](#the-tree)), and where an item sits says what it is about. `task` knowledge parents directly onto the task (`parent_kind='task'`) and never appears in the scope column — task-scoped knowledge never had a "how far does it reach" question for `scope` to answer. Adding a scope kind requires a concept-doc update first — the enum is closed by contract (@lore Q2, `framework/domain-model/src/types.ts`).

**Scope is a readability filter, not access control.** It narrows as you descend so the tree stays legible as it grows — enforced by the scope-no-wider-than-parent invariant above, on the founder's own reasoning: if you cannot see the root you cannot reach the children. What you cannot see is **hidden**, not shown-and-locked. This is a deliberate non-guarantee: scope hides branches from the ordinary read and write paths, but it is not a security boundary, and the day someone needs it to survive a determined reader it has to be rebuilt as something else.

Scope is mutable — a user can change an item's scope (e.g., `user` → `team` to share a private note) via the scope-change dialog, which narrows the item's own subtree to match if the new scope is narrower. Every field edit, including scope changes, lands in `knowledge_edit_log` (`framework/db/src/schema.ts:912-922`), which deliberately outlives its subject (RESTRICT, not cascade — an agent can never wipe its own authored history).

Session assembly reads scope as a pure reach filter: it loads `scope_kind='factory'` (global) plus the session's own team (`scope_kind='team' AND scope_id=<teamId>`) plus the session's own agent (`scope_kind='user' AND scope_id=<agentId>`) — global, plus your team, plus your user context (`layers/core-api/knowledge/src/session-knowledge-assembler.ts`). There is no subtree selection on top of that: an agent receives every factory-scoped item, not just the ones "near" it in the tree. Human viewers get the same rule on the read path, which is what makes a team-scoped branch invisible outside that team.

## App projection table — `knowledge_app_projection`

Derived signals live in a separate table, 1:1 with the core row by `knowledge_item_id` (unique, cascade delete): `scope_id`, `attention_score`, `relevance_score`, `confidence`, `citation_count`, `last_cited_at`, `meta` (`framework/db/src/schema.ts:1014-1031`). Migrations and older code comments still call this table `knowledge_strategy_fabric` — same table, renamed in AU19.

There is no `layer` or `kind` column on this table either — both were dropped along with the kernel-side `topic` column, and nothing replaced them. Scoring that used to key on `(layer, topic, kind)` now keys on tree position (`parent_kind`/`parent_id`) instead — see [relevance and attention](relevance-and-attention.md).

## Why one table, not many?

The Knowledge service projects arbitrary slices of knowledge into agent sandboxes. "Every factory item, plus this team's, plus this agent's own" is one SQL query against one table with a join to the projection table. Multiple databases or file trees would turn that into a multi-source join with file I/O — slow, fragile, hard to version.

The process primitives (tasks, sessions, teams, routines) stay in their own tables. `knowledge_items` is for knowledge artifacts only.

## Blocks are projections

`knowledge_items.body` is plain markdown. The Block primitive is derived from the body at render time — there is no `blocks` table, no per-block row, no on-disk dialect. Blocks exist only while a UI surface renders the body. See [docs/blocks/](../blocks/index.md).

## Git is an export, never the source of truth

**Not implemented:** there is no git export. The exporter was deleted in AU26 (increment C1), and the paths this paragraph used to cite had not existed since AU19. The database is canonical and is the *only* store — there is no markdown mirror, no git backup, and no audit trail outside the DB. The design sketch is kept in [facilitators](facilitators.md), marked as unimplemented.
