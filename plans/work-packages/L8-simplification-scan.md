# L8 — Simplification Scan

Read-only findings. Developer applies fixes.

Severities: **Blocking** = must fix before merge; **Major** = ship-blocking quality; **Minor** = clean up.

---

## Blocking

None.

## Major

### M1 — Dead CSS hook classes `section--blocking` / `section--resolved`
**File:** `packages/web/src/components/ThreadSections.tsx:293-299`
**Finding:** The conditional `className={section.id === "resolved" ? "section--resolved" : section.id === "blocking" ? "section--blocking" : undefined}` is rendered, but no stylesheet in `packages/**` defines `.section--resolved` or `.section--blocking`. The only references live in `plans/design-explorations/L8/**/mockup.html` (mockup-local CSS). These classes are emitted to the DOM and do nothing.
**Fix:** Delete the entire `className` ternary on the `<section>`. Tone is already conveyed via `headerToneClass` and the per-row `opacity-70` on resolved items. If a styling hook is genuinely needed later, add it together with the CSS — not before.

### M2 — `mode: "conversations" | "legacy"` is a premature abstraction
**File:** `packages/web/src/components/ThreadSections.tsx:185-216`, `packages/web/src/components/ThreadSections.stories.tsx`, all existing `__tests__/ThreadSections.test.tsx` callers
**Finding:** The new mode switch and `renderConversations` helper exist to "preserve a legacy 5-section behavior". But `AppShell.tsx:468` passes `mode="conversations"` for the only production caller. The remaining users of the legacy branch are stories and tests of the legacy branch itself — i.e. the abstraction exists to keep its own tests alive. The plan even contains a "retirement plan" comment, which is a tell that the second mode shouldn't have been added.
**Fix:** Either (a) replace the legacy branch with the new conversations layout outright and update the legacy stories/tests, or (b) split into two components (`ThreadSectionsLegacy`, `ConversationsThreadList`) and stop pretending one component does both jobs. The current `mode` prop adds a render branch, an extra helper function, duplicated empty-state copy ("No threads" vs "No threads yet"), and two parallel classifier/sort families.

### M3 — Two near-duplicate classifiers and bucketers
**File:** `packages/web/src/components/ThreadSections.tsx:63-95` vs `:120-176`
**Finding:** `classifyThread` + `groupThreadsIntoSections` and `classifyForConversations` + `groupThreadsForConversations` are structurally identical (build a record-of-arrays, push, return ordered sections). The only differences are bucket names, the resolved-window check (`> TWENTY_FOUR_HOURS_MS` vs `<= TWENTY_FOUR_HOURS_MS`), and per-bucket sort. Once M2 is resolved, only one survives.
**Fix:** After M2, delete the legacy bucketer.

### M4 — `defaultPath` field carries one literal for one view
**File:** `packages/web/src/layouts/AppShell.tsx:34-50, 277-280`
**Finding:** The `SubmenuConfig.defaultPath` field exists for exactly one view (`conversations`) so that `handleViewClick` has somewhere to navigate when `items` is empty. This is a config-shaped workaround for "the conversations submenu is now data-driven." Adding an optional schema field for a single concrete value is a smell.
**Fix:** Special-case `conversations` in `handleViewClick` (`if (view === "conversations") { navigate("/conversations/review"); return; }`), drop `defaultPath` from `SubmenuConfig`, and drop the empty `items: []` for conversations (or leave the items array; either way the field disappears).

### M5 — `Outlet context={{ selectedThreadId }}` exposes state with no consumer in this story
**File:** `packages/web/src/layouts/AppShell.tsx:511`
**Finding:** `selectedThreadId` is plumbed through `<Outlet context>` but no route under this diff calls `useOutletContext` to read it. The plan says deep-link / route collapse is L9. Until then, this is exported state with zero readers — premature surface.
**Fix:** Drop the `context` prop until L9 needs it. Keep the `useState` for the in-submenu highlight; that's used. Add it back when there is a real consumer.

## Minor

### m1 — `[...conversationsThreads.threads]` array spread on every render
**File:** `packages/web/src/layouts/AppShell.tsx:470`
**Finding:** Spreading a `ReadonlyArray<ThreadItem>` to satisfy `threads: ThreadItem[]` allocates a new array each render and breaks referential equality. The fix is to widen `ThreadSectionsProps.threads` to `ReadonlyArray<ThreadItem>`; nothing inside `ThreadSections` mutates the array.
**Fix:** Change `threads: ThreadItem[]` → `threads: ReadonlyArray<ThreadItem>` in `ThreadSectionsProps`, drop the spread.

### m2 — Single-call helper `renderConversations`
**File:** `packages/web/src/components/ThreadSections.tsx:260-342`
**Finding:** Called from one site (line 215). Inlining keeps the file readable and removes the parameter object. (Resolves naturally with M2.)

### m3 — `sortBlocking` lies about what it does
**File:** `packages/web/src/components/ThreadSections.tsx:134-139`
**Finding:** Comment says "sorts by lastActiveAt desc … for L8 we sort by id to keep determinism." The function does not implement what its name implies. Either rename to `sortById` or push `lastActiveAt` onto `ThreadItem` and sort by it. Same critique applies to the id tiebreaker in `sortActive` (line 145) — calling `localeCompare` on an id is not "lastActiveAt desc."

### m4 — `errorMessage !== null` short-circuits the empty state
**File:** `packages/web/src/components/ThreadSections.tsx:203-212`
**Finding:** When `errorMessage` is set, the component returns the same generic ErrorState regardless of mode and ignores `errorMessage`'s content (only its presence). The prop is effectively a `boolean`. Either render `description={errorMessage}` to surface the actual message, or change the prop to `hasError: boolean`.

### m5 — `aria-current="true"` should be `"page"` or `"true"` per use
**File:** `packages/design-system/src/ThreadRow.tsx`
**Finding:** `aria-current` accepts `page | step | location | date | time | true | false`. `"true"` is valid but conveys "this is the current item among siblings"; for a row that is the lifted-selection target inside a list, this is fine — flagging only because the design comment in the prop docstring says "selected target" while ARIA semantics for a navigable list typically prefer `page` if clicking it changes the route. Pick deliberately.

### m6 — `as const` cast on tone literals is redundant
**File:** `packages/web/src/components/ThreadSections.tsx:173`
**Finding:** `tone: id === "blocking" ? ("danger" as const) : ("neutral" as const)` — the surrounding return type already pins `tone: "danger" | "neutral"` via `ConversationsSection`. The casts are noise.

### m7 — `inArray(messages.type, ["review", "questionnaire"])` literal duplicated
**File:** `packages/server/src/routes/threads.ts:218-223`
**Finding:** `headCollapsePredicate` (imported on line 35) already encodes the "unresolved review-like message" rule. Either reuse it (read at row level then aggregate) or, if the SQL form is the right shape, hoist the literal `["review", "questionnaire"]` to a shared constant in `@hyperidle/shared` so client and server can't drift.
