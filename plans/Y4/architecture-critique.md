# Y4 Architecture Critique: Knowledge Triage Improvements

ARCHITECTURE-SCORE: 7/10  rounds=1  score-line: SA:7 LI:9 AC:7 DM:8 N:9 MD:9 FMC:6 S:8 V:6

---

## Scoring Breakdown

### 1. Spec Alignment (7/10)

All four ACs map to plan tasks:
- AC1 (attention score ordering) -> T1c, T3b, T3c.
- AC2 (`needs_human` inclusion) -> T1a, T1b, T3a.
- AC3 (sidebar badge) -> T1d, T2a-T2d.
- AC4 (rapid processing) -> T4a-T4f.

Validation scenarios are addressed: 10 items sorted by attention (T3c), sidebar count (T2b-T2c), auto-advance after validate (T4d).

Gap: The plan does not address updating the auto-tab default logic at KnowledgeList.tsx line 587. Currently the code reads `const hasDraft = allItems.some((i) => i.status === "draft")` to decide whether to default to the triage tab. After Y4, this must also check for `needs_human` status, otherwise items flagged as `needs_human` with zero `draft` items would default to the curated tab, hiding them from the reviewer. This is required by AC2 ("items flagged as `needs_human` ... are included in triage").

### 2. Layer Integrity (9/10)

Clean layer separation. The knowledge route (kernel layer) already does a LEFT JOIN to `knowledgeStrategyFabric` (strategy extension) -- adding `attentionScore` to that existing JOIN is a pragmatic boundary compromise already established by the O2 lore. The frontend fetches via API, never touches DB directly. The triage-count endpoint stays in the same route file. No cross-layer violations.

### 3. API Contracts (7/10)

GET `/triage-count` endpoint is well-specified: `{ count: number }` response shape, SQL query shown, route registration order documented.

GET `/` response shape change (adding `attentionScore` to signals) is documented with the exact TypeScript interface.

PATCH `/:id` status validation update is documented.

Gaps:
- The GET `/triage-count` endpoint does not document error response shapes or status codes. What happens on DB error? The existing routes return `ApiErrorResponse` with specific codes -- the plan should specify this follows the same pattern (500 with `INTERNAL_ERROR`).
- The plan does not mention rate limiting on the new GET `/triage-count` endpoint. Per the security lens: every new endpoint should address rate limiting. This is a GET endpoint returning a count -- low risk, but the plan should explicitly note it as N/A or covered by existing middleware.

### 4. Data Model Alignment (8/10)

The plan correctly identifies:
- `status` column is `text()` with no DB enum constraint -- adding `"needs_human"` requires no migration.
- `attentionScore` is `text("attention_score")` in `knowledgeStrategyFabric` -- must be parsed to number in the API response.
- The `ki_status_idx` index remains valid for the new status value.

The plan correctly notes no migration is needed. The Drizzle schema doesn't need changes because the column type is already `text()`.

### 5. Naming (9/10)

Names are honest and consistent:
- `knowledgeTriageCount` for the sidebar prop -- describes exactly what it is.
- `attentionScore` matches the existing column name in `knowledgeStrategyFabric`.
- `needs_human` matches the existing fabric status value in `KNOWLEDGE_STATUSES`.
- `handleTriageAction` clearly describes its purpose.
- `optimisticRemovals` accurately describes the Set's role.

No naming conflicts with existing primitives. `focusedIndex` is standard React state naming.

### 6. Module Depth (9/10)

The plan adds minimal public surface:
- One new prop on `SidebarProps` (`knowledgeTriageCount`).
- One new endpoint (GET `/triage-count`).
- One new field in the API response signals (`attentionScore`).
- All keyboard navigation, focus tracking, and action handling are internal to `KnowledgeList.tsx`.

The decision to render the badge outside `SectionHeader` (avoiding pollution of the generic interface) is a good module-depth call.

### 7. Failure-Mode Coverage (6/10)

Several failure paths are under-specified:

**Optimistic removal rollback.** The plan says "if the PATCH fails, a toast surfaces the error and the item reappears on next fetch." But the `optimisticRemovals` set mechanism described means the item stays hidden until the set is cleared. When is the set cleared? On refetch? What triggers refetch? The plan says `useFetch` handles it, but `useFetch` has no refetch/revalidation mechanism -- it only fetches once when the URL changes (confirmed by reading the hook source). The builder will need to either: (a) add a refetch mechanism to `useFetch`, (b) manage `allItems` as local state with optimistic mutations, or (c) change the URL to force a refetch. The plan does not resolve this.

**Triage count staleness.** The plan acknowledges "focus-based revalidation is sufficient" but `useFetch` does not support focus-based revalidation. It fetches once on mount and never refetches. The badge will show the initial count until the user does a full page reload. This directly impacts AC3 ("see at a glance how many items need their attention") -- if the count is stale after processing items, the badge misleads.

**Keyboard shortcut conflicts with other global shortcuts.** The plan guards against input/textarea but does not address conflicts with existing global keyboard shortcuts. AppShell already binds `Escape` (for settings close, line 190) and `n`/`N` (for recipient picker, line 297). The `v` key could conflict with browser default behavior (paste in some contexts). The plan should note that the triage keyboard handler must only activate when `activeView === "knowledge"` and `tab === "triage"`, not just when `tab === "triage"` (since tab state persists in component state even when the user navigates away and back).

**Version conflict on rapid actions.** If the user rapidly validates/rejects items, optimistic removal fires PATCHes in parallel. Each PATCH sends the item's `version` from the last full fetch. If two PATCHes hit the same item (unlikely but possible with race conditions), the second will 409. The plan mentions optimistic removal but doesn't address whether PATCHes are serialized or parallel.

### 8. Simplicity / Over-Engineering Risk (8/10)

The plan is appropriately scoped. No unnecessary abstractions, no feature flags, no plugin points. The decision to keep the single-fetch pattern (all items returned by GET `/`) rather than adding tab-specific fetches is the simpler choice. The decision to sort client-side rather than adding a server sort parameter avoids API surface growth.

One concern: the `optimisticRemovals` Set is a manual state management pattern when the simpler approach would be to filter the item out of the local array directly after the PATCH fires, then let the next full fetch reconcile. The Set-based approach adds complexity (clearing the set, handling refetch interactions) without clear benefit over direct array mutation of local state.

### 9. Verifiability (6/10)

The plan lists test tasks (T1e, T2d, T3f, T4f) but does not name specific test assertions or expected outputs. "Write/update server tests for new status, attentionScore in response, and triage-count endpoint" is not a verification method -- it is a task description.

Missing concrete verifications:
- What is the expected response of GET `/triage-count` when there are 3 draft items and 2 `needs_human` items? (Expected: `{ count: 5 }`.)
- What is the expected sort order of 3 triage items with attention scores 0.8, null, and 0.5? (Expected: 0.8, 0.5, null.)
- What keyboard event sequence validates auto-advance? (Expected: press `v` on focused item at index 0, item removed, focus stays at index 0 showing the previously-index-1 item.)
- No protected-test list. The workpackage modifies KnowledgeList behavior that existing tests cover (KnowledgeList.j6, KnowledgeList.j8, status-mapping). These tests may break and need updating -- the plan should enumerate which existing test files are affected.

---

## Findings

### CRITICAL

1. **[plan section 4.5, 4.6] `useFetch` has no refetch or revalidation mechanism.** The plan's optimistic removal and triage count badge strategies both assume `useFetch` supports refetching or revalidation. Reading the actual hook at `packages/web/src/hooks/useFetch.ts`, it fetches once when the URL changes and never refetches. The plan must specify how to solve this. Options: (a) add a `refetchKey` parameter to `useFetch` that triggers refetch when incremented, (b) use raw `fetch` with local state management for triage actions, (c) adopt a different data-fetching pattern for triage. This is CRITICAL because without it, both the optimistic removal rollback and the badge count update are broken.

### WARNING

