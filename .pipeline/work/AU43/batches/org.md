# Delete batch — `org`

7 convicted rows. Delete every one, or record it as a survivor with a reason.

| # | Symbol | Reach | Why it was convicted |
|---|---|---|---|
| 1 | `listOrgEdges` | UI:GET /api/org/, UI:DELETE /api/org/edges/:id | Feeds only the org-chart page and the edge-delete existence check; the edges matrix is approval-chart ceremony at any team count — dies with the feature. |
| 2 | `deleteOrgEdge` | UI:DELETE /api/org/edges/:id | Edge deletion for a feature that dies; kill the route with it. |
| 3 | `upsertOrgEdge` | UI:PUT /api/org/edges, UI:POST /api/teams/ | TOCTOU-safe upsert engineering for an approval chart; the teams-routes.ts:330 founder-auto-edge — founder reviews every new team — is the approval-chain reflex and dies with it. |
| 4 | `deleteTeam` | UI:POST /api/teams/ (rollback branch only) | A rollback helper, not a feature — resolve scaffold specs before inserting and no rollback exists; team retirement on a shared backend is phase = "archive", never row deletion. |
| 5 | `UpsertOrgEdgeInput` |  | Dies with upsertOrgEdge. |
| 6 | `ReviewRoutingContext` |  | The resolver survives (merged into users) but its context collapses to a plain teamId argument; userId/agentRole are the direct/function edge mechanisms wearing a type and die with the edges. |
| 7 | `ActiveTeamMembersWithTeamName` |  | Org-chart payload shape; dies with feature kill 1. |
