# U1 Code Review — Schema Migration: Products -> Teams + Bet Simplification

**Reviewer:** Phase 4 Code Review (6 lenses)
**Branch:** `feat/U1-schema-migration`
**Date:** 2026-05-30
**Plan:** `plans/U1/architecture.md` (passed critique at 7.9/10)

---

## AC Completeness Audit

| # | Acceptance Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | Drizzle migration renames `products` -> `teams`, `product_id` -> `team_id` | **PASS** | `packages/db/drizzle/0021_U1_schema_migration.sql` steps 1-2, 4, 7, 12 correctly rename tables and columns. Step ordering avoids name collision (teams->team_members FIRST, then products->teams). |
| 2 | Existing `teams` table renamed to `team_members` | **PASS** | Migration step 1: `ALTER TABLE "teams" RENAME TO "team_members"`. Schema: `teamMembers = pgTable("team_members", ...)`. |
| 3 | Bet status enum: `draft \| active \| completed \| killed` | **PASS** | `BET_STATUSES` in `packages/shared/src/types.ts:67` is `["draft", "active", "completed", "killed"]`. Migration step 9 correctly maps old statuses. `BET_STATUS_MAP` in design-system updated. `VALID_TRANSITIONS` in bet-state-machine rebuilt. |
| 4 | Bet `pitch` -> `description`, `shipped_at` -> `completed_at` | **PASS** | Migration steps 10. Schema: `description: text("description")`, `completedAt: text("completed_at")`. Server routes, shared types, seed data all updated. |
| 5 | New `at_risk` boolean on bets (default false) | **PASS** | Migration step 11: `ADD COLUMN "at_risk" boolean DEFAULT false NOT NULL`. Schema: `atRisk: integer("at_risk").notNull().default(0)`. |
| 6 | Zod schemas updated | **PASS** | `packages/db/src/zod-schemas.ts` exports `selectTeamSchema`, `selectTeamMemberSchema`, `insertTeamSchema`, `insertTeamMemberSchema`. |
| 7 | TypeScript types updated (Product -> Team) | **PARTIAL** | Core types renamed (`Team`, `NewTeam`, `TeamMember`, `NewTeamMember` in schema; `TeamDetail`, `TeamSummary` etc. in `packages/shared/src/team.ts`). However, `packages/shared/src/product.ts` still exists with old types (`ProductDetail`, `ProductSummary`, etc.) as dead code. Multiple test/E2E files still reference old type names. See F1. |
| 8 | Seed data updated | **PASS** | `packages/db/src/seed.ts` uses `teams`, `teamMembers`, `bets.teamId`, `bets.description`, `bets.status: "draft"`. |
| 9 | `db:generate` + `db:migrate` clean | **FAIL** | Running `npm run db:generate` enters interactive mode asking about table renames rather than producing no output. The Drizzle snapshot metadata does not match the current schema state. See F6. |
| 10 | `npm run check` passes | **PASS** | Confirmed: `npm run check` reports zero type errors. However, the root tsconfig excludes many files (stories, E2E, some pages) from typecheck via project references with `include: []`. Stale references in excluded files are hidden. |

---

## Lens 1: Architecture (Positive)

### Correct

- **Migration ordering** is sound. Step 1 renames old `teams` -> `team_members` before step 2 renames `products` -> `teams`. The `statement-breakpoint` separators ensure sequential execution.
- **FK column collision** handled correctly. Old `team_id` on bets/tasks (pointing at old teams) is dropped before `product_id` is renamed to `team_id`. The 1:1 invariant justifies no data loss.
- **Status migration** is correct and exhaustive. All 9 old statuses mapped to 4 new ones. The `IN (...)` clause for the active bucket covers all intermediate states.
- **Propagation_log guard** (`DO $$ ... IF EXISTS ...`) is a smart defensive measure for PG environments where the propagation_log migration may not have run yet.
- **Schema exports** (`teams`, `teamMembers`, `Team`, `NewTeam`, `TeamMember`, `NewTeamMember`) match the plan.
- **Bet state machine** (`VALID_TRANSITIONS`) correctly rebuilt for 4 states.
- **Server routes** renamed: `products.ts` -> `teams-routes.ts`, `createProductRoutes` -> `createTeamRoutes`, import paths updated in `app.ts`.
- **team-lookup.ts** correctly replaces `product-team.ts` logic with `loadTeamMembers` querying `teamMembers` table. Backward-compat `loadProductTeam` alias exported.

### Violations

