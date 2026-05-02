# L10 Slop Scan

Scope: `git diff main..HEAD` on `feat/L10-conversations-filter`. Read-only scan for AI-specific anti-patterns (verbose naming, restating comments, over-abstraction, defensive over-engineering, unnecessary async, filler, AI tell-tales).

Findings are listed by severity. Severity is "how loud the slop is" — none of these are correctness bugs (correctness is the adversary/architecture review's job).

---

## HIGH

### H1. Comment restates the code (over-explained intent)
- **File:** `packages/web/src/components/ThreadSections.tsx`
- **Lines:** 35–40 (`ConversationsFilter` JSDoc), 42–47 (`predicateFor` JSDoc), 159–162 (`activeFilter` prop JSDoc), 163–166 (`onClearFilter` prop JSDoc), 203–206 (filter-before-empty comment), 217–223 (Active-filter comment).
- **Issue:** Every new addition carries a 2–4 line JSDoc that restates the type signature and cites `L10 §3.x`. Examples: `"closed vocabulary for Conversations filter chips"` over a 3-member union, `"single source of truth for the filter predicate"` over a 6-line switch. The code is self-evident.
- **Fix:** Keep one short module-level note explaining the contract once. Drop the per-symbol L10-section citations — they will rot the instant the plan is renamed.

### H2. Comment restates the code in the hook
- **File:** `packages/web/src/hooks/useConversationsThreads.ts`
- **Lines:** 27–35 (`blocking?: boolean` JSDoc), 80–81 (`// L10 T11a: blocking is an optional additive — accept undefined OR a boolean.`), 117–120 (rowToItem comment).
- **Issue:** A 9-line JSDoc on an optional boolean field, plus a redundant comment that paraphrases `(v.blocking === undefined || typeof v.blocking === "boolean")`. Then a third comment on the assignment line that says the same thing again.
- **Fix:** One `@lore` on the field is enough. Delete the inline restatements.

### H3. AppShell badge ternary chain is unnecessarily clever
- **File:** `packages/web/src/layouts/AppShell.tsx`
- **Lines:** 489–500 (`count={ ... ? submenuTotalCount : submenuTotalCount > 0 ? submenuTotalCount : undefined }`)
- **Issue:** Nested ternary with a 6-line comment explaining why. The expression collapses to: `const count = (activeView === "conversations" && conversationsFilter !== "all") || submenuTotalCount > 0 ? submenuTotalCount : undefined;` — or pull it into a named local above the JSX. The current shape is a poster child for "logic hidden in JSX props."
- **Fix:** Extract a named variable (`badgeCount`) computed in the body, drop the comment, let the variable name carry the meaning.

### H4. Defensive narrowing for an impossible case
- **File:** `packages/web/src/layouts/AppShell.tsx`
- **Lines:** 391–398 (`conversationsFilter: ConversationsFilter = submenuFilter === "blocking" || submenuFilter === "async" ? submenuFilter : "all"`)
- **Issue:** The accompanying comment says: *"that case can't actually occur because the filter is reset to `'all'` on view change, but the narrowing makes the downstream prop type-safe."* This is the textbook AI-tell: defensive code for an invariant the author has just proved cannot fire. Either model the type so the impossible state is unrepresentable (e.g. per-view filter state instead of one shared `SubmenuFilter` union), or `assertNever` in the else branch — silently coercing to `'all'` swallows future bugs.
- **Fix:** Split the filter state per-view, OR drop the soft fallback and use `satisfies`/exhaustive switch. Don't both narrow AND comment that the narrowing is theatre.

---

## MEDIUM

### M1. `predicateFor("all")` constructs a throwaway closure on every render
- **File:** `packages/web/src/components/ThreadSections.tsx`, lines 48–57 (definition); `packages/web/src/layouts/AppShell.tsx`, lines 401 (callsite in `useMemo`).
- **Issue:** Returning `() => true` per call is fine functionally but the `'all'` branch in `ThreadSections` already short-circuits via `activeFilter === "all" ? threads : ...`. The `'all'` arm of the switch is dead code at the only callsite that matters; AppShell's `useMemo` calls `.filter(predicateFor("all"))` which is a wasted O(n) pass.
- **Fix:** Either short-circuit `'all'` in AppShell too (mirror ThreadSections), or drop the short-circuit in ThreadSections and live with the no-op filter. Pick one — having both is the slop.

### M2. `FILTER_EMPTY_COPY` is a one-field record masquerading as a table
- **File:** `packages/web/src/components/ThreadSections.tsx`, lines 60–63.
- **Issue:** `Record<..., { description: string }>` for two entries with one field each. The wrapping object adds zero structure — it's two strings keyed by filter id. If a second field ever lands, promote it then.
- **Fix:** `Record<Exclude<ConversationsFilter, "all">, string>` or two `const`s.

### M3. Inline `EmptyState` action button duplicates the `Submenu` clear button
- **File:** `packages/web/src/components/ThreadSections.tsx`, lines 232–241.
- **Issue:** The filter-empty `EmptyState` renders its own `<button … aria-label="Clear filter">Clear filter</button>` inline; `Submenu.tsx` already has an identical handler-driven clear affordance. Two clear buttons, two `aria-label`s, two click paths invoking the same `handleClearFilter`. Future copy/style drift is guaranteed.
- **Fix:** Either reuse a small `ClearFilterButton` primitive, or have ThreadSections not render its own button (since `Submenu`'s `× Clear` is always visible when `activeFilter !== 'all'` anyway). At minimum, don't duplicate the label string.

### M4. `disabledClass = filtersDisabled ? "opacity-50 pointer-events-none" : ""` mixes a11y signal with UI state in a string
- **File:** `packages/web/src/shell/Submenu.tsx`, lines 75–78.
- **Issue:** Comment claims pointer-events-none "also prevents click handlers from firing" — and yet each button still defends with `if (filtersDisabled) return;` inside the onClick. Belt-and-suspenders for a state that just gates the prop in AppShell.
- **Fix:** Drop the `if (filtersDisabled) return;` in the button onClick handlers — `pointer-events-none` already prevents the click. Or drop `pointer-events-none` and trust the JS guard. Keeping both is paranoia.

### M5. `wc -l` test files are heavy on commentary
- **File:** `packages/web/src/__tests__/Submenu.keyboard.test.tsx`, lines 1–10 (block comment naming the adversary finding), lines 46–48 (3-line tab-order setup explanation).
- **Issue:** Test files should have describe/it strings carry the meaning. The "this resolves adversary W5" preamble is meta-narrative that won't survive the next refactor.
- **Fix:** Trim file headers to one line. Let the `describe`/`it` text and assertions document intent.

---

## LOW

### L1. Long `@lore` blocks attached to one-line code changes
- **File:** `packages/web/src/layouts/AppShell.tsx`, lines 402–411 (5-line lore on a `.filter().length` call), lines 504–510 (8-line lore on the `<ThreadSections>` call site).
- **Issue:** `@lore` is for non-obvious decisions. "AppShell consumes the same predicate via `predicateFor()` so the count and the rendered list cannot drift" describes obvious code. Lore inflation makes future agents skim the real lore.
- **Fix:** Compress to one line or delete.

### L2. AI-tell phrasing in comments
- **File:** `packages/web/src/layouts/AppShell.tsx`, line 525 (`Knowledge's chip is currently inert (deferred follow-up).`)
- **Issue:** "Currently … deferred follow-up" is the same shape as `// for now` / `// in production`. If the deferral has a story id, link it; otherwise drop.
- **Fix:** Replace with a TODO referencing the next track story, or remove.

### L3. `const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;` left untouched
- **File:** `packages/web/src/components/ThreadSections.tsx`, line 33.
- **Issue:** Pre-existing, but worth flagging while we're here: the constant is unused in the diff context (still referenced elsewhere in the file). Verify it is still referenced post-L10 or remove.
- **Fix:** Verify usage; if dead, drop.

### L4. `aria-disabled={filtersDisabled || undefined}` repeated
- **File:** `packages/web/src/shell/Submenu.tsx`, lines 152, 177.
- **Issue:** Minor — the `|| undefined` idiom (so React omits the attribute) is fine but appears twice. Pull into a local `ariaDisabled` once.
- **Fix:** `const ariaDisabled = filtersDisabled || undefined;` — purely cosmetic.

---

## NOT FLAGGED (clean)

- No `any`, no `@ts-ignore`, no unsafe `as` casts.
- No empty catch blocks, no `=== true` filler (the `t.blocking === true` in `predicateFor` is a legitimate boolean equality check on an optional field, not a tautology against a typed `boolean`).
- No `async` on a non-awaiting function.
- No "TODO: implement" lies, no "simplified version" markers.
- E2E spec and stories file: skimmed, no obvious slop beyond standard Playwright/CSF boilerplate.

---

## Severity counts

- HIGH: 4
- MEDIUM: 5
- LOW: 4
- TOTAL: 13
