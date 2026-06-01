# U11 Architecture — Visual Validation & Test Re-baseline

**Type:** Validation gate (no new features, no behavior changes)
**Dependencies:** U9 (done), U10 (done)
**Branch:** `feat/U11-visual-validation`

---

## Required Reading

- `packages/design-system/DESIGN.md` — token reference, component catalog
- `packages/design-system/PRINCIPLES.md` — Hearth design principles
- `packages/design-system/AESTHETICS.md` — aesthetic rules and lint catalog
- `packages/design-system/src/tokens.css` — current Hearth token definitions
- `plans/U9/architecture.md` — what U9 changed (screen layouts)
- `plans/U10/architecture.md` — what U10 changed (aesthetic rules, lint config)

---

## Phase 0 — Interrogation (Settled)

U11 is a validation gate. No concept decisions to make. Three findings shaped the plan:

1. **Old tokens still in production code.** tokens.css has zero old token definitions, but ~23 lines across 7 production files still reference `surface-0` through `surface-6`, `text-hi`, `text-mid`, `text-lo`. These resolve to `undefined` at runtime (no CSS variable defined). U11 fixes these in-workpackage per the constraint "Any issues found are fixed in-workpackage."

2. **Frontend hooks still call `/api/products`.** The server mounts at `/api/teams` (U2), but `useTeam.ts`, `useTeams.ts`, `SettingsTeams.tsx`, and `SetupFlow.tsx` still call `/api/products`. The E2E fixtures mock `/api/products` too. These are dead endpoints. U11 fixes these.

3. **`body-editor.css` and `viewer/viewer.css` use old tokens.** `body-editor.css` is shipped in the design-system package (13 old token refs). `viewer/viewer.css` is design-system chrome (20+ old token refs). Both need migration.

---

## Plan Reconciliation: Spec vs Reality

| Spec assumption | Reality | Plan action |
|---|---|---|
| "No references to old Lucid tokens in production code" | 7 production files in `packages/web/src/` use old tokens (23 lines) | Task 1: Fix all |
| "No references to deleted components (IconRail, Rail, Submenu, PitchCard, PitchSelector)" | 2 production files reference `IconRail` in `@lore` comments only; 0 functional references | Comments are documentation, not functional refs — PASS. Verify via grep test. |
| "No old product/pitch vocabulary" | `useTeam.ts`, `useTeams.ts`, `SettingsTeams.tsx`, `SetupFlow.tsx` still call `/api/products` endpoint. `router.tsx` has `RedirectProductToTeam` (intentional redirect). Comments reference old names via `@lore`. | Task 2: Fix API paths. Redirect component and `@lore` comments are intentional — PASS. |
| "Visual regression baselines re-captured" | No stored baselines — `visual-regression.test.ts` compares HTML vs TSX live at 5% threshold | Task 5: Run visual-regression suite and ensure pass |
| "Playwright E2E tests pass for navigation, bet CRUD, thread viewing, knowledge browsing, settings" | 64 E2E test files exist. `settings.spec.ts` references "Products" tab (line 58, 72). `work.spec.ts` uses old `products` fixture shape. `fixtures.ts` mocks `/api/products`. | Task 3: Fix E2E tests |
| "`npm run verify` passes" | Unknown — needs execution | Task 6: Full verify |
| "Design system viewer at /designsystem matches Hearth" | `DesignSystem.tsx` uses 15+ old token references (`surface-1`, `surface-4`, `text-hi`, `text-mid`, `text-lo`) | Task 1: Fix |
| `body-editor.css` and `viewer/viewer.css` | 13 and 20+ old token refs respectively | Task 1: Fix |
| E2E `settings-redesign.spec.ts` | References "Products" section (line 133, 323, 325). Tab text says "Products" not "Teams" | Task 3: Fix if the UI has been renamed, or verify current UI label |

---

## Acceptance Criteria + Verification Methods

### AC1: Old Lucid token references eliminated from production code

