# Y4 Code Review: Knowledge Triage Improvements

**Verdict: NOT DONE**

Three critical findings must be fixed before this ships.

---

## AC Completeness Audit

| AC | Status | Evidence |
|----|--------|----------|
| AC1: Triage workflow surfaces items ordered by attention score (highest first) | PASS | `triageItems` memo at KnowledgeList.tsx:785-798 sorts by `attentionScore` descending, nulls last. Server returns `attentionScore` parsed from text at knowledge.ts:267. Test `knowledge.y4-triage.test.ts` lines 127-189 (server) and `KnowledgeList.y4-triage.test.tsx` lines 217-323 (client). 10-item sort test at line 288 confirms. |
| AC2: Items flagged as `needs_human` are included in triage alongside `draft` items | PASS | Filter at KnowledgeList.tsx:787 includes both `draft` and `needs_human`. Auto-tab logic at line 815 checks `needs_human`. `KERNEL_KNOWLEDGE_STATUSES` at types.ts:58 includes `needs_human`. Tests at lines 80-211 confirm both statuses render and auto-tab. |
| AC3: A human can see at a glance how many items need attention (sidebar count badge) | PASS | GET `/triage-count` endpoint at knowledge.ts:280-292 returns count. AppShell.tsx:325 fetches it and passes to Sidebar. Badge renders at Sidebar.tsx:292-299 with data-testid. Tests at `Sidebar.y4-triage-badge.test.tsx` (7 cases including 99+ overflow). Server test at line 271 verifies auth required (401 without key). |
| AC4: A reviewer can process items rapidly -- validating, rejecting, or deferring without friction | FAIL | Three critical defects in `handleTriageAction` (lines 820-827): (1) uses raw `fetch()` instead of `apiFetch()` so no API key is sent -- every PATCH returns 401 in production; (2) hard-codes `version: 1` instead of using `item.version` -- will 409 on any item whose version is not 1; (3) hard-codes `updatedBy: "founder"` instead of using the current user's ID. Additionally, `Enter`/`o`/`ArrowDown`/`ArrowUp` keyboard shortcuts specified in the architecture plan section 4.5 are not implemented -- only `j`/`k`/`v`/`x`/`Escape` are wired. No error handling on the PATCH call (fire-and-forget with `void`, no `.catch()`, no toast on failure). |

| Validation Scenario | Status | Evidence |
|---------------------|--------|----------|
| VS1: 10 items with varying attention scores, highest-attention first | PASS | Test at KnowledgeList.y4-triage.test.tsx:288-323 exercises exactly this scenario. |
| VS2: 3 items pending triage, sidebar shows count | PASS | Server test at knowledge.y4-triage.test.ts:234-247 seeds 3 draft + 2 needs_human = 5. Sidebar badge test at Sidebar.y4-triage-badge.test.tsx:43-49 renders count 3. |
| VS3: Reviewer validates item, next item immediately visible | PASS (with caveats) | Optimistic removal works -- test at KnowledgeList.y4-triage.test.tsx:591-677 proves item disappears and second item gets focus. However, the PATCH that persists the change will silently fail (see AC4 FAIL). |

---

## Lens 1: Architecture

### CRITICAL

**F-01. `handleTriageAction` uses raw `fetch()` instead of `apiFetch()`.** [KnowledgeList.tsx:822, plan section 4.6]

The file imports `useFetch` (which internally uses `apiFetch`) but `handleTriageAction` calls raw `fetch()`. The `apiFetch` wrapper at `packages/web/src/services/api-fetch.ts` injects the `X-API-Key` header on `/api/*` requests. Without it, every triage PATCH will return 401 in production. The optimistic removal hides the failure from the user -- the item disappears from the UI but the status change never persists to the server.

**F-02. `handleTriageAction` hard-codes `version: 1` and `updatedBy: "founder"`.** [KnowledgeList.tsx:825, plan section 4.6]

The architecture plan section 4.6 specifies `version: item.version`. Hard-coding `version: 1` means any item at version 2+ will hit a 409 Conflict from the server's optimistic locking check (knowledge.ts:533-539). Hard-coding `updatedBy: "founder"` writes incorrect audit trail data. The function should look up the item from `allItems` to get its version, and the component needs access to the current user's ID (via `useCurrentUser` or similar).

### WARNING

**F-03. `Enter`/`o`/`ArrowDown`/`ArrowUp` keyboard shortcuts missing from handler.** [KnowledgeList.tsx:472-517, plan section 4.5]

