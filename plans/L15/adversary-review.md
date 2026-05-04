# L15 — Adversary Review

Read-only adversarial review of the L15 implementation in `.worktrees/L15-baseline2`. Slop-scan and simplification-scan were applied upstream; this review hunts for what they missed.

---

### AR1 — In-flight guard missing; double-click posts duplicate messages
- File: `packages/design-system/src/TaskCard.tsx:74-78`, `packages/web/src/pages/WorkTeam.tsx:192-266`
- Issue: Approved.md §5 ("Request in flight … kebab disabled") and architecture §3.4 explicitly name "the kebab disable as the single front-line guard against double-firing." The implementation has **no** in-flight tracking. After `handleVerbClick` fires, `setMenuOpen(false)` runs immediately; the user can reopen the kebab and click again before the fetch resolves. WorkTeam rolls a fresh `crypto.randomUUID()` per click, so the server's idempotency unique-constraint does NOT dedupe — TWO real messages land in the thread for one founder intent. The `loading-xs` spinner state from approved §5 is also not implemented. This is the load-bearing guarantee from the design spec; the spec is not met.
- Severity: high
- Suggested fix: Add a `pendingVerb?: TaskRequestVerb` prop on `TaskCard` (or a `disabled` flag); WorkTeam tracks an in-flight `Set<taskId>` in state, passes it down through Kanban, and the kebab + menu items render disabled while the task is in flight. Add a vitest covering "double-click posts only one request."

### AR2 — Visual-parity rule violated: `TaskCard.html` not updated
- File: `packages/design-system/html/TaskCard.html` (no L15 changes)
- Issue: `.claude/rules/visual-parity.md`: "HTML files in `packages/design-system/html/` are the design source of truth … TSX must match the HTML rendering pixel-for-pixel." Plan §6 task #4 explicitly required updating the HTML reference FIRST. `grep -c "kebab|dropdown|thread-dot|menuitem"` against `TaskCard.html` returns 0. The TSX now renders a kebab, dropdown menu, and thread dot that have no representation in the HTML reference. `bun run ds:sync` will either fail or be silently skipped, and Claude Design has no design-source for the new affordances.
- Severity: high
- Suggested fix: Update `packages/design-system/html/TaskCard.html` to mirror the kebab + dropdown + thread-dot DOM shape, then run `bun run ds:sync` and confirm < 5% pixel diff. This is a hard rule, not a nice-to-have.

### AR3 — Mobile bottom-sheet not implemented (approved §9 missed)
- File: `packages/design-system/src/TaskCard.tsx:165-244`
- Issue: Approved.md §9 explicitly: "At viewport ≤ 1024 px … the menu opens as a centred bottom sheet using DaisyUI's `modal modal-bottom` rather than the desktop popover, so menu rows expand to ≥ 44 px row height with full-width touch targets." Implementation only enlarges the kebab button to 44×44 (`max-lg:` classes on the button) and renders the same `dropdown-content` popover at every viewport. Menu rows are 32 px (`menu menu-sm`) and the menu is `w-56` — not full-width, not bottom-sheet, not 44 px tall on mobile. AQ-015 (touch target ≥ 44 px) fails for menu rows on mobile. Mobile is shipped broken.
- Severity: high
- Suggested fix: Branch on viewport (`window.matchMedia('(max-width: 1024px)')` or a `useMediaQuery`-style hook) and render the menu as `<dialog class="modal modal-bottom">` with `modal-box` rows ≥ 44 px on mobile. Add a Playwright spec at the mobile viewport that opens the kebab and asserts row height.