- **F1: Dead files not removed.** The architecture plan (T2.2) specifies renaming `product.ts` -> `team.ts`, and (T4.1) renaming `product-team.ts` -> `team-lookup.ts`. The builder created the new files but left the old files in place:
  - `packages/shared/src/product.ts` -- 92 lines of dead code with old types (`ProductDetail`, `ProductSummary`, etc.). Not imported by `shared/index.ts`. References `BetCardSummary.pitchTitle` which no longer exists in `team.ts`.
  - `packages/server/src/services/product-team.ts` -- 48 lines of dead code. References `teams.productId` which does not exist in the schema. Would fail typecheck if ever imported.

- **F2: Incomplete rename in fabric layer.** The architecture plan (T5.3-T5.5) specifies renaming `productId` to `teamId` in session-context, materialization, and scoring-config. The builder annotated these with `@lore U1` comments but kept the old `productId` field names:
  - `packages/fabric/src/session-context.ts:18` -- `SessionContextConfig.productId` still named `productId`
  - `packages/fabric/src/materialization.ts:19` -- `MaterializationConfig.productId` still named `productId`
  - `packages/fabric/src/scoring-config.ts:21` -- `ScoringContext.productId` still named `productId`
  - `packages/server/src/services/session-lifecycle.ts:25` -- `CreateSessionParams.productId` still named `productId`
  - `packages/server/src/services/session-provisioning.ts:133` -- `ProvisionSessionParams.productId` still named `productId`

  The `@lore U1` comments say "kept for backward compat" but the plan does not authorize keeping old names for backward compatibility -- it specifies renaming them. These are internal interfaces, not public APIs. Every caller passes a teams.id value; the parameter name should be `teamId`.

- **F3: Incomplete rename in web layer.** Several web components still use old naming in their code (not just comments):
  - `packages/web/src/pages/work/BetCreateDialog.tsx` -- uses `deriveTitleFromPitch` import (deprecated alias) instead of `deriveTitle`. Props interface still named `BetProduct` (not `BetTeam`). Props still named `products` (not `teams`). Local state `productId` not renamed to `teamId`. User-facing label still says "Product".
  - `packages/web/src/shell/Canvas.tsx` -- `CanvasBet.product` field not renamed. `CanvasBet.productId` not renamed. `onMoveBet` callback uses `"shaped" | "committed"` which are no longer valid `BetStatus` values.
  - `packages/web/src/shell/Rail.tsx:264-265` -- filters bets by `status === "review"` and `status === "paused"`, which are no longer valid `BetStatus` values. These will always be empty arrays since no bet can have these statuses after migration.

## Lens 2: Design (N/A -- non-UI workpackage, skipped)

## Lens 3: Security

- **No SQL injection risk.** Migration uses parameterized DDL statements and hard-coded string literals. No user input flows into migration SQL.
- **No path traversal.** The `validateSoulPromptPath` guard in session-provisioning remains intact and unaffected by the rename.
- **Data integrity preserved.** The migration uses `ALTER TABLE RENAME` which is atomic in PostgreSQL. Status migration uses deterministic UPDATE statements.
- **Stored JSON graceful degradation.** The `mutedProducts` -> `mutedTeams` rename in the Zod schema uses `.default([])`, so old JSON blobs with `mutedProducts` key gracefully degrade to an empty array. This is acceptable for non-critical notification preferences.

No security findings.

---

## Lens 4: Adversarial

### F4: Old bet statuses in Canvas.tsx and Rail.tsx are semantic dead code

`packages/web/src/shell/Canvas.tsx` line 45 defines `type CanvasColumn = "shaped" | "committed"` and the entire Canvas component is built around these two columns. Post-migration, bets have status `draft` or `active` (not `shaped` or `committed`). The Canvas will show two empty columns because `bets.filter(b => b.status === "shaped")` and `bets.filter(b => b.status === "committed")` will always return empty arrays.

Similarly, `packages/web/src/shell/Rail.tsx` lines 264-265 filter by `status === "review"` and `status === "paused"` -- both impossible post-migration. The REV and PSD collapsed-rail pills will never render.

These pass typecheck because Canvas and Rail are not included in the root tsconfig's project reference traversal (the web package uses `composite: false`). They pass tests because the test mocks provide hard-coded data that matches the old statuses. But at runtime with real data, these components are broken.

**Impact:** Canvas and Rail are core UI components. Canvas is the bet management surface. Rail is the persistent status sidebar. Both will appear empty/broken at runtime.

**Plan reference:** The architecture plan Section 1 scope boundary says "API URL paths... and user-facing URL slugs are deferred to subsequent workpackages." Canvas column labels ("Shaped", "Committed") are user-facing copy, but the underlying status filters are not URL paths -- they are data queries. The plan's T7.1 says "Update `BetCard.tsx` and `BetCard.stories.tsx` -- status prop values." The plan does NOT explicitly list Canvas.tsx or Rail.tsx status values, but these are a direct consequence of the status enum change and should have been caught.

