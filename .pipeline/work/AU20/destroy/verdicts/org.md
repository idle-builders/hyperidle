# org — destroyer verdict

## Should this service exist?

**KILL THE NAME, KILL HALF THE BODY.** "org" is two unrelated things stapled together:

1. **An org chart** (`org-edges.ts`, `org-routing.ts`, the `orgEdges` table, `SettingsOrgChart.tsx`). This is the enterprise reflex incarnate — a routing matrix with THREE mechanisms (direct/function/team) deciding which human receives an agent's review, plus a settings page that literally draws an organogram. HyperIdle is for flat teams of 1–5 humans. The feature's own fallback — "no edges configured → all humans" — IS the flat-team answer, and it is what every fresh install runs on anyway. The entire edges feature is configuration ceremony layered on top of a fallback that already does the right thing. **DELETE the whole capability.**

2. **Teams + agent scaffolding** (`team-lookup.ts`, `scaffold-agents.ts`). Teams are one of the five process-layer primitives and `persistScaffoldedAgents` is the single writer of agent identity — agents as first-class teammates is the product. **This survives — as a service named `teams`, not `org`.**

Survivor routing: `team-lookup.ts` + `scaffold-agents.ts` + `ports.ts` become `@hyperidle/teams` (or fold into the existing team routes' service home). `org-edges.ts`, `org-routing.ts`, and the `orgEdges` table are deleted outright.

## If written today, from scratch

Five methods, one table:

- `getTeam(db, {id|name})`
- `listTeams(db, filter?)`
- `createTeam(db, input)` — single insert, single table
- `updateTeam(db, teamId, patch)`
- `persistScaffoldedAgents(db, deps, teamId, specs, harness?)`

No `teamMembers` table (1:1 with `teams` — a 1:1 companion table is one table wearing two names), no org edges, no review-routing matrix, no rollback-only delete helper.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 5 |
| MERGE | 7 |
| SIMPLIFY | 2 |
| KEEP | 3 |

Surface: 17 method rows (13 distinct functions) → 5 methods (71% cut by row, 62% by function)

## Feature-level kills

**1. The org chart / review-routing edges — whole capability dies.**
`orgEdges` table, `listOrgEdges`, `deleteOrgEdge`, `upsertOrgEdge`, `resolveReviewRecipients`, `SettingsOrgChart.tsx` (entire component + its settings-nav entry), `GET /api/org/` (org-chart payload), `PUT /api/org/edges`, `DELETE /api/org/edges/:id`, `GET /api/org/review-recipients`, and the `upsertOrgEdge` call inside `POST /api/teams` (`layers/core-api/src/routes/teams-routes.ts:330`) that auto-wires the founder as reviewer of every new team.
What breaks: reviews stop being routable to a chosen human; every review adds ALL humans as thread participants (`layers/core-api/review/src/session-review-creator.ts:88` and TOOL `create_item` via `resolveReviewRecipientsForItem`, `layers/agent-orchestration/tool-handlers/src/tool-definitions.ts:493` — both replace the call with one `listUsersByKind(db, "human")`).
Why acceptable: that is byte-for-byte the existing fallback behavior for any install that never opened the org-chart settings page. For a solo founder it is identical; for a 5-person team it is the flatter behavior — everyone sees agent reviews. If a real learning later shows review noise hurts, earn a routing feature back then (ETHOS §2: friction is added after evidence, never before).
Collateral to re-point: `SettingsFilesystems.tsx:77` and `SettingsAgents.tsx:167` fetch `/api/org` only to get the teams list — both switch to `GET /api/teams`.

**2. `teamMembers` folds into `teams` — the noun dies.**
The 1:1 invariant (enforced by app-level 500s in `getTeamMembers`) is the schema confessing that two tables are one entity. Fold `capacity`, `activeBets`, `leadAgentId`, `formedAt` into `teams`; re-point `users.teamId` at `teams.id` (one migration). Kills: the `ApiError` 500 machinery, the AK4 two-hop id resolution, `GET /api/org/teams/:teamId/membership`, `GET /api/org/team-members/:teamMembersId`, and the `teamMembersId` ceremony in `CreateTeamInput`. Bonus kill: `teamMembers.dissolvedAt` duplicates `teams.phase = "archive"` — two ways to deactivate a team; keep `phase`, drop `dissolvedAt`.

**3. `deleteTeam` — a rollback pretending to be a feature.**
Sole caller is the `POST /api/teams` specs-empty rollback (`teams-routes.ts:304`). Resolve the scaffold specs BEFORE inserting the team row (pure function, no reason it runs after) and the rollback path evaporates. There is no user-facing delete-team feature anywhere — a delete method with no product behind it does not get to live as "useful someday".

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `listOrgEdges` | UI:GET /api/org/, UI:DELETE /api/org/edges/:id | DELETE | Only feeds the org-chart page and the edge-delete existence check — dies with the edges feature. |
| 2 | `deleteOrgEdge` | UI:DELETE /api/org/edges/:id | DELETE | Edge deletion for a feature that dies; kill the route with it. |
| 3 | `upsertOrgEdge` | UI:PUT /api/org/edges, UI:POST /api/teams/ | DELETE | TOCTOU-safe upsert engineering for an enterprise routing matrix; the teams-routes founder-edge write dies too. |
| 4 | `resolveReviewRecipients` | EVENT:session_ended, AGENT:create_item, UI:GET /api/org/review-recipients | DELETE | Its no-edge fallback (all humans) is the flat-team answer; replace both production callers with one `listUsersByKind(db, "human")` line. |
| 5 | `persistScaffoldedAgents` | AGENT:create_team, AGENT:add_agent, UI:POST /api/teams/, UI:POST /api/users/, UI:GET+PATCH /api/users/:userId/assistant/, UI:POST /api/org/scaffolded-agents | KEEP | Core value: agents are first-class teammates; this is the single writer of agent identity, behind every agent-creation door (human and agent alike). |
| 6 | `resolveTeamAgentHarness` | INTERNAL | MERGE | Not in the barrel, exactly one caller (`persistScaffoldedAgents`); a 15-line if-block does not earn its own file + export — inline it, delete `team-default-harness.ts`. |
| 7 | `getTeam` | UI:GET /api/teams/:teamId +25 more routes, AGENT:add_agent/create_bet/create_routine, SCHED:routine-scheduler, EVENT:session_ended/task_state_changed | KEEP | Teams are a process-layer primitive; this read is load-bearing across bets, tasks, routines, reviews, knowledge. |
| 8 | `listTeams` | UI:GET /api/teams/, GET /api/bets/canvas, GET/PATCH /api/settings/, GET /api/search/ | KEEP | The team directory behind five real UI surfaces. |
| 9 | `getTeamMembers` (overload `require:true`) | UI:POST /api/bets/:id/commit +many, SCHED:notification drain, EVENT:item_created/session_ended | MERGE | The `require:true` 500-throwing invariant police exists only because the schema splits one entity into two tables; fold `teamMembers` into `teams` and this overload is `getTeam`. |
| 10 | `getTeamMembers` (overload optional) | UI:PUT /api/org/edges, GET /api/org/teams/:teamId/membership +many | MERGE | Same body — after the table fold every call site is `getTeam`. |
| 11 | `getTeamMembers` (implementation) | UI/AGENT/SCHED (35 doors via both overloads) | MERGE | Implementation row of #9/#10; dies into `getTeam` with the fold. |
| 12 | `listTeamMembers` (overload `withTeamName:true`) | UI:GET /api/org/ | MERGE | The join-projection exists solely to shape the org-chart payload; org chart dies, the projection dies, survivors use `listTeams`. |
| 13 | `listTeamMembers` (overload plain) | UI:GET /api/bets/canvas, GET /api/team-members/ | MERGE | After the fold this is `listTeams` with an `active` filter (which becomes `phase != "archive"`). |
| 14 | `listTeamMembers` (implementation) | UI (3 doors via overloads) | MERGE | Implementation row of #12/#13; dies into `listTeams`. |
| 15 | `createTeam` | UI:POST /api/teams/, UI:POST /api/org/teams, AGENT:create_team | SIMPLIFY | Survives as one insert into one table; `teamMembersId`/`capacity`/`activeBets`/`formedAt` bookkeeping leaves the signature (defaults live in the schema). |
| 16 | `updateTeam` | UI:PATCH /api/teams/:teamId, UI:POST /api/teams/, AGENT:create_team | SIMPLIFY | Survives; after the fold the two-table branch logic collapses to one UPDATE on `teams`. |
| 17 | `deleteTeam` | UI:POST /api/teams/ (rollback branch only) | DELETE | A rollback helper, not a feature — resolve scaffold specs before inserting and no rollback exists; no delete-team product surface exists anywhere. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `UpsertOrgEdgeInput` | DELETE | Dies with `upsertOrgEdge`. |
| `ReviewRoutingContext` | DELETE | Dies with `resolveReviewRecipients`. |
| `OrgUserDirectory` | SIMPLIFY | `listUsersByKind` member dies with org-routing; shrinks to `getUserById` + `insertUser` (scaffold's only needs). |
| `OrgAgentRunConfigWriter` | MERGE | One-function port always wired alongside `OrgUserDirectory` into the same `deps` object — fold its member into the one surviving port. |
| `ScaffoldResult` | KEEP | Return type of the keeper `persistScaffoldedAgents`. |
| `AgentScaffoldSpec` | KEEP | Input type of the keeper; the Strategy/Kernel split it encodes is real. |
| `ActiveTeamMembersWithTeamName` | DELETE | Org-chart payload shape; dies with feature kill 1. |
| `CreateTeamInput` | SIMPLIFY | Loses `teamMembersId`/`capacity`/`activeBets`/`formedAt` after the table fold; keeps id/name/phase/functions/factoryDbPath/createdAt. |

## Holes this leaves

1. **No review routing.** Every agent review adds all human users as thread participants. Identical to today's fresh-install behavior; a configured install loses its routing choices. Price: on a 5-human team, every human is a participant on every agent review thread. If that ever measurably hurts, a routing feature gets earned back from that evidence.
2. **One migration.** `teamMembers` columns move into `teams`, `users.teamId` re-points from `teamMembers.id` to `teams.id`, `orgEdges` table drops. Blast radius of the fold: ~15 production files call `getTeamMembers`/`listTeamMembers` (routes, policy-engine, notifications drain, bet-state-machine tx, durable-agent-queue, seam ports) — each becomes a `getTeam`/`listTeams` call; the AK4 two-hop resolution and its two seam routes (`/api/org/teams/:teamId/membership`, `/api/org/team-members/:teamMembersId`) delete outright.
3. **`/api/org` router mostly evaporates.** Org-chart GET, edge PUT/DELETE, review-recipients GET die. `SettingsOrgChart.tsx` deletes; `SettingsFilesystems.tsx` and `SettingsAgents.tsx` re-point to `GET /api/teams`. The surviving seam routes (`POST /org/teams`, `POST /scaffolded-agents`, `POST /team-routines`, `GET /org/teams/:teamId`) belong under `/api/teams` in the renamed service.
4. **`POST /api/teams` loses its rollback.** Spec resolution reorders to before the insert — if that reorder is refused, the create wraps in a transaction instead. Either way `deleteTeam` stays dead.
5. **Seam port members shrink.** `CoreApiOrgPort.resolveReviewRecipientsForItem` (framework/api-contract/src/core-api-port.ts:442) and tool-handlers' mirror member die; `create_item`'s handler calls the users seam for humans instead. `getTeamMembersByTeamId`-shaped port members collapse into the `getTeam` members.
