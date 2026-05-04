# L10 — Architecture Plan: Submenu filter chips actually filter

**Story:** TRACK-L L10 (lines 345–371). Depends on L8 (shipped).
**Approved design input:** `plans/design-explorations/L10/approved.md` (variant A, score 8.6/10).
**Plan owner:** architect. Implementation will follow `/implement L10`.

---

## 1. Phase 0 — Interrogation results

Decision tree resolved. Each branch has a recommended answer; no open question blocks the plan.

| # | Question | Resolution |
|---|---|---|
| 1 | Smallest useful version? | Three-chip filter (`All / Blocking / Async`) wired through `ThreadSections`; inline `× Clear` + filter-empty `EmptyState`. No URL persistence (deferred). No keyboard verb shortcuts (founder cut). |
| 2 | What's the one axis? | `blocking ↔ non-blocking` per L8's derived `ThreadItem.blocking` boolean. The chip vocabulary IS the axis. |
| 3 | Where does filter state live? | Existing `useState<SubmenuFilter>` in `AppShell` (kept). View-change reset already implemented at AppShell.tsx:409–412 (kept). Approved §12 Q1. |
| 4 | Predicate location — `AppShell` or `ThreadSections`? | `ThreadSections`. Pass unfiltered `threads[]` + new `activeFilter` prop down; component filters before grouping. Keeps total-count + section-count derived from the same array. Approved §12 Q2. |
| 5 | `SubmenuFilter` union shape? | Single union `'all' | 'blocking' | 'async' | 'needs-review'`. Drops `'chats'` and `'resolved'` (no remaining consumer). One union is simpler than per-view typed unions and the runtime guard is just per-view filter list. Approved §12 Q4. |
| 6 | Knowledge filter chip changed? | No. L10 only touches Conversations chips. Knowledge keeps `[All, Needs review]` (currently inert; remains inert after L10). |
| 7 | Disabled-chip visual under error? | `aria-disabled="true"` + `opacity-50` + `pointer-events-none`. Not the `disabled` HTML attribute — keeps screen-reader text. Approved §12 Q6. |
| 8 | Selected-thread interaction with filter? | Independent. If selected thread is filtered out, the row is unmounted in the Submenu but the Main pane keeps showing it (L8 §5.7 preserved). Approved §4. |
| 9 | Total-count badge under filter? | Post-filter length. When `0` and filter is non-`all`, badge shows `0` (does not hide). Approved §6. |
| 10 | Blocking flag — server- or client-derived? | L8 ships `blocking: false` for every row (`useConversationsThreads.ts:108`). The agent-session-state plumbing that makes blocking truly derived is later. **L10 does not block on this** — the predicate is correct, the data input is the limitation. The Vitest tests pass synthetic `ThreadItem[]` with explicit `blocking: true|false`. The Playwright test seeds at least one thread with a derived `blocking=true` (see §6 below). |

---

## 2. Plan reconciliation (spec ⇆ reality)

Every named symbol from the approved design vs. live code:

