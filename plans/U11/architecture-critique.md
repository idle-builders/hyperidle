# U11 Architecture Critique

**Reviewer:** Phase 2 architecture critique
**Plan reviewed:** `plans/U11/architecture.md`
**Workpackage spec:** `TRACK-U.md` section U11

---

## Dimension Scores

### 1. Completeness — 7/10

The plan covers all 6 spec ACs but inflates them to 9 internal ACs (AC1-AC9). This is acceptable for a validation workpackage where each spec AC has multiple verification vectors. However:

**Finding C-1 (gap):** The plan's token grep pattern omits `lucid-dark` and `lucid-light` from the file inventory scan. The spec AC-5 explicitly includes these: `lucid-dark|lucid-light|surface-0|...`. I verified the codebase: zero production references to `lucid-dark`/`lucid-light` exist (confirmed clean), but the plan's grep-audit test (AC1 description, line 52) does mention them — the file inventory section just does not list any occurrences or confirm their absence. The builder needs to know whether to scan for them or not. Verdict: minor gap; the test description is correct but the inventory is incomplete.

**Finding C-2 (gap):** The plan misses **"Products" as a UI label** in two production files:
- `packages/web/src/shell/Sidebar.tsx` line 84: `{ label: "Products", scope: "products" }` in `KNOWLEDGE_SCOPE_ITEMS`
- `packages/web/src/pages/KnowledgeList.tsx` line 337: `{ id: "products", label: "Products", scopeValue: "product" }`

