# Delete batch — `fw-db`

53 convicted rows. Delete every one, or record it as a survivor with a reason.

| # | Symbol | Reach | Why it was convicted |
|---|---|---|---|
| 1 | `resolvePgPoolSize` | INTERNAL (createPgDb only) | Sole caller is createPgDb, which merges away. |
| 2 | `PgDbOptions` | DEAD outside createPgDb | Dies with createPgDb. |
| 3 | `PgDbHandle` | DEAD outside createPgDb | Dies with createPgDb; .poolSize has zero readers. |
| 4 | `KnowledgeAppProjectionRow` | DEAD | Zero imports anywhere. |
| 5 | `NewKnowledgeAppProjectionRow` | DEAD | Zero imports anywhere. |
| 6 | `TaskPlanningSignalRow` | DEAD | Zero imports anywhere. |
| 7 | `NewTaskPlanningSignalRow` | DEAD | Zero imports anywhere. |
| 8 | `FilesystemInjectionRow` | DEAD | Zero imports anywhere. |
| 9 | `FilesystemCaptureRow` | TEST-ONLY | Dies with the filesystemCaptures table. |
| 10 | `NewFilesystemCaptureRow` | DEAD | Dies with the filesystemCaptures table. |
| 11 | `NewTeam` | DEAD | Zero imports; inserts use literal objects. |
| 12 | `AgentRunConfigRow` | DEAD (1 dev ref) | Zero production imports. |
| 13 | `TeamRunConfigDefaultsRow` | DEAD | Zero imports anywhere. |
| 14 | `NewTeamRunConfigDefaultsRow` | DEAD | Zero imports anywhere. |
| 15 | `NewTeamMember` | DEAD | Zero imports anywhere. |
| 16 | `NewSession` | DEAD | Zero imports anywhere. |
| 17 | `NewAgentSessionRequest` | DEAD | Zero imports anywhere. |
| 18 | `NewAgentWorkIntent` | DEAD | Zero imports anywhere; already barrel-internal. |
| 19 | `TriggerResolutionHistoryRow` | DEAD | Dies with the dead table. |
| 20 | `NewTriggerResolutionHistoryRow` | DEAD | Dies with the dead table. |
| 21 | `RoutineRun` | DEAD | Zero imports; prod matches are other symbols. |
| 22 | `OrgEdge` | DEAD | Zero imports; org-routing selects columns, never the type. |
| 23 | `NewOrgEdge` | DEAD (1 dev ref) | Zero production imports. |
| 24 | `NewKnowledgeItem` | DEAD | Zero imports anywhere. |
| 25 | `KnowledgeEditLogEntry` | DEAD | Zero imports; callers use $inferInsert inline. |
| 26 | `NewKnowledgeEditLogEntry` | DEAD | Zero imports anywhere. |
| 27 | `KnowledgeAccessLogEntry` | DEAD | Zero imports anywhere (table stays — type dies). |
| 28 | `NewKnowledgeAccessLogEntry` | DEAD | Zero imports anywhere. |
| 29 | `KnowledgeConflict` | DEAD | Zero imports anywhere (table stays — type dies). |
| 30 | `NewKnowledgeConflict` | DEAD | Zero imports anywhere. |
| 31 | `NewArtifactRow` | DEAD | Zero imports anywhere. |
| 32 | `PropagationLogRow` | DEAD | Zero imports anywhere (table stays — type dies). |
| 33 | `NewServerCredential` | DEAD | Zero imports anywhere. |
| 34 | `ServerConfigRow` | DEAD | Zero imports; settings svc selects columns. |
| 35 | `NewServerConfigRow` | DEAD | Zero imports anywhere. |
| 36 | `NewPluginRow` | DEAD | Zero imports anywhere. |
| 37 | `NewPluginConfigurationDefaultRow` | DEAD | Zero imports anywhere. |
| 38 | `NewConfigurationOverrideRow` | DEAD | Zero imports anywhere. |
| 39 | `HintProgressRow` | DEAD | Zero imports anywhere (table stays — type dies). |
| 40 | `NewHintProgressRow` | DEAD | Zero imports anywhere. |
| 41 | `NewLoginSession` | DEAD | Zero imports anywhere. |
| 42 | `NewInviteCode` | DEAD | Zero imports anywhere. |
| 43 | `NewProposedCall` | DEAD | Zero imports anywhere. |
| 44 | `NewTailoredGrant` | DEAD | Zero imports anywhere. |
| 45 | `NewOperationOutcome` | DEAD | Zero imports anywhere. |
| 46 | `TaskDispatchAttempt` | DEAD | Zero imports anywhere (table stays — type dies). |
| 47 | `NewTaskDispatchAttempt` | DEAD | Zero imports anywhere. |
| 48 | `AgentLifecycleInboxRow` | DEAD | Zero imports anywhere (table stays — type dies). |
| 49 | `NewAgentLifecycleInboxRow` | DEAD | Zero imports anywhere. |
| 50 | `triggerResolutionHistory` | table · DEAD | No INSERT exists anywhere; sole UPDATE (service.ts:571) matches zero rows forever; no SELECT. Drop table + migration. |
| 51 | `filesystemCaptures` | table · write-only (mounter-registry:339); reads TEST-ONLY | Audit trail no production code reads. Drop table + insert + provenance test + migration. |
| 52 | `47–63` | selectTeamSchema … selectArtifactSchema (17 selects) · const · DEAD — subpath has zero importers | One declaration family, one fate: nothing imports @hyperidle/db/zod-schemas in any world. Delete the file. |
| 53 | `64–74` | insertTeamSchema … insertArtifactSchema (11 inserts) · const · DEAD — same file | Same family, same fate. Kills drizzle-zod + zod deps with it. |
