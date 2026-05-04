# L15 — Design Review

Read-only review of the L15 implementation against `plans/L15/design/approved.md` (verbatim contract) and the design-system rule set.

Severity ladder: **blocker** (ships wrong UX), **high** (visible drift / a11y violation), **medium** (state coverage gap that catalog cannot show), **low** (token / cosmetic drift).

Counts: 1 blocker, 5 high, 4 medium, 4 low.

---

### DR1 — Menu border token does not exist (`--surface-border` is undefined)
- File: `packages/design-system/src/TaskCard.tsx:168`
- Issue: The dropdown menu uses `border border-[var(--surface-border)]`, but `--surface-border` is not defined in `packages/design-system/src/tokens.css`. The actual border tokens are `--border-subtle | --border-default | --border-emphasis`. The menu therefore renders with `border: 1px solid;` resolved to `currentColor`, NOT the intended subtle hairline. Mockup uses `border: 1px solid var(--border-default)` (approved-mockup.html line 48).
- Severity: high
- Suggested fix: change to `border-[var(--border-default)]` (matches the mockup's `var(--border-default)`).

### DR2 — Kebab `aria-label` is not task-scoped; multiple kebabs collide for screen readers
- File: `packages/design-system/src/TaskCard.tsx:139`
- Issue: Every kebab on the board carries the same generic `aria-label="Task actions"`. With 8+ tasks on the board, NVDA / VoiceOver users land on a list of identical "Task actions, button, menu" items with no way to disambiguate. The mockup specifies per-task labels (`aria-label="Task actions for Design signup form"`, see approved-mockup.html line 80).
- Severity: high
- Suggested fix: accept the title in the label, e.g. `aria-label={\`Task actions for ${title}\`}`.

### DR3 — Menu missing dividers between sections (Open thread / Request / Kill)
- File: `packages/design-system/src/TaskCard.tsx:170-241`
- Issue: Approved.md §4.1 explicitly draws two horizontal dividers in the menu — one after the Open-thread row and one before the Kill-task row. The mockup renders both via `.menu-divider`. The implementation has no divider between sections; the danger row (Kill task) merges into the request rows visually with no separation. Removes the "danger lives below the line" rhythm called out in approved.md §4.1.
- Severity: high
- Suggested fix: insert `<li><hr className="border-[var(--border-subtle)] my-[var(--density-gap)]" /></li>` (or DaisyUI's `divider`) after Open thread and between request rows and kill row.

### DR4 — Open-thread action when no thread exists violates approved §5
- File: `packages/web/src/pages/WorkTeam.tsx:174-190`
- Issue: Approved.md §5 row "Populated, no thread" reads: *"Open thread row present; on activation, creates the thread server-side then navigates."* The implementation routes to `/conversations/review?id=` (empty id) and explicitly comments that thread creation only happens on a request verb. Founder who picks "Open thread" before any request lands on an empty conversations route with no created thread, violating the documented flow.
- Severity: blocker
- Suggested fix: in `handleOpenThread`, when `task.threadId` is missing, POST `/api/threads` with `hostKind=task`, `hostId=task.id`, no `initialMessage`, then navigate to the returned `thread.id`.

### DR5 — Request-in-flight state is not implemented
- File: `packages/design-system/src/TaskCard.tsx:74-78`, `packages/web/src/pages/WorkTeam.tsx:192-266`
- Issue: Approved.md §5 row "Request in flight" specifies: *"Selected menu item shows `loading-xs` spinner inline; menu stays open; kebab disabled."* Implementation closes the menu immediately (`setMenuOpen(false)` on click), shows no spinner on the picked verb, and never disables the kebab. A double-click during a slow network produces two messages with two distinct UUIDs (architecture §3.4 explicitly relies on the kebab disable as the front-line guard against double-fire — that guard is missing).
- Severity: high
- Suggested fix: hoist a `pendingVerb: TaskRequestVerb | null` state in TaskCard (passed in via `pendingVerb` prop OR locally tracked on click); render `<span className="loading loading-spinner loading-xs" />` next to the active verb's label; set `disabled` on the kebab while pending; do not close the menu until the parent flips the prop back to `null`.

### DR6 — Mobile title-row 44 px touch target overlay is missing
- File: `packages/design-system/src/TaskCard.tsx:120-133`
- Issue: Approved.md §9 (and architecture §13 reconciliation row "Title-row 44 px touch target on mobile") mandates an `::before` 44 px hit overlay on the title row whenever `unread > 0` at viewport ≤ 1024 px. Title text at compact density is ~21 px tall; the surrounding card padding is `--density-card-pad` (8 px / 12 px / 16 px) — total clickable height stays under 44 px. Implementation has no `::before` overlay and no min-height bump on the title row. AQ-015 violation on mobile.
- Severity: high
- Suggested fix: when `titleInteractive`, add a `before:absolute before:inset-x-0 before:-inset-y-[var(--density-card-pad)] before:content-[''] max-lg:before:min-h-[44px]` overlay on the title-row span (or simpler: at viewport ≤ 1024 px raise `min-h-[44px]` directly on the title row's flex container when unread > 0).

### DR7 — `KebabOpen` story is missing from the catalog
- File: `packages/design-system/src/TaskCard.stories.tsx`
- Issue: Architecture §6 task #5 lists six required new stories: `WithUnreadDot`, `WithReadDot`, `NoThread`, **`KebabOpen`**, `BlockedState`, `DoneState`. The first five are implemented; `KebabOpen` is absent. Approved.md §4.1 documents the menu shape — `/designsystem` cannot present that shape statically without a kebab-open story. (testing.md: "every UI component must have a `.stories.tsx` file rendering key states at `/designsystem`".)
- Severity: medium
- Suggested fix: add a `KebabOpen` story that mounts TaskCard and triggers the kebab open programmatically (`useEffect(() => buttonRef.current?.click())`) so the menu shape is captured in the catalog.

### DR8 — `RequestInFlight` / `RequestSucceeded` / `RequestRejected` stories missing
- File: `packages/design-system/src/TaskCard.stories.tsx`
- Issue: Approved.md §5 enumerates eight states; only five are represented in stories (empty/loading not even applicable to TaskCard, but request-in-flight and request-rejected/agent-replied unread are TaskCard concerns). Without these stories, the catalog cannot prove the in-flight + post-rejection visuals match the design.
- Severity: medium
- Suggested fix: once DR5 lands, add stories for `RequestInFlight` (verb pending), and a `RequestRejected` story that pairs with the unread-dot variant. Most of these are already covered by `WithUnreadDot` (post-rejection lands as unread) — explicit story name + comment makes the mapping legible at the catalog.

### DR9 — TaskCard.html reference is not updated for L15
- File: `packages/design-system/html/TaskCard.html`
- Issue: Visual-parity rule says HTML is the source of truth and the architecture (§6 task #6) lists the HTML update as the FIRST step. The HTML has no kebab, no thread dot, no menu. `bun run ds:sync` will see the TSX as visually drifted from the HTML reference and the TSX-vs-HTML pixelmatch will exceed 5%. (Note: the rule says *fix the TSX* on diff — but in this case the HTML is intentionally stale, so the rule's enforcement is inverted.)
- Severity: medium
- Suggested fix: update `html/TaskCard.html` to mirror the new TSX DOM (add kebab + thread-dot DOM, the menu sub-tree, and the per-state classes). Use the approved-mockup.html as the visual blueprint. This unblocks `ds:sync` and re-anchors the design source of truth.

### DR10 — Unread thread-dot has no primary-tint halo (visual fidelity drift)
- File: `packages/design-system/src/TaskCard.tsx:115-117`
- Issue: Approved-mockup.html line 29: `.thread-dot.unread { background: var(--primary); box-shadow: 0 0 0 2px color-mix(in oklab, var(--primary) 30%, transparent); }`. The screenshot shows a soft 2 px halo around unread dots that visually distinguishes the unread state at a glance. Implementation renders a flat 6 px disc with no halo. Visible delta against the approved screenshot.
- Severity: medium
- Suggested fix: when `unread > 0`, add `shadow-[0_0_0_2px_color-mix(in_oklab,var(--primary)_30%,transparent)]` to the dot span.

### DR11 — Uppercase tracking drift on menu microcopy
- File: `packages/design-system/src/TaskCard.tsx:187,197,215,234`
- Issue: Four uses of `tracking-[0.05em]` on uppercase labels. AQ-007 + the `--tracking-caps` token (0.02em default, 0.015em comfortable) is the canonical letter-spacing for caps; KeyValue already migrated (`tracking-[var(--tracking-caps)]`). StatusChip is the lone holdout at 0.05em (a known pre-L15 inconsistency). New L15 code should use the token, not perpetuate the legacy literal.
- Severity: low
- Suggested fix: replace the four literals with `tracking-[var(--tracking-caps)]`.

### DR12 — Kebab SVG is 14 px instead of mockup's 16 px
- File: `packages/design-system/src/TaskCard.tsx:150-151`
- Issue: Approved-mockup.html line 46 sizes the kebab glyph at `width: 16px; height: 16px`. Implementation uses `width="14" height="14"`. On a 28 px button the dots look slightly under-sized vs the mockup. Density-static affordance — should be a literal that matches the mockup.
- Severity: low
- Suggested fix: change the SVG `width`/`height` to `16`.

### DR13 — Menu width 224 px (`w-56`) is below mockup's 240 px minimum
- File: `packages/design-system/src/TaskCard.tsx:168`
- Issue: Approved-mockup.html line 48: `min-width: 240px`. Implementation `w-56` = 224 px (Tailwind `w-56` = 14rem = 224 px). When the disabled hint reads "Already in progress" (the longest hint) the right column wraps onto a second line at 224 px in the dark theme. Mockup's 240 px clears the wrap.
- Severity: low
- Suggested fix: change `w-56` to `min-w-[240px]` (or `w-60` = 240 px exactly).

### DR14 — TaskCard `actions` slot is no longer used by Kanban (potential dead prop)
- File: `packages/design-system/src/TaskCard.tsx:15`, `packages/web/src/shell/Kanban.tsx:103-115`
- Issue: Approved.md §2 says "the existing `actions` slot now houses the kebab button". The current TaskCard implementation owns the kebab internally and Kanban does not pass `actions`. The `actions` prop is therefore unused at the call sites. If no caller still uses it, it's a dead surface. (Not a contract violation per se — F2 simplification kept `onClick` intentionally — but the design intent of "actions slot houses kebab" no longer holds.)
- Severity: low
- Suggested fix: either (a) drop the `actions` prop entirely (no caller uses it), or (b) keep it but render it AFTER the cost row for a future per-card supplementary action (clarify the comment). Current state is half-stated.

---

## Three render states ({no thread, thread/all-read, thread/unread}) — visual distinction

**Yes, all three are visually distinct and correctly mapped to `threadUnreadCount`:**

- `undefined` (no thread) → no dot rendered (`hasThread = false`). Title is non-interactive.
- `0` (thread, all read) → 6 px disc, `bg-[var(--text-lo)]` (grey). Title is non-interactive.
- `>0` (unread) → 6 px disc, `bg-[var(--primary)]`. Title is interactive (cursor pointer + hover-tint to primary + Enter activates).

The F1 simplification (collapsing `threadExists` into `threadUnreadCount`) holds — the three render outputs are unambiguous and tested at `TaskCard.kebab.test.tsx:147-190`.

The unread state DOES drift from the mockup in one respect (DR10 — missing primary-tint halo), but the read/unread/no-thread three-way distinction reads correctly without it.