The architecture plan section 4.5 specifies six keyboard shortcuts: `j`/`ArrowDown` (down), `k`/`ArrowUp` (up), `v` (validate), `x` (reject), `Enter`/`o` (open), `Escape` (clear). The implementation only handles `j`, `k`, `v`, `x`, and `Escape`. `ArrowDown`, `ArrowUp`, `Enter`, and `o` are missing. The keyboard hint bar at line 649 also omits the `Enter open` hint that the plan specifies at section 4.7. No tests cover the missing shortcuts.

**F-04. No error handling on triage PATCH call.** [KnowledgeList.tsx:822, plan section 4.6]

The architecture plan section 4.6 specifies: "If the PATCH fails (e.g., version conflict), a toast surfaces the error and the item reappears on next fetch." The implementation fires the PATCH with `void fetch(...)` and never handles errors. Combined with F-01 (wrong `fetch` function), every triage action silently fails. Even with `apiFetch` fixed, version conflicts and network errors will be swallowed. At minimum: `.catch()` should remove the item from `optimisticRemovals` and show a toast.

---

## Lens 2: Design

### OBSERVATION

**F-05. Attention score pill not rendered on triage rows.** [Design spec section 2.5, plan section 4.4]

The approved design at section 2.5 specifies an attention score pill (percentage display, color-coded by threshold) on each triage row. The architecture plan section 4.4 specifies `attentionScore` as a prop on `KnowledgeListRow`. The implementation adds `attentionScore` to the `ApiKnowledgeItem.signals` interface and uses it for sorting, but does NOT render the pill on triage rows. The `KnowledgeListRowProps` interface does not include an `attentionScore` prop. The design critique at section 1 evaluated the pill's visual hierarchy -- it is part of the approved design.

This is a non-blocking observation rather than a critical finding because AC1 only requires *ordering* by attention score, not *displaying* it. However, the approved design spec explicitly includes the pill. If the builder intentionally omitted it, the design spec should document the deviation.

**F-06. No fade-out animation on item removal.** [Design spec section 5, states "After action"]

The approved design specifies: "Item fades out with var(--motion-fast) (120ms) opacity transition." The implementation does instant DOM removal via optimistic state update. The design critique noted this motion spec. Not blocking for AC4, but a design deviation.

**F-07. `prefers-reduced-motion` not honored.** [Design critique finding 4, AQ-014]

The design critique flagged this at finding 4. No `prefers-reduced-motion` media query appears in the implementation. Currently moot since F-06 means there is no animation to reduce, but if the fade-out is added, this must be addressed.

**F-08. `rounded-[4px]` on kbd elements is off-scale.** [Design critique finding 1, AQ-011]

The `<kbd>` elements in the keyboard hint bar (lines 654-672) use `rounded-[4px]`. The Hearth radius scale is `0/10/16/9999`. This matches the existing pattern in Sidebar.tsx line 330 (same `rounded-[4px]`), so it is consistent with the codebase even though technically off-scale. Non-blocking.

---

## Lens 3: Security

### WARNING

**F-09. Triage PATCH calls lack API key (covered by F-01).** See F-01. This is the security manifestation: unauthenticated state-mutation requests.

### OBSERVATION

**F-10. `triage-count` endpoint correctly uses auth middleware.** [Plan section 3.2, critique finding 3]

The Phase 2 architecture critique (finding 3) flagged that the triage-count endpoint must use the same auth middleware chain. Verified: the endpoint is registered on the same `router` instance inside `createKnowledgeRoutes`, which is mounted under the auth middleware in the server setup. Test at knowledge.y4-triage.test.ts:271-275 confirms 401 without API key.

**F-11. `triage-count` endpoint correctly filters by user scope.** [Plan section 3.2]

The endpoint at knowledge.ts:286-289 mirrors the GET `/` user-scope guard (`ne(scopeKind, "user") OR eq(updatedBy, userId)`). Test at knowledge.y4-triage.test.ts:277-302 verifies user-scoped items from other users are excluded.

---

## Lens 4: Adversarial

### CRITICAL (The Saboteur)

**F-12. Every triage action silently fails in production.** F-01 + F-02 + F-04 compound into a scenario where the user processes their entire triage queue, sees all items disappear (optimistic removal), believes the work is done, navigates away -- and on next page load, all items reappear because no PATCH succeeded. This is a data-loss-grade UX failure. The tests pass because they mock `fetch` directly (`vi.stubGlobal("fetch", mockFetch)`) and the mock always returns `{ ok: true }`, so the broken auth and version logic are never exercised.

### WARNING (The New Hire)

