# db — destroyer verdict (framework)

## Where does this package go?

**Verdict: STAYS SHARED** — but it sheds 47% of its export surface, one whole file, two dead tables, one duplicate connection factory, and two npm dependencies.

This is the one framework package that genuinely earns shared existence. The founder's dissolve question — move each table's schema into its owning service, leaving `db` as just the connection — was tested against the actual tooling and the actual schema, not assumed:

1. **Codegen does NOT force centrality.** `drizzle-kit` accepts `schema?: string | string[]` with glob support (verified in `node_modules/drizzle-kit/index.d.mts:119`; the current `framework/db/drizzle.config.ts` points at the single `./src/schema.ts` by choice, not necessity). So "the migration tooling requires a central barrel" is false at the generator level.
2. **The FK graph DOES force centrality.** `framework/db/src/schema.ts` contains **64 cross-table `references()`** — nearly every table FKs into `users`, `teams`, `sessions`, `tasks`, `threads`, which are owned by five different services. Per-service schema fragments must import each other's `pgTable` objects to declare those FKs → service→service import edges, which the zero-exception ownership ACL forbids. The alternative — dropping `references()` — trades package tidiness for losing DB-level referential integrity. Bad trade.
3. **The connection needs the merged schema anyway.** `drizzle(client, { schema })` and `HyperIdleDb = PgDatabase<PgQueryResultHKT, typeof schema>` (used in **137 production files**) both require the merged schema object/type. Split the fragments and a central barrel that imports all of them reappears immediately under another name.
4. **The migration journal is one linear sequence** (`framework/db/drizzle/`, 57 files, one `_journal.json`) shared by three appliers: desktop bundle (`applications/desktop/src/migrate.ts`), setup CLI, and the cloud runner (`migrate-pg.ts`). Central regardless of where table defs live.
5. **The dissolve buys zero enforcement.** Table ACL is already lint-enforced per consumer (`tools/governance/table-owners.json` — all 44 tables owned, all rules at error since AU30). Moving schema into services would add package-boundary enforcement the lint already provides.

Also checked: **zero** production `db.query.*` relational-API usage — every caller uses `select().from(table)` — so the typed-schema coupling is shallower than it looks, but the FK graph and the connection type still decide it.

## Consumers (measured, not assumed)

`rg -a -l "@hyperidle/db"` → ~60 production files across every layer. Grouped:

| Consumer | What it imports | Could it own this? |
|---|---|---|
| `applications/desktop` | `createPgliteDb`, `createPostgresDb`, `DbHandle`, `HyperIdleDb`, `applyMigrations`, `isDowngrade` | No — one of two apps |
| `applications/remote-server` | `createPgliteDb`, `createPostgresDb`, `DbHandle`, `HyperIdleDb` | No — the other app |
| ~14 `layers/core-api/*` services | `HyperIdleDb`, `WriteExecutor`, each its owned tables + row types | No — each owns a slice, none owns the substrate |
| ~7 `layers/agent-orchestration/*` services | same pattern | No |
| `framework/{factory-defaults, harness-protocol, http-middleware, tool-protocol, work-intent-port}` | row types (`Team`, `User`, `AgentRunConfigRow`, …) | No — type consumers |
| `tools/setup`, `tools/eval` | connection factories, `applyMigrations`, tables for seeding | No — dev world |

Genuinely 2+ independent consumers for every surviving surface class. STAYS SHARED is earned, not defaulted.

## If written today, from scratch

- `connection.ts`: `HyperIdleDb`, `DbHandle`, `createPgliteDb`, `createPostgresDb` (one Postgres factory, not two), pool-size helpers module-private.
- `migrate.ts`: `applyMigrations`, `isDowngrade`, `MigrationResult`.
- `pg-ssl.ts`: unchanged, internal.
- `schema.ts`: 42 tables (not 44), row-type aliases **only where a consumer imports one** — 41 of the current 87, not a reflexive `Row`/`New*` pair per table.
- `write-executor.ts`: `WriteExecutor`.
- **No `zod-schemas.ts` at all.** No `drizzle-zod`, no `zod` dependency.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 79 |
| MERGE | 1 |
| SIMPLIFY | 3 |
| KEEP | 94 |

Surface: 177 exports → 94 exports (**47% cut**)

## Feature-level kills

