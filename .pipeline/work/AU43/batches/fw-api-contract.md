# Delete batch — `fw-api-contract`

13 convicted rows. Delete every one, or record it as a survivor with a reason.

| # | Symbol | Reach | Why it was convicted |
|---|---|---|---|
| 1 | `isPendingSessionStart` | DEAD | The package's only function; zero references outside its own file, repo-wide rg -a confirmed. |
| 2 | `AgentOrchestrationSessionHistoryEntry` | interface · DEAD | Only the never-called listSessionHistoryBySource client impl names it. |
| 3 | `AgentOrchestrationSessionActivityEntry` | interface · DEAD | Only the never-called getRecentActivity client impl names it; UI reads activity via the REST door instead. |
| 4 | `AuthMeResponse` | interface · TEST-ONLY/TOOLING | Serving route and web hook both use private local copies; only real references are governance attack-fixture strings. |
| 5 | `PendingSessionStart` | interface · DEAD | Zero references outside session.ts. The 202 flow types its wire rows elsewhere. |
| 6 | `CreateSessionAcceptedResponse` | type · DEAD | Zero references outside session.ts. |
| 7 | `AutonomyLevel` | type · DEAD | 4) in domain-model/knowledge.ts:69 — a booby trap, not a contract. |
| 8 | `SettingsProfile` | interface · TEST-ONLY | Only the package's own test imports it; core-ui hits are React components sharing the name, zero api-contract imports in core-ui. |
| 9 | `SettingsTeam` | interface · TEST-ONLY | Same corpse pile. |
| 10 | `SettingsUser` | interface · TEST-ONLY | Same. |
| 11 | `SettingsAgent` | type · TEST-ONLY | Same. |
| 12 | `SettingsNotifications` | interface · TEST-ONLY | Same; the real notifications UI never imported it. |
| 13 | `SettingsResponse` | interface · DEAD | Zero references anywhere outside the package. |
