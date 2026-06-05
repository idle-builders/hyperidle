# Y4 Retro: Knowledge Triage Improvements

**Workpackage:** Y4 — Knowledge Triage Improvements  
**Status:** DONE  
**Date:** 2026-06-05

---

## Summary

Y4 delivered a refined knowledge triage workflow that surfaces items by attention score, includes `needs_human` status in the triage queue, shows a sidebar count badge, and enables rapid processing via keyboard shortcuts and inline actions. The feature shipped with 2 review cycles (1 NOT DONE, 1 DONE), and zero migrations required.

---

## Pipeline Flow

**Phases:** 6  
**Review rounds:** 2 (initial NOT DONE with 4 findings; re-review DONE)  
**Blockers:** 0

### Phase sequence:
1. **Concept** — No new primitives, refinement of existing triage tab.
2. **Design** — Routine variant (inline triage refinement), 8/10 score.
3. **Architecture** — 510-line plan, 7/10 score. Key finding: `useFetch` lacks refetch mechanism.
4. **Write tests (Red)** — 3 test files, 48 tests. All failing until implementation.
5. **Write code (Green)** — Implementation across 5 source files.
6. **Code review R1** — NOT DONE. 3 CRITICAL (auth, version/user, error handling), 1 SHOULD FIX (keyboard shortcuts).
7. **Code review R2** — DONE. All 4 findings fixed, no regressions.

---

## What Worked Well

1. **Test-first caught real bugs early.** The failing tests established a clear contract before implementation. When code review found 4 critical defects, the test framework was already in place to verify fixes.

2. **Architecture plan was detailed enough to support two review cycles.** Despite the `useFetch` limitation flagged as CRITICAL in architecture critique, the builder understood the spec well enough to implement a reasonable workaround (optimistic removal + manual state).

3. **Single-fetch pattern avoided endpoint sprawl.** Returning `attentionScore` on the existing GET `/api/knowledge` endpoint rather than adding a separate triage-only fetch kept the API simple.

---

## What Didn't Work Well

1. **Critical security/data-integrity bugs made it past initial tests.** `handleTriageAction` used raw `fetch()` instead of `apiFetch()`, meaning every PATCH would fail with 401 in production. Tests passed because they mocked `fetch` globally. The tests should have mocked the wrapper function.

2. **Hard-coded version/user values slipped through.** `version: 1` and `updatedBy: "founder"` should have been obvious red flags. The architecture plan explicitly said `version: item.version`, yet the first implementation hard-coded it.

3. **Keyboard shortcut spec was partially implemented.** The architecture plan listed 6+ shortcuts; the first implementation included only 5. The builder stopped before finishing the handler.

---

## Cost Signals

| Phase | Estimated tokens |
|-------|-----------------|
| Designer (concept + design + architecture) | ~12K |
| Reviewer (design-critique + architecture-critique) | ~11K |
| Builder (tests + code + fixes) | ~24K |
| Reviewer (code review R1 + R2) | ~16K |
| **Total** | **~63K** |

---

## Findings for /compound

### Pattern 1: Test-mocking gaps on global functions
Mock of raw `fetch()` hid the fact that `handleTriageAction` never used `apiFetch()`. Tests passed despite broken auth because mocks always succeeded. **Recommendation:** Default to mocking wrapper functions, not globals.

### Pattern 2: Plan details don't always transfer to code
Architecture plan section 4.5 listed 6 keyboard shortcuts; implementation had 5. Section 4.6 said `version: item.version`; implementation hard-coded `version: 1`. **Recommendation:** Consider implementation checklists mapping plan tasks to code.

### Pattern 3: Optimistic state patterns need refetch support
Y4 hit the `useFetch` refetch limitation. This keeps recurring. **Recommendation:** Evaluate adding refetch support to `useFetch` hook.

---

## Metrics

| Metric | Value |
|--------|-------|
| Complexity | Small (S) |
| Review cycles | 2 (NOT DONE → DONE) |
| Critical findings | 4 (all fixed) |
| New endpoints | 1 (GET /triage-count) |
| Keyboard shortcuts | 6 (j/k/v/x/Enter-o/Escape) |
| Days in pipeline | 1 |