These are NOT `/api/products` path references — they are the knowledge scope filter labels ("Practices", "Products", "Factory"). The spec says "No references to old product/pitch vocabulary." These "Products" labels in the knowledge scope filters are domain vocabulary that predates the product-to-team rename. The question is: are these legitimate knowledge scope names (a "Products" scope meaning the team's product catalog), or are they leftover "product" vocabulary that should now say "Teams"? The E2E test `U9-screen-layouts.spec.ts` line 242 asserts `"Products"` as a valid scope pill, suggesting this was intentional in U9. The plan must explicitly decide: keep or rename. Currently it is silent.

**Finding C-3 (gap):** The plan identifies `product-card` testid references in E2E tests (work.spec.ts, work-surface.spec.ts) but does not mention them in the Task 3 file change list. I confirmed: `product-card` testid no longer exists in production code (it was renamed to `bet-card` in U9). The E2E tests asserting `getByTestId("product-card")` will fail. These files need updating:
- `packages/web/e2e/L13-product-drilldown.spec.ts` line 123
- `packages/web/e2e/work-surface.spec.ts` line 80
- `packages/web/e2e/work.spec.ts` line 47
- `packages/web/e2e/responsive-density.spec.ts` lines 347, 372

**Finding C-4 (gap):** The plan's E2E file inventory for `/api/products` is incomplete. It lists `fixtures.ts`, `work.spec.ts`, and `settings.spec.ts` / `settings-redesign.spec.ts`. But the actual grep found **20 unique E2E files** referencing `api/products`:
- `L12-artifact-surfaces.spec.ts` (2 refs)
- `L13-product-drilldown.spec.ts` (8 refs)
- `L17-cost-tokens.spec.ts` (3 refs)
- `M3-api-wiring.spec.ts` (1 ref)
- `N2-auth.spec.ts` (8 refs)
- `accessibility.spec.ts` (3 refs)
- `accessibility-K8.spec.ts` (3 refs)
- `artifact-aggregation.spec.ts` (1 ref)
- `artifact-embed-no-chrome.spec.ts` (1 ref)
- `artifact-no-preview.spec.ts` (1 ref)
- `artifact-permalink.spec.ts` (1 ref)
- `artifact-thread.spec.ts` (1 ref)
- `lifecycle-propagation.spec.ts` (4 refs)
- `responsive-density.spec.ts` (2 refs)
- `setup-flow.spec.ts` (4 refs)
- `touch-targets.spec.ts` (3 refs)
- `work-surface.spec.ts` (2 refs)
- `work.spec.ts` (3 refs)
- `R2-work-first-landing.spec.ts` (1 ref)
- `fixtures.ts` (5 refs)

The plan's Task 3 vaguely says "Other E2E specs referencing `api/products` | Update mock URL patterns" but does not enumerate them. This is exactly the kind of ambiguity that causes a builder to miss files. A validation workpackage cannot afford silent omissions.

**Finding C-5 (gap):** `productId` in bet fixture shapes. `Q3-bet-creation.spec.ts` (lines 29, 44, 69) and `R2-work-first-landing.spec.ts` (line 286) use `productId: "test-product-1"` in bet mock data. If the API now expects `teamId`, these fixtures will produce incorrect mock data. The plan does not mention this field-level rename in E2E fixtures.

### 2. Feasibility — 8/10

The token mapping table (Task 1) is concrete and actionable. File paths and line numbers are provided. The builder can execute most tasks mechanically.

**Finding F-1 (ambiguity):** Task 1 maps `--surface-4` to either `--border-default` or `--surface-overlay` depending on usage context. In `DesignSystem.tsx`, some `surface-4` uses are borders (lines 174, 233, 234) and some are backgrounds (lines 129, 214). The plan lists specific replacements per line which is good, but the builder must verify each one visually to confirm the semantic mapping is correct. This is stated but could be more explicit.

**Finding F-2 (ambiguity):** The `viewer/viewer.css` entry says "20+ refs" with "All old surface/text tokens -> Hearth equivalents" but does not provide the per-line mapping the way it does for every other file. The viewer has 21 old token references across `surface-0` through `surface-6`, `text-hi`, `text-mid`, `text-lo`. The builder will need to derive mappings themselves. For consistency with the rest of the plan, this should be enumerated.

### 3. Risk Identification — 8/10

Four risks are called out, all legitimate. The `body-editor.css` compat alias risk (Risk 4) is particularly well-identified.

**Finding R-1 (missed risk):** The plan does not flag the risk that the `N2-auth.spec.ts` test specifically validates that `X-API-Key` is injected on `/api/products` requests. Changing the mock URL to `/api/teams` in this test is not just a URL substitution — the test's purpose is to verify auth header injection. The comment on line 73 says `apiFetch("/api/products")` — after Task 2 changes this to `/api/teams`, the test must mirror that change. This is straightforward but the risk is that the builder might not realize the test description and comments also need updating to match.

**Finding R-2 (missed risk):** The `"Products"` knowledge scope label in `Sidebar.tsx` and `KnowledgeList.tsx` (Finding C-2) could break `U9-screen-layouts.spec.ts` line 242 if changed, or leave old vocabulary if not changed. This needs a decision, not silence.

### 4. Task Ordering — 9/10

The dependency graph is correct. Tasks 1 and 2 are properly identified as parallel. Task 3 correctly depends on Task 2. Tasks 4-7 correctly wait for upstream fixes. Task 8 is the terminal gate.

**Finding T-1 (minor):** Task 7 is shown depending on Tasks 1+2+3 in the text ("depends on Task 1") but in the ASCII dependency graph it appears to feed into the same junction as Task 3. The graph is slightly ambiguous about whether Task 7 depends on Task 3 or only Task 1. Since Task 7 only touches test assertions for token names (not API paths), it truly only depends on Task 1, not Task 2 or 3. The graph could be clearer.

### 5. Testability — 8/10

Every AC has a concrete verification method. The grep-audit approach is appropriate for a validation workpackage. The visual regression via Playwright pixelmatch is well-established.

**Finding TE-1 (concern):** AC7 (screenshot comparison) relies on "agent visual review" of screenshots. This is not automatable in the test suite — it requires a visual-capable agent to look at the screenshots and judge Hearth conformance. The E2E test itself only asserts "page is not blank and has structural markers." The plan should acknowledge that AC7 is partially manual (visual judgment) and define what "pass" means for the visual portion. The spec says "screenshot comparison against Hearth reference" but there is no automated reference comparison — only structural assertions.

**Finding TE-2 (minor):** The plan proposes saving screenshots to `packages/web/e2e/screenshots/U11/` and marking them gitignored. If the screenshots are not committed, they exist only during the builder's session. Future agents cannot re-verify. Consider whether these should be committed as reference baselines.

### 6. Scope Discipline — 9/10

The plan stays firmly within validation bounds. No new features. The token fixes and API path corrections are "issues found, fixed in-workpackage" per the spec constraint. The "Design-It-Twice" section correctly marks itself N/A.

**Finding S-1 (minor):** The `viewer/viewer.css` fix is noted as "completeness, not a production concern" since the viewer is not shipped in the web bundle. The plan correctly prioritizes it but appropriately notes it can be deferred if problematic. This is good scope awareness.

### 7. Contract Adherence — 8/10

The plan respects the token mapping contract from U3, the API contract from U2, and the protected test boundaries from prior workpackages.

**Finding CA-1 (concern):** The plan correctly identifies `KnowledgeBody.test.tsx` as needing update (Task 7), but the current protected-tests list in the plan includes `visual-regression.test.ts`, `tokens.test.ts`, and `themes.test.ts` as unchanged. The plan should verify that the visual regression test component list is still correct after the `body-editor.css` token migration — if the Block component's visual regression shifts, the test may fail without being "changed" (it would fail on assertion, not on test code).

**Finding CA-2 (concern):** The `settings.spec.ts` (lines 58, 72-73) asserts `"Products"` as a tab name and `"Product Alpha"` as content. The actual settings UI uses `"Teams"` as the tab label (confirmed: `settings-types.ts` line 38). These E2E tests are currently broken (asserting "Products" when the UI says "Teams"). The plan mentions them but the fix description in Task 3 says "verify current label (may be 'Teams')" — this hedge should be resolved. I verified: the label IS "Teams". The plan should state this definitively, not conditionally.

### 8. Cost Efficiency — 9/10

For an M-effort workpackage (~6h), the plan is appropriately scoped. Eight tasks with clear mechanical work. No over-engineering. The grep-audit approach avoids expensive manual file-by-file review.

**Finding CE-1 (observation):** The E2E fixture changes across 20+ files are more work than the plan implies. The "Other E2E specs" catch-all in Task 3 undersells the effort. This is closer to L effort if all 20 E2E files need mock URL updates plus fixture shape changes.

### 9. Clarity — 7/10

The plan is well-structured with tables, line numbers, and token mappings. The AC decomposition is clear. However:

**Finding CL-1 (problem):** Task 3's file list is incomplete (Finding C-4). A builder reading only Task 3 would update fixtures.ts, work.spec.ts, settings.spec.ts, and settings-redesign.spec.ts — then discover 16 more files failing at Task 8. The plan must enumerate all 20 E2E files.

**Finding CL-2 (minor):** The plan uses both "AC1" (internal numbering) and references to "spec AC-5" (spec numbering) without a mapping table. The AC numbering is self-consistent within the plan, but cross-referencing to the spec requires the reader to count. A simple mapping (Plan AC1 = Spec AC5 "No references to old tokens") would help.

**Finding CL-3 (minor):** Task 4 says "Write U11 validation test suite" and depends on Tasks 1, 2, 3 — but per TDD methodology, the test should be written FIRST (red phase) and the code changes should make it pass (green phase). The dependency ordering implies write-code-then-test, which contradicts the project's TDD philosophy. For a validation workpackage this is less critical (the tests validate an existing state), but the ordering should be explicit: write the test expecting current state to fail, then fix, then verify green.

---

## AC-to-Task Mapping Audit

| Spec AC | Plan AC(s) | Task(s) | Covered? |
|---|---|---|---|
| AC1: Visual regression baselines re-captured | AC5 | Task 6 | YES |
| AC2: E2E tests pass (nav, bet CRUD, thread, knowledge, settings) | AC6 | Tasks 3, 5, 8 | YES |
| AC3: Screenshot comparison of every main screen | AC7 | Task 5 | YES (partially manual) |
| AC4: Zero type/lint errors, all tests green | AC8 | Task 8 | YES |
| AC5: No old token/vocabulary/component refs | AC1, AC2, AC3, AC4 | Tasks 1, 2, 3, 4 | PARTIALLY — "Products" scope label unresolved (C-2) |
| AC6: npm run verify passes | AC9 | Task 8 | YES |

**Orphan tasks:** None. All tasks map to at least one AC.
**Uncovered ACs:** AC5 has a gap (C-2) — the "Products" knowledge scope label is old vocabulary that the plan does not address.

---

## Grep Pattern Completeness Audit

The spec's grep pattern is: `lucid-dark|lucid-light|surface-0|surface-1|surface-2|surface-3|surface-4|surface-5|surface-6|text-hi|text-mid|text-lo|PitchCard|PitchSelector|IconRail`

| Pattern | Plan covers? | Codebase matches? |
|---|---|---|
| `lucid-dark` | Mentioned in AC1 test spec | 0 production matches (clean) |
| `lucid-light` | Mentioned in AC1 test spec | 0 production matches (clean) |
| `surface-0` | YES (SetupFlow.tsx) | 1 match |
| `surface-1` | YES (5 files) | Multiple matches |
| `surface-2` | YES (DesignSystem.tsx) | 1 match |
| `surface-3` | NO (not in web/src) | 0 in web/src, 2 in viewer.css |
| `surface-4` | YES (DesignSystem.tsx) | Multiple matches |
| `surface-5` | NO (not in web/src) | 0 in web/src, 1 in viewer.css |
| `surface-6` | YES (CocAttachButton.tsx) | 1 match + viewer.css |
| `text-hi` | YES (DesignSystem.tsx, body-editor.css) | Multiple matches |
| `text-mid` | YES (DesignSystem.tsx, body-editor.css) | Multiple matches |
| `text-lo` | YES (KnowledgeBody.tsx, body-editor.css) | Multiple matches |
| `PitchCard` | AC2 covers | 0 production matches (clean) |
| `PitchSelector` | AC2 covers | 0 production matches (clean) |
| `IconRail` | AC2 covers | 0 production matches (only @lore comments) |

The grep pattern coverage is correct. The plan's audit test description at AC1 includes `lucid-dark`/`lucid-light` which is complete.

---

## E2E Strategy Realism

The current Playwright setup has 64 spec files, a `fixtures.ts` with shared mocks, and a `playwright.config.ts` for the design-system visual regression. The strategy is realistic with two caveats:

1. The scope of E2E fixture changes (20 files with `api/products` references) is significantly larger than the plan implies.
2. The `product-card` testid references in 4 E2E files will cause failures that the plan does not list.

---

## Protected Tests Verification

The protected test list is:
- `U5-type-sweep.test.ts` — should not change (verified: no old token assertions)
- `foundation.test.ts` — should not change
- `no-base-content-text-tokens.test.ts` — should not change
- `visual-regression.test.ts` — should not change (test code unchanged, but assertions may fail if TSX rendering shifts after `body-editor.css` migration)
- `tokens.test.ts` — should not change
- `themes.test.ts` — should not change

Tests expected to change:
- `U9-token-migration.test.tsx` — remove `KnowledgeBody.tsx` exclusion (correct)
- `KnowledgeBody.test.tsx` — update `--text-lo` to `--text-tertiary` (correct)

This is accurate. The `visual-regression.test.ts` risk (CA-1) should be noted.

---

## Summary

| Dimension | Score |
|---|---|
| 1. Completeness | 7 |
| 2. Feasibility | 8 |
| 3. Risk Identification | 8 |
| 4. Task Ordering | 9 |
| 5. Testability | 8 |
| 6. Scope Discipline | 9 |
| 7. Contract Adherence | 8 |
| 8. Cost Efficiency | 9 |
| 9. Clarity | 7 |
| **Average** | **8.1** |

**Verdict: PASS** (average 8.1, above 7.0 threshold)

---

## Required Revisions Before Build

These findings MUST be addressed in the plan before the builder starts:

1. **C-2 (Products scope label):** Decide whether `Sidebar.tsx` line 84 and `KnowledgeList.tsx` line 337 should say "Products" or "Teams" (or another name). If kept, document why. If changed, add to Task 2 and update `U9-screen-layouts.spec.ts` line 242.

2. **C-4 (E2E file inventory):** Enumerate all 20 E2E files that reference `api/products` in Task 3, not just 4 files plus "Other E2E specs." The builder needs a complete checklist.

3. **C-3 + C-5 (product-card testid + productId field):** Add these to Task 3:
   - `product-card` testid references in `L13-product-drilldown.spec.ts`, `work-surface.spec.ts`, `work.spec.ts`, `responsive-density.spec.ts`
   - `productId` field in bet fixture data in `Q3-bet-creation.spec.ts`, `R2-work-first-landing.spec.ts`

4. **CA-2 (settings tab label):** Replace the hedge "verify current label (may be 'Teams')" with the definitive statement: the settings UI renders "Teams" (confirmed in `settings-types.ts` line 38). Update Task 3 to change `settings.spec.ts` assertions from "Products" to "Teams" and from "Product Alpha" to team fixture name.

## Recommended (Non-Blocking) Improvements

5. **F-2 (viewer.css mapping):** Provide per-line token mapping for `viewer/viewer.css` (21 refs) consistent with the detail given for other files.

6. **CL-3 (TDD ordering):** Reorder tasks so Task 4 (write validation tests) comes BEFORE Tasks 1-3, following TDD red-green flow. Write tests that fail against current state, then fix production code (Tasks 1-3), then verify green.

7. **CE-1 (effort estimate):** Acknowledge that 20+ E2E file updates push this closer to L effort than M.