### F5: Test fixtures use old API response shape

Multiple test files construct mock API responses with the old shape:
- `packages/api-contract/src/__tests__/contracts.test.ts` lines 167-240 -- constructs `SettingsNotifications` with `mutedProducts`, `SettingsResponse` with `products:` key, references `SettingsProduct` type. These should be type errors against the renamed types but pass because Vitest doesn't run tsc.
- `packages/web/e2e/fixtures.ts:44` -- `mutedProducts: []` in mock settings response.
- `packages/web/e2e/settings.spec.ts:21`, `M3-api-wiring.spec.ts:26`, `mock-data-purge.spec.ts:73`, `settings-redesign.spec.ts:41` -- all use `mutedProducts: []`.
- `packages/web/src/__tests__/AppShell.test.tsx:18`, `M3-AppShell.no-mock.test.tsx:58` -- `mutedProducts: []`.
- `packages/web/src/hooks/__tests__/useSettings.test.ts:24,41` -- defines type with `mutedProducts`, constructs object with `mutedProducts`.
- `packages/server/src/__tests__/P3-settings-config.test.ts:78` -- type assertion with `mutedProducts`.

These tests pass today because: (a) Vitest doesn't typecheck, (b) runtime JavaScript doesn't enforce interface shapes, (c) the tests assert on the wrong property names (they assert `mutedProducts` is empty, which is vacuously true since the property doesn't exist on the actual response). But they provide false confidence -- these tests do not validate the actual API contract shape.

### F6: `db:generate` is not clean (AC9 FAIL)

Running `npm run db:generate` enters interactive mode asking "Is artifacts table created or renamed from another table?" instead of producing no output. This means the Drizzle snapshot metadata is out of sync with the schema. AC9 requires `db:generate` to be clean. The migration journal jumps from idx 16 to idx 21 (gap of 4), and there are only 4 snapshot files (0000-0003) vs. 22 migration files. The builder likely needed to generate a snapshot file matching the post-migration state.

### F7: BetCard.stories.tsx and PitchCard.stories.tsx use invalid statuses

`packages/design-system/src/BetCard.stories.tsx` uses `status="committed"`, `status="in_progress"`, `status="shipped"`, `status="shaped"` -- none of which are valid `BetStatus` values post-U1. The `betStatusToStatus` mapping (`BET_STATUS_MAP`) only has entries for `draft`, `active`, `completed`, `killed`. Rendering a BetCard with `status="committed"` will call `BET_STATUS_MAP["committed"]` which returns `undefined`, causing the StatusChip to render with an undefined status.

Same issue in `PitchCard.stories.tsx` and `PitchSelector.stories.tsx` which use `status: "shaped"`.

These pass typecheck because stories are not traversed by the root tsconfig project references.

---

## Lens 5: Simplification

### F8: Duplicate service files (product-team.ts alongside team-lookup.ts)

`packages/server/src/services/product-team.ts` is a complete duplicate of the old logic and is never imported. It should be deleted, not kept alongside the new file. The backward-compat `loadProductTeam` alias in `team-lookup.ts` is also unnecessary -- no file imports it except `team-lookup.ts` itself (where it's defined). The alias adds 4 lines of dead code and a misleading export.

### F9: Deprecated alias chain in format/bet.ts

`packages/shared/src/format/bet.ts` exports both `deriveTitle` (new) and `deriveTitleFromPitch` (deprecated alias). The deprecated alias is actually used in production code (`BetCreateDialog.tsx:29`), which means the "migration" is incomplete. Either finish the migration (use `deriveTitle` everywhere) or don't create the alias at all.

### F10: Excessive @lore annotations

The diff adds 100+ `@lore U1:` comments documenting the rename. Many of these are on trivially obvious changes (e.g., `// @lore U1: teamId replaces productId` on a line that says `teamId: ...`). The U1 migration is a mechanical rename, not a non-obvious decision. The `@lore` system is designed for "why not the obvious approach" decisions, not for documenting that a rename happened. A single `@lore U1` at the top of each file explaining the migration would suffice; per-line annotations add noise without signal.

This is a style observation, not a blocking finding.

---

## Lens 6: AI Slop

### F11: `packages/shared/src/product.ts` still exports old types

The old `product.ts` file still exists with its full type definitions (`ProductDetail`, `ProductSummary`, `ProductBurn`, `ProductListItem`, `ProductListResponse`, `CreateProductRequest`, `CreateProductResponse`, `ProductStatus`). While no file in `shared/index.ts` re-exports them, the file itself compiles and could be imported by any consumer who hasn't migrated. This is a leftover from an incomplete file rename.

### F12: Comments reference old status values

- `packages/shared/src/product.ts:55` -- `status: BetStatus; // "committed" | "in_progress"` (should be `"active"`)
- `packages/shared/src/product.ts:65` -- `// bets WHERE product_id = :id AND status IN ('committed','in_progress')` (should reference new statuses)
- `packages/web/src/shell/Canvas.tsx:3` -- `// Only "shaped" and "committed" statuses appear here` (these statuses no longer exist)
- Multiple files have comments referencing the old status vocabulary without noting it changed.

---

## Findings Summary

| # | Severity | Lens | Finding | Files |
|---|---|---|---|---|
| F1 | **HIGH** | Architecture | Dead files not removed (`product.ts`, `product-team.ts`) | 2 files |
| F2 | **HIGH** | Architecture | Incomplete rename in fabric/server interfaces (`productId` kept as field name with "backward compat" rationale not in plan) | 5 files |
| F3 | **HIGH** | Architecture | Incomplete rename in web layer (BetCreateDialog props, Canvas fields, old status references) | 3 files |
| F4 | **CRITICAL** | Adversarial | Canvas.tsx and Rail.tsx filter by impossible old status values -- components are broken at runtime | 2 files |
| F5 | **MEDIUM** | Adversarial | Test fixtures construct objects with old API shape (`mutedProducts`, `products:` key) | 12+ files |
| F6 | **HIGH** | Adversarial | `db:generate` not clean -- Drizzle snapshot out of sync (AC9 FAIL) | Migration metadata |
| F7 | **HIGH** | Adversarial | BetCard/PitchCard/PitchSelector stories use invalid status values | 3 files |
| F8 | **LOW** | Simplification | Duplicate service file and unnecessary deprecated alias | 2 files |
| F9 | **MEDIUM** | Simplification | Deprecated `deriveTitleFromPitch` alias used in production code | 2 files |
| F10 | **LOW** | Simplification | Excessive per-line @lore U1 annotations (noise) | 100+ annotations |
| F11 | **LOW** | Slop | Old `product.ts` file with full type exports still on disk | 1 file |
| F12 | **LOW** | Slop | Comments reference old status vocabulary | 5+ files |

---

## Verdict: **NOT DONE**

### Blocking findings (must fix)

1. **F4 (CRITICAL):** Canvas.tsx and Rail.tsx filter by old bet statuses (`"shaped"`, `"committed"`, `"review"`, `"paused"`) that no longer exist. These components will render empty at runtime. Update Canvas columns to use `"draft"` and `"active"` (or whatever the design intent is). Update Rail collapsed pills to filter by valid new statuses or remove the REV/PSD pills entirely.

2. **F6 (HIGH):** AC9 requires `db:generate` to be clean. The Drizzle snapshot metadata is out of sync. The builder must either run `db:generate` non-interactively (with `--force` or similar) to produce the correct snapshot, or hand-create the snapshot file that matches the post-migration schema state.

3. **F1 (HIGH):** Delete `packages/shared/src/product.ts` and `packages/server/src/services/product-team.ts`. These are dead code with stale references that will confuse future agents.

4. **F7 (HIGH):** Update `BetCard.stories.tsx`, `PitchCard.stories.tsx`, `PitchSelector.stories.tsx`, `Canvas.stories.tsx`, and `Rail.stories.tsx` to use valid new status values (`"draft"`, `"active"`, `"completed"`, `"killed"`).

5. **F3 (HIGH):** Complete the rename in BetCreateDialog.tsx (props, state variables, labels). The plan's scope boundary says internal variable and file names are in scope.

6. **F5 (MEDIUM):** Update test fixtures and contract tests to use the new API shape (`mutedTeams` instead of `mutedProducts`, `teams:` instead of `products:`, `SettingsTeam` instead of `SettingsProduct`). These tests currently provide false confidence.

### Non-blocking findings (should fix but won't block merge)

7. **F2 (HIGH but deferred):** The `productId` field names in fabric/server interfaces (`SessionContextConfig.productId`, `MaterializationConfig.productId`, `ScoringContext.productId`, `CreateSessionParams.productId`, `ProvisionSessionParams.productId`) should be renamed to `teamId`. The `@lore U1` "backward compat" rationale is not authorized by the plan. However, since these are internal interfaces with correct runtime behavior (the value passed IS a teams.id), this can be addressed in a follow-up if the builder documents the deferral.

8. **F8, F9:** Remove the dead `loadProductTeam` alias and the unused `deriveTitleFromPitch` usage in BetCreateDialog.

9. **F10, F12:** Reduce @lore noise and fix stale comments. Low priority.
