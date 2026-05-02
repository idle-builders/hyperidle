# L10 — Simplification Scan

Read-only scan of the L10 diff (`git diff main..HEAD` on `feat/L10-conversations-filter`). Findings only — no code changes.

Scope reviewed:
- `packages/web/src/shell/Submenu.tsx`
- `packages/web/src/components/ThreadSections.tsx`
- `packages/web/src/layouts/AppShell.tsx`
- `packages/web/src/hooks/useConversationsThreads.ts`
- `packages/web/src/__tests__/AppShell.l10-filter.test.tsx`
- `packages/web/src/__tests__/AppShell.filter-reset.test.tsx`
- `packages/web/src/__tests__/Submenu.clear-affordance.test.tsx`
- `packages/web/src/__tests__/Submenu.disabled-chips.test.tsx`
- `packages/web/src/__tests__/Submenu.keyboard.test.tsx`
- `packages/web/src/components/__tests__/ThreadSections.filter*.test.tsx`
- `packages/web/src/hooks/__tests__/useConversationsThreads.test.tsx`
- `packages/web/src/shell/Submenu.stories.tsx`
- `packages/web/e2e/l10-conversations-filter.spec.ts`

---

## CRITICAL

_None._

---

## WARNINGS (concrete simplifications)

### W1 — `predicateFor` is over-engineered for a one-bit predicate

**File:** `packages/web/src/components/ThreadSections.tsx:48-57` (definition) + `:207` (call site) + `packages/web/src/layouts/AppShell.tsx:408` (call site).

`predicateFor("all")` returns `() => true`, only used to short-circuit `threads.filter(...)`. The component already short-circuits via `activeFilter === "all" ? threads : threads.filter(predicateFor(activeFilter))` (line 207), so the `'all'` branch of the function is dead at the only place it gets called for filtering. AppShell at line 408 calls `predicateFor(conversationsFilter)` even when the filter is `'all'` — the result is `() => true` and `.filter(() => true)` allocates a new array for nothing.

The whole predicate is one expression: `t.blocking === (filter === 'blocking')`. The exhaustiveness argument in the plan (§3.4) is doing real work for a future fourth value, but right now there is no fourth value and no roadmap for one — the closed `ConversationsFilter` is a strict subset of a wider union explicitly to keep this surface narrow.

**Simplify:** inline a `t.blocking === (f === 'blocking')` check at the two call sites, or keep a single `matchesFilter(t, f)` that returns boolean (not a curried predicate factory). Drop `predicateFor` from `ThreadSections.tsx`'s exports. AppShell should also short-circuit `'all'` so it doesn't run a filter pass for the count.

### W2 — `FILTER_EMPTY_COPY` map exists for two strings

**File:** `packages/web/src/components/ThreadSections.tsx:59-62` + `:217-218`.

```ts
const FILTER_EMPTY_COPY: Record<Exclude<ConversationsFilter, "all">, { description: string }> = {
  blocking: { description: "No blocking threads right now." },
  async: { description: "No async conversations." },
};
```

A `Record` wrapped around a one-property object containing a single string, looked up exactly once. The `Exclude<…, "all">` type annotation is the only thing the wrapper is buying — and it's protecting against a misuse that the caller's surrounding `if (filtered.length === 0 && activeFilter !== "all")` already prevents.

**Simplify:** inline `const description = activeFilter === "blocking" ? "No blocking threads right now." : "No async conversations.";` directly above the `EmptyState`. Drop the `FILTER_EMPTY_COPY` constant and the `{ description: string }` wrapper object.

### W3 — Plan §3.6 promised `title` per chip; implementation hardcodes a shared title; the `Record` wrapper is a relic of the old shape

Same block (`ThreadSections.tsx:59-62` and `:221`). The architecture plan (§3.6) defined `FILTER_EMPTY_COPY` as `{ title: string; description: string }`. The shipped code uses a single hardcoded title `"No threads match this filter"` for both filter values and only varies the description. The wrapper object kept the per-id structure but lost half its fields. Fold it into a single ternary as in W2.

### W4 — `defaultFilterId` named binding adds nothing over `filters[0]?.id`

**File:** `packages/web/src/shell/Submenu.tsx:70-75`.

```ts
const defaultFilterId = hasFilters ? filters[0].id : undefined;
const showClearButton =
  hasFilters &&
  onClearFilter !== undefined &&
  activeFilter !== undefined &&
  activeFilter !== defaultFilterId;
```

The `defaultFilterId` constant is referenced exactly once. Inline `activeFilter !== filters[0]?.id` (and the optional-chain handles the empty-filters case implicitly). Reduces three lines to one.

### W5 — `disabledClass` named binding for one usage

**File:** `packages/web/src/shell/Submenu.tsx:79` + `:142`.