| Symbol | Spec assumes | Reality (verified) | Plan handles by |
|---|---|---|---|
| `SUBMENU_FILTERS.conversations` | exists at `AppShell.tsx:75-87` | confirmed (lines 75–87) | Replacing the array contents with `[all, blocking, async]`. |
| `SubmenuFilter` union | `'all' | 'needs-review' | 'chats' | 'resolved'` at `Submenu.tsx:9` | confirmed | Replace union with `'all' | 'blocking' | 'async' | 'needs-review'`. |
| `submenuFilter` state | `useState<SubmenuFilter>("all")` at `AppShell.tsx:398` | confirmed | Kept. Now actually consumed. |
| Filter-reset effect | `useEffect` at `AppShell.tsx:409–412` | confirmed | Kept unchanged. |
| `ThreadSections` props | `threads`, `selectedId`, `loading`, `errorMessage`, `onRetry` | confirmed at `ThreadSections.tsx:115–130` | Add `activeFilter?: SubmenuFilter` (defaults to `'all'`) + `onClearFilter?: () => void` (for the EmptyState action button). |
| `ThreadItem.blocking` | exists, boolean | confirmed at `ThreadSections.tsx:24` | Used as the predicate input. |
| `useConversationsThreads.ts:108` | `blocking: false` hardcoded | confirmed | Untouched. Plan §1 Q10 explains why this doesn't block L10. |
| `EmptyState` action slot | `action?: ReactNode` | confirmed at `EmptyState.tsx:14–21` | Used directly. No EmptyState API change needed (resolves approved §12 Q5). |
| Existing test `Submenu.filters.test.tsx` | uses `'needs-review'` against generic `Submenu` | confirmed | Test continues to be valid for `Submenu` itself (it stays generic over chip ids). The test file's fixtures use `'needs-review'` which remains valid for Knowledge view. No change. |
| Existing test `AppShell.filter-reset.test.tsx` | clicks `'Needs review'` chip in Conversations submenu | confirmed; chip will no longer exist in Conversations after L10 | **Test must be updated** to click `'Blocking'` (or `'Async'`) chip instead. Test still proves the same AC: filter resets on view change. |
| `Submenu.stories.tsx` | uses old chip ids | needs verification + alignment | Story fixtures replaced with new chip ids; one new story added showing `× Clear` affordance. |
| Server `ThreadListRow` schema | provides hosts/pinned/resolvedAt/hasUnresolvedReview | confirmed | Untouched. No server change in L10. |
| Routes | `/conversations/review` | confirmed | Untouched. |

**No DB migration. No API change. No new endpoint. No new custom component.** All work is in the web package.

---

## 3. Type signatures / contracts (the bar implementation must match)

### 3.1 `SubmenuFilter` (web — `packages/web/src/shell/Submenu.tsx`)

```ts
export type SubmenuFilter = 'all' | 'blocking' | 'async' | 'needs-review';

export interface SubmenuFilterOption {
  id: SubmenuFilter;
  label: string;
}
```

### 3.2 `Submenu` props delta

Existing public surface stays the same. The `Submenu` component itself remains generic over chip ids — it does NOT learn about "conversations"-specific chips. The two L10 additions to `Submenu`:

```ts
export interface SubmenuProps {
  // ...existing fields unchanged...
  /** Optional handler for the inline `× Clear` affordance.
   *  When provided AND `activeFilter !== 'all'` (or any non-default), Submenu
   *  renders the inline clear button. When omitted or activeFilter is the
   *  default, the clear button is unmounted. */
  onClearFilter?: () => void;
  /** Optional disabled flag for chips (passed through to chip + clear button).
   *  When true, all chip controls render with aria-disabled="true" + opacity-50
   *  + pointer-events: none. */
  filtersDisabled?: boolean;
}
```

The "non-default" detection inside `Submenu` is `activeFilter !== filters[0].id` — chip 0 is the canonical default by tablist convention. If callers pass `activeFilter === 'all'` and `filters[0].id === 'all'`, the clear button is unmounted. **No magic strings inside Submenu.**

### 3.3 `ThreadSections` props delta

```ts
export interface ThreadSectionsProps {
  // ...existing fields unchanged...
  /** When provided, threads are filtered through the predicate associated
   *  with this filter id BEFORE sectioning. Defaults to 'all' (no filter). */
  activeFilter?: ConversationsFilter;
  /** Click handler for the "Clear filter" button rendered inside the
   *  filter-empty EmptyState. Only relevant when `activeFilter !== 'all'`. */
  onClearFilter?: () => void;
}

/** Closed L10 vocabulary for Conversations filtering. Mirrors the Conversations
 *  subset of `SubmenuFilter` so ThreadSections is decoupled from the wider
 *  union. */
export type ConversationsFilter = 'all' | 'blocking' | 'async';
```

### 3.4 Predicate (single source of truth)

```ts
// packages/web/src/components/ThreadSections.tsx
function predicateFor(f: ConversationsFilter): (t: ThreadItem) => boolean {
  switch (f) {
    case 'all':      return () => true;
    case 'blocking': return (t) => t.blocking === true;
    case 'async':    return (t) => t.blocking === false;
  }
}
```

Discriminant exhaustiveness — any future addition to `ConversationsFilter` will fail typecheck here.

### 3.5 Filter × sectioning interaction (locks the rendering contract)

