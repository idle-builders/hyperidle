# U11 Code Review

**Reviewer:** Phase 4 (code against plan)
**Branch:** `feat/U11-visual-validation`
**Diff:** 44 files, +1217/-305 lines

---

## Lens 1: Architecture

U11 is a validation gate -- no new features, no new APIs, no new components. The code changes are strictly mechanical: token renames in production code, API path migrations, E2E fixture updates, and a new grep-based audit test. This matches the plan's scope exactly.

**Token migrations (Task 1):** All 7 production files listed in the plan were migrated. `ThreadSections.tsx`, `BlockRefEmbed.tsx`, `CocAttachButton.tsx`, `DesignSystem.tsx`, `SetupFlow.tsx`, `KnowledgeBody.tsx` -- each token replacement follows the plan's mapping table. `body-editor.css` (13 refs) and `viewer/viewer.css` (20+ refs) were also migrated. Post-migration grep confirms zero old tokens remain in `packages/web/src/` and `packages/design-system/src/` production files (NavItem.tsx only has old tokens in `@lore` comments, correctly excluded by the audit test).

**API path migrations (Task 2):** All 4 production files (`useTeam.ts`, `useTeams.ts`, `SettingsTeams.tsx`, `SetupFlow.tsx`) were migrated from `/api/products` to `/api/teams`. Comments were updated. The `@lore` comments documenting the migration history are well-placed.

**E2E fixture updates (Task 3):** All 20 E2E files identified in the Phase 2 critique (finding C-4) were updated. The diff shows changes in `fixtures.ts` plus 19 spec files. Mock URLs changed from `**/api/products` to `**/api/teams`, response shapes from `{ products: [...] }` to `{ teams: [...] }`, and fixture data updated to team shapes. This addresses the Phase 2 requirement to enumerate all 20 files.

**Protected test updates (Task 7):** `KnowledgeBody.test.tsx` assertion updated from `--text-lo` to `--text-tertiary`. `U9-token-migration.test.tsx` exclusion of `KnowledgeBody.tsx` removed. Both changes are correct and documented.

**Validation test (Task 4):** `U11-hearth-validation.test.ts` (360 lines) covers AC1-AC4 with grep-based audits. The test structure is sound.

**Score: PASS** -- code matches plan contracts.

---

## Lens 2: Design

Skipped. No UI surfaces created.

---

## Lens 3: Security

No new endpoints, no new inputs, no new credential handling. The API path migration (`/api/products` to `/api/teams`) does not change security posture. The `N2-auth.spec.ts` test was correctly updated to verify `X-API-Key` injection on `/api/teams` requests (addressing Phase 2 finding R-1).

**Score: N/A** -- no security surface.

---

## Lens 4: Adversarial

### Finding A-1: Stale URL regex in L12-artifact-surfaces.spec.ts (non-blocking)

`packages/web/e2e/L12-artifact-surfaces.spec.ts` line 116: the route handler intercepts `**/api/teams**` but the inner regex still matches `/products/`:

```typescript
await page.route("**/api/teams**", async (route: Route) => {
    const url = route.request().url();
    if (url.match(/\/products\/?(\?|$)/)) {  // <-- will never match
```

The regex `\/products\/` will never match a URL containing `/api/teams`. The first branch is dead code. The handler falls through to the else branch (line 125) which returns the same empty-data response -- so the test still passes, but the logic is broken. This is a copy-paste migration error: the route URL was changed but the inner URL discrimination was not.

**Severity:** Low (functionally harmless -- both branches return equivalent data). But it is incorrect code that would mislead future readers.

### Finding A-2: Residual `productId` field in Q3-bet-creation.spec.ts (non-blocking)

`packages/web/e2e/Q3-bet-creation.spec.ts` line 69: the `MOCK_CREATE_RESPONSE` object has both `productId: "test-product-1"` and `teamId: "test-team-1"`. The builder added `teamId` (addressing Phase 2 finding C-5) but left `productId` alongside it. Since this is mock API response data, having both fields is acceptable if the API returns both during a migration period. However, line 69 still contains the old field name `productId` which contradicts the spirit of AC5 ("no references to old product/pitch vocabulary").

**Severity:** Very low (mock data, not production code; the test passes either way).