```ts
const disabledClass = filtersDisabled ? "opacity-50 pointer-events-none" : "";
```

Single use, single call site. Inline into the `className` template at line 142.

### W6 — `aria-disabled={filtersDisabled || undefined}` hides a subtle truthiness bug per chip and is duplicated

**File:** `packages/web/src/shell/Submenu.tsx:152` + `:173`.

The pattern `filtersDisabled || undefined` is correct (avoids emitting `aria-disabled="false"`) but appears twice with no shared helper, and the disabled-state visual already lives on the *parent* div via `disabledClass` (`pointer-events-none` — chips can't be clicked anyway). The `if (filtersDisabled) return;` short-circuit inside both `onClick` handlers (lines 159 and 176) is therefore defending against a state that `pointer-events-none` already prevents. Pick one defense, not three (parent class + per-chip aria + per-chip click guard).

**Simplify:** keep the per-chip `aria-disabled` (semantics) and the parent `pointer-events-none` (interaction). Drop the redundant `if (filtersDisabled) return;` checks inside the click handlers — they're unreachable while `pointer-events-none` is active. If you keep the click guards as belt-and-suspenders, drop a comment saying so; otherwise they look like the primary defense and confuse the next reader.

### W7 — `conversationsFilter` narrowing in AppShell handles a case that cannot occur

**File:** `packages/web/src/layouts/AppShell.tsx:397-398`.

```ts
const conversationsFilter: ConversationsFilter =
  submenuFilter === "blocking" || submenuFilter === "async" ? submenuFilter : "all";
```

The comment (lines 391-396) explicitly says: "that case can't actually occur because the filter is reset to `'all'` on view change." A type narrow that defends against a runtime impossibility is dead code with a note attached. The cost is small but the alternative is one type assertion at the boundary or — better — narrowing `submenuFilter`'s type directly to `ConversationsFilter` when `activeView === "conversations"` (use a discriminated state or two filter states, one per view).

**Simplify:** either type the state per-view from the start (a small refactor), or document this explicitly as a defensive narrow for a possible-future leak (e.g. URL-backed filter restore). Right now the comment says "can't occur" while keeping the code that handles it occurring.

### W8 — `submenuTotalCount` `useMemo` over a 5-element filter is overkill

**File:** `packages/web/src/layouts/AppShell.tsx:399-411`.

`useMemo` to memoize `threads.filter(predicateFor(...)).length` plus a tiny `reduce` over `submenuConfig.items`. Both inputs change on basically every relevant render. The memoization saves a `.filter()` over <50 items (the API limit). The `useMemo`'s closure-comparison cost likely exceeds the work being memoized.

**Simplify:** drop the `useMemo`, compute inline. Same for the `badgeCountByView` `useMemo` at lines 374-380 (iterates a 3-key `SUBMENU_CONFIG`). Both are micro-optimizations on micro-work.

### W9 — `count` prop ternary chain in AppShell is unreadable

**File:** `packages/web/src/layouts/AppShell.tsx:490-500`.

```ts
count={
  activeView === "conversations" && conversationsFilter !== "all"
    ? submenuTotalCount
    : submenuTotalCount > 0
      ? submenuTotalCount
      : undefined
}
```

Three branches, two of which return the same value, expressing one rule: "show the count, but hide it when activeView is not conversations and the count is 0; never hide it when a non-default filter is active." That's hard to extract from the nested ternary.

**Simplify:** extract `const showZero = activeView === "conversations" && conversationsFilter !== "all"; const count = showZero || submenuTotalCount > 0 ? submenuTotalCount : undefined;` above the JSX.

### W10 — `void activeView;` line is a dependency-rule workaround that should be deleted

**File:** `packages/web/src/layouts/AppShell.tsx:429-432`.

```ts
useEffect(() => {
  void activeView;
  setSubmenuFilter("all");
}, [activeView]);
```

The `void activeView;` exists because Biome would flag `activeView` as an unused variable inside the effect body. But the effect body uses no other state — the dependency `[activeView]` already tells the system "run on view change." This is the canonical pattern. Either disable the lint inline once with a clear `// biome-ignore` reason, or — better — use a derived `useEffect(..., [activeView])` whose body genuinely reads `activeView` (e.g. `if (activeView !== "conversations") setSubmenuFilter("all");` — which would also fix W7 for free).

### W11 — Submenu stories duplicate the same filter-array literal three times

**File:** `packages/web/src/shell/Submenu.stories.tsx:85-89`, `:116-120`, `:145-149`.

The `[All, Blocking, Async]` filter array is copy-pasted across three stories. Stories are display fixtures and duplication is usually fine, but this triggers refactor drift the moment the conversations vocabulary changes again. Hoist a `const CONVERSATIONS_FILTERS` at the top of the file.

Same observation for the `MIXED_THREADS` / `mkRow` test fixture defined in both `AppShell.l10-filter.test.tsx` (lines 41-64) and `e2e/l10-conversations-filter.spec.ts` (lines 31-58) — verbatim. A shared `__fixtures__/threads-fixture.ts` would prevent the inevitable drift between Vitest and Playwright.

### W12 — `isThreadListRow` guard validates `blocking` as `boolean | undefined` then the mapper does `typeof row.blocking === "boolean"` again

**File:** `packages/web/src/hooks/useConversationsThreads.ts:82` + `:121`.

The guard accepts `undefined | boolean`. The mapper then re-checks `typeof row.blocking === "boolean"` to decide whether to fall back to `false`. Once the guard has promised the field is `boolean | undefined`, the mapper can use `row.blocking ?? false`. Saves a redundant runtime check.

**Simplify:** `blocking: row.blocking ?? false,` at line 121.

### W13 — `MockListRow` interface duplicated across three files with a `blocking?: boolean` annotation, then `mkRow` factory duplicated

**Files:**
- `packages/web/src/__tests__/AppShell.l10-filter.test.tsx:26-55`
- `packages/web/src/hooks/__tests__/useConversationsThreads.test.tsx:12-46`
- `packages/web/e2e/l10-conversations-filter.spec.ts:17-45`

Three near-identical `MockListRow` shapes plus three near-identical `mkRow`/`row` factories. The web vitest and the playwright spec ship the same fixture data twice. Hoist into `packages/web/src/__fixtures__/thread-list-row.ts` and import.

---

## OBSERVATIONS (worth discussing)

### O1 — `groupThreadsForConversations` is allocating three buckets on every render even when the active filter excludes two of them

`ThreadSections.tsx:119-140`. The `'blocking'` filter restricts the visible domain to blocking threads, and the rendering loop at `:249-251` then explicitly hides the other two sections. The grouping function still allocates `active: []` and `resolved: []`, sorts them, and packages them into a section descriptor that gets thrown away. Cheap, but architecturally noisy: the filter-axis is `blocking ↔ async`, which maps 1:1 to "Blocking" and "Active" sections. There's a more honest version of this where the filter chooses which section to render directly. Not urgent — the shipped code is correct — but worth noting before someone adds a fourth filter and discovers the section-vs-filter axis is now a 4×3 matrix instead of an axis.

### O2 — `predicateFor` is exported, ostensibly for AppShell's count badge — but the count is the only external consumer

`ThreadSections.tsx:48` + `AppShell.tsx:15`. Per the plan (§3.4, §7.1) the export exists to prevent count/list drift. If W1's simplification lands, AppShell would call the same inlined check (`t.blocking === ...`) and the export disappears. One less module-boundary.

### O3 — `count` rendering rule (W9) encodes a behavioral asymmetry that may be wrong

When `activeView !== "conversations"`, a count of `0` hides the badge. When `activeView === "conversations" && filter !== "all"`, a count of `0` shows the badge. Per plan §1 Q9 this is intentional. But it means an Async filter on a list of 5 with 0 async shows `0`, while Knowledge with 0 items shows nothing. Once Knowledge gets a working filter (deferred follow-up), the rule will need to generalize — the asymmetry is not really `view === "conversations"` it's `filter !== "all"`. Worth simplifying the predicate now to `filter !== defaultFilterId || count > 0`.

### O4 — Touch-target test in Playwright sets viewport to exactly 1024 — boundary condition

`e2e/l10-conversations-filter.spec.ts:129`. AQ-016 says ≤ 1024 px triggers comfortable density. Setting viewport to exactly 1024 is the boundary; one-off-by-one in the breakpoint check (`<` vs `<=`) and the test silently no-ops because density stays default. Use 1023 to be unambiguous, or assert the `data-density` attribute first as a precondition.

### O5 — `aria-label="Filter Conversations"` has the title concatenated awkwardly

`Submenu.tsx:143`: `aria-label={\`Filter ${title}\`}`. When `title` is `"Conversations"` you get "Filter Conversations" — fine. When it's "Active Bets" (story `Interactive`), you'd get "Filter Active Bets" — still fine. But if the title becomes a count-bearing string later, the label would read oddly. Minor; flag for future i18n.

### O6 — `as unknown as typeof fetch` cast appears in five places across the test suite

A small `function stubFetch(response): void` helper would centralize the cast and the cleanup pattern. Not a defect — purely a code-cleanliness observation.

---

## VERDICT

**PROCEED** — no critical issues. Many small simplifications available; W1, W2, W4, W5, W7, W10, W12 are quick wins (each is 1–5 lines). W11 and W13 (fixture duplication) will pay off on the next vocabulary change. None of the warnings change behavior or block shipping.

---

### Findings count by severity

- CRITICAL: 0
- WARNINGS: 13
- OBSERVATIONS: 6
