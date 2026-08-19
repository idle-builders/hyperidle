# Delete bundle 5 — fw-api-contract, routine

17 convicted rows across 2 package(s).

| # | Package | Symbol | Reach | Why convicted |
|---|---|---|---|---|
| 1 | fw-api-contract | `isPendingSessionStart` | DEAD | The package's only function; zero references outside its own file, repo-wide rg -a confirmed. |
| 2 | fw-api-contract | `AgentOrchestrationSessionHistoryEntry` | interface · DEAD | Only the never-called listSessionHistoryBySource client impl names it. |
| 3 | fw-api-contract | `AgentOrchestrationSessionActivityEntry` | interface · DEAD | Only the never-called getRecentActivity client impl names it; UI reads activity via the REST door instead. |
| 4 | fw-api-contract | `AuthMeResponse` | interface · TEST-ONLY/TOOLING | Serving route and web hook both use private local copies; only real references are governance attack-fixture strings. |
| 5 | fw-api-contract | `PendingSessionStart` | interface · DEAD | Zero references outside session.ts. The 202 flow types its wire rows elsewhere. |
| 6 | fw-api-contract | `CreateSessionAcceptedResponse` | type · DEAD | Zero references outside session.ts. |
| 7 | fw-api-contract | `AutonomyLevel` | type · DEAD | 4) in domain-model/knowledge.ts:69 — a booby trap, not a contract. |
| 8 | fw-api-contract | `SettingsProfile` | interface · TEST-ONLY | Only the package's own test imports it; core-ui hits are React components sharing the name, zero api-contract imports in core-ui. |
| 9 | fw-api-contract | `SettingsTeam` | interface · TEST-ONLY | Same corpse pile. |
| 10 | fw-api-contract | `SettingsUser` | interface · TEST-ONLY | Same. |
| 11 | fw-api-contract | `SettingsAgent` | type · TEST-ONLY | Same. |
| 12 | fw-api-contract | `SettingsNotifications` | interface · TEST-ONLY | Same; the real notifications UI never imported it. |
| 13 | fw-api-contract | `SettingsResponse` | interface · DEAD | Zero references anywhere outside the package. |
| 14 | routine | `isBuiltinRoutineId` | UI:POST /api/routines/:id/trigger, SCHED:TICK pollIntervalMs | Recognizes builtin: id strings — pure mechanism of the bypass path; the plugin uses ordinary routine ids. Kill both callers' builtin branches. |
| 15 | routine | `extractBuiltinKind` | UI:POST /api/routines/:id/trigger, SCHED:TICK, EVENT:bet_state_changed | Id-string parsing (builtin:kind:teamId) for a scheme nobody re-provides. |
| 16 | routine | `BuiltinRoutineId` |  | Id scheme of the bypass mechanism — not re-provided. |
| 17 | routine | `RunBuiltinResult` |  | Return type of the bypass dispatcher — not re-provided. |
