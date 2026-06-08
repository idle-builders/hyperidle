# AD6 Re-Review — Round 2

**Workpackage:** AD6 — Knowledge Cleanup & Scope Simplification
**Branch:** `feat/AD6-knowledge-scope-simplification`
**Commits reviewed:** `122f9336` (fix findings), `fca8fc9d` (fix W3 tests)
**Date:** 2026-06-08

---

## Verdict: DONE

All 3 blockers and 3 major issues from round 1 are resolved. No new issues introduced.

---

## Finding-by-Finding Verification

### B1 (U9 tests) — RESOLVED

`U9-knowledge-scope-pills.test.tsx` updated: mock data uses new scopeKind values (`factory`, `user`, `team`), test IDs changed from `scope-pill-practice/product/factory` to `scope-pill-shared/team/private`, header comment updated to document the static-pill model.

### B2 (KnowledgeCreateDialog) — RESOLVED

`KnowledgeCreateDialog.tsx` fully rewritten: 7-item `<select>` replaced with 3-pill `role="radiogroup"` using `SCOPE_CREATE_OPTIONS`. Scope ID text input removed. `hasTeam: boolean = false` with `@lore` comment. `useEffect` deps correctly simplified to `[open]` only. Same pill pattern as `KnowledgeCreate.tsx`.

### B3 (Tag(kind)/Tag(layer) in metadata bar) — RESOLVED

`KnowledgeDetail.tsx` line 655: `Tag` import removed, both `<Tag label={item.kind} />` and `<Tag label={item.layer} />` removed from the metadata bar. Three test files updated:

- `KnowledgeDetail.test.tsx`: asserts `belief` appears in aside only (not bar).
- `KnowledgeDetail.metadata.test.tsx`: asserts `principle`, `L1`, and `decision` are NOT in the bar.
- `KnowledgeDetail.L23.test.tsx`: asserts `belief` in aside, `company` not in document.

### M1 (Scope row in aside) — RESOLVED

`KnowledgeDetail.tsx` line 858-867: Scope row added between Kind and Status in the metadata aside card. Uses `scopeKindToLabel(item.scopeKind ?? "factory")`. Has `data-testid="knowledge-scope-row"`.

### M2 (Accessibility) — RESOLVED

All three pill locations now use `role="radiogroup"` on the container and `role="radio"` + `aria-checked={isActive}` on each button:

- `KnowledgeList.tsx` line 543-558: `<div role="radiogroup">`, pills have `role="radio"` + `aria-checked`.
- `KnowledgeCreate.tsx` line 209-211: `<div role="radiogroup">`, pills have `role="radio"` + `aria-checked` + `aria-disabled`.
- `KnowledgeCreateDialog.tsx` line 188-200: same pattern.

Biome suppression comments are present and justified (button+role="radio" for pill styling).

### M3 (Unsafe cast) — RESOLVED

`KnowledgeCreate.tsx` line 59: `const hasTeam: boolean = false` with `@lore` comment explaining the rationale. Same pattern in `KnowledgeCreateDialog.tsx` line 63.

### W3 tests — RESOLVED

`W3-knowledge.test.tsx`:

- AC-33 scope pills test: uses `getByTestId` instead of `getByRole("button")` (correct since pills are now `role="radio"`). Asserts static pills (Shared, Team, Private).
- AC-39 overflow menu test: asserts `Flag` is NOT in document, `Archive` and `Change scope` are.

---

## Incidental Changes

- `package-lock.json`: desktop package version bump (0.2.0 to 0.4.0) — rebase artifact from main, not AD6-related.

---

## AC Completeness (Final)

| AC | Status | Evidence |
|---|---|---|
| AC-1: Scope picker offers 3 choices | PASS | KnowledgeCreate + KnowledgeCreateDialog both have 3-pill segmented control (Shared/Team/Private). |
| AC-2: No dead buttons | PASS | Archive wired to POST. Flag removed. Change scope opens dialog. |
| AC-3: Archive works end-to-end | PASS | POST endpoint + success navigation + error handling. Tests pass. |
| AC-4: Scope vs topic clear | PASS | Static pills filter by visibility scope. Topics remain as grouping. |
| AC-5: Kind removed from user surfaces | PASS | Kind/layer tags removed from detail header bar. Kind badge not rendered in list rows. Kind still in aside (internal metadata, not user-facing chrome). |

---

## Minors from Round 1

MINOR-1 (dead `kindBadgeStyle`), MINOR-2 (missing `encodeURIComponent`), MINOR-3 (redundant onClick guard) — not addressed in the fix commits. These are non-blocking and can be cleaned up in a future pass.
