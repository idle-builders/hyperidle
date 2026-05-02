# L10 — Adversary Review

Branch: `feat/L10-conversations-filter`
Diff base: `main..HEAD`
Story: TRACK-L L10 (lines 345–371)
Plan: `docs/work-packages/L10-plan.md`

Stance: brutally skeptical, read-only. Verifies that the W1–W6 / C1–C3 fixes actually landed and finds new defects.

---

## Summary by severity

| Severity | Count |
|---|---:|
| CRITICAL | 0 |
| HIGH | 2 |
| MEDIUM | 5 |
| LOW | 4 |
| NIT | 3 |
| **TOTAL** | **14** |

Verdict: **REVISE** — none of the issues are blockers, but H1/H2 are real spec-vs-code drift that will surprise users or future agents and should be fixed before merge.

W1–W6 / C1–C3 traceability (claim from plan): all resolved. Verified below — six of nine genuinely landed; three are partially landed or papered over (M1, M2, M5).

---

## HIGH

### H1 — Filter chip's `aria-disabled` swallows keyboard activation but `pointer-events-none` is set on the OUTER wrapper, not the chip itself
**File:** `packages/web/src/shell/Submenu.tsx:142, 152, 158-161`

The outer wrapper carries `pointer-events-none` (`disabledClass` applied at line 142). That blocks mouse clicks for everything inside. But the per-chip `onClick` handler still has its own runtime guard:

```tsx
onClick={() => { if (filtersDisabled) return; onFilterChange?.(f.id); }}
```

