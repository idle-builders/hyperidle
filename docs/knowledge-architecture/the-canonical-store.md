# The Canonical Store

All knowledge lives in one Postgres database — **PGlite embedded locally (laptop/test), postgres-js on a server (VPS/cloud)**. Both drivers satisfy the same Drizzle `HyperIdleDb` type, so callers are driver-agnostic (`framework/db/src/connection.ts`). PGlite is the deliberate default: a zero-ops embedded Postgres — no separate process, one data directory, laptop-first — with the identical schema running unchanged on server Postgres when a deployment outgrows a single machine.

Every knowledge object — a human's note, an agent's memory, a task's artifact, a skill, a rule, an agent's identity, a routine's prompt — is one row in one table: `documents`. There is no separate projection table; every derived signal a session or a search needs lives on this same row.

## The `documents` table

The row carries identity, content, scope, slot, tree position, and concurrency control: `id`, `scope_kind` (default `factory`), `scope_id`, `title`, `body` (markdown), `format` (`markdown` in practice), `status`, `version` (optimistic concurrency), `slot` (default `ordinary`), `parent_kind`, `parent_id`, `position`, `confidence`, `meta`, four usage columns (`read_count`, `last_read_at`, `session_use_count`, `last_used_at`), `updated_by`, `created_at`, `updated_at` (`framework/db/src/schema.ts`). The authoritative shape is `framework/db/src/schema.ts`; this doc never mirrors it.

`status` is the 4-value lifecycle `proposed` / `active` / `stale` / `archived` (`DOCUMENT_STATUSES`, `framework/domain-model/src/actions/document.ts`). A new document starts `proposed`. Nothing promotes or decays a document automatically — the document-management plugin's `document-triage` and `document-decay` routines do that by judgement, on a schedule, through the same `search_documents`/`open_document`/`edit_document` tools any agent uses; see [Knowledge Movement](the-knowledge-fabric-how-knowledge-moves.md).

There is no `topic` column and no `kind` column. Where a document sits in the tree is what it is about, not a flat vocabulary word stamped on the row.

### Attachment: parent, slot, scope — three fields, three questions

A document answers three separate questions about how it relates to the rest of the system, each on its own field:

- **`parent_kind` + `parent_id`** — where it hangs. Both nullable, both-or-neither. `parent_kind` is a closed 5-value enum — `document | task | thread | routine | agent` (`DOCUMENT_PARENT_KINDS`, `framework/domain-model/src/actions/document.ts`). There is no FK — the column points at five different tables, so existence is validated at the API boundary, not the database. A named slot (anything but `ordinary`) is a singular slot per parent (a routine has exactly one prompt, an agent exactly one identity), enforced by a partial unique index; `ordinary` children can be many under one parent — that is what lets a `document` parent hold an arbitrary number of children.
- **`slot`** — where the document lands in the session sandbox. Closed 5-value enum — `ordinary | skill | rule | agent_file | prompt` (`DOCUMENT_SLOTS`, `framework/domain-model/src/actions/document.ts`). `ordinary` lands as a file under `knowledge/`, `skill` in the harness's own skills directory, `rule` in `knowledge/rules`, `agent_file` as the bound agent's own identity content, `prompt` as a routine's run instruction (never a file). `slot` is create-only — a slotted document may never change slot or parent afterwards.
- **`scope_kind` + `scope_id`** — who sees it (below). Stored on the row, never derived from its parent. The two questions happen to coincide for an agent's identity document (`parent_kind='agent', parent_id=X` and `scope_kind='user', scope_id=X` name the same agent), but that is a coincidence of that one case, not a rule.

### What the caller calls it: `as`

`search_documents`/`open_document`/`edit_document` never take a raw `parent_kind`/`scope_kind` from a caller that just wants to save a memory or an artifact — they take `as: "memory" | "artifact" | "document"`, a word derived from the row on read and forced on write (`documentAs`, `framework/domain-model/src/actions/document.ts`):

- **`memory`** — `scope_kind='user'`, `scope_id=<the writing agent>`, no parent. Private to its writer, and to the human owner of the agent that wrote it — nobody else can open it.
- **`artifact`** — `parent_kind` is `task` or `thread`, stamped from the calling session's own task/thread. Never private: an artifact is attached to the thing that produced it, and everyone who can see that task or thread can see it.
- **`document`** — everything else: the shared, browsable tree. Team-scoped by default when an agent writes one with no explicit scope.

`edit_document` is an upsert on `id`: absent creates a new row (a caller-supplied `id` on create is honored too); present edits — or creates with that id if none exists yet. An edit may carry the `version` it read; a stale version is refused with problem code `stale` — the caller re-opens and retries. No version supplied on an edit means last write wins.