| `activeFilter` | Blocking section visible | Active section visible | Resolved · 24h section visible |
|---|---|---|---|
| `all` | iff non-empty | always (renders `Quiet` line if empty) | iff non-empty |
| `blocking` | iff non-empty (else filter-empty EmptyState) | absent | absent |
| `async` | absent | always (renders `Quiet` line if empty) | iff non-empty |

Whole-list filter-empty (after applying the predicate) renders the dedicated EmptyState defined in §3.6 — replacing the entire `<div data-testid="thread-sections">` content, NOT just one section.

### 3.6 EmptyState content (filter-empty)

```ts
const FILTER_EMPTY_COPY: Record<Exclude<ConversationsFilter, 'all'>, { title: string; description: string }> = {
  blocking: {
    title: 'No threads match this filter',
    description: 'No blocking threads right now.',
  },
  async: {
    title: 'No threads match this filter',
    description: 'No async conversations.',
  },
};
```

`dataTestId="thread-sections-filter-empty"`. Action: `<button className="btn btn-primary btn-sm" aria-label="Clear filter" onClick={onClearFilter}>Clear filter</button>`. `EmptyState`'s existing `action?: ReactNode` slot accepts this directly — no DS change.

### 3.7 Inline `× Clear` markup (inside `Submenu`)

```tsx
{filters && hasFilters && activeFilter !== filters[0].id && onClearFilter && (
  <button
    type="button"
    className="btn btn-xs btn-ghost text-[var(--text-lo)] font-mono ml-auto"
    aria-label="Clear filter"
    data-testid="submenu-filter-clear"
    onClick={onClearFilter}
  >
    {'× Clear'}
  </button>
)}
```

Sits inside the same outer flex row as the chips, OUTSIDE the `role="tablist"` element. Refactor (post-adversary C2 revision — **no `display: contents`**):

```tsx
{/* Outer row: tablist + clear button as siblings */}
<div className="flex items-center gap-1">
  <div role="tablist" aria-label={`Filter ${title}`} className="flex flex-wrap gap-1">
    {filters.map((f) => (
      // ...existing chip markup...
    ))}
  </div>
  {/* Clear button sibling — only mounted when activeFilter is non-default and onClearFilter provided */}
  {showClearButton && (
    <button type="button" className="btn btn-xs btn-ghost text-[var(--text-lo)] font-mono ml-auto" ...>
      {'× Clear'}
    </button>
  )}
</div>
```

Wrap behavior: `flex-wrap` lives on the inner tablist. When the chips need more horizontal space than the tablist's flex-share allows, they wrap inside the tablist. The clear button stays on the right edge via `ml-auto`. At a 240 px Submenu width with three chips + clear, the chips wrap onto two rows before the outer row breaks — confirmed against approved §8.

This avoids `display: contents` and its known a11y/SR bugs in older WebKit. The tablist remains a normal flex element; ARIA tooling treats it as expected.

---

## 4. Acceptance criteria → verification methods (TDD bar)

Every criterion has a concrete test. **No "write a test" placeholders.** Tests are written first (red), then implementation lands (green).

