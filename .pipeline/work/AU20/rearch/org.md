# org — Service-as-Product (AU20 re-architecture, BOTH lenses)

**Layer:** core-api · **Substrate:** owned DB tables · **Owned tables:** `teams`, `teamMembers` (1:1 with `teams`), `orgEdges` · **Depends on:** `users` (DI port).

org is the **team & org-structure directory** for the whole system. It owns *who the teams are* (`teams`), *the membership group that runs each team* (`teamMembers`, 1:1), and *the routing graph — which human owns which agent/role/team* (`orgEdges`).

---

## 1. INSIDE-OUT (anchor)

**Substrate kind: (a) OWNED DB TABLES.** Not an adapter, not a pure-logic engine — three physical tables. The floor is plain CRUD over them, with the 1:1 `teams`↔`teamMembers` invariant collapsing the two team tables into ONE aggregate ("Team").

### The floor — CRUD over the owned tables

**Team aggregate (`teams` + `teamMembers`, 1:1) — 7 ops.**
The 1:1 invariant makes them one aggregate, but they are physically two tables holding *different domain fields* (team: name/phase/functions/default-harness; membership: capacity/activeBets/leadAgentId/costActual), and real consumers read each half independently — so the read side does not collapse to one:
- `getTeam(query)` — read the team row (`{id}|{name}`)
- `listTeams(filter)` — batch/all teams (`{ids?}`)
- `getTeamMembers(query, opts)` — read the membership row (`{id}|{teamId}`), `require` flag enforces the invariant
- `listTeamMembers(filter)` — all/active membership rows, optional team-name join
- `createTeam(input)` — atomic insert of BOTH rows (a team without its group is invalid)
- `updateTeam(teamId, patch)` — patch either table's mutable columns, routed by field
- `deleteTeam(teamId)` — cascade both rows (rollback path)

**OrgEdge (`orgEdges`) — 3 ops.**
- `listOrgEdges(filter)` — all/by-id (`get` folded into the filter)
- `upsertOrgEdge(input)` — idempotent INSERT … ON CONFLICT
- `deleteOrgEdge(id)`

**Floor = 10 operations.** (~5×tables would say 15; the 1:1 collapse + `get`-folds-into-`list` on edges bring the honest coherent floor to 10.)

### Genuine owned capabilities beyond CRUD (+3)

These are algorithms/write-seams the tables genuinely own — not fragmentation:
- **`resolveReviewRecipients(context, users)`** — the graph-traversal query that IS the product value of `orgEdges`: union direct/function/team edges matching the context, fall back to all humans. A real algorithm, not a read.
- **`persistScaffoldedAgents(...)`** — the single writer of team-scoped agent rows: assigns ids (hint deny/allow), attaches Kernel mechanism fields, and resolves team-default→builtin harness internally. Sits at the org/team boundary because it stamps `teamId` and resolves the team's default harness. (Writes `users` via the DI port.)
- **`applyTeamCost(target, change)`** — the atomic cost write-seam on `teamMembers.costActual`. Owned by `cost` *in spirit*, forced behind the org boundary by Table-ACL because the column physically lives on an org table. One parameterized op (increment-one / reset-one / reset-all).

Total inside-out floor + capabilities = **13 methods**.

---

## 2. OUTSIDE-IN (real demand)

8 service consumers + the server route layer. Every request maps onto a general interface — no method-per-caller:

| Consumer | Requests | Served by |
|---|---|---|
| notifications, realtime, cost | `getTeamMembersById` | `getTeamMembers({id})` |
| policy, work | `getByTeamId` | `getTeamMembers({teamId})` |
| agent-selection, session-requests, tool-handlers | `getTeamMembersByTeamId` | `getTeamMembers({teamId})` |
| work | `setActiveBets` | `updateTeam(teamId,{activeBets})` |
| cost | `incrementTeamMembersCost`, `resetTeamMembersCost`, `resetAllTeamMembersCost` | `applyTeamCost(target,change)` |
| tool-handlers | `getTeamById` | `getTeam({id})` |
| tool-handlers | `createTeam`, `updateTeam` | `createTeam` / `updateTeam` |
| tool-handlers | `resolveReviewRecipientsForItem` | `resolveReviewRecipients` |
| tool-handlers | `persistScaffoldedAgents` | `persistScaffoldedAgents` |
| server routes (org.ts) | list teams/members/edges, upsert/delete edge, getTeamByName, deleteTeam rollback | `listTeams`/`listTeamMembers`/`listOrgEdges`/`upsertOrgEdge`/`deleteOrgEdge`/`getTeam({name})`/`deleteTeam` |

The demand is exactly **regular CRUD over three tables + the three genuine capabilities**. The three distinct cost verbs and the `ById`/`ByTeamId` pair are the fragmentation to remove; the underlying capability behind each must stay reachable.

---

## 3. THE COHERENT PRODUCT API (both lenses fused)

Parameterized general interfaces. Every real feature reachable; no bespoke method per WHERE-clause or per caller.

