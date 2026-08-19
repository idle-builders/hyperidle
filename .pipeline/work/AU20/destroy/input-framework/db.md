# Destroyer input — `db` (framework)

Package: `framework/db`
Surface: 9 exported functions, 0 classes (0 member methods), 94 interface/type declarations, 74 const/enum exports.

## A. Exported functions — EVERY ONE NEEDS A VERDICT

| # | Method | Public | Location |
|---|---|---|---|
| 1 | `parsePgPoolSize` | yes | `framework/db/src/connection.ts:34` |
| 2 | `resolvePgPoolSize` | yes | `framework/db/src/connection.ts:47` |
| 3 | `createPgliteDb` | yes | `framework/db/src/connection.ts:71` |
| 4 | `createPostgresDb` | yes | `framework/db/src/connection.ts:106` |
| 5 | `createPgDb` | yes | `framework/db/src/connection.ts:130` |
| 6 | `applyMigrations` | yes | `framework/db/src/migrate.ts:52` |
| 7 | `isDowngrade` | yes | `framework/db/src/migrate.ts:88` |
| 8 | `sanitizePostgresUrl` | internal | `framework/db/src/pg-ssl.ts:31` |
| 9 | `resolvePostgresSsl` | internal | `framework/db/src/pg-ssl.ts:53` |

## C. Interface / type declarations — the DI-port surface

Verdict each DECLARATION (not every member individually) unless a member is independently interesting. A port member whose only implementation you are deleting dies with it — say so.

