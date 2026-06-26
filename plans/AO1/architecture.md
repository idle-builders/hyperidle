# Architecture — AO1: The Filesystem primitive

**Workpackage:** AO1 (Track AO, Self-Hosting Build Loop). Complexity L (~5d).
**Producer:** designer. A separate reviewer runs `/architecture-critique`.
**Concept (LOCKED, fixed input):** `plans/AO/concept.md` + `plans/AO/research-filesystem-vs-tool.md`. Canonical shape `docs/process-layer/filesystem-primitive.md` + `docs/process-layer/canonical-shapes.md §Filesystem`.

This plan models the **Filesystem registry record** (team-scoped, with a first-class **`source`**), the **per-bot `FilesystemInjection` mapping** (which registered filesystems are injected into a given bot), **resource selection + reachability**, the **Connection seam** (how a `code` filesystem references a Connection and how its auth reaches the sandbox), and the **AO2 materialization seam** (the interface AO2 implements — a session for bot X materializes the filesystems **injected to X**). It writes **no production code** — types, schema, routes, and ordered tasks only. The registry/injection **UI** is deferred to `/design`; this plan specifies the API/data contract those surfaces bind to.

> **Model correction (founder, 2026-06-26).** A filesystem is a **registered, team-scoped file source**, **not** owned by a single agent. The old `agent_user_id` column on `filesystems` is **removed**; per-bot wiring lives in a separate **`filesystem_injections`** mapping (`{ agent_user_id → users.id, filesystem_id → filesystems.id }`, UNIQUE), parallel to connector/tool injection. A first-class **`source`** column (`local` / `github` / `gdrive` / …, derived from the Connection) is **added**. Two Settings surfaces: **Filesystems registry** + **per-bot injection** (Settings → Agents). This supersedes the prior single-FK ownership model below; `users.id` is now the **injection FK**, not a column on the filesystem.

---

## Required reading (engineer reads these before implementing)

- `plans/AO/concept.md` — the locked concept (decision rule, hard rules, vocabulary lock).
- `plans/AO/research-filesystem-vs-tool.md` — filesystem↔tool↔knowledge decision rule + citations.
- `docs/process-layer/filesystem-primitive.md` — canonical shape + lifecycle + contracts.
- `docs/process-layer/canonical-shapes.md §Filesystem shape (Track AO)` — the **source-of-truth** the schema must mirror: `Filesystem` (team-scoped, `source`, no `agentUserId`) + `FilesystemInjection` (`{ agentUserId, filesystemId }`, UNIQUE).
- `docs/architecture/system-boundary.md` — RIDE git / code is git-derived (hard rule 4).
- `.pipeline/work-packages/TRACK-AO.md` — AO1 ACs + AO2 (the consumer of this model).
- `.pipeline/work-packages/TRACK-AN.md` — the Connection model (NOT merged; model the seam, not the internals).
- Code seams (verified 2026-06-26): `packages/db/src/schema.ts` (teams 17-34, teamMembers 100-117, users 36-95, knowledgeItems 580-607, artifacts 848-865), `packages/server/src/services/session-provisioning.ts` (sandbox spawn Phase 4 @463; context assembly Phase 6 @487-497 — the AO2 hook point), `packages/fabric/src/services/git-export-runner.ts` (`GitRunner`, export-only — no clone/fetch/checkout).

---

## Phase 0 — Interrogation (resolved against the locked concept + code)

The concept pins most decisions. The genuinely-unsettled ones, with my read + evidence. These are addressed in the plan below; the reviewer confirms or overrides.

1. **What's the smallest version of AO1 that's still useful?**
   My read: the **registry record + the per-bot injection mapping + the registry routes + the inject/eject routes + the reachability check**. NOT materialization (AO2), NOT the UI (deferred to `/design`), NOT a Connection table (AN owns it; we model the seam). In-scope = `filesystems` table (team-scoped, with `source`) + `filesystem_injections` table + `Filesystem`/`FilesystemInjection` types + registry CRUD-ish API + per-bot inject/eject API + `needs_attention` resolution. Out = checkout, auth provisioning runtime, the registry/injection surface TSX.

2. **Per-bot wiring — a column on `filesystems` or a separate mapping table? RESOLVED → separate `filesystem_injections` mapping (founder model correction).**
   The filesystem is a **registered, team-scoped file source — not owned by one agent**. So the per-bot wiring is **not** a column on `filesystems`; the old `agent_user_id` column is **removed**. It lives in a separate **`filesystem_injections`** mapping: `{ agent_user_id → users.id, filesystem_id → filesystems.id }`, **UNIQUE (agent_user_id, filesystem_id)** — a bot may have many injected filesystems; a filesystem may be injected to many bots (`Filesystem N — N Bot`). This is parallel to connector/tool injection ("connect once, inject per agent"). The **FK target on the injection side is `users.id`**, and the reasoning the earlier single-FK draft worked out still holds, only relocated to the mapping: `team_members` is the membership *group* table — **one row per team** via the U1 1:1 invariant (schema.ts:97-99 `@lore U1`), with `members` JSON + `leadAgentId` and **no per-agent identity** (schema.ts:100-117), so it carries zero per-agent information. The **runtime agent identity is `users.id`**: `sessions.agentId → users.id` (schema.ts:252-254). AO2's per-bot materialization (§5, Phase 4.5) resolves the **injected** filesystems *inside a session that runs as a specific `agentId` (= `users.id`)*, joining `sessions.agentId → filesystem_injections.agent_user_id → filesystems.id`. So the injection FK must be `users.id` for that join to close. **`filesystems.team_id → teams.id`** stays the always-present registry scope. The candidate `agent_member_id → team_members.id` is dropped entirely. The injection must be **team-consistent** — the bot's team (`users.teamId`-derived) must match `filesystems.team_id` (enforced at the route boundary; see §3). This matches the canonical shape (`canonical-shapes.md §Filesystem` + `FilesystemInjection`, both corrected). Q1 records the resolution.

3. **`resource_ref` — structured columns or one opaque string?**
   The shape says `resourceRef: string` ("a repo+branch, a folder path"). My read: **one `resource_ref` text column holding a JSON-encoded selector** discriminated by `kind`, plus a denormalized `branch` is *not* added (keep it inside `resource_ref` to honor the single-column shape). Design-it-twice below (§Phase 3·A) picks JSON-in-text over split columns. Rationale: open `kind` vocabulary → per-kind selector shapes → a typed JSON blob (Zod-validated at the boundary, exactly as `artifacts.previewJson` does, schema.ts:858 + artifacts.ts:118) beats a column-per-kind that ossifies the vocabulary.

4. **Reachability — stored column or computed on read?**
   My read: **`state` is a stored column** (`attached` | `reachable` | `needs_attention`) as the canonical shape mandates, **and** the inspect/list route runs a **cheap structural reachability check** that can *transition* `attached→reachable` or `→needs_attention` and persist it. v1 reachability is **structural, not a network round-trip**: a `code` filesystem with `writeback:'git'` + a `connection_id` is `needs_attention` iff the referenced Connection is absent/unresolvable; a bare-local filesystem (`connection_id` null) is `reachable` if its local path is the form we expect. **No live `git ls-remote`** in AO1 — that auth lives in the sandbox (AO2), and AO1 must not reach for forge creds. Open question Q2 records the v1 boundary.

5. **Does the spec contradict an existing doc?** No. The canonical shape, the concept, and `filesystem-primitive.md` agree on the corrected model — `filesystems` is team-scoped with a first-class `source` and no `agent_user_id`; per-bot wiring is the `FilesystemInjection` mapping (`{ agentUserId, filesystemId }`, UNIQUE) keyed on `users.id`. No remaining tension.

6. **`source` — derived or stored? RESOLVED → stored column, derived at register-time.**
   `source` (the source type — `local` / `github` / `gdrive` / …) is a first-class **stored `text` column** on `filesystems`, **derived from the Connection at register-time** (or `local` when `connection_id` is null). Stored rather than computed-on-read because (a) it must be queryable/displayable in the registry without resolving the (possibly-absent) Connection, and (b) AN's connection shape is unsettled (0038 revert), so we cannot rely on a live derive. Open vocabulary (like `kind`); constrained at the boundary to a known set is **not** required (a new source type must not need a migration). The register route sets it from the Connection type when present.

---

## Phase 1 — Plan reconciliation (spec ⇆ codebase)

Every symbol the plan or spec references, verified against `main` (worktree `AO0`, 2026-06-26):