2. **[plan section 4.2, auto-tab logic] Auto-tab default does not check for `needs_human`.** KnowledgeList.tsx line 587 reads `const hasDraft = allItems.some((i) => i.status === "draft")`. After Y4, this must be `allItems.some((i) => i.status === "draft" || i.status === "needs_human")`. Without this, a knowledge base with only `needs_human` items (no drafts) would default to the curated tab, hiding triage items. This is required by AC2.

3. **[plan section 3.2] Triage count endpoint user-scope filter.** The plan's SQL for GET `/triage-count` filters by `status IN ('draft', 'needs_human')` plus a user-scope guard (`ne(scopeKind, "user") OR eq(updatedBy, userId)`). This correctly mirrors the main GET `/` endpoint's filter. However, the plan does not document what `userId` comes from -- it must come from `c.get("userId")` via the auth middleware, same as the main endpoint. Verify the route is registered under the same auth middleware chain.

4. **[plan section 4.5] Keyboard handler scope.** The plan's `useEffect` guard is `if (tab !== "triage" || filteredTriageItems.length === 0) return`. This is insufficient -- the handler also needs to check that the knowledge view is the active view (not settings, not another view). Since the `KnowledgeList` component only mounts when the knowledge route is active, this is likely safe in practice, but the plan should document this assumption. Additionally, the `v` and `x` shortcuts conflict with nothing in the current codebase at the knowledge route level, but the plan should document that these are knowledge-triage-only shortcuts.

### SUGGESTION

5. **[plan section 4.6] Simplify optimistic removal.** Instead of a separate `optimisticRemovals` Set, consider managing `allItems` as `useState` initialized from `useFetch` data, then filtering out actioned items from the local array. This is simpler state management and avoids the Set-clearing-on-refetch complexity. The reconciliation happens naturally when `useFetch` data changes (if a refetch mechanism is added per Finding 1).

6. **[plan section 6, T5] Integration verification is underspecified.** Task 5 lists "run check, lint, test" but does not list specific existing test files that may break due to Y4 changes. At minimum, these existing test files need review and possible update: `packages/web/src/__tests__/KnowledgeList.j6.test.tsx`, `packages/web/src/__tests__/KnowledgeList.j8.test.tsx`, `packages/web/src/__tests__/status-mapping.test.ts`, `packages/web/src/__tests__/KnowledgeDetail.factory.test.tsx`. The plan should add a task to audit and update these tests.

7. **[plan section 2.1] `promote-knowledge.ts` already writes `needs_human` to the DB.** The plan frames adding `needs_human` to `KERNEL_KNOWLEDGE_STATUSES` as a new capability, but `promote-knowledge.ts` already transitions items to `needs_human` via the fabric promotion pipeline (line 52: `provisional: ["validated", "archived", "needs_human"]`). Items with `needs_human` status already exist in the database. The route validation schema in `knowledge.ts` currently rejects `needs_human` on PATCH, creating an inconsistency where items can be promoted to `needs_human` by agents but cannot be updated by the human API. The plan should acknowledge this existing inconsistency and frame Y4 as resolving it, not introducing it.

---

## What's Working Well

1. **Zero-migration approach is correct and well-justified.** The plan correctly identifies that the `status` column is `text()` with no CHECK constraint, and that the `ki_status_idx` index remains valid for any string value. No schema migration, no Drizzle generate step, no rollback plan needed. This is the simplest correct approach.

2. **Separating the triage-count endpoint from the main list endpoint.** The dedicated count endpoint avoids re-fetching the full item list just to compute a count for the sidebar badge. This is the right call for a number that updates independently of the page content and is shown in a different component (Sidebar vs KnowledgeList).

---

## Verdict

Score 7/10. The plan advances with findings addressed. The CRITICAL finding (useFetch lacking refetch) must be resolved in the plan or during implementation -- the builder needs a concrete strategy for updating the triage count badge and handling optimistic removal rollback. The WARNING about auto-tab logic (Finding 2) is a functional bug that would be caught in testing but should be in the plan. All other findings are implementation-level concerns that the builder can handle.