## The tree

A `document` parent turns the flat table into a tree: a document can be the child of another document, and children order by an explicit `position` (default creation order, ties by title) — there is no drag-to-reorder interface; the column exists so one can be added later. A document with no parent is a root. **Only `document`-parented rows appear in the tree.** A document parented to a task, thread, routine, or agent never appears there; every tree walk stops at the first non-`document` parent, so a task- or thread-parented document (an artifact) is both a leaf and a walking root — it has no ancestors and inherits nothing.

Invariants hold on every write that sets a `document` parent, checked inside the same transaction as the write:

- **No cycles.** A document can never become its own ancestor.
- **Scope no wider than the parent's.** A child's `scope_kind` must be the same as or narrower than its parent's (`factory` > `team` > `user`) — narrowing a parent's own scope cascades down its whole subtree: every wider descendant is narrowed to match, one `changed` row per narrowed descendant, same actor and timestamp as the parent's own edit (the cascade is that edit's collateral, not a separate act). A descendant already narrower than the new parent scope is left alone — cascading never widens a scope someone deliberately narrowed.
- **Depth ≤ 32.** A backstop, not the real guard — the real guard is the cycle check.

Running the check inside the write's own transaction, against live state rather than a pre-transaction snapshot, is what keeps two concurrent reparents from each looking legal and together producing a loop.

A move — reparenting an existing document via `edit_document`'s `parent` field — is recorded as an ordinary `document.changed` row, not a separate event type (see below).

## Scope

Scope answers **who sees it**, not what a document is about or where it hangs (see above). `SCOPE_KINDS` is a closed 3-value enum (`framework/domain-model/src/types.ts`):

- `factory` — reaches every agent and every human. No `scope_id`.
- `team` — reaches one team. `scope_id` = team id. The only scope kind that requires an id.
- `user` — reaches one person or one agent. `scope_id` = that person's or agent's id (a `user`-scoped write with no `scope_id` auto-fills the actor).

There is no `product`, `practice`, `task`, or `bet` scope kind. Adding a scope kind requires a concept-doc update first — the enum is closed by contract.

**Scope is a readability filter, not access control.** It narrows as you descend so the tree stays legible as it grows — enforced by the scope-no-wider-than-parent invariant above, on the founder's own reasoning: if you cannot see the root you cannot reach the children. What you cannot see is **hidden**, not shown-and-locked. This is a deliberate non-guarantee: scope hides branches from the ordinary read and write paths, but it is not a security boundary.

The read/visibility predicate is shared, pure code (`canReadDocument`, `framework/domain-model/src/actions/document.ts`) between `search_documents`/`open_document`'s read path and the websocket subscribe authorizer, so the two can never diverge: a task- or thread-parented document (an artifact) is always readable; anything else is readable when it is not a private (`scope_kind='user', slot='ordinary'`) document owned by someone else, and not a `team`-scoped document belonging to a different team than the viewer's.

## History: `changes`, not an edit log

There is no `knowledge_edit_log` table, no `knowledge_access_log`, no `knowledge_conflicts` table. Every create and every edit to a document writes one row to the shared `changes` table — `document.created` or `document.changed`, `object='document'`, `objectId=<document id>`, `actor`, a JSON `before`/`after` diff, and a timestamp. That table, read by object and id, *is* the document's edit log — there is no second table to keep in sync with it. A version mismatch on an edit is refused outright (`stale`, above); there is no conflict row to review, because a rejected edit never happened.

**Reads** are counted, not logged: an `open_document` call bumps that row's `read_count`/`last_read_at`. An internal read through `search_documents` — including the read a writeback or a session-context assembly makes — never counts; only a genuine open does (see [Knowledge Movement](the-knowledge-fabric-how-knowledge-moves.md)).

## Why one table, not many?

Assembling a session's sandbox is one query against one table — every factory-wide document, plus this team's, plus this agent's own. Multiple tables or a separate projection table would turn that into a join that has to stay in sync by hand; folding usage and ranking signals onto the same row that already carries content and scope means there is nothing else to keep consistent.

The process primitives (tasks, sessions, teams, routines) stay in their own tables. `documents` is for knowledge objects only.

## Blocks are projections

`documents.body` is plain markdown. The Block primitive is derived from the body at render time — there is no `blocks` table, no per-block row, no on-disk dialect. Blocks exist only while a UI surface renders the body. See [docs/blocks/](../blocks/index.md).

## Git is an export, never the source of truth

**Not implemented:** there is no git export. The database is canonical and is the *only* store — there is no markdown mirror, no git backup, and no audit trail outside the DB.
