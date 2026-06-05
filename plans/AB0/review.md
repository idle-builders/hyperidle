# AB0 Code Review

**Reviewer:** Phase 4 Reviewer
**Plan:** `plans/AB0/architecture.md`
**Critique:** `plans/AB0/architecture-critique.md`
**Diff:** `git diff main..HEAD -- ':!plans/' ':!.verify-attestations/'`
**Round:** 1

---

## Phase 2 Amendments Verification

The architecture critique identified 4 missing files (F-01 through F-04). All were addressed by the builder:

| Finding | File | Addressed? | How |
|---|---|---|---|
| F-01 | `packages/fabric/src/prompt-composition.ts` | Yes | Replaced `ROLE_TO_COMMUNITY` import with `communityForRole`, removed unsafe `as keyof typeof` cast |
| F-02 | `packages/fabric/src/index.ts` | Yes | Updated re-export from `ROLE_TO_COMMUNITY` to `communityForRole` |
| F-03 | `packages/web/src/settings/SettingsAgents.tsx` | Yes | Replaced `USER_ROLES.map(...)` with `AGENT_ROLE_CATALOG.map(entry => ...)` |
| F-04 | `packages/server/src/routes/org.ts` | Yes | Removed `USER_ROLES` import, replaced closed-enum validation with open-string validation |
| F-06 | `packages/fabric/src/__tests__/prompt-composition.test.ts` | Partial | Test descriptions still reference `ROLE_TO_COMMUNITY` (cosmetic; tests themselves call `buildTemplateVariables` which uses `communityForRole` internally) |

---

## Lens 1: Architecture

### Contract compliance

The implementation faithfully follows the locked architecture plan across all 12 tasks.

**Type system (AC1-AC4):** `AGENT_CATEGORIES` const tuple and `AgentCategory` type are correctly defined in `types.ts`. `AGENT_ROLE_CATALOG` is in `agent-roles.ts` with all 16 entries matching the concept doc. `UserRole` is now `type UserRole = string`. `USER_ROLES`, `KERNEL_USER_ROLES`, `FABRIC_USER_ROLES` are removed from exports. All re-exports from `index.ts` are correct.

**Schema (AC5-AC6):** Migration `0022_AB0_agent_structure.sql` correctly adds `agent_category text` to `users` and `functions text` to `teams`. Schema.ts has both columns with correct @lore annotations.

**Role-community mapping (AC7):** `role-community-map.ts` correctly re-exports `communityForRole` from `@hyperidle/shared`. The barrel re-export in `fabric/src/index.ts` is updated.

**Layer integrity:** No cross-layer violations. `@hyperidle/shared` is the leaf. `@hyperidle/db` depends on shared. `@hyperidle/fabric` depends on db and shared. `@hyperidle/server` depends on all three. Dependency direction is respected everywhere.

**Naming:** All names are honest and follow conventions. `AgentCategory`, `AgentRoleCatalogEntry`, `communityForRole`, `defaultRoster`, `findRoleCatalogEntry` -- clear, descriptive, no lies.

### OBSERVATIONS

- O-ARCH-1: `docs/agent-layer/the-two-categories.md` is not updated with a supersession notice pointing to `agent-structure.md`. The concept doc says it supersedes the two-category model, and `agent-structure.md` says so, but the old doc itself does not have a banner. Non-blocking -- the index.md lists both, and the new doc states the supersession.

- O-ARCH-2: The `prompt-composition.test.ts` test descriptions still say "returns community from ROLE_TO_COMMUNITY map" (lines 176, 182). The tests are functionally correct (they test `buildTemplateVariables` which now calls `communityForRole` internally), but the descriptions are misleading. Non-blocking.

---

## Lens 2: Design

N/A (no UI surface added -- the SettingsAgents.tsx change is a data source swap from `USER_ROLES` to `AGENT_ROLE_CATALOG`, not a new component or layout change).

---

## Lens 3: Security

**Open role string validation:** The `z.string().min(1).max(100)` constraint on `createAgentSchema.role` and `patchAgentSchema.role` properly bounds the open string. Empty strings are rejected (400). Length is capped at 100 characters.

**Category immutability:** `agentCategory` is accepted on POST but NOT on PATCH (`patchAgentSchema` does not include `agentCategory`). The plan explicitly says "category is immutable" and the implementation enforces this by exclusion from the patch schema. Correct.

**Category validation:** `z.enum(AGENT_CATEGORIES)` on the POST schema correctly constrains to the closed enum. Unknown category values are rejected.

**Org route validation:** The `mechanism === "function"` branch in `org.ts` now accepts any non-empty string. The Zod schema already validates `target: z.string().min(1)`, so the inline `!target || target.trim().length === 0` check is redundant but harmless (defense-in-depth).