| # | Interface | Shape | Lens | From |
|---|---|---|---|---|
| 1 | `getTeam` | `(db, {id}\|{name}) → Team \| undefined` | both | `teams` read; tool-handlers/routes |
| 2 | `listTeams` | `(db, {ids?}?) → Team[]` | both | `teams` read; routes/batch |
| 3 | `getTeamMembers` | `(db, {id}\|{teamId}, {require?}) → TeamMember(\|undefined)` | both | `teamMembers` read + 1:1 invariant; 6 consumers |
| 4 | `listTeamMembers` | `(db, {active?, withTeamName?}?) → TeamMember[] \| ProjectedRow[]` | both | `teamMembers` read + ACL-private join; routes/org-chart |
| 5 | `createTeam` | `(db, CreateTeamInput) → void` | both | atomic 1:1 insert; tool-handlers |
| 6 | `updateTeam` | `(db, teamId, {phase?, activeBets?, leadAgentId?}) → void` | both | mutable-column patch; work/tool-handlers |
| 7 | `deleteTeam` | `(db, teamId) → void` | both | 1:1 cascade; routes rollback |
| 8 | `listOrgEdges` | `(db, {id?}?) → OrgEdge[]` | both | `orgEdges` read; routes |
| 9 | `upsertOrgEdge` | `(db, UpsertOrgEdgeInput) → {edge, created}` | both | idempotent write; routes |
| 10 | `deleteOrgEdge` | `(db, id) → void` | both | `orgEdges` delete; routes |
| 11 | `resolveReviewRecipients` | `(db, ReviewRoutingContext, users) → string[]` | both | `orgEdges` routing algorithm; review/tool-handlers |
| 12 | `persistScaffoldedAgents` | `(db, users, teamMembersId, specs, harness?) → ScaffoldResult` | both | team-scoped agent writer + harness resolve; tool-handlers |
| 13 | `applyTeamCost` | `(db, {id}\|"all", {deltaMinor}\|"reset") → void` | both | `teamMembers.costActual` write-seam; cost |

**Supporting types (7):** `CreateTeamInput`, `ActiveTeamMembersWithTeamName` (projection), `UpsertOrgEdgeInput`, `ReviewRoutingContext`, `AgentScaffoldSpec`, `ScaffoldResult`, `OrgUserDirectory` (DI port). Plus `ApiError` (thrown class, value+type).

### Evolvability (inside-out) — sub-linear
- New read predicate (by phase, by created-window) → new *field on an existing filter type*, 0 new methods.
- New mutable membership attribute → new field on the `updateTeam` patch, 0 new methods.
- New routing mechanism (e.g. `skill`) → extend `orgEdges.mechanism` + `ReviewRoutingContext`; `resolveReviewRecipients` already unions over present context fields, 0 new methods.
- All invariants/dialect quirks (1:1 `require`, atomic cost SQL, empty-`inArray` short-circuit, ON-CONFLICT idempotency) stay encapsulated; callers never see a table or a `sql\`\`` fragment.

### Completeness proof (not lossy)
Every current user feature stays deliverable: team CRUD (create/rename/archive/delete team), capacity & active-bet management (`work`), budget attribution (`cost`), review routing (`review`), agent scaffolding + onboarding harness choice (`tool-handlers`), org-chart render (routes), and every by-id/by-teamId lookup across notifications/policy/realtime/agent-selection/session-requests. Nothing removed — only the fragmented surface collapsed into parameterized interfaces.

---

## 4. TARGET NUMBERS

- **targetMethods = 13** = floor 10 (Team-aggregate CRUD 7 + OrgEdge CRUD 3) + 3 genuine capabilities (`resolveReviewRecipients`, `persistScaffoldedAgents`, `applyTeamCost`).
- **targetTypes = 7** — only the genuinely needed filter/input/return/port types listed above.
- **From:** currentMethods 19, currentTypes 7.

### What gets DELETED (not internalized)
The fragmentation is the fat, and it is *deleted*, not hidden:
- 4 team reads (`getTeamById`, `getTeamByName`, `listTeamsByIds`, `listAllTeams`) → 2.
- 5 members reads (`getTeamMembersById`, `getTeamMembersByTeamId`, `loadTeamMembers`, `listAllTeamMembers`, `listActiveTeamMembersWithTeamNames`) → 2, killing the named `getTeamMembersById`/`ByTeamId` near-duplicate.
- 3 mutators (`updateTeamPhase`, `setTeamMembersActiveBets`, `setTeamMembersLeadAgent`) → 1 (`updateTeam`).
- 3 cost verbs → 1 (`applyTeamCost`).
- create/delete pairs (`createTeam`+`createTeamMembersGroup`, `deleteTeamById`+`deleteTeamMembersGroupById`) → 2 atomic 1:1 ops.
- `getOrgEdgeById` folded into `listOrgEdges(filter)`; `resolveTeamAgentHarness` folded into `persistScaffoldedAgents`; `PrimaryHarnessConfig` re-export dropped (callers import from `@hyperidle/shared`).

### The one true future deletion (out of AU20 scope)
`applyTeamCost` should not exist in org at all — cost is `cost`'s product. It survives only because `teamMembers.costActual` physically lives on an org table. When that column migrates to a `cost`-owned table, `applyTeamCost` *leaves* org entirely (floor drops to 12), no other method moves. This is a schema migration, deliberately deferred.

**Verdict:** the service lands at floor + 3 justified capabilities = 13. It is neither bloated (every method traces to an owned table or a genuine capability) nor lossy (every current feature reachable through the general interfaces). The AU20 Am7 collapse already reached this target; the inside-out lens confirms 13 is the right floor-grounded number, not an outside-in accident.
