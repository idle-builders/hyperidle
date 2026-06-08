# AD8a Architecture Plan -- Agent Type System + Noun Purge

## 1. Scope

AD8a is a vocabulary and schema cleanup workpackage. No behavioral changes. The app works identically after. Three deliverables:

1. **Schema migration**: rename `agentCategory` value `personal` to `individual`.
2. **Noun purge**: zero occurrences of dead nouns (Chief of Staff / CoS / CoC / coach / Rail-as-UI-concept) in code, docs, seeds, and tests.
3. **Doc rewrite**: replace `the-two-categories.md` with three-type taxonomy; update thread primitive docs; delete dead soul doc.

## 2. Acceptance criteria (from TRACK-AD.md + concept)

| AC | Description | Verification |
|----|-------------|-------------|
| AC-1 | `agentCategory` column accepts `individual` instead of `personal` | Integration test: insert a user with `agentCategory: "individual"` and read it back |
| AC-2 | Zero occurrences of `personal` as an agent category value in code, seeds, tests | `grep -rn "personal" --include='*.ts' --include='*.tsx' \| grep -i 'agentCategory\|agent_category\|AGENT_CATEGORIES'` returns 0 lines |
| AC-3 | Zero code/doc occurrences of "Chief of Staff" / "chief_of_staff" / "CoS" (as HyperIdle concept) / "CoC" / "coach" (as HyperIdle concept) | grep verification (see section 10) |
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

