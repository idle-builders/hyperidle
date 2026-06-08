# AD6 Architecture Critique: Knowledge Cleanup & Scope Simplification

## 9-Dimension Rubric Scoring

### 1. Scope Accuracy (9/10)

The plan correctly constrains to presentation-layer changes only. No database migrations, no new API endpoints, no shared package changes. The "What this does NOT change" section (section 11) is explicit and correct. File inventory lists exactly 9 files (2 created, 7 modified) -- all in `packages/web/src/`.

The plan does not inadvertently creep beyond the workpackage boundary.

### 2. Contract Precision (7/10)

The `scope-labels.ts` utility is well-specified with exact TypeScript signatures and `as const` assertions. The mapping from user-facing labels to backend values is unambiguous.

However, two contract imprecisions exist:

**Finding 1: `useNavigate` is NOT already imported in KnowledgeDetail.tsx.** Section 4.2 states `const navigate = useNavigate(); // already imported via react-router-dom`. Inspecting the actual file, only `Link` and `useParams` are imported from `react-router-dom`. The builder must add `useNavigate` to the import statement. This is a factual error in the plan that could cause confusion but is trivially fixable.

**Finding 2: `apiFetch` is NOT imported in KnowledgeDetail.tsx.** Section 4.2 uses `apiFetch(...)` for the archive call, but `KnowledgeDetail.tsx` does not currently import `apiFetch`. The file uses `useKnowledgeItem` (which internally uses `useFetch`). The builder needs to add this import. The plan should list it as a new import requirement.

These are minor but represent the plan claiming code structure that does not exist, which is the kind of error that causes builder confusion.

### 3. Data Model Alignment (10/10)

No data model changes. The plan correctly references the existing `scopeKind` enum (7 values) and maps to it without modification. The `SCOPE_PILL_OPTIONS` and `SCOPE_CREATE_OPTIONS` constants correctly map user-facing labels to backend enum values. The `scopeKindToLabel` reverse mapping handles all 7 backend values correctly (factory/product/practice -> "Shared", team -> "Team", user -> "Private").

Bet/task scopeKind values are implicitly handled by the reverse mapping (they fall through to the "Shared" default in `scopeKindToLabel`). This is correct behavior -- in the detail aside, a bet-scoped item would show "Shared" which is technically inaccurate. However, the design decided bet/task items are rare and agent-created, so this edge case is acceptable for AD6.

### 4. API Contracts (9/10)

No new API endpoints. The archive call (`POST /api/knowledge/:id/archive`) is verified to exist in the server routes. The plan correctly describes the happy path (sets status to "archived", returns updated item).

One gap: The plan does not specify what the archive endpoint returns on success. Looking at the server code, it returns `c.json(item)` (the updated knowledge item). The architecture plan only checks `res.ok` and navigates -- this is sufficient and correct. The response body is unused, which is fine.

### 5. Component Architecture (8/10)

The plan correctly identifies the four components to modify and specifies changes at the right granularity. The shared utility (`scope-labels.ts`) is the right level of abstraction -- it avoids duplicating the mapping in multiple components.

The filter logic placement is correct: scope filter applies BEFORE the triage/curated split (section 3.3). This is architecturally sound -- it means scope filtering affects both tabs uniformly.

One concern: The plan specifies `option.filter.includes(item.scopeKind as any)` in section 2.2. The `as any` cast violates the project's TypeScript rules ("No `any`, no `@ts-ignore`, no unsafe `as` casts"). The builder should find a type-safe alternative (e.g., casting `item.scopeKind` to the union type or using a type guard). The plan should not include `as any` in its code samples.

### 6. Test Strategy (8/10)

The test plan is comprehensive: 10 test cases covering all ACs, both positive and negative assertions. The TDD ordering (utility -> failing tests -> implementation) is correct.

Concerns:

- The plan mentions updating `KnowledgeList.j8.test.tsx` with "Verify kind badge is NOT rendered (negative assertion)" but this file may already have assertions that conflict. The risk table acknowledges this ("High likelihood of existing test breaks") but the mitigation is vague ("Update in step 6").

- The plan lists `KnowledgeRow.test.tsx` and `KnowledgeRow.factory.test.tsx` as potential updates but with "Update if they assert kind badge rendering" -- this uncertainty suggests the designer did not verify what these tests actually assert.

- The current `selectedScopeFilter` state type (`string | null`) changes to `ScopePillLabel | null`. Tests that set filter state by raw backend scopeKind values will break. The plan correctly notes this in the risk table.

### 7. Task Ordering (9/10)

The recommended TDD order is correct and dependency-aware:
1. Create utility (no dependencies)
2. Write failing tests (depends on utility types)
3-5. Implement components (depends on tests defining expected behavior)
6. Full verification

