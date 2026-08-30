# The Canonical Store

All knowledge lives in one Postgres database — **PGlite embedded locally (laptop/test), postgres-js on a server (VPS/cloud)**. Both drivers satisfy the same Drizzle `HyperIdleDb` type, so callers are driver-agnostic (`framework/db/src/connection.ts:1-16`). PGlite is the deliberate default: a zero-ops embedded Postgres — no separate process, one data directory, laptop-first — with the identical schema running unchanged on server Postgres when a deployment outgrows a single machine.

Knowledge has a core row plus app-owned projection data on a separate extension table.

## Kernel table — `knowledge_items`

The core row carries identity, content, scope, and concurrency control: `id`, `scope_kind` (default `factory`), `scope_id`, `topic`, `title`, `body` (markdown), `format` (`markdown` | `toon`), `status`, `version` (optimistic concurrency), `updated_by`, `created_at`, `updated_at`. Derived signals live on the projection extension table below. The authoritative shape is `framework/db/src/schema.ts`; this doc never mirrors it.

`status` is the 7-value taxonomy `captured` / `provisional` / `validated` / `active` / `stale` / `archived` / **`needs_human`** (`framework/domain-model/src/knowledge.ts` `KNOWLEDGE_STATUSES`). `needs_human` marks items a human must resolve before they can progress — it is a pre-validation state, never exported.

### Scope (kernel)

Every knowledge item attaches to exactly one entity via `scope_kind + scope_id`. Scope determines where the item lives and who naturally sees it. `SCOPE_KINDS` is a closed 7-value enum (`framework/domain-model/src/types.ts:181-191`):

- `factory` — strategic decisions, principles, constraints across all products. No `scope_id`.
- `product` — product-specific context and architecture decisions. `scope_id` = product id.
- `practice` — cross-product learning for a discipline. `scope_id` = practice community id.
- `team` — team-level knowledge. `scope_id` = team id.
- `bet` — legacy scope kind for knowledge items created before BB1 (when bets existed as a separate primitive). These items carry no layer (`bet` maps to null in `SCOPE_TO_LAYER`). New items should use `task` scope.
- `task` — notes, findings, failures for a specific task. `scope_id` = task id.
- `user` — personal notes, private scratch. No `scope_id`.

`factory` and `user` are the two scopes that never need an id (`SCOPES_REQUIRING_ID`). Adding a scope kind requires a concept-doc update first — the enum is closed by contract (@lore Q2, `framework/domain-model/src/types.ts:166-180`).

Scope is mutable — a user can change an item's scope (e.g., `user` → `product` to share a private note) via the scope-change dialog. Every field edit, including scope changes, lands in `knowledge_edit_log` (`framework/db/src/schema.ts:912-922`), which deliberately outlives its subject (RESTRICT, not cascade — an agent can never wipe its own authored history).

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
| bet | — |
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