**What:** Zero references to `surface-0` through `surface-6`, `text-hi`, `text-mid`, `text-lo`, `lucid-dark`, `lucid-light` in production `.tsx`, `.ts`, `.css` files across `packages/web/src/` and `packages/design-system/src/`.

**Verification:** Vitest grep-audit test (`packages/web/src/__tests__/U11-token-audit.test.ts`) that runs `grep -rE` for the banned token pattern across both packages, excluding `__tests__/`, `*.test.*`, `*.spec.*`, `*.stories.*` files. Test asserts zero matches. This extends the existing `U9-token-migration.test.tsx` to cover the files it currently excludes (like `KnowledgeBody.tsx`, `CocAttachButton.tsx`, `DesignSystem.tsx`, `body-editor.css`).

### AC2: Old deleted component references eliminated from production code

**What:** Zero functional references to `IconRail`, `PitchCard`, `PitchSelector` as imports, JSX elements, or type references. `@lore` comments explaining the historical context are acceptable.

**Verification:** Same U11 grep-audit test, separate assertions. Pattern matches component names NOT preceded by `@lore` or inside a comment line (`//` or `*`).

### AC3: Frontend API paths migrated from `/api/products` to `/api/teams`

**What:** All frontend hooks and pages call `/api/teams` (matching the U2 server endpoint), not `/api/products`.

**Verification:**
- Grep-audit test asserts zero `api/products` in production code (excluding router.tsx redirect path string and `@lore` comments).
- Existing E2E tests pass (they exercise the API mocks which now mock `/api/teams`).

### AC4: E2E fixtures mock `/api/teams` not `/api/products`

**What:** `packages/web/e2e/fixtures.ts` and all E2E spec files mock `/api/teams` with team-shaped fixture data.

**Verification:** Grep-audit test for `/api/products` in `e2e/` directory. All E2E tests pass.

### AC5: Visual regression passes for all 16 design-system components

**What:** `visual-regression.test.ts` passes for all components (StatusChip, Tag, KeyValue, NavItem, SearchField, ThreadRow, BetCard, TaskCard, KnowledgeRow, NotificationRow, EmptyState, ErrorState, Skeleton, Block, BlockHandle, BlockActionsPopover) in both rest and interactive states, at <5% pixel diff.

**Verification:** `npx playwright test --config packages/design-system/playwright.config.ts` exits 0.

### AC6: E2E tests pass for navigation, bet CRUD, thread viewing, knowledge browsing, settings

**What:** All 64 Playwright E2E spec files pass.

**Verification:** `npm run test:e2e` exits 0.

### AC7: Screenshot comparison of every main screen confirms Hearth aesthetic

**What:** New E2E test (`packages/web/e2e/U11-hearth-validation.spec.ts`) navigates to each main screen and captures a screenshot. Each screenshot is saved to `packages/web/e2e/screenshots/` for agent visual review. Test asserts each page renders (not blank, correct structural markers present).

Screens: conversations list, thread detail, bet grid (work/portfolio), bet detail, team view, knowledge list, knowledge detail, settings.

**Verification:** E2E test passes (structural assertions). Screenshots exist and are visually reviewed.

### AC8: Zero type errors, zero lint errors, all tests green

**What:** `npm run check` (zero type errors), `npm run lint` (zero lint errors), `npm run test -- --all` (all tests green).

**Verification:** Each command exits 0.

### AC9: `npm run verify` passes

**What:** Full verification pipeline exits 0 and produces attestation.

**Verification:** `npm run verify` exits 0.

---

## Ordered Task List

### Task 1: Fix old Lucid tokens in production code

**Files to change (production):**

