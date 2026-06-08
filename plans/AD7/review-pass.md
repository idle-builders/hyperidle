# AD7 — Search Backend: Phase 4 Re-Review

**Reviewer:** Reviewer persona, Phase 4 re-review
**Date:** 2026-06-09
**Verdict:** DONE

---

## Previous Findings — All Fixed

| Finding | Severity | Status | Verification |
|---|---|---|---|
| B-1: appetite null drops work results | Blocking | FIXED | `appetite: row.appetite ?? "—"` (search.ts line 265) |
| B-2: layer/kind null drops knowledge results | Blocking | FIXED | `layer: row.layer ?? "L0"`, `kind: row.kind ?? "pattern"` (search.ts lines 305, 309) |
| B-3: N+1 query loop (3 queries per thread) | Blocking | FIXED | Batch approach: 3 total queries via `inArray` (search.ts lines 181-212) |
| H-1: Missing ORDER BY on all queries | High | FIXED | `orderBy(desc(...))` on threads (line 185), bets (line 257), knowledge (line 301) |
| H-2: Bet search only description | High | FIXED | OR clause on description, hypothesis, doneCondition (search.ts lines 251-255) |
| M-1: Unsafe `as BetStatus` cast | Medium | FIXED | Raw string passed through; frontend validates (search.ts line 263) |
| M-2: Unused columns selected | Medium | FIXED | costAppetiteMinor/costAppetiteCurrency removed from select |
| M-3: Incorrect lore (claims sub-selects, uses loop) | Medium | FIXED | Lore updated to describe batch approach (search.ts lines 13-16, 166-168) |

## New Issues Introduced — None

No regressions or new issues introduced by the fixes. The batch query approach is correct, ILIKE is used consistently across all search predicates, and the response shape matches the frontend contract.

## Lens Scores (Re-Review)

| Lens | Score | Notes |
|---|---|---|
| Architecture | 9/10 | All plan contracts met. Three batch queries, correct ORDER BY, correct response shape. Minor: `topic` field not searched per plan section 5.3 (L-3, carried forward, not a regression). |
| Design | N/A | No UI surface. |
| Security | 9/10 | Auth boundaries correct (participant JS-verify, user-scope knowledge filter). LIKE escaping via `escapeLikePattern`. Query capped at 200 chars. ILIKE with ESCAPE clause. |
| Adversarial | 8/10 | No unsafe casts. No silent data loss paths. Batch queries eliminate N+1. Minor: conversation snippet could be empty string for edge-case payloads (pre-existing, not introduced by fixes). |
| Simplification | 9/10 | Clean batch approach. No dead code. No unused imports or columns. Helper functions are focused. |
| Slop | 9/10 | Lore comments are accurate and useful. No AI aesthetic tells. No verbose naming. No unnecessary defensive code. |

## AC Completeness

| AC | Met? | Evidence |
|---|---|---|
| AC-1: Grouped results from conversations, bets, knowledge | YES | Response shape `{ conversations, work, knowledge }`. Null fallbacks prevent silent dropping. |
| AC-2: Correct IDs for navigation | YES | Thread, bet, knowledge item IDs returned. Tests TC-4, TC-6, TC-7 verify. |
| AC-3: Within 300ms | YES | Three batch queries at current volumes ~5-10ms. 150ms debounce dominates. |
| AC-4: Empty queries return no results | YES | Zod rejects empty/whitespace with 400. Tests TC-1, TC-2 verify. |
| AC-5: "Search coming soon" no longer appears | YES | Route returns 200 for valid queries. No 404 trigger for the empty state. |