- `HyperIdleDb` (type, public) `framework/db/src/connection.ts:15`
- `DbHandle` (interface, public) `framework/db/src/connection.ts:18` — members: `db`, `close`
- `PgDbOptions` (interface, public) `framework/db/src/connection.ts:87` — members: `url`, `maxConnections`, `env`
- `PgDbHandle` (interface, public) `framework/db/src/connection.ts:97` — members: `poolSize`
- `MigrationResult` (interface, public) `framework/db/src/migrate.ts:18` — members: `applied`, `schemaVersion`
- `PostgresSslOption` (type, internal) `framework/db/src/pg-ssl.ts:16`
- `KnowledgeAppProjectionRow` (type, public) `framework/db/src/schema.ts:1044`
- `NewKnowledgeAppProjectionRow` (type, public) `framework/db/src/schema.ts:1045`
- `TaskPlanningSignalRow` (type, public) `framework/db/src/schema.ts:1046`
- `NewTaskPlanningSignalRow` (type, public) `framework/db/src/schema.ts:1047`
- `FilesystemRow` (type, public) `framework/db/src/schema.ts:1250`
- `NewFilesystem` (type, public) `framework/db/src/schema.ts:1251`
- `FilesystemInjectionRow` (type, public) `framework/db/src/schema.ts:1252`
- `NewFilesystemInjection` (type, public) `framework/db/src/schema.ts:1253`
- `FilesystemCaptureRow` (type, public) `framework/db/src/schema.ts:1288`
- `NewFilesystemCaptureRow` (type, public) `framework/db/src/schema.ts:1289`
- `Team` (type, public) `framework/db/src/schema.ts:1589`
- `NewTeam` (type, public) `framework/db/src/schema.ts:1590`
- `User` (type, public) `framework/db/src/schema.ts:1592`
- `NewUser` (type, public) `framework/db/src/schema.ts:1593`
- `AgentRunConfigRow` (type, public) `framework/db/src/schema.ts:1598`
- `NewAgentRunConfigRow` (type, public) `framework/db/src/schema.ts:1599`
- `TeamRunConfigDefaultsRow` (type, public) `framework/db/src/schema.ts:1601`
- `NewTeamRunConfigDefaultsRow` (type, public) `framework/db/src/schema.ts:1602`
- `TeamMember` (type, public) `framework/db/src/schema.ts:1604`
- `NewTeamMember` (type, public) `framework/db/src/schema.ts:1605`
- `Bet` (type, public) `framework/db/src/schema.ts:1607`
- `NewBet` (type, public) `framework/db/src/schema.ts:1608`
- `Task` (type, public) `framework/db/src/schema.ts:1610`
- `NewTask` (type, public) `framework/db/src/schema.ts:1611`
- `Session` (type, public) `framework/db/src/schema.ts:1613`
- `NewSession` (type, public) `framework/db/src/schema.ts:1614`
- `AgentSessionRequest` (type, public) `framework/db/src/schema.ts:1616`
- `NewAgentSessionRequest` (type, public) `framework/db/src/schema.ts:1617`
- `AgentWorkIntent` (type, public) `framework/db/src/schema.ts:1618`
- `NewAgentWorkIntent` (type, internal) `framework/db/src/schema.ts:1619`
- `ExplicitSessionStart` (type, public) `framework/db/src/schema.ts:1620`
- `TriggerResolutionHistoryRow` (type, public) `framework/db/src/schema.ts:1622`
- `NewTriggerResolutionHistoryRow` (type, public) `framework/db/src/schema.ts:1623`
- `Routine` (type, public) `framework/db/src/schema.ts:1625`
- `NewRoutine` (type, public) `framework/db/src/schema.ts:1626`
- `RoutineRun` (type, public) `framework/db/src/schema.ts:1628`
- `NewRoutineRun` (type, public) `framework/db/src/schema.ts:1629`
- `Thread` (type, public) `framework/db/src/schema.ts:1631`
- `NewThread` (type, public) `framework/db/src/schema.ts:1632`
- `Message` (type, public) `framework/db/src/schema.ts:1634`
- `NewMessage` (type, public) `framework/db/src/schema.ts:1635`
- `Item` (type, public) `framework/db/src/schema.ts:1637`
- `NewItem` (type, public) `framework/db/src/schema.ts:1638`
- `OrgEdge` (type, public) `framework/db/src/schema.ts:1640`
- `NewOrgEdge` (type, public) `framework/db/src/schema.ts:1641`
- `KnowledgeItem` (type, public) `framework/db/src/schema.ts:1643`
- `NewKnowledgeItem` (type, public) `framework/db/src/schema.ts:1644`
- `KnowledgeEditLogEntry` (type, public) `framework/db/src/schema.ts:1646`
- `NewKnowledgeEditLogEntry` (type, public) `framework/db/src/schema.ts:1647`
- `KnowledgeAccessLogEntry` (type, public) `framework/db/src/schema.ts:1649`
- `NewKnowledgeAccessLogEntry` (type, public) `framework/db/src/schema.ts:1650`
- `KnowledgeConflict` (type, public) `framework/db/src/schema.ts:1652`
- `NewKnowledgeConflict` (type, public) `framework/db/src/schema.ts:1653`
- `NotificationQueueRow` (type, public) `framework/db/src/schema.ts:1655`
- `NewNotificationQueueRow` (type, public) `framework/db/src/schema.ts:1656`
- `ArtifactRow` (type, public) `framework/db/src/schema.ts:1658`
- `NewArtifactRow` (type, public) `framework/db/src/schema.ts:1659`
- `PropagationLogRow` (type, public) `framework/db/src/schema.ts:1661`
- `NewPropagationLogRow` (type, public) `framework/db/src/schema.ts:1662`
- `ServerCredential` (type, public) `framework/db/src/schema.ts:1664`
- `NewServerCredential` (type, public) `framework/db/src/schema.ts:1665`
- `ServerConfigRow` (type, public) `framework/db/src/schema.ts:1667`
- `NewServerConfigRow` (type, public) `framework/db/src/schema.ts:1668`
- `PluginRow` (type, public) `framework/db/src/schema.ts:1670`
- `NewPluginRow` (type, public) `framework/db/src/schema.ts:1671`
- `PluginConfigurationDefaultRow` (type, public) `framework/db/src/schema.ts:1673`
- `NewPluginConfigurationDefaultRow` (type, public) `framework/db/src/schema.ts:1674`
- `ConfigurationOverrideRow` (type, public) `framework/db/src/schema.ts:1676`
- `NewConfigurationOverrideRow` (type, public) `framework/db/src/schema.ts:1677`
- `HintProgressRow` (type, public) `framework/db/src/schema.ts:1679`
- `NewHintProgressRow` (type, public) `framework/db/src/schema.ts:1680`
- `LoginSession` (type, public) `framework/db/src/schema.ts:1682`
- `NewLoginSession` (type, public) `framework/db/src/schema.ts:1683`
- `InviteCode` (type, public) `framework/db/src/schema.ts:1685`
- `NewInviteCode` (type, public) `framework/db/src/schema.ts:1686`
- `ProposedCall` (type, public) `framework/db/src/schema.ts:1688`
- `NewProposedCall` (type, public) `framework/db/src/schema.ts:1689`
- `TailoredGrant` (type, public) `framework/db/src/schema.ts:1691`
- `NewTailoredGrant` (type, public) `framework/db/src/schema.ts:1692`
- `OperationOutcome` (type, public) `framework/db/src/schema.ts:1694`
- `NewOperationOutcome` (type, public) `framework/db/src/schema.ts:1695`
- `ServiceConnectionRow` (type, public) `framework/db/src/schema.ts:1747`
- `NewServiceConnectionRow` (type, public) `framework/db/src/schema.ts:1748`
- `TaskDispatchAttempt` (type, public) `framework/db/src/schema.ts:1750`
- `NewTaskDispatchAttempt` (type, public) `framework/db/src/schema.ts:1751`
- `AgentLifecycleInboxRow` (type, public) `framework/db/src/schema.ts:1752`
- `NewAgentLifecycleInboxRow` (type, public) `framework/db/src/schema.ts:1753`
- `WriteExecutor` (type, public) `framework/db/src/write-executor.ts:29`

