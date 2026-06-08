# AD7 — Search Backend: Phase 4 Code Review

**Reviewer:** Reviewer persona, Phase 4
**Date:** 2026-06-08
**Verdict:** NOT DONE — 2 blocking contract violations, 1 high-severity N+1 query pattern

---

## Lens Scores

| Lens | Score | Summary |
|---|---|---|
| Architecture | 6/10 | Two API contract mismatches silently drop results on the frontend. N+1 query loop contradicts plan's "sub-selects to avoid N+1" claim. Missing ORDER BY on all three queries. |
| Design | N/A | No UI surface in AD7. |
| Security | 9/10 | Auth boundaries correct. LIKE escaping applied. Query length capped. Participant verification is two-phase (SQL probe + JS exact match). |
| Adversarial | 5/10 | Two contract mismatches cause silent data loss — the frontend silently drops results with null appetite/layer/kind. N+1 loop issues 3 queries per thread (up to 15 extra queries). |
| Simplification | 7/10 | The N+1 loop could be replaced with batched queries. `costAppetiteMinor`/`costAppetiteCurrency` are selected but never used. `extractPayloadText` takes no `maxLen` parameter (truncation is separate), diverging from the plan's signature. |
| Slop | 7/10 | One unsafe `as BetStatus` cast. Lore comments are good. File header comments are accurate and useful. |

---

## Blocking Findings

### B-1: Work results silently dropped — appetite is null, frontend requires non-empty string

**File:** `packages/server/src/routes/search.ts` line 239
**Contract:** Architecture plan section 6.2 specifies `appetite: row.costAppetiteMinor != null && row.costAppetiteCurrency != null ? "..." : "—"`.
**Implementation:** Returns `appetite: row.appetite ?? null`.
**Impact:** The frontend's `parseWork` (useGlobalSearch.ts line 136) calls `readStringFields(value, ["id", "title", "status", "appetite"])` which returns `null` when any field is not a non-empty string. When `appetite` is `null` (which it will be for any bet without a duration-string appetite set), the entire work result is silently dropped. Users searching for bets will see zero results even when matches exist.

**Fix:** Replace `appetite: row.appetite ?? null` with `appetite: row.appetite ?? "—"` per the architecture plan. Alternatively, format from `costAppetiteMinor`/`costAppetiteCurrency` as the plan specifies, or simply use a non-empty fallback string.

### B-2: Knowledge results silently dropped — layer/kind are null, frontend validates against known sets

**File:** `packages/server/src/routes/search.ts` lines 278-279
**Contract:** Architecture plan section 6.3 specifies `layer: row.layer ?? "L0"` and `kind: row.kind ?? "pattern"`.
**Implementation:** Returns `layer: row.layer ?? null` and `kind: row.kind ?? null`.
**Impact:** The frontend's `parseKnowledge` (useGlobalSearch.ts line 154-165) calls `readStringFields` requiring all fields to be non-empty strings, then validates `layer` against `KNOWLEDGE_LAYER_SET` and `kind` against `KNOWLEDGE_KIND_SET`. When `layer` or `kind` is `null` (any knowledge item without a fabric row), the result is silently dropped. Knowledge items created before the fabric extension or without explicit layer/kind will never appear in search.

**Fix:** Replace `layer: row.layer ?? null` with `layer: row.layer ?? "L0"` and `kind: row.kind ?? null` with `kind: row.kind ?? "pattern"` per the architecture plan.

### B-3: N+1 query pattern in conversation results — 3 queries per verified thread

**File:** `packages/server/src/routes/search.ts` lines 173-209
**Contract:** Architecture plan section 5.1 shows correlated sub-selects in a single query. File header (line 15) claims "Both retrieved via sub-selects to avoid N+1 queries."
**Implementation:** A `for` loop issues 3 separate `await db.select()` calls per thread (first message, latest message, thread row) — up to 15 extra DB round-trips for 5 threads. The lore comment on line 15 is factually incorrect; the code does the opposite of what it claims.

**Fix:** Either:
(a) Use correlated sub-selects as the plan specifies (single query per matched thread with first/latest message payloads), or
(b) Batch: collect all verified thread IDs, then run 3 queries total (all first messages, all latest messages, all thread rows) and join in application code.

At current volumes this is not a latency concern, but it violates the architectural contract and the lore comment is misleading.

---

## High-Severity Findings

### H-1: Missing ORDER BY on all three category queries

**Contract:** Architecture plan sections 5.1/5.2/5.3 specify `ORDER BY t.last_active_at DESC`, `ORDER BY b.created_at DESC`, `ORDER BY ki.updated_at DESC`.
**Implementation:** None of the three category queries have an `orderBy` clause. Results are returned in undefined order (depends on table scan / index access path), making the "most recent first" behavior non-deterministic.

**Fix:** Add `.orderBy(desc(threads.lastActiveAt))` (or equivalent) to each category query.