### Finding A-3: PRODUCTS_FIXTURE variable name in work-surface.spec.ts (non-blocking)

`packages/web/e2e/work-surface.spec.ts` line 17: the variable is still named `PRODUCTS_FIXTURE` despite containing `{ teams: [...] }`. Other files were renamed (e.g., `work.spec.ts` uses `TEAMS_FIXTURE`). This is inconsistent.

**Severity:** Very low (variable naming in test code, no functional impact).

### Finding A-4: Stale fixture shape in work-surface.spec.ts (non-blocking)

`packages/web/e2e/work-surface.spec.ts` lines 17-63: the `PRODUCTS_FIXTURE` still has the old product-shaped fields (`status: "healthy"`, `leadAgentId`, `activeBets`, `shipped`, `shipRate`, `progress`). The test no longer asserts on these fields (it only checks `team-pill-filters` visibility), so the extra fields are harmless mock noise. But the fixture shape does not match the actual `TeamListResponse` type.

**Severity:** Very low (mock data is consumed by runtime code that only reads the fields it needs).

---

## Lens 5: Simplification

### Finding S-1: U11 audit test comment filtering could be tighter

In `U11-hearth-validation.test.ts`, the `findApiProducts` function (line 81) filters out comment lines using multiple chained `.filter()` calls:

```typescript
.filter((l) => !l.includes("@lore"))
.filter((l) => !l.includes("// "))
.filter((l) => !l.includes(" * "))
.filter((l) => !l.match(/router\.tsx/))
.filter((l) => !l.includes("backward compat"))
.filter((l) => !l.includes("renamed"));
```

The filters for `"backward compat"` and `"renamed"` are fragile -- they match arbitrary prose rather than structured comment syntax. A future line containing these words in functional code would be silently excluded. However, since the purpose of this test is to enforce a state that is now known-clean, the false-negative risk is low.

### Finding S-2: Duplicate token audit coverage

`U9-token-migration.test.tsx` and `U11-hearth-validation.test.ts` both grep for old tokens in overlapping directories. U11 is strictly a superset of U9 (it covers all the same directories plus `design-system/src/` and `design-system/viewer/`). The U9 test could be removed, but keeping both is acceptable -- they document different workpackage contracts and the runtime cost is trivial (grep is fast).

---

## Lens 6: AI Slop

### Finding SL-1: Excessive @lore comments on mechanical changes

Many E2E file changes include `@lore U11:` annotations explaining the migration. For example:

- `settings.spec.ts` line 8: `@lore U11: Tab label renamed from "Products" to "Teams"`
- `responsive-density.spec.ts` line 61: `@lore U11: WorkPortfolio (U9) renders BetCards...`
- `work.spec.ts` line 7: `@lore U11: Migrated from /api/products to /api/teams`

Some of these are valuable (explaining why `product-card` testid was removed). Others are documenting obvious mechanical renames that the git diff already captures. The project rules say to use `@lore` for "non-obvious decisions" and "workarounds" -- a simple URL find-and-replace is neither. However, erring on the side of too much documentation is a minor issue.

### Finding SL-2: No copy-paste errors, no dead imports, no `any` casts

The diff is clean of common AI slop tells. No `console.log`, no `TODO: implement`, no unnecessary async, no defensive null checks on non-nullable types, no `=== true` comparisons. The code is mechanical and correct.

---

## AC Completeness Audit

