# Architecture — AO1: The Substrate primitive

**Workpackage:** AO1 (Track AO, Self-Hosting Build Loop). Complexity L (~5d).
**Producer:** designer. A separate reviewer runs `/architecture-critique`.
**Concept (LOCKED, fixed input):** `plans/AO/concept.md` + `plans/AO/research-substrate-vs-tool.md`. Canonical shape `docs/process-layer/substrate-primitive.md` + `docs/process-layer/canonical-shapes.md §Substrate`.

This plan models the **Substrate record + attachment + resource selection + reachability**, the **Connection seam** (how a `code` substrate references a Connection and how its auth reaches the sandbox), and the **AO2 materialization seam** (the interface AO2 implements). It writes **no production code** — types, schema, routes, and ordered tasks only. The attach/inspect **UI** is deferred to `/design`; this plan specifies the API/data contract that surface binds to.

---

## Required reading (engineer reads these before implementing)

- `plans/AO/concept.md` — the locked concept (decision rule, hard rules, vocabulary lock).
- `plans/AO/research-substrate-vs-tool.md` — substrate↔tool↔knowledge decision rule + citations.
- `docs/process-layer/substrate-primitive.md` — canonical shape + lifecycle + contracts.
- `docs/process-layer/canonical-shapes.md §Substrate shape (Track AO)` (lines 213-241) — the type the schema must mirror.
- `docs/architecture/system-boundary.md` — RIDE git / code is git-derived (hard rule 4).
- `.pipeline/work-packages/TRACK-AO.md` — AO1 ACs + AO2 (the consumer of this model).
- `.pipeline/work-packages/TRACK-AN.md` — the Connection model (NOT merged; model the seam, not the internals).
- Code seams (verified 2026-06-26): `packages/db/src/schema.ts` (teams 17-34, teamMembers 100-117, users 36-95, knowledgeItems 580-607, artifacts 848-865), `packages/server/src/services/session-provisioning.ts` (sandbox spawn Phase 4 @463; context assembly Phase 6 @487-497 — the AO2 hook point), `packages/fabric/src/services/git-export-runner.ts` (`GitRunner`, export-only — no clone/fetch/checkout).

---

## Phase 0 — Interrogation (resolved against the locked concept + code)

The concept pins most decisions. The genuinely-unsettled ones, with my read + evidence. These are addressed in the plan below; the reviewer confirms or overrides.

1. **What's the smallest version of AO1 that's still useful?**
   My read: the **durable record + the four read/write/list/detach routes + the reachability check**. NOT materialization (AO2), NOT the UI (deferred to `/design`), NOT a Connection table (AN owns it; we model the seam). In-scope = `substrates` table + `Substrate` type + CRUD-ish API + `needs_attention` resolution. Out = checkout, auth provisioning runtime, the attach surface TSX.

2. **Agent-attachment FK target — `teamMembers.id` (the membership group) or `users.id` (the individual agent)? RESOLVED → `users.id`.**
   `team_members` is the membership *group* table — **one row per team** via the U1 1:1 invariant (schema.ts:97-99 `@lore U1`), with `members` JSON + `leadAgentId` and **no per-agent identity** (schema.ts:100-117). Keying the attachment to `team_members.id` therefore carries zero per-agent information — it degenerates into a duplicate of `team_id`, and AO2 cannot bind a substrate to one agent. The **runtime agent identity is `users.id`**: `sessions.agentId → users.id` (schema.ts:252-254), and the individual agent is a `users` row (`users.teamId → team_members.id`, schema.ts:47). AO2's per-agent materialization (§5, Phase 4.5) resolves the bound substrate *inside a session that runs as a specific `agentId` (= `users.id`)*, so the attachment column must point at `users.id` for that join to close. **Decision: `agent_user_id → users.id` (nullable; null → team-level/shared).** This matches the canonical shape (`docs/process-layer/canonical-shapes.md §Substrate` + `substrate-primitive.md`, both already `agentUserId → users.id`) and the concept's two attachment levels — "attached to **one agent within a team** OR shared at the **Team** level" (cardinality `agent-in-team 1 — 0..N`). `team_id → teams.id` stays the always-present scope. The earlier candidate (`agent_member_id → team_members.id`) is dropped entirely — not shipped as a vestige. Open question Q1 records the resolution.

3. **`resource_ref` — structured columns or one opaque string?**
   The shape says `resourceRef: string` ("a repo+branch, a folder path"). My read: **one `resource_ref` text column holding a JSON-encoded selector** discriminated by `kind`, plus a denormalized `branch` is *not* added (keep it inside `resource_ref` to honor the single-column shape). Design-it-twice below (§Phase 3·A) picks JSON-in-text over split columns. Rationale: open `kind` vocabulary → per-kind selector shapes → a typed JSON blob (Zod-validated at the boundary, exactly as `artifacts.previewJson` does, schema.ts:858 + artifacts.ts:118) beats a column-per-kind that ossifies the vocabulary.

4. **Reachability — stored column or computed on read?**
   My read: **`state` is a stored column** (`attached` | `reachable` | `needs_attention`) as the canonical shape mandates, **and** the inspect/list route runs a **cheap structural reachability check** that can *transition* `attached→reachable` or `→needs_attention` and persist it. v1 reachability is **structural, not a network round-trip**: a `code` substrate with `writeback:'git'` + a `connection_id` is `needs_attention` iff the referenced Connection is absent/unresolvable; a bare-local substrate (`connection_id` null) is `reachable` if its local path is the form we expect. **No live `git ls-remote`** in AO1 — that auth lives in the sandbox (AO2), and AO1 must not reach for forge creds. Open question Q2 records the v1 boundary.

