# Teams: Persistent

<!-- @source framework/db/src/schema.ts -->
<!-- @source layers/core-api/src/routes/teams-routes.ts -->
<!-- @source layers/core-ui/src/pages/WorkTeam.tsx -->

A team is a persistent, product-bound group of agents. In code the merge is literal (U1): the `teams` table IS the domain entity formerly called `products`, and the old agent-membership table is now `teamMembers` — one `teamMembers` row per `teams` row, the 1:1 Product=Team invariant (`framework/db/src/schema.ts`, migration `0021_U1_schema_migration.sql`). The team includes whoever the product needs — typically a Product Manager (lead by default), one or more Builders, a Reviewer for the product's primary artifact type, and any specialty agents the product calls for.

For the Team primitive's place among the four, see [The four primitives](./the-four-primitives.md).

## 1. Forming a team

Team formation runs through Conversations as a review item (`layers/core-api/review/src/review-item-factory.ts`). The proposed team — these agents, this lead, this capacity — is posted for the founder's verdict. Approving the team kicks off the product. Membership is visible in the Work view (`WorkTeam.tsx` roster) and editable through subsequent review items (proven by `AK6-user-team-handoff.integration.test.ts`).

Roster creation today (AK6): the Strategy proposes `AgentScaffoldSpec`s (persona, role — the *who*), the Kernel attaches identity + mechanism fields and persists the rows, assigning the lead (`layers/core-api/org/src/scaffold-agents.ts` — lead = first product-manager, else first agent). There is no pre-existing agent pool to draw from.

Formation criteria:

- **Skill match** — does the team have agents with the skills the product will need?
- **Capacity** — is this agent already on another team? **An agent belongs to exactly one team**, enforced by the single FK `users.teamId → teamMembers.id` (schema.ts, `onDelete: "restrict"`). If the agent is needed here, it must leave its current team first — only when its work there is done.
- **Practice diversity** — does the team draw from enough practices that no single discipline is missing?
- **Lead fit** — the Product Manager should match the product's stage (early-shaping vs. mature-iteration is a different muscle).

## 2. Persistence and muscle memory

The team persists for the life of the product. Successive tasks pass through the same team. The team's shared knowledge lives in the **team scope** — its own scope kind, read by every member. Team scope is *not* a knowledge layer: `scopeToLayer` maps task→L1, product→L2, practice→L3, factory→L4, and **team→null** (`scopeToLayer`, `framework/domain-model/src/knowledge.ts`). For the layer taxonomy, see [The five layers](../knowledge-architecture/the-five-layers.md).

This is what makes the second root task faster than the first, and the tenth faster than the second. Every completed task adds to the team's muscle memory: which assumptions held, which broke, which failure modes are common in this product, which artifacts are reusable.

## 3. When teams change

Teams are not frozen. Membership can change between tasks, but **an agent never leaves a team while it's working on something**. An agent only leaves when it isn't needed — its current sessions are done and its tasks are handed off cleanly. (Routine-dependency checking on departure is not yet implemented.)

The legitimate change reasons:

- **Add a member** — a new skill became necessary. Goes through Conversations as a review item.
- **Remove a member** — the agent's skill is no longer needed *and* it has no active work on this team. Same.
- **Replace a lead** — the product's stage shifted and a different lead fits better. The old lead doesn't leave the team unless its work is also done; it just stops being the lead (`teamMembers.leadAgentId`).

What teams don't do is dissolve at ship. A completed root task means the team is *between tasks*, not gone — `teams`/`teamMembers` rows persist (FKs `onDelete: "restrict"`, schema.ts), routines owned by the team's members keep firing (routines table is independent, schema.ts), and when the next task is committed for that product, the team picks it up.

## 4. When teams dissolve

Only when the product dissolves. Killing a product is a deliberate founder decision, ratified through Conversations, and dissolving the team is part of the kill ritual. The team's accumulated knowledge is archived into the practice scope, so the practice keeps the lessons even when the product is gone.

## 5. Filesystems attach here

An agent within a team can have a **filesystem** attached — the durable working files its output lives in (a git repo for code, a document set for non-code). The registry is team-scoped (`filesystems` table, FK to `teams`); per-agent wiring is the separate `filesystemInjections` mapping. See [Filesystem primitive](./filesystem-primitive.md).