1. **`triggerResolutionHistory` — a table with no writer.** Zero `insert` anywhere in the repo (prod, tools, tests — confirmed by `rg -a` on both camelCase and `trigger_resolution_history`). The only production touch is `session-requests/src/service.ts:571`, an UPDATE that has matched zero rows since the insert path was removed; no SELECT exists. Both row types have zero references. DELETE: table, the no-op UPDATE, both types, `table-owners.json` row, plus a drop-table migration (precedent: `0056_drop_user_skills.sql`). Hole: none — the feature already doesn't exist.
2. **`filesystemCaptures` — write-only audit trail.** One production INSERT (`filesystem-mounting/src/mounter-registry.ts:339`), zero production reads; only `capture-provenance.integration.test.ts` reads it back. Capture *bundles* (the actual data) live outside this table — the row is provenance nobody surfaces. Classic audit-trail-nobody-reads. DELETE: table, insert, provenance test, both row types, drop migration. Hole: if a future UI wants a capture history list, rebuild the table then — the git bundles are unaffected.
3. **`zod-schemas.ts` — an entire generated file with zero importers.** The `./zod-schemas` subpath export has no importer in any world (only its own tests and a `zodModule` pointer in `tools/governance/architecture.json`). The premise — drizzle-zod schemas validating API edges — never materialized: routes hand-roll their wire schemas (`layers/core-api/src/schemas/bet.schema.ts` builds from `type Bet`, not from `selectBetSchema`). DELETE: all 28 consts, the file, the subpath export, its two test files, the governance `zodModule` config plus the crossing-detector code that reads it, and the `drizzle-zod` + `zod` dependencies of this package. Hole: none.
4. **`createPgDb` — the second way to open Postgres.** Differs from `createPostgresDb` only by exposing `.poolSize` "for health checks, tests" — zero consumers read `.poolSize` (confirmed repo-wide). Only callers are `tools/setup/{bootstrap-pg,seed-pg-cli}.ts`. MERGE: point both at `createPostgresDb`; delete `createPgDb`, `PgDbOptions`, `PgDbHandle`, `resolvePgPoolSize`. (`PG_POOL_SIZE` env handling survives inside `createPostgresDb` — `docker-compose.yml` and `docs/deployment/self-hosting.md` really use the variable.)
5. **46 row-type aliases generated for uniformity.** Every table got a `Row`/`New*` pair reflexively; 46 of them have zero importers in any world. Pure `$inferSelect`/`$inferInsert` one-liners — any future consumer recreates one in ten seconds.

Non-export hygiene noticed in passing: `framework/db/drizzle-sqlite-archive/` (388K of dead SQLite migrations, referenced only by audit prose) should go with this pass; `createPostgresDb:111`'s `?? DEFAULT_PG_POOL_SIZE` arm is unreachable (`parsePgPoolSize` never returns undefined).

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `parsePgPoolSize` | INTERNAL | SIMPLIFY | Only called inside connection.ts; unexport, module-private. |
| 2 | `resolvePgPoolSize` | INTERNAL (createPgDb only) | DELETE | Sole caller is `createPgDb`, which merges away. |
| 3 | `createPgliteDb` | BOOTSTRAP (desktop, remote-server, setup, eval) | KEEP | The laptop-profile DB — core to the product's local-first shape. |
| 4 | `createPostgresDb` | BOOTSTRAP (desktop, remote-server) | KEEP | The cloud-profile DB; becomes the only Postgres factory. |
| 5 | `createPgDb` | TOOLS-only (bootstrap-pg, seed-pg-cli) | MERGE | Duplicate of #4; its one differentiator (`.poolSize`) has zero readers. Fold callers onto `createPostgresDb`. |
| 6 | `applyMigrations` | BOOTSTRAP (desktop migrate, setup-cli, eval runner) | KEEP | The single shared migration path — the reason this package exists. |
| 7 | `isDowngrade` | BOOTSTRAP (desktop only) | KEEP | Prevents an older desktop build corrupting a newer data dir; shares `countAppliedMigrations` with #6 — moving it to desktop duplicates that. |
| 8 | `sanitizePostgresUrl` | INTERNAL (connection.ts, migrate-pg.ts) | KEEP | Real deploy-time fix (postgres-js forwards `sslrootcert` as a bogus GUC); not in the public barrel. |
| 9 | `resolvePostgresSsl` | INTERNAL (connection.ts, migrate-pg.ts) | KEEP | Implements sslmode semantics postgres-js lacks; earned from a real cluster deploy failure; not in the public barrel. |

## Types / DI ports