5. **Does the spec contradict an existing doc?** No. The canonical shape, the concept, and the track file agree — all three name the individual-agent attachment `agentUserId → users.id` (Q2 above / Q1 resolution). No remaining tension.

---

## Phase 1 — Plan reconciliation (spec ⇆ codebase)

Every symbol the plan or spec references, verified against `main` (worktree `AO0`, 2026-06-26):

| Symbol / assumption | Reality (file:line) | Plan handling |
|---|---|---|
| `teams` table, `id` PK | `pgTable("teams", { id: text().primaryKey(), … })` schema.ts:17-34 | `substrates.team_id → teams.id` FK. ✅ |
| `teamMembers` table = **one row per team** (U1 1:1) | `pgTable("team_members", { id, teamId→teams.id, members, leadAgentId, … })` schema.ts:100-117; `@lore U1` one row per team schema.ts:97-99 | **NOT** the substrate's agent-attachment target — it's the membership *group* (no per-agent identity), so it would carry zero per-agent info. See Q1. ✅ |
| `users` table = the individual agent; `users.teamId → teamMembers.id` | schema.ts:36-95, :47 | The individual agent is a `users` row. `substrates.agent_user_id → users.id` (nullable). ✅ |
| **`sessions.agentId → users.id`** — the runtime agent identity | schema.ts:252-254 | **Decisive for Q1.** AO2 materializes inside a session running as a specific `agentId` (= `users.id`); the attachment FK must be `users.id` for that join to close. ✅ |
| `artifacts` has substrate columns | NO — `artifacts` = `{id, producingTaskId, kind, label, previewJson, createdAt}` schema.ts:848-865. **No repoPath/filePath/commitSha.** | Spec confirmed: substrate is a **new table**, distinct from `artifacts`. ✅ |
| `knowledge_items` | `{id, scopeKind, scopeId, topic, title, body, format, status, …}` schema.ts:580-607 | Substrate is **distinct** — not a knowledge item. The "squeeze non-code output into knowledge_items" workaround is what AO1 ends. ✅ |
| `git-export` global config / target | `git-export-runner.ts` + `git-export-routes.ts` — writes knowledge markdown to a single global repo (`scopeId`). | Substrate must **not** overwrite this. Different table, different concern (AC4). ✅ |
| `GitRunner` capability | `init/add/rm/commit/push/diffCached/revParse/configSet/remoteAdd/lsFiles/statusPorcelain` — git-export-runner.ts:18-41. **NO clone/fetch/checkout.** | The **inbound-git gap** AO2 fills. AO1 specifies the seam (§5); does not implement it. ✅ |
| `service_connections` table / `ServiceConnectionResolver` | **ABSENT on this branch now** (grep: zero hits) — but it was **merged (migration 0036 `CREATE TABLE service_connections`) then dropped (0038 `DROP TABLE "service_connections" CASCADE`)**. Reverted, not never-merged (Track AN reset, PR #364 — broker/registry dropped per MEMORY). | Model the **Connection seam** by reference only (§4). `connection_id` is a **plain `text` column, NOT a DB FK** — the target table is genuinely absent now, and AN's *re-merged* shape isn't fixed (it already churned once), so don't assume 0036's columns. ✅ |
| Migration numbering | drizzle dir tail = `0038_skinny_argent.sql`; `_journal.json` idx 38. | New migration **`0039_AO1_substrates.sql`**, forward-only, `db:generate`-authored. ✅ |
| Route construction pattern | `createXRoutes(db, eventBus?) → Hono`; mounted `api.route("/path", createXRoutes(...))` app.ts:402-461. Zod via `validateBody`/`zValidator` + `validationHook` (validate.ts). `requireBoundary({kind:"public-data"})` middleware (artifacts.ts:159). | `createSubstrateRoutes(db, eventBus)`, mounted `api.route("/substrates", …)`. Same Zod + boundary patterns. ✅ |
| `db/index.ts` schema re-export block | schema tables + `$inferSelect`/`$inferInsert` types re-exported alphabetically (index.ts:27-127); db exports `ArtifactRow` (NOT `Artifact`) — the precedent. | Add `substrates`, `type SubstrateRow`, `type NewSubstrate` to this block. **No `Substrate` type in db** (the wire `Substrate` is in `@hyperidle/shared`). **`sharedFiles`.** ✅ |
| `@hyperidle/shared` type home | per-concept files re-exported from `src/index.ts` (e.g. `proposed-call.ts`, `team.ts`). | New `packages/shared/src/substrate.ts`, re-exported from `index.ts`. ✅ |

**No spec assumption disagreed in a way that blocks the plan.** The two notable reconciliations: (a) `connection_id` is a non-FK text column because AN's connection table was reverted (dropped in 0038) and its re-merged shape isn't settled; (b) `agent_user_id` targets `users.id` (the individual agent, = `sessions.agentId`), matching the canonical shape and the concept's per-agent attachment level (Q1).

---

## Phase 2 — Acceptance criteria → verification method

Mapped from TRACK-AO.md AO1 ACs + validation scenarios. Each AC names the exact test and its assertion.

| # | Acceptance criterion | Verification method |
|---|---|---|
| AC1 | An agent-in-team can be attached to a substrate; afterward kind/resource/writeback/state are visible. | **Integration test** (`substrates.integration.test.ts`): `POST /api/substrates` with `{teamId, agentUserId, kind:'code', connectionId, resourceRef:{repo,branch}, writeback:'git'}` → 201 + body echoes the record. Asserts the row binds to that one agent (`agentUserId` round-trips). A second POST with `agentUserId:null` creates a team-shared substrate. Then `GET /api/substrates/:id` → 200 asserts `kind/resourceRef/writeback/state` present. |
| AC2 | A `code` substrate records its repo (Connection + repo + branch) with forge auth resolved from a **Connection** (AN), not re-modelled. | **Integration test**: create with `connectionId:"conn-x"` + `resourceRef:{repo:"owner/r",branch:"main"}`; assert the row stores `connection_id` + the JSON selector and stores **no token/secret** (assert `Object.keys(row)` has no credential column). Unit test on the resolver **seam interface** (`SubstrateAuthResolver`) — a fake resolver is called with `connectionId` and returns an auth handle (proves AO1 references, never embeds, auth). |
| AC3 | The model accommodates `doc_set` (a markdown/Obsidian folder); SoRs (inbox/CRM/ticket) categorically excluded. | **Integration test**: `POST` with `kind:'doc_set'`, `resourceRef:{folder:"/notes"}`, `writeback:'file'` → 201. **Negative test**: `POST` with `kind:'inbox'` (or any non-registered kind) → 400 `VALIDATION_ERROR`. (Kind set at create-time is constrained to `SUBSTRATE_KINDS`; reads accept open vocab — mirrors artifacts.ts ARTIFACT_KINDS pattern.) |
| AC4 | A substrate attachment is distinct from, and does not overwrite, the knowledge-export config or a knowledge item. | **Integration test**: create a substrate; assert `knowledge_items` rowcount unchanged and `git-export` config (server_config / git-export route GET) unchanged. Plus **schema test**: `substrates` is a separate table (migration creates it; no ALTER on `artifacts`/`knowledge_items`/`server_config`). |
| AC5 | An unreachable/unauthenticated substrate surfaces as **needs_attention**, never silently. | **Integration test**: create a `code`+`git` substrate with `connectionId:"missing-conn"`; inject a fake resolver that reports the connection absent; `GET /api/substrates/:id` → `state:"needs_attention"`. Inverse: present connection → `state:"reachable"`. |
| AC6 | Detach removes the attachment. | **Integration test**: `DELETE /api/substrates/:id` → 204; subsequent `GET` → 404. |
| AC7 | Types are importable and `npm run check` is clean. | `npm run check` zero errors; `import { type SubstrateRow, substrates } from "@hyperidle/db"` and `import { type Substrate, type SubstrateKind, SUBSTRATE_KINDS } from "@hyperidle/shared"` resolve in server + a test (the wire `Substrate` is in shared; db exposes `SubstrateRow`). |
| AC8 | Forward-only migration runs cleanly. | Migration test (existing `applyMigrations` harness): `0039_AO1_substrates.sql` applies on a fresh DB; `substrates` table + indexes exist; re-running migrations is idempotent (no down-migration). |

---

## Phase 3 — Design-it-twice (the two non-trivial sub-decisions)

### A. `resource_ref` — split columns vs JSON-in-text

- **Alt 1 — split columns** (`repo`, `branch`, `folder_path`, …). *Shape:* typed columns per selector field. *Trade-off:* queryable/indexable per field, but a column-per-kind ossifies the **open** `kind` vocabulary — a new kind needs a migration. *Reject:* violates the open-vocabulary contract; most fields are null for any given kind (sparse table).
- **Alt 2 — single `resource_ref` text column, JSON-encoded, Zod-discriminated by `kind`.** *Shape:* one column; a discriminated-union Zod schema (`code → {repo, branch}`, `doc_set → {folder}`) validates at the route boundary; the DB stores text. *Trade-off:* not column-queryable (acceptable — we look substrates up by id/team/agent, never by repo-name). *Reject reason if any:* none material at this scale.
- **Pick: Alt 2.** Mirrors the in-codebase precedent (`artifacts.previewJson` text + `artifactPreviewSchema` discriminated union, schema.ts:858 + artifacts.ts:118-128). Matches the canonical `resourceRef: string`. Open `kind` vocab → JSON selector is the only shape that doesn't fight the contract.

### B. `connection_id` — DB foreign key vs plain reference column

- **Alt 1 — real FK** `connection_id → service_connections.id`. *Trade-off:* referential integrity. *Reject:* **the target table is genuinely absent on this branch** — `service_connections` was merged (0036) then **dropped/reverted (0038)** as part of the AN reset, and its re-merged shape isn't settled. A FK to a nonexistent table won't migrate, and pinning to 0036's columns would couple AO1's migration to a shape AN has already churned — exactly the dependency the spec forbids ("model the seam, do not depend on AN internals").
- **Alt 2 — plain nullable `text` column** + an application-layer **`SubstrateAuthResolver` seam** that AN satisfies later. *Trade-off:* no DB-level integrity for the connection link (an orphan `connection_id` is possible). *Mitigation:* the reachability check (AC5) turns an unresolvable `connection_id` into `needs_attention` — exactly the "surface, never silent" contract. The integrity gap is *the feature*, not a bug.
- **Pick: Alt 2.** When AN merges, it can add the FK constraint in its own forward migration (or leave it soft). AO1 stays decoupled. The seam interface (§4) is the contract AN implements.

---

## 1. Types — `packages/shared/src/substrate.ts`

New file, re-exported from `packages/shared/src/index.ts`. Mirrors the locked canonical shape exactly.

```ts
// packages/shared/src/substrate.ts

/** OPEN vocabulary. Initial committed kinds. Systems of record are categorically excluded. */
export const SUBSTRATE_KINDS = ["code", "doc_set"] as const;
export type SubstrateKind = (typeof SUBSTRATE_KINDS)[number] | (string & {});
//  ^ open at the type level (string & {} preserves literal autocomplete); the
//    create-route Zod enum constrains writes to SUBSTRATE_KINDS, reads stay open.

/** How authored changes leave the sandbox. Closed set — a capability axis, not a kind. */
export const WRITEBACK_MODES = ["git", "file", "none"] as const;
export type WriteBack = (typeof WRITEBACK_MODES)[number];

/** Reachability lifecycle. attached = freshly created; reachable = resolvable; needs_attention = unreachable/unauth. */
export const SUBSTRATE_STATES = ["attached", "reachable", "needs_attention"] as const;
export type SubstrateState = (typeof SUBSTRATE_STATES)[number];

/** Discriminated resource selector (the `resourceRef` JSON payload), keyed by kind. */
export type ResourceRef =
  | { kind: "code"; repo: string; branch: string }      // GitHub-style "owner/repo" or clone URL + branch
  | { kind: "doc_set"; folder: string };                // absolute folder path (local or connection-relative)

/** The Substrate wire/domain type. Mirrors docs/process-layer/canonical-shapes.md §Substrate. */
export interface Substrate {
  id: string;                  // opaque, stable
  teamId: string;              // FK → teams.id. The scope. Required.
  agentUserId: string | null;  // FK → users.id (the individual agent, = sessions.agentId).
                               //   null → team-level (shared) substrate.
  kind: SubstrateKind;         // open vocab; create constrained to SUBSTRATE_KINDS.
  connectionId: string | null; // reference to a Connection (AN). null → bare local path.
  resourceRef: ResourceRef;    // parsed selector (stored as JSON text in DB).
  writeback: WriteBack;
  state: SubstrateState;
  createdAt: string;           // ISO 8601
}

/** Zod schemas (route boundary). Lives here or co-located in the route file — see Task 4. */
// resourceRefSchema = z.discriminatedUnion("kind", [codeRefSchema, docSetRefSchema])
// createSubstrateSchema = z.object({ teamId, agentUserId: z.string().nullable().optional(),
//   kind: z.enum(SUBSTRATE_KINDS), connectionId: z.string().nullable().optional(),
//   resourceRef: resourceRefSchema, writeback: z.enum(WRITEBACK_MODES) })
```

> Note `kind` in `resourceRef` mirrors `kind` on the row — validated equal at the boundary (the `artifacts` precedent does the same with `previewJson.kind`).

---

## 2. Schema — `packages/db/src/schema.ts` + migration

New table appended to `schema.ts`. Pattern mirrors `artifacts` (text id, text FKs, `previewJson`-style JSON-in-text, index list).

```ts
// packages/db/src/schema.ts  (append after `artifacts`, before serverCredentials)

export const substrates = pgTable(
  "substrates",
  {
    id: text("id").primaryKey(),
    // Scope. Always present. The Team that owns this substrate.
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "restrict" }),
    // Primary attachment: the INDIVIDUAL agent. null → team-level (shared).
    // @lore AO1 Q1: targets users.id (the runtime agent identity = sessions.agentId,
    // schema.ts:252-254), NOT team_members.id. team_members is one row per team (U1 1:1,
    // schema.ts:97-99) with no per-agent identity, so keying it would carry zero per-agent
    // info and break AO2's per-agent materialization (it resolves the bound substrate by
    // the session's agentId = users.id). Matches canonical-shapes §Substrate (agentUserId).
    agentUserId: text("agent_user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    // OPEN vocabulary. 'code' | 'doc_set' initially. SoRs excluded at the app layer (Zod).
    kind: text("kind").notNull(),
    // Reference to a Connection (Track AN). NOT a DB FK — service_connections was merged
    // (0036) then reverted (0038, AN reset); absent now, re-merged shape unsettled.
    // An unresolvable id → needs_attention (AC5).
    // @lore AO1: plain text by design — AO1 ⟂ AN; AN may add the FK in its own migration.
    connectionId: text("connection_id"),
    // JSON-encoded ResourceRef, discriminated by kind. Mirrors artifacts.previewJson.
    resourceRef: text("resource_ref").notNull(),
    // Capability axis: how authored changes leave the sandbox.
    writeback: text("writeback").notNull(),
    // Reachability lifecycle. Stored; the inspect route may transition + persist it.
    state: text("state").notNull().default("attached"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("substrates_team_idx").on(table.teamId),
    index("substrates_agent_user_idx").on(table.agentUserId),
  ],
);

export type SubstrateRow = typeof substrates.$inferSelect;    // DB row (resourceRef: string). NOT named `Substrate`.
export type NewSubstrate = typeof substrates.$inferInsert;
// The wire type `Substrate` (resourceRef: ResourceRef, parsed) lives in @hyperidle/shared — see §1.
```

> **DB-row vs wire-type seam — exactly one type named `Substrate` ships.** `substrates.$inferSelect.resourceRef` is `string` (JSON text); the shared `Substrate.resourceRef` is the parsed `ResourceRef`. The route maps row→wire by `JSON.parse(row.resourceRef)` + Zod-validate (exactly the `rowToArtifact` pattern, artifacts.ts:98-129). Mirrors the real codebase precedent **verbatim** (db/index.ts:28 exports `type ArtifactRow`, shared exports `Artifact` — NOT two `Artifact`s):
> - **`@hyperidle/shared` exports `Substrate`** — the wire/domain type, `resourceRef: ResourceRef` (parsed). This is the *only* type named `Substrate` anywhere.
> - **`@hyperidle/db` exports `SubstrateRow`** (= `typeof substrates.$inferSelect`, `resourceRef: string`) **and `NewSubstrate`** (`$inferInsert`). Neither is named `Substrate`.
>
> The schema snippet's `export type Substrate = typeof substrates.$inferSelect` below is **wrong as written** — it must read `export type SubstrateRow = typeof substrates.$inferSelect`. There is no `Substrate` type in `@hyperidle/db`.

**`db/index.ts`** — add to the schema re-export block (index.ts:27-127), alphabetically: `substrates`, `type SubstrateRow`, `type NewSubstrate`.

**Migration — `packages/db/drizzle/0039_AO1_substrates.sql`** (forward-only, authored via `npm run db:generate` then committed; `_journal.json` gets idx 39):

```sql
CREATE TABLE "substrates" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"agent_user_id" text,
	"kind" text NOT NULL,
	"connection_id" text,
	"resource_ref" text NOT NULL,
	"writeback" text NOT NULL,
	"state" text DEFAULT 'attached' NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "substrates" ADD CONSTRAINT "substrates_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "substrates" ADD CONSTRAINT "substrates_agent_user_id_users_id_fk" FOREIGN KEY ("agent_user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "substrates_team_idx" ON "substrates" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "substrates_agent_user_idx" ON "substrates" USING btree ("agent_user_id");
```

> **Relation to `artifacts` / `knowledge_items`:** a NEW, distinct table. No ALTER on either. No FK between them. The substrate is the *files the agent authors*; the Artifact (L3) is the *reviewable record derived from* a session that materialized a substrate; a knowledge item is a *promoted fabric entry*. AC4 asserts the migration touches neither table nor the export config.
> **`onDelete`:** `team_id` RESTRICT (a team with substrates isn't silently deletable — matches teams/teamMembers RESTRICT convention). `agent_user_id` CASCADE (deleting an individual agent removes its agent-level attachments; the team-scoped ones with `agent_user_id` null survive).

---

## 3. API — `packages/server/src/routes/substrates.ts`

New file. `createSubstrateRoutes(db: HyperIdleDb, eventBus: EventBus): Hono`. Mounted `api.route("/substrates", createSubstrateRoutes(options.db, eventBus))` in `app.ts` (after `/artifacts`, line ~408). Pattern, middleware (`requireBoundary({kind:"public-data"})`), and Zod-via-`validateBody` mirror `artifacts.ts`.

**route-checklist** (the reviewer greps the impl against this):

| Method + path | Purpose | Validation | Returns |
|---|---|---|---|
| `POST /api/substrates` | Attach a substrate to one agent (or team-shared). | `createSubstrateSchema` (Zod). `resourceRef` discriminated-union must match `kind`. `kind ∈ SUBSTRATE_KINDS`. `writeback ∈ WRITEBACK_MODES`. `teamId` must exist (FK); `agentUserId` (if non-null) must exist. | `201` + `Substrate` (state `attached`). `400` VALIDATION_ERROR on bad kind/ref. `404` if `teamId`/`agentUserId` absent. |
| `GET /api/substrates?teamId=&agentUserId=` | List substrates for a team (optionally filtered to one agent). | query Zod: `teamId` required, `agentUserId` optional. | `200` + `{ substrates: Substrate[] }`. Each row's `state` reflects a fresh reachability check (§ below). |
| `GET /api/substrates/:id` | Inspect one substrate; runs the reachability check + persists any transition. | path id. | `200` + `Substrate` (with refreshed `state`). `404` if absent. |
| `DELETE /api/substrates/:id` | Detach. | path id. | `204`. `404` if absent. |

> **No `PATCH` route in AO1.** Earlier drafts carried `PATCH /api/substrates/:id` (edit resource/branch/writeback/connection), but **no AC mandates an update path** — AO1's ACs require only attach (POST), inspect (GET :id), list (GET), detach (DELETE), and reachability (state on read). Per the critique (WARN-2 / SUGG-1), an untested mutation route is scope-creep, so it is **cut**. Re-selecting a resource in v1 = detach + re-attach (the row is small and the resourceRef is the only mutable field anyone needs). A first-class `PATCH` lands in a later WP **with its own AC** (e.g. "PATCH branch → GET reflects new branch; PATCH cannot change `teamId`"), not bolted on here untested.

**Reachability / `needs_attention` check** (AC5) — a pure function `resolveSubstrateState(row, deps): SubstrateState`, called by `GET /:id` and `GET /` (list), persisting a transition when it changes:

```
resolveSubstrateState(row, { authResolver }):
  if row.writeback === 'none'                      → 'reachable'      // read-only ref, nothing to auth
  if row.connectionId == null                      → 'reachable'      // bare local path (local-first)
  // code or doc_set with a connection: ask the seam whether auth resolves.
  const resolved = authResolver.canResolve(row.connectionId)         // structural, NOT a network call in v1
  return resolved ? 'reachable' : 'needs_attention'
```

> v1 reachability is **structural** (does the referenced Connection exist + resolve to an auth handle), NOT a live `git ls-remote`. Forge round-trips need the sandbox creds (AO2). When AN is absent, `authResolver` is a **no-op resolver that reports every `connectionId` unresolvable** → a `code`+`git`+`connectionId` substrate correctly shows `needs_attention` until AN lands. A bare-local substrate is `reachable` regardless. This satisfies "surface, never silent" without reaching for creds AO1 shouldn't hold (hard rule 1).
>
> **Disclosed v1 state (intended, NOT a bug — WARN-3):** with no real `SubstrateAuthResolver` registered on `main` (AN's connection table reverted in 0038), the shipped `NoopAuthResolver.canResolve` returns false for **every** `connectionId`. Consequently **every connection-backed substrate (`connectionId` non-null, `writeback:'git'`) permanently shows `needs_attention`** in v1; the only substrates that reach `reachable` are bare-local ones (`connectionId` null) or `writeback:'none'`. This is concept-correct ("surface, never silent" — hard rule 7): a substrate whose forge auth cannot yet be resolved *should* read needs-attention, not falsely-green. It is **not** a regression and AO2/the founder must not read a forge-backed substrate's standing `needs_attention` as a defect — it clears the moment AN registers a real resolver, **without any change to AO1**. AC5's "inverse: present connection → `reachable`" branch is therefore exercised only with an **injected fake resolver** in the integration test, never via the default binding — which is exactly right.

**Validation (Zod) lives in the route file** (co-located, like `createArtifactSchema` in artifacts.ts) importing `SUBSTRATE_KINDS`/`WRITEBACK_MODES` from `@hyperidle/shared`. `resourceRefSchema = z.discriminatedUnion("kind", [...])`. Body size cap via `createBodyLimit` (resourceRef is tiny — 8KB cap).

---

## 4. Connection seam (AO1 ⟂ AN) — `SubstrateAuthResolver`

The contract AN satisfies, defined so AO1 references a Connection without coupling to AN internals. Lives in `@hyperidle/shared` (`substrate.ts`) so both server (AO1) and the future AN package implement/consume it.

```ts
/** Opaque auth handle the resolver yields — never the raw token. AO1 never inspects it;
 *  it is provisioned INTO the sandbox by AO2. */
export interface SubstrateAuth {
  readonly connectionId: string;
  /** How AO2 should make this auth usable in the sandbox. Discriminated; open. */
  readonly provision:
    | { mode: "git-credential"; remote: string }     // git asks via a credential helper / env
    | { mode: "env"; vars: Record<string, string> }  // e.g. GH_TOKEN — AO2 writes to sandbox env
    | { mode: "none" };                                // local-first, no auth needed
}

/** The seam. AN provides the real implementation; AO1 ships a NoopAuthResolver that
 *  reports every connectionId unresolvable (→ needs_attention) until AN merges. */
export interface SubstrateAuthResolver {
  /** Cheap structural check used by the reachability path (AO1, no network). */
  canResolve(connectionId: string): boolean | Promise<boolean>;
  /** Full resolution used by AO2 at materialization to provision auth into the sandbox.
   *  Returns null when the connection is absent/unauthenticated. */
  resolve(connectionId: string): Promise<SubstrateAuth | null>;
}
```

**Boundary contract:**
- AO1 depends only on `SubstrateAuthResolver`. It calls `canResolve` for reachability. It **never stores, logs, or returns** a token — the substrate row has **no credential column** (AC2). Hard rule 1 holds: no withholding *and* no AO1-held secret; the agent works with its creds in the sandbox (AO2).
- AO1 ships `NoopAuthResolver` (always-unresolvable) as the default binding so the system runs before AN. When AN merges, it registers a real resolver (held-token / inherited / service-OAuth → `SubstrateAuth`), **without changing AO1 or the substrate schema**.
- The resolver is injected into `createSubstrateRoutes` deps and into the AO2 materializer — a single shared interface, two consumers. No `connection_id` FK, no AN table import.

> **Why no broker / no withholding:** the resolver hands AO2 a `provision` directive, AO2 writes the auth into the sandbox, the agent's own `git`/`gh` push/PR (concept hard rule 1; PR #364). HyperIdle never executes the side-effect (system-boundary hard rule 1) and never gates *access* — AL7 gates *irreversible landing* only.

---

## 5. Materialization contract (AO2 seam)

AO2 is OUT of scope to build here, but AO1 must define the interface AO2 implements and **where it hooks** so the seam is coherent. AO2 implements a `SubstrateMaterializer`; AO1 owns the type.

```ts
// @hyperidle/shared (substrate.ts) — the contract; AO2 (server) implements it.
export interface SubstrateMaterializer {
  /** Place the substrate's working set into the session sandbox at its branch/folder,
   *  and provision the bound Connection's auth INTO the sandbox. Idempotent per sandbox. */
  materialize(input: {
    substrate: Substrate;
    sandboxPath: string;
    auth: SubstrateAuth | null;   // from SubstrateAuthResolver.resolve (null → local-first/none)
  }): Promise<MaterializeResult>;

  /** Capture authored changes back out of the sandbox after the session.
   *  git → commit (+ push/PR is a LANDING op, AL7/AO3, not here); file → write/snapshot; none → no-op. */
  captureBack(input: {
    substrate: Substrate;
    sandboxPath: string;
  }): Promise<CaptureResult>;
}
```

**The inbound-git capability gap (the thing AO2 must build):** `GitRunner` is **export-only** (`init/add/commit/push`, git-export-runner.ts:18-41). AO2 needs **clone / fetch / checkout**. Plan recommendation for AO2 (recorded here so the seam is coherent — **not built in AO1**):

- **Extend `GitRunner`** with `clone(url, dir, branch)`, `fetch(remote)`, `checkout(branch)` rather than a sibling runner. Rationale: the env-hardening (`buildGitEnv`, redaction, `GIT_TERMINAL_PROMPT=0`) and the spawn wrapper are exactly what an inbound clone needs; a sibling would duplicate ~120 lines of security-critical env code. One runner, more verbs. **Risk:** `GIT_ASKPASS=/bin/false` + the minimal env currently **fail closed on auth** — fine for export to an already-authed remote, but an inbound authenticated clone needs the `SubstrateAuth.provision` directive (credential helper or `GH_TOKEN` in the allow-list, already present line 112) to be applied. That wiring is AO2's, riding the seam.

**Write-back rides the host (no custom sync engine):**
- `writeback:'git'` → AO2 `captureBack` = `git add -A` + `commit` (authored, in-sandbox). **Push/PR/merge is a LANDING op** routed through AL7/AO3 — NOT captureBack. Conflict = git merge (the host's native mechanism).
- `writeback:'file'` → write the authored files back to the folder; conflict = **last-write-wins + a captured snapshot** (copy the prior state into a timestamped snapshot dir). No OT/CRDT, no two-way diff engine.
- `writeback:'none'` → read-only reference; captureBack is a no-op.

**Where it hooks into `session-provisioning.ts`:**
- **Materialize** — between **Phase 4 (sandbox spawn, @463 `workspace.spawn`)** and **Phase 6 (context assembly, @487 `strategy.assembleContext`)**. A new **Phase 4.5**: resolve the bound substrate(s) for the session's agent — `WHERE team_id = :sessionTeamId AND (agent_user_id = :sessionAgentId OR agent_user_id IS NULL)`, where `:sessionAgentId` is `sessions.agentId` (= `users.id`). This is exactly why the attachment FK is `users.id` (Q1): the only per-agent join AO2 has is `agentId`, and it points at `users`. Then call `materializer.materialize({ substrate, sandboxPath, auth: await authResolver.resolve(substrate.connectionId) })`. A **substrate-less session skips this and degrades to today's behavior** (concept hard rule 7; AO2 AC3). The auth resolution + sandbox provisioning happen here so the working tree + creds exist before context assembly and before the harness starts (@901).
- **Capture-back** — at teardown, in the normal-completion path **after `endSession` (@1117) and before `workspace.destroy` (@1122)** so authored changes are captured before the sandbox is thrown away (AO2 AC2). The crash/budget paths capture-back too if a working tree exists.

> AO1 ships **none** of this. It ships the `SubstrateMaterializer` *type* + the hook-point documentation so AO2 binds without re-litigating the seam. AO1's only runtime is the record + routes + reachability.

---

## 6. Ordered task list (red → green friendly)

| # | Task | Files | Proven by | Depends |
|---|---|---|---|---|
| T1 | Shared types + constants + Zod + seam interfaces. | `packages/shared/src/substrate.ts` (new); `packages/shared/src/index.ts` (re-export). | `npm run check`; an import test in shared `__tests__`. | — |
| T2 | Schema: `substrates` table + `SubstrateRow`/`NewSubstrate`; re-export in `db/index.ts`. | `packages/db/src/schema.ts`; `packages/db/src/index.ts`. | `npm run check`; table appears in `schema`. | T1 (types only conceptually) |
| T3 | Forward-only migration `0039_AO1_substrates.sql` + journal entry. | `packages/db/drizzle/0039_AO1_substrates.sql`; `packages/db/drizzle/meta/_journal.json` (+ snapshot). Authored via `npm run db:generate`. | AC8 migration test: applies on fresh DB; table+indexes exist; no ALTER on artifacts/knowledge_items/server_config. | T2 |
| T4 | `NoopAuthResolver` (default binding) + `resolveSubstrateState` pure fn. | `packages/server/src/services/substrate-reachability.ts` (new); resolver in same dir or `substrate-auth-resolver.ts`. | AC5 unit test: code+git+connectionId → `needs_attention` under Noop; bare-local → `reachable`; writeback:none → reachable. | T1 |
| T5 | Routes: `createSubstrateRoutes` (POST / GET list / GET id / DELETE — no PATCH) + co-located Zod. | `packages/server/src/routes/substrates.ts` (new). | AC1/AC3/AC6 integration tests (POST→GET→DELETE; doc_set ok; bad kind 400). | T2, T4 |
| T6 | Mount in app. | `packages/server/src/app.ts` (`api.route("/substrates", …)` ~line 408). | AC1 integration test reaches the route through `createApp`. | T5 |
| T7 | `SubstrateMaterializer` type (AO2 seam) — type only, no impl. | `packages/shared/src/substrate.ts` (extend) + re-export. | `npm run check`; importable. | T1 |
| T8 | Distinctness assertions: substrate ≠ knowledge-export / knowledge-item. | test in `substrates.integration.test.ts`. | AC4: create substrate → `knowledge_items` count + git-export config unchanged. | T5 |

**Red phase (builder writes first):** AC1–AC8 tests against the contracts above before T1–T8 implementation. Integration tests use the `{ db, app, eventBus }` fixture (`*.integration.test.ts`); the resolver unit test is a fast `*.test.ts`.

---

## 7. Security & abuse cases (required block)

| Vector | Applies? | Handling |
|---|---|---|
| Rate-limit on POST/DELETE | N/A — single-founder, anti-enterprise (ETHOS). Same posture as `artifacts`/`bets` POSTs (no rate-limit). Reviewer may flag; default N/A with reason. | — |
| Input-trust on agent-authored fields | **Yes** — `resourceRef` (`repo`/`branch`/`folder`) could be agent-supplied. | Zod discriminated-union validates shape. `branch` sanitized to git-ref-safe (reject leading `-`, control chars) — reuse the export path's `sanitizeBranch` posture. `repo` is a reference string only (AO1 never spawns git with it; AO2 does, through the hardened `GitRunner` + `--` argv guards already present). |
| Secret handling / new credential surface | **Yes — and the key invariant.** | The substrate row stores **no token/secret** (AC2). Auth lives only as a `SubstrateAuth` handle yielded by the resolver to AO2, provisioned into the sandbox. AO1 never logs/returns a token. The `connection_id` is an opaque reference. |
| Path traversal (folder input) | **Yes** — `doc_set` `folder`. | AO1 only *stores* the path; it never reads/writes it (AO2 does, inside the isolated sandbox). v1: validate it's an absolute path; full traversal containment is AO2's (it resolves the path against the sandbox). Recorded as an AO2 obligation. |
| SSRF (outbound URL) | **Deferred to AO2.** | AO1 performs **no** outbound request (reachability is structural, no `ls-remote`). A clone URL is stored, never fetched, in AO1. SSRF surface opens in AO2's clone — flagged there. |

---

## 8. Migrations (rename/move enumeration)

This WP **adds** a table; it renames/removes **nothing**. No call sites to migrate. The only existing-symbol touch is **additive**: the `db/index.ts` re-export block and `app.ts` route mount. Forward-only; no down-migration (concept hard rule 8). No data backfill — `substrates` starts empty (pre-implementation; no rows squeeze in from `knowledge_items` — the workaround simply stops being needed going forward).

---

## 9. protectedTests

No existing test's assertions change. New tests only. `protectedTests: []`. (The migration must not alter `artifacts`/`knowledge_items`/`server_config`, which keeps existing artifact/knowledge tests green — verified by AC4.)

---

## 10. sharedFiles (parallel-WP overlap)

- `packages/db/src/schema.ts` — append `substrates` (additive; low conflict).
- `packages/db/src/index.ts` — re-export block (alphabetical insert).
- `packages/db/drizzle/meta/_journal.json` + snapshot — migration registration (conflicts if another WP also migrates concurrently; schedule AO1's migration number last among concurrent DB WPs).
- `packages/shared/src/index.ts` — re-export `substrate.ts`.
- `packages/server/src/app.ts` — one `api.route` line.

---

## 11. Risks / open questions (for the reviewer)

1. **Agent-attachment FK target (Q1) — RESOLVED → `users.id`.** The substrate's agent attachment is `agent_user_id → users.id` (nullable; null → team-shared), not `agent_member_id → team_members.id`. Rationale: `team_members` is **one row per team** under the U1 1:1 invariant (schema.ts:97-99) and carries no per-agent identity, so keying it would make the attachment a duplicate of `team_id` and leave AO2 unable to bind a substrate to one agent. The runtime agent identity is `users.id` — `sessions.agentId → users.id` (schema.ts:252-254) — which is what AO2's Phase-4.5 materialization resolves against (`agent_user_id = :sessionAgentId OR agent_user_id IS NULL`). This matches the canonical shape and `substrate-primitive.md` (both already corrected to `agentUserId → users.id`) and the concept's two attachment levels (one agent OR team-shared). The candidate `agent_member_id → team_members.id` is dropped entirely — no vestigial column, no second migration. **Closed; not a concept re-open** — the canonical docs already carry this shape.

2. **v1 reachability is structural, not a live forge round-trip.** A `code`+`git` substrate shows `needs_attention` when its Connection doesn't resolve, **not** when the remote is genuinely unreachable/the branch is gone. Live `git ls-remote` needs the sandbox creds (AO2). Is structural reachability sufficient for AO1's AC5, or does the founder expect a live check at attach-time? My read: structural is correct for AO1 (AO1 must not hold forge creds — hard rule 1); the live check is an AO2/runtime concern.

3. **`doc_set` folder source for v1.** The concept names Obsidian/markdown folders; with AN's connection table reverted (0038) there's no Drive/Obsidian *connection* yet. v1 `doc_set` is realistically a **bare local folder** (`connection_id` null, `writeback:'file'`). A connection-backed `doc_set` is modeled (the seam supports it) but unexercised until a folder-providing Connection exists. Acceptable for "prove generality without a sync engine" (AO1 AC3 / validation scenario 2)? My read: yes — the AC only requires the *kind is recorded*, which a local folder satisfies.

4. **`connection_id` is a non-FK text column** (AN's `service_connections` reverted in 0038; absent now, re-merged shape unsettled). When AN re-merges it can add the constraint in its own forward migration. Until then an orphan `connection_id` is possible — but that's exactly the `needs_attention` path (AC5), so the integrity gap is surfaced, not silent. Confirm this decoupling is preferred over blocking AO1 on AN.

5. **Name collision `Substrate` (wire) vs `SubstrateRow` (DB).** I split them (wire = parsed `resourceRef`, row = JSON string), mirroring `Artifact`/`ArtifactRow`. Reviewer: confirm the split is clearer than a single type with a `string` resourceRef.

6. **AO2 inbound-git: extend `GitRunner` vs sibling.** I recommend **extend** (reuse the security-critical `buildGitEnv`/redaction). The catch: the current env fails-closed on auth (`GIT_ASKPASS=/bin/false`), so an authenticated inbound clone needs the `SubstrateAuth.provision` directive wired in — AO2's job, but flagging now so AO2 doesn't rebuild the runner. Not an AO1 deliverable; recorded for seam coherence.
