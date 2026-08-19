# org — destroyer verdict (REVISED after founder rulings)

## What changed after the rulings

**Verdict moved (1 row):**

| Row | Method | Old | New | Ruling |
|---|---|---|---|---|
| 4 | `resolveReviewRecipients` | DELETE | MERGE | Ruling 1 — on a shared backend serving an organisation of several teams, "replace with all humans" is wrong: it puts every human in every team on every agent review thread. Team scoping is exactly what Ruling 1 says survives. The capability lives; the edges matrix still dies; the honest home is `@hyperidle/users` as one team-scoped human query. |

**Verdict letter unchanged, argument re-based (these rows' first-wave reasons leaned on the voided solo/single-user premise and are rewritten; the kill stands on the corrected premise):**

| Row | Method | Verdict | What changed in the argument |
|---|---|---|---|
| 1–3 | `listOrgEdges` / `deleteOrgEdge` / `upsertOrgEdge` | DELETE | First wave: "solo founder never configures this, fallback is identical." Void. New argument: the edges matrix is an org chart — named reviewers per agent, per role, per team, drawn as an organogram. That is hierarchy and roles-as-permissions ceremony the ethos forbids at any team count. The thing a multi-team backend actually needs — scope by team — needs no edges: team membership already exists (`users.teamId`). |
| — | `ReviewRoutingContext` | DELETE | Old reason: dies with `resolveReviewRecipients`. New reason: the resolver survives but its context collapses to a plain `teamId` argument — the `userId`/`agentRole` members are the direct/function edge mechanisms wearing a type, and they die with the edges. |
| — | `OrgUserDirectory` | SIMPLIFY | Same shrink to `getUserById` + `insertUser`, different reason: `listUsersByKind` leaves not because recipient resolution died but because it moved to `@hyperidle/users`, where reading users is native (service ownership covers reads). |
| — | Hole 1 (review routing) | — | Completely rewritten. "All humans as participants is acceptable" was the solo-founder argument and is void. New shape: recipients = the agent's team's humans; fallback to all humans only when the team has none. No hole of cross-team review noise is opened. |
| — | Hole 5 (seam port member) | — | `CoreApiOrgPort.resolveReviewRecipientsForItem` no longer dies — the `create_item` tool still needs "which humans should see this review". It survives re-shaped as a team-scoped users query behind the seam. |

**Checked against the other rulings, no movement:** org emits no event types (Ruling 2 has nothing to protect here — confirmed: no `emit`/event vocabulary in the package). Nothing in org is knowledge-management ritual (Ruling 3): the org chart is routing config, not a practice-meeting; teams and agent scaffolding are the machinery of working itself. No PLUGIN rows. No FINISH rows — A7's shared-backend/OIDC work lands in users/auth, not here; this service already never mints human identity (scaffold inserts `kind: "ai"` only, `scaffold-agents.ts:183`), so it is OIDC-compatible as-is.

**Unchanged and premise-free:** the `teamMembers`→`teams` fold (rows 9–14) is a schema-shape argument — a 1:1 companion table is one table wearing two names at any number of teams; `deleteTeam` (row 17) is a rollback-helper argument; both stand exactly as written.

## Should this service exist?

**KILL THE NAME, KILL THE ORG CHART, KEEP THE TEAMS.** Same split as the first wave, now on firmer ground:

1. **The org chart** (`org-edges.ts`, the `orgEdges` table, `SettingsOrgChart.tsx`, the edge routes): still DELETE, and the corrected premise makes the argument *stronger*, not weaker. A shared backend with several teams does need review scoping — and the scoping unit the product already has is the **team**. The edges feature is a second, hand-drawn answer to a question team membership already answers: three mechanisms (direct = a named human reviews a named agent; function = a named human reviews a role; team = a named human reviews a team) are an approval-chart. Direct and function edges are hierarchy and roles-as-permissions; even the "team" mechanism is redundant with membership. The `POST /api/teams` auto-edge that wires the founder as reviewer of every new team (`teams-routes.ts:330`) is the approval-chain reflex in one line. All of it dies.

2. **Teams + agent scaffolding** (`team-lookup.ts`, `scaffold-agents.ts`): under Ruling 1 this is *more* load-bearing than the first wave credited. Several teams genuinely coexist on one backend; team scoping of work and conversation runs through `getTeam`/`listTeams`; `persistScaffoldedAgents` is the single writer of agent identity. Survives as a service named `teams`.

3. **Recipient resolution**: the one capability that moves. Survives, but shrinks to "the humans of this team, else all humans" — one query whose honest owner is `@hyperidle/users`.

Survivor routing: `team-lookup.ts` + `scaffold-agents.ts` + `ports.ts` become `@hyperidle/teams`. `org-edges.ts` and the `orgEdges` table delete outright. `org-routing.ts`'s surviving intent merges into `@hyperidle/users`.

## If written today, from scratch

For an organisation of several small teams of humans and agents on one shared backend, humans arriving via OIDC, events as the plugin surface:

- `getTeam(db, {id|name})`
- `listTeams(db, filter?)`
- `createTeam(db, input)` — single insert, single table
- `updateTeam(db, teamId, patch)`
- `persistScaffoldedAgents(db, deps, teamId, specs, harness?)` — agents are minted here; humans are never minted here, they arrive from the OIDC provider and get attached to teams
- *(in `users`, not here)* `listHumans(db, {teamId?})` — the whole of review routing: a review of a team's agent goes to that team's humans; a team with no humans falls back to all humans so every review reaches someone

Still no `teamMembers` table (1:1 companion = one table wearing two names), no org edges, no routing matrix, no rollback-only delete helper. One thing the from-scratch shape exposes that today's schema gets wrong for the corrected premise: `users.teamId` is a single FK, but a human belongs to *one or more* teams. When multi-team membership is built (users-service work, not this package), it becomes a membership relation owned by `users`; nothing in this service's surviving five methods changes shape when that lands.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 4 |
| PLUGIN | 0 |
| FINISH | 0 |
| MERGE | 8 |
| SIMPLIFY | 2 |
| KEEP | 3 |

Surface: 17 method rows (13 distinct functions) → 5 methods here + 1 query relocated to `users` (65% cut by row).

## Feature-level kills

**1. The org chart / review-routing edges — the matrix dies, the scoping survives elsewhere.**
Dies: `orgEdges` table, `listOrgEdges`, `deleteOrgEdge`, `upsertOrgEdge`, `SettingsOrgChart.tsx` (component + settings-nav entry), `GET /api/org/` (org-chart payload), `PUT /api/org/edges`, `DELETE /api/org/edges/:id`, `GET /api/org/review-recipients` (zero callers — the route's own comment says "No UI action reaches this directly today", `routes/org.ts:282`), and the founder-auto-edge write in `POST /api/teams` (`teams-routes.ts:330`).
Survives, relocated: recipient resolution as a team-scoped human query in `@hyperidle/users`. Both production callers (`session-review-creator.ts:88`, `tool-definitions.ts:493`) already pass `teamId`; they drop the `userId`/`agentRole` fields and keep working.
Why the matrix dies on the corrected premise: named-reviewer edges are an approval chart. On a flat multi-team org the unit of visibility is the team you are on — which membership already encodes. Configuring *which specific human* reviews *which specific agent or role* is exactly the org-chart ceremony the ethos forbids, at 2 humans or 20.
Collateral to re-point: `SettingsFilesystems.tsx:77` and `SettingsAgents.tsx:167` fetch `/api/org` only for the teams list — both switch to `GET /api/teams`.

**2. `teamMembers` folds into `teams` — the noun dies.** Unchanged from the first wave; the argument is schema-shape, not user-count. The 1:1 invariant enforced by app-level 500s (`team-lookup.ts:113–154`) is the schema confessing two tables are one entity. Fold `capacity`, `activeBets`, `leadAgentId`, `formedAt` into `teams`; re-point `users.teamId` at `teams.id` (one migration — and this re-point is a prerequisite for the team-scoped recipient query anyway, killing the AK4 two-hop). Kills the `ApiError` 500 machinery, `GET /api/org/teams/:teamId/membership`, `GET /api/org/team-members/:teamMembersId`, the `teamMembersId` ceremony in `CreateTeamInput`, and `teamMembers.dissolvedAt` (duplicates `teams.phase = "archive"`).

**3. `deleteTeam` — a rollback pretending to be a feature.** Unchanged. Sole caller is the `POST /api/teams` specs-empty rollback (`teams-routes.ts:304`); resolve scaffold specs before inserting the team row and the rollback path evaporates. No user-facing delete-team surface exists; a multi-team org retires a team via `phase = "archive"`, not row deletion.

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `listOrgEdges` | UI:GET /api/org/, UI:DELETE /api/org/edges/:id | DELETE | Feeds only the org-chart page and the edge-delete existence check; the edges matrix is approval-chart ceremony at any team count — dies with the feature. |
| 2 | `deleteOrgEdge` | UI:DELETE /api/org/edges/:id | DELETE | Edge deletion for a feature that dies; kill the route with it. |
| 3 | `upsertOrgEdge` | UI:PUT /api/org/edges, UI:POST /api/teams/ | DELETE | TOCTOU-safe upsert engineering for an approval chart; the `teams-routes.ts:330` founder-auto-edge — founder reviews every new team — is the approval-chain reflex and dies with it. |
| 4 | `resolveReviewRecipients` | EVENT:session_ended, AGENT:create_item, UI:GET /api/org/review-recipients | MERGE | **Moved by Ruling 1.** On a multi-team shared backend recipients must be the agent's *team's* humans, not all humans — team scoping survives, edges don't. Fold into `@hyperidle/users` as `listHumans(db, {teamId?})` carrying the fallback (team has no humans → all humans, so every review reaches someone); both callers already pass `teamId`. The zero-caller GET route still deletes. |
| 5 | `persistScaffoldedAgents` | AGENT:create_team, AGENT:add_agent, UI:POST /api/teams/, UI:POST /api/users/, UI:GET+PATCH /api/users/:userId/assistant/, UI:POST /api/org/scaffolded-agents | KEEP | Core value: agents are first-class teammates; single writer of agent identity behind every agent-creation door. Inserts `kind: "ai"` only — already clean against OIDC-sourced human identity. |
| 6 | `resolveTeamAgentHarness` | INTERNAL | MERGE | One caller (`persistScaffoldedAgents`), not in the barrel; a 15-line if-block does not earn a file + export — inline it, delete `team-default-harness.ts`. |
| 7 | `getTeam` | UI:GET /api/teams/:teamId +25 more routes, AGENT:add_agent/create_bet/create_routine, SCHED:routine-scheduler, EVENT:session_ended/task_state_changed | KEEP | Teams are the scoping unit of a multi-team shared backend; this read is load-bearing across bets, tasks, routines, reviews, knowledge. |
| 8 | `listTeams` | UI:GET /api/teams/, GET /api/bets/canvas, GET/PATCH /api/settings/, GET /api/search/ | KEEP | The team directory behind five real UI surfaces — on an org of several teams this IS the org view; no organogram needed. |
| 9 | `getTeamMembers` (overload `require:true`) | UI:POST /api/bets/:id/commit +many, SCHED:notification drain, EVENT:item_created/session_ended | MERGE | The 500-throwing invariant police exists only because one entity is split across two tables; fold `teamMembers` into `teams` and this overload is `getTeam`. Premise-free — stands. |
| 10 | `getTeamMembers` (overload optional) | UI:PUT /api/org/edges, GET /api/org/teams/:teamId/membership +many | MERGE | Same body — after the fold every call site is `getTeam`. |
| 11 | `getTeamMembers` (implementation) | UI/AGENT/SCHED (35 doors via both overloads) | MERGE | Implementation row of #9/#10; dies into `getTeam` with the fold. |
| 12 | `listTeamMembers` (overload `withTeamName:true`) | UI:GET /api/org/ | MERGE | The join-projection exists solely to shape the org-chart payload; org chart dies, projection dies, survivors use `listTeams`. |
| 13 | `listTeamMembers` (overload plain) | UI:GET /api/bets/canvas, GET /api/team-members/ | MERGE | After the fold this is `listTeams` with `phase != "archive"`. |
| 14 | `listTeamMembers` (implementation) | UI (3 doors via overloads) | MERGE | Implementation row of #12/#13; dies into `listTeams`. |
| 15 | `createTeam` | UI:POST /api/teams/, UI:POST /api/org/teams, AGENT:create_team | SIMPLIFY | Survives as one insert into one table; `teamMembersId`/`capacity`/`activeBets`/`formedAt` bookkeeping leaves the signature (defaults live in the schema). |
| 16 | `updateTeam` | UI:PATCH /api/teams/:teamId, UI:POST /api/teams/, AGENT:create_team | SIMPLIFY | Survives; after the fold the two-table branch logic collapses to one UPDATE on `teams`. |
| 17 | `deleteTeam` | UI:POST /api/teams/ (rollback branch only) | DELETE | A rollback helper, not a feature — resolve scaffold specs before inserting and no rollback exists; team retirement on a shared backend is `phase = "archive"`, never row deletion. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `UpsertOrgEdgeInput` | DELETE | Dies with `upsertOrgEdge`. |
| `ReviewRoutingContext` | DELETE | The resolver survives (merged into `users`) but its context collapses to a plain `teamId` argument; `userId`/`agentRole` are the direct/function edge mechanisms wearing a type and die with the edges. |
| `OrgUserDirectory` | SIMPLIFY | Shrinks to `getUserById` + `insertUser` (scaffold's only needs); `listUsersByKind` leaves because recipient resolution moves into `@hyperidle/users`, where reading users is native. |
| `OrgAgentRunConfigWriter` | MERGE | One-function port always wired alongside `OrgUserDirectory` into the same `deps` object — fold its member into the one surviving port. |
| `ScaffoldResult` | KEEP | Return type of the keeper `persistScaffoldedAgents`. |
| `AgentScaffoldSpec` | KEEP | Input type of the keeper; the Strategy/Kernel split it encodes is real. |
| `ActiveTeamMembersWithTeamName` | DELETE | Org-chart payload shape; dies with feature kill 1. |
| `CreateTeamInput` | SIMPLIFY | Loses `teamMembersId`/`capacity`/`activeBets`/`formedAt` after the table fold; keeps id/name/phase/functions/factoryDbPath/createdAt. |

## Holes this leaves

1. **Review routing loses the hand-drawn choices, keeps team scoping.** A review of a team's agent reaches that team's humans (fallback: all humans only when the team has none — every review still reaches someone). What's lost is only the configured direct/function edges — "this named human reviews this named agent/role". On a flat org that choice is the approval chart itself; if a real learning ever shows a team needs a designated reviewer, earn it back then (ETHOS: friction after evidence, never before). No cross-team review noise is introduced — the first wave's "all humans everywhere" replacement is retracted.
2. **One migration.** `teamMembers` columns move into `teams`, `users.teamId` re-points from `teamMembers.id` to `teams.id`, `orgEdges` drops. Blast radius unchanged from the first wave: ~15 production files calling `getTeamMembers`/`listTeamMembers` become `getTeam`/`listTeams` calls; the AK4 two-hop resolution and its two seam routes (`/api/org/teams/:teamId/membership`, `/api/org/team-members/:teamMembersId`) delete outright. The re-point is also the prerequisite for the team-scoped recipient query.
3. **`/api/org` router mostly evaporates.** Org-chart GET, edge PUT/DELETE, review-recipients GET die. `SettingsOrgChart.tsx` deletes; `SettingsFilesystems.tsx:77` and `SettingsAgents.tsx:167` re-point to `GET /api/teams`. Surviving seam routes (`POST /org/teams`, `POST /scaffolded-agents`, `POST /team-routines`, `GET /org/teams/:teamId`) move under `/api/teams` in the renamed service.
4. **`POST /api/teams` loses its rollback.** Spec resolution reorders to before the insert; if refused, wrap the create in a transaction. Either way `deleteTeam` stays dead.
5. **Seam port members re-shape, not die.** `CoreApiOrgPort.resolveReviewRecipientsForItem` (framework/api-contract/src/core-api-port.ts:442) and tool-handlers' mirror (`tool-handlers/src/ports.ts:336`) SURVIVE — `create_item` still must find the humans who should see a review — but their query shape shrinks to `{teamId}` and their implementation becomes the relocated users query. `getTeamMembersByTeamId`-shaped port members still collapse into `getTeam`. This retracts the first wave's hole 5, which deleted the member.
6. **Multi-team human membership is not built here.** `users.teamId` is a single FK; "a human belongs to one or more teams" needs a membership relation owned by `users` someday. Nothing in this service's survivors blocks or prejudges that — flagging so the founder prices it where it belongs, in the users track.