| File | Old tokens | Replacement |
|---|---|---|
| `packages/web/src/components/ThreadSections.tsx` (L262, L266) | `--surface-1` | `--surface-container` |
| `packages/web/src/components/BlockRefEmbed.tsx` (L54, L70, L88) | `--surface-1` | `--surface-container` |
| `packages/web/src/components/CocAttachButton.tsx` (L42) | `--surface-6` | `--surface-overlay` |
| `packages/web/src/designsystem/DesignSystem.tsx` (15 refs) | `--surface-1`, `--surface-2`, `--surface-4`, `--text-hi`, `--text-mid`, `--text-lo` | `--surface-container`, `--surface-elevated`, `--surface-overlay`, `--text-primary`, `--text-secondary`, `--text-tertiary` |
| `packages/web/src/pages/SetupFlow.tsx` (L105) | `--surface-0` | `--surface-page` |
| `packages/web/src/pages/knowledge/KnowledgeBody.tsx` (L130) | `--text-lo` | `--text-tertiary` |
| `packages/design-system/src/body-editor.css` (13 refs) | `--text-hi`, `--text-mid`, `--text-lo`, `--surface-1` | `--text-primary`, `--text-secondary`, `--text-tertiary`, `--surface-container` |
| `packages/design-system/viewer/viewer.css` (20+ refs) | All old surface/text tokens | Hearth equivalents |

**Token mapping (Lucid to Hearth):**
- `--surface-0` -> `--surface-page`
- `--surface-1` -> `--surface-container`
- `--surface-2` -> `--surface-elevated`
- `--surface-3` -> `--surface-elevated` (contextual)
- `--surface-4` -> `--border-default` (used as borders) or `--surface-overlay` (used as backgrounds)
- `--surface-5` -> `--surface-overlay`
- `--surface-6` -> `--surface-overlay`
- `--text-hi` -> `--text-primary`
- `--text-mid` -> `--text-secondary`
- `--text-lo` -> `--text-tertiary`

**Depends on:** Nothing
**Test proves it:** U11 grep-audit test (AC1)

### Task 2: Fix frontend API paths (`/api/products` -> `/api/teams`)

**Files to change:**

| File | Change |
|---|---|
| `packages/web/src/hooks/useTeam.ts` | `/api/products/:id` -> `/api/teams/:id`, update comments |
| `packages/web/src/hooks/useTeams.ts` | `/api/products` -> `/api/teams`, update comments |
| `packages/web/src/settings/SettingsTeams.tsx` | `/api/products/:id` -> `/api/teams/:id`, update comments |
| `packages/web/src/pages/SetupFlow.tsx` | `/api/products` -> `/api/teams`, update comments |

**Depends on:** Nothing (independent of Task 1)
**Test proves it:** U11 grep-audit test (AC3) + existing E2E tests continue to pass after fixture update (Task 3)

### Task 3: Fix E2E test fixtures and specs

**Files to change:**

| File | Change |
|---|---|
| `packages/web/e2e/fixtures.ts` | Rename `DEFAULT_PRODUCTS` to `DEFAULT_TEAMS`, change mock URL from `**/api/products` to `**/api/teams`, update fixture shape from `{ products: [...] }` to `{ teams: [...] }`, update `registerCoreMocks()` |
| `packages/web/e2e/work.spec.ts` | `PRODUCTS_FIXTURE` -> teams shape, mock `**/api/teams`, update assertions (`product-card` -> `team-card` or whatever the current testid is) |
| `packages/web/e2e/settings.spec.ts` | Line 58: "Products" tab -> verify current label (may be "Teams"). Line 72-73: update `Product Alpha` assertion |
| `packages/web/e2e/settings-redesign.spec.ts` | Lines 133, 323, 325: "Products" -> "Teams" if UI label changed |
| Other E2E specs referencing `api/products` | Update mock URLs |

**Important nuance:** Before changing E2E assertions about tab labels ("Products" vs "Teams"), verify what the actual UI renders. If the settings overlay still shows "Products" as the tab label, that's a UI bug to fix in this task. Check `packages/web/src/settings/` for the actual label text.

**Depends on:** Task 2 (production API paths must be correct before E2E mocks are updated)
**Test proves it:** `npm run test:e2e` exits 0 (AC6)