Evidence: per-symbol import counts across production (shipping roots, dev files excluded, `framework/db` excluded), tools, and dev/test worlds. "0 imports anywhere" was confirmed with `rg -a` word-boundary sweeps including the `schema.*` namespace path (zero namespace-based type access exists repo-wide).

| # | Declaration | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `HyperIdleDb` | 137 production files | KEEP | The DB type of the entire system. |
| 2 | `DbHandle` | BOOTSTRAP (desktop, remote-server) | KEEP | Lifecycle handle both apps hold. |
| 3 | `PgDbOptions` | DEAD outside createPgDb | DELETE | Dies with `createPgDb`. |
| 4 | `PgDbHandle` | DEAD outside createPgDb | DELETE | Dies with `createPgDb`; `.poolSize` has zero readers. |
| 5 | `MigrationResult` | BOOTSTRAP (return type of applyMigrations) | KEEP | Required explicit return type of a kept export. |
| 6 | `PostgresSslOption` | INTERNAL (pg-ssl.ts) | KEEP | Internal, not in barrel. |
| 7 | `KnowledgeAppProjectionRow` | DEAD | DELETE | Zero imports anywhere. |
| 8 | `NewKnowledgeAppProjectionRow` | DEAD | DELETE | Zero imports anywhere. |
| 9 | `TaskPlanningSignalRow` | DEAD | DELETE | Zero imports anywhere. |
| 10 | `NewTaskPlanningSignalRow` | DEAD | DELETE | Zero imports anywhere. |
| 11 | `FilesystemRow` | UI:/api/filesystems via filesystems svc | KEEP | Imported by 2 production files. |
| 12 | `NewFilesystem` | same | KEEP | Imported by filesystem-registry. |
| 13 | `FilesystemInjectionRow` | DEAD | DELETE | Zero imports anywhere. |
| 14 | `NewFilesystemInjection` | UI:/api/filesystems via filesystems svc | KEEP | Imported by filesystem-registry. |
| 15 | `FilesystemCaptureRow` | TEST-ONLY | DELETE | Dies with the `filesystemCaptures` table. |
| 16 | `NewFilesystemCaptureRow` | DEAD | DELETE | Dies with the `filesystemCaptures` table. |
| 17 | `Team` | UI:/api/teams via org svc + 5 more | KEEP | 6 importing production files. |
| 18 | `NewTeam` | DEAD | DELETE | Zero imports; inserts use literal objects. |
| 19 | `User` | UI:/api/users via users svc + 16 more | KEEP | 17 importing production files. |
| 20 | `NewUser` | UI:/api/users via users svc | KEEP | 3 importing production files. |
| 21 | `AgentRunConfigRow` | DEAD (1 dev ref) | DELETE | Zero production imports. |
| 22 | `NewAgentRunConfigRow` | UI:/api/agents via agent-run-config svc | KEEP | Imported by agent-run-config-store. |
| 23 | `TeamRunConfigDefaultsRow` | DEAD | DELETE | Zero imports anywhere. |
| 24 | `NewTeamRunConfigDefaultsRow` | DEAD | DELETE | Zero imports anywhere. |
| 25 | `TeamMember` | UI:/api/teams via org svc | KEEP | 4 importing production files. |
| 26 | `NewTeamMember` | DEAD | DELETE | Zero imports anywhere. |
| 27 | `Bet` | UI:/api/bets via work svc + 6 more | KEEP | 7 importing production files. |
| 28 | `NewBet` | UI:/api/bets via work svc | KEEP | 2 importing production files. |
| 29 | `Task` | UI:/api/tasks via work svc + 3 more | KEEP | 4 importing production files. |
| 30 | `NewTask` | UI:/api/tasks via work svc | KEEP | 3 importing production files. |
| 31 | `Session` | UI:/api/sessions via run-orchestration | KEEP | 2 importing production files. |
| 32 | `NewSession` | DEAD | DELETE | Zero imports anywhere. |
| 33 | `AgentSessionRequest` | AGENT: session-requests queue | KEEP | 5 importing production files. |
| 34 | `NewAgentSessionRequest` | DEAD | DELETE | Zero imports anywhere. |
| 35 | `AgentWorkIntent` | AGENT: intent queue via session-requests | KEEP | 2 importing production files. |
| 36 | `NewAgentWorkIntent` | DEAD | DELETE | Zero imports anywhere; already barrel-internal. |
| 37 | `ExplicitSessionStart` | AGENT: explicit-start pair | KEEP | 3 importing production files. |
| 38 | `TriggerResolutionHistoryRow` | DEAD | DELETE | Dies with the dead table. |
| 39 | `NewTriggerResolutionHistoryRow` | DEAD | DELETE | Dies with the dead table. |
| 40 | `Routine` | UI:/api/routines + SCHED:routine-scheduler | KEEP | 3 importing production files. |
| 41 | `NewRoutine` | same | KEEP | Imported by routine svc. |
| 42 | `RoutineRun` | DEAD | DELETE | Zero imports; prod matches are other symbols. |
| 43 | `NewRoutineRun` | SCHED:routine-scheduler | KEEP | Imported by routine svc. |
| 44 | `Thread` | UI:/api/threads via conversation svc | KEEP | 9 importing production files. |
| 45 | `NewThread` | same | KEEP | 4 importing production files. |
| 46 | `Message` | UI:/api/threads via conversation svc | KEEP | 21 importing production files. |
| 47 | `NewMessage` | same | KEEP | Imported by conversation-store. |
| 48 | `Item` | UI:/api/items via work svc | KEEP | 5 importing production files. |
| 49 | `NewItem` | same | KEEP | 5 importing production files. |
| 50 | `OrgEdge` | DEAD | DELETE | Zero imports; org-routing selects columns, never the type. |
| 51 | `NewOrgEdge` | DEAD (1 dev ref) | DELETE | Zero production imports. |
| 52 | `KnowledgeItem` | UI:/api/knowledge via knowledge svc | KEEP | 4 importing production files. |
| 53 | `NewKnowledgeItem` | DEAD | DELETE | Zero imports anywhere. |
| 54 | `KnowledgeEditLogEntry` | DEAD | DELETE | Zero imports; callers use `$inferInsert` inline. |
| 55 | `NewKnowledgeEditLogEntry` | DEAD | DELETE | Zero imports anywhere. |
| 56 | `KnowledgeAccessLogEntry` | DEAD | DELETE | Zero imports anywhere (table stays — type dies). |
| 57 | `NewKnowledgeAccessLogEntry` | DEAD | DELETE | Zero imports anywhere. |
| 58 | `KnowledgeConflict` | DEAD | DELETE | Zero imports anywhere (table stays — type dies). |
| 59 | `NewKnowledgeConflict` | DEAD | DELETE | Zero imports anywhere. |
| 60 | `NotificationQueueRow` | EVENT: notification dispatch | KEEP | Imported by notifications svc. |
| 61 | `NewNotificationQueueRow` | same | KEEP | 3 importing production files. |
| 62 | `ArtifactRow` | UI:/api/artifacts via work svc | KEEP | Imported by artifact-store. |
| 63 | `NewArtifactRow` | DEAD | DELETE | Zero imports anywhere. |
| 64 | `PropagationLogRow` | DEAD | DELETE | Zero imports anywhere (table stays — type dies). |
| 65 | `NewPropagationLogRow` | EVENT: lifecycle propagation via policy svc | KEEP | Imported by lifecycle-propagation. |
| 66 | `ServerCredential` | UI:/api/credentials via credentials svc | KEEP | 3 importing production files. |
| 67 | `NewServerCredential` | DEAD | DELETE | Zero imports anywhere. |
| 68 | `ServerConfigRow` | DEAD | DELETE | Zero imports; settings svc selects columns. |
| 69 | `NewServerConfigRow` | DEAD | DELETE | Zero imports anywhere. |
| 70 | `PluginRow` | UI:/api/settings via settings svc | KEEP | Imported by plugin-configuration. |
| 71 | `NewPluginRow` | DEAD | DELETE | Zero imports anywhere. |
| 72 | `PluginConfigurationDefaultRow` | same as 70 | KEEP | Imported by plugin-configuration. |
| 73 | `NewPluginConfigurationDefaultRow` | DEAD | DELETE | Zero imports anywhere. |
| 74 | `ConfigurationOverrideRow` | same as 70 | KEEP | Imported by plugin-configuration. |
| 75 | `NewConfigurationOverrideRow` | DEAD | DELETE | Zero imports anywhere. |
| 76 | `HintProgressRow` | DEAD | DELETE | Zero imports anywhere (table stays — type dies). |
| 77 | `NewHintProgressRow` | DEAD | DELETE | Zero imports anywhere. |
| 78 | `LoginSession` | UI:/api/auth via users svc | KEEP | Imported by login-session. |
| 79 | `NewLoginSession` | DEAD | DELETE | Zero imports anywhere. |
| 80 | `InviteCode` | UI:/api/auth via users svc | KEEP | Imported by invite-code. |
| 81 | `NewInviteCode` | DEAD | DELETE | Zero imports anywhere. |
| 82 | `ProposedCall` | AGENT: AL7 review flow via review svc | KEEP | Imported by proposed-call-workflow. |
| 83 | `NewProposedCall` | DEAD | DELETE | Zero imports anywhere. |
| 84 | `TailoredGrant` | same as 82 | KEEP | Imported by proposed-call-workflow. |
| 85 | `NewTailoredGrant` | DEAD | DELETE | Zero imports anywhere. |
| 86 | `OperationOutcome` | same as 82 | KEEP | Imported by proposed-call-workflow. |
| 87 | `NewOperationOutcome` | DEAD | DELETE | Zero imports anywhere. |
| 88 | `ServiceConnectionRow` | UI:/api/connections via connections svc | KEEP | 4 importing production files. |
| 89 | `NewServiceConnectionRow` | same | KEEP | Imported by service-connection-store. |
| 90 | `TaskDispatchAttempt` | DEAD | DELETE | Zero imports anywhere (table stays — type dies). |
| 91 | `NewTaskDispatchAttempt` | DEAD | DELETE | Zero imports anywhere. |
| 92 | `AgentLifecycleInboxRow` | DEAD | DELETE | Zero imports anywhere (table stays — type dies). |
| 93 | `NewAgentLifecycleInboxRow` | DEAD | DELETE | Zero imports anywhere. |
| 94 | `WriteExecutor` | 37 production files | KEEP | The tx-join union type every write-owning service signs with. |

