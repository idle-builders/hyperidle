# AE2 Concept Verification -- Team Creation & Onboarding Journey

## Verdict: No new primitives. No concept reshaping required.

AE2 is a **wiring workpackage** -- it connects existing, concept-locked primitives into a user-facing flow. Every noun in the spec is already defined and stable.

---

## Phase 0 -- Noun Inventory

| Noun | Where it lives | Classification | Notes |
|---|---|---|---|
| **Team function** | `TEAM_FUNCTIONS` constant (`packages/shared/src/agent-roles.ts:19-28`), `functions` column on `teams` table (`packages/db/src/schema.ts:32`) | Stable | Open vocabulary. 8 known values. AB0 defined. |
| **Default roster** | `defaultRoster()` function (`packages/shared/src/agent-roles.ts:221-230`) | Stable | Pure function. Takes functions array, returns role strings. AB0 defined. Exists but never called in production. |
| **Agent role catalog** | `AGENT_ROLE_CATALOG` (`packages/shared/src/agent-roles.ts:42-196`) | Stable | 16 entries. Three categories (team/strategy/individual). AB0 defined. |
| **Soul template** | `factorySettings` table, key prefix `soul_template:<role>` | Stable | X3 defined. 7 templates seeded from `docs/souls/*.md`. |
| **Assistant** | AD8b concept-locked. `users` row with `role="assistant"`, `agentCategory="individual"`. | Stable | Per-user. Created at registration. Thread at `thr-ast-{userId}`. |
| **Onboarding journey** | Feature flow. `SetupFlow.tsx` page at `/setup`. | Feature, not a primitive | Uses existing primitives: user creation, team creation, credential storage, navigation. |

**No noun enters Phase 1.** All nouns are stable concepts with existing contracts. The workpackage wires them; it does not reshape them.

---

## What AE2 actually does (feature-level, not concept-level)

1. **Wires `defaultRoster()` into team creation.** The POST `/api/teams` endpoint currently hardcodes builder + PM. AE2 changes it to accept `functions` in `CreateTeamRequest`, call `defaultRoster(functions)`, and create agents from the result with soul templates pre-loaded.

2. **Adds a team function selector to SetupFlow.** The setup form gets a UI step where the user picks team functions (development, marketing, etc.). This determines which agents get created. No new primitive -- it reads from `TEAM_FUNCTIONS` and passes the selection to the team creation API.

3. **Wires the Assistant for conversational onboarding.** After setup, the user lands on a page where the Assistant overlay is open (or guided to open it). The Assistant responds to messages (AC-3 already works via AD8b's assistant dispatcher). The onboarding conversation is just a first-use pattern of the existing Assistant thread.

4. **Enriches the AgentAddDialog with catalog awareness.** The dialog already exists (AB3). AE2 ensures it shows role descriptions and pre-loads soul templates -- which it already does (line 89-109 of AgentAddDialog.tsx). AC-2 is **already satisfied** by the existing code.

---

## Contract verification -- existing contracts that AE2 must respect

| Contract | Source | AE2 impact |
|---|---|---|
| Team function is open vocabulary | `agent-roles.ts:17` comment, `docs/agent-layer/agent-structure.md` | AE2 shows known functions from `TEAM_FUNCTIONS` but must not prevent custom values in future. The UI presents the 8 known functions; the API accepts any string array. |
| Agent belongs to exactly one team | `docs/process-layer/teams-persistent-product-bound.md` section 4.1 | AE2 creates agents scoped to the new team's `teamMembers.id`. No cross-team assignment. |
| Assistant is per-user, not per-team | AD8b concept doc, `assistant.ts:118` | AE2 does not create an assistant during team creation. The assistant was already created at user registration (AC-1 AD8b, `users.ts:133`). |
| Soul template is a starting point, not the source of truth | `docs/agent-layer/agent-identity.md` section on soul prompts | AE2 copies the template into `users.soulPrompt` at agent creation time. The user can edit it afterward. The template in `factorySettings` is never read at runtime. |
| `users.teamId` references `team_members.id`, not `teams.id` | Schema lore comment, `AgentAddDialog.tsx` lore comment | AE2 must pass `teamMembers.id` (not `teams.id`) when creating agents during team setup. |

---

## Potential confusion points (not concept issues, but implementation traps)

1. **`teams.id` vs `teamMembers.id`**: The FK from `users.teamId` points at `team_members.id`. The POST `/api/teams` endpoint creates both, and the response includes both IDs. AE2 must use `teamMembers.id` when inserting agent rows.

2. **`functions` column is JSON text, not a Postgres array**: The `teams.functions` column stores a JSON-serialized string array (`text("functions")`). The API must `JSON.parse()` on read and `JSON.stringify()` on write. `defaultRoster()` takes a plain `string[]`, not a JSON string.

3. **Assistant soul template vs Assistant agent soul**: The assistant agent created at registration does NOT get a soul template from `factorySettings`. Its soul is loaded at session time from the `soulPrompt` column (which starts null, meaning the assistant uses its default persona). AE2 does not change this -- the assistant's onboarding behavior comes from the session dispatcher reading the soul template file `docs/souls/assistant.md`, not from `factorySettings`.

---

## Required reading for downstream skills

| File | Why |
|---|---|
| `packages/shared/src/agent-roles.ts` | `TEAM_FUNCTIONS`, `AGENT_ROLE_CATALOG`, `defaultRoster()` -- the data model for function-to-role mapping |
| `packages/server/src/routes/teams-routes.ts` lines 312-381 | POST `/api/teams` -- the endpoint to modify |
| `packages/server/src/routes/users.ts` lines 69-147 | POST `/api/users` -- user + assistant creation at setup |
| `packages/server/src/routes/assistant.ts` | GET `/api/threads/assistant` -- assistant thread resolution |
| `packages/web/src/pages/SetupFlow.tsx` | Current setup form -- the UI to extend |
| `packages/web/src/shell/AssistantOverlay.tsx` | Assistant overlay -- already built, needs no changes |
| `packages/web/src/pages/AgentAddDialog.tsx` | Add agent dialog -- already has role catalog integration |
| `packages/shared/src/team.ts` lines 119-127 | `CreateTeamRequest` / `CreateTeamResponse` types |
| `packages/db/src/schema.ts` lines 20-33 | Teams table schema including `functions` column |
| `packages/db/src/seed.ts` | Soul template seeding pattern |
| `docs/process-layer/teams-persistent-product-bound.md` | Team formation contracts |
| `docs/agent-layer/agent-identity.md` | Soul prompt contracts |

---

## Self-critique

**Is the "no new primitives" verdict correct?** Yes. The three potential candidates:
- "Team function" is not a primitive -- it is a property of the Team primitive, already modeled as a column.
- "Onboarding journey" is not a primitive -- it is a user flow composed from existing primitives.
- "Roster" is not a primitive -- it is a derived list of agents belonging to a team, already represented as `users WHERE teamId = X`.

**Are there vocabulary collisions?** No. "Function" in the context of team functions does not collide with JavaScript functions -- the context is always clear from `TEAM_FUNCTIONS` naming and the `teamFunctions` field on catalog entries.

**Are the contracts complete?** The five contracts listed above cover the critical constraints. No hand-waving on cardinality (one team per agent, one assistant per user) or mutability (soul prompt is mutable after creation, template is a copy).

**Does AE2 change what any existing concept means?** No. It only wires existing concepts together.
