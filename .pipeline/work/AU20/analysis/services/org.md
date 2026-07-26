# org — Service-as-Product Analysis (AU20)

**Layer:** core-api · **Current public exports:** 36 · **Owned tables:** `teams`, `teamMembers`, `orgEdges` · **Verdict:** STANDALONE (aggressive internal collapse)

---

## 1. Existence / Consolidation Verdict — STANDALONE

`org` is the **team & org-structure directory** for the whole system. It owns the three tables that model *who the teams are* (`teams`), *the membership group that runs each team* (`teamMembers`, 1:1 with `teams`), and *the routing graph that says which human owns which agent/role/team* (`orgEdges`). On top of that data it offers three derived capabilities: review-recipient routing, per-team agent scaffolding, and per-team default-harness resolution.

It is a **genuine hub, not a table-ownership accident**: 11 distinct service consumers plus the server route layer read team/membership data. The demand is real and cross-cutting — `work` (capacity), `cost` (budget attribution), `notifications`/`policy`/`realtime`/`agent-selection`/`session-requests`/`trigger-resolution` (team lookup by id/teamId), `review` (recipient routing), `context-assembly` (team read), `tool-handlers` (create/scaffold). No sibling could absorb this without becoming the org store itself. The 1:1 Team=TeamMembers invariant (`loadTeamMembers`) is a real domain rule enforced in one place. **It earns its boundary.**

**Not infra.** It is a core-api domain store consumed by many services; its product is organizational structure, delivered to end-user-facing flows via those consumers. `isInfraPlatform = false`.

**Candidate neighbors: [] — confirmed.** The landscape pass found no merge partner, and none exists: every neighbor is a *consumer* of org, not a peer that duplicates it.

**Evaluating the frame's two steers:**

- **"team-cost writes (`incrementTeamMembersCost`/`resetTeamMembersCost`/`resetAllTeamMembersCost`) duplicate `users`' cost pattern — does cost-tracking belong here?"** Product-correct answer: cost-tracking is **`cost`'s** product, not org's. But `teamMembers.costActual` is a physical column on an org-owned table, so the *write mechanics* (atomic `coalesce+delta`, reset-to-0) are forced to live behind the org boundary by Table-ACL — the same forcing function that spawned them (AU19 Increment 3g). The right MVP move is **not** to ship three bespoke cost verbs but to expose **one** parameterized cost-write accessor and let `cost` own the policy. The deeper collapse — moving `costActual` onto a `cost`-owned table so org exposes zero cost methods — is a schema migration, out of AU20 scope, and is noted as the real future fix.

- **"fix duplicate `getTeamMembersById` (named bug)."** The smell is the near-duplicate pair `getTeamMembersById` (WHERE `teamMembers.id`) vs `getTeamMembersByTeamId` (WHERE `teamMembers.teamId`) — two exports that differ *only by which column they match*. That is the method-per-WHERE anti-pattern in miniature. The redesign's `getTeamMembers(query)` collapses both into one keyed read, eliminating the confusable pair.

---

## 2. The Deliberate Target Public API (36 → ~20)

The 36 exports are 6 files of per-call-site accessors. The demand is actually a **small, regular CRUD-over-three-tables + two derived capabilities**. Redesign into parameterized interfaces:

### Team reads (collapse 4 → 2)
- **`getTeam(db, query)`** — `query: { id } | { name }` → `Team | undefined`. Replaces `getTeamById`, `getTeamByName`.
- **`listTeams(db, filter?)`** — `filter?: { ids? }` (empty = all) → `Team[]`. Replaces `listTeamsByIds`, `listAllTeams`.

### TeamMembers reads (collapse 5 → 2 — fixes the named `getTeamMembersById` duplicate)
- **`getTeamMembers(db, query, opts?)`** — `query: { id } | { teamId }`, `opts?: { require?: boolean }`. `require:true` enforces the 1:1 invariant and throws `ApiError` (the old `loadTeamMembers` behavior); default returns `undefined`. Replaces `getTeamMembersById`, `getTeamMembersByTeamId`, `loadTeamMembers`.
- **`listTeamMembers(db, filter?)`** — `filter?: { active?: boolean; withTeamName?: boolean }`. Replaces `listAllTeamMembers`, `listActiveTeamMembersWithTeamNames` (the `withTeamName` projection stays inside org because the join needs the ACL-private `teams` table).

### Team writes (collapse 7 → 3, exploiting the 1:1 invariant)
- **`createTeam(db, input)`** — atomically inserts the `teams` row **and** its `teamMembers` group (+ optional lead). The 1:1 invariant makes a team without a membership group invalid, so they are one operation. Replaces `createTeam` + `createTeamMembersGroup` + lead-set-at-create.
- **`updateTeam(db, teamId, patch)`** — `patch: { phase?; activeBets?; leadAgentId? }`, routed to the right column/table (1:1 lets it resolve the membership row from `teamId`). Replaces `updateTeamPhase`, `setTeamMembersActiveBets`, `setTeamMembersLeadAgent`.
- **`deleteTeam(db, teamId)`** — cascades the 1:1: removes the `teams` row and its `teamMembers` group. Replaces `deleteTeamById` + `deleteTeamMembersGroupById` (the POST /teams rollback path).