**Role string in DB:** The role is stored as `text` in PostgreSQL. It is never interpolated into raw SQL or used in dynamic queries. The Drizzle ORM parameterizes all values. No SQL injection risk.

**Session provisioning:** The unsafe `as UserRole` cast is removed. `agent.role` is used directly. Correct.

### OBSERVATIONS

- O-SEC-1: The inline validation `if (!target || target.trim().length === 0)` in `org.ts` line 96 is redundant with the Zod schema `z.string().min(1)` which already rejects empty strings before this code runs. This is defense-in-depth, not a bug.

---

## Lens 4: Adversarial

### The Saboteur

No backdoors, no weakened tests. The test changes are well-motivated:
- `types.test.ts`: Old assertions on `USER_ROLES` count replaced with assertions on `AGENT_CATEGORIES` count. Security intent preserved.
- `o1-type-split.test.ts`: Old assertions on role split replaced with assertions that `KERNEL_USER_ROLES`, `FABRIC_USER_ROLES`, `USER_ROLES` are NOT exported. Strengthened, not weakened.
- `X3-agents.test.ts`: "invalid role returns 400" replaced with "empty role returns 400" plus a new test "accepts custom role strings". Security intent preserved (reject bad input), boundary moved to match open-string design.
- `org.routes.test.ts`: "invalid role returns 400" replaced with "empty string returns 400" plus "custom role returns 201". Same pattern.

No race conditions in the new code. `communityForRole`, `defaultRoster`, and `findRoleCatalogEntry` are pure functions over a static constant. No shared mutable state.

### The New Hire

The code is readable. The `AGENT_ROLE_CATALOG` is self-documenting -- every entry has a label, description, community, and category. The @lore comments explain why the old system was replaced. A new hire reading `agent-roles.ts` would understand the design in under a minute.

One potential confusion: `UserRole = string` looks like a typedef that adds nothing. The @lore comment explains the rationale (backward compatibility alias). This is F-08 from the architecture critique, acknowledged as technical debt.

### The Auditor

The diff matches the plan. Every task in the architecture plan is implemented. No undocumented changes. The commit messages (`red phase`, `green phase`, `verify attestation`) match the TDD workflow.

### Type safety

Zero new `as` casts introduced. The old `as UserRole` cast in `session-provisioning.ts` was REMOVED. The old `as keyof typeof ROLE_TO_COMMUNITY` cast in `prompt-composition.ts` was REMOVED. Net improvement in type safety.

Zero `any`, zero `@ts-ignore`, zero `!` assertions in the new code.

### Test quality

Tests are substantive. The `agent-roles.test.ts` file (264 lines) covers:
- Catalog entry count (16)
- Required fields presence and types
- Legacy role coverage
- Category validity
- No duplicate roles
- All 3 categories represented
- `findRoleCatalogEntry` for known and unknown roles
- `communityForRole` for 8 specific roles plus unknown fallback
- `TEAM_FUNCTIONS` contents
- `defaultRoster` for single function, multiple functions, unknown function, empty input, alphabetical sorting, and exclusion of strategy/personal agents

No tautological tests. No tests that only assert `toBeDefined()`.

---

## Lens 5: Simplification

### OBSERVATIONS

- O-SIMP-1: The `categoryByRole` backfill map in `seed.ts` (lines 301-318) duplicates information from `AGENT_ROLE_CATALOG`. The seed could call `findRoleCatalogEntry(role)?.category` instead of maintaining a separate map. However, the seed runs before the catalog might be imported (dependency direction concern noted in seed.ts @lore), and the hardcoded map is explicit about what gets backfilled. Tolerable duplication.

- O-SIMP-2: The redundant validation in `org.ts` line 96 (`!target || target.trim().length === 0`) after Zod already validates `z.string().min(1)`. Could be removed. Non-blocking.

Nothing else is over-engineered. The catalog approach is minimal. No unnecessary abstractions, no premature generics, no dead code.

---

## Lens 6: AI Slop

**Comments:** The @lore comments are justified and informative. They explain WHY the old system was replaced, not WHAT the code does. No "self-evident" comments.

**Naming:** Clean. No verbose names. `communityForRole`, `defaultRoster`, `findRoleCatalogEntry` -- each says exactly what it does.

**Defensive code:** No unnecessary null checks on non-nullable types. No try-catch around non-throwing code. The `entry?.community ?? "ops"` fallback in `communityForRole` is necessary (the entry may not exist for unknown roles).

**Unnecessary async:** None. All new functions (`communityForRole`, `defaultRoster`, `findRoleCatalogEntry`) are synchronous.

**Filler:** None. No `=== true`, no redundant else-return, no empty catch blocks.