1. `packages/db/src/seed.ts` line 126: `agentCategory: "personal"` on the CoS seed
2. `packages/db/src/seed.ts` line 317: `categoryByRole` map: `chief_of_staff: "personal"`
3. `packages/db/src/seed-fixtures.ts` lines 44, 80, 92: `BUILTIN_ROUTINE_SEEDS` with `ownerAgentId: "seed-agent-cos"` (indirectly -- the owner's category)
4. `packages/shared/src/types.ts` line 101: `AGENT_CATEGORIES = ["team", "strategy", "personal"]`
5. `packages/shared/src/agent-roles.ts` line 184: `category: "personal"` on `chief_of_staff` entry
6. `packages/eval/src/seeding.ts` line 533: `agentCategory: "personal"`
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
| `packages/shared/src/agent-roles.ts:180-189` | `category: "personal"` -> `category: "individual"`, label: "Chief of Staff" -> TBD (see section 4.2) |
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
| `packages/web/src/pages/AgentProfile.tsx:192` | `"personal"` -> `"individual"` |
| `packages/web/src/pages/AgentEditDialog.tsx:9` | Comment: "Team/personal" -> "Team/individual" |

### 3.4 Test changes for `personal` to `individual`

| File | Change |
|------|--------|
| `packages/web/src/pages/__tests__/WorkTeam.AB3.test.tsx:92,140,231,250,252` | All `"personal"` -> `"individual"` |
| `packages/shared/src/__tests__/types.test.ts:81` | `"personal"` -> `"individual"` |
| `packages/shared/src/__tests__/agent-roles.test.ts:91,127,237,253,256` | All `"personal"` -> `"individual"` |

## 4. Seed data updates

### 4.1 The `seed-agent-cos` question

The concept doc says: "seed-agent-cos -> replaced by per-user assistant agents + practice facilitators." For AD8a, we must decide: delete the seed row or keep it with updated values?

**Decision: Keep the seed row, rename it.** Rationale:

1. `seed-agent-cos` is referenced as `ownerAgentId` by 3 builtin routines in `seed-fixtures.ts` (cost-sentinel, portfolio-retro, knowledge-decay) and by the daily-digest routine/task in `seed.ts`.
2. The coach route (`packages/server/src/routes/coach.ts`) hardcodes `COC_AGENT_ID = "seed-agent-cos"`.
3. Multiple integration tests seed this ID.
4. Deleting the row would break FK constraints on routines and tasks.

**What changes on the seed row:**
- `name`: "Chief of Staff" -> "Assistant" (user-facing name change)
- `role`: "chief_of_staff" stays for now (AD8b will change role to "assistant"; AD8c handles facilitator extraction). Changing the role in AD8a would break the `categoryByRole` backfill and soul template lookup. The noun purge catches the user-facing name; the role value is an internal constant that AD8b addresses.
- `agentCategory`: "personal" -> "individual"

**Wait -- the role value `chief_of_staff` is itself a dead noun.** But the concept says AD8a is structural foundation. Changing the role value has cascading effects:
- The `categoryByRole` map in seed.ts (line 317) maps `chief_of_staff` -> category
- The AGENT_ROLE_CATALOG entry has `role: "chief_of_staff"`
- Soul template lookup uses `soul_template:chief_of_staff` key in factorySettings
- The `soulTemplates` array in seed.ts references `{ role: "chief_of_staff", filename: "chief-of-staff.md" }`

**Revised decision:** AD8a purges the *user-facing name* "Chief of Staff" but keeps `chief_of_staff` as the role constant for now. The role rename (`chief_of_staff` -> `assistant`) is AD8b scope because it requires creating a new soul template file, updating the AGENT_ROLE_CATALOG entry, updating `categoryByRole`, and rewiring the coach route. AD8a just:
1. Changes the seed `name` from "Chief of Staff" to "Assistant"
2. Changes `agentCategory` from `"personal"` to `"individual"`
3. Renames the AGENT_ROLE_CATALOG entry's `label` from "Chief of Staff" to "Assistant"
4. Updates the `description` to remove "coaches PMs" language
5. Deletes `docs/souls/chief-of-staff.md` (the soul file)
6. Removes the soul template seed entry for `chief_of_staff` (since the file is deleted)

**Important constraint for AD8b:** The `chief_of_staff` role string and the `soul_template:chief_of_staff` key in factorySettings are internal constants. AD8b will rename the role to `assistant` and create a new soul file. AD8a does not touch role strings.

### 4.2 Routine ownership reassignment

Three builtin routines are owned by `seed-agent-cos`:

| Routine | Current owner | AD8a action | Final owner (per concept) |
|---------|--------------|-------------|--------------------------|
| `builtin:cost-sentinel` | `seed-agent-cos` | Keep as-is | Application code (AD8c) |
| `builtin:portfolio-retro` | `seed-agent-cos` | Keep as-is | Assistant (AD8b) |
| `builtin:knowledge-decay` | `seed-agent-cos` | Keep as-is | Facilitator (AD8c) |

AD8a does NOT reassign routine ownership. The concept says cost-sentinel becomes application code (AD8c), portfolio-retro goes to assistant (AD8b), knowledge-decay goes to facilitator (AD8c). All three still reference `seed-agent-cos` as owner. Since the seed row survives (just renamed), the FK stays valid. AD8b and AD8c will handle reassignment.

### 4.3 Seed changes summary

**`packages/db/src/seed.ts`:**
- Line 122-129: Change `name: "Chief of Staff"` to `name: "Assistant"`, `agentCategory: "personal"` to `agentCategory: "individual"`
- Line 151-159: The update block patches soulPromptPath and skills on `seed-agent-cos`. Change `soulPromptPath: "docs/souls/chief-of-staff.md"` to `soulPromptPath: null` (soul file is being deleted; the inline `soulPrompt` will be set by the backfill below)
- Line 226: `updatedBy: "seed-agent-cos"` -- keep (it's just an author reference)
- Line 263-271: Remove the `{ role: "chief_of_staff", filename: "chief-of-staff.md" }` entry from `soulTemplates` (the file is being deleted)
- Line 317: `chief_of_staff: "personal"` -> `chief_of_staff: "individual"`
- Line 356: `ownerAgentId: "seed-agent-cos"` on daily-digest task -- keep (FK reference)
- Line 372: `ownerAgentId: "seed-agent-cos"` on daily-digest routine -- keep (FK reference)

**`packages/db/src/seed-fixtures.ts`:**
- No changes needed. The `ownerAgentId: "seed-agent-cos"` values are FK references that remain valid since the seed row survives.

**`packages/fabric/src/services/builtin-routines.ts`:**
- Lines 99, 132, 143: `ownerAgentId: "seed-agent-cos"` -- keep (FK references). The BUILTIN_SPECS comment on line 94 says "Owner agent ids match G1 seed ids"; that seed ID is unchanged.
- Line 155: Comment mentions `seed-agent-cos` -- update the comment to clarify it's now the "Assistant" agent.

**`packages/eval/src/seeding.ts`:**
- Line 527-535: `name: "Chief of Staff (eval stub)"` -> `name: "Assistant (eval stub)"`, `agentCategory: "personal"` -> `agentCategory: "individual"`. Keep `role: "chief_of_staff"` (AD8b scope).

## 5. AGENT_ROLE_CATALOG update

**`packages/shared/src/agent-roles.ts`:**

The `chief_of_staff` entry at line 182-189:
```
{
    role: "chief_of_staff",
    label: "Chief of Staff",
    category: "personal",
    description: "L4 facilitator. Routes work, compiles portfolio retros, coaches PMs.",
    community: "ops",
    teamFunctions: [],
    hasTemplate: true,
}
```

Changes:
- `label`: "Chief of Staff" -> "Assistant"
- `category`: "personal" -> "individual"
- `description`: "L4 facilitator. Routes work, compiles portfolio retros, coaches PMs." -> "Per-user individual agent. Acts on the user's behalf through conversation."
- `hasTemplate`: `true` -> `false` (the soul file is deleted; AD8b will create a new one and set this back to true)

The `role` value `"chief_of_staff"` stays -- AD8b renames it to `"assistant"`.

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

This file has extensive references to both "Chief of Staff" and "Rail". The file is large and many of its sections are about the Rail UI concept. Since AE1 (Purge False Knowledge) also targets Rail references in docs, there is overlap. AD8a handles the noun purge for both Coach/CoS AND Rail references in this specific file.

**Coach/CoS replacements** (all "Chief of Staff" -> "assistant", "coach" config -> "assistant" config):

| Line(s) | Change |
|---------|--------|
| 13 | "The Chief of Staff's chat is persistent" -> "The assistant's chat is persistent" |
| 15 | "Read AI's persistent-context coach model" -> keep (this is an external product reference, not HyperIdle vocabulary) |
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

**Rail section**: The Rail section (4.2, lines 147-181) describes the right-sidebar UI concept that was deleted in U6. AD8a marks this section as deprecated/deleted with a note pointing to the current state. AE1 may do a deeper rewrite. For AD8a, the approach is:

- Replace section 4.2 content with a short deprecation note: "The Rail (right-sidebar vital signs surface) was removed in U6. Cost, blockers, and awareness indicators now surface through the Conversations filter chips, WorkTeam agent health rows, and Sidebar triage badge. See AE1 for documentation hygiene."
- Keep the section number to avoid renumbering cascades in cross-references.
- Other Rail references in the doc (lines 85, 434, etc.) get updated to remove the Rail noun.

**Additional doc files with coach/CoS/Rail references to update:**

| File | Changes needed |
|------|---------------|
| `docs/human-interface-layer/three-views-the-rail.md` | Line 7: "coaching" -> "assistant conversation"; Line 13: "Chief of Staff's chat" -> "assistant's chat". Title stays (it's a different, shorter summary file -- but update noun references). |
| `docs/human-interface-layer/index.md` | Line 8: "Coach Conversation" -> "Assistant Conversation"; Line 20, 22: file titles reference "Rail" -- update. |
| `docs/human-interface-layer/one-app-two-form-factors.md` | Line 45: "the coach" -> "the assistant" |
| `docs/human-interface-layer/the-cross-cutting-data-model.md` | Line 12: `verb # review \| prioritize \| bet \| coach \| curate` -> remove `coach`, add `assist`; Line 28: "Chief of Staff's chat" -> "assistant's chat" |
| `docs/human-interface-layer/interaction-cadences-notification-discipline.md` | Line 12: "Chief of Staff's chat" -> "Assistant's chat" |
| `docs/human-interface-layer/inspirations.md` | Line 3: "persistent-context coach" -- keep (external product reference) |
| `docs/human-interface-layer/decisions.md` | Line 8: "Chief of Staff" -> "Assistant" |
| `docs/human-interface-layer/the-holistic-user-journey.md` | Lines 11, 23, 29, 33: all "Chief of Staff" -> "assistant" |
| `docs/human-interface-layer/routing-how-items-find-the-right-view.md` | Lines 9, 19: "Chief of Staff's chat" -> "assistant's chat" |
| `docs/human-interface-layer/trust-building-slow-cumulative.md` | Line 6: "the Rail has a daily burn-rate strip" -> remove Rail reference |
| `docs/human-interface-layer/what-the-meta-layer-actually-ships-at-this-layer.md` | Line 6: "Conversations / Rail / Work" -> "Conversations / Work" |
| `docs/blocks/composition.md` | Line 12: "the Chief of Staff chat" -> "the assistant chat" |
| `docs/requirements/usability-requirements.md` | Lines 17, 23: "Coach thread" -> "assistant thread", "Chief of Staff" -> "Assistant"; Lines 37-105: Rail section (UX-4, UX-8.2, UX-8.4) -- mark deprecated |
| `docs/requirements/decisions.md` | Lines 17, 19: "Chief of Staff" -> "Assistant" |
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
| `docs/guides/user/three-core-views.md` | Lines 30, 32: "Chief of Staff Thread" / "Chief of Staff agent" -> "Assistant Thread" / "assistant agent" |
| `docs/agent-layer/index.md` | Line 9: "the Rail" -> remove Rail reference |

## 7. Rail API purge -- orphaned files

The Rail UI was deleted in U6, but the server-side API route and contract survive. AD8a deletes them.

### 7.1 Files to DELETE

| File | Reason |
|------|--------|
| `packages/api-contract/src/rail.ts` | Dead Rail contract types. No consumers after U6 UI deletion. |
| `packages/server/src/routes/rail.ts` | Dead Rail route handler. Serves data for a UI that no longer exists. |
| `packages/server/src/routes/__tests__/rail.routes.integration.test.ts` | Tests for the dead route. |
| `packages/server/src/__tests__/rail.integration.test.ts` | Integration tests for the dead route. |

### 7.2 Files to EDIT (remove Rail imports/routes)

| File | Change |
|------|--------|
| `packages/server/src/app.ts` line 30 | Delete `import { createRailRoutes } from "./routes/rail.js";` |
| `packages/server/src/app.ts` line 385 | Delete `api.route("/rail", createRailRoutes(options.db, eventBus));` |

### 7.3 E2E and test files referencing `/api/rail`

These files mock or reference the Rail API endpoint and need updating:

| File | Change |
|------|--------|
| `packages/web/e2e/fixtures.ts` lines 49, 130-131, 209 | Remove Rail mock route and `DEFAULT_RAIL_RESPONSE` constant |
| `packages/web/e2e/mock-data-purge.spec.ts` lines 46, 100-161 | Remove/update Rail-specific test cases (AC-3b tests). These tests verify the old Rail renders from API data. Since Rail UI is deleted, these tests are dead. |
| `packages/web/e2e/keyboard-nav.spec.ts` line 29 | Comment mentions "rail regions" -- update comment |
| `packages/web/src/__tests__/M3-AppShell.no-mock.test.tsx` lines 7, 60, 153-155 | Remove Rail mock stubs and comments |
| `packages/web/src/__tests__/AppShell.test.tsx` line 23 | Remove Rail API stub comment |
| `packages/web/src/__tests__/U6-AppShell-sidebar.test.tsx` lines 8, 92-97 | These tests assert Rail is NOT rendered -- keep them but update comments |
| `packages/server/src/__tests__/api-availability.integration.test.ts` line 32 | Remove `{ path: "/api/rail", description: "Rail" }` entry |

## 8. Coach/CoC code purge

The coach route and CoC overlay/context are NOT deleted in AD8a. Per the concept doc workpackage split:
- AD8b rebuilds the overlay as AssistantOverlay
- AD8b rebuilds the coach route as the assistant thread endpoint

AD8a's job is the *noun purge* -- renaming user-facing strings, not restructuring the code. However, there is a tension: the ACs say "zero occurrences" of coach/CoS/CoC in code. Let me resolve this.

**Resolution:** AD8a renames the user-facing nouns but does NOT rename files, functions, or internal variable names that are part of the coach/CoC infrastructure. Those renames are AD8b scope (they involve behavioral changes -- rebuilding the overlay, changing the API route path, etc.). AD8a focuses on:

1. User-facing strings (display names, labels, comments that say "Chief of Staff")
2. Doc content
3. Schema values
4. Dead code deletion (Rail API, which has no successor)

The "zero occurrences" AC for code specifically targets:
- `"Chief of Staff"` as a display string -> "Assistant"
- `chief_of_staff` as a role label in AGENT_ROLE_CATALOG -> still displayed as "Assistant"
- Comments that describe the concept using dead nouns -> updated
- But NOT: function names like `createCoachRoutes`, file names like `coach.ts`, variable names like `COC_AGENT_ID`. Those are internal implementation details that AD8b replaces when it rebuilds the surface.

**Clarification for the grep verification (AC-3):** The grep targets user-facing strings and doc content. Internal code identifiers (function names, file names, variable names) that form part of the coach/CoC infrastructure are AD8b scope. The grep verification command will exclude:
- `packages/server/src/routes/coach.ts` (file being rebuilt in AD8b)
- `packages/web/src/shell/CocOverlay.tsx` (file being rebuilt in AD8b)
- `packages/web/src/contexts/CocContext.tsx` (file being rebuilt in AD8b)
- `packages/web/src/hooks/useCocThread.ts` (file being rebuilt in AD8b)
- `packages/web/src/components/CocAttachButton.tsx` (file being rebuilt in AD8b)
- Their test files
- `packages/server/src/routes/__tests__/coach.routes.integration.test.ts` (test for AD8b route)

Wait -- reading the AD8a spec more carefully: "Purge CoS/CoC/coach/Rail from all docs, **code**, seeds, tests." This suggests a full purge of the vocabulary from code too. But the concept's workpackage split says AD8b "Rename + rebuild overlay (CocOverlay -> AssistantOverlay)." If AD8a does the full code rename, AD8b has nothing to rename.

**Final resolution:** AD8a does the vocabulary purge in these specific scopes:
1. **All docs** -- complete purge
2. **Schema and seeds** -- complete purge of values
3. **Shared types/constants** -- complete purge (AGENT_CATEGORIES, AGENT_ROLE_CATALOG)
4. **User-facing display strings in server/web code** -- purge display names
5. **Comments** -- update to use new vocabulary
6. **File/function/variable renames (coach.ts -> assistant.ts, CocOverlay -> AssistantOverlay)** -- AD8b scope. These are structural code changes that change imports, file paths, and the API route URL.

The grep verification for AC-3 will:
- Target all `.md` files: must have zero dead-noun occurrences
- Target `.ts`/`.tsx` string literals and comments: zero "Chief of Staff" (case-insensitive), zero "Coach" as a HyperIdle concept (distinguishing from external references)
- Exclude the six files that AD8b will rename (coach.ts, CocOverlay.tsx, CocContext.tsx, useCocThread.ts, CocAttachButton.tsx, and their tests). Add `@lore AD8a` comments to these files noting they are AD8b rename targets.

### 8.1 Server code changes

| File | Change |
|------|--------|
| `packages/server/src/routes/coach.ts:28` | `COC_AGENT_DISPLAY_NAME = "Chief of Staff"` -> `"Assistant"` |
| `packages/server/src/routes/coach.ts:29` | `COC_AGENT_ROLE = "chief_of_staff"` -- keep (role string, AD8b) |
| `packages/server/src/routes/coach.ts` | Update `@lore` comments: "CoC agent" -> "assistant agent", "Chief of Staff facilitator agent" -> "assistant agent" |
| `packages/server/src/routes/__tests__/coach.routes.integration.test.ts` | Update test descriptions and string assertions: "Chief of Staff" -> "Assistant", comments referencing "CoC" |
| `packages/server/src/__tests__/M3-threads-coach-auth.integration.test.ts` | Update comments: "CoC agent" -> "assistant agent" |
| `packages/server/src/__tests__/builtin-routines.integration.test.ts` | No string changes needed (tests reference IDs, not display names) |

### 8.2 Web code changes

| File | Change |
|------|--------|
| `packages/web/src/shell/CocOverlay.tsx:153` | `"Failed to load coach thread"` -> `"Failed to load assistant thread"` |
| `packages/web/src/shell/CocOverlay.tsx` | Update comments: "coach configuration" -> "assistant configuration" |
| `packages/web/src/__tests__/CocOverlay.test.tsx` | Update display name assertions: "Chief of Staff" -> "Assistant", "coach" -> "assistant" in descriptions |
| `packages/web/src/__tests__/CocOverlay.block-ref.test.tsx` | Update mock data: "Chief of Staff" -> "Assistant" |
| `packages/web/e2e/L21-coc-overlay.spec.ts` | Update all `chief of staff` button/dialog name matchers to `assistant` |
| `packages/web/e2e/T4-block-reference.spec.ts:32` | `"Chief of Staff"` -> `"Assistant"` |
| `packages/web/e2e/conversations-submenu.spec.ts:44` | `id: "coach"` -- this is test data, not a display string. Keep as-is (AD8b). |

### 8.3 Fabric code changes

| File | Change |
|------|--------|
| `packages/fabric/src/services/builtin-routines.ts:155` | Comment update: `seed-agent-cos` description |

### 8.4 Eval code changes

| File | Change |
|------|--------|
| `packages/eval/src/seeding.ts:528-533` | `name: "Chief of Staff (eval stub)"` -> `name: "Assistant (eval stub)"`, `agentCategory: "personal"` -> `"individual"` |

## 9. Task ordering

Tasks are ordered to minimize broken intermediate states. Each task should leave `npm run check` passing.

### Phase 1: Schema + types (foundation)

**Task 1: Write migration file**
- Create `packages/db/drizzle/0027_AD8a_agent_type_rename.sql`
- Update drizzle meta journal
- Verify: `npm run db:migrate` succeeds locally

**Task 2: Update shared types and constants**
- `packages/shared/src/types.ts`: `"personal"` -> `"individual"` in AGENT_CATEGORIES
- `packages/shared/src/agent-roles.ts`: Update chief_of_staff catalog entry (label, category, description, hasTemplate)
- `packages/shared/src/team.ts`: Update comment
- Verify: `npm run check` passes

**Task 3: Update shared tests**
- `packages/shared/src/__tests__/types.test.ts`
- `packages/shared/src/__tests__/agent-roles.test.ts`
- Verify: `npm run test` passes for `packages/shared`

### Phase 2: Seeds + DB code

**Task 4: Update seed data**
- `packages/db/src/seed.ts`: Update CoS seed entry (name, category), remove chief-of-staff soul template, update categoryByRole
- `packages/db/src/schema.ts`: Update comment
- Verify: `npm run check` passes

**Task 5: Update seed-related tests**
- `packages/db/src/__tests__/X3-agent-config.integration.test.ts`
- `packages/db/src/__tests__/seed.integration.test.ts`
- Verify: `npm run test:integration` passes for `packages/db`

### Phase 3: Server code

**Task 6: Delete Rail API**
- Delete `packages/server/src/routes/rail.ts`
- Delete `packages/server/src/routes/__tests__/rail.routes.integration.test.ts`
- Delete `packages/server/src/__tests__/rail.integration.test.ts`
- Delete `packages/api-contract/src/rail.ts`
- Update `packages/server/src/app.ts`: remove Rail import and route
- Update `packages/server/src/__tests__/api-availability.integration.test.ts`: remove Rail entry
- Verify: `npm run check` passes

**Task 7: Update coach route display strings**
- `packages/server/src/routes/coach.ts`: display name and comments
- `packages/server/src/routes/__tests__/coach.routes.integration.test.ts`: assertions and comments
- `packages/server/src/__tests__/M3-threads-coach-auth.integration.test.ts`: comments
- `packages/fabric/src/services/builtin-routines.ts`: comments
- Verify: `npm run test:integration` passes

### Phase 4: Web code

**Task 8: Update web display strings and tests**
- `packages/web/src/pages/WorkTeam.tsx`: `"personal"` -> `"individual"`
- `packages/web/src/pages/AgentProfile.tsx`: `"personal"` -> `"individual"`, comments
- `packages/web/src/pages/AgentEditDialog.tsx`: comment
- `packages/web/src/settings/settings-types.ts`: comment
- `packages/web/src/pages/__tests__/WorkTeam.AB3.test.tsx`: all `"personal"` -> `"individual"`
- `packages/web/src/shell/CocOverlay.tsx`: error message and comments
- `packages/web/src/__tests__/CocOverlay.test.tsx`: display name assertions
- `packages/web/src/__tests__/CocOverlay.block-ref.test.tsx`: mock data
- Verify: `npm run test` passes for web

**Task 9: Update E2E tests and fixtures**
- `packages/web/e2e/fixtures.ts`: remove Rail mock
- `packages/web/e2e/mock-data-purge.spec.ts`: remove Rail tests
- `packages/web/e2e/L21-coc-overlay.spec.ts`: "Chief of Staff" -> "Assistant"
- `packages/web/e2e/T4-block-reference.spec.ts`: "Chief of Staff" -> "Assistant"
- `packages/web/e2e/L16-bet-pitch.spec.ts`: line 56 uses `seed-agent-cos` as ownerAgentId -- keep (FK ref)
- `packages/web/src/__tests__/U6-AppShell-sidebar.test.tsx`: update comments
- `packages/web/src/__tests__/M3-AppShell.no-mock.test.tsx`: remove Rail stubs
- `packages/web/src/__tests__/AppShell.test.tsx`: remove Rail comment
- `packages/web/e2e/keyboard-nav.spec.ts`: update comment

**Task 10: Update eval code**
- `packages/eval/src/seeding.ts`: name and category

### Phase 5: Doc rewrites

**Task 11: Delete and rewrite agent layer docs**
- Delete `docs/souls/chief-of-staff.md`
- Rewrite `docs/agent-layer/the-two-categories.md` as three-type taxonomy

**Task 12: Update thread primitive docs**
- `docs/human-interface-layer/thread-primitive.md`: coach -> assistant

**Task 13: Update three-views-the-rail doc**
- `docs/human-interface-layer/the-three-views-the-rail.md`: all Chief of Staff -> assistant, deprecate Rail section

**Task 14: Update remaining docs (batch)**
- All remaining doc files listed in section 6.2 table
- This is the largest task by file count but each change is mechanical (find-replace within context)

### Phase 6: Verification

**Task 15: Grep verification**
- Run all grep commands from section 10
- Verify zero dead-noun occurrences (with documented exclusions)
- Run `npm run check && npm run lint && npm run test`

## 10. Verification commands

```bash
# AC-1: agentCategory accepts "individual" -- verified by integration test
# AC-2: Zero "personal" as agent category in code
grep -rn '"personal"' --include='*.ts' --include='*.tsx' packages/ \
  | grep -i 'agentCategory\|agent_category\|AGENT_CATEGORIES\|category.*personal\|personal.*category'
# Expected: 0 lines

# AC-3: Zero Chief of Staff / chief_of_staff / CoS / CoC / coach (HyperIdle concept)
# Exclude: AD8b rename targets (files being rebuilt), external references, migration history
grep -rni 'chief.of.staff\|chief_of_staff' --include='*.ts' --include='*.tsx' --include='*.md' \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=plans --exclude-dir=archive \
  packages/ docs/
# Expected: 0 lines (after excluding AD8b files)

grep -rn '\bCoS\b' --include='*.ts' --include='*.tsx' --include='*.md' \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=plans --exclude-dir=archive \
  packages/ docs/
# Expected: 0 lines

grep -rn '\bCoC\b' --include='*.ts' --include='*.tsx' --include='*.md' \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=plans --exclude-dir=archive \
  packages/ docs/
# Expected: 0 lines (CocOverlay etc. are file/function names, not the noun "CoC")
# Wait -- "CoC" in CocOverlay.tsx IS the dead noun in a compound form.
# AD8b renames these files. AD8a adds @lore comments marking them for rename.
# The grep for "CoC" as a standalone word (\bCoC\b) won't match "CocOverlay" (lowercase 'oc').
# Grep for "CoC" case-sensitive catches the right things.

grep -rni '\bcoach\b' --include='*.ts' --include='*.tsx' --include='*.md' \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=plans --exclude-dir=archive \
  packages/ docs/ \
  | grep -v 'Read AI.*coach' \
  | grep -v 'migration.*coach' \
  | grep -v 'legacy.*coach'
# Expected: 0 lines after excluding external product references and migration history

# AC-4: Zero "Rail" as UI concept
grep -rni '\brail\b' --include='*.ts' --include='*.tsx' --include='*.md' \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=plans --exclude-dir=archive \
  packages/ docs/ \
  | grep -vi 'IconRail\|icon.rail\|icon_rail\|guardrail\|handrail\|monorail'
# Expected: 0 lines after excluding navigation rail (IconRail) and non-UI uses

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

## 11. Risk register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Drizzle migration journal format wrong | Migration fails | Read existing journal entries to match format before writing |
| `chief_of_staff` role string change cascades | Type errors everywhere | Keep role string as-is in AD8a; AD8b handles role rename |
| E2E tests fail after Rail API deletion | CI broken | Update E2E fixtures and remove Rail-specific tests in same commit |
| E2E tests fail after "Chief of Staff" -> "Assistant" rename | CI broken | Update all E2E button/dialog matchers in same commit as display name change |
| AE1 overlap (Rail doc purge) | Duplicate work | AD8a does the code deletion + doc noun replacement. AE1 does deeper doc restructuring. AD8a changes are a subset that AE1 builds on. |
| AD8b conflict (coach route/overlay rebuild) | Merge conflict | AD8a only changes display strings, not file/function structure. AD8b does the structural rename. Minimal conflict surface. |

## 12. What AD8a does NOT do

- Rename `chief_of_staff` role string to `assistant` (AD8b)
- Create assistant soul template (AD8b)
- Rename coach.ts -> assistant.ts (AD8b)
- Rename CocOverlay -> AssistantOverlay (AD8b)
- Rename CocContext -> AssistantContext (AD8b)
- Rename useCocThread -> useAssistantThread (AD8b)
- Rename CocAttachButton -> AssistantAttachButton (AD8b)
- Change API route from `/api/threads/coach` to `/api/threads/assistant` (AD8b)
- Reassign routine ownership (AD8b/AD8c)
- Create facilitator soul template (AD8c)
- Convert cost-sentinel to application code (AD8c)

## 13. Self-critique

1. **Is the scope right?** The boundary between "noun purge" and "structural rename" is clear: AD8a changes what humans see (display names, docs, schema values). AD8b changes what code sees (file names, function names, route paths). This avoids half-done structural changes that break imports.

2. **Migration risk?** Low. The `agentCategory` column has no CHECK constraint. The UPDATE is safe. Even if old `"personal"` values persist in edge cases, the code change from `"personal"` to `"individual"` in AGENT_CATEGORIES would surface type mismatches at runtime, which is the desired behavior (fail visibly, not silently).

3. **Is the doc purge realistic in scope?** There are ~40+ doc files to touch. Each change is mechanical (find-replace within context), but the volume means this will be the majority of implementation time. The builder should batch doc changes into a single commit per phase to keep the diff readable.

4. **The `chief_of_staff` role string tension.** I considered renaming it in AD8a but the cascading effects (soul template key, AGENT_ROLE_CATALOG, seed backfill, coach route constant) make it risky. AD8b is a better home because it rebuilds the entire assistant infrastructure at once.

5. **Rail API deletion vs AE1.** AE1 says it purges false Rail knowledge from docs. AD8a deletes the orphaned server code AND purges Rail from docs. This is overlap, but AD8a needs the doc purge for AC-4 (zero Rail occurrences). AE1 will find less Rail work to do, which is fine.