## Const / enum audit

| # | Export | Kind | Reach | Verdict | Reason |
|---|---|---|---|---|---|
| 1 | `DEFAULT_PG_POOL_SIZE` | const | INTERNAL | SIMPLIFY | Unexport; only external ref is a governance attack fixture (dev). |
| 2 | `PG_POOL_SIZE_ENV` | const | INTERNAL | SIMPLIFY | Unexport; env var itself stays (docker-compose + self-hosting docs use it). |
| 3 | `teams` | table | UI via org svc | KEEP | Owned (org), read+written. |
| 4 | `teamRunConfigDefaults` | table | UI via agent-run-config svc | KEEP | Owned, read+written by team-run-config-defaults-store. |
| 5 | `users` | table | UI via users svc | KEEP | Owned, the identity table. |
| 6 | `agentRunConfig` | table | UI via agent-run-config svc | KEEP | Owned, read+written. |
| 7 | `teamMembers` | table | UI via org svc | KEEP | Owned, read+written. |
| 8 | `bets` | table | UI via work svc | KEEP | Owned — a core primitive. |
| 9 | `tasks` | table | UI via work svc | KEEP | Owned — a core primitive. |
| 10 | `sessions` | table | UI+AGENT via run-orchestration | KEEP | Owned — a core primitive. |
| 11 | `agentSessionRequests` | table | AGENT via session-requests | KEEP | Owned, the durable agent queue. |
| 12 | `agentWorkIntents` | table | AGENT via session-requests | KEEP | Owned, intent queue read+written. |
| 13 | `explicitSessionStarts` | table | AGENT via session-requests | KEEP | Owned, inserted (service.ts:1159) and re-checked at resolution. |
| 14 | `taskDispatchAttempts` | table | AGENT via work svc | KEEP | Owned, read+written by dispatch-attempt store. |
| 15 | `agentLifecycleInbox` | table | EVENT via session-requests | KEEP | Owned, claim/project loop reads and writes it. |
| 16 | `triggerResolutionHistory` | table | DEAD | DELETE | No INSERT exists anywhere; sole UPDATE (service.ts:571) matches zero rows forever; no SELECT. Drop table + migration. |
| 17 | `routines` | table | UI+SCHED via routine svc | KEEP | Owned — a core primitive. |
| 18 | `routineRuns` | table | SCHED via routine svc | KEEP | Owned, read+written. |
| 19 | `threads` | table | UI via conversation svc | KEEP | Owned — a core primitive. |
| 20 | `messages` | table | UI via conversation svc | KEEP | Owned — a core primitive. |
| 21 | `items` | table | UI via work svc | KEEP | Owned, read+written. |
| 22 | `orgEdges` | table | UI via org svc | KEEP | Owned, org-routing reads by mechanism. |
| 23 | `knowledgeItems` | table | UI+AGENT via knowledge svc | KEEP | Owned — a core primitive. |
| 24 | `knowledgeEditLog` | table | EVENT via knowledge svc | KEEP | Written AND read (relevance-service:95, attention-scoring:310) — feeds scoring, not a vanity trail. |
| 25 | `knowledgeAccessLog` | table | EVENT via knowledge svc | KEEP | Written AND read (accessCount30d relevance signals) — functional. |
| 26 | `knowledgeConflicts` | table | UI via knowledge svc | KEEP | Owned, open-conflict checks read it. |
| 27 | `knowledgeAppProjection` | table | UI via knowledge svc | KEEP | Owned, 4+ production read sites. |
| 28 | `taskPlanningSignals` | table | AGENT via work svc | KEEP | Owned, riskTier read drives trust gating. |
| 29 | `notificationQueue` | table | EVENT via notifications svc | KEEP | Owned, single repository reads+writes. |
| 30 | `propagationLog` | table | EVENT via policy svc | KEEP | Written and read back (lifecycle-propagation:622) for dedupe — functional, with its own reaper. |
| 31 | `artifacts` | table | UI via work svc | KEEP | Owned — a core primitive. |
| 32 | `filesystems` | table | UI via filesystems svc | KEEP | Owned, read+written. |
| 33 | `filesystemInjections` | table | UI via filesystems svc | KEEP | Owned, read+written+deleted. |
| 34 | `filesystemCaptures` | table | write-only (mounter-registry:339); reads TEST-ONLY | DELETE | Audit trail no production code reads. Drop table + insert + provenance test + migration. |
| 35 | `serverCredentials` | table | UI via credentials svc | KEEP | Owned, store + resolver read+write. |
| 36 | `serverConfig` | table | UI via settings svc | KEEP | Owned, read+written. |
| 37 | `plugins` | table | UI via settings svc | KEEP | Owned, insert/update/join in plugin-configuration. |
| 38 | `pluginConfigurationDefaults` | table | UI via settings svc | KEEP | Owned, read+written. |
| 39 | `configurationOverrides` | table | UI via settings svc | KEEP | Owned, read+written+upserted. |
| 40 | `hintProgress` | table | UI:/api/hints via users svc | KEEP | Owned, read+written. (Whether the hints *feature* earns its life is the users-service destroyer's call, not a schema call.) |
| 41 | `loginSessions` | table | UI:/api/auth via users svc | KEEP | Owned — auth is load-bearing. |
| 42 | `inviteCodes` | table | UI:/api/auth via users svc | KEEP | Owned — the only door into a team. |
| 43 | `proposedCalls` | table | AGENT: AL7 review via review svc | KEEP | Owned, read+written by proposed-call-workflow. |
| 44 | `tailoredGrants` | table | same | KEEP | Owned, joined in grant resolution. |
| 45 | `operationOutcomes` | table | same | KEEP | Owned, read (workflow:121) and written. |
| 46 | `serviceConnections` | table | UI:/api/connections via connections svc | KEEP | Owned, store + resolver read+write. |
| 47–63 | `selectTeamSchema` … `selectArtifactSchema` (17 selects) | const | DEAD — subpath has zero importers | DELETE | One declaration family, one fate: nothing imports `@hyperidle/db/zod-schemas` in any world. Delete the file. |
| 64–74 | `insertTeamSchema` … `insertArtifactSchema` (11 inserts) | const | DEAD — same file | DELETE | Same family, same fate. Kills `drizzle-zod` + `zod` deps with it. |

## Holes this leaves

- **Trigger-resolution provenance is unrecoverable.** If anyone ever wants "which trigger caused this session", the table that was meant to answer it never had a writer — dropping it just makes the truth visible. Rebuilding means schema + a real insert path.
- **Filesystem capture history has no DB record.** Git bundles still exist on disk; the mapping row (which session produced which capture) is gone. A future "capture history" surface rebuilds the table then.
- **No generated API validation layer.** Deleting zod-schemas closes the door on "drizzle-zod validates the wire for free." That door was never walked through — routes hand-roll wire schemas today and would keep doing so.
- **Tools lose `.poolSize` introspection they never used.** `bootstrap-pg`/`seed-pg-cli` switch to `createPostgresDb` with identical behavior.
- **Deleted row types must be recreated on demand** — each is one `typeof table.$inferSelect` line; cost is seconds, and it re-earns the export with an actual consumer.
- The governance `zodModule` crossing-detector config and its detector code lose their subject — that detector code dies too, or governance lint fails on a dangling path. The remover must sweep `tools/governance/architecture.json` and `crossing-detectors.ts` in the same change.