### Task 4: Write U11 validation test suite

**New file:** `packages/web/src/__tests__/U11-hearth-validation.test.ts`

This test consolidates and extends the validation:

```typescript
// Grep-based audit tests:
// 1. No old Lucid tokens (surface-0..6, text-hi/mid/lo, lucid-dark, lucid-light) 
//    in production code across packages/web/src/ AND packages/design-system/src/
//    (excluding __tests__/, *.test.*, *.spec.*, *.stories.*)
// 2. No /api/products in production code (excluding router.tsx redirect, @lore comments)
// 3. No functional references to IconRail, PitchCard, PitchSelector
//    (comment-only references are allowed)
// 4. No /api/products in e2e/ directory
```

**Also update/subsume:** The existing `U9-token-migration.test.tsx` has explicit exclusions (e.g., `KnowledgeBody.tsx`) that should be removed once Task 1 fixes those files. Either update U9 test to remove exclusions, or have U11 test be the comprehensive superset.

**Depends on:** Tasks 1, 2, 3 (tests must pass after fixes)
**Test proves it:** Self-proving (the test IS the proof for AC1, AC2, AC3, AC4)

### Task 5: Write U11 Hearth screenshot E2E test

**New file:** `packages/web/e2e/U11-hearth-validation.spec.ts`

Navigates to each main screen, asserts structural markers, captures screenshot:

```
Screens and structural assertions:
- /conversations              -> [data-testid='conversations-page'] visible
- /conversations/<thread-id>  -> [data-testid='thread-shell'] visible (mock thread)  
- /work/portfolio             -> [data-testid='work-portfolio-page'] visible
- /work/portfolio (bet click) -> bet detail renders (mock bet detail)
- /work/team/<team-id>        -> team view renders (mock team)
- /knowledge                  -> [data-testid='knowledge-list-page'] visible
- /knowledge/<item-id>        -> [data-testid='knowledge-detail-page'] visible
- Settings overlay            -> dialog visible with section tabs
```

Each test:
1. Sets up minimal API mocks (threads, teams, bets, knowledge items)
2. Navigates to the page
3. Asserts the page-level structural marker is visible
4. Captures a full-page screenshot via `page.screenshot({ path: ... })`
5. Asserts no blank screen (page has content beyond just the sidebar)

Screenshots saved to `packages/web/e2e/screenshots/U11/` (gitignored).

**Depends on:** Tasks 1, 2, 3 (pages must render correctly with fixed tokens and API paths)
**Test proves it:** AC7

### Task 6: Run design-system visual regression

Run `npx playwright test --config packages/design-system/playwright.config.ts` and fix any failures. The visual regression compares HTML reference pages vs TSX components at <5% pixel diff.

**Potential issues:** After fixing `body-editor.css` tokens (Task 1), the visual regression for Block component may shift. The HTML reference pages use their own theme CSS (`html/themes/hearth-light.css`, `hearth-dark.css`) which may have compat aliases. Verify both sides use the same token values.

**Depends on:** Task 1 (token fixes must be applied first)
**Test proves it:** AC5

### Task 7: Update protected tests that assert old token names

The existing `KnowledgeBody.test.tsx` asserts `text-[var(--text-lo)]` — this is why `KnowledgeBody.tsx` was excluded from the U9 migration. Now that U11 migrates `KnowledgeBody.tsx` (Task 1), the test must be updated too.

Similarly, check if `U9-token-migration.test.tsx` exclusions need removal.

**Files to check/update:**
- `packages/web/src/pages/knowledge/__tests__/KnowledgeBody.test.tsx` — update assertion from `--text-lo` to `--text-tertiary`
- `packages/web/src/__tests__/U9-token-migration.test.tsx` — remove `KnowledgeBody.tsx` exclusion

**Depends on:** Task 1 (production code must be fixed first)
**Test proves it:** `npm run test` passes (AC8)

### Task 8: Full verification

