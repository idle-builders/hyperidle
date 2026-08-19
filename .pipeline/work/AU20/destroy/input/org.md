# Destroyer input — `org` (core-api)

Package: `layers/core-api/org`
Surface: 17 exported functions, 0 classes (0 member methods), 8 interface/type declarations, 0 const/enum exports.

## A. Exported functions — EVERY ONE NEEDS A VERDICT

| # | Method | Public | Location |
|---|---|---|---|
| 1 | `listOrgEdges` | yes | `layers/core-api/org/src/org-edges.ts:38` |
| 2 | `deleteOrgEdge` | yes | `layers/core-api/org/src/org-edges.ts:56` |
| 3 | `upsertOrgEdge` | yes | `layers/core-api/org/src/org-edges.ts:71` |
| 4 | `resolveReviewRecipients` | yes | `layers/core-api/org/src/org-routing.ts:41` |
| 5 | `persistScaffoldedAgents` | yes | `layers/core-api/org/src/scaffold-agents.ts:153` |
| 6 | `resolveTeamAgentHarness` | internal | `layers/core-api/org/src/team-default-harness.ts:35` |
| 7 | `getTeam` | yes | `layers/core-api/org/src/team-lookup.ts:56` |
| 8 | `listTeams` | yes | `layers/core-api/org/src/team-lookup.ts:76` |
| 9 | `getTeamMembers` | yes | `layers/core-api/org/src/team-lookup.ts:113` |
| 10 | `getTeamMembers` | yes | `layers/core-api/org/src/team-lookup.ts:118` |
| 11 | `getTeamMembers` | yes | `layers/core-api/org/src/team-lookup.ts:123` |
| 12 | `listTeamMembers` | yes | `layers/core-api/org/src/team-lookup.ts:169` |
| 13 | `listTeamMembers` | yes | `layers/core-api/org/src/team-lookup.ts:173` |
| 14 | `listTeamMembers` | yes | `layers/core-api/org/src/team-lookup.ts:177` |
| 15 | `createTeam` | yes | `layers/core-api/org/src/team-lookup.ts:230` |
| 16 | `updateTeam` | yes | `layers/core-api/org/src/team-lookup.ts:283` |
| 17 | `deleteTeam` | yes | `layers/core-api/org/src/team-lookup.ts:304` |

## C. Interface / type declarations — the DI-port surface

Verdict each DECLARATION (not every member individually) unless a member is independently interesting. A port member whose only implementation you are deleting dies with it — say so.

- `UpsertOrgEdgeInput` (interface, public) `layers/core-api/org/src/org-edges.ts:60` — members: `fromUserId`, `mechanism`, `target`
- `ReviewRoutingContext` (interface, public) `layers/core-api/org/src/org-routing.ts:9` — members: `userId`, `agentRole`, `teamId`
- `OrgUserDirectory` (interface, public) `layers/core-api/org/src/ports.ts:25` — members: `getUserById`, `insertUser`, `listUsersByKind`
- `OrgAgentRunConfigWriter` (interface, public) `layers/core-api/org/src/ports.ts:44` — members: `writeAgentRunConfig`
- `ScaffoldResult` (interface, public) `layers/core-api/org/src/scaffold-agents.ts:50` — members: `agentIds`, `leadAgentId`
- `AgentScaffoldSpec` (interface, public) `layers/core-api/org/src/scaffold-agents.ts:75` — members: `role`, `name`, `agentCategory`, `systemPrompt`, `idHint`
- `ActiveTeamMembersWithTeamName` (interface, public) `layers/core-api/org/src/team-lookup.ts:95` — members: `id`, `name`, `teamActualId`
- `CreateTeamInput` (interface, public) `layers/core-api/org/src/team-lookup.ts:208` — members: `id`, `name`, `phase`, `functions`, `factoryDbPath`, `createdAt`, `teamMembersId`, `capacity`, `activeBets`, `formedAt`