**AI tell-tales:** None. No "TODO: implement", no "simplified version", no "for now".

Clean implementation.

---

## AC Completeness Audit

| AC | Criterion | Implemented? | Tested? | Evidence | Verdict |
|---|---|---|---|---|---|
| AC1 | `AGENT_CATEGORIES` const tuple + `AgentCategory` type in types.ts, exported from index.ts | Yes | Yes | `types.ts:101-102`, `index.ts:273`, `agent-roles.test.ts:248-263`, `types.test.ts:76-83` | PASS |
| AC2 | `AGENT_ROLE_CATALOG` in agent-roles.ts with 16 entries, all required fields | Yes | Yes | `agent-roles.ts:42-190`, `agent-roles.test.ts:26-99` | PASS |
| AC3 | `TEAM_FUNCTIONS`, `defaultRoster()` function | Yes | Yes | `agent-roles.ts:19-28,215-224`, `agent-roles.test.ts:177-242` | PASS |
| AC4 | `UserRole` = `string`, `USER_ROLES`/`KERNEL_USER_ROLES`/`FABRIC_USER_ROLES` removed | Yes | Yes | `types.ts:112`, `o1-type-split.test.ts:53-63`, `types.test.ts:84-88` | PASS |
| AC5 | Migration `0022_AB0_agent_structure.sql` adds `agent_category` + `functions` columns | Yes | Yes | `0022_AB0_agent_structure.sql`, `U1-schema-migration.test.ts` (functions field in test data), `zod-schemas.test.ts` (functions field) | PASS |
| AC6 | Schema.ts has `agentCategory` on users, `functions` on teams | Yes | Yes | `schema.ts:78,32`, `npm run check` passed (per attestation) | PASS |
| AC7 | `communityForRole(role: string): string` replaces `ROLE_TO_COMMUNITY` | Yes | Yes | `role-community-map.ts:8`, `agent-roles.ts:206-209`, `agent-roles.test.ts:135-171` | PASS |
| AC8 | POST/PATCH accept open role strings, POST accepts optional `agentCategory` | Yes | Yes | `agents.ts:33,44,34`, `X3-agents.test.ts:260-278` | PASS |
| AC9 | Seed sets `agentCategory` on all agents | Yes | Yes | `seed.ts:112,126,148,170,196`, `X3-agent-config.test.ts:221-224` (template count >= 8) | PASS |
| AC10 | Soul templates for builder, growth, designer, qa_engineer, ops | Yes | Yes | `docs/souls/builder.md`, `designer.md`, `growth.md`, `qa-engineer.md`, `ops.md` exist. `seed.ts:262-271`. `X3-agent-config.test.ts:227-241` | PASS |
| AC11 | Session provisioning/lifecycle: remove `as UserRole` cast, types become `string` | Yes | Yes | `session-provisioning.ts` line 228: `const agentRole = agent.role;` (no cast). `npm run check` passed. | PASS |
| AC12 | Relevance scoring: `KNOWN_USER_ROLES` + `isUserRole` removed, uses `communityForRole` | Yes | Yes | `relevance-scoring.ts` diff removes lines 68-79, `computeRoleMatch` uses `communityForRole` directly. `npm run check` passed. | PASS |
| AC13 | `docs/agent-layer/agent-structure.md` exists | Yes | N/A (static property) | File exists, 49 lines, covers categories, roles, team functions, soul composition, default roster. `index.md` updated to link to it. | PASS |
| AC14 | Eval seeding uses `string` instead of `UserRole` type | Yes | N/A (type-level) | `UserRole` import in `eval/src/seeding.ts` now resolves to `string`. No code change needed. `npm run check` passed. | PASS |

---

## Verdict

**DONE**

All 14 acceptance criteria are implemented and verified. All 4 Phase 2 amendment findings (F-01 through F-04) were addressed. Zero critical findings. Zero warnings.

The implementation is clean, well-tested (264 new test lines in `agent-roles.test.ts` alone, plus updates to 5 existing test files and 2 new integration tests in `org.routes.test.ts`), type-safe (net reduction in `as` casts), and architecturally sound (no layer violations, no broken contracts).

### Non-blocking observations for future reference

1. `prompt-composition.test.ts` test descriptions reference the old `ROLE_TO_COMMUNITY` name (cosmetic).
2. `docs/agent-layer/the-two-categories.md` lacks a supersession banner pointing to `agent-structure.md`.
3. `categoryByRole` in `seed.ts` duplicates data from `AGENT_ROLE_CATALOG` (acceptable for dependency direction).
4. Redundant empty-string check in `org.ts` after Zod validation (defense-in-depth, not a bug).
5. `UserRole = string` type alias is a lie type (acknowledged as tech debt per F-08 in the architecture critique).