| AC (TRACK-L L10:351–357) | Verification |
|---|---|
| Submenu filter state is consumed by the thread list (closes "set but never read" bug) | **Vitest** `ThreadSections.filter.test.tsx`: render with `activeFilter="blocking"` and a fixture mixing blocking/async threads → assert only blocking rows render. Render with same threads + `activeFilter="all"` → assert all rows render. Render with `activeFilter="async"` → assert only async rows render. |
| Real filter axis is blocking vs non-blocking | **Vitest** same suite — predicate-level coverage proves the axis. **Type-level** — `ConversationsFilter = 'all' | 'blocking' | 'async'` (exhaustive switch in `predicateFor`); `bun run check` passes. |
| Empty filtered states show clear empty state with clear-filter affordance | **Vitest** `ThreadSections.filter-empty.test.tsx`: pass threads with no rows matching the chosen filter → assert `getByTestId('thread-sections-filter-empty')` renders with the chip-specific description copy AND a `getByRole('button', { name: 'Clear filter' })`. Click button → assert `onClearFilter` callback invoked. |
| Vitest covers: each filter narrows; clearing restores | **Vitest** `AppShell.l10-filter.test.tsx`: render `<AppShell>` at `/conversations/review` with stubbed `/api/threads` returning a mixed fixture. Click `Blocking` chip → assert only blocking thread titles in DOM. Click inline `× Clear` → assert all titles in DOM. Click `Async` chip → assert only async titles. Click `All` chip → assert all titles. |
| Inline `× Clear` mounts only when filter is non-default | **Vitest** `Submenu.clear-affordance.test.tsx`: render `Submenu` with `filters=[All,Blocking,Async]`, `activeFilter='all'` → assert `queryByTestId('submenu-filter-clear')` is null. Re-render with `activeFilter='blocking'` → assert clear button present. |
| Clear filter inside EmptyState resets to `all` | **Vitest** in `AppShell.l10-filter.test.tsx`: switch to `Blocking` while fixture has zero blocking threads → assert filter-empty state renders. Click `Clear filter` button → assert all rows return + `All` chip is `aria-selected`. |
| Total count badge derives from post-filter length | **Vitest** in `AppShell.l10-filter.test.tsx`: with mixed fixture (3 blocking, 5 async), assert title count `8` under `All`, `3` under `Blocking`, `5` under `Async`, `0` when filter narrows to empty. |
| Filter resets to `all` on view change | **Vitest** existing `AppShell.filter-reset.test.tsx` updated: replace clicks on `'Needs review'` (which no longer exists in Conversations) with clicks on `'Blocking'`. The AC and assertion path remain identical. |
| Chips inert during error state | **Vitest** `Submenu.disabled-chips.test.tsx`: render `Submenu` with `filtersDisabled={true}` → assert each chip has `aria-disabled="true"`; click chip → assert `onFilterChange` NOT invoked. |
| Selected-thread state independent of filter | **Vitest** `ThreadSections.filter.test.tsx`: with `selectedId='t-blocking-1'` and `activeFilter='async'` → assert no row carries `aria-current` (selected row is filtered out); assert no error/exception. |
| Knowledge filter set unchanged | **Vitest** existing `AppShell.knowledge-submenu.test.tsx`: still passes; assert `'Needs review'` chip still rendered on `/knowledge`. |
| Playwright e2e: filter narrows, clear restores | **Playwright** `tests/e2e/l10-conversations-filter.spec.ts`: open `/conversations/review` (with seeded threads — see §6). Click `Blocking` → assert only blocking thread titles. Click inline `× Clear` → assert restored. Click `Async` → assert async-only. Click `All` chip → assert restored. |
| Playwright e2e: filter-empty + recover | Same e2e file: navigate to a state where all threads are async. Click `Blocking` → assert `data-testid="thread-sections-filter-empty"` visible. Click `Clear filter` → assert restored. |
| Keyboard tab order across chip row (approved §7) | **Vitest** `Submenu.keyboard.test.tsx` (resolves adversary W5): render `Submenu` with `activeFilter='blocking'` and `onClearFilter` provided. `userEvent.tab()` sequence must visit `All` → `Blocking` → `Async` → `× Clear` button → first child of `children` slot. Each step asserts the active element by accessible name. |
| Touch target ≥ 44 CSS px (AQ-015) at viewport ≤ 1024 | **Vitest** `Submenu.touch-target.test.tsx` (resolves adversary W6): render Submenu under `data-density="comfortable"` (the auto-density the shell sets at ≤1024 — see AQ-016). Use `getBoundingClientRect()` on each chip + clear button → assert `height >= 44` and `width >= 44`. (jsdom does not lay out, so this test asserts via computed style: `lineHeight + paddingY * 2 >= 44`. If jsdom-side measurement is unreliable, escalate to the existing Playwright spec by adding a per-element bbox assertion.) |
| `bun run check` + `bun run lint` + `bun run test` all green | CI gate. Implementation step runs all three before declaring done. |
| Full e2e suite stays green | Run `bun run test:e2e` (or equivalent project script) — zero new flakes. |

**Coverage:** new code in `Submenu.tsx`, `ThreadSections.tsx`, `AppShell.tsx` reaches 100% via the suites above. `bun run test:coverage --filter web` should show no uncovered new lines.

---

## 5. Ordered task list (dependencies wired)

> Format: **Task N — title** (file). _Test-first: which test proves it._ — Depends on tasks: …

