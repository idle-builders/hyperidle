# AD8a Architecture Plan -- Agent Type System + Noun Purge (v2)

_Revised to address architecture critique v1 (score 6/10). Changes: comprehensive file enumeration from actual greps, eval scenario coverage, skill-tool role authorization handling, intermediate naming resolution, condensed section 8, expanded verification commands with correct exclusion lists, AC-1 integration test specified, security note on Rail API consumers._

## 1. Scope

AD8a is a vocabulary and schema cleanup workpackage. No behavioral changes. The app works identically after. Three deliverables:

1. **Schema migration**: rename `agentCategory` value `personal` to `individual`.
2. **Noun purge**: zero occurrences of dead nouns (Chief of Staff / CoS / CoC / coach / Rail-as-UI-concept) in code, docs, seeds, and tests -- with documented AD8b exclusions for structural identifiers.
3. **Doc rewrite**: replace `the-two-categories.md` with three-type taxonomy; update thread primitive docs; delete dead soul doc.

## 2. Acceptance criteria (from TRACK-AD.md + concept)

| AC | Description | Verification |
|----|-------------|-------------|
| AC-1 | `agentCategory` column accepts `individual` instead of `personal` | Integration test in `packages/db/src/__tests__/AD8a-category-rename.integration.test.ts`: insert a user with `agentCategory: "individual"` and read it back |
| AC-2 | Zero occurrences of `personal` as an agent category value in code, seeds, tests | grep verification (see section 11) |
| AC-3 | Zero code/doc occurrences of "Chief of Staff" / "chief_of_staff" / "CoS" (as HyperIdle concept) / "CoC" / "coach" (as HyperIdle concept) in display strings, comments, and docs | grep verification with explicit exclusion list (see section 11) |
| AC-4 | Zero code/doc occurrences of "Rail" as the HyperIdle right-sidebar UI concept | grep verification; `IconRail` (navigation component) is exempt |
| AC-5 | `docs/agent-layer/the-two-categories.md` replaced with three-type taxonomy doc | File exists, content matches taxonomy from concept |
| AC-6 | `docs/souls/chief-of-staff.md` deleted | File does not exist |
| AC-7 | Thread primitive docs updated: "coach" configuration becomes "assistant" configuration | grep verification on `thread-primitive.md` and `the-three-views-the-rail.md` |
| AC-8 | Orphaned Rail API routes/contract deleted | Files deleted, no import references |
| AC-9 | `npm run check` passes (zero type errors) | CLI |
| AC-10 | `npm run lint` passes (zero lint errors) | CLI |
| AC-11 | `npm run test` passes (all green) | CLI |

## 3. Schema migration -- `personal` to `individual`

### 3.1 What changes

The `users.agentCategory` column is an unconstrained `text` column (no CHECK constraint, no enum type). The value `"personal"` is written by:

1. `packages/db/src/seed.ts:126` -- `agentCategory: "personal"` on the CoS seed
2. `packages/db/src/seed.ts:317` -- `categoryByRole` map: `chief_of_staff: "personal"`
3. `packages/db/src/seed-fixtures.ts:44,80,92` -- `BUILTIN_ROUTINE_SEEDS` with `ownerAgentId: "seed-agent-cos"` (indirectly -- the owner's category)
4. `packages/shared/src/types.ts:101` -- `AGENT_CATEGORIES = ["team", "strategy", "personal"]`
5. `packages/shared/src/agent-roles.ts:184` -- `category: "personal"` on `chief_of_staff` entry
6. `packages/eval/src/seeding.ts:533` -- `agentCategory: "personal"`
7. Multiple test files referencing `"personal"` as a category value

### 3.2 Migration approach

Since `agentCategory` is a plain `text` column with no database-level CHECK constraint or enum type, the migration is a simple UPDATE statement. No column type change needed.

**Migration file:** `packages/db/drizzle/0027_AD8a_agent_type_rename.sql`

```sql
-- AD8a: Rename agent category "personal" -> "individual"
-- The agentCategory column is unconstrained text; this UPDATE covers all existing rows.
UPDATE users SET agent_category = 'individual' WHERE agent_category = 'personal';
```

**Drizzle metadata:** After writing the SQL migration, run `npm run db:generate` to check if Drizzle auto-generates anything. Since this is a data-only migration (no DDL), we write it by hand and add the corresponding meta entry. Check `packages/db/drizzle/meta/_journal.json` for the pattern.

### 3.3 Code changes for `personal` to `individual`

| File | Change |
|------|--------|
| `packages/shared/src/types.ts:101` | `["team", "strategy", "personal"]` -> `["team", "strategy", "individual"]` |
| `packages/shared/src/types.ts:95` | Comment: "personal: bound to a human user" -> "individual: bound to a human user" |
| `packages/shared/src/agent-roles.ts:180-189` | `category: "personal"` -> `category: "individual"`, label: "Chief of Staff" -> "Assistant" (see section 5) |
| `packages/shared/src/agent-roles.ts:39` | Comment: "team/strategy/personal" -> "team/strategy/individual" |
| `packages/db/src/schema.ts:73` | Comment: "team \| strategy \| personal" -> "team \| strategy \| individual" |
| `packages/db/src/seed.ts:126` | `agentCategory: "personal"` -> `agentCategory: "individual"` |
| `packages/db/src/seed.ts:317` | `chief_of_staff: "personal"` -> `chief_of_staff: "individual"` |
| `packages/eval/src/seeding.ts:532-533` | `agentCategory: "personal"` -> `agentCategory: "individual"` |
| `packages/shared/src/team.ts:51` | Comment: "team \| strategy \| personal" -> "team \| strategy \| individual" |
| `packages/web/src/settings/settings-types.ts:108` | Comment: "team \| strategy \| personal" -> "team \| strategy \| individual" |
| `packages/web/src/pages/WorkTeam.tsx:608` | `"personal"` -> `"individual"` |
| `packages/web/src/pages/WorkTeam.tsx:599` | Comment: "strategy/personal" -> "strategy/individual" |
| `packages/web/src/pages/AgentProfile.tsx:128` | Comment: "strategy/personal" -> "strategy/individual" |
| `packages/web/src/pages/AgentProfile.tsx:192-193` | `"personal"` -> `"individual"`, display label `"Personal"` -> `"Individual"` |
| `packages/web/src/pages/AgentEditDialog.tsx:9` | Comment: "Team/personal" -> "Team/individual" |

### 3.4 Test changes for `personal` to `individual`

| File | Change |
|------|--------|
| `packages/web/src/pages/__tests__/WorkTeam.AB3.test.tsx:92,140,231,250,252` | All `"personal"` -> `"individual"` |
| `packages/shared/src/__tests__/types.test.ts:81` | `"personal"` -> `"individual"` |
| `packages/shared/src/__tests__/agent-roles.test.ts:91,127,237,253,256` | All `"personal"` -> `"individual"` |

## 4. Seed data updates

### 4.1 The `seed-agent-cos` question

**Decision: Keep the seed row, update values.** Rationale:

1. `seed-agent-cos` is referenced as `ownerAgentId` by 3 builtin routines in `seed-fixtures.ts` (cost-sentinel, portfolio-retro, knowledge-decay) and by the daily-digest routine/task in `seed.ts`.
2. The coach route (`packages/server/src/routes/coach.ts`) hardcodes `COC_AGENT_ID = "seed-agent-cos"`.
3. Multiple integration tests seed this ID.
4. Deleting the row would break FK constraints on routines and tasks.

### 4.2 Seed display name: "System Agent" (not "Assistant")

**Critique response (WARNING-1):** The concept doc says assistants are per-user agents. Naming the shared singleton seed "Assistant" creates a confusing intermediate state. Instead, the seed's `name` changes from "Chief of Staff" to **"System Agent"** -- a neutral, transitional name that does not collide with the concept's per-user assistant.

**What changes on the seed row:**
- `name`: "Chief of Staff" -> "System Agent"
- `role`: "chief_of_staff" stays (AD8b renames to "assistant")
- `agentCategory`: "personal" -> "individual"

Add `@lore AD8a` comment on the seed row: "Transitional name. AD8b creates per-user assistant agents and retires this shared singleton. The name 'System Agent' avoids collision with the concept's per-user assistant."

### 4.3 AGENT_ROLE_CATALOG label: "System Agent" (not "Assistant")

Same reasoning. The AGENT_ROLE_CATALOG `label` for `chief_of_staff` becomes "System Agent". AD8b replaces the entire entry when it renames the role.

### 4.4 All display name replacements use "System Agent"

Everywhere the plan says to replace "Chief of Staff" as a display name, the replacement is **"System Agent"** (not "Assistant"). This applies to:
- Seed data `name` field
- AGENT_ROLE_CATALOG `label` field
- Coach route `COC_AGENT_DISPLAY_NAME` constant
- Test fixtures and mock data that display the agent name
- E2E test matchers for button/dialog names
- Eval seeding stub name

**Exception:** The `docs/` content uses "assistant" (lowercase) when describing the concept's future per-user agent. This is correct -- docs describe the target state, not the transitional state. The W3-sidebar tests that already assert `"Assistant"` are testing the sidebar button label (which is a UI label for the overlay trigger, not the agent name) -- leave those as-is.

### 4.5 Routine ownership

AD8a does NOT reassign routine ownership. The seed row survives (renamed), FKs stay valid. AD8b and AD8c handle reassignment.

### 4.6 Seed changes summary

**`packages/db/src/seed.ts`:**
- Line 122-129: Change `name: "Chief of Staff"` to `name: "System Agent"`, `agentCategory: "personal"` to `agentCategory: "individual"`. Add `@lore AD8a` comment.
- Line 151-159: Change `soulPromptPath: "docs/souls/chief-of-staff.md"` to `soulPromptPath: null` (soul file is being deleted)
- Line 226: `updatedBy: "seed-agent-cos"` -- keep (FK reference)
- Line 263-271: Remove the `{ role: "chief_of_staff", filename: "chief-of-staff.md" }` entry from `soulTemplates`
- Line 317: `chief_of_staff: "personal"` -> `chief_of_staff: "individual"`
- Lines 356, 372: `ownerAgentId: "seed-agent-cos"` -- keep (FK references)

**`packages/db/src/seed-fixtures.ts`:**
- No changes needed. `ownerAgentId: "seed-agent-cos"` values are FK references that remain valid.

**`packages/fabric/src/services/builtin-routines.ts`:**
- Lines 99, 132, 143: `ownerAgentId: "seed-agent-cos"` -- keep (FK references)
- Line 155: Update comment: "seed-agent-cos" description to note it is now "System Agent"

**`packages/eval/src/seeding.ts`:**
- Line 527-535: `name: "Chief of Staff (eval stub)"` -> `name: "System Agent (eval stub)"`, `agentCategory: "personal"` -> `agentCategory: "individual"`. Keep `role: "chief_of_staff"` (AD8b scope). Update comment on line 532.

### 4.7 Stale `factorySettings` row for `soul_template:chief_of_staff`

**Critique response (WARNING-4):** Removing the soul template seed entry means new seed runs will not write the `soul_template:chief_of_staff` key to `factorySettings`. Existing databases will have stale data. This is acceptable for AD8a -- AD8b will clean up `factorySettings` when it renames the role and creates a new soul template. Add `@lore AD8a` comment in seed.ts noting: "Stale `soul_template:chief_of_staff` key may persist in existing databases. AD8b removes it when creating the new assistant soul template."

## 5. AGENT_ROLE_CATALOG update

**`packages/shared/src/agent-roles.ts`:**

The `chief_of_staff` entry at line 182-189 changes:
- `label`: "Chief of Staff" -> "System Agent"
- `category`: "personal" -> "individual"
- `description`: "L4 facilitator. Routes work, compiles portfolio retros, coaches PMs." -> "Transitional system agent. AD8b replaces with per-user assistant."
- `hasTemplate`: `true` -> `false` (the soul file is deleted)

The `role` value `"chief_of_staff"` stays -- AD8b renames it.

The `// Personal agents` section comment (line 180) -> `// Individual agents`.

## 6. Doc changes

### 6.1 Files to DELETE

| File | Reason |
|------|--------|
| `docs/souls/chief-of-staff.md` | Dead noun. Soul is being decomposed. AD8b creates `assistant.md`, AD8c creates updated `facilitator.md`. |

### 6.2 Files to REWRITE

#### `docs/agent-layer/the-two-categories.md` -- becomes three-type taxonomy

Replace the entire content with the three-type taxonomy from the concept doc. New content:

```markdown
## 3. The Three Agent Types

Every AI agent has exactly one type. The type determines scope, visibility, and tool access.

### 3.1 Team Agents (Product-Scoped)

These agents are bound to a product team. They do the visible work: build, manage, grow, operate.

| Role | Key responsibility |
|------|--------------------|
| **Product Manager** | Team lead. Shapes pitches, coordinates cycles, decomposes bets. |
| **Builder** (one or more) | Engineer. Implements features, writes code, tests, deploys. |
| **Growth Agent** | Landing pages, content, email, SEO, community, analytics. |
| **Ops Agent** | Deploys, monitors, handles support, incident response. |
| **Designer** | UX research, interaction design, visual design. |
| **QA Engineer** | Test plans, regression testing, bug triage. |

The roster flexes with the product's lifecycle phase and configured team functions.

### 3.2 Strategy Agents (Knowledge-Scoped)

These agents serve the factory's knowledge infrastructure. They work behind the scenes -- users rarely interact with them directly.

| Role | Key responsibility |
|------|--------------------|
| **Facilitator** (one per practice community) | Manages knowledge, surfaces cross-domain patterns, maintains taxonomy health. Communities: build, product, growth, ops, facilitation. |
| **Infra Agent** | SRE. Maintains shared infrastructure. |
| **Platform Agent** | DX engineer. Maintains shared tools, templates, CI/CD. |
| **Scout** | Analyst. Finds and evaluates market opportunities. |

Facilitators are special: they participate in every product team that has members in their community. This is how knowledge flows across products without explicit cross-team coordination.

### 3.3 Individual Agents (User-Scoped)

These agents are bound to a single human user. They act on the user's behalf with guardrails.

| Role | Key responsibility |
|------|--------------------|
| **Assistant** | Per-user personal operator. Can act on the user's behalf through conversation. |

Each human user gets their own assistant agent instance. The assistant can create bets, edit blocks, create tasks, submit reviews, and query knowledge -- anything the user can do through the UI, with risk-assessed guardrails for dangerous actions.

### 3.4 Type is not role

Type is structural (scope + power). Role is functional (what the agent does within its type). A builder and a PM are both team agents with different roles. Type determines which tools are available; role determines what the agent does with them.

### 3.5 Schema

`users.agentCategory` -- values: `team | strategy | individual`. Null for human users and system users.
```

#### `docs/human-interface-layer/thread-primitive.md` -- coach -> assistant

Line-by-line changes:

| Line | Current | Replacement |
|------|---------|-------------|
| 3 | `"review", "chat", "coach"` | `"review", "chat", "assistant"` |
| 16 | `coach-style threads attach to the user themselves` | `assistant-style threads attach to the user themselves` |
| 18 | `DM (host=agent/user, two participants), coach (host=user, pinned), feed (host=team/factory, broadcast)` | `DM (host=agent/user, two participants), assistant (host=user, pinned), feed (host=team/factory, broadcast)` |
| 24 | `legacy threads.kind = 'coach'` | `legacy threads.kind = 'coach'` (keep -- this is migration history, not current vocabulary) |

#### `docs/human-interface-layer/the-three-views-the-rail.md`

**Coach/CoS replacements** (all "Chief of Staff" -> "assistant"):

| Line(s) | Change |
|---------|--------|
| 13 | "The Chief of Staff's chat is persistent" -> "The assistant's chat is persistent" |
| 15 | "Read AI's persistent-context coach model" -> keep (external product reference) |
| 28 | "The Chief of Staff's chat thread is pinned" -> "The assistant thread is pinned" |
| 33 | "The Chief of Staff's ongoing conversation" -> "The assistant's ongoing conversation" |
| 51 | "at the Chief of Staff level" -> "at the assistant level" |
| 54 | "Chief of Staff's chat that need final approval" -> "assistant's chat that need final approval" |
| 63 | "What lives in the Chief of Staff's chat" -> "What lives in the assistant's chat" |
| 69 | "the Chief of Staff has been chewing on" -> "the assistant has been chewing on" |
| 71 | "The Chief of Staff has five loose anchors" -> "The assistant has five loose anchors" |
| 79 | "get drafted by the Chief of Staff" -> "get drafted by the assistant" |
| 100 | "route to the Chief of Staff's chat" -> "route to the assistant's chat" |
| 107 | "route to the Chief of Staff's chat" -> "route to the assistant's chat" |
| 221 | "retro prompt in the Chief of Staff's chat" -> "retro prompt in the assistant's chat" |
| 379 | "coach surface" -> "assistant surface" |
| 385 | "A coach-style thread" -> "An assistant-style thread" |
| 414 | "Coach thread" config -> "Assistant thread" config; "participants = {user, Chief of Staff}" -> "participants = {user, user's assistant}" |
| 464 | "A coach thread" -> "An assistant thread" |
| 479 | "its coach thread re-homes" -> "its assistant thread re-homes" |
| 487 | `"coach thread" (as a primitive)` in aliases -> `"assistant thread" (as a primitive)` |
| 494 | `(DM, coach, feed)` -> `(DM, assistant, feed)` |
| 506 | "on the Chief of Staff's coach configuration" -> "on the assistant's thread configuration" |
| 509 | "Coach-style threads" -> "Assistant-style threads" |
| 522 | "coach thread" -> "assistant thread" |
| 533 | `'coach'` in item kinds -> `'assistant'` (routing category rename) |

**Rail section**: The Rail section (4.2, lines 147-181) describes the right-sidebar UI concept deleted in U6. Replace section 4.2 content with: "The Rail (right-sidebar vital signs surface) was removed in U6. Cost, blockers, and awareness indicators now surface through the Conversations filter chips, WorkTeam agent health rows, and Sidebar triage badge. See AE1 for documentation hygiene." Keep the section number to avoid renumbering cascades. Update other Rail references (lines 85, 434, etc.).

**File rename consideration (SUGGESTION-3):** The file name `the-three-views-the-rail.md` itself contains "Rail". Decision: keep the filename as-is. Renaming it would break cross-references in other docs. Add a note at the top of the file: "Historical filename. The Rail was removed in U6." AE1 can rename the file if it does a deeper restructuring.

**Additional doc files with coach/CoS/Rail references to update:**

| File | Changes needed |
|------|---------------|
| `docs/human-interface-layer/three-views-the-rail.md` | Line 7: "coaching" -> "assistant conversation"; Line 13: "Chief of Staff's chat" -> "assistant's chat" |
| `docs/human-interface-layer/index.md` | Line 8: "Coach Conversation" -> "Assistant Conversation"; Line 20, 22: file titles reference "Rail" -- update |
| `docs/human-interface-layer/one-app-two-form-factors.md` | Line 45: "the coach" -> "the assistant" |
| `docs/human-interface-layer/the-cross-cutting-data-model.md` | Line 12: remove `coach`, add `assist`; Line 28: "Chief of Staff's chat" -> "assistant's chat" |
| `docs/human-interface-layer/interaction-cadences-notification-discipline.md` | Line 12: "Chief of Staff's chat" -> "assistant's chat" |
| `docs/human-interface-layer/inspirations.md` | Line 3: "persistent-context coach" -- keep (external product reference) |
| `docs/human-interface-layer/decisions.md` | Line 8: "Chief of Staff" -> "assistant" |
| `docs/human-interface-layer/the-holistic-user-journey.md` | Lines 11, 23, 29, 33: all "Chief of Staff" -> "assistant" |
| `docs/human-interface-layer/routing-how-items-find-the-right-view.md` | Lines 9, 19: "Chief of Staff's chat" -> "assistant's chat" |
| `docs/human-interface-layer/trust-building-slow-cumulative.md` | Line 6: "the Rail has a daily burn-rate strip" -> remove Rail reference |
| `docs/human-interface-layer/what-the-meta-layer-actually-ships-at-this-layer.md` | Line 6: "Conversations / Rail / Work" -> "Conversations / Work" |
| `docs/blocks/composition.md` | Line 12: "the Chief of Staff chat" -> "the assistant chat" |
| `docs/requirements/usability-requirements.md` | Lines 17, 23: "Coach thread" -> "assistant thread", "Chief of Staff" -> "assistant"; Lines 37-105: Rail section (UX-4, UX-8.2, UX-8.4) -- mark deprecated |
| `docs/requirements/decisions.md` | Lines 17, 19: "Chief of Staff" -> "assistant" |
| `docs/requirements/functional-requirements.md` | Lines 9, 45, 55, 79, 85, 89, 91, 109, 111, 121: all "Chief of Staff" -> "assistant" or "facilitator" depending on context |
| `docs/requirements/non-functional-requirements.md` | Line 7: Rail reference -- update |
| `docs/requirements/users-and-their-modes-of-engagement.md` | Line 23: "Coach" -> "Assist", "Chief of Staff" -> "assistant" |
| `docs/product/human-ai-collaboration.md` | Lines 9, 27, 48: "Chief of Staff" -> "assistant" / "facilitator" (depends on which decomposed concept applies) |
| `docs/product/feature-taxonomy.md` | Lines 31-33: "Coach" section -> "Assistant" section, "Chief of Staff agent" -> "assistant agent" |
| `docs/product/how-knowledge-compounds.md` | Lines 47, 102: "Chief of Staff" -> "assistant" / "facilitator" |
| `docs/product/vision-gap-audit.md` | Lines 136, 138: "Chief of Staff" -> "assistant" |
| `docs/product/launch-readiness-audit.md` | Lines 87-153, 235-263, 926-1068: extensive CoC/coach/CoS references -- update all |
| `docs/product/feature-journey-audit.md` | Lines 30, 57, 188, 227: "CoS" / "coach" / "Chief of Staff" -> "assistant" |
| `docs/architecture/components.md` | Lines 36-37, 54, 118, 141, 328: "coach" / "Chief of Staff" -> "assistant" |
| `docs/architecture/what-this-architecture-does-not-include.md` | Line 12: "Coach thread" -> "assistant thread" |
| `docs/architecture/data-flow-examples.md` | Line 18: "Coach thread" -> "assistant thread" |
| `docs/architecture/decisions.md` | Line 16: "Chief of Staff" -> "assistant" / "facilitator" |
| `docs/souls/practice-facilitator.md` | Line 42: "Chief of Staff" -> "assistant" |
| `docs/souls/product-manager.md` | Lines 28, 51: "Chief of Staff" / "CoS" -> "assistant" |
| `docs/guides/user/what-is-hyperidle.md` | Line 3: "coach the system" -> "guide the system" |
| `docs/guides/user/three-core-views.md` | Lines 30, 32: "Chief of Staff Thread" / "Chief of Staff agent" -> "assistant thread" / "assistant agent" |
| `docs/agent-layer/index.md` | Line 9: "the Rail" -> remove Rail reference |

## 7. Rail API purge -- orphaned files

The Rail UI was deleted in U6, but the server-side API route, contract, and supporting infrastructure survive. AD8a deletes or updates them.

**Security note:** The Rail API (`GET /api/rail`) has no external consumers beyond the deleted U6 UI component. No browser extensions, monitoring tools, or external integrations call this endpoint. The API is behind authentication. Safe to delete.

### 7.1 Files to DELETE

| File | Reason |
|------|--------|
| `packages/api-contract/src/rail.ts` | Dead Rail contract types. No consumers after U6 UI deletion. |
| `packages/api-contract/src/__tests__/contracts.test.ts` cluster 3 | Delete the Rail-specific test describes (`RailBet`, `RailBlocker`, `RailCostBurnRate`, `RailResponse`, `structural compatibility with server rail.ts`) -- lines 258-434. Keep the rest of the file. |
| `packages/server/src/routes/rail.ts` | Dead Rail route handler. Serves data for a UI that no longer exists. |
| `packages/server/src/routes/__tests__/rail.routes.integration.test.ts` | Tests for the dead route. |
| `packages/server/src/__tests__/rail.integration.test.ts` | Integration tests for the dead route. |

### 7.2 Files to EDIT (remove Rail imports/routes)

| File | Change |
|------|--------|
| `packages/api-contract/src/index.ts:15` | Delete Rail re-exports: `} from "./rail.js";` |
| `packages/server/src/app.ts:30` | Delete `import { createRailRoutes } from "./routes/rail.js";` |
| `packages/server/src/app.ts:385` | Delete `api.route("/rail", createRailRoutes(options.db, eventBus));` |

### 7.3 Rail references in non-API code (behavioral -- AD8a scope decisions)

These files use "rail" as a WebSocket topic or routing target, not as a UI concept name. They represent functional behavior tied to the deleted Rail surface.

| File | Lines | Content | Decision |
|------|-------|---------|----------|
| `packages/server/src/services/ws-broadcaster.ts` | 60, 84-89, 213, 221 | Broadcasts events to `"rail"` topic; `GLOBAL_TOPICS` includes `"rail"` | **AD8b scope.** The topic name is a protocol-level string. Renaming it requires coordinating server+client changes and is a behavioral change. Add `@lore AD8a` comment. |
| `packages/web/src/services/ws-client.ts` | 183, 188 | Subscribes to `"rail"` topic | **AD8b scope.** Same reasoning as ws-broadcaster. Add `@lore AD8a` comment. |
| `packages/server/src/__tests__/ws-subscribe-authz.integration.test.ts` | 5, 130, 142 | Tests `"rail"` topic subscription | **AD8b scope.** Tests for the topic that AD8b renames. Add `@lore AD8a` comment. |
| `packages/fabric/src/services/item-router.ts` | 9, 25 | Returns `"rail"` as a routing target | **AD8b scope.** The return value `"rail"` is used by callers. Changing it is a behavioral change. Add `@lore AD8a` comment. |
| `packages/server/src/__tests__/item-router.test.ts` | 37-50 | Tests routing defaults to `"rail"` | **AD8b scope.** Tests for item-router behavior. Add `@lore AD8a` comment. |
| `packages/server/src/skill-tools/route-item.ts` | 26, 72 | `view: "conversations" \| "rail" \| "work" \| "knowledge"` type + description | **AD8b scope.** Changing the type union is a behavioral change. Add `@lore AD8a` comment. |
| `packages/shared/src/hint.ts` | 19, 54, 56 | `"rail-indicators"` hint ID and `testId: "hint-rail"` | **AD8b scope.** The hint ID is a persisted string (stored in user settings/dismissed hints). Changing it requires migration. Add `@lore AD8a` comment. |
| `packages/shared/src/__tests__/hint.test.ts` | 40, 98-99 | Tests for `"rail-indicators"` hint | **AD8b scope.** Add `@lore AD8a` comment. |

### 7.4 Rail references in E2E tests and component tests

| File | Lines | Content | Decision |
|------|-------|---------|----------|
| `packages/web/e2e/fixtures.ts` | 4, 49, 130-131, 209 | `DEFAULT_RAIL_RESPONSE` constant + Rail mock route | **Delete** the `DEFAULT_RAIL_RESPONSE` constant and Rail mock routes. The API no longer exists. |
| `packages/web/e2e/mock-data-purge.spec.ts` | 6-13, 46, 100-161 | Entire Rail test describe block (`M4 AC-3b`) | **Delete** the Rail test describe block. These tests verify Rail rendering from API data -- Rail UI is deleted. |
| `packages/web/e2e/M3-api-wiring.spec.ts` | 7, 31-39, 93-94, 179-187 | Rail response mock data + Rail test describe block | **Delete** the Rail mock data and Rail test describe block. |
| `packages/web/e2e/synthesis.spec.ts` | 4, 61-78 | "Collapsed Rail pills" test + Rail mock | **Delete** the entire "Collapsed Rail pills" test. The Rail UI does not exist. |
| `packages/web/e2e/keyboard-nav.spec.ts` | 29 | Comment: "rail regions" | **Update** comment to remove Rail reference. |
| `packages/web/e2e/keyboard-and-responsive.spec.ts` | 64 | `@lore U6: Submenu and Rail were deleted` | **Update** comment: this is historical context that is fine to keep as `@lore`. No change needed -- it describes what U6 did. |
| `packages/web/e2e/work-bet-session.spec.ts` | 93 | Comment: "conversations rail" | **Update** comment to say "conversations" (remove "rail"). |
| `packages/web/e2e/settings-redesign.spec.ts` | 15, 200 | "AC-23: Rail is dimmed while settings is open" | **Update** comments to note Rail was deleted in U6. If the test block is dead (testing Rail dimming behavior that no longer exists), delete it. |
| `packages/web/e2e/L21-coc-overlay.spec.ts` | 5, 174, 184, 189 | "CoC trigger is visible in the Rail" | **Update** comments: "Rail" -> "sidebar" (the trigger moved to the sidebar in W3). |
| `packages/web/e2e/accessibility-K8.spec.ts` | 132 | Comment: "Rail's CollapsedPill" | **Update** comment to note this was removed. |
| `packages/web/src/__tests__/AppShell.test.tsx` | 23, 141-142 | `@lore U6: /api/rail` comments | **Keep** -- these are `@lore` comments documenting U6 history. They describe what was removed, not current state. |
| `packages/web/src/__tests__/M3-AppShell.no-mock.test.tsx` | 60, 153-157 | Rail mock stubs and `@lore U6` comments | **Delete** the Rail mock stub data (line 60). **Keep** `@lore` comments (153-157) -- they document history. |
| `packages/web/src/__tests__/U6-AppShell-sidebar.test.tsx` | 8, 92-97 | Tests asserting Rail is NOT rendered | **Keep** but update comments. These tests verify Rail stays deleted -- they are regression guards. |
| `packages/web/src/__tests__/L17-money-web.test.tsx` | 6-7 | `@lore U6: Rail (AC23) was removed` | **Keep** -- `@lore` documenting history. |
| `packages/web/src/__tests__/AppShell.settings-overlay.test.tsx` | 4-5, 60-64 | `@lore U6` comments about Rail deletion | **Keep** -- `@lore` documenting history. |
| `packages/web/src/__tests__/AppShell.P4-settings.test.tsx` | 11, 192-193 | Comments about Rail deletion | **Keep** -- historical documentation. |
| `packages/server/src/__tests__/api-availability.integration.test.ts` | 32 | `{ path: "/api/rail", description: "Rail" }` entry | **Delete** the Rail entry from the availability test. |
| `packages/server/src/__tests__/api-e2e.integration.test.ts` | 679-684 | Rail describe block testing `GET /api/rail` | **Delete** the Rail test describe block. |

## 8. Coach/CoC/CoS code purge

AD8a's boundary: rename user-facing display strings and update comments. Do NOT rename files, functions, or internal variable/constant names. Those structural renames are AD8b scope.

The grep verification for AC-3 excludes files where only structural identifiers (function names, file names, variable names, API paths, WebSocket topics) contain the dead noun. These files get `@lore AD8a` comments marking them as AD8b rename targets.

### 8.1 Server code changes

| File | Line(s) | Change |
|------|---------|--------|
| `packages/server/src/routes/coach.ts` | 10 | Comment: "Chief of Staff facilitator agent" -> "system agent (AD8b: rename to assistant)" |
| `packages/server/src/routes/coach.ts` | 28 | `COC_AGENT_DISPLAY_NAME = "Chief of Staff"` -> `"System Agent"` |
| `packages/server/src/routes/coach.ts` | all comments | Update "CoC agent" -> "system agent" / "assistant agent" where describing the concept |
| `packages/server/src/routes/__tests__/coach.routes.integration.test.ts` | 60, 62, 144, 231 | Update comments: "CoC agent" -> "system agent". Update string assertions: `name: "Chief of Staff"` -> `name: "System Agent"` if used in seed data within the test. |
| `packages/server/src/__tests__/M3-threads-coach-auth.integration.test.ts` | 48, 51 | Comment: "Seed the CoC agent" -> "Seed the system agent"; `name: "Chief of Staff"` -> `name: "System Agent"` |
| `packages/server/src/__tests__/builtin-routines.integration.test.ts` | 47-48 | `name: "Chief of Staff"` -> `name: "System Agent"`, keep `role: "chief_of_staff"` |
| `packages/server/src/__tests__/notifications/routine-digest.integration.test.ts` | 85-86 | `name: "Chief of Staff"` -> `name: "System Agent"`, keep `role: "chief_of_staff"` |
| `packages/server/src/__tests__/founder-router.test.ts` | 25-26 | Comment and test name: "routes 'chief_of_staff' to both" -- keep as-is (this tests the role string routing, which is AD8b scope). Add `@lore AD8a` comment. |
| `packages/server/src/__tests__/mcp-bridge.integration.test.ts` | 138-139, 168, 177, 275 | Comments: "Use chief_of_staff to get all 15 tools" -- keep (role string usage). Add `@lore AD8a` comment on first occurrence. |

### 8.2 Web code changes

| File | Line(s) | Change |
|------|---------|--------|
| `packages/web/src/shell/CocOverlay.tsx` | 153 | `"Failed to load coach thread"` -> `"Failed to load assistant thread"` |
| `packages/web/src/shell/CocOverlay.tsx` | 195 | `hostTitle="Chief of Staff"` -> `hostTitle="System Agent"` |
| `packages/web/src/shell/CocOverlay.tsx` | 248 | `aria-label="Chief of Staff conversation"` -> `aria-label="System Agent conversation"` |
| `packages/web/src/shell/CocOverlay.tsx` | 251-255 | Comments: "Rail trigger area" -> "sidebar trigger area" |
| `packages/web/src/shell/CocOverlay.tsx` | 4 | Comment: "coach configuration" -> "assistant configuration" |
| `packages/web/src/components/CocAttachButton.tsx` | 40 | `aria-label={\`Attach ${cocRef.label} to Chief of Staff\`}` -> `aria-label={\`Attach ${cocRef.label} to System Agent\`}` |
| `packages/web/src/components/CocAttachButton.tsx` | 4, 29-30 | Comments: "CoC overlay" references are file-structural (AD8b). Add `@lore AD8a` comment. |
| `packages/web/src/__tests__/CocOverlay.test.tsx` | 50 | `name: "Chief of Staff"` -> `name: "System Agent"` in mock data |
| `packages/web/src/__tests__/CocOverlay.test.tsx` | 97, 100, 127, 129, 132, 155 | All `"Chief of Staff"` display name assertions -> `"System Agent"` |
| `packages/web/src/__tests__/CocOverlay.test.tsx` | 6, 8, 31, 120-123, 141, 147-149 | Comments: "coach configuration" -> "assistant configuration", "coach thread" -> "assistant thread" |
| `packages/web/src/__tests__/CocAttachButton.test.tsx` | 46, 81 | `chief of staff` in aria-label matchers -> `system agent` |
| `packages/web/src/__tests__/CocOverlay.block-ref.test.tsx` | 36 | `name: "Chief of Staff"` -> `name: "System Agent"` |
| `packages/web/src/__tests__/Sidebar.test.tsx` | 83, 298 | Comments: "Chief of Staff per W3 AC-1" -> remove "Chief of Staff" reference |
| `packages/web/src/pages/__tests__/W3-sidebar.test.tsx` | 5, 55-58, 61, 63 | Comments and assertions: "Chief of Staff" references. The assertions `screen.queryByText("Chief of Staff")` are regression guards -- they verify the old name is gone. **Keep** the assertion but update comments. |
| `packages/web/src/pages/__tests__/WorkTeam.AB3.test.tsx` | 89-90, 132-133, 208 | `name: "Chief of Staff"` -> `name: "System Agent"`, keep `role: "chief_of_staff"`. Update `screen.getByText("Chief of Staff")` -> `screen.getByText("System Agent")`. |
| `packages/web/scripts/visual-compare-map.ts` | 177 | `"Conversations — Chief of Staff chat view"` -> `"Conversations — System Agent chat view"` |
| `packages/web/src/components/ThreadSections.stories.tsx` | 26 | `"Chief of Staff — weekly"` -> `"System Agent — weekly"` |
| `packages/web/src/components/__tests__/ThreadSections.conversations.test.tsx` | 98 | `title: "Chief of Staff — weekly"` -> `title: "System Agent — weekly"` |
| `packages/web/src/fixtures/knowledge-data.ts` | 172 | `"...Escalate items with conflicting observations to the Chief of Staff agent."` -> `"...Escalate items with conflicting observations to the system agent."` |
| `packages/web/src/fixtures/knowledge-data.ts` | 245, 262 | `originAgent: "Chief of Staff"` -> `originAgent: "System Agent"` |
| `packages/web/src/pages/WorkRoutine.stories.tsx` | 21 | `agentName: "Chief of Staff"` -> `agentName: "System Agent"` |

### 8.3 DB test changes

| File | Line(s) | Change |
|------|---------|--------|
| `packages/db/src/__tests__/schema.integration.test.ts` | 282 | `name: "CoS"` -> `name: "Test Agent"` (this is test seed data, not a display name) |

### 8.4 Fabric code changes

| File | Line(s) | Change |
|------|---------|--------|
| `packages/fabric/src/services/builtin-routines.ts` | 155 | Comment: "seed-agent-cos" -> note it is now "System Agent" |
| `packages/fabric/src/services/founder-router.ts` | 14 | `case "chief_of_staff":` -- keep (role string, AD8b scope). Add `@lore AD8a` comment. |

### 8.5 Eval scenario files (NEW -- addresses CRITICAL-2)

Eight eval scenario files contain dead nouns. The `agentRole: "chief_of_staff"` values are role strings (AD8b scope). The description strings and soul prompts that say "Chief of Staff" or "CoS" are user-facing and must be purged in AD8a.

| File | Line(s) | Content | Change |
|------|---------|---------|--------|
| `packages/eval/src/scenarios/delegation.ts` | 58 | `agentRole: "chief_of_staff"` | Keep (AD8b). Add `@lore AD8a: role string renamed in AD8b` |
| `packages/eval/src/scenarios/delegation.ts` | 74 | `role: "chief_of_staff"` | Keep (AD8b). Add `@lore AD8a` |
| `packages/eval/src/scenarios/delegation.ts` | 76 | `"You are a delegate CoS agent."` | -> `"You are a delegate system agent."` |
| `packages/eval/src/scenarios/delegation.ts` | 201 | `agentRole: "chief_of_staff"` | Keep (AD8b). Add `@lore AD8a` |
| `packages/eval/src/scenarios/delegation.ts` | 214 | `role: "chief_of_staff"` | Keep (AD8b). Add `@lore AD8a` |
| `packages/eval/src/scenarios/routine-sessions.ts` | 55 | `agentRole: "chief_of_staff"` | Keep (AD8b). Add `@lore AD8a` |
| `packages/eval/src/scenarios/routine-sessions.ts` | 328 | `agentRole: "chief_of_staff"` | Keep (AD8b). Add `@lore AD8a` |
| `packages/eval/src/scenarios/score-attention.ts` | 224 | `id: "sa-item-noop-cos-marketing"` | Keep (test ID, not display). Add `@lore AD8a` |
| `packages/eval/src/scenarios/score-attention.ts` | 225 | `"CoS attempts to score an item..."` | -> `"System agent attempts to score an item..."` |
| `packages/eval/src/scenarios/score-attention.ts` | 230 | `agentRole: "chief_of_staff"` | Keep (AD8b). Add `@lore AD8a` |
| `packages/eval/src/scenarios/score-attention.ts` | 231 | `"You are a chief of staff managing..."` | -> `"You are a system agent managing..."` |
| `packages/eval/src/scenarios/promote-knowledge.ts` | 337, 343 | `id: "pk-archive-cos-marketing"` | Keep (test ID). Add `@lore AD8a` |
| `packages/eval/src/scenarios/promote-knowledge.ts` | 344 | `"CoS archives stale marketing..."` | -> `"System agent archives stale marketing..."` |
| `packages/eval/src/scenarios/promote-knowledge.ts` | 349 | `agentRole: "chief_of_staff"` | Keep (AD8b). Add `@lore AD8a` |
| `packages/eval/src/scenarios/promote-knowledge.ts` | 350 | `"You are a chief of staff responsible..."` | -> `"You are a system agent responsible..."` |
| `packages/eval/src/scenarios/create-conflict-review.ts` | 243, 249 | `id: "ccr-version-guard-cos-consulting"` | Keep (test ID). Add `@lore AD8a` |
| `packages/eval/src/scenarios/create-conflict-review.ts` | 250 | `"CoS version guard rejects..."` | -> `"System agent version guard rejects..."` |
| `packages/eval/src/scenarios/create-conflict-review.ts` | 255 | `agentRole: "chief_of_staff"` | Keep (AD8b). Add `@lore AD8a` |
| `packages/eval/src/scenarios/create-conflict-review.ts` | 256 | `"You are a chief of staff reviewing..."` | -> `"You are a system agent reviewing..."` |
| `packages/eval/src/scenarios/write-memory.ts` | 270, 274 | `id: "wm-facilitator-l4-cos-consulting"` | Keep (test ID). Add `@lore AD8a` |
| `packages/eval/src/scenarios/write-memory.ts` | 275 | `"Chief of Staff writes L4..."` | -> `"System agent writes L4..."` |
| `packages/eval/src/scenarios/write-memory.ts` | 280 | `agentRole: "chief_of_staff"` | Keep (AD8b). Add `@lore AD8a` |
| `packages/eval/src/scenarios/write-memory.ts` | 281 | `"You are a Chief of Staff at a consulting firm."` | -> `"You are a system agent at a consulting firm."` |
| `packages/eval/src/scenarios/route-item.ts` | 240, 246 | `id: "roi-verb-override-cos-marketing"` | Keep (test ID). Add `@lore AD8a` |
| `packages/eval/src/scenarios/route-item.ts` | 247 | `"Chief of Staff reclassifies..."` | -> `"System agent reclassifies..."` |
| `packages/eval/src/scenarios/route-item.ts` | 252 | `agentRole: "chief_of_staff"` | Keep (AD8b). Add `@lore AD8a` |
| `packages/eval/src/scenarios/route-item.ts` | 253 | `"You are a chief of staff managing portfolio items."` | -> `"You are a system agent managing portfolio items."` |
| `packages/eval/src/scenarios/skill-autonomy.ts` | 160 | `agentRole: "chief_of_staff"` | Keep (AD8b). Add `@lore AD8a` |

### 8.6 Skill-tool role authorization arrays (NEW -- addresses CRITICAL-3)

Five files in `packages/server/src/skill-tools/` have `roles: ["chief_of_staff", ...]` in their tool registration. These are role-string references that determine which agent roles can use each tool. The role string `"chief_of_staff"` is an internal constant renamed in AD8b. AD8a does not change these.

| File | Line(s) | Content | Decision |
|------|---------|---------|----------|
| `packages/server/src/skill-tools/score-attention.ts` | 152 | `roles: ["chief_of_staff", "practice_facilitator", "product_manager"]` | Keep (AD8b). Add `@lore AD8a: role string renamed in AD8b` |
| `packages/server/src/skill-tools/promote-knowledge.ts` | 183 | `roles: ["chief_of_staff", "practice_facilitator", "product_manager"]` | Keep (AD8b). Add `@lore AD8a` |
| `packages/server/src/skill-tools/route-item.ts` | 77 | `roles: ["chief_of_staff", "practice_facilitator", "product_manager"]` | Keep (AD8b). Add `@lore AD8a` |
| `packages/server/src/skill-tools/create-conflict-review.ts` | 107 | `roles: ["chief_of_staff", "practice_facilitator", "product_manager"]` | Keep (AD8b). Add `@lore AD8a` |
| `packages/server/src/skill-tools/write-memory.ts` | 47 | `"chief_of_staff"` in roles array | Keep (AD8b). Add `@lore AD8a` |

**Skill-tool test files** that pass `{ role: "chief_of_staff" }` to `buildToolRegistry`:

| File | Line(s) | Decision |
|------|---------|----------|
| `packages/server/src/skill-tools/__tests__/promote-knowledge.integration.test.ts` | 235 | Keep (AD8b). Add `@lore AD8a` |
| `packages/server/src/skill-tools/__tests__/tool-schemas.integration.test.ts` | 44, 47, 71, 93 | Keep (AD8b). Add `@lore AD8a` |
| `packages/server/src/skill-tools/__tests__/tool-registry.integration.test.ts` | 23, 52, 66, 75, 82, 94, 107 | Keep (AD8b). Add `@lore AD8a` |
| `packages/server/src/skill-tools/__tests__/tool-registry-role.integration.test.ts` | 88-89 | Keep (AD8b). Add `@lore AD8a` |
| `packages/server/src/skill-tools/__tests__/create-artifact-role.integration.test.ts` | 6, 46-47 | Keep (AD8b). Add `@lore AD8a` |
| `packages/server/src/skill-tools/__tests__/score-attention.integration.test.ts` | 130-131, 174, 194-195, 213-214 | Keep (AD8b). Add `@lore AD8a` |
| `packages/server/src/skill-tools/__tests__/route-item.integration.test.ts` | 44, 46 | Keep (AD8b). Add `@lore AD8a` |

### 8.7 Shared package: ThreadConfiguration type

The `ThreadConfiguration` type in `packages/shared/src/thread.ts` uses `"coach"` as a union member (line 195) and the `classifyThread` function returns `"coach"` (line 203). This is a **type-level structural identifier** -- changing it cascades to every consumer. AD8b scope. Add `@lore AD8a` comment.

### 8.8 E2E tests with "Chief of Staff" display names

| File | Line(s) | Change |
|------|---------|--------|
| `packages/web/e2e/L21-coc-overlay.spec.ts` | 45 | `name: "Chief of Staff"` -> `name: "System Agent"` in mock identities |
| `packages/web/e2e/L21-coc-overlay.spec.ts` | 190, 199, 207, 210, 214, 222, 226, 241, 244, 265, 268, 285, 288, 294, 300, 303, 308, 331, 333, 340, 346, 363, 366, 373 | All `/chief of staff/i` button/dialog matchers -> `/system agent/i` |
| `packages/web/e2e/T4-block-reference.spec.ts` | 32 | `name: "Chief of Staff"` -> `name: "System Agent"` |
| `packages/web/e2e/T4-block-reference.spec.ts` | 177, 179, 198, 200, 287, 290 | All `/chief of staff/i` matchers -> `/system agent/i` |
| `packages/web/e2e/W3-sidebar.spec.ts` | 73-74 | Comment and assertion: `"Chief of Staff"` -- this is a regression guard asserting the old name is NOT visible. **Keep** the assertion `await expect(page.getByText("Chief of Staff")).not.toBeVisible()` -- it remains a valid regression guard. Update comment. |

### 8.9 E2E tests with "coach" as API path / test data

These E2E files use "coach" as an API path (`/api/threads/coach`) or test data ID (`id: "coach"`). These are structural identifiers tied to the coach route that AD8b renames. AD8a scope is limited to updating comments that describe the concept.

| File | Lines | Decision |
|------|-------|----------|
| `packages/web/e2e/L21-coc-overlay.spec.ts` | 2, 5-7, 12, 25, 81, 118-119, 139, 179, 184, 189, 194, 203, 217, 311, 316 | Update comments describing the concept (e.g., "CoC trigger" -> "assistant trigger", "coach configuration" -> "assistant configuration"). Keep API paths (`/api/threads/coach`) and test IDs (`COACH_THREAD_ID`). |
| `packages/web/e2e/T4-block-reference.spec.ts` | 4, 13, 107-108, 128, 171, 176, 192, 197, 247 | Update comments. Keep API paths and `COACH_THREAD_ID`. |
| `packages/web/e2e/conversations-submenu.spec.ts` | 44, 66 | `id: "coach"` is test data (thread ID). Keep. Comment on line 66 ("coach + a1..a4") -- update to "assistant + a1..a4". |
| `packages/web/e2e/threads.spec.ts` | 44 | Comment: "GET /api/threads/coach" -- keep (describes the API path). |
| `packages/web/src/__tests__/AppShell.threads.test.tsx` | 51 | `id: "coach"` -- test data ID. Keep (AD8b). |

## 9. Task ordering

Tasks are ordered to minimize broken intermediate states. Each task should leave `npm run check` passing.

### Phase 1: Schema + types (foundation)

**Task 1: Write migration file + AC-1 integration test**
- Create `packages/db/drizzle/0027_AD8a_agent_type_rename.sql`
- Update drizzle meta journal (`packages/db/drizzle/meta/_journal.json`)
- Create integration test: `packages/db/src/__tests__/AD8a-category-rename.integration.test.ts`
  - Insert a user with `agentCategory: "individual"`, read it back, assert value matches
- Verify: `npm run db:migrate` succeeds locally

Files: `packages/db/drizzle/0027_AD8a_agent_type_rename.sql`, `packages/db/drizzle/meta/_journal.json`, `packages/db/src/__tests__/AD8a-category-rename.integration.test.ts`

**Task 2: Update shared types and constants**
- `packages/shared/src/types.ts`: `"personal"` -> `"individual"` in AGENT_CATEGORIES + comment
- `packages/shared/src/agent-roles.ts`: Update chief_of_staff catalog entry (label -> "System Agent", category -> "individual", description, hasTemplate -> false) + section comment
- `packages/shared/src/team.ts`: Update comment
- Verify: `npm run check` passes

Files: `packages/shared/src/types.ts`, `packages/shared/src/agent-roles.ts`, `packages/shared/src/team.ts`

**Task 3: Update shared tests**
- `packages/shared/src/__tests__/types.test.ts`: `"personal"` -> `"individual"`
- `packages/shared/src/__tests__/agent-roles.test.ts`: `"personal"` -> `"individual"`, label assertions if any
- Verify: `npm run test` passes for `packages/shared`

Files: `packages/shared/src/__tests__/types.test.ts`, `packages/shared/src/__tests__/agent-roles.test.ts`

### Phase 2: Seeds + DB code

**Task 4: Update seed data**
- `packages/db/src/seed.ts`: Update CoS seed entry (name -> "System Agent", category -> "individual"), remove chief-of-staff soul template entry, update categoryByRole, set soulPromptPath to null. Add `@lore AD8a` comments.
- `packages/db/src/schema.ts`: Update comment
- Verify: `npm run check` passes

Files: `packages/db/src/seed.ts`, `packages/db/src/schema.ts`

**Task 5: Update seed-related tests**
- `packages/db/src/__tests__/schema.integration.test.ts`: `name: "CoS"` -> `name: "Test Agent"`
- Any other DB tests referencing "Chief of Staff" or "personal"
- Verify: `npm run test:integration` passes for `packages/db`

Files: `packages/db/src/__tests__/schema.integration.test.ts`

### Phase 3: Delete Rail API

**Task 6: Delete Rail API files and references**
- Delete `packages/server/src/routes/rail.ts`
- Delete `packages/server/src/routes/__tests__/rail.routes.integration.test.ts`
- Delete `packages/server/src/__tests__/rail.integration.test.ts`
- Delete `packages/api-contract/src/rail.ts`
- Update `packages/api-contract/src/index.ts`: remove Rail re-exports
- Delete Rail test describes from `packages/api-contract/src/__tests__/contracts.test.ts`
- Update `packages/server/src/app.ts`: remove Rail import and route
- Delete Rail test describe from `packages/server/src/__tests__/api-e2e.integration.test.ts`
- Update `packages/server/src/__tests__/api-availability.integration.test.ts`: remove Rail entry
- Verify: `npm run check` passes

Files: (delete) `packages/server/src/routes/rail.ts`, `packages/server/src/routes/__tests__/rail.routes.integration.test.ts`, `packages/server/src/__tests__/rail.integration.test.ts`, `packages/api-contract/src/rail.ts`; (edit) `packages/api-contract/src/index.ts`, `packages/api-contract/src/__tests__/contracts.test.ts`, `packages/server/src/app.ts`, `packages/server/src/__tests__/api-e2e.integration.test.ts`, `packages/server/src/__tests__/api-availability.integration.test.ts`

### Phase 4: Server display string updates

**Task 7: Update coach route display strings + server tests**
- `packages/server/src/routes/coach.ts`: display name -> "System Agent", comments
- `packages/server/src/routes/__tests__/coach.routes.integration.test.ts`: assertions and comments
- `packages/server/src/__tests__/M3-threads-coach-auth.integration.test.ts`: display name, comments
- `packages/server/src/__tests__/builtin-routines.integration.test.ts`: display name
- `packages/server/src/__tests__/notifications/routine-digest.integration.test.ts`: display name
- `packages/server/src/__tests__/founder-router.test.ts`: add `@lore AD8a` comment
- `packages/server/src/__tests__/mcp-bridge.integration.test.ts`: add `@lore AD8a` comment
- `packages/fabric/src/services/builtin-routines.ts`: comment
- `packages/fabric/src/services/founder-router.ts`: add `@lore AD8a` comment
- Verify: `npm run test:integration` passes

Files: `packages/server/src/routes/coach.ts`, `packages/server/src/routes/__tests__/coach.routes.integration.test.ts`, `packages/server/src/__tests__/M3-threads-coach-auth.integration.test.ts`, `packages/server/src/__tests__/builtin-routines.integration.test.ts`, `packages/server/src/__tests__/notifications/routine-digest.integration.test.ts`, `packages/server/src/__tests__/founder-router.test.ts`, `packages/server/src/__tests__/mcp-bridge.integration.test.ts`, `packages/fabric/src/services/builtin-routines.ts`, `packages/fabric/src/services/founder-router.ts`

**Task 7b: Add `@lore AD8a` comments to skill-tool files and Rail infrastructure**
- 5 skill-tool source files: `score-attention.ts`, `promote-knowledge.ts`, `route-item.ts`, `create-conflict-review.ts`, `write-memory.ts`
- 7 skill-tool test files (see section 8.6)
- Rail infrastructure: `ws-broadcaster.ts`, `ws-client.ts`, `ws-subscribe-authz.integration.test.ts`, `item-router.ts` (fabric), `item-router.test.ts` (server), `hint.ts`, `hint.test.ts`
- Thread type: `packages/shared/src/thread.ts`
- Verify: `npm run check` passes

Files: `packages/server/src/skill-tools/score-attention.ts`, `packages/server/src/skill-tools/promote-knowledge.ts`, `packages/server/src/skill-tools/route-item.ts`, `packages/server/src/skill-tools/create-conflict-review.ts`, `packages/server/src/skill-tools/write-memory.ts`, `packages/server/src/skill-tools/__tests__/promote-knowledge.integration.test.ts`, `packages/server/src/skill-tools/__tests__/tool-schemas.integration.test.ts`, `packages/server/src/skill-tools/__tests__/tool-registry.integration.test.ts`, `packages/server/src/skill-tools/__tests__/tool-registry-role.integration.test.ts`, `packages/server/src/skill-tools/__tests__/create-artifact-role.integration.test.ts`, `packages/server/src/skill-tools/__tests__/score-attention.integration.test.ts`, `packages/server/src/skill-tools/__tests__/route-item.integration.test.ts`, `packages/server/src/services/ws-broadcaster.ts`, `packages/web/src/services/ws-client.ts`, `packages/server/src/__tests__/ws-subscribe-authz.integration.test.ts`, `packages/fabric/src/services/item-router.ts`, `packages/server/src/__tests__/item-router.test.ts`, `packages/shared/src/hint.ts`, `packages/shared/src/__tests__/hint.test.ts`, `packages/shared/src/thread.ts`

### Phase 5: Web code

**Task 8: Update web display strings and tests**
- `packages/web/src/pages/WorkTeam.tsx`: `"personal"` -> `"individual"`
- `packages/web/src/pages/AgentProfile.tsx`: `"personal"` -> `"individual"`, `"Personal"` -> `"Individual"`, comments
- `packages/web/src/pages/AgentEditDialog.tsx`: comment
- `packages/web/src/settings/settings-types.ts`: comment
- `packages/web/src/shell/CocOverlay.tsx`: error message, `hostTitle`, `aria-label`, comments
- `packages/web/src/components/CocAttachButton.tsx`: aria-label, comments
- `packages/web/scripts/visual-compare-map.ts`: description string
- `packages/web/src/components/ThreadSections.stories.tsx`: title
- `packages/web/src/fixtures/knowledge-data.ts`: display strings (3 occurrences)
- `packages/web/src/pages/WorkRoutine.stories.tsx`: agentName
- `packages/web/src/pages/__tests__/WorkTeam.AB3.test.tsx`: `"personal"` -> `"individual"`, `"Chief of Staff"` -> `"System Agent"`
- `packages/web/src/__tests__/CocOverlay.test.tsx`: display name assertions, comments
- `packages/web/src/__tests__/CocOverlay.block-ref.test.tsx`: mock data
- `packages/web/src/__tests__/CocAttachButton.test.tsx`: aria-label matchers
- `packages/web/src/__tests__/Sidebar.test.tsx`: comments
- `packages/web/src/pages/__tests__/W3-sidebar.test.tsx`: comments (keep assertions)
- `packages/web/src/components/__tests__/ThreadSections.conversations.test.tsx`: title in test data
- Verify: `npm run test` passes for web

**Task 9: Update E2E tests and fixtures**
- `packages/web/e2e/fixtures.ts`: delete `DEFAULT_RAIL_RESPONSE` constant and Rail mock routes
- `packages/web/e2e/mock-data-purge.spec.ts`: delete Rail test describe block
- `packages/web/e2e/M3-api-wiring.spec.ts`: delete Rail mock data and Rail test describe block
- `packages/web/e2e/synthesis.spec.ts`: delete "Collapsed Rail pills" test
- `packages/web/e2e/L21-coc-overlay.spec.ts`: "Chief of Staff" -> "System Agent" in matchers, update comments ("CoC" -> "assistant", "Rail" -> "sidebar")
- `packages/web/e2e/T4-block-reference.spec.ts`: "Chief of Staff" -> "System Agent", update comments
- `packages/web/e2e/W3-sidebar.spec.ts`: update comments
- `packages/web/e2e/keyboard-nav.spec.ts`: update comment
- `packages/web/e2e/keyboard-and-responsive.spec.ts`: keep `@lore` comment (historical)
- `packages/web/e2e/work-bet-session.spec.ts`: update comment
- `packages/web/e2e/settings-redesign.spec.ts`: update/delete Rail comments/tests
- `packages/web/e2e/accessibility-K8.spec.ts`: update comment
- `packages/web/e2e/conversations-submenu.spec.ts`: update comment
- `packages/web/e2e/threads.spec.ts`: keep comment (describes API path)
- `packages/web/src/__tests__/U6-AppShell-sidebar.test.tsx`: update comments
- `packages/web/src/__tests__/M3-AppShell.no-mock.test.tsx`: delete Rail mock stubs, keep `@lore` comments
- `packages/web/src/__tests__/AppShell.test.tsx`: keep `@lore` comments (historical)
- `packages/web/src/__tests__/AppShell.threads.test.tsx`: keep `id: "coach"` (AD8b)
- `packages/web/src/__tests__/AppShell.settings-overlay.test.tsx`: keep `@lore` comments
- `packages/web/src/__tests__/AppShell.P4-settings.test.tsx`: keep comments
- `packages/web/src/__tests__/L17-money-web.test.tsx`: keep `@lore` comment
- Verify: E2E tests pass for affected files

**Task 10: Update eval code**
- `packages/eval/src/seeding.ts`: name, category, comment
- 8 scenario files: update description strings and soul prompts, add `@lore AD8a` comments on `agentRole: "chief_of_staff"` lines (see section 8.5)

Files: `packages/eval/src/seeding.ts`, `packages/eval/src/scenarios/delegation.ts`, `packages/eval/src/scenarios/routine-sessions.ts`, `packages/eval/src/scenarios/score-attention.ts`, `packages/eval/src/scenarios/promote-knowledge.ts`, `packages/eval/src/scenarios/create-conflict-review.ts`, `packages/eval/src/scenarios/write-memory.ts`, `packages/eval/src/scenarios/route-item.ts`, `packages/eval/src/scenarios/skill-autonomy.ts`

### Phase 6: Doc rewrites

**Task 11: Delete and rewrite agent layer docs**
- Delete `docs/souls/chief-of-staff.md`
- Rewrite `docs/agent-layer/the-two-categories.md` as three-type taxonomy

**Task 12: Update thread primitive docs**
- `docs/human-interface-layer/thread-primitive.md`: coach -> assistant

**Task 13: Update three-views-the-rail doc**
- `docs/human-interface-layer/the-three-views-the-rail.md`: all Chief of Staff -> assistant, deprecate Rail section, add historical filename note

**Task 14: Update remaining docs (batch)**
- All remaining doc files listed in section 6.2 table
- This is the largest task by file count but each change is mechanical (find-replace within context)

### Phase 7: Verification

**Task 15: Grep verification + final test run**
- Run all grep commands from section 11
- Verify zero dead-noun occurrences (with documented exclusions)
- Run `npm run check && npm run lint && npm run test`

## 10. AC-1 integration test specification

**File:** `packages/db/src/__tests__/AD8a-category-rename.integration.test.ts`

```typescript
import { describe, test, expect } from "vitest";
import { users } from "../schema.js";
import { eq } from "drizzle-orm";

describe("AD8a — agentCategory 'individual' rename", () => {
  test("insert and read back a user with agentCategory 'individual'", async ({ db }) => {
    const id = "test-agent-ad8a";
    await db.insert(users).values({
      id,
      name: "AD8a Test Agent",
      isHuman: false,
      agentCategory: "individual",
    });
    const [row] = await db.select().from(users).where(eq(users.id, id));
    expect(row.agentCategory).toBe("individual");
  });

  test("migration converted existing 'personal' rows to 'individual'", async ({ db }) => {
    // After migration, no rows should have 'personal'
    const rows = await db.select().from(users).where(eq(users.agentCategory, "personal" as any));
    expect(rows).toHaveLength(0);
  });
});
```

## 11. Verification commands

```bash
# AC-1: agentCategory accepts "individual" -- verified by integration test
# packages/db/src/__tests__/AD8a-category-rename.integration.test.ts

# AC-2: Zero "personal" as agent category in code
grep -rn '"personal"' --include='*.ts' --include='*.tsx' packages/ \
  | grep -i 'agentCategory\|agent_category\|AGENT_CATEGORIES\|category.*personal\|personal.*category'
# Expected: 0 lines

# AC-3: Zero Chief of Staff / chief_of_staff / CoS / CoC / coach (HyperIdle concept)
# in display strings, comments, and docs.
#
# EXCLUSION LIST (AD8b scope — structural identifiers, not display strings):
#   Role string "chief_of_staff" in:
#     packages/shared/src/agent-roles.ts (role field)
#     packages/shared/src/__tests__/agent-roles.test.ts (role lookups)
#     packages/db/src/seed.ts (categoryByRole key, role field)
#     packages/eval/src/seeding.ts (role field)
#     packages/eval/src/scenarios/*.ts (agentRole field — 8 files)
#     packages/server/src/routes/coach.ts (COC_AGENT_ROLE constant)
#     packages/server/src/routes/__tests__/coach.routes.integration.test.ts (role in seed)
#     packages/server/src/__tests__/founder-router.test.ts (role routing test)
#     packages/server/src/__tests__/mcp-bridge.integration.test.ts (buildToolRegistry role)
#     packages/server/src/__tests__/M3-threads-coach-auth.integration.test.ts (role in seed)
#     packages/server/src/__tests__/builtin-routines.integration.test.ts (role in seed)
#     packages/server/src/__tests__/notifications/routine-digest.integration.test.ts (role in seed)
#     packages/server/src/skill-tools/*.ts (roles authorization arrays — 5 files)
#     packages/server/src/skill-tools/__tests__/*.ts (buildToolRegistry role — 7 files)
#     packages/fabric/src/services/founder-router.ts (role case)
#   File/function/variable names containing "coach" or "Coc":
#     packages/server/src/routes/coach.ts (file name, function names)
#     packages/server/src/routes/__tests__/coach.routes.integration.test.ts (file name)
#     packages/server/src/routes/threads.ts (import, route mount)
#     packages/web/src/shell/CocOverlay.tsx (file/component name)
#     packages/web/src/contexts/CocContext.tsx (file/component name)
#     packages/web/src/hooks/useCocThread.ts (file/hook name)
#     packages/web/src/components/CocAttachButton.tsx (file/component name)
#     packages/web/src/__tests__/CocOverlay*.test.tsx (file names)
#     packages/web/src/__tests__/CocAttachButton.test.tsx (file name)
#     packages/web/e2e/L21-coc-overlay.spec.ts (file name, API paths, thread IDs)
#     packages/web/e2e/T4-block-reference.spec.ts (API paths, thread IDs)
#     packages/web/e2e/conversations-submenu.spec.ts (thread ID)
#     packages/web/e2e/threads.spec.ts (API path comment)
#     packages/web/src/__tests__/AppShell.threads.test.tsx (thread ID)
#   ThreadConfiguration type "coach":
#     packages/shared/src/thread.ts (type union + classifyThread)
#   WebSocket topic "rail":
#     packages/server/src/services/ws-broadcaster.ts
#     packages/web/src/services/ws-client.ts
#     packages/server/src/__tests__/ws-subscribe-authz.integration.test.ts
#   Item router "rail" return value:
#     packages/fabric/src/services/item-router.ts
#     packages/server/src/__tests__/item-router.test.ts
#     packages/server/src/skill-tools/route-item.ts (type + description)
#   Hint system "rail-indicators":
#     packages/shared/src/hint.ts
#     packages/shared/src/__tests__/hint.test.ts
#   @lore comments documenting U6 Rail deletion (historical):
#     packages/web/src/__tests__/AppShell.test.tsx
#     packages/web/src/__tests__/AppShell.settings-overlay.test.tsx
#     packages/web/src/__tests__/AppShell.P4-settings.test.tsx
#     packages/web/src/__tests__/L17-money-web.test.tsx
#     packages/web/e2e/keyboard-and-responsive.spec.ts
#
# All excluded files have @lore AD8a comments marking them for AD8b.
#
# Grep commands (after all changes applied):

# 3a: "Chief of Staff" / "chief_of_staff" — should match ONLY in AD8b exclusion files
grep -rni 'chief.of.staff\|chief_of_staff' --include='*.ts' --include='*.tsx' --include='*.md' \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=plans --exclude-dir=archive \
  packages/ docs/ \
  | grep -v '@lore AD8a' \
  | grep -v 'role:.*"chief_of_staff"' \
  | grep -v 'agentRole:.*"chief_of_staff"' \
  | grep -v 'role.*=.*"chief_of_staff"' \
  | grep -v 'buildToolRegistry.*chief_of_staff' \
  | grep -v 'roles:.*"chief_of_staff"' \
  | grep -v 'case.*"chief_of_staff"' \
  | grep -v 'routeToFounder.*"chief_of_staff"' \
  | grep -v 'categoryByRole' \
  | grep -v 'queryByText.*"Chief of Staff"' \
  | grep -v 'getByText.*"Chief of Staff".*not'
# Expected: 0 lines. If any remain, they are missed display strings.

# 3b: "CoS" standalone word
grep -rn '\bCoS\b' --include='*.ts' --include='*.tsx' --include='*.md' \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=plans --exclude-dir=archive \
  packages/ docs/ \
  | grep -v '@lore AD8a' \
  | grep -v 'id:.*cos'
# Expected: 0 lines (scenario IDs like "sa-item-noop-cos-marketing" are test IDs, not the noun)

# 3c: "coach" as concept (excluding file names, API paths, thread type, thread IDs)
grep -rni '\bcoach\b' --include='*.ts' --include='*.tsx' --include='*.md' \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=plans --exclude-dir=archive \
  packages/ docs/ \
  | grep -v 'Read AI.*coach' \
  | grep -v 'migration.*coach' \
  | grep -v 'legacy.*coach' \
  | grep -v '@lore' \
  | grep -v 'import.*coach' \
  | grep -v 'from.*coach' \
  | grep -v 'route.*coach' \
  | grep -v '/api/threads/coach' \
  | grep -v 'createCoachRoutes' \
  | grep -v 'COACH_THREAD_ID' \
  | grep -v 'thr-coach' \
  | grep -v 'id:.*"coach"' \
  | grep -v 'ThreadConfiguration.*coach' \
  | grep -v 'return.*"coach"'
# Expected: 0 lines

# AC-4: Zero "Rail" as UI concept
grep -rni '\brail\b' --include='*.ts' --include='*.tsx' --include='*.md' \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=plans --exclude-dir=archive \
  packages/ docs/ \
  | grep -vi 'IconRail\|icon.rail\|icon_rail\|guardrail\|handrail\|monorail\|safety rail' \
  | grep -v '@lore' \
  | grep -v 'broadcast.*"rail"' \
  | grep -v 'topic.*"rail"' \
  | grep -v '"rail".*topic' \
  | grep -v 'GLOBAL_TOPICS.*rail' \
  | grep -v '"conversations".*"work".*"rail"' \
  | grep -v '"rail-indicators"' \
  | grep -v 'hint-rail' \
  | grep -v 'return.*"rail"' \
  | grep -v '"conversations".*"rail".*"work"' \
  | grep -v 'view:.*rail' \
  | grep -v 'item-router' \
  | grep -v 'route-item'
# Expected: 0 lines

# AC-8: Orphaned Rail files deleted
test ! -f packages/api-contract/src/rail.ts && echo "PASS" || echo "FAIL"
test ! -f packages/server/src/routes/rail.ts && echo "PASS" || echo "FAIL"
test ! -f packages/server/src/routes/__tests__/rail.routes.integration.test.ts && echo "PASS" || echo "FAIL"
test ! -f packages/server/src/__tests__/rail.integration.test.ts && echo "PASS" || echo "FAIL"

# AC-6: Soul file deleted
test ! -f docs/souls/chief-of-staff.md && echo "PASS" || echo "FAIL"

# AC-9/10/11: Build and tests
npm run check
npm run lint
npm run test
```

## 12. Risk register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Drizzle migration journal format wrong | Migration fails | Read existing journal entries to match format before writing |
| `chief_of_staff` role string change cascades | Type errors everywhere | Keep role string as-is in AD8a; AD8b handles role rename |
| E2E tests fail after Rail API deletion | CI broken | Delete Rail-specific E2E tests in same commit as API deletion |
| E2E tests fail after "Chief of Staff" -> "System Agent" rename | CI broken | Update all E2E button/dialog matchers in same commit as display name change |
| AE1 overlap (Rail doc purge) | Duplicate work | AD8a does code deletion + doc noun replacement. AE1 does deeper restructuring. |
| AD8b conflict (coach route/overlay rebuild) | Merge conflict | AD8a only changes display strings, not file/function structure. Minimal conflict surface. |
| Eval scenarios break after soul prompt changes | Eval regressions | Soul prompt changes are string-only (no behavioral change). The prompts still describe the same agent behavior, just with different terminology. |
| `@lore AD8a` comment volume | Comment noise | Batch per-file: one `@lore AD8a` at the top of each excluded file, not per-line. |

## 13. What AD8a does NOT do

- Rename `chief_of_staff` role string to `assistant` (AD8b)
- Create assistant soul template (AD8b)
- Rename coach.ts -> assistant.ts (AD8b)
- Rename CocOverlay -> AssistantOverlay (AD8b)
- Rename CocContext -> AssistantContext (AD8b)
- Rename useCocThread -> useAssistantThread (AD8b)
- Rename CocAttachButton -> AssistantAttachButton (AD8b)
- Change API route from `/api/threads/coach` to `/api/threads/assistant` (AD8b)
- Rename WebSocket topic `"rail"` (AD8b)
- Rename item-router return value `"rail"` (AD8b)
- Rename hint ID `"rail-indicators"` (AD8b)
- Rename ThreadConfiguration union member `"coach"` (AD8b)
- Rename `"rail"` in route-item tool type/description (AD8b)
- Rename skill-tool role authorization arrays `"chief_of_staff"` entries (AD8b)
- Reassign routine ownership (AD8b/AD8c)
- Create facilitator soul template (AD8c)
- Convert cost-sentinel to application code (AD8c)
- Clean up stale `soul_template:chief_of_staff` factorySettings key (AD8b)

## 14. Self-critique

1. **Is the scope right?** The boundary between "noun purge" and "structural rename" is clear: AD8a changes what humans see (display names, docs, schema values, user-facing strings). AD8b changes what code sees (file names, function names, route paths, WebSocket topics, type unions, role strings). This avoids half-done structural changes that break imports.

2. **Migration risk?** Low. The `agentCategory` column has no CHECK constraint. The UPDATE is safe.

3. **"System Agent" vs "Assistant"?** "System Agent" is deliberately boring and transitional. It does not promise the per-user assistant behavior that the concept describes. When AD8b creates per-user assistants, it replaces this singleton entirely. The name communicates "this agent exists for system reasons" rather than "this is your personal assistant."

4. **Eval scenario IDs containing "cos".** Scenario IDs like `sa-item-noop-cos-marketing` and `pk-archive-cos-marketing` contain "cos" as a substring. These are test identifiers, not user-facing display strings. Renaming them would break eval result tracking/comparison. They stay with `@lore AD8a` comments. AD8b may rename them if desired.

5. **@lore comment strategy.** One `@lore AD8a` comment per file at the relevant location (not per-line). The comment says what AD8b will do, not what AD8a decided. This keeps the comment useful for the next agent without being noisy.

6. **File count.** ~25 code files to edit, ~8 eval scenario files, ~40 doc files, ~20 test/E2E files, ~4 files to delete. Total: ~97 files touched. The doc purge (Task 14) is the largest single task. The builder should batch doc changes into one commit.

7. **Rail exclusion list is larger than expected.** The Rail noun lives in WebSocket topics, item-router, hint system, and route-item tool type -- all behavioral code that cannot be string-replaced without cascading changes. The `@lore AD8a` comments ensure AD8b picks up all of these.
