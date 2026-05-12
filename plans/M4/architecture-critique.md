# Architecture Critique: M4

ARCHITECTURE-SCORE: 8/10  rounds=1  score-line: SA:9 LI:10 AC:N/A DM:N/A N:9 MD:9 FMC:7 S:8 V:7

---

## Dimension Scores

### 1. Spec Alignment (9/10)

Every AC maps to at least one task:

| AC | Plan task(s) |
|---|---|
| AC-1 (zero forbidden rows / tracked-out) | Tasks 1, 2, 4, 8 |
| AC-2 (lint promotion to error) | Task 3 |
| AC-3 (regression e2e suite) | Task 5 |
| AC-4 (test-coverage gap analysis) | Task 7 |
| AC-5 (rg command, zero hits, policy doc) | Task 6 |
| AC-6 (verify + Playwright green) | Task 9 |

No scope creep -- every task traces to an AC. The plan's Task 4 (follow-ups.md) is forced by AC-1's "with a written follow-up entry" clause.

Deduction: The plan's internal deliberation about the AC-1 semantics (lines 78-97) is valuable but the "Correction" / "Wait" / "Revised plan" stream-of-consciousness structure is confusing. The conclusion is correct but the path to it reads like debugging output, not a plan. Minor issue only.

### 2. Layer Integrity (10/10)

No cross-layer violations. All edits are within the package they belong to. Server edits stay in `packages/server/`. Web edits stay in `packages/web/`. The lint config is at the monorepo root where it belongs. Plan artifacts stay in `plans/`. No layer reaches past its neighbor.

### 3. API Contracts (N/A)

M4 introduces no new API endpoints, routes, or schemas. The e2e tests mock existing endpoints. Correct decision not to invent new APIs.

### 4. Data Model Alignment (N/A)

M4 introduces no schema changes or migrations. The plan correctly identifies that the proper fix for the server fallbacks is a DB migration outside Track M scope. No schema concerns.

### 5. Naming (9/10)

