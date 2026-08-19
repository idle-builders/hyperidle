# Delete bundle 11 — org, fw-tool-protocol, policy, fw-credential-access

17 convicted rows across 4 package(s).

| # | Package | Symbol | Reach | Why convicted |
|---|---|---|---|---|
| 1 | org | `listOrgEdges` | UI:GET /api/org/, UI:DELETE /api/org/edges/:id | Feeds only the org-chart page and the edge-delete existence check; the edges matrix is approval-chart ceremony at any team count — dies with the feature. |
| 2 | org | `deleteOrgEdge` | UI:DELETE /api/org/edges/:id | Edge deletion for a feature that dies; kill the route with it. |
| 3 | org | `upsertOrgEdge` | UI:PUT /api/org/edges, UI:POST /api/teams/ | TOCTOU-safe upsert engineering for an approval chart; the teams-routes.ts:330 founder-auto-edge — founder reviews every new team — is the approval-chain reflex and dies with it. |
| 4 | org | `deleteTeam` | UI:POST /api/teams/ (rollback branch only) | A rollback helper, not a feature — resolve scaffold specs before inserting and no rollback exists; team retirement on a shared backend is phase = "archive", never row deletion. |
| 5 | org | `UpsertOrgEdgeInput` |  | Dies with upsertOrgEdge. |
| 6 | org | `ReviewRoutingContext` |  | The resolver survives (merged into users) but its context collapses to a plain teamId argument; userId/agentRole are the direct/function edge mechanisms wearing a type and die with the edges. |
| 7 | org | `ActiveTeamMembersWithTeamName` |  | Org-chart payload shape; dies with feature kill 1. |
| 8 | fw-tool-protocol | `wrapForRegistry` | fn · INTERNAL (tool-definitions.ts, 2 call sites) | Exists to convert the second result grammar back to the first; dies with the AssistantTool family (kill #3). |
| 9 | fw-tool-protocol | `composeWorkflowAllowDeny` | fn · TEST-ONLY (AL7-classifier.test.ts) | Promised harness-carrier consumers never wired; the invoke-router does the real work. Delete function + its test cases (kill #1). |
| 10 | fw-tool-protocol | `ToolCatalogEntry` | interface · DEAD as import (zero external importers — settings uses the const, type inferred) | Dies with the catalog; the projection's row type lives in tool-handlers (kill #2). |
| 11 | fw-tool-protocol | `AssistantToolResult` | type · DEAD as export (zero external importers; internal to the shape's handler signature) | Second result grammar for two tools (kill #3). |
| 12 | fw-tool-protocol | `AssistantToolShape` | interface · INTERNAL (tool-definitions.ts, 2 factories: create_bet, edit_bet) | Rewrite the two factories as plain ToolDefinition; the family dies (kill #3). |
| 13 | fw-tool-protocol | `BUILTIN_TOOL_CATALOG` | const · UI: indirectly — plugin-configuration.ts:761 seeds tool-capability defaults read by settings routes | 127-line hand-kept mirror of ALL_TOOL_DEFINITIONS guarded by a drift test. Replace with a derived projection injected at the composition root; delete mirror + drift test (kill #2). |
| 14 | policy | `recordPropagationHop` | SCHED:30s heartbeat + EVENT:session_ended/task_state_changed/bet_state_changed + UI:POST /api/bets/:id/kill (cascade port) | Stands — founder affirmed: a write-only ledger is dead at any user count. Kill it and every caller (cascade hops, run-stop hops, LogSink sinks). Correction: the propagation_applied/propagation_failed EVENTS exit the blast radius (Ruling 2) — only the log rows, timer, and retry die. |
| 15 | policy | `reapTerminalPropagationLog` | SCHED:retention-reaper (service-bootstrap.ts:520) | Stands. A reaper for a log nobody reads is bloat squared; it never reaps failed rows anyway. Dies with the table. |
| 16 | policy | `LogPropagationEntry` |  | Stands: input type of recordPropagationHop, dies with it. |
| 17 | fw-credential-access | `UnsupportedAgentProviderError` | class · TEST-ONLY (AH2-resolve-agent-model.integration.test.ts:131 is the only reference; no production catch or instanceof anywhere) | An error subclass nobody catches is a plain Error with a costume. Throw Error with the same message; retag the test to assert the message. |