Run `npm run check`, `npm run lint`, `npm run test -- --all`, `npm run test:e2e`, `npm run verify`.

**Depends on:** All previous tasks
**Test proves it:** AC8, AC9

---

## Task Dependency Graph

```
Task 1 (fix tokens) ──────────┐
Task 2 (fix API paths) ───────┤
                               ├── Task 3 (fix E2E fixtures) ──┐
                               │                                ├── Task 4 (validation test)
                               │                                ├── Task 5 (screenshot E2E)
Task 7 (update protected      │                                │
        tests) ────────────────┘                                │
                                                                │
Task 6 (visual regression) ────────────────────────────────────┤
                                                                │
                                                            Task 8 (full verify)
```

Tasks 1, 2 can run in parallel. Task 3 depends on Task 2. Tasks 4, 5, 6, 7 depend on Tasks 1+2+3. Task 8 depends on all.

---

## Detailed File Inventory: Old Token Occurrences

### packages/web/src/ (production files only)

| File | Line(s) | Token | Replacement |
|---|---|---|---|
| `components/ThreadSections.tsx` | 262 | `var(--surface-1)` | `var(--surface-container)` |
| `components/ThreadSections.tsx` | 266 | `var(--surface-1)` | `var(--surface-container)` |
| `components/BlockRefEmbed.tsx` | 54, 70, 88 | `var(--surface-1)` | `var(--surface-container)` |
| `components/CocAttachButton.tsx` | 42 | `var(--surface-6)` | `var(--surface-overlay)` |
| `designsystem/DesignSystem.tsx` | 119 | `var(--surface-4)`, `var(--surface-1)` | `var(--border-default)`, `var(--surface-container)` |
| `designsystem/DesignSystem.tsx` | 120 | `var(--text-hi)` | `var(--text-primary)` |
| `designsystem/DesignSystem.tsx` | 129 | `var(--surface-4)`, `var(--text-hi)` | `var(--surface-overlay)`, `var(--text-primary)` |
| `designsystem/DesignSystem.tsx` | 130 | `var(--text-mid)`, `var(--text-hi)`, `var(--surface-2)` | `var(--text-secondary)`, `var(--text-primary)`, `var(--surface-elevated)` |
| `designsystem/DesignSystem.tsx` | 148 | `var(--text-lo)` | `var(--text-tertiary)` |
| `designsystem/DesignSystem.tsx` | 169 | `var(--text-hi)` | `var(--text-primary)` |
| `designsystem/DesignSystem.tsx` | 174 | `var(--surface-4)` | `var(--border-default)` |
| `designsystem/DesignSystem.tsx` | 214 | `var(--surface-4)`, `var(--text-hi)` | `var(--surface-overlay)`, `var(--text-primary)` |
| `designsystem/DesignSystem.tsx` | 215 | `var(--text-lo)`, `var(--text-mid)` | `var(--text-tertiary)`, `var(--text-secondary)` |
| `designsystem/DesignSystem.tsx` | 233 | `var(--surface-4)` | `var(--border-default)` |
| `designsystem/DesignSystem.tsx` | 234 | `var(--surface-4)`, `var(--surface-1)` | `var(--border-default)`, `var(--surface-container)` |
| `designsystem/DesignSystem.tsx` | 235 | `var(--text-lo)` | `var(--text-tertiary)` |
| `pages/SetupFlow.tsx` | 105 | `var(--surface-0)` | `var(--surface-page)` |
| `pages/knowledge/KnowledgeBody.tsx` | 130 | `var(--text-lo)` | `var(--text-tertiary)` |

### packages/design-system/src/ (shipped code)

| File | Count | Tokens | Notes |
|---|---|---|---|
| `body-editor.css` | 13 | `--text-hi` (7), `--text-mid` (2), `--text-lo` (2), `--surface-1` (2) | Shipped CSS for the TipTap editor |

### packages/design-system/viewer/ (design-system chrome, not shipped in web)

