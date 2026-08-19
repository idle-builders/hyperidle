# Delete bundle 1 — fw-db

48 convicted rows across 1 package(s).

| # | Package | Symbol | Reach | Why convicted |
|---|---|---|---|---|
| 1 | fw-db | `resolvePgPoolSize` | INTERNAL (createPgDb only) | Sole caller is createPgDb, which merges away. |
| 2 | fw-db | `PgDbOptions` | DEAD outside createPgDb | Dies with createPgDb. |
| 3 | fw-db | `PgDbHandle` | DEAD outside createPgDb | Dies with createPgDb; .poolSize has zero readers. |
| 4 | fw-db | `KnowledgeAppProjectionRow` | DEAD | Zero imports anywhere. |
| 5 | fw-db | `NewKnowledgeAppProjectionRow` | DEAD | Zero imports anywhere. |
| 6 | fw-db | `TaskPlanningSignalRow` | DEAD | Zero imports anywhere. |
| 7 | fw-db | `NewTaskPlanningSignalRow` | DEAD | Zero imports anywhere. |
| 8 | fw-db | `FilesystemInjectionRow` | DEAD | Zero imports anywhere. |
| 9 | fw-db | `FilesystemCaptureRow` | TEST-ONLY | Dies with the filesystemCaptures table. |
| 10 | fw-db | `NewFilesystemCaptureRow` | DEAD | Dies with the filesystemCaptures table. |
| 11 | fw-db | `NewTeam` | DEAD | Zero imports; inserts use literal objects. |
| 12 | fw-db | `AgentRunConfigRow` | DEAD (1 dev ref) | Zero production imports. |
| 13 | fw-db | `TeamRunConfigDefaultsRow` | DEAD | Zero imports anywhere. |
| 14 | fw-db | `NewTeamRunConfigDefaultsRow` | DEAD | Zero imports anywhere. |
| 15 | fw-db | `NewTeamMember` | DEAD | Zero imports anywhere. |
| 16 | fw-db | `NewSession` | DEAD | Zero imports anywhere. |
| 17 | fw-db | `NewAgentSessionRequest` | DEAD | Zero imports anywhere. |
| 18 | fw-db | `NewAgentWorkIntent` | DEAD | Zero imports anywhere; already barrel-internal. |
| 19 | fw-db | `TriggerResolutionHistoryRow` | DEAD | Dies with the dead table. |
| 20 | fw-db | `NewTriggerResolutionHistoryRow` | DEAD | Dies with the dead table. |
| 21 | fw-db | `RoutineRun` | DEAD | Zero imports; prod matches are other symbols. |
| 22 | fw-db | `OrgEdge` | DEAD | Zero imports; org-routing selects columns, never the type. |
| 23 | fw-db | `NewOrgEdge` | DEAD (1 dev ref) | Zero production imports. |
| 24 | fw-db | `NewKnowledgeItem` | DEAD | Zero imports anywhere. |
| 25 | fw-db | `KnowledgeEditLogEntry` | DEAD | Zero imports; callers use $inferInsert inline. |
| 26 | fw-db | `NewKnowledgeEditLogEntry` | DEAD | Zero imports anywhere. |
| 27 | fw-db | `KnowledgeAccessLogEntry` | DEAD | Zero imports anywhere (table stays — type dies). |
| 28 | fw-db | `NewKnowledgeAccessLogEntry` | DEAD | Zero imports anywhere. |
| 29 | fw-db | `KnowledgeConflict` | DEAD | Zero imports anywhere (table stays — type dies). |
| 30 | fw-db | `NewKnowledgeConflict` | DEAD | Zero imports anywhere. |
| 31 | fw-db | `NewArtifactRow` | DEAD | Zero imports anywhere. |
| 32 | fw-db | `PropagationLogRow` | DEAD | Zero imports anywhere (table stays — type dies). |
| 33 | fw-db | `NewServerCredential` | DEAD | Zero imports anywhere. |
| 34 | fw-db | `ServerConfigRow` | DEAD | Zero imports; settings svc selects columns. |
| 35 | fw-db | `NewServerConfigRow` | DEAD | Zero imports anywhere. |
| 36 | fw-db | `NewPluginRow` | DEAD | Zero imports anywhere. |
| 37 | fw-db | `NewPluginConfigurationDefaultRow` | DEAD | Zero imports anywhere. |
| 38 | fw-db | `HintProgressRow` | DEAD | Zero imports anywhere (table stays — type dies). |
| 39 | fw-db | `NewHintProgressRow` | DEAD | Zero imports anywhere. |
| 40 | fw-db | `NewOperationOutcome` | DEAD | Zero imports anywhere. |
| 41 | fw-db | `TaskDispatchAttempt` | DEAD | Zero imports anywhere (table stays — type dies). |
| 42 | fw-db | `NewTaskDispatchAttempt` | DEAD | Zero imports anywhere. |
| 43 | fw-db | `AgentLifecycleInboxRow` | DEAD | Zero imports anywhere (table stays — type dies). |
| 44 | fw-db | `NewAgentLifecycleInboxRow` | DEAD | Zero imports anywhere. |
| 45 | fw-db | `triggerResolutionHistory` | table · DEAD | No INSERT exists anywhere; sole UPDATE (service.ts:571) matches zero rows forever; no SELECT. Drop table + migration. |
| 46 | fw-db | `filesystemCaptures` | table · write-only (mounter-registry:339); reads TEST-ONLY | Audit trail no production code reads. Drop table + insert + provenance test + migration. |
| 47 | fw-db | `47–63` | selectTeamSchema … selectArtifactSchema (17 selects) · const · DEAD — subpath has zero importers | One declaration family, one fate: nothing imports @hyperidle/db/zod-schemas in any world. Delete the file. |
| 48 | fw-db | `64–74` | insertTeamSchema … insertArtifactSchema (11 inserts) · const · DEAD — same file | Same family, same fate. Kills drizzle-zod + zod deps with it. |