### Cost mechanics (collapse 3 → 1)
- **`applyTeamCost(db, target, change)`** — `target: { id } | "all"`, `change: { deltaMinor } | "reset"`. One accessor covering atomic-increment-one, reset-one, reset-all. Replaces `incrementTeamMembersCost`, `resetTeamMembersCost`, `resetAllTeamMembersCost`. (Owned by `cost` in spirit; kept here only as the Table-ACL write seam.)

### Org edges — routing graph (collapse reads 2 → 1)
- **`listOrgEdges(db, filter?)`** — `filter?: { id? }` → `OrgEdge[]`. Replaces `listOrgEdges` + `getOrgEdgeById` (the pre-delete existence check).
- **`upsertOrgEdge(db, input)`** — kept (idempotent ON CONFLICT).
- **`deleteOrgEdge(db, id)`** — kept.

### Derived capabilities (kept — these ARE the product value of the tables)
- **`resolveReviewRecipients(db, context, users)`** — routing over `orgEdges`. Kept: a real shared capability (review, tool-handlers).
- **`persistScaffoldedAgents(db, users, teamMembersId, specs, harness?)`** — single writer of agent-user rows, with **`resolveTeamAgentHarness` folded in** (the writer resolves explicit → team-default → builtin internally; callers no longer pre-compute). Replaces 2 exports with 1.

### Retained supporting types
`ApiError` (thrown to routes), `OrgUserDirectory` (DI port, unavoidable wiring), `ReviewRoutingContext`, `AgentScaffoldSpec`, `ScaffoldResult`, `CreateTeamInput`, `UpsertOrgEdgeInput`, plus the `listTeamMembers` `withTeamName` row shape. **Dropped:** `PrimaryHarnessConfig` re-export (consumers import it from `@hyperidle/shared` directly — org should not proxy it).

**Target export count: ~20** (13 functions/capabilities + ~7 types), down from 36.

---

## 3. Inside Lens — staying clean/evolvable

- **Three tables, one accessor family each, all keyed by query/filter objects.** A new read predicate (by phase, by created-window) becomes a new *field on an existing filter type*, not a new export.
- **Invariants and dialect quirks stay encapsulated:** the 1:1 enforcement (`require` opt), atomic cost SQL (`applyTeamCost`), empty-`inArray` short-circuit, ON-CONFLICT idempotency — all hidden behind the interfaces; callers never see a table or a `sql\`\`` fragment.
- **The single outbound edge (`users`) stays a DI port** (`OrgUserDirectory`), so org remains a leaf core-api package with no forward reference into `packages/server`.
- **Cost is quarantined to one seam** — when `costActual` eventually migrates to a `cost`-owned table, exactly one org export (`applyTeamCost`) disappears; nothing else moves.

---

## 4. Scaling Argument — sub-linear

Apply the test: add dozens of services and hundreds of calls — how many new org methods?

- Consumer wants *teams in a given phase* → add `phase?` to `listTeams` filter. **0 new methods.**
- Consumer wants to mutate a new membership attribute → add a field to the `updateTeam` patch. **0 new methods.**
- New routing mechanism (e.g. `skill`) → extend the `orgEdges.mechanism` enum + `ReviewRoutingContext`; `resolveReviewRecipients` already unions over present context fields. **0 new methods.**
- New membership read by yet another column → new field on `getTeamMembers` query. **0 new methods.**

Contrast with today's trajectory, where each new WHERE-clause minted a method: `getTeamById` → `getTeamByName` → `listTeamsByIds` → `listAllTeams`; `getTeamMembersById` → `getTeamMembersByTeamId` → `listActiveTeamMembersWithTeamNames`. That is **linear (a method per intent)**. The parameterized `get(query)`/`list(filter)`/`update(patch)`/`applyTeamCost(target,change)` shape **absorbs new intents without new surface** — sub-linear by construction.

---

## 5. Key Collapses

1. **5 teamMembers reads → 2** (`getTeamMembers(query,opts)` + `listTeamMembers(filter)`), eliminating the named `getTeamMembersById`/`getTeamMembersByTeamId` near-duplicate and folding the throwing `loadTeamMembers` into a `require` flag.
2. **4 team reads → 2** (`getTeam(query)` + `listTeams(filter)`).
3. **3 mutators → 1** (`updateTeam(teamId, patch)` subsuming `updateTeamPhase` + `setTeamMembersActiveBets` + `setTeamMembersLeadAgent`).
4. **3 cost verbs → 1** (`applyTeamCost(target, change)`) — quarantining the cost concern that doesn't really belong to org to a single Table-ACL seam.
5. **create/delete pairs → atomic 1:1 ops** (`createTeam` folds membership+lead; `deleteTeam` cascades both) — 5 exports → 2.
6. **scaffolding: 2 → 1** (`resolveTeamAgentHarness` folded into `persistScaffoldedAgents`); **`PrimaryHarnessConfig` re-export dropped**.
7. **edges reads 2 → 1** (`getOrgEdgeById` folded into `listOrgEdges(filter)`).