**F-13. `optimisticRemovals` Set grows unboundedly.** [KnowledgeList.tsx:764, 821]

The `optimisticRemovals` Set accumulates item IDs but is never cleared. Since `useFetch` fetches once on mount and never refetches, the Set grows until the component unmounts. At practical triage volumes this is harmless, but the pattern is misleading -- the Set suggests it will be reconciled on refetch, but no refetch mechanism exists.

### OBSERVATION (The Auditor)

**F-14. `useFetch` refetch limitation acknowledged but not resolved.** [Architecture critique CRITICAL finding 1]

The Phase 2 architecture critique flagged `useFetch` having no refetch mechanism as CRITICAL. The builder chose the optimistic-removal pattern as a workaround, which is reasonable for AC4 (rapid processing). However, the triage count badge in the sidebar (AC3) remains stale after processing items -- `useFetch("/api/knowledge/triage-count")` in AppShell.tsx:325 fetches once and never updates. The user processes 5 items, but the badge still shows "5" until a full page reload. This does not fail AC3 (the badge *shows* the count), but degrades the "at a glance" promise.

---

## Lens 5: Simplification

### OBSERVATION

**F-15. `KnowledgeListRow` has two fully separate render paths sharing a name.** [KnowledgeList.tsx:203-409]

When `showActions` is true, the component renders a completely different DOM tree (an `<li>` with action buttons). When false, it renders a `<button>`. These are functionally two different components sharing one name and one props interface. The `showActions` branch adds ~130 lines. Consider splitting into `TriageRow` and `CuratedRow` for clarity. Non-blocking.

**F-16. `optimisticRemovals` Set construction allocates on every action.** [KnowledgeList.tsx:821]

`new Set([...prev, itemId])` spreads the previous Set into an array, adds the new item, then creates a new Set. For typical triage volumes this is negligible, but the idiomatic React pattern is:

```ts
setOptimisticRemovals(prev => { const next = new Set(prev); next.add(itemId); return next; });
```

Non-blocking.

---

## Lens 6: AI Slop

### OBSERVATION

**F-17. Comment at KnowledgeList.tsx:19 is stale/misleading.** The `@lore N5` comment says `Tab-default logic uses API status ("draft" = needs review, was "needs_human")`. This implies `needs_human` was removed, but Y4 re-adds it. The comment now contradicts the code. Should be updated.

**F-18. Test file header comments say "All tests in this file should FAIL until implementation is complete."** [All three test files, line ~12] These were accurate during the red phase but are now misleading post-implementation. Standard TDD artifact -- non-blocking.

No other slop patterns detected. The code is direct, naming is honest, no unnecessary abstractions, no verbose naming, no filler patterns.

---

## Phase 2 Critique Findings: Resolution Status

| Phase 2 Finding | Resolved? | Notes |
|-----------------|-----------|-------|
| CRITICAL: `useFetch` has no refetch mechanism | Partially | Builder chose optimistic removal (works for AC4) but sidebar badge staleness persists |
| WARNING: Auto-tab logic must check `needs_human` | Yes | Line 815: `i.status === "draft" \|\| i.status === "needs_human"` |
| WARNING: triage-count endpoint must use auth middleware | Yes | Registered on same router; test proves 401 without key |
| WARNING: Keyboard handler must guard against input/textarea focus | Yes | Lines 477-481 check `tag === "input" \|\| tag === "textarea" \|\| target.isContentEditable` |

---

## Summary of Findings Requiring Action

### Must fix (blocks DONE):

1. **F-01** (CRITICAL): Replace `fetch()` with `apiFetch()` in `handleTriageAction`, or import and use `apiFetch` directly. Without this, triage actions silently fail.
2. **F-02** (CRITICAL): Use `item.version` from `allItems` lookup and current user ID instead of hard-coded `version: 1` and `updatedBy: "founder"`.
3. **F-04** (WARNING, elevated to CRITICAL due to F-01/F-02 compounding): Add `.catch()` error handling that removes the item from `optimisticRemovals` on failure.

### Should fix:

4. **F-03**: Add `Enter`/`o`/`ArrowDown`/`ArrowUp` to the keyboard handler per the architecture plan section 4.5. Add `Enter open` to the keyboard hint bar. These are documented in the plan and the approved design.

### Non-blocking suggestions:

5. **F-05**: Consider adding the attention score pill per the approved design spec section 2.5.
6. **F-13**: Clear `optimisticRemovals` when appropriate (component unmount or if a refetch mechanism is added later).
7. **F-17**: Update or remove the stale `@lore N5` comment about `needs_human`.