| Spec AC | Status | Evidence |
|---------|--------|----------|
| **AC1:** Visual regression baselines re-captured (light + dark) | UNCLEAR | No evidence of visual regression test execution in the diff. The attestation ran `test` but not `e2e`. The plan's Task 5 (screenshot E2E test) and Task 6 (visual regression) produce no artifacts in the diff. The plan called for a `U11-hearth-validation.spec.ts` E2E file -- it does not exist. However, the attestation passed `test` (which includes vitest) and the body-editor.css/viewer.css token migrations would affect visual regression. **This AC cannot be verified from the diff alone.** |
| **AC2:** Playwright E2E tests pass (nav, bet CRUD, thread, knowledge, settings) | UNCLEAR | E2E fixtures and specs were updated to match production code. The attestation does not include `e2e` in its tools list. **No evidence of E2E execution in the attestation.** |
| **AC3:** Screenshot comparison of every main screen | NOT MET | The plan called for `packages/web/e2e/U11-hearth-validation.spec.ts` to navigate to each main screen and capture screenshots. This file was not created. No screenshots exist in the diff. |
| **AC4:** Zero type errors, zero lint errors, all tests green | MET | Attestation shows `check`, `lint:biome`, `lint:eslint`, `test` all passed with `dirty: false`. |
| **AC5:** No old Lucid tokens, vocabulary, or deleted component refs | PARTIALLY MET | Production code is clean (verified by grep). E2E code is clean of route handlers. **However:** (1) `PRODUCTS_FIXTURE` variable name persists in `work-surface.spec.ts`; (2) `productId` field persists in `Q3-bet-creation.spec.ts` line 69; (3) "Products" knowledge scope label persists in `Sidebar.tsx` and `KnowledgeList.tsx` (Phase 2 finding C-2 -- the builder made no decision on this). These are borderline: `productId` is a mock field, `PRODUCTS_FIXTURE` is a variable name, and the knowledge scope "Products" is arguably domain vocabulary (not old "product-to-team" vocabulary). The spec says "no old product/pitch vocabulary" which is ambiguous about knowledge scopes. |
| **AC6:** `npm run verify` passes | MET | Attestation `status: "passed"`, `dirty: false`, `partial: false`. |

---

## Phase 2 Findings Verification

| Phase 2 Finding | Addressed? |
|-----------------|------------|
| **C-2:** "Products" label in Sidebar.tsx / KnowledgeList.tsx | NOT ADDRESSED. The builder did not rename these labels or document a decision to keep them. These files are unchanged in the diff. |
| **C-4:** Incomplete E2E file inventory | ADDRESSED. All 20 E2E files were updated in the diff. |
| **C-3:** product-card testid in E2E | ADDRESSED. All 4 files updated: L13 test now navigates directly, work-surface.spec.ts checks team-pill-filters, responsive-density.spec.ts uses `data-ds-component='BetCard'`, work.spec.ts checks portfolio page visibility. |
| **C-5:** productId field in bet fixtures | PARTIALLY ADDRESSED. Q3-bet-creation.spec.ts added `teamId` but left `productId` alongside it (line 69). R2-work-first-landing.spec.ts was correctly updated to use `teamId`. |
| **CA-2:** Settings tab label definitively "Teams" | ADDRESSED. settings.spec.ts and settings-redesign.spec.ts both assert "Teams" with `@lore` comments explaining the rename. |

---

## Verdict: NOT DONE

### Blocking Findings

**B-1: AC3 (screenshot comparison) is unmet.** The plan required `packages/web/e2e/U11-hearth-validation.spec.ts` to navigate every main screen and capture screenshots. This file was not created. No screenshots exist. The spec AC says: "Screenshot comparison of every main screen against the Hearth reference aesthetic." This is a top-level spec AC, not an internal plan detail.

**B-2: AC1 (visual regression baselines) and AC2 (E2E pass) lack evidence.** The verify attestation does not include `e2e` in its tool list. There is no evidence that Playwright E2E tests were executed against the updated fixtures. The builder may have run them separately, but the attestation does not record it.

### Non-Blocking Findings

- **A-1:** Stale URL regex in `L12-artifact-surfaces.spec.ts` line 116 (`/products/` regex inside a `/api/teams` route handler).
- **A-2:** Residual `productId` field in `Q3-bet-creation.spec.ts` line 69 (alongside the new `teamId`).
- **A-3:** `PRODUCTS_FIXTURE` variable name in `work-surface.spec.ts` (should be `TEAMS_FIXTURE`).
- **C-2 (from Phase 2):** "Products" knowledge scope label in `Sidebar.tsx` and `KnowledgeList.tsx` -- no decision recorded.

### Required Actions

1. Create `packages/web/e2e/U11-hearth-validation.spec.ts` per the plan (Task 5), or explicitly document why AC3 is satisfied without it.
2. Run `npm run test:e2e` and confirm all E2E tests pass. Run the design-system visual regression. Include evidence (exit codes or attestation) that these passed.
3. Fix the stale regex in `L12-artifact-surfaces.spec.ts` line 116 (change `/products/` to `/teams/` in the URL match).
4. Decide on the "Products" knowledge scope label (C-2) and either rename or document the decision in a `@lore` comment.