| Symbol / assumption | Reality (file:line) | Plan handling |
|---|---|---|
| `teams` table, `id` PK | `pgTable("teams", { id: text().primaryKey(), … })` schema.ts:17-34 | `filesystems.team_id → teams.id` FK. ✅ |
| `teamMembers` table = **one row per team** (U1 1:1) | `pgTable("team_members", { id, teamId→teams.id, members, leadAgentId, … })` schema.ts:100-117; `@lore U1` one row per team schema.ts:97-99 | **NOT** the injection FK target — it's the membership *group* (no per-agent identity), so it would carry zero per-agent info. The injection keys on `users.id`. See Q1. ✅ |
| `users` table = the individual agent (bot); `users.teamId → teamMembers.id` | schema.ts:36-95, :47 | The bot is a `users` row. **`filesystem_injections.agent_user_id → users.id`** (the injection FK; `filesystems` has **no** agent column). ✅ |
| **`sessions.agentId → users.id`** — the runtime agent identity | schema.ts:252-254 | **Decisive for Q1.** AO2 materializes inside a session running as a specific `agentId` (= `users.id`); the injection FK must be `users.id` so `sessions.agentId → filesystem_injections.agent_user_id → filesystems` closes. ✅ |
| **`filesystem_injections`** = per-bot wiring (NEW) | NEW table this WP. `{ agent_user_id → users.id, filesystem_id → filesystems.id }`, UNIQUE. | Replaces the single-owner column. Parallel to connector/tool injection. `Filesystem N — N Bot`. ✅ |
| `artifacts` has filesystem columns | NO — `artifacts` = `{id, producingTaskId, kind, label, previewJson, createdAt}` schema.ts:848-865. **No repoPath/filePath/commitSha.** | Spec confirmed: filesystem is a **new table**, distinct from `artifacts`. ✅ |
| `knowledge_items` | `{id, scopeKind, scopeId, topic, title, body, format, status, …}` schema.ts:580-607 | Filesystem is **distinct** — not a knowledge item. The "squeeze non-code output into knowledge_items" workaround is what AO1 ends. ✅ |
| `git-export` global config / target | `git-export-runner.ts` + `git-export-routes.ts` — writes knowledge markdown to a single global repo (`scopeId`). | Filesystem must **not** overwrite this. Different table, different concern (AC4). ✅ |
| `GitRunner` capability | `init/add/rm/commit/push/diffCached/revParse/configSet/remoteAdd/lsFiles/statusPorcelain` — git-export-runner.ts:18-41. **NO clone/fetch/checkout.** | The **inbound-git gap** AO2 fills. AO1 specifies the seam (§5); does not implement it. ✅ |
| `service_connections` table / `ServiceConnectionResolver` | **ABSENT on this branch now** (grep: zero hits) — but it was **merged (migration 0036 `CREATE TABLE service_connections`) then dropped (0038 `DROP TABLE "service_connections" CASCADE`)**. Reverted, not never-merged (Track AN reset, PR #364 — broker/registry dropped per MEMORY). | Model the **Connection seam** by reference only (§4). `connection_id` is a **plain `text` column, NOT a DB FK** — the target table is genuinely absent now, and AN's *re-merged* shape isn't fixed (it already churned once), so don't assume 0036's columns. ✅ |
| Migration numbering | drizzle dir tail = `0038_skinny_argent.sql`; `_journal.json` idx 38. | New migration **`0039_AO1_filesystems.sql`**, forward-only, `db:generate`-authored. ✅ |
| Route construction pattern | `createXRoutes(db, eventBus?) → Hono`; mounted `api.route("/path", createXRoutes(...))` app.ts:402-461. Zod via `validateBody`/`zValidator` + `validationHook` (validate.ts). `requireBoundary({kind:"public-data"})` middleware (artifacts.ts:159). | `createFilesystemRoutes(db, eventBus)`, mounted `api.route("/filesystems", …)`. Same Zod + boundary patterns. ✅ |
| `db/index.ts` schema re-export block | schema tables + `$inferSelect`/`$inferInsert` types re-exported alphabetically (index.ts:27-127); db exports `ArtifactRow` (NOT `Artifact`) — the precedent. | Add `filesystems`, `type FilesystemRow`, `type NewFilesystem`, `filesystemInjections`, `type FilesystemInjectionRow`, `type NewFilesystemInjection` to this block. **No `Filesystem` type in db** (the wire `Filesystem` is in `@hyperidle/shared`). **`sharedFiles`.** ✅ |
| `@hyperidle/shared` type home | per-concept files re-exported from `src/index.ts` (e.g. `proposed-call.ts`, `team.ts`). | New `packages/shared/src/filesystem.ts`, re-exported from `index.ts`. ✅ |

**No spec assumption disagreed in a way that blocks the plan.** The notable reconciliations: (a) `connection_id` is a non-FK text column because AN's connection table was reverted (dropped in 0038) and its re-merged shape isn't settled; (b) per-bot wiring is the **`filesystem_injections`** mapping keyed on `users.id` (= `sessions.agentId`), **not** a column on `filesystems` — the filesystem is registered team-scoped, not single-owner (Q1); (c) `filesystems` gains a first-class `source` column derived from the Connection.

---

## Phase 2 — Acceptance criteria → verification method

Mapped from TRACK-AO.md AO1 ACs + validation scenarios. Each AC names the exact test and its assertion.

| # | Acceptance criterion | Verification method |
|---|---|---|
| AC1 | A filesystem can be **registered** (team-scoped) with a first-class `source`; afterward source/kind/resource/writeback/state are visible. | **Integration test** (`filesystems.integration.test.ts`): `POST /api/filesystems` with `{teamId, kind:'code', connectionId, resourceRef:{repo,branch}, writeback:'git'}` → 201 + body echoes the record, including a `source` derived from the connection (e.g. `'github'`); a connection-less POST → `source:'local'`. Asserts the row is **team-scoped with no agent column** (`Object.keys(row)` has no `agent_user_id`). Then `GET /api/filesystems/:id` → 200 asserts `source/kind/resourceRef/writeback/state` present. |
| AC1b | A registered filesystem can be **injected into** a bot and **ejected**; injection is per-bot, many-to-many. | **Integration test**: `POST /api/filesystems/:id/injections` with `{agentUserId}` → 201; `GET /api/agents/:agentUserId/filesystems` (or `GET /api/filesystems?agentUserId=`) lists it. A second bot injecting the **same** filesystem also succeeds (sharing). Re-injecting the same `(agentUserId, filesystemId)` → 409/idempotent (UNIQUE). `DELETE …/injections/:agentUserId` → 204; subsequent list omits it. Injecting into a bot whose team ≠ `filesystems.team_id` → 400 (team-consistency). |
| AC2 | A `code` filesystem records its repo (Connection + repo + branch) with forge auth resolved from a **Connection** (AN), not re-modelled. | **Integration test**: create with `connectionId:"conn-x"` + `resourceRef:{repo:"owner/r",branch:"main"}`; assert the row stores `connection_id` + the JSON selector + a derived `source` and stores **no token/secret** (assert `Object.keys(row)` has no credential column). Unit test on the resolver **seam interface** (`FilesystemAuthResolver`) — a fake resolver is called with `connectionId` and returns an auth handle (proves AO1 references, never embeds, auth). |
| AC3 | The model accommodates `doc_set` (a markdown/Obsidian folder); SoRs (inbox/CRM/ticket) categorically excluded. | **Integration test**: `POST` with `kind:'doc_set'`, `resourceRef:{folder:"/notes"}`, `writeback:'file'` → 201. **Negative test**: `POST` with `kind:'inbox'` (or any non-registered kind) → 400 `VALIDATION_ERROR`. (Kind set at create-time is constrained to `FILESYSTEM_KINDS`; reads accept open vocab — mirrors artifacts.ts ARTIFACT_KINDS pattern.) |
| AC4 | A registered filesystem is distinct from, and does not overwrite, the knowledge-export config or a knowledge item. | **Integration test**: register a filesystem; assert `knowledge_items` rowcount unchanged and `git-export` config (server_config / git-export route GET) unchanged. Plus **schema test**: `filesystems`/`filesystem_injections` are separate tables (migration creates them; no ALTER on `artifacts`/`knowledge_items`/`server_config`). |
| AC5 | An unreachable/unauthenticated filesystem surfaces as **needs_attention**, never silently. | **Integration test**: create a `code`+`git` filesystem with `connectionId:"missing-conn"`; inject a fake resolver that reports the connection absent; `GET /api/filesystems/:id` → `state:"needs_attention"`. Inverse: present connection → `state:"reachable"`. |
| AC6 | Removing a filesystem deletes its registration **and** cascades its injections. | **Integration test**: register a filesystem, inject into 2 bots; `DELETE /api/filesystems/:id` → 204; subsequent `GET` → 404; `filesystem_injections` for that filesystem → 0 rows (cascade). |
| AC7 | Types are importable and `npm run check` is clean. | `npm run check` zero errors; `import { type FilesystemRow, filesystems, type FilesystemInjectionRow, filesystemInjections } from "@hyperidle/db"` and `import { type Filesystem, type FilesystemInjection, type FilesystemKind, FILESYSTEM_KINDS } from "@hyperidle/shared"` resolve in server + a test (the wire types are in shared; db exposes the `*Row` types). |
| AC8 | Forward-only migration runs cleanly. | Migration test (existing `applyMigrations` harness): `0039_AO1_filesystems.sql` applies on a fresh DB; `filesystems` (with `source`, no `agent_user_id`) **and** `filesystem_injections` tables + indexes + the UNIQUE constraint exist; re-running migrations is idempotent (no down-migration). |

---

## Phase 3 — Design-it-twice (the two non-trivial sub-decisions)

### A. `resource_ref` — split columns vs JSON-in-text

- **Alt 1 — split columns** (`repo`, `branch`, `folder_path`, …). *Shape:* typed columns per selector field. *Trade-off:* queryable/indexable per field, but a column-per-kind ossifies the **open** `kind` vocabulary — a new kind needs a migration. *Reject:* violates the open-vocabulary contract; most fields are null for any given kind (sparse table).
- **Alt 2 — single `resource_ref` text column, JSON-encoded, Zod-discriminated by `kind`.** *Shape:* one column; a discriminated-union Zod schema (`code → {repo, branch}`, `doc_set → {folder}`) validates at the route boundary; the DB stores text. *Trade-off:* not column-queryable (acceptable — we look filesystems up by id/team/agent, never by repo-name). *Reject reason if any:* none material at this scale.
- **Pick: Alt 2.** Mirrors the in-codebase precedent (`artifacts.previewJson` text + `artifactPreviewSchema` discriminated union, schema.ts:858 + artifacts.ts:118-128). Matches the canonical `resourceRef: string`. Open `kind` vocab → JSON selector is the only shape that doesn't fight the contract.

### B. `connection_id` — DB foreign key vs plain reference column

- **Alt 1 — real FK** `connection_id → service_connections.id`. *Trade-off:* referential integrity. *Reject:* **the target table is genuinely absent on this branch** — `service_connections` was merged (0036) then **dropped/reverted (0038)** as part of the AN reset, and its re-merged shape isn't settled. A FK to a nonexistent table won't migrate, and pinning to 0036's columns would couple AO1's migration to a shape AN has already churned — exactly the dependency the spec forbids ("model the seam, do not depend on AN internals").
- **Alt 2 — plain nullable `text` column** + an application-layer **`FilesystemAuthResolver` seam** that AN satisfies later. *Trade-off:* no DB-level integrity for the connection link (an orphan `connection_id` is possible). *Mitigation:* the reachability check (AC5) turns an unresolvable `connection_id` into `needs_attention` — exactly the "surface, never silent" contract. The integrity gap is *the feature*, not a bug.
- **Pick: Alt 2.** When AN merges, it can add the FK constraint in its own forward migration (or leave it soft). AO1 stays decoupled. The seam interface (§4) is the contract AN implements.

---

## 1. Types — `packages/shared/src/filesystem.ts`

New file, re-exported from `packages/shared/src/index.ts`. Mirrors the locked canonical shape exactly.

```ts
// packages/shared/src/filesystem.ts

/** OPEN vocabulary. Initial committed kinds. Systems of record are categorically excluded. */
export const FILESYSTEM_KINDS = ["code", "doc_set"] as const;
export type FilesystemKind = (typeof FILESYSTEM_KINDS)[number] | (string & {});
//  ^ open at the type level (string & {} preserves literal autocomplete); the
//    create-route Zod enum constrains writes to FILESYSTEM_KINDS, reads stay open.

/** How authored changes leave the sandbox. Closed set — a capability axis, not a kind. */
export const WRITEBACK_MODES = ["git", "file", "none"] as const;
export type WriteBack = (typeof WRITEBACK_MODES)[number];

/** Reachability lifecycle. attached = freshly registered; reachable = resolvable; needs_attention = unreachable/unauth. */
export const SUBSTRATE_STATES = ["attached", "reachable", "needs_attention"] as const;
export type FilesystemState = (typeof SUBSTRATE_STATES)[number];

/** The SOURCE TYPE — open vocabulary, derived from the Connection (or `local`).
 *  Surfaced PROMINENTLY in the registry UI. Distinct from `kind`. */
export const FILESYSTEM_SOURCES = ["local", "github", "gdrive", "obsidian"] as const;
export type FilesystemSource = (typeof FILESYSTEM_SOURCES)[number] | (string & {});
//  ^ open at the type level; not constrained at the boundary (a new source must not need a migration).

/** Discriminated resource selector (the `resourceRef` JSON payload), keyed by kind. */
export type ResourceRef =
  | { kind: "code"; repo: string; branch: string }      // GitHub-style "owner/repo" or clone URL + branch
  | { kind: "doc_set"; folder: string };                // absolute folder path (local or connection-relative)

/** The Filesystem wire/domain type. A REGISTERED, team-scoped file source — NOT owned by one agent.
 *  Mirrors docs/process-layer/canonical-shapes.md §Filesystem. */
export interface Filesystem {
  id: string;                  // opaque, stable
  teamId: string;              // FK → teams.id. The REGISTRY scope. Required.
  source: FilesystemSource;    // source type, derived from the Connection (or 'local'). Shown prominently.
  kind: FilesystemKind;         // open vocab; create constrained to FILESYSTEM_KINDS.
  connectionId: string | null; // reference to a Connection (AN). null → bare local path.
  resourceRef: ResourceRef;    // parsed selector (stored as JSON text in DB).
  writeback: WriteBack;
  state: FilesystemState;
  createdAt: string;           // ISO 8601
  // NOTE: no `agentUserId` — per-bot wiring is the FilesystemInjection mapping below.
}

/** Per-bot INJECTION wiring. Which registered filesystems are injected into a given bot.
 *  Mirrors docs/process-layer/canonical-shapes.md §FilesystemInjection. UNIQUE (agentUserId, filesystemId). */
export interface FilesystemInjection {
  agentUserId: string;         // FK → users.id (the bot/agent = sessions.agentId)
  filesystemId: string;        // FK → filesystems.id
  createdAt: string;           // ISO 8601
}

/** Zod schemas (route boundary). Lives here or co-located in the route file — see Task 4. */
// resourceRefSchema = z.discriminatedUnion("kind", [codeRefSchema, docSetRefSchema])
// registerFilesystemSchema = z.object({ teamId,
//   kind: z.enum(FILESYSTEM_KINDS), connectionId: z.string().nullable().optional(),
//   resourceRef: resourceRefSchema, writeback: z.enum(WRITEBACK_MODES) })
//   // `source` is NOT client-supplied — the route derives it from the Connection (or 'local').
// injectFilesystemSchema = z.object({ agentUserId: z.string() })
```

> Note `kind` in `resourceRef` mirrors `kind` on the row — validated equal at the boundary (the `artifacts` precedent does the same with `previewJson.kind`). `source` is **route-derived from the Connection**, not part of the register body — clients never set it directly.

---

## 2. Schema — `packages/db/src/schema.ts` + migration

New table appended to `schema.ts`. Pattern mirrors `artifacts` (text id, text FKs, `previewJson`-style JSON-in-text, index list).

```ts
// packages/db/src/schema.ts  (append after `artifacts`, before serverCredentials)

export const filesystems = pgTable(
  "filesystems",
  {
    id: text("id").primaryKey(),
    // Registry scope. Always present. The Team that owns this registered filesystem.
    // NOT single-owner — per-bot wiring is the separate filesystemInjections table below.
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "restrict" }),
    // The SOURCE TYPE — 'local' | 'github' | 'gdrive' | … OPEN vocabulary; derived from the
    // Connection at register-time (or 'local'). Stored (queryable in the registry without
    // resolving a possibly-absent Connection). Surfaced PROMINENTLY in the UI. (@lore AO1 Q6.)
    source: text("source").notNull(),
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
  (table) => [index("filesystems_team_idx").on(table.teamId)],
);

// Per-bot INJECTION: which registered filesystems are injected into a given bot's sessions.
// @lore AO1 Q1: the agent FK is users.id (the runtime agent identity = sessions.agentId,
// schema.ts:252-254), NOT team_members.id (one row per team, U1 1:1, no per-agent identity).
// AO2's per-bot materialization resolves sessions.agentId → filesystem_injections → filesystems.
// Replaces the removed single-owner column. Parallel to connector/tool injection.
export const filesystemInjections = pgTable(
  "filesystem_injections",
  {
    agentUserId: text("agent_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    filesystemId: text("filesystem_id")
      .notNull()
      .references(() => filesystems.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.agentUserId, table.filesystemId] }), // UNIQUE (agentUserId, filesystemId)
    index("filesystem_injections_agent_user_idx").on(table.agentUserId),
    index("filesystem_injections_filesystem_idx").on(table.filesystemId),
  ],
);

export type FilesystemRow = typeof filesystems.$inferSelect;    // DB row (resourceRef: string). NOT named `Filesystem`.
export type NewFilesystem = typeof filesystems.$inferInsert;
export type FilesystemInjectionRow = typeof filesystemInjections.$inferSelect;
export type NewFilesystemInjection = typeof filesystemInjections.$inferInsert;
// The wire types `Filesystem`/`FilesystemInjection` (parsed) live in @hyperidle/shared — see §1.
```

> The composite primary key `(agent_user_id, filesystem_id)` IS the UNIQUE constraint — no second bot-double-injects the same filesystem; `primaryKey` is imported from `drizzle-orm/pg-core` (already used by other composite-key tables). Team-consistency (the bot's team must match `filesystems.team_id`) is enforced at the route boundary, NOT a DB constraint (no cross-table CHECK; the bot→team link is `users.teamId → team_members.id`, resolvable in the inject handler).

> **DB-row vs wire-type seam — exactly one type named `Filesystem` ships.** `filesystems.$inferSelect.resourceRef` is `string` (JSON text); the shared `Filesystem.resourceRef` is the parsed `ResourceRef`. The route maps row→wire by `JSON.parse(row.resourceRef)` + Zod-validate (exactly the `rowToArtifact` pattern, artifacts.ts:98-129). Mirrors the real codebase precedent **verbatim** (db/index.ts:28 exports `type ArtifactRow`, shared exports `Artifact` — NOT two `Artifact`s):
> - **`@hyperidle/shared` exports `Filesystem`** — the wire/domain type, `resourceRef: ResourceRef` (parsed). This is the *only* type named `Filesystem` anywhere.
> - **`@hyperidle/db` exports `FilesystemRow`** (= `typeof filesystems.$inferSelect`, `resourceRef: string`) **and `NewFilesystem`** (`$inferInsert`). Neither is named `Filesystem`.
>
> Same split applies to the injection mapping: `@hyperidle/db` exports `FilesystemInjectionRow`/`NewFilesystemInjection`; `@hyperidle/shared` exports the wire `FilesystemInjection`. (For the injection there is no parsed/raw divergence — the wire type just normalizes `createdAt`; keeping the two-name convention is for consistency, not a transform.)

**`db/index.ts`** — add to the schema re-export block (index.ts:27-127), alphabetically: `filesystemInjections`, `filesystems`, `type FilesystemInjectionRow`, `type FilesystemRow`, `type NewFilesystem`, `type NewFilesystemInjection`.

**Migration — `packages/db/drizzle/0039_AO1_filesystems.sql`** (forward-only, authored via `npm run db:generate` then committed; `_journal.json` gets idx 39):

```sql
CREATE TABLE "filesystems" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"source" text NOT NULL,
	"kind" text NOT NULL,
	"connection_id" text,
	"resource_ref" text NOT NULL,
	"writeback" text NOT NULL,
	"state" text DEFAULT 'attached' NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "filesystem_injections" (
	"agent_user_id" text NOT NULL,
	"filesystem_id" text NOT NULL,
	"created_at" text NOT NULL,
	CONSTRAINT "filesystem_injections_agent_user_id_filesystem_id_pk" PRIMARY KEY("agent_user_id","filesystem_id")
);
--> statement-breakpoint
ALTER TABLE "filesystems" ADD CONSTRAINT "filesystems_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "filesystem_injections" ADD CONSTRAINT "filesystem_injections_agent_user_id_users_id_fk" FOREIGN KEY ("agent_user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "filesystem_injections" ADD CONSTRAINT "filesystem_injections_filesystem_id_filesystems_id_fk" FOREIGN KEY ("filesystem_id") REFERENCES "filesystems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "filesystems_team_idx" ON "filesystems" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "filesystem_injections_agent_user_idx" ON "filesystem_injections" USING btree ("agent_user_id");--> statement-breakpoint
CREATE INDEX "filesystem_injections_filesystem_idx" ON "filesystem_injections" USING btree ("filesystem_id");
```

> **Relation to `artifacts` / `knowledge_items`:** two NEW, distinct tables. No ALTER on either. No FK between them. The filesystem is the *files the agent authors*; the Artifact (L3) is the *reviewable record derived from* a session that materialized a filesystem; a knowledge item is a *promoted fabric entry*. AC4 asserts the migration touches neither table nor the export config.
> **`onDelete`:** `filesystems.team_id` RESTRICT (a team with filesystems isn't silently deletable — matches teams/teamMembers RESTRICT convention). `filesystem_injections.filesystem_id` CASCADE (removing a registration removes its injections — AC6). `filesystem_injections.agent_user_id` CASCADE (deleting a bot removes its injections; the registration survives). The filesystem itself has **no** agent FK — registration outlives any one bot.

---

## 3. API — `packages/server/src/routes/filesystems.ts`

New file. `createFilesystemRoutes(db: HyperIdleDb, eventBus: EventBus): Hono`. Mounted `api.route("/filesystems", createFilesystemRoutes(options.db, eventBus))` in `app.ts` (after `/artifacts`, line ~408). Pattern, middleware (`requireBoundary({kind:"public-data"})`), and Zod-via-`validateBody` mirror `artifacts.ts`.

**route-checklist** (the reviewer greps the impl against this):

**Registry routes** (team-scoped filesystem registration):

| Method + path | Purpose | Validation | Returns |
|---|---|---|---|
| `POST /api/filesystems` | **Register** a filesystem (team-scoped). | `registerFilesystemSchema` (Zod). `resourceRef` union must match `kind`. `kind ∈ FILESYSTEM_KINDS`. `writeback ∈ WRITEBACK_MODES`. `teamId` must exist (FK). `source` is **NOT** client-supplied — derived from the Connection (or `'local'`). | `201` + `Filesystem` (state `attached`, `source` derived). `400` VALIDATION_ERROR on bad kind/ref. `404` if `teamId` absent. |
| `GET /api/filesystems?teamId=` | List the team's registered filesystems. | query Zod: `teamId` required. | `200` + `{ filesystems: Filesystem[] }`. Each row's `state` reflects a fresh reachability check (§ below). |
| `GET /api/filesystems/:id` | Inspect one filesystem; runs the reachability check + persists any transition. | path id. | `200` + `Filesystem` (refreshed `state`, `source`). `404` if absent. |
| `DELETE /api/filesystems/:id` | Remove the registration (cascades injections). | path id. | `204`. `404` if absent. |

**Per-bot injection routes** (which registered filesystems a bot receives):

| Method + path | Purpose | Validation | Returns |
|---|---|---|---|
| `POST /api/filesystems/:id/injections` | **Inject** the filesystem into a bot. | `injectFilesystemSchema` (`{agentUserId}`). Filesystem `:id` must exist. `agentUserId` must exist (`users`). **Team-consistency:** the bot's team (via `users.teamId → team_members → teams`) must equal `filesystems.team_id`. | `201` + `FilesystemInjection`. `404` if filesystem/bot absent. `400` on team mismatch. `409` (or idempotent 200) if already injected (UNIQUE). |
| `DELETE /api/filesystems/:id/injections/:agentUserId` | **Eject** the filesystem from a bot. | path ids. | `204`. `404` if the injection is absent. |
| `GET /api/filesystems?agentUserId=` | List the filesystems **injected to a bot** (join `filesystem_injections → filesystems`). | query Zod: `agentUserId` required (mutually exclusive with `teamId`). | `200` + `{ filesystems: Filesystem[] }` — the bot's injected set, each with a fresh reachability `state`. |

> The single `GET /api/filesystems` route accepts **either** `teamId` (registry list) **or** `agentUserId` (injected-to-a-bot list) — exactly one. This is the surface the per-bot injection UI (Settings → Agents) reads to show "filesystems injected to this bot."

> **`source` derivation.** On register, the route resolves `source` from the bound Connection's type via the `FilesystemAuthResolver` seam (extended with a cheap `sourceOf(connectionId): string | null`) — or `'local'` when `connectionId` is null. With the `NoopAuthResolver` default (AN absent), a connection-backed register still gets a usable `source`: the resolver returns `null`, the route falls back to `'unknown'` — but in practice AO1's tests inject a fake resolver that returns `'github'`. (Alternatively the client may pass a `sourceHint` the route only trusts when the resolver yields nothing; keep it minimal — derive-or-`unknown` is the v1 contract.)

> **No `PATCH` route in AO1.** Earlier drafts carried `PATCH /api/filesystems/:id` (edit resource/branch/writeback/connection), but **no AC mandates an update path** — AO1's ACs require register (POST), inspect (GET :id), list (GET by team or bot), remove (DELETE), inject/eject (POST/DELETE injections), and reachability (state on read). Per the critique (WARN-2 / SUGG-1), an untested mutation route is scope-creep, so it is **cut**. Re-selecting a resource in v1 = remove + re-register (the row is small and the resourceRef is the only mutable field anyone needs); re-wiring a bot = eject + inject. A first-class `PATCH` lands in a later WP **with its own AC**, not bolted on here untested.

**Reachability / `needs_attention` check** (AC5) — a pure function `resolveFilesystemState(row, deps): FilesystemState`, called by `GET /:id` and `GET /` (list), persisting a transition when it changes:

```
resolveFilesystemState(row, { authResolver }):
  if row.writeback === 'none'                      → 'reachable'      // read-only ref, nothing to auth
  if row.connectionId == null                      → 'reachable'      // bare local path (local-first)
  // code or doc_set with a connection: ask the seam whether auth resolves.
  const resolved = authResolver.canResolve(row.connectionId)         // structural, NOT a network call in v1
  return resolved ? 'reachable' : 'needs_attention'
```

> v1 reachability is **structural** (does the referenced Connection exist + resolve to an auth handle), NOT a live `git ls-remote`. Forge round-trips need the sandbox creds (AO2). When AN is absent, `authResolver` is a **no-op resolver that reports every `connectionId` unresolvable** → a `code`+`git`+`connectionId` filesystem correctly shows `needs_attention` until AN lands. A bare-local filesystem is `reachable` regardless. This satisfies "surface, never silent" without reaching for creds AO1 shouldn't hold (hard rule 1).
>
> **Disclosed v1 state (intended, NOT a bug — WARN-3):** with no real `FilesystemAuthResolver` registered on `main` (AN's connection table reverted in 0038), the shipped `NoopAuthResolver.canResolve` returns false for **every** `connectionId`. Consequently **every connection-backed filesystem (`connectionId` non-null, `writeback:'git'`) permanently shows `needs_attention`** in v1; the only filesystems that reach `reachable` are bare-local ones (`connectionId` null) or `writeback:'none'`. This is concept-correct ("surface, never silent" — hard rule 7): a filesystem whose forge auth cannot yet be resolved *should* read needs-attention, not falsely-green. It is **not** a regression and AO2/the founder must not read a forge-backed filesystem's standing `needs_attention` as a defect — it clears the moment AN registers a real resolver, **without any change to AO1**. AC5's "inverse: present connection → `reachable`" branch is therefore exercised only with an **injected fake resolver** in the integration test, never via the default binding — which is exactly right.

**Validation (Zod) lives in the route file** (co-located, like `createArtifactSchema` in artifacts.ts) importing `FILESYSTEM_KINDS`/`WRITEBACK_MODES` from `@hyperidle/shared`. `resourceRefSchema = z.discriminatedUnion("kind", [...])`. Body size cap via `createBodyLimit` (resourceRef is tiny — 8KB cap).

---

## 4. Connection seam (AO1 ⟂ AN) — `FilesystemAuthResolver`

The contract AN satisfies, defined so AO1 references a Connection without coupling to AN internals. Lives in `@hyperidle/shared` (`filesystem.ts`) so both server (AO1) and the future AN package implement/consume it.

```ts
/** Opaque auth handle the resolver yields — never the raw token. AO1 never inspects it;
 *  it is provisioned INTO the sandbox by AO2. */
export interface FilesystemAuth {
  readonly connectionId: string;
  /** How AO2 should make this auth usable in the sandbox. Discriminated; open. */
  readonly provision:
    | { mode: "git-credential"; remote: string }     // git asks via a credential helper / env
    | { mode: "env"; vars: Record<string, string> }  // e.g. GH_TOKEN — AO2 writes to sandbox env
    | { mode: "none" };                                // local-first, no auth needed
}

/** The seam. AN provides the real implementation; AO1 ships a NoopAuthResolver that
 *  reports every connectionId unresolvable (→ needs_attention) until AN merges. */
export interface FilesystemAuthResolver {
  /** Cheap structural check used by the reachability path (AO1, no network). */
  canResolve(connectionId: string): boolean | Promise<boolean>;
  /** The SOURCE TYPE of a connection ('github' | 'gdrive' | …), used by the register route
   *  to derive `filesystems.source`. Returns null when the connection is absent/unknown. */
  sourceOf(connectionId: string): string | null | Promise<string | null>;
  /** Full resolution used by AO2 at materialization to provision auth into the sandbox.
   *  Returns null when the connection is absent/unauthenticated. */
  resolve(connectionId: string): Promise<FilesystemAuth | null>;
}
```

**Boundary contract:**
- AO1 depends only on `FilesystemAuthResolver`. It calls `canResolve` for reachability and `sourceOf` at register-time to derive `source`. It **never stores, logs, or returns** a token — the filesystem row has **no credential column** (AC2). Hard rule 1 holds: no withholding *and* no AO1-held secret; the agent works with its creds in the sandbox (AO2).
- AO1 ships `NoopAuthResolver` (always-unresolvable; `sourceOf` → null) as the default binding so the system runs before AN. When AN merges, it registers a real resolver (held-token / inherited / service-OAuth → `FilesystemAuth`; `sourceOf` → the connection's provider type), **without changing AO1 or the filesystem schema**.
- The resolver is injected into `createFilesystemRoutes` deps and into the AO2 materializer — a single shared interface, two consumers. No `connection_id` FK, no AN table import.

> **Why no broker / no withholding:** the resolver hands AO2 a `provision` directive, AO2 writes the auth into the sandbox, the agent's own `git`/`gh` push/PR (concept hard rule 1; PR #364). HyperIdle never executes the side-effect (system-boundary hard rule 1) and never gates *access* — AL7 gates *irreversible landing* only.

---

## 5. Materialization contract (AO2 seam)

AO2 is OUT of scope to build here, but AO1 must define the interface AO2 implements and **where it hooks** so the seam is coherent. AO2 implements a `FilesystemMaterializer`; AO1 owns the type.

```ts
// @hyperidle/shared (filesystem.ts) — the contract; AO2 (server) implements it.
export interface FilesystemMaterializer {
  /** Place the filesystem's working set into the session sandbox at its branch/folder,
   *  and provision the bound Connection's auth INTO the sandbox. Idempotent per sandbox. */
  materialize(input: {
    filesystem: Filesystem;
    sandboxPath: string;
    auth: FilesystemAuth | null;   // from FilesystemAuthResolver.resolve (null → local-first/none)
  }): Promise<MaterializeResult>;

  /** Capture authored changes back out of the sandbox after the session.
   *  git → commit (+ push/PR is a LANDING op, AL7/AO3, not here); file → write/snapshot; none → no-op. */
  captureBack(input: {
    filesystem: Filesystem;
    sandboxPath: string;
  }): Promise<CaptureResult>;
}
```

**The inbound-git capability gap (the thing AO2 must build):** `GitRunner` is **export-only** (`init/add/commit/push`, git-export-runner.ts:18-41). AO2 needs **clone / fetch / checkout**. Plan recommendation for AO2 (recorded here so the seam is coherent — **not built in AO1**):

- **Extend `GitRunner`** with `clone(url, dir, branch)`, `fetch(remote)`, `checkout(branch)` rather than a sibling runner. Rationale: the env-hardening (`buildGitEnv`, redaction, `GIT_TERMINAL_PROMPT=0`) and the spawn wrapper are exactly what an inbound clone needs; a sibling would duplicate ~120 lines of security-critical env code. One runner, more verbs. **Risk:** `GIT_ASKPASS=/bin/false` + the minimal env currently **fail closed on auth** — fine for export to an already-authed remote, but an inbound authenticated clone needs the `FilesystemAuth.provision` directive (credential helper or `GH_TOKEN` in the allow-list, already present line 112) to be applied. That wiring is AO2's, riding the seam.

**Write-back rides the host (no custom sync engine):**
- `writeback:'git'` → AO2 `captureBack` = `git add -A` + `commit` (authored, in-sandbox). **Push/PR/merge is a LANDING op** routed through AL7/AO3 — NOT captureBack. Conflict = git merge (the host's native mechanism).
- `writeback:'file'` → write the authored files back to the folder; conflict = **last-write-wins + a captured snapshot** (copy the prior state into a timestamped snapshot dir). No OT/CRDT, no two-way diff engine.
- `writeback:'none'` → read-only reference; captureBack is a no-op.

**Where it hooks into `session-provisioning.ts`:**
- **Materialize** — between **Phase 4 (sandbox spawn, @463 `workspace.spawn`)** and **Phase 6 (context assembly, @487 `strategy.assembleContext`)**. A new **Phase 4.5**: resolve the filesystems **injected to** the session's bot — join `filesystem_injections.agent_user_id = :sessionAgentId → filesystems.id`, where `:sessionAgentId` is `sessions.agentId` (= `users.id`). This is exactly why the injection FK is `users.id` (Q1): the only per-bot handle AO2 has is `agentId`, and `filesystem_injections.agent_user_id` points at `users`. (No `agent_user_id IS NULL` branch any more — there is no team-shared-via-null fallback; a filesystem reaches a bot **only** through an explicit injection.) Then for each injected filesystem call `materializer.materialize({ filesystem, sandboxPath, auth: await authResolver.resolve(filesystem.connectionId) })`. A **session for a bot with no injected filesystems skips this and degrades to today's behavior** (concept hard rule 7; AO2 AC3). The auth resolution + sandbox provisioning happen here so the working tree + creds exist before context assembly and before the harness starts (@901).
- **Capture-back** — at teardown, in the normal-completion path **after `endSession` (@1117) and before `workspace.destroy` (@1122)** so authored changes are captured before the sandbox is thrown away (AO2 AC2). The crash/budget paths capture-back too if a working tree exists.

> AO1 ships **none** of this. It ships the `FilesystemMaterializer` *type* + the hook-point documentation so AO2 binds without re-litigating the seam. AO1's only runtime is the record + routes + reachability.

---

## 6. Ordered task list (red → green friendly)

| # | Task | Files | Proven by | Depends |
|---|---|---|---|---|
| T1 | Shared types + constants + Zod + seam interfaces. | `packages/shared/src/filesystem.ts` (new); `packages/shared/src/index.ts` (re-export). | `npm run check`; an import test in shared `__tests__`. | — |
| T2 | Schema: `filesystems` (team-scoped, `source`, no agent col) + `filesystem_injections` mapping + the four `*Row`/`New*` types; re-export in `db/index.ts`. | `packages/db/src/schema.ts`; `packages/db/src/index.ts`. | `npm run check`; both tables appear in `schema`. | T1 (types only conceptually) |
| T3 | Forward-only migration `0039_AO1_filesystems.sql` + journal entry — both tables + UNIQUE(agent_user_id, filesystem_id). | `packages/db/drizzle/0039_AO1_filesystems.sql`; `packages/db/drizzle/meta/_journal.json` (+ snapshot). Authored via `npm run db:generate`. | AC8 migration test: applies on fresh DB; `filesystems` (with `source`, no `agent_user_id`) + `filesystem_injections` + indexes + composite PK exist; no ALTER on artifacts/knowledge_items/server_config. | T2 |
| T4 | `NoopAuthResolver` (default binding; `canResolve`/`sourceOf`/`resolve`) + `resolveFilesystemState` pure fn. | `packages/server/src/services/filesystem-reachability.ts` (new); resolver in same dir or `filesystem-auth-resolver.ts`. | AC5 unit test: code+git+connectionId → `needs_attention` under Noop; bare-local → `reachable`; writeback:none → reachable. | T1 |
| T5 | Routes: `createFilesystemRoutes` (registry: POST / GET list-by-team-or-bot / GET id / DELETE; injection: POST `/:id/injections` / DELETE `/:id/injections/:agentUserId`; no PATCH) + co-located Zod + `source` derivation + team-consistency check. | `packages/server/src/routes/filesystems.ts` (new). | AC1/AC1b/AC3/AC6 integration tests (register→GET→DELETE; doc_set ok; bad kind 400; inject/eject; team-mismatch 400; share across 2 bots; cascade on delete). | T2, T4 |
| T6 | Mount in app. | `packages/server/src/app.ts` (`api.route("/filesystems", …)` ~line 408). | AC1 integration test reaches the route through `createApp`. | T5 |
| T7 | `FilesystemMaterializer` type (AO2 seam) — type only, no impl. | `packages/shared/src/filesystem.ts` (extend) + re-export. | `npm run check`; importable. | T1 |
| T8 | Distinctness assertions: filesystem ≠ knowledge-export / knowledge-item. | test in `filesystems.integration.test.ts`. | AC4: create filesystem → `knowledge_items` count + git-export config unchanged. | T5 |

**Red phase (builder writes first):** AC1, AC1b, AC2–AC8 tests against the contracts above before T1–T8 implementation. Integration tests use the `{ db, app, eventBus }` fixture (`*.integration.test.ts`); the resolver unit test is a fast `*.test.ts`.

---

## 7. Security & abuse cases (required block)

| Vector | Applies? | Handling |
|---|---|---|
| Rate-limit on POST/DELETE | N/A — single-founder, anti-enterprise (ETHOS). Same posture as `artifacts`/`bets` POSTs (no rate-limit). Reviewer may flag; default N/A with reason. | — |
| Input-trust on agent-authored fields | **Yes** — `resourceRef` (`repo`/`branch`/`folder`) could be agent-supplied. | Zod discriminated-union validates shape. `branch` sanitized to git-ref-safe (reject leading `-`, control chars) — reuse the export path's `sanitizeBranch` posture. `repo` is a reference string only (AO1 never spawns git with it; AO2 does, through the hardened `GitRunner` + `--` argv guards already present). |
| Secret handling / new credential surface | **Yes — and the key invariant.** | The filesystem row stores **no token/secret** (AC2). Auth lives only as a `FilesystemAuth` handle yielded by the resolver to AO2, provisioned into the sandbox. AO1 never logs/returns a token. The `connection_id` is an opaque reference. |
| Path traversal (folder input) | **Yes** — `doc_set` `folder`. | AO1 only *stores* the path; it never reads/writes it (AO2 does, inside the isolated sandbox). v1: validate it's an absolute path; full traversal containment is AO2's (it resolves the path against the sandbox). Recorded as an AO2 obligation. |
| SSRF (outbound URL) | **Deferred to AO2.** | AO1 performs **no** outbound request (reachability is structural, no `ls-remote`). A clone URL is stored, never fetched, in AO1. SSRF surface opens in AO2's clone — flagged there. |

---

## 8. Migrations (rename/move enumeration)

This WP **adds** two tables (`filesystems`, `filesystem_injections`); it renames/removes **nothing** in the existing schema. No call sites to migrate. The only existing-symbol touch is **additive**: the `db/index.ts` re-export block and `app.ts` route mount. Forward-only; no down-migration (concept hard rule 8). No data backfill — both tables start empty (pre-implementation; no rows squeeze in from `knowledge_items` — the workaround simply stops being needed going forward). (The removed `agent_user_id` column never shipped — it lived only in earlier drafts of this plan, not in any migration; there is nothing to drop.)

---

## 9. protectedTests

No existing test's assertions change. New tests only. `protectedTests: []`. (The migration must not alter `artifacts`/`knowledge_items`/`server_config`, which keeps existing artifact/knowledge tests green — verified by AC4.)

---

## 10. sharedFiles (parallel-WP overlap)

- `packages/db/src/schema.ts` — append `filesystems` + `filesystem_injections` (additive; low conflict; needs `primaryKey` import from `drizzle-orm/pg-core` if not already in scope).
- `packages/db/src/index.ts` — re-export block (alphabetical insert).
- `packages/db/drizzle/meta/_journal.json` + snapshot — migration registration (conflicts if another WP also migrates concurrently; schedule AO1's migration number last among concurrent DB WPs).
- `packages/shared/src/index.ts` — re-export `filesystem.ts`.
- `packages/server/src/app.ts` — one `api.route` line.

---

## 11. Risks / open questions (for the reviewer)

1. **Per-bot wiring (Q1) — RESOLVED → `filesystem_injections` mapping keyed on `users.id`, NOT a column on `filesystems`.** The filesystem is **registered team-scoped, not single-owner** (founder model correction); the old `agent_user_id` column is **removed**, and a first-class `source` column is added. Per-bot wiring is the separate `filesystem_injections` mapping (`{ agent_user_id → users.id, filesystem_id → filesystems.id }`, UNIQUE), parallel to connector/tool injection. The injection FK is `users.id` because `team_members` is **one row per team** under U1 (schema.ts:97-99) with no per-agent identity, and the runtime agent identity is `users.id` — `sessions.agentId → users.id` (schema.ts:252-254) — which AO2's Phase-4.5 materialization joins against (`sessions.agentId → filesystem_injections.agent_user_id → filesystems`). The candidate `agent_member_id → team_members.id` is dropped entirely. **This supersedes the prior single-FK ownership critique resolution** (which proposed `agent_user_id` directly on `filesystems`): `users.id` is now the **injection FK**, and the team-shared-via-null branch is gone (a filesystem reaches a bot only via an explicit injection). Matches `canonical-shapes.md §Filesystem` + `§FilesystemInjection` and `filesystem-primitive.md` (all corrected). **Closed; not a concept re-open.**

2. **v1 reachability is structural, not a live forge round-trip.** A `code`+`git` filesystem shows `needs_attention` when its Connection doesn't resolve, **not** when the remote is genuinely unreachable/the branch is gone. Live `git ls-remote` needs the sandbox creds (AO2). Is structural reachability sufficient for AO1's AC5, or does the founder expect a live check at attach-time? My read: structural is correct for AO1 (AO1 must not hold forge creds — hard rule 1); the live check is an AO2/runtime concern.

3. **`doc_set` folder source for v1.** The concept names Obsidian/markdown folders; with AN's connection table reverted (0038) there's no Drive/Obsidian *connection* yet. v1 `doc_set` is realistically a **bare local folder** (`connection_id` null, `source:'local'`, `writeback:'file'`). A connection-backed `doc_set` is modeled (the seam supports it) but unexercised until a folder-providing Connection exists. Acceptable for "prove generality without a sync engine" (AO1 AC3 / validation scenario 2)? My read: yes — the AC only requires the *kind is recorded*, which a local folder satisfies.

7. **`source` derivation with no real resolver (v1).** With the `NoopAuthResolver` default (`sourceOf` → null), a connection-backed register can only derive `source:'unknown'` until AN lands; bare-local registers correctly get `'local'`. AO1 tests inject a fake resolver returning `'github'` to exercise the derived-source path. Confirm `'unknown'` (vs blocking the register) is the right default — my read: surface, never block (consistent with the `needs_attention` posture).

8. **Team-consistency on inject is a route check, not a DB constraint.** The inject handler resolves the bot's team (`users.teamId → team_members → teams`) and rejects a mismatch with `filesystems.team_id` (400). There's no cross-table CHECK enforcing it at the DB. Confirm a route-level guard is sufficient for AO1 (my read: yes — single-founder, anti-enterprise; a DB-level guarantee is over-engineering here).

4. **`connection_id` is a non-FK text column** (AN's `service_connections` reverted in 0038; absent now, re-merged shape unsettled). When AN re-merges it can add the constraint in its own forward migration. Until then an orphan `connection_id` is possible — but that's exactly the `needs_attention` path (AC5), so the integrity gap is surfaced, not silent. Confirm this decoupling is preferred over blocking AO1 on AN.

5. **Name collision `Filesystem` (wire) vs `FilesystemRow` (DB).** I split them (wire = parsed `resourceRef`, row = JSON string), mirroring `Artifact`/`ArtifactRow`. Reviewer: confirm the split is clearer than a single type with a `string` resourceRef.

6. **AO2 inbound-git: extend `GitRunner` vs sibling.** I recommend **extend** (reuse the security-critical `buildGitEnv`/redaction). The catch: the current env fails-closed on auth (`GIT_ASKPASS=/bin/false`), so an authenticated inbound clone needs the `FilesystemAuth.provision` directive wired in — AO2's job, but flagging now so AO2 doesn't rebuild the runner. Not an AO1 deliverable; recorded for seam coherence.

---
---

# Reachability rework (v2) — REAL system verification

> **Why this section exists.** The v1 reachability path above shipped a `NoopAuthResolver` that returns `null`/`false` for **every** connection, so every connection-backed filesystem permanently reads `needs_attention` — it verifies **nothing**. The founder REJECTED it: *"a stub is worthless against an integration unless the actual integration was used to generate it; building from memory is worse than not building."* This section re-architects the verification path **grounded in the real integration**, with every claim verified against real code (file:line) or a real command (output cited). It **supersedes** §3 (reachability block + §3 `source` derivation) and §4 (seam wiring); the registry/injection model, tables (§2), routes shape (§3 route table), and AO2 seam (§5) stand AS-IS — this rework is the **verification path only**.

## v2·0 — Stale-premise correction (the root cause of the bad stub)

The v1 plan's load-bearing premise — *"`service_connections` was merged (0036) then reverted (0038, AN reset); absent now; therefore ship a Noop"* — is **FALSE on this branch**. Verified against the real worktree (`AO0`, 2026-06-27):

| v1 claim | Real state (verified) |
|---|---|
| `service_connections` table absent (reverted 0038) | **PRESENT** — `serviceConnections` pgTable at `packages/db/src/schema.ts:1278-1309` (id, userId→users.id, service, authSource `"token"\|"mcp"`, encryptedToken AES-256-GCM, serverUrl, health, …). |
| `ServiceConnectionResolver` absent | **PRESENT** — `packages/server/src/services/service-connection-resolver.ts:21-59`. Real signature `resolve(userId: string, connectionId: string): Promise<string \| null>`. |
| no real decrypt path | **PRESENT + tested** — `AN1-service-connection-resolver.integration.test.ts` proves real PGlite decrypt: owner→exact plaintext, cross-user→null, mcp→null, absent→null, tampered→null (never throws), with documented sanity-breaks. |
| migrations tail = 0038 | Real tail = **0040** (`drizzle/` lists through `0040_chubby_chimera.sql`; AO1's own `filesystems`+`filesystem_injections` already shipped at 0039/0040). |

**Conclusion:** AN1 is real and merged on this branch. The Noop was built against a memory of a revert that did not hold here. The rework wires the **real `ServiceConnectionResolver`**.

## v2·1 — Real AN-resolver signature (verified)

`service-connection-resolver.ts:39-58`:
```
async resolve(userId: string, connectionId: string): Promise<string | null>
```
Returns the **decrypted plaintext token** for the **owning user only**; `null` for: missing server secret (`:40`), cross-user / non-existent row (`:46` `and(eq(id), eq(userId))` → `:49`), `authSource !== "token"` i.e. **mcp** rows (`:51`), and decryption failure (`:54` catch → never throws). Connection **kinds**: `"token"` (held, decryptable here) and `"mcp"` (no stored token → `null`). "Inherited" connections are **never DB rows** (`service-connection-projection.ts:7` `@lore` — pure in-memory projection), so they have no `connectionId` to resolve and are out of the `code`-filesystem path entirely.

**Decisive consequence:** the resolver needs a **`userId`**. The filesystems route has one — the same `c.get("userId")` the connections route uses (`connections.ts:187,214,320`; set by `middleware/auth.ts:115/204/235`, founder fallback `"u-founder"`). So the AO1 register/inspect handlers obtain `userId` identically and pass it to the resolver. This is a real, available handle — **not** an invented one.

## v2·2 — Real `git ls-remote` auth mechanism (verified by command)

The reachability probe for a `code` + connection filesystem is a **metadata-only `git ls-remote`** (NOT a clone). Exit-code semantics, verified with `set -o pipefail`:

| Command (real) | exit | meaning |
|---|---|---|
| `git ls-remote --heads https://github.com/octocat/Hello-World.git` | **0** | reachable |
| `git ls-remote --heads https://github.com/octocat/this-repo-does-not-exist-zzz.git` | **128** | needs_attention (`fatal: repository not found`) |
| same public probe under hardened env (`env -i PATH HOME GIT_TERMINAL_PROMPT=0 GIT_ASKPASS=/bin/false GIT_CONFIG_NOSYSTEM=1 GIT_OPTIONAL_LOCKS=0`) | **0** | the existing `buildGitEnv()` flags do **not** break a public probe |
| private/auth-required URL with no creds (hardened env) | **128** | needs_attention |
| **bad/malformed** token via header | **128** | GitHub rejects a malformed `Authorization` even on a public repo — a bad token reads `needs_attention`, correct |

`git version 2.39.5`. **Rule:** `exitCode === 0 → reachable`; **any** non-zero → `needs_attention` (with the stderr tail, redacted, as the reason).

**Authenticated injection — token NEVER in the URL or argv.** Reuse the codebase's existing git-auth hardening (`git-export-runner.ts:99-124 buildGitEnv` + `:67-82 redactArg`). Do **not** put the token in the clone URL (it would be logged) and do **not** put it in `-c http.extraHeader=…` (visible in `ps`/argv). Use **`GIT_CONFIG_COUNT` / `GIT_CONFIG_KEY_n` / `GIT_CONFIG_VALUE_n` env injection** — the token lives only in the child env, never in argv. Verified the mechanism parses and does not break a clean probe:
```
env -i PATH HOME GIT_TERMINAL_PROMPT=0 GIT_ASKPASS=/bin/false \
  GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0="user.name" GIT_CONFIG_VALUE_0="probe" \
  git ls-remote --heads https://github.com/octocat/Hello-World.git  → exit 0
```
For a real GitHub token the injected config is a **host-scoped** auth header so the token is only sent to that host:
```
GIT_CONFIG_COUNT=1
GIT_CONFIG_KEY_0   = "http.https://github.com/.extraHeader"
GIT_CONFIG_VALUE_0 = "Authorization: Basic base64('x-access-token:<TOKEN>')"
```
⚠️ **UNVERIFIED (no real private repo + token in this env):** that a *valid* GitHub token yields exit 0 against a *private* repo. The **mechanism** (env-config parse, host-scoping, token-out-of-argv) is verified; the live valid-token→0 assertion is the **local-only lane** (v2·5). `redactArg` already scrubs `gh[pousr]_…` token shapes from any logged stderr — reuse verbatim.

## v2·3 — Per-kind probe matrix (grounded)

`resolveFilesystemState(row, deps)` becomes async and dispatches to a real probe per case. Two probes behind the existing seam:

| Case | Condition (on the row) | Probe | reachable when | needs_attention when |
|---|---|---|---|---|
| read-only ref | `writeback === 'none'` | none | always | — |
| bare local `code` / `doc_set` | `connectionId == null` **and** `resourceRef` path is local | **`LocalReachabilityProbe`** — `fs.accessSync(path, R_OK)` (real) | path exists + readable | `accessSync` throws (ENOENT/EACCES) |
| `code` + connection | `kind==='code'`, `connectionId != null` | **`GitReachabilityProbe`** — resolve token via `ServiceConnectionResolver.resolve(userId, connectionId)` → `git lsRemote(url, token?)` | `ls-remote` exit 0 | resolver→null (no/invalid connection) **or** `ls-remote` exit ≠ 0 |
| `code` bare repo, local path | `kind==='code'`, `connectionId==null`, `resourceRef.repo` is a local path | `LocalReachabilityProbe` (fs access on the repo dir) | dir exists + readable | missing/unreadable |
| `doc_set` + connection (Drive/Obsidian) | `kind==='doc_set'`, `connectionId != null` | **DEFERRED — no connector exists** | — | — |

> **`code` resourceRef.repo disambiguation:** `repo` may be `"owner/name"` / a clone URL (remote) **or** an absolute local path (bare local repo). The probe treats a value matching `^[a-z]+://` or `^[^/]+/[^/]+$` (owner/repo) as **remote** (→ `ls-remote`, prefixed to `https://github.com/<owner>/<repo>.git` when it's the `owner/repo` short form), and an absolute path (`^/`) as **local** (→ fs access). This is a real, testable branch — not a guess.

> **Drive / Obsidian are honestly DEFERRED, not stubbed.** AN1 ships only **token** + **mcp** connections (`schema.ts:1289`); there is **no GDrive or Obsidian connector** yet — nothing to probe against. A `doc_set` + `connectionId` whose connection isn't resolvable correctly reads `needs_attention` via the same resolver-null path (it's a token connection that doesn't grant folder access), but a **first-class Drive/Obsidian reachability probe is out of scope until the connector exists**. We do **not** fabricate a GDrive probe from memory. The realistic v1 `doc_set` is a **bare local folder** (`connectionId==null` → `LocalReachabilityProbe`), which IS exercised.

## v2·4 — What the rework removes / adds

**REMOVE** `NoopAuthResolver` as the default binding. (`filesystem-reachability.ts:17-29`.) It may survive **only** as an explicit test double named for what it is (e.g. `UnresolvableAuthResolver` in a unit test asserting the needs_attention branch) — never as the production default.

**WIRE the real `ServiceConnectionResolver`** as the default. The `FilesystemAuthResolver` seam (shared `filesystem.ts:77-86`) is retained as the boundary, but its production implementation now **adapts the real resolver**:

```
// packages/server/src/services/service-connection-auth-resolver.ts (NEW)
class ServiceConnectionAuthResolver implements FilesystemAuthResolver {
  constructor(private resolver: ServiceConnectionResolver, private userId: string) {}
  // canResolve: a token resolves (non-null) → true. Cheap: one indexed userId-scoped SELECT + decrypt.
  async canResolve(connectionId: string): Promise<boolean> {
    return (await this.resolver.resolve(this.userId, connectionId)) != null;
  }
  // sourceOf: read service_connections.service for this (userId, connectionId) → map to a source token
  //   ('GitHub'→'github', …). Returns null when absent. (Real SELECT on serviceConnections.service.)
  // resolve(): yields FilesystemAuth.provision = { mode:'git-credential' } carrying the token to AO2.
}
```
> **Note the `userId` binding.** The `FilesystemAuthResolver` interface as written (`resolve(connectionId)`) has no `userId` — but the real resolver requires one. The adapter **closes over the request `userId`** (`c.get("userId")`), so it is constructed **per-request** inside the route handler, not as a process singleton. The seam interface is unchanged (AO2 still consumes `resolve(connectionId)`); only the construction site changes. This is the minimal real wiring — no interface churn.

**ADD an inbound `lsRemote` verb to `GitRunner`** (`git-export-runner.ts`), the lightweight inbound op the export-only runner lacks (`GitRunner` today is `init/add/rm/commit/push/diffCached/revParse/configSet/remoteAdd/lsFiles/statusPorcelain` — `:18-41`, **no ls-remote**):
```
/** Probe a remote's refs WITHOUT cloning. Reuses buildGitEnv + redaction.
 *  Returns { reachable: boolean; reason?: string }. Never throws on a non-zero exit
 *  (unlike runExpectOk) — a non-zero exit IS the signal, not an error. */
lsRemote(url: string, opts?: { tokenConfig?: GitConfigInjection }): Promise<{ reachable: boolean; reason?: string }>;
```
- Argv: `["ls-remote", "--heads", "--", url]` (the `--` guard already used at `:210,236,258,261`).
- Auth: when `opts.tokenConfig` present, merge `GIT_CONFIG_COUNT/KEY_n/VALUE_n` into the spawn env (extend `buildGitEnv` to accept extra config). Token **only** in env, never argv, never URL.
- Result mapping: `exitCode === 0 → { reachable: true }`; else `{ reachable: false, reason: redactArg(stderr.trim()) }`. This is a **read** of the existing `SpawnResult`, not new spawn code.
- Network/timeout: reuse the push timeout class (`pushMs`, 30s default — a remote round-trip), not the local 5s. `GitReachabilityProbe` lives in `filesystem-reachability.ts` and calls `createGitRunner(<scratch-cwd>).lsRemote(...)`.

**KEEP** the `FilesystemAuthResolver` / reachability seam, the `resolveFilesystemState` entry point (now genuinely probing), the routes, tables, and AO2 mount seam exactly as shipped.

## v2·5 — `resolveFilesystemState` v2 (the real decision)

```
resolveFilesystemState(row, { authResolver, localProbe, gitProbe, userId }):
  if row.writeback === 'none'                     → 'reachable'
  ref = JSON.parse(row.resourceRef)
  if row.connectionId == null:
     // bare local: real fs probe on the path/repo dir
     path = ref.kind === 'doc_set' ? ref.folder : ref.repo
     if isLocalPath(path):  return localProbe.check(path) ? 'reachable' : 'needs_attention'
     // connectionId==null but a remote URL (public repo, no auth) → unauthenticated ls-remote
     return (await gitProbe.check(ref.repo, /*token*/ null)).reachable ? 'reachable' : 'needs_attention'
  // connection-backed:
  if row.kind === 'doc_set':  return 'needs_attention'   // no Drive/Obsidian connector yet (DEFERRED, honest)
  // code + connection: resolve the real token, then real ls-remote
  token = await authResolver.resolveToken(row.connectionId)   // → ServiceConnectionResolver.resolve(userId, id)
  if token == null:  return 'needs_attention'                 // no/invalid/cross-user/mcp connection
  return (await gitProbe.check(ref.repo, token)).reachable ? 'reachable' : 'needs_attention'
```
Every `needs_attention` carries a reason (the stderr tail or `"connection unresolved"`), surfaced on the row — never a blanket stub. **When it runs:** at register (POST) `state` is set from a **real** probe (not hardcoded `attached`); `GET /:id` and the list route re-probe and persist transitions (the existing `checkAndPersistState` at `filesystems.ts:89-100`, now backed by real probes) — so a transient network failure recovers on the next inspect/refresh. An explicit `POST /:id/refresh` is **optional** (GET already re-probes); add it only if the UI wants a non-mutating-looking refresh button — no AC mandates it.

> **Cost note (real):** `ls-remote` is a network round-trip (~100–800ms to GitHub). Running it on **every** list-route row (`filesystems.ts:200 Promise.all`) makes a team-list latency-bound on the forge. v2 keeps the live probe on **`GET /:id`** (single, intentional inspect) and on **register**, but the **list** route should use the **persisted `state`** (last probe result) and NOT re-probe every row inline — re-probe the list lazily/bounded or behind the explicit refresh. (This is a real perf constraint the Noop never surfaced because `canResolve` was a no-op.) Flag for the reviewer: confirm list = cached state, inspect = live probe.

## v2·6 — MANDATORY live-proof lanes (the whole point)

A test lane that exercises the **REAL** `git`/`fs` — not a mock. Split by what CI can run unattended vs what needs a real secret.

**Lane A — CI-LIVE (`*.integration.test.ts`, runs in `test:all`; real `git` + real `fs`, no secret):**
| Assertion | Real op | Expect |
|---|---|---|
| public repo reachable | `gitProbe.check("https://github.com/octocat/Hello-World.git", null)` | `reachable:true` (real exit 0) |
| bogus repo needs_attention | `gitProbe.check("https://github.com/octocat/this-repo-does-not-exist-zzz.git", null)` | `reachable:false`, reason set (real exit 128) |
| register a public-repo `code` filesystem (connectionId null, remote URL) → `POST /api/filesystems` then `GET /:id` | real route + real `git` | `state:'reachable'` |
| register a bogus-repo filesystem → `GET /:id` | real route + real `git` | `state:'needs_attention'` |
| real local temp folder reachable | `localProbe.check(mkdtempSync())` then register a bare-local `doc_set` → `GET /:id` | `reachable:true` → `state:'reachable'` |
| missing path needs_attention | `localProbe.check("/no/such/path-zzz")` then register → `GET /:id` | `reachable:false` → `state:'needs_attention'` |

> Lane A hits the **public internet** (github.com). Per the repo's testing rules, network-dependent live lanes run in the **local `test:all` lane**, not as a GitHub Actions job (same posture as e2e/harness lanes — MEMORY "e2e is local-only"). It is real, not mocked; mark it `@network` so it can be excluded in an offline CI but is **required green locally before ship**. ⚠️ If the reviewer wants Lane A fully hermetic, the public-repo probe can target a `file://` local git repo created in the test (`git init` a temp dir, `ls-remote file://…` → exit 0) — that removes the internet dependency while keeping the probe REAL. **Recommend the `file://` variant** for the in-test public-reachable case so Lane A is hermetic + real; keep one `github.com` smoke as a documented local-only check.

**Lane B — LOCAL-ONLY live-proof (authenticated PRIVATE repo; needs a real token):**
| Assertion | Real op | Expect |
|---|---|---|
| seed a real `service_connections` token row (real GitHub PAT) → register a PRIVATE-repo `code` filesystem with that `connectionId` → `GET /:id` | real `ServiceConnectionResolver.resolve` decrypt → real authed `git ls-remote` via `GIT_CONFIG_*` env | `state:'reachable'` |
| same private repo, **revoked/garbage** token row → `GET /:id` | real resolve → real authed `ls-remote` exit 128 | `state:'needs_attention'` |
| cross-user connection (token owned by another userId) → `GET /:id` | real resolver returns null (AN1 AC5) | `state:'needs_attention'` |

> Lane B **cannot run in CI** — no real GitHub PAT + private repo in the unattended env. It is a **local-only live-proof lane** run by a human/agent with a real connection seeded (env `HYPERIDLE_AO1_LIVE_PRIVATE_REPO` + `…_TOKEN`); the test **skips with a loud message** when those are absent, and the WP is **not "done" on the private-auth path until Lane B has been run once locally and its output pasted into the PR**. We do **NOT** fake it with a mock resolver — a mock would reproduce exactly the worthless-stub failure the founder rejected. (Per MEMORY "live-proof lanes run before ship": the real authed path must actually execute before the authed-reachability AC is claimed.)

**Reviewer sanity-break (required):** revert the `ls-remote` exit-code mapping (force `reachable:true`) → Lane A's bogus-repo assertion must go RED; restore → GREEN. This proves Lane A exercises the real exit code, not a constant — the exact check that would have caught the Noop.

## v2·7 — Honestly deferred / unverified

- **Drive / Obsidian reachability** — DEFERRED. No GDrive/Obsidian connector exists (AN1 = token+mcp only, `schema.ts:1289`). A connection-backed `doc_set` reads `needs_attention` via the resolver-null path; a dedicated folder-reachability probe waits for the connector. **Not stubbed, not faked.**
- **Valid-token → private-repo exit 0** — ⚠️ UNVERIFIED in this env (no real PAT/private repo). The injection **mechanism** is verified (v2·2); the live valid-token assertion is **Lane B (local-only)**.
- **List-route probe cost** — flagged real perf constraint (v2·5); reviewer to confirm cached-state-on-list vs live-probe-on-inspect.
- **`FilesystemAuthResolver` interface vs `userId`** — the adapter closes over the request `userId` (per-request construction). If a future caller needs the resolver outside a request, the interface must carry `userId` explicitly — recorded, not solved here.