1. **T1 — Update `SubmenuFilter` union + drop deprecated chip ids** (`packages/web/src/shell/Submenu.tsx`).
   _Test:_ existing `Submenu.filters.test.tsx` passes against the new union (`'needs-review'` still valid for Knowledge tests). _Depends on:_ none.

2. **T2 — Replace `SUBMENU_FILTERS.conversations` with `[All, Blocking, Async]`** (`packages/web/src/layouts/AppShell.tsx:75-87`).
   _Test:_ `AppShell.l10-filter.test.tsx` (red) — assertion: `Blocking` and `Async` chips exist on `/conversations/review`. _Depends on:_ T1.

3. **T3 — Update `Submenu` to support `onClearFilter` + `filtersDisabled` + render inline `× Clear`** (`Submenu.tsx`).
   _Tests:_ `Submenu.clear-affordance.test.tsx` (mount/unmount logic) + `Submenu.disabled-chips.test.tsx` (aria-disabled). _Depends on:_ T1.

4. **T4 — Update `Submenu.stories.tsx`** to reflect new conversations chips + add a story showing inline `× Clear`. _Test:_ visual at `/designsystem` — at least three stories: default (All active, no Clear), filter active (Clear visible), disabled chips. _Depends on:_ T3.

5. **T5 — Add `ConversationsFilter` type + `predicateFor()` to `ThreadSections.tsx`**. Pure function, no JSX changes yet.
   _Test:_ unit test on `predicateFor` with synthetic `ThreadItem[]` — three filter ids, exhaustive coverage. _Depends on:_ none (parallel-safe with T1–T4).

6. **T6 — Wire predicate through `ThreadSections`**. Apply predicate before `groupThreadsForConversations`. Add filter-empty `EmptyState` branch with chip-specific copy and `Clear filter` button slotted into `EmptyState.action`.
   _Tests:_ `ThreadSections.filter.test.tsx` (filter narrows correctly, selected thread filtered out is silent) + `ThreadSections.filter-empty.test.tsx` (filter-empty EmptyState renders). _Depends on:_ T5.

7. **T7 — Pass `activeFilter` + `onClearFilter` from `AppShell` to `ThreadSections`** + pass `onClearFilter` + `filtersDisabled` to `Submenu`.
   _Test:_ `AppShell.l10-filter.test.tsx` happy paths (chip click → list narrows → clear restores). _Depends on:_ T2, T3, T6.

