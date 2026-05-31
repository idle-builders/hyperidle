# U6 Code Review Round 2 -- App Shell: Sidebar + Main (Layout Restructure)

**Reviewer:** Phase 4 re-review (verifying builder fixes for round 1 findings)
**Branch:** `feat/U6-sidebar-layout`
**Commits reviewed:** `e8086e95` (fix: address review findings), `ffdf8500` (fix: remaining test failures)

---

## Previous Findings: Resolution Status

### Must-Fix (from Round 1)

**1. A3 -- E2E tests not updated: RESOLVED**

Builder updated `navigation.spec.ts` (fully rewritten for Sidebar layout), `L13-product-drilldown.spec.ts` (routes updated to `/work/team/`), `L17-cost-tokens.spec.ts` (route URL updated), `lifecycle-propagation.spec.ts` (route URL updated), `settings-redesign.spec.ts` (Submenu references updated), `keyboard-and-responsive.spec.ts` (Sidebar-aware responsive tests), `knowledge-ia.spec.ts` (added `@lore` explaining old testids, tests remain `.skip`ped pending seed layer). Deleted `rail-collapsed-pills.spec.ts`. All E2E specs now target Sidebar-based layout.

**2. V1 -- Double useConversationsThreads fetch: RESOLVED**

`Conversations.tsx` no longer imports or calls `useConversationsThreads`. Thread data (threads, threadsStatus, threadsError, onRetryThreads) is sourced from `AppShellOutletContext` via `useOutletContext()`. The `AppShellOutletContext` interface at `AppShell.tsx:53-63` includes all four thread fields. The Outlet context at `AppShell.tsx:447-459` passes them with `satisfies AppShellOutletContext`. Fallback values handle the standalone-test case. Single fetch, no regression.

**3. A2 -- Knowledge scope active state: RESOLVED**

Knowledge scope sub-items at `Sidebar.tsx:340-349` now receive `bg-[var(--surface-elevated)] shadow-[var(--shadow-subtle)] border-l-2 border-l-[var(--accent-primary)]` when active, plus `aria-current="page"`. Consistent with thread (line 255-260) and team (line 303-307) sub-item treatment.

**4. V2 -- biome.json global suppression: RESOLVED**

The `"correctness": { "noUnusedVariables": "off" }` block was removed from the test file override in `biome.json`. The global rule remains `"error"` (line 13). One targeted inline `biome-ignore` at `Sidebar.test.tsx:102` handles the specific case.

### Should-Fix (from Round 1)

**5. A1 -- NavItem lore comment: RESOLVED**

`@lore` at `Sidebar.tsx:7-13` now accurately documents the decision to use raw `<li><button>` elements instead of NavItem, with rationale (data attributes, density mismatch). The false claim about NavItem usage is gone.

**6. D1 -- Missing left accent border: RESOLVED**

`border-l-2 border-l-[var(--accent-primary)]` is present on active thread sub-items (line 259), team sub-items (line 306), and knowledge scope sub-items (line 347). Matches the design spec.

**7. A4 -- Stale references: RESOLVED**

- `WorkTeam.stories.tsx`: no `/work/product/` references remain
- `ThreadSections.tsx:13`: updated to "Conversations section (L8)" (was "Conversations Submenu")
- `useConversationsThreads.ts`: no Submenu references
- `KnowledgeList.tsx`: no Submenu references
- `WorkPortfolio.tsx`: no `/work/product/` references
- `test-setup.ts`: no Submenu/Rail references

**8. A5 -- GearIcon SVG clipping: RESOLVED**

New SVG path at `Sidebar.tsx:111` uses coordinates within 0-16 range (max y value ~15.5). `@lore` comment at line 105-106 documents the fix. No more `y=17` clipping.

---

## New Issues from Fix Commits

### MUST-FIX: N1 -- U5 domain-sense sweep test failure

**Evidence:** `npm run test -- --all` reports 1 failure:

```
U5 AC5: no domain-sense 'product' references in packages/web/src
  > no domain product identifiers in .ts/.tsx source files
```

Three violations:
- `router.tsx:36`: `return <Navigate to={\`/work/team/${productId ?? ""}\`} replace />;`
- `U6-router.test.tsx:61`: same redirect pattern in test mock
- `U6-router.test.tsx:126`: test description mentioning "productId alias"

**Root cause:** U6 introduced `RedirectProductToTeam` at `router.tsx:34-37` which uses `useParams<{ productId: string }>()` to read the old URL parameter. The U5 sweep test's allowlist (at `U5-type-sweep.test.ts:220`) exempts `productId: teamId` destructuring alias but not bare `productId` in a redirect component. The old main code had `<WorkTeam />` at the old route which used the alias pattern.

**Fix options:**
1. Add `router.tsx` redirect component to the U5 sweep allowlist (since `productId` is inherently part of the OLD route param name being read for redirect -- legitimate backward-compat use).
2. Update `U6-router.test.tsx` to use allowlisted patterns or be excluded.

This is a real test failure -- `npm run verify` will fail until this is resolved.

### NIT: N2 -- `conversations-submenu.spec.ts` filename

The E2E file `conversations-submenu.spec.ts` retains "submenu" in its filename and describe block (`"L8 -- Conversations Submenu list"`). The tests themselves work correctly (they test thread sections, not the deleted Submenu component), but the name is misleading. Not blocking.

### NIT: N3 -- Empty `<span className="flex-1" />` + `ml-auto` redundancy

`Sidebar.tsx:423-425` still has the redundant `<span className="flex-1" />` followed by `<span className="ml-auto">`. Either one alone pushes the gear icon right. Carried forward from round 1 observation V4. Not blocking.

---

## AC Completeness Audit (Round 2)

All 19 ACs remain at their round 1 status. The fixes did not regress any AC.

| AC | Status | Change from R1 |
|----|--------|----------------|
| AC-1 through AC-6 | PASS | No change |
| AC-7 | **PASS** | Upgraded from PARTIAL -- knowledge scope sub-items now have active treatment |
| AC-8 through AC-17 | PASS | No change |
| AC-18 | **BLOCKED** | U5 sweep test failure must be resolved before verify can pass |
| AC-19 | PASS | No change |

---

## Verdict: NOT DONE

One must-fix remains: the U5 domain-sense sweep test fails due to `productId` in the new `RedirectProductToTeam` component and its test. This is a real test regression introduced by U6 that prevents `npm run verify` from passing.

Once N1 is resolved, the branch is ready for `/ship`.