Names are honest: "tracked-out" rows, "follow-ups.md", "test-coverage-gap.md" all describe what they contain. The tracking issue ids (#92, #93) are consistent with the existing convention at AppShell.tsx line 17. Group labels (A/B/C) map clearly to the resolution strategy for each.

### 6. Module Depth (9/10)

No new abstractions or modules introduced. The plan avoids the temptation to modify the inventory scanner (adding comment-awareness or a status field). The decision to rewrite 6 comments instead of adding scanner complexity is the right call -- the plan explicitly defends this with a cost comparison (10 minutes vs 2 hours + edge cases).

### 7. Failure-Mode Coverage (7/10)

See CRITICAL and WARNING findings below. The plan has gaps in its handling of the AC-5 "ZERO hits" requirement and missing verification details for the e2e tests.

### 8. Simplicity / Over-Engineering Risk (8/10)

The plan resists several over-engineering temptations: no scanner rewrite, no new schema fields, no tracking-aware inventory mode (options a/b rejected in favor of prose tracking). The "tracked-out.json" idea is explored and correctly rejected. The self-critique section is honest and identifies real risks.

One minor concern: Task 2 includes adding eslint-disable to `knowledge-data.ts` declarations (lines 81, 288 in the file manifest), but the plan body (Task 2 analysis section, lines 119-143) never explicitly discusses this file. The file manifest adds it but the task narrative does not justify it. This is not over-engineering -- it is under-specifying.

### 9. Verifiability (7/10)

See WARNING findings below. The e2e test code is detailed but has verification gaps, and the plan lacks a protected-tests list.

---

## CRITICAL

None.

## WARNING

**W1. [plan, Task 6 / AC-5] The `rg` command will NOT return zero hits.**

The AC says: "A `git grep` (or `rg`) for the forbidden-prefix set + the literal-id allowlist across `packages/web/src/` and `packages/server/src/` (excluding the permitted-mock surface) returns ZERO hits."

The plan's `rg` command for forbidden-prefix symbols (line 345-356) will match:

- `MOCK_KNOWLEDGE_ITEMS` declaration at `knowledge-data.ts:81`
- `MOCK_CURATION_SUGGESTIONS` declaration at `knowledge-data.ts:288`
- `LEGACY_DETAILS`, `LEGACY_SOURCES`, `FALLBACK_DETAIL` in `KnowledgeDetail.tsx`

The `fixtures/` directory is NOT excluded by the glob set (`--glob '!**/__fixtures__/**'` only excludes `__fixtures__` with double underscores). The file at `packages/web/src/fixtures/knowledge-data.ts` lives in `/fixtures/` (no double underscores) and will be scanned.

The plan acknowledges this tension (lines 375-381) and decides "Option B" -- note that tracked-out matches are expected. But this contradicts the AC literal wording of "ZERO hits." The builder will face a conflict between the plan and the AC.

Fix: The `rg` command in the policy doc must add `--glob '!**/fixtures/**'` alongside `--glob '!**/__fixtures__/**'` to exclude both fixture directory variants from the scan. Alternatively, the plan must explicitly document that `packages/web/src/fixtures/` is part of the permitted-mock surface (it is already in `FORBIDDEN_IMPORT_FRAGMENTS` as a source directory for mock data that runtime code should not import from, which implies it IS a fixture directory). The second `rg` command (literal-id strings, line 357-367) will also hit the 3 server fallback `"u-founder"` rows -- the plan already acknowledges this but does not add the glob exclusion. The plan needs to decide: either add the globs to hit true zero, or redefine what "zero hits" means in the policy doc with an explicit cross-reference to follow-ups.md.

**W2. [plan, Task 5c] Settings panel e2e test relies on unverified selectors.**

The test code uses `page.getByLabel("Name")` and `page.getByLabel("Email")` to assert values. This assumes the SettingsPanel profile tab has form inputs with those accessible labels. The plan does not verify this assumption against the actual SettingsPanel component. If the profile tab uses `<KeyValue>` display pairs instead of `<input>` elements, the `getByLabel` selectors will fail.

The existing `settings.spec.ts` does not test input values -- it tests structure (tab count, open/close). The new test makes stronger assumptions about the DOM.

Fix: The builder should be instructed to verify the SettingsPanel profile tab DOM before writing the test. If the profile fields are read-only display elements, the assertion should use `getByText("Alice Builder")` instead of `getByLabel("Name").toHaveValue(...)`.

**W3. [plan, Task 2] Missing eslint-disable specification for `knowledge-data.ts` declarations.**

The file manifest (line 467) lists `knowledge-data.ts` as needing eslint-disable on lines 81 and 288. But Task 2's analysis section (lines 119-143) never discusses `knowledge-data.ts`. The analysis covers KnowledgeDetail.tsx and KnowledgeList.tsx imports in detail but skips the fixture file's own declarations. The builder could miss this because the task narrative is inconsistent with the file manifest.

The issue is real: after lint promotion to error, the `no-mock-data-symbol` rule WILL fire on `MOCK_KNOWLEDGE_ITEMS` (line 81) and `MOCK_CURATION_SUGGESTIONS` (line 288) in `knowledge-data.ts`, because that file is NOT on the permitted surface (it is in `/fixtures/`, not `/__fixtures__/`). Without eslint-disable, `bun run lint` will fail.

Fix: Add explicit discussion of `knowledge-data.ts` eslint-disable requirements in Task 2's narrative, consistent with the file manifest.

**W4. [plan, Task 5a] DOM sweep test will trigger false positives on knowledge pages.**

The test sweeps `/knowledge` for forbidden literals including `agent-unassigned`. The knowledge page fixtures contain `originAgent: "Architect Agent"` and `originAgent: "Developer Agent"`. These do not contain the forbidden strings. However, the knowledge page renders mock data from `MOCK_KNOWLEDGE_ITEMS` -- if any of those fixture items ever contained a forbidden string (they do not currently), the test would catch it. Good.

But the real issue: the DOM sweep navigates to `/knowledge` and checks `document.body.innerText`. The knowledge list renders mock data titles like "Architecture Decision: Auth Strategy" -- these are from the tracked-out fixtures. The test passes because none of the fixture item titles contain the forbidden strings. However, if a future knowledge fixture item were added with `id: "u-founder"` or similar, the test would catch it, which is the point. No fix needed -- just noting the dependency.

## SUGGESTION

**S1. [plan, general] Add a protected-tests list.**

The plan does not enumerate which existing tests must remain green (CC-008). M4 edits comments in auth.ts, bets.ts, host-threads.ts, task-threads.ts, and adds eslint-disable to knowledge pages. These files have existing test suites. The plan should list the test files whose contracts must not drift:

- `packages/server/src/__tests__/auth.test.ts` (if exists)
- `packages/web/src/__tests__/KnowledgeDetail.test.tsx`
- `packages/web/src/__tests__/KnowledgeList.test.tsx`
- `packages/web/e2e/settings.spec.ts`
- `packages/web/e2e/knowledge.spec.ts`
- `packages/web/e2e/knowledge-detail.spec.ts`

The builder should run these before and after changes to verify no regression.

**S2. [plan, Task 5b] The old MOCK_RAIL_COST values are not verified from git history.**

The plan says "The builder should verify these values from git history to assert their absence" (line 275). This is correct but imprecise. The value `$12.47` in the test code (line 271) is stated as the old mock value but not verified. If the old value was actually `$12.40` (which is what `L17-money-web.test.tsx` line 138 suggests: `minor: 1240`), then asserting `$12.47` is absent is vacuously true and the test proves nothing. The builder must check `git log` for the actual deleted `MOCK_RAIL_COST` constant values.

**S3. [plan, Inventory resolution, lines 78-97] Stream-of-consciousness plan structure.**

The "Correction" / "Wait -- re-reading" / "Revised plan" / "Final count" sequence in the inventory resolution section reads like working notes, not a finished plan. The conclusion is correct but the reasoning trail makes the plan harder to parse. A future architect re-reading this plan would have to mentally replay the deliberation to find the final answer. Consider condensing to just the final decision with a brief rationale.

**S4. [plan, Task 5a] The e2e test should also check the `/work/:betId` detail page.**

AC-3a says "no rendered DOM contains the literal strings... on production paths." The plan covers `/`, `/work`, `/work/portfolio`, `/conversations`, `/knowledge`. But `/work/:betId` (bet detail) was one of the primary M3 replacement sites where `"u-founder"` was hardcoded. The test should navigate to at least one bet detail page to verify the ID does not leak there. This may require seeding a bet via the mock API first.

---

## What's Working Well

1. **Principled refusal to over-engineer the scanner.** The deliberation about comment-awareness vs. comment rewriting is thorough and reaches the right conclusion. Rewriting 6 comments in 10 minutes is vastly preferable to adding scanner complexity with its own test surface. This is good engineering judgment.

2. **Thorough inventory analysis with verified line numbers.** Every row in the 16-row inventory is classified, with file paths and line numbers that I verified against the actual codebase. The grouping into A/B/C is clean and the resolution strategy for each group is appropriate. The plan correctly identifies that the ESLint rules do not catch literal-id strings (only the inventory scanner does), which prevents the builder from adding unnecessary eslint-disable comments on the server fallback lines.