Two issues:
1. Defense in depth is fine, but the `aria-disabled` chip is still in the **tab order** (it's a `<button>` with no `tabindex={-1}` and no `disabled` attribute). A keyboard user tabs to it, presses Enter — the synthetic click fires, hit-tests through the wrapper… and `pointer-events-none` does NOT block synthetic/keyboard-originated clicks reliably across browsers. The runtime `if (filtersDisabled) return;` is therefore the ONLY guard for keyboard users.
2. There is no test that exercises **keyboard activation** (Enter/Space) on a disabled chip. `Submenu.disabled-chips.test.tsx:60` only uses `user.click()`. The keyboard path is unverified.

**Impact:** A keyboard-only user in the error state can press Enter on a "disabled" chip and… well, the runtime guard catches it today, but the test does not prove it. If someone refactors the guard out (it looks redundant given pointer-events-none), keyboard users get a regression with no failing test.

**Fix:** Add a Vitest assertion in `Submenu.disabled-chips.test.tsx` that focuses the chip and presses `{Enter}` and `{ }` (Space), asserting `onFilterChange` is NOT called. Optionally also add `tabIndex={-1}` when `filtersDisabled` so the chip leaves the tab order entirely (matches the WAI-ARIA Authoring Practices for disabled tabs).

---

### H2 — Count badge ALWAYS renders `0` under a non-default filter, even on `loading` and `error` states — leaks fake "0 results" UI
**File:** `packages/web/src/layouts/AppShell.tsx:490-500, 399-411`

```tsx
count={
  activeView === "conversations" && conversationsFilter !== "all"
    ? submenuTotalCount                    // shows 0 even when status === 'loading' / 'error'
    : submenuTotalCount > 0
      ? submenuTotalCount
      : undefined
}
```

`conversationsThreads.threads` is `[]` while `status === 'loading'` and stays `[]` on `error`. Combined with a non-`all` filter, the badge displays `0`. So during the initial fetch on `/conversations/review` if a user lands with the filter pre-set to `'blocking'` (today this is impossible because the filter resets to `'all'` on view change, but it WILL be possible the moment URL persistence ships per follow-up §14.1), the user briefly sees a `0` badge during loading and a permanent `0` on error — instead of "—" or hidden.

The plan §1 Q9 explicitly chose "post-filter length, show 0 when narrowed". That's fine for `ready`. It's wrong for `loading` and `error` — both states should hide the badge (loading = unknown, error = invalid).

**Impact:** Misleading numeric chrome. Counts are precision-instrument signals in this design system; emitting `0` when the source is broken is exactly the kind of "controls that lie" failure L10 was created to fix.

**Fix:** Hide the badge unless `conversationsThreads.status === 'ready'`. One condition extension at line 495.

---

## MEDIUM

### M1 — W1 only "partially" resolved: AppShell test stubs `global.fetch` but does NOT mock the `AbortController` race or the SettingsPanel/ThemeProvider side effects
**File:** `packages/web/src/__tests__/AppShell.l10-filter.test.tsx:90-103`

The fix for W1 was to stub fetch from inside the AppShell vitest. That landed. But:
- `vi.restoreAllMocks()` runs in `beforeEach` AND `afterEach`, but `global.fetch` is set by direct assignment (`global.fetch = vi.fn(...)`) — `vi.restoreAllMocks` does NOT restore direct globals. There is no teardown of `global.fetch`. Tests that run after this file in the same worker will see the last assigned mock.
- `useTheme()` is invoked by `AppShell` and reads `localStorage`. The test does not stub localStorage. Cross-test leakage possible.

**Impact:** Test isolation hole. CI may pass; local re-runs in different orders may not.

**Fix:** In `afterEach`, `delete (global as Record<string, unknown>).fetch;` or use `vi.stubGlobal('fetch', ...)` + `vi.unstubAllGlobals()`.

---

### M2 — W6 ("touch-target") is verified ONLY in Playwright, not in Vitest as the plan §4 row claims
**File:** plan `docs/work-packages/L10-plan.md:208`, e2e `packages/web/e2e/l10-conversations-filter.spec.ts:123-158`

Plan promises `Submenu.touch-target.test.tsx` (Vitest, computed-style fallback). That file does not exist — only the Playwright bbox check. Acceptable trade-off (jsdom can't lay out), but **the plan lies about its own test surface**. If a future contributor reads the plan and looks for the unit test, they'll be confused. Either drop the row from the plan or add the (admittedly weak) computed-style test.

**Impact:** Plan/code drift. Not a runtime bug.

**Fix:** Remove the `Submenu.touch-target.test.tsx` reference from plan §4 OR add the file with the documented computed-style assertion.

---

### M3 — `predicateFor('async')` requires `t.blocking === false` but `useConversationsThreads` only ever sets it to `false` at line 121
**File:** `packages/web/src/components/ThreadSections.tsx:54-55`, `packages/web/src/hooks/useConversationsThreads.ts:121`

The hook's mapping is `blocking: typeof row.blocking === "boolean" ? row.blocking : false`. The server **never emits `blocking`** today. Therefore in production:
- `'all'` filter → all rows.
- `'blocking'` filter → ALWAYS empty → the user always lands in the filter-empty EmptyState.
- `'async'` filter → all rows.

The "Blocking" chip is shipped as **non-functional** in production until a future story wires real blocking derivation. The L10 plan §1 Q10 acknowledges this and says the predicate is correct, the data is the limitation. Founder-OK, but:
- There is no in-app indication (no "coming soon" hint, no chip-level affordance) that the Blocking chip is intentionally inert against current data.
- The Playwright e2e seeds a fixture that bypasses the issue entirely. In production, the AC "click filter → list narrows" demonstrably FAILS for the `'blocking'` chip — every click takes the user to the filter-empty state.

**Impact:** Ships a chip that is intentionally a no-op against real data. The Validation Before Implementation rule asks for proof against actual output — this proof is fixture-only, not real-output.

**Fix:** Either (a) gate the `Blocking` chip behind a feature flag / hide it until the data plumbing lands, or (b) update the hook to derive `blocking` from a server signal that exists today (e.g. `hasUnresolvedReview && !resolvedAt`), or (c) document this in the UI with a tooltip/hint. Choice is product call; flagging it is the adversary's job.

---

### M4 — Filter-empty EmptyState renders the action button only when `onClearFilter` is provided, but plan §3.6 says it's always rendered
**File:** `packages/web/src/components/ThreadSections.tsx:218-235`

```tsx
action={onClearFilter ? <button .../> : undefined}
```

If a future caller forgets to wire `onClearFilter`, the user gets a dead-end: filter-empty state with no escape. The component should at minimum render a disabled affordance OR throw a dev-time assertion. The current "silently render no button" path is the worst of both worlds.

**Impact:** Latent footgun. AppShell wires it correctly today (line 536), so unobservable in production now. But this is exactly the kind of "looks fine until it doesn't" coupling that bites later.

**Fix:** Make `onClearFilter` required in `ThreadSectionsProps` when `activeFilter !== 'all'` (TypeScript can express this with a discriminated union), OR render a disabled "Clear filter" hint when omitted, OR throw in dev mode.

---

### M5 — C2 said "no `display: contents`", but the chosen layout has the inner tablist + clear button in a row with `gap-1` and the clear button uses `ml-auto` — at narrow widths the chips wrap inside the inner div but the clear button DOES NOT wrap with them
**File:** `packages/web/src/shell/Submenu.tsx:142-183`

The outer row is `flex items-center gap-1`. Inside: a `flex flex-wrap gap-1` tablist, then a sibling clear button with `ml-auto`. Plan §3.7 claims "the chips wrap onto two rows before the outer row breaks" at 240 px. That's true for the inner tablist (it has `flex-wrap`). The clear button — sibling of the tablist on the outer row that does NOT have `flex-wrap` — will be pushed off-axis or overlap when the tablist's wrapped second row consumes vertical space.

There is **no test** for the wrap behavior at the 240 px Submenu width. The Playwright touch-target test runs at 1024 px viewport (line 129), where the Submenu is comfortable but never tight on horizontal space. The 240 px collapsed/comfortable state is unverified.

**Impact:** Visual regression risk. Will manifest as "Clear filter" appearing overlapping the chip row at small densities. Low likelihood today (default density is comfortable at 1024, and chip labels are short), but the assumption is untested.

**Fix:** Add `flex-wrap` to the outer row OR add a Playwright visual snapshot at the 240 px width with the comfortable density tier.

---

## LOW

### L1 — Type assertions on test fetch mocks bypass strict typing
**Files:** `packages/web/src/__tests__/AppShell.l10-filter.test.tsx:91-94, 231-235`, `packages/web/src/__tests__/AppShell.filter-reset.test.tsx:10-13`

```ts
global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ ... }) })) as unknown as typeof fetch;
```

Per `.claude/rules/typescript.md`: "no unsafe `as` casts". This is a `as unknown as` double-cast. Five occurrences across test files. They're test helpers, but the rule does not exempt tests.

**Fix:** Define a small `MockResponse` type that satisfies the fetch contract, OR factor a `mockFetchOk(rows)` helper into a shared test utility that does the cast in exactly one place.

---

### L2 — `MockListRow` interface is duplicated across three files
**Files:** `AppShell.l10-filter.test.tsx:26-39`, `e2e/l10-conversations-filter.spec.ts:17-29`, `useConversationsThreads.test.tsx:12-25`

Same shape, same fields, same default function `mkRow`/`row`. Three copies. When the wire schema grows a field, all three drift independently.

**Fix:** Promote to `packages/web/src/__tests__/fixtures/thread-list-row.ts` (or similar) and import.

---

### L3 — Filter-empty branching is order-dependent and fragile
**File:** `packages/web/src/components/ThreadSections.tsx:208-217`

```ts
const filtered = activeFilter === "all" ? threads : threads.filter(predicateFor(activeFilter));
if (threads.length === 0 && activeFilter === "all") { return <EmptyState ... />; }
if (filtered.length === 0 && activeFilter !== "all") { return <EmptyState filter-empty ... />; }
```

What about `activeFilter === 'all'` + `threads.length > 0` + `filtered.length === 0`? Impossible by predicate, but the code does not enforce that invariant — if `predicateFor('all')` is ever changed to filter anything, the empty-list branch becomes silently unreachable and we render an empty `<div data-testid="thread-sections">` with no rows and no message. There's no test for this defensive branch.

**Fix:** Replace with a single `switch` on the resulting `(filtered.length, activeFilter)` tuple, or add a final `filtered.length === 0` fallback EmptyState that renders no matter what `activeFilter` is.

---

### L4 — `useExhaustiveDependencies` biome-ignore on the filter-reset effect uses `void activeView` instead of fixing the dep array
**File:** `packages/web/src/layouts/AppShell.tsx:429-432`

```ts
useEffect(() => {
  void activeView;
  setSubmenuFilter("all");
}, [activeView]);
```

The `void activeView;` is a workaround to silence the lint without using the value. Cleaner and more honest: `useEffect(() => { setSubmenuFilter("all"); }, [activeView]);` — Biome's `useExhaustiveDependencies` is satisfied by the dep array alone; the body need not reference `activeView`. The `void` line is dead code that signals "I had to argue with the linter" without explaining why.

**Fix:** Remove the `void activeView;` line. The dep array IS the signal.

---

## NITS

### N1 — `× Clear` glyph is a string literal but the chip uses curly braces `{'× Clear'}` in the plan and bare `× Clear` in the code
**File:** `packages/web/src/shell/Submenu.tsx:180` vs plan §3.7 line 158

Cosmetic plan/code drift. Both render identically. Drop one form for consistency.

---

### N2 — `FILTER_EMPTY_COPY` exists but the `title` field was dropped from the plan's spec
**File:** `packages/web/src/components/ThreadSections.tsx:59-62`, plan §3.6 lines 132-143

Plan specified `{ title, description }`; implementation only stores `description` and uses a literal title `"No threads match this filter"` for both filters. Equivalent outcome, but the plan lies. Either match the plan or update the plan post-hoc.

---

### N3 — `data-thread-section` attribute selectors leak into test infrastructure
**File:** `packages/web/src/components/__tests__/ThreadSections.filter.test.tsx:97-98, 108`

Tests use `container.querySelector("[data-thread-section='active']")` instead of `screen.queryByRole`. Coupling test to internal data attribute. Fine as long as the attribute is intentional public test API. Worth marking with a `data-testid-` prefix for greppability.

---

## W1–W6 / C1–C3 traceability check

| ID | Resolution claimed in plan | Verified |
|---|---|---|
| W1 — AppShell test must stub fetch | landed (`AppShell.l10-filter.test.tsx:90-103`) | partial — see M1 (no teardown) |
| W2 — Count badge must use the same predicate as the list | landed (AppShell.tsx:408 reuses `predicateFor`) | yes |
| W3 — `filtersDisabled` driven by `status === 'error'` | landed (AppShell.tsx:418) | yes |
| W4 — `@lore` note that count is post-filter | landed (AppShell.tsx:402-406) | yes |
| W5 — Keyboard tab order test | landed (`Submenu.keyboard.test.tsx`) | yes — but M1 / H1 highlight a sibling gap (no Enter/Space test on disabled chip) |
| W6 — Touch-target ≥ 44 px verification | landed only in Playwright | partial — see M2 |
| C1 — No server schema change; web-only `blocking?: boolean` | landed (`useConversationsThreads.ts:35, 82, 121`) | yes |
| C2 — No `display: contents` for the tablist+clear layout | landed (Submenu.tsx:142-183) | yes — but M5 highlights the wrap-edge case |
| C3 — Protected tests untouched | verified — `Submenu.filters.test.tsx`, `Submenu.test.tsx`, `ThreadSections.conversations.test.tsx`, `AppShell.knowledge-submenu.test.tsx` not in diff; `useConversationsThreads.test.tsx` only grew (additive — allowed per plan §11) | yes |

---

## Spec compliance against TRACK-L L10:351–357

| AC | Status |
|---|---|
| Submenu filter state IS consumed | yes (AppShell.tsx:535 passes `activeFilter` to `ThreadSections`) |
| Real axis = blocking vs non-blocking | yes (predicateFor) — but see M3: "Blocking" chip is a no-op against production data today |
| Empty filtered states show clear empty state with clear-filter affordance | yes — see M4 caveat |
| Vitest covers each filter narrows + clearing restores | yes |
| Playwright e2e: filter narrows + clear restores | yes |
| `bun run check` + lint + test green | not run in this review (read-only stance); CI must verify |

---

## Verdict

**REVISE.** Ship-blocking? No. But H1 (no keyboard activation test on disabled chips), H2 (badge shows `0` during loading/error), M3 (Blocking chip ships inert against real data), and M5 (untested wrap behavior) are real and addressable cheaply. Fix H1, H2, M5; explicitly accept or address M3 with founder buy-in; sweep the LOWs as cleanup.

---

## Status / Resolution (apply-review pass)

| Finding | Status | Notes |
|---|---|---|
| H1 — disabled-chip Enter/Space test missing | Fixed | Added three additive assertions in `Submenu.disabled-chips.test.tsx` covering Enter/Space on focused disabled chip and clear button. Runtime onClick guard kept (pointer-events-none does not block keyboard). |
| H2 — count badge under loading/error | Fixed | `submenuBadgeCount` extracted in `AppShell.tsx`; returns `undefined` unless `conversationsThreads.status === 'ready'`. New tests in `AppShell.l10-filter.test.tsx`. |
| M1, M2, M4 | Won't-fix this pass | Not in MUST/SHOULD list. |
| M3 — Blocking chip inert against prod data | Won't-fix | Out of L10 scope per plan §1 Q10 + follow-ups #2. |
| M5 — Playwright 240 px wrap assertion | Deferred | Logged to follow-ups; keyboard-tested at unit level. |
| L1–L4, NIT-* | Won't-fix this pass | Judgment calls. |