## D. Const / enum exports

- `DEFAULT_PG_POOL_SIZE` (const, public) `framework/db/src/connection.ts:28`
- `PG_POOL_SIZE_ENV` (const, public) `framework/db/src/connection.ts:31`
- `teams` (const, public) `framework/db/src/schema.ts:19`
- `teamRunConfigDefaults` (const, public) `framework/db/src/schema.ts:51`
- `users` (const, public) `framework/db/src/schema.ts:60`
- `agentRunConfig` (const, public) `framework/db/src/schema.ts:110`
- `teamMembers` (const, public) `framework/db/src/schema.ts:125`
- `bets` (const, public) `framework/db/src/schema.ts:140`
- `tasks` (const, public) `framework/db/src/schema.ts:202`
- `sessions` (const, public) `framework/db/src/schema.ts:241`
- `agentSessionRequests` (const, public) `framework/db/src/schema.ts:298`
- `agentWorkIntents` (const, public) `framework/db/src/schema.ts:366`
- `explicitSessionStarts` (const, public) `framework/db/src/schema.ts:455`
- `taskDispatchAttempts` (const, public) `framework/db/src/schema.ts:498`
- `agentLifecycleInbox` (const, public) `framework/db/src/schema.ts:536`
- `triggerResolutionHistory` (const, public) `framework/db/src/schema.ts:571`
- `routines` (const, public) `framework/db/src/schema.ts:598`
- `routineRuns` (const, public) `framework/db/src/schema.ts:704`
- `threads` (const, public) `framework/db/src/schema.ts:732`
- `messages` (const, public) `framework/db/src/schema.ts:769`
- `items` (const, public) `framework/db/src/schema.ts:800`
- `orgEdges` (const, public) `framework/db/src/schema.ts:841`
- `knowledgeItems` (const, public) `framework/db/src/schema.ts:865`
- `knowledgeEditLog` (const, public) `framework/db/src/schema.ts:894`
- `knowledgeAccessLog` (const, public) `framework/db/src/schema.ts:926`
- `knowledgeConflicts` (const, public) `framework/db/src/schema.ts:944`
- `knowledgeAppProjection` (const, public) `framework/db/src/schema.ts:986`
- `taskPlanningSignals` (const, public) `framework/db/src/schema.ts:1027`
- `notificationQueue` (const, public) `framework/db/src/schema.ts:1051`
- `propagationLog` (const, public) `framework/db/src/schema.ts:1121`
- `artifacts` (const, public) `framework/db/src/schema.ts:1161`
- `filesystems` (const, public) `framework/db/src/schema.ts:1193`
- `filesystemInjections` (const, public) `framework/db/src/schema.ts:1232`
- `filesystemCaptures` (const, public) `framework/db/src/schema.ts:1264`
- `serverCredentials` (const, public) `framework/db/src/schema.ts:1301`
- `serverConfig` (const, public) `framework/db/src/schema.ts:1322`
- `plugins` (const, public) `framework/db/src/schema.ts:1332`
- `pluginConfigurationDefaults` (const, public) `framework/db/src/schema.ts:1347`
- `configurationOverrides` (const, public) `framework/db/src/schema.ts:1375`
- `hintProgress` (const, public) `framework/db/src/schema.ts:1414`
- `loginSessions` (const, public) `framework/db/src/schema.ts:1437`
- `inviteCodes` (const, public) `framework/db/src/schema.ts:1463`
- `proposedCalls` (const, public) `framework/db/src/schema.ts:1498`
- `tailoredGrants` (const, public) `framework/db/src/schema.ts:1547`
- `operationOutcomes` (const, public) `framework/db/src/schema.ts:1574`
- `serviceConnections` (const, public) `framework/db/src/schema.ts:1714`
- `selectTeamSchema` (const, internal) `framework/db/src/zod-schemas.ts:40`
- `selectUserSchema` (const, internal) `framework/db/src/zod-schemas.ts:41`
- `selectTeamMemberSchema` (const, internal) `framework/db/src/zod-schemas.ts:42`
- `selectBetSchema` (const, internal) `framework/db/src/zod-schemas.ts:48`
- `selectTaskSchema` (const, internal) `framework/db/src/zod-schemas.ts:51`
- `selectSessionSchema` (const, internal) `framework/db/src/zod-schemas.ts:52`
- `selectRoutineSchema` (const, internal) `framework/db/src/zod-schemas.ts:53`
- `selectThreadSchema` (const, internal) `framework/db/src/zod-schemas.ts:54`
- `selectMessageSchema` (const, internal) `framework/db/src/zod-schemas.ts:55`
- `selectItemSchema` (const, internal) `framework/db/src/zod-schemas.ts:56`
- `selectKnowledgeItemSchema` (const, internal) `framework/db/src/zod-schemas.ts:57`
- `selectKnowledgeEditLogSchema` (const, internal) `framework/db/src/zod-schemas.ts:58`
- `selectKnowledgeAccessLogSchema` (const, internal) `framework/db/src/zod-schemas.ts:59`
- `selectKnowledgeConflictSchema` (const, internal) `framework/db/src/zod-schemas.ts:60`
- `selectNotificationQueueSchema` (const, internal) `framework/db/src/zod-schemas.ts:61`
- `selectPropagationLogSchema` (const, internal) `framework/db/src/zod-schemas.ts:62`
- `selectArtifactSchema` (const, internal) `framework/db/src/zod-schemas.ts:63`
- `insertTeamSchema` (const, internal) `framework/db/src/zod-schemas.ts:67`
- `insertUserSchema` (const, internal) `framework/db/src/zod-schemas.ts:68`
- `insertTeamMemberSchema` (const, internal) `framework/db/src/zod-schemas.ts:69`
- `insertBetSchema` (const, internal) `framework/db/src/zod-schemas.ts:71`
- `insertTaskSchema` (const, internal) `framework/db/src/zod-schemas.ts:72`
- `insertSessionSchema` (const, internal) `framework/db/src/zod-schemas.ts:73`
- `insertRoutineSchema` (const, internal) `framework/db/src/zod-schemas.ts:74`
- `insertThreadSchema` (const, internal) `framework/db/src/zod-schemas.ts:75`
- `insertMessageSchema` (const, internal) `framework/db/src/zod-schemas.ts:76`
- `insertItemSchema` (const, internal) `framework/db/src/zod-schemas.ts:77`
- `insertArtifactSchema` (const, internal) `framework/db/src/zod-schemas.ts:78`