The plan correctly notes tasks 2-5 can run in parallel after task 1, and provides the recommended serial TDD order. No circular dependencies.

### 8. Risk Analysis (7/10)

Four risks identified, all reasonable. However:

**Missing risk: `KnowledgeListContent` props interface change.** The plan changes `selectedScopeFilter` from `string | null` to `ScopePillLabel | null` and removes `scopeOptions: string[]` (replaced by the static import). The `KnowledgeListContentProps` interface has `scopeOptions: string[]` and `selectedScopeFilter: string | null`. Removing/changing these props will break the interface contract and any tests that construct these props directly. This is a medium-likelihood breaking change not explicitly called out.

**Missing risk: `scopeOptions` prop removal.** The `KnowledgeListContent` component receives `scopeOptions` as a prop from the parent. The plan replaces this with the static `SCOPE_PILL_OPTIONS` import inside the component, which means removing `scopeOptions` from the props interface. This needs explicit mention because the prop is threaded from the parent component.

**Missing risk: Concept/design inconsistency on Flag.** The concept document (section 5) says "Flag: Keep in overflow menu but wire to backend POST /:id/flag. Needs a reason prompt." The design document says "Flag -- removed from user-facing menu." The architecture follows the design (remove Flag entirely). This is the correct choice given the ACs, but the concept contradiction should be noted for the record.

### 9. Completeness (8/10)

All 5 ACs are addressed by at least one task:
- AC-1: Task 4+5 (3-pill scope picker)
- AC-2: Task 3 (remove Flag, wire Archive)
- AC-3: Task 3 (archive handler)
- AC-4: Implicitly addressed (scope pills + topic groups -- no task required beyond AC-1)
- AC-5: Tasks 2+3+4+5 (remove kind badge from list, remove kind from create, keep read-only in detail)

One gap: The plan removes `Tag(kind)` and `Tag(layer)` from the header metadata bar (section 4.3) but does not address what happens to the aside metadata card's "Kind" row. The design says "Keep -- read-only, shows agent-assigned kind when present. Display '---' when absent." The architecture plan's section 4.4 only addresses adding a "Scope" row but does not mention keeping/modifying the existing Kind row in the aside. This is a silent omission -- the builder might assume "not mentioned = not changed" which is correct, but explicit confirmation would be clearer.

---

## Findings

### Must-fix (would block score)

None individually blocking, but the `as any` in the code sample is concerning given project rules.

### Should-fix (improve quality)

1. **Remove `as any` from filter logic code sample (section 2.2).** The project enforces "no `any`" via TypeScript rules. The plan should show a type-safe approach, e.g.:
   ```typescript
   const filterValues: readonly string[] = option.filter;
   return allItems.filter(item => filterValues.includes(item.scopeKind ?? ""));
   ```

2. **Correct the `useNavigate` claim (section 4.2).** Strike "already imported via react-router-dom" -- it is not imported. Add `useNavigate` to the import additions list for KnowledgeDetail.tsx.

3. **Correct the `apiFetch` claim (section 4.2).** `apiFetch` is not currently imported in KnowledgeDetail.tsx. Add it to the required imports.

4. **Document the `KnowledgeListContentProps` interface change.** The `scopeOptions` prop is removed and `selectedScopeFilter` type changes. This is a prop interface breaking change that should be explicitly listed.

### Nice-to-have (non-blocking)

5. **Note the concept/design disagreement on Flag.** The concept says "wire Flag to backend" while the design/architecture says "remove Flag." Document that the design supersedes the concept on this point and why (Flag requires a reason prompt which adds scope; removing is simpler and satisfies AC-2).

6. **Clarify aside Kind row retention.** Section 4.4 adds a Scope row but does not explicitly confirm the Kind row stays unchanged. A one-line confirmation would prevent ambiguity.

7. **Address bet/task items in `scopeKindToLabel`.** Items with `scopeKind: "bet"` or `scopeKind: "task"` will show "Shared" in the detail aside metadata. This is slightly misleading but acceptable for AD6 -- document it as a known imprecision.

---

## Verdict

**Score: 8/10 -- PASS (advances to build)**

The architecture plan is well-structured, correctly scoped, and provides sufficient detail for a builder to implement without ambiguity on the core decisions. The factual errors about existing imports are minor friction (the builder will discover them immediately at compile time). The `as any` in the code sample is a style concern that the builder should not copy verbatim. The missing risk around prop interface changes is the most substantive gap but is low-complexity to resolve during implementation.

The plan correctly maintains the three-layer architecture (all changes in Human Interface layer), preserves backend contracts, and provides a clear TDD ordering with comprehensive test coverage.
