# The Canonical Store

All knowledge lives in one Postgres database — **PGlite embedded locally (laptop/test), postgres-js on a server (VPS/cloud)**. Both drivers satisfy the same Drizzle `HyperIdleDb` type, so callers are driver-agnostic (`packages/db/src/connection.ts:1-16`). PGlite is the deliberate default: a zero-ops embedded Postgres — no separate process, one data directory, laptop-first — with the identical schema running unchanged on server Postgres when a deployment outgrows a single machine.

Knowledge has a core row plus app-owned projection data. The historical projection table names remain for compatibility, but production callers use app-owned services and aliases.

## Kernel table — `knowledge_items`

The core row carries identity, content, scope, and concurrency control: `id`, `scope_kind` (default `factory`), `scope_id`, `topic`, `title`, `body` (markdown), `format` (`markdown` | `toon`), `status`, `version` (optimistic concurrency), `updated_by`, `created_at`, `updated_at`. Derived signals live in app-owned projection services over the compatibility table. The authoritative shape is `packages/db/src/schema.ts`; this doc never mirrors it.

`status` is the 7-value taxonomy `captured` / `provisional` / `validated` / `active` / `stale` / `archived` / **`needs_human`** (`packages/shared/src/knowledge.ts` `KNOWLEDGE_STATUSES`). `needs_human` marks items a human must resolve before they can progress — it is a pre-validation state, never exported.

### Scope (kernel)

Every knowledge item attaches to exactly one entity via `scope_kind + scope_id`. Scope determines where the item lives and who naturally sees it. `SCOPE_KINDS` is a closed 7-value enum (`packages/shared/src/types.ts:171-181`):

- `factory` — strategic decisions, principles, constraints across all products. No `scope_id`.
- `product` — product-specific context and architecture decisions. `scope_id` = product id.
- `practice` — cross-product learning for a discipline. `scope_id` = practice community id.
- `team` — team-level knowledge. `scope_id` = team id.
- `bet` — conceptual context for a specific bet. `scope_id` = bet id.
- `task` — notes, findings, failures for a specific task. `scope_id` = task id.
- `user` — personal notes, private scratch. No `scope_id`.

`factory` and `user` are the two scopes that never need an id (`SCOPES_REQUIRING_ID`). Adding a scope kind requires a concept-doc update first — the enum is closed by contract (@lore Q2, `packages/shared/src/types.ts:164-169`).

Scope is mutable — a user can change an item's scope (e.g., `user` → `product` to share a private note) via the scope-change dialog. Every field edit, including scope changes, lands in `knowledge_edit_log` (`packages/db/src/schema.ts:609-624`), which deliberately outlives its subject (RESTRICT, not cascade — an agent can never wipe its own authored history).

## App projection compatibility table — `knowledge_strategy_fabric`

Derived signals live in a separate table, 1:1 with the core row by `knowledge_item_id` (unique, cascade delete): `layer`, `scope_id`, `kind`, `attention_score`, `relevance_score`, `confidence`, `citation_count`, `last_cited_at`, `meta` (`packages/db/src/schema.ts`). The physical table name is historical compatibility storage; production code uses app-owned projection aliases/services.

### Layer

App-runtime assigns a layer to items that participate in the maturity flow — layer definitions live in [the-five-layers](the-five-layers.md). Layer is **optional**; the mapping is `SCOPE_TO_LAYER` (`packages/shared/src/knowledge.ts`):

| Scope kind | Layer |
|---|---|
| factory | L4 |
| product | L2 |
| practice | L3 |
| task | L1 |
| bet | — |
| team | — |
| user | — |

There is no `session` scope kind — L0 is the ephemeral per-session pack, never a `knowledge_items` row. Layer assignment is projection work; the creation flow never sets it.

Items without a layer are invisible to context assembly — the agent context provider assembles only L4/L2/L3 items into agent sessions (`packages/server/src/app-runtime/context-assembly.ts`). Promoting a layer-less item means changing its scope to a layer-mapped scope kind.

## The axis rule

**Scope is structural (where does this item live?) and mandatory. Layer is derived projection data (what maturity flow does it follow?) and optional.** They are different axes; the O2 split formalizes that in the schema.

## Why one table, not many?

The Knowledge service projects arbitrary slices of knowledge into agent sandboxes. "All practices relevant to building + all product decisions from the last cycle + the factory principles" is one SQL query against one table with a join to the projection table. Multiple databases or file trees would turn that into a multi-source join with file I/O — slow, fragile, hard to version.

The process primitives (bets, tasks, sessions, teams, routines) stay in their own tables. `knowledge_items` is for knowledge artifacts only.

## Blocks are projections

`knowledge_items.body` is plain markdown. The Block primitive is derived from the body at render time — there is no `blocks` table, no per-block row, no on-disk dialect. Blocks exist only while a UI surface renders the body. See [docs/blocks/](../blocks/index.md).

## Git is an export, never the source of truth

The human-readable markdown files in the Git repo are **exports from the database**, produced by the git-export service — only `active`/`validated` items ship; drafts (`captured`, `provisional`, `needs_human`) and `archived` tombstones stay out (`packages/server/src/app-runtime/services/git-export.ts`). Git is the backup and audit trail; the database is canonical. Export structure and triggers are owned by [facilitators](facilitators.md).