8. **T8 — Recompute `submenuTotalCount` from post-filter length** in `AppShell.tsx:389-396` using the **same** `predicateFor` exported from `ThreadSections.tsx`. Single function definition, called from two sites — no risk of drift (resolves adversary W2). Add an `@lore` note documenting that the count is intentionally post-filter (resolves adversary W4 — the L8 contract for the badge changes from "total threads" to "post-filter threads"; this is approved.md §6's explicit decision).
   _Test:_ `AppShell.l10-filter.test.tsx` count assertion (count under each filter id). _Depends on:_ T7.

9. **T9 — Update `AppShell.filter-reset.test.tsx`** to click `'Blocking'` instead of `'Needs review'`. The AC the test proves is unchanged — only the chip vocabulary inside the test changes.
   _Test:_ green run after the chip swap. _Depends on:_ T2.

10. **T10 — Wire `filtersDisabled` to `status === 'error'`** in AppShell (pass `conversationsThreads.status === 'error'` as `filtersDisabled` to `Submenu`). **Source: approved design §5.5 — deliberate promotion from design input contract (resolves adversary W3, which correctly flagged this is not in TRACK-L L10:351–357 but IS in approved.md §5.5). Approved design is the binding input to /architecture; T10 stays.**
    _Test:_ extension of `AppShell.l10-filter.test.tsx` — stub fetch to return 500; assert chips `aria-disabled="true"`; assert clicking chip does not change list. _Depends on:_ T7.

11. **T11 — Playwright e2e** (`packages/web/tests/e2e/l10-conversations-filter.spec.ts`).
    Two prerequisite micro-tasks land first (resolves adversary C1; replaces the original Option A server-schema change):
    - **T11a — Web-only fixture support.** Update `isThreadListRow` in `useConversationsThreads.ts` to accept an optional `blocking?: boolean` field. Change line 108 to `blocking: typeof row.blocking === "boolean" ? row.blocking : false`. **No server change.** Vitest assertion in `useConversationsThreads.test.tsx`: when fetch returns a row with `blocking: true`, the resulting `ThreadItem` carries `blocking: true`; when omitted, it carries `false` (existing behavior preserved).
    - **T11b — Playwright spec** uses `page.route('**/api/threads*', …)` to inject a fixture with `blocking: true | false` per row. Same fixture also drives the `AppShell.l10-filter.test.tsx` Vitest by stubbing `global.fetch` (resolves adversary W1).
    _Test:_ the spec itself — covers the AC for "click filter → list narrows → clear → list restored" and "filter-empty → Clear filter button". Uses fixture data via the existing dev seed or a test-only fetch interceptor. _Depends on:_ T7, T8.

12. **T12 — Run gates**: `bun run check` + `bun run lint` + `bun run test` + `bun run test:e2e`. Fix until green. _Depends on:_ all above.

13. **T13 — Visual verification**: Playwright screenshots of (default), (Blocking active + populated), (Async active + populated), (Blocking active + filter-empty), (error chips disabled). Compare against approved.md visual contract. Fail if any AI-aesthetic tell appears (rounded-2xl, oversized padding, etc.). _Depends on:_ T7, T8, T10.

---

## 6. Playwright fixture for `blocking=true` rows (resolves §1 Q10)

`useConversationsThreads.ts:108` hardcodes `blocking: false`. The Playwright test cannot drive `blocking=true` rows from the live hook today.

**Decision (post-adversary revision): web-only path. NO server change.**

1. Extend the **client** `isThreadListRow` guard (web only) to accept an optional `blocking?: boolean` field on the wire row. Today's payload does not include it; tomorrow's might. The guard accepts it as backwards-compatible.
2. Change one line in the hook: `blocking: typeof row.blocking === "boolean" ? row.blocking : false,` (was `blocking: false,` at line 108). When the server doesn't send `blocking`, behavior is unchanged. When tests inject `blocking: true`, the hook reflects it.
3. Playwright spec uses `page.route('**/api/threads*', …)` to intercept and respond with a fixture that includes `blocking: true` on the rows that should be blocking and `blocking: false` (or omitted) on the others.

**No `packages/server` change.** The `threadListRowSchema` is untouched; the server already does not emit `blocking` and won't until the agent-runtime plumbing for true blocking lands in a later story. The wire becomes server-additive-compatible: a future server emit of `blocking` is now consumed automatically by the client. This is the minimum surface needed to verify the AC end-to-end and is strictly inside the web package.

Implementation order: T11a (web guard + hook), T11b (Playwright spec with `page.route()` fixture).

Note: adversary's C1 flagged the original Option A as scope creep into `packages/server`. That concern is resolved — only the client guard + one hook line change. The plan's promise of "all work in the web package" (§2) is preserved.

---

## 7. Design-it-twice (non-trivial sub-decisions)

### 7.1 Predicate location: AppShell pre-filter vs ThreadSections internal

**Alt A — pre-filter in AppShell:** `AppShell` runs `threads.filter(predicate)` and passes only the narrowed array to `ThreadSections`. Trade-off: simpler `ThreadSections` API. Reason to reject: `submenuTotalCount` would need to compute the filtered length separately (or duplicate the predicate), and any future consumer wanting both raw + filtered counts would re-filter. Two derivations of "the filtered length" is a recipe for off-by-one bugs.

**Alt B — predicate inside ThreadSections (chosen):** `AppShell` passes raw `threads[]` + `activeFilter` to `ThreadSections`. Component filters before grouping. AppShell computes total via the same predicate (small import + reuse of `predicateFor`). Trade-off: `ThreadSections` learns about `ConversationsFilter`. Reason to accept: single source of truth for the filtered set; the count and the rendered list cannot drift.

**Synthesis:** Alt B with the predicate exported from `ThreadSections.tsx` so `AppShell` reuses it for the count badge.

### 7.2 `SubmenuFilter` union: one wide union vs per-view typed unions

**Alt A — per-view typed unions:** `ConversationsFilter` and `KnowledgeFilter` as distinct unions; `Submenu` becomes generic `<F extends string>(filters: F[], ...)`. Trade-off: stronger compile-time safety. Reason to reject: `Submenu` is a region-level shell; making it generic in F propagates a type parameter through `SubmenuProps` → AppShell call sites → JSX and complicates the JSX type inference. Cost outweighs benefit at this scale (3 chips per view).

**Alt B — one wide union (chosen):** `SubmenuFilter = 'all' | 'blocking' | 'async' | 'needs-review'`. Trade-off: a Knowledge view could pass an "async" chip and TypeScript wouldn't catch it at the prop boundary. Reason to accept: in practice, the per-view filter list IS the runtime constraint, and the test for each view enumerates its chip ids. The runtime predicate (`ConversationsFilter`) is narrow where it matters (inside `ThreadSections`).

**Synthesis:** Alt B at the `Submenu` boundary; Alt A's narrowing applied at the `ThreadSections` boundary (`ConversationsFilter` is a strict subset of `SubmenuFilter`). Both bounds typecheck.

---

## 8. Risks and ambiguities

| Risk | Severity | Mitigation |
|---|---|---|
| Tablist + clear-button layout drift (chips wrap unexpectedly under comfortable density) | Low | §3.7's plain nested flex (no `display: contents`) — the inner tablist owns `flex-wrap`; clear button sits as outer-row sibling with `ml-auto`. Test assertion: `getByRole('tablist')` returns exactly the chip container with 3 tabs. |
| Hook line `blocking: false` makes the e2e meaningless without §6 fixture support | Med | §6 prescribes a web-only minimum: `isThreadListRow` accepts optional `blocking?: boolean` + hook trusts it. No server change. |
| Existing `AppShell.filter-reset.test.tsx` will break the moment T2 lands without T9 | Low | T9 is in the same logical commit as T2 per the implementation plan; test order is enforced by `bun run test`. |
| Selected-thread filtered out: user might lose context | Low | Approved §4 — Main pane keeps showing the thread; Submenu just hides the row. Documented. |
| `× Clear` text glyph (`×`) renders inconsistently across system fonts | Low | Visually verified at T13. Approved §3 explicitly chose unicode over emoji/SVG. Falls back gracefully — even if the glyph is replaced by the OS, the word "Clear" carries the meaning. |
| Comfortable density tier widens chip touch targets — three chips + clear button overflow at 240 px Submenu width | Low | Approved §8 — `flex-wrap` already in place. Wrap onto two rows is acceptable. T13 visual check confirms. |

---

## 9. Route checklist

L10 affects **one route**: `/conversations/review`. No other route mounts the Conversations submenu. The chip vocabulary is local to that view.

| Route | Conversations submenu mounted? | Chips? | L10 verification |
|---|---|---|---|
| `/conversations/review` | yes | `[All, Blocking, Async]` | T11 e2e + T7 vitest |
| `/work/portfolio`, `/work/team` | no (Work submenu) | none | T9 still asserts `tablist` absent on Work |
| `/knowledge`, `/knowledge/:id` | no (Knowledge submenu) | `[All, Needs review]` (unchanged) | existing `AppShell.knowledge-submenu.test.tsx` continues to pass |

---

## 10. Security & abuse cases

| Vector | Applicable? | Disposition |
|---|---|---|
| Rate limit on POST/PATCH | N/A | L10 is read-only frontend wiring. No new POST/PATCH. |
| Input-trust boundary for agent-authored fields | N/A | The filter chip ids are a closed client-side enum. The `blocking` field comes from the server and is a typed boolean — already validated by `isThreadListRow` (web) and (after §6 Option A) `threadListRowSchema` (server). |
| Secret handling | N/A | No new credentials. |
| Path-traversal | N/A | No new path inputs. |
| SSRF | N/A | No new outbound URLs. |
| URL-injection via `?filter=` | N/A | The architect chose `useState` (not URL-backed) for L10. If a future story moves the filter into the URL, sanitize against the closed `ConversationsFilter` enum (similar pattern to `currentScope` in `AppShell.tsx:421-424`). Documented for the followup. |
| DOM injection via `× Clear` markup | N/A | The `×` glyph is a string literal, not user input. |
| XSS via `EmptyState.description` | N/A | Description copy is static, hardcoded per filter id. |

**Net: every category considered, all N/A or addressed.** No new attack surface.

---

## 11. Protected tests

Tests whose assertions must NOT change during L10 implementation. DoD audits via `git diff --name-only` against this list:

```
protectedTests:
  - packages/web/src/__tests__/AppShell.knowledge-submenu.test.tsx
  - packages/web/src/components/__tests__/ThreadSections.conversations.test.tsx
  - packages/web/src/hooks/__tests__/useConversationsThreads.test.tsx
  - packages/web/src/__tests__/Submenu.test.tsx
  - packages/web/src/__tests__/Submenu.filters.test.tsx
```

**Verified (post-adversary C3) by reading each file:**
- `Submenu.filters.test.tsx` uses `'needs-review'` only — that id remains in the new `SubmenuFilter` union. No collision with the dropped `'chats'` / `'resolved'` ids. **Safe to keep protected.**
- `ThreadSections.conversations.test.tsx` uses string IDs `'blocking' / 'active' / 'resolved'` only as section IDs (`ConversationsSectionId`), a different namespace from filter IDs. **Safe to keep protected.**
- `Submenu.test.tsx` has no chip-id literals. **Safe.**
- `useConversationsThreads.test.tsx` will gain a NEW assertion in T11a (the optional `blocking` field is preserved when present). The existing assertions are untouched. The file is not on the strict "no-modify" list — it grows by one assertion. We re-classify it: **protected against assertion deletion or modification, but additive new assertions are allowed and expected** (T11a).
- `AppShell.knowledge-submenu.test.tsx` does not touch the conversations submenu. **Safe.**

`AppShell.filter-reset.test.tsx` is **explicitly NOT protected** — T9 modifies its chip-click target (`Needs review` → `Blocking`). The assertion semantics (filter resets on view change) stay identical; only the chip name changes.

The L8 protected tests stay protected: the visual contract for the three sections (Blocking / Active / Resolved · 24h) is preserved, and L10's filter applies before sectioning — never replaces it.

---

## 12. Rollback plan

The change is a single feature flag's worth of risk: the chip vocabulary swap + a prop addition. To roll back:

1. Revert `SubmenuFilter` union to its prior shape.
2. Revert `SUBMENU_FILTERS.conversations` to the prior `[all, needs-review, chats, resolved]` array (restoring the original "set but never read" inert state).
3. Drop the `activeFilter` prop wiring in `AppShell` → `ThreadSections`.
4. Restore `AppShell.filter-reset.test.tsx` to its prior chip name.

No DB rollback. No server rollback (the optional `blocking` field added in §6 Option A is backwards-compatible and unused if the hook reverts).

---

## 13. Definition of done (machine-checkable)

- [ ] `bun run check` — zero TypeScript errors.
- [ ] `bun run lint` — zero Biome / ESLint errors. AQ-005 (mobile input ≥ 16 px) passes; AQ-101 (no `rounded-2xl`) passes; AQ-105 (no emoji on buttons) passes.
- [ ] `bun run test` — all suites green; new suites listed in §4 are green.
- [ ] `bun run test:e2e` — Playwright spec `l10-conversations-filter.spec.ts` green; full suite no new flakes.
- [ ] 100% line coverage on the three modified files (`Submenu.tsx`, `ThreadSections.tsx`, `AppShell.tsx`) for the lines added/changed by L10.
- [ ] T13 screenshots inspected against approved.md §1, §2, §5 — every state has a screenshot, every screenshot looks right.
- [ ] L10 design-critique score ≥ 7 (run `/design-critique` against the modified Submenu + ThreadSections).
- [ ] Protected tests under §11 unchanged on disk (`git diff --name-only`).

---

## 14. Open follow-ups (NOT in L10 scope)

1. **URL-backed filter state** for deep-linking from notifications. Decided as deferred (Approved §12 Q1).
2. **True `blocking` derivation** from agent session state. Hook line `blocking: false` becomes meaningful when the agent-runtime plumbing lands. Server `threadListRowSchema.blocking` is the contract. Logged in `docs/work-packages/follow-ups.md`.
3. **Knowledge `needs-review` chip activation** — currently inert; not L10's scope.
4. **Keyboard verb shortcuts** (`b`, `a`) — explicitly rejected by founder; keep deferred.