| File | Count | Tokens | Notes |
|---|---|---|---|
| `viewer/viewer.css` | 20+ | Full old token set | Viewer chrome — fix for completeness, does not ship in production web bundle |

---

## Detailed File Inventory: /api/products References

### Frontend production code

| File | Line(s) | Current | Fix |
|---|---|---|---|
| `hooks/useTeam.ts` | 5, 35 | `/api/products/:id` | `/api/teams/:id` |
| `hooks/useTeams.ts` | 5, 31 | `/api/products` | `/api/teams` |
| `settings/SettingsTeams.tsx` | 7, 41 | `/api/products/:id` | `/api/teams/:id` |
| `pages/SetupFlow.tsx` | 10-11, 69, 75 | `/api/products` | `/api/teams` |

### E2E test infrastructure

| File | Lines | Change |
|---|---|---|
| `e2e/fixtures.ts` | 66-81, 164-174, 236-246 | Rename `DEFAULT_PRODUCTS` -> `DEFAULT_TEAMS`, mock `**/api/teams`, shape `{ teams: [...] }` |
| `e2e/work.spec.ts` | 10-24, 29-35 | `PRODUCTS_FIXTURE` -> `TEAMS_FIXTURE`, mock `**/api/teams` |
| Various other E2E specs | References to `api/products` | Update mock URL patterns |

---

## Security & Abuse Cases

All N/A — this workpackage makes no new API endpoints, no new data surfaces, no new credential handling, no new input fields. It fixes existing code to use correct API paths and token names.

| Check | Status |
|---|---|
| Rate limiting on new endpoints | N/A — no new endpoints |
| Input trust boundary | N/A — no new inputs |
| Secret handling | N/A — no new credentials |
| Path traversal | N/A — no path inputs |
| SSRF | N/A — no outbound URLs |

---

## Protected Tests

Tests whose assertions must NOT change (they verify completed workpackage contracts):

```
protectedTests:
  - packages/web/src/__tests__/U5-type-sweep.test.ts
  - packages/web/src/__tests__/foundation.test.ts
  - packages/web/src/__tests__/no-base-content-text-tokens.test.ts
  - packages/design-system/src/__tests__/visual-regression.test.ts
  - packages/design-system/src/__tests__/tokens.test.ts
  - packages/design-system/src/__tests__/themes.test.ts
```

Tests that ARE expected to change:
- `packages/web/src/__tests__/U9-token-migration.test.tsx` — remove KnowledgeBody.tsx exclusion
- `packages/web/src/pages/knowledge/__tests__/KnowledgeBody.test.tsx` — update `--text-lo` assertion to `--text-tertiary`

---

## Risks & Ambiguities

1. **Settings tab label "Products" vs "Teams"**: The settings overlay may still show "Products" as a section label. If so, this is a UI bug that must be fixed (rename to "Teams") and the E2E tests updated accordingly. The builder should verify the actual rendered label before changing test assertions.

2. **E2E fixture shape drift**: Changing `{ products: [...] }` to `{ teams: [...] }` in fixtures requires verifying what the actual API returns and what the frontend expects. The hooks (`useTeams.ts`) parse the response — if they expect `products` key, the hook must be updated to expect `teams` too.

3. **viewer/viewer.css scope**: This file is NOT in the web bundle — it's design-system chrome. Fixing it is completeness, not a production concern. If it causes unexpected visual regression failures, it can be deferred (but should not be).

4. **body-editor.css token fallbacks**: If the HTML reference pages define old tokens as compat aliases in their theme CSS (`hearth-light.css` mentions avoiding old tokens), but `body-editor.css` references them, the visual regression may pass on HTML side (where aliases exist) but fail on TSX side (where only new tokens are defined). Investigate whether `hearth-light.css` defines compat aliases before migrating.

---

## Design-It-Twice

Not applicable. This workpackage has no non-trivial design decisions — it's mechanical migration and validation. Every change has a single correct answer (old token -> new token, old API path -> new API path).