### H-2: Bet query searches only description — plan specifies description OR hypothesis OR done_condition

**Contract:** Architecture plan section 5.2 SQL shows `WHERE b.description LIKE ... OR b.hypothesis LIKE ... OR b.done_condition LIKE ...`.
**Implementation:** Only `WHERE bets.description ILIKE ...`. Bets with search terms in hypothesis or done_condition will not be found.

**Fix:** Add OR clauses for `bets.hypothesis` and `bets.doneCondition` ILIKE matching.

---

## Medium-Severity Findings

### M-1: Unsafe `as BetStatus` cast

**File:** `packages/server/src/routes/search.ts` line 238
**Rule:** TypeScript rules: "No `any`, no `@ts-ignore`, no unsafe `as` casts."
**Issue:** `status: row.status as BetStatus` trusts the DB value without validation. If a bet has a status value not in the `BetStatus` union, it passes through unchecked.
**Fix:** Validate against `BET_STATUSES` set before casting (same pattern as the frontend's `isBetStatus` guard).

### M-2: `costAppetiteMinor` and `costAppetiteCurrency` selected but never used

**File:** `packages/server/src/routes/search.ts` lines 226-227
**Issue:** These columns are included in the `select()` but never referenced in the mapping (line 234-240). The architecture plan's section 6.2 says to format appetite from these fields, but the implementation uses `row.appetite` instead.
**Impact:** Wasted bandwidth selecting unused columns. Either use them (per the plan) or remove them from the select.

### M-3: Lore comment on line 15 is incorrect

**File:** `packages/server/src/routes/search.ts` line 15
**Issue:** Claims "Both retrieved via sub-selects to avoid N+1 queries" but the implementation uses a loop with 3 queries per thread. This will confuse future agents reading the file.

---

## Low-Severity Findings

### L-1: `extractPayloadText` signature diverges from plan

**Contract:** Architecture plan section 6.1 defines `extractPayloadText(payloadJson: string | null, maxLen: number): string`.
**Implementation:** Takes `(payloadJson: string): string` — no `null` parameter, no `maxLen` parameter. Truncation happens separately at the call site. This is fine functionally but means the helper is less reusable than planned.

### L-2: `hostKindToConversationKind` uses switch instead of lookup map

**Contract:** Architecture plan defines `HOST_KIND_TO_SEARCH_KIND` as a `Record<string, "review" | "chat">` lookup map.
**Implementation:** Uses a switch statement with 4 explicit cases and a default. Functionally equivalent and arguably more readable, but inconsistent with the plan's naming (`HOST_KIND_TO_SEARCH_KIND` is referenced in comments but the function is named `hostKindToConversationKind`).

### L-3: Knowledge search does not include `topic` field

**Contract:** Architecture plan section 5.3 SQL shows `ki.topic LIKE '%<pattern>%' ESCAPE '\\'`.
**Implementation:** Only searches `title` and `body`, not `topic`. Minor coverage gap.

---

## AC Completeness Audit

| AC | Implemented? | Tested? | Evidence |
|---|---|---|---|
| AC-1: Grouped results from conversations, bets, knowledge | PARTIAL | YES (TC-4, TC-6, TC-7, TC-9) | Response shape `{ conversations, work, knowledge }` is correct. However, B-1 and B-2 cause silent result dropping when appetite/layer/kind are null. |
| AC-2: Correct IDs for navigation | YES | YES (TC-4, TC-6, TC-7) | Thread IDs, bet IDs, knowledge item IDs returned correctly. Frontend routes on these. |
| AC-3: Within 300ms | LIKELY YES | NO (no performance test) | Architecture plan analysis shows ~5-10ms server-side. N+1 loop adds overhead but stays under budget at current volumes. No explicit performance assertion in tests — acceptable since it's a non-functional characteristic. |
| AC-4: Empty queries return no results | YES | YES (TC-1, TC-2) | Zod validation rejects empty/whitespace queries with 400. Frontend does not fire for empty query. |
| AC-5: "Search coming soon" no longer appears | YES | IMPLICIT | Route exists and returns 200 for valid queries. The "coming soon" message was triggered by 404, which no longer occurs. No explicit test for this — it's an integration-level frontend behavior. |

---

## Summary

Two blocking contract violations (B-1, B-2) cause the frontend to silently drop search results when nullable fields (`appetite`, `layer`, `kind`) are returned as `null` instead of the fallback strings specified in the architecture plan. These must be fixed before the work can be considered done — they break AC-1 for any bet without an appetite or any knowledge item without a fabric row.

The N+1 query pattern (B-3) is a contract violation (the lore comment claims the opposite) but not a user-visible bug at current volumes. The missing ORDER BY clauses (H-1) make result ordering non-deterministic.

Auth boundaries are correctly implemented. LIKE escaping is applied. Input validation is solid. Test coverage is comprehensive for functional behavior.