### AR4 — Verb matrix diverges from approved.md §4.1
- File: `packages/shared/src/task-request.ts:77-101`
- Issue: Approved §4.1 lists exactly 5 verbs per state and only 6 state rows (`proposed/accepted`, `in_progress`, `review`, `blocked`, `done`). Implementation extends the matrix to 8 states (adds `hold`, `killed`) and adds `kill` to every row (6 verbs visible). For `done`, approved says "Reopen, others disabled" with empty Verb 2-5 cells; impl renders `pause`, `mark_blocked`, `push_to_review`, `mark_done` ALL disabled — the menu is much longer than the spec. For `blocked`, approved disables only `pause`; impl disables `pause` AND `mark_blocked` (matches §4.1's "Mark blocked (disabled)" — OK there). The disabledHint copy ("Already paused-equivalent" for `proposed`) is invented — not in the spec. The matrix is the closed contract; this is silent drift.
- Severity: medium
- Suggested fix: Either (a) prune the matrix to the 5-verb shape from approved §4.1 and document `hold/killed` explicitly, or (b) push an approved-design amendment through `/design` covering the new states. Do not let the implementation be the spec.

### AR5 — Async handler does not abort on unmount; setState-after-unmount warnings
- File: `packages/web/src/pages/WorkTeam.tsx:145-151`, `192-266`
- Issue: `handleRequestStateChange` awaits `fetch` then calls `setTasks(...)`. If the user navigates away mid-fetch (browser back button, route change, tab close handled differently) the component unmounts and `setTasks` fires on a dead tree → React warning, potential memory leak. Same for `showToast`'s `setTimeout` (4 s): if the page unmounts during the 4-second window, the timeout still fires `setToast`, again on an unmounted component. No `AbortController`, no cleanup ref.
- Severity: medium
- Suggested fix: Add `AbortController` to the fetch and abort on unmount via `useEffect` cleanup; track timeouts in a ref and clear on unmount. Add a vitest that unmounts mid-flight and asserts no warning fires.

### AR6 — Menu items are stale on `state` prop change while open
- File: `packages/design-system/src/TaskCard.tsx:57, 74`
- Issue: `verbRows` is computed inline from `state` on every render. If a server-emitted `TaskStateChangedEvent` updates the parent's task `state` while the menu is open, the menu re-renders with the new verb set under the founder's hovering cursor — they may click "Mark done" believing the task is `in_progress` when it just transitioned to `review`. The post fires the now-current verb mapping. There is no flicker-suppression and no test for it. Compounds AR1 (no in-flight guard).
- Severity: medium
- Suggested fix: Either close the menu on `state` change (`useEffect([state])`) or freeze `verbRows` at menu-open time via `useState(() => getRequestableVerbRows(state))` until the menu closes. Add a vitest re-rendering the parent state while the menu is open.

### AR7 — `WorkTeam.request-post.test.tsx` first test description is wrong
- File: `packages/web/src/__tests__/WorkTeam.request-post.test.tsx:99-122`
- Issue: The test claims to verify a POST to `/api/threads/<threadId>/messages`, but `INITIAL_TASKS` has no `threadId` set, so every first-call traffic goes to `POST /api/threads` (lazy bootstrap). The body assertion has to handle both shapes (`rawBody.initialMessage ?? rawBody`) — the test is silently exercising only the bootstrap path. The "request-post" path (existing thread → `/messages`) has zero coverage in this file; lazy-bootstrap.test.tsx covers the second-request branch but no test seeds an existing `threadId` and asserts the canonical `/messages` body.
- Severity: medium
- Suggested fix: Add a fixture setup (e.g., props injection or a localStorage seed) that gives the first task a `threadId`, then assert the `/messages` URL + body shape directly. Rename or fix the existing test description.

### AR8 — Kanban e2e drag-no-op does not assert no network was made
- File: `packages/web/e2e/kanban-drag-noop.spec.ts:36-49`
- Issue: Plan §6 task #18 specifies: "Assert no fetch call to `/api/threads` was made by the drag attempt." The spec only asserts the column-of-residence is unchanged. A future regression where drag fires a POST silently in addition to leaving the DOM in place would pass this spec.
- Severity: low
- Suggested fix: Add `page.on('request', ...)` collector before the drag, and assert zero POST requests to `/api/threads*` after the drag attempt.

### AR9 — Kanban e2e request-verb does not assert StatusChip unchanged
- File: `packages/web/e2e/kanban-request-verb.spec.ts`
- Issue: Plan §6 task #19 is explicit: "Assert StatusChip text on the card is unchanged." The spec asserts the toast appears but never re-reads the card's StatusChip. If a regression introduces an optimistic update (which approved.md §12 item 5 explicitly forbids) this e2e would still pass. The optimistic-prohibition vitest covers component-level; e2e is the layer where wiring optimism would actually surface.
- Severity: medium
- Suggested fix: Capture chip text before the verb click; after the toast appears, re-read it and assert equality. Also assert the card is still in its original column.

### AR10 — `isThreadCreateResponse` validates only `thread.id`
- File: `packages/web/src/pages/WorkTeam.tsx:130-136`
- Issue: The guard checks `value.thread.id is non-empty string`, but the server response also carries `message.id`, `thread.hostKind`, `thread.hostId`. None are validated. A malformed server response could give a `thread.id` that does not match the requested `hostId` (e.g., server bug returning the wrong thread), or omit `message` entirely (request appeared to succeed, but no message exists). The user gets a green "Request posted to thread" toast and the card is wired to a thread that may not contain their message.
- Severity: low
- Suggested fix: Tighten the guard to also validate `value.message.id is string` and `value.thread.hostId === task.id`. On mismatch, treat as failure.

### AR11 — Toast is not announced via aria-live polite/assertive correctly
- File: `packages/web/src/pages/WorkTeam.tsx:306-315`
- Issue: `role="status"` is implicit `aria-live="polite"`. The error toast ("Could not post request — try again.") should arguably be `role="alert"` (`aria-live="assertive"`) so screen-reader users hear the failure immediately rather than after the current utterance finishes. Both info and error toasts share the same `role="status"`. AQ a11y impact for failure-mode awareness.
- Severity: low
- Suggested fix: Branch the role: `role={tone === 'error' ? 'alert' : 'status'}`.

### AR12 — Drag-no-op cue: no `draggable={false}` and no test for cursor
- File: `packages/design-system/src/TaskCard.tsx:107`
- Issue: Approved §10 says "No `draggable` attribute on the DOM. (Browsers will not initiate HTML5 drag.)" The HTML5 default for `<div>` is `draggable="auto"` — text-content drag works (intended; approved §10 confirms). But the kebab button and the title `<span role="button">` are NOT explicitly `draggable={false}`; if a parent ever sets `draggable=true` on a wrapper, those would inherit. There is also no test asserting `cursor: default` over the card body — the assertion is only "drag-no-op" by absence-of-handler.
- Severity: low
- Suggested fix: Add a vitest that mounts TaskCard and asserts `getComputedStyle(cardRoot).cursor === 'default'`. Optional belt-and-suspenders: explicit `draggable={false}` on the card root.

### AR13 — `onClick` removed from TaskCardProps without a contract migration
- File: `packages/design-system/src/TaskCard.tsx:9-26`
- Issue: F2 (simplification-scan) removed `onClick` from `TaskCardProps`. Architecture §3.2 documented `onClick` as "preserved (legacy callers in stories/tests)." Removing a public prop on a design-system component is a breaking change. No grep was performed across `packages/web/src/**` and `packages/design-system/src/**.stories.tsx` to ensure no caller still passes it. If a consumer outside the L15 diff still passes `onClick`, it is a TS error; if it's a `.stories.tsx`, the storybook breaks silently at runtime.
- Severity: low
- Suggested fix: Confirm no caller passes `onClick` (`grep -rn "TaskCard" packages/`). Document the breaking change in `plans/L15/follow-ups.md` or a CHANGELOG entry on the design-system package.

### AR14 — Hardcoded English copy
- File: `packages/web/src/pages/WorkTeam.tsx:239,244,253,263,272`, `packages/shared/src/task-request.ts:60-68`
- Issue: All toast copy and verb labels are hardcoded English. Acceptable for L15 (no i18n infrastructure) but flagging per request.
- Severity: low
- Suggested fix: Track i18n as a separate workpackage; add a `// @lore i18n-pending` near the literals so they are easy to find later.

### AR15 — Click on title-row when unread > 0 races with kebab focus
- File: `packages/design-system/src/TaskCard.tsx:120-133`
- Issue: When the card has `unread > 0` and `onOpenThread` is set, the title `<span role="button">` is clickable and focusable. Tab order is `title row → kebab`. The title row has no `onMouseDown` stop-propagation, but the kebab button does (`e.stopPropagation()`). If the user clicks the title row, navigation fires; while navigation is async, no guard prevents a second click on the kebab from opening the menu on the now-unmounting component (re-introduces AR5). Minor.
- Severity: low
- Suggested fix: Either disable interaction once `onOpenThread` is invoked, or rely on AR5's unmount-abort fix.

---

## Summary

| Severity | Count | IDs |
|---|---|---|
| blocker | 0 | — |
| high | 3 | AR1, AR2, AR3 |
| medium | 4 | AR4, AR5, AR6, AR7, AR9 |
| low | 7 | AR8, AR10, AR11, AR12, AR13, AR14, AR15 |

(Note: AR9 is medium; total medium = 5.)

## Verdict

**REVISE** — Three high-severity findings (in-flight guard, HTML parity, mobile bottom-sheet) each represent an explicit clause of the approved design or a hard project rule. The current diff would ship with double-post on impatient clicks, no design-source for the new affordances, and a broken mobile menu. AR4 (verb-matrix drift) is a silent contract violation that should be reconciled before ship. The other findings are addressable in a single follow-up pass.
