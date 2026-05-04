# L15 — Design Review

**Reviewer:** Claude Design (read-only).
**Branch:** `ab/L15-1a` in worktree `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-1a`.
**Date:** 2026-05-04.
**Scope:** L15 UI files only.

| File | Role |
|---|---|
| `packages/design-system/src/Tag.tsx` | New `unread` prop on Tag primitive. |
| `packages/design-system/src/TaskCard.tsx` | New `actions` slot at card footer. |
| `packages/web/src/shell/Kanban.tsx` | DnD removed; per-card request/thread affordance. |
| `packages/web/src/shell/TaskRequestPopover.tsx` | New page-internal composition. |
| `packages/web/src/pages/WorkTeamTaskThread.tsx` | New `/work/team/tasks/:taskId/thread` page. |

**Inputs.**
- Spec: `docs/work-packages/TRACK-L.md` § L15 (lines 511–540).
- Approved design: `docs/design-explorations/L15/approved.md` (variant A — inline action row + B unread chip).
- Approved mockup: `docs/design-explorations/L15/approved-mockup.html` + `approved-screenshot.png`.

**Method.** Loaded canonical source-of-truth docs (`DESIGN.md`, `PRINCIPLES.md`, `aesthetic-quality.md`), cross-checked against approved design contract, then captured live screenshots from the L15-1a Vite server at `http://localhost:5175/work/team` and `http://localhost:5175/designsystem`. Compared against `approved-screenshot.png`.

**Counts.** 5 MUST-FIX · 6 SHOULD-FIX · 4 NICE-TO-HAVE.

**Verdict.** **Reject — block ship until the MUST-FIX items are resolved.** The L15 contract is mostly intact at the data and component-budget axes (Tag and TaskCard extensions both honor net-zero new components; verb derivation matches §4 verbatim; `plain` message body matches §5; drag is removed cleanly). But four spec gates fail at the screenshot level (action-footer divider double-padded, divider rendered for terminal-no-thread cards, missing `Esc` close, broken stories crash) and one spec gate fails at the visual-regression axis (Kanban story crashes with a nested-Router error so `/designsystem` cannot exercise L15 at all). Visual parity to the approved mockup is **mostly intact for the active branches** but not provable for unread/terminal-with-thread because no L15-1a fixture renders those states.

---

## Visual parity assessment

| Surface | State proven? | Diff vs. mockup |
|---|---|---|
| Card — orphan (Request + Open thread) | Yes — every fixture card renders this state. | Match modulo MUST-FIX 1 (footer pad). See `/tmp/L15-card-2.png`. |
| Card — terminal-no-thread (Done) | Yes — `Write auth tests`. | Footer slot emitted-as-empty (MUST-FIX 2); should be omitted. |
| Card — populated with thread `Thread (N)` | **No fixture proves this.** | Cannot verify. Production fixtures all return `threadId=null` until `thread-list-include-message-count` follow-up lands. |
| Card — unread chip `Thread ●N` | **No fixture proves this.** | Cannot verify in real Kanban. The Tag primitive's `UnreadVariant` story renders correctly in isolation (`/tmp/L15-tag-thread5-zoom.png`) — but Tag uses `--r2` (8px) not `--r-pill` (999px) per spec §9 (SHOULD-FIX 3). |
| Popover — open + verb list | Yes — captured `/tmp/L15-popover-closeup.png`. | Geometry, colors, mono-caps labels, Kill-in-danger all match mockup. Anchored to Request trigger correctly (DaisyUI `dropdown-end`). Verb order matches §4 derivation (mockup §3 had a typo on order). |
| Popover — selected verb tint | Cannot capture (no verb selected on initial open). | Code uses `color-mix(in oklab, var(--primary) 8%, transparent)` for selected; matches Fix 2 in approved.md. |
| Popover — error strip | Covered by unit test. | `role="alert"` present. ✓ |
| Thread page | Renders empty/error/loaded shells correctly (SkeletonList, EmptyState, ErrorState used). | Live page returns "Failed to load thread" (server not up at review time). No L15 chrome problem; the thread surface is `ThreadShell` re-use which is fine. |
| Kanban story (designsystem viewer) | **CRASHES.** | "You cannot render a `<Router>` inside another `<Router>`." `/tmp/L15-dbg.png`. **MUST-FIX 4.** |

**Pixel-diff target ≤ 5%.** Not measurable end-to-end because Kanban story is broken in `/designsystem` and unread/with-thread states have no fixture. The states that ARE measurable (orphan card, popover open) match the mockup at the visual-decision level but diverge by ~8px on every card-footer due to MUST-FIX 1.

**Screenshots produced (all in `/tmp/`):**
- `L15-workteam.png` — full Team Board.
- `L15-card-{0..4}.png` — per-card closeups.
- `L15-popover-open.png` — full board with popover open.
- `L15-popover-closeup.png` — popover only.
- `L15-tag-unread-actual.png` — Tag.UnreadVariant story.
- `L15-tag-thread5-zoom.png` — `Thread (5)` chip closeup.
- `L15-dbg.png` — Kanban story crash screen.
- `L15-thread-page.png` — thread route empty/error state.

---

## Top-3 issues (read these first)

1. **MUST-FIX 1.** Action-footer divider uses `var(--density-gap)` (12 px) for `mt`/`pt` but spec §3 + the file's own `@lore` comment both say **4 px**. Result: every card with an action footer is ~16 px taller than designed. Trivial one-line fix.
2. **MUST-FIX 2.** Action-footer wrapper `<div className="border-t…">` renders even when its `actions` child resolves to `null` (the terminal-no-thread case). Result: the divider line is drawn under cards that should have no footer at all. Spec §3 row "Populated — terminal AND no thread" requires the entire slot be omitted.
3. **MUST-FIX 3.** Popover has no `Esc` keyboard handler and no click-outside dismissal. Spec §6.3 mandates Esc close; spec §6.2 mandates focus-return on every close path. Today, Esc does nothing and clicking outside leaves the React state at `open=true` (DaisyUI's CSS-only blur visually hides the popover but the state is wedged).

---

## MUST-FIX (blocks ship)

### MUST-FIX 1 — Action-footer pad is 3× the spec
- **Location:** `packages/design-system/src/TaskCard.tsx:63`.
- **Spec:** approved.md §3 — "footer divider is `1px solid var(--border-subtle)`, `margin-top: 4px`, `padding-top: 4px`. The footer's vertical pad is `4px` (sub-grid; chip-internal scale per AESTHETICS.md spacing rule)." The mockup CSS line 104 confirms `margin-top: 4px; padding-top: 4px`.
- **Actual:** `mt-[var(--density-gap)] pt-[var(--density-gap)]` → 12 px each at default density (24 px total of vertical chrome around the footer).
- **Evidence:** `/tmp/L15-card-2.png` (Implement login endpoint card) — footer sits ~24 px below the Cost row instead of ~8 px.
- **Lore self-contradiction:** the same file's `@lore` block at line 58–62 reads "1px subtle border, mt/pt 4px (sub-grid; chip-internal scale per AESTHETICS.md)." The intent was 4 px; the implementation is 12 px.
- **Fix shape:** the spec calls for a literal `mt-[4px] pt-[4px]`. AESTHETICS.md §AQ-001 explicitly carves out "2 px is reserved for chip/icon internals only" — 4 px is on-grid. The slot is chip-internal, not body-text spacing, so the density token does not apply (that's the spec's whole point).

### MUST-FIX 2 — Divider rendered for terminal-no-thread cards
- **Location:** `packages/design-system/src/TaskCard.tsx:56–66` + `packages/web/src/shell/Kanban.tsx:171–191` (`renderTask`).
- **Spec:** approved.md §3 row "Populated — terminal AND no thread (rare)" → "Action footer slot is omitted. Card height shrinks by ~28 px."
- **Actual:** `Kanban.tsx` always passes `actions={<TaskCardActions … />}`. `TaskCardActions` returns `null` when there's no request and no thread, but `TaskCard`'s ternary (`{actions ? <div className="border-t…">{actions}</div> : null}`) evaluates the JSX element as truthy — so the divider DIV renders empty under every card.
- **Evidence:** DOM walk on `/work/team` (`/tmp/L15-workteam.png`): every TaskCard has exactly 1 `.border-t` element, including `Write auth tests` (Done, no thread). The Done card is 24 px shorter than its peers (footer content absent), but the divider line is still drawn.
- **Fix shape:** either (a) lift the null-check to `Kanban.renderTask` so `actions` is `undefined` for terminal-no-thread, or (b) make `TaskCard` accept `actions: ReactNode | undefined` and drop the wrapper when the rendered child is null. Option (a) is lower-blast-radius; (b) requires the actions consumer to pre-evaluate.

### MUST-FIX 3 — Popover has no `Esc` close and no click-outside dismissal
- **Location:** `packages/web/src/shell/TaskRequestPopover.tsx:155–229`.
- **Spec:** approved.md §6.3 — "Esc while popover is open: cancel + close." §6.2 — "When the popover closes (via Esc, Cancel, Send success, or click-outside), focus returns to the Request ▾ trigger button."
- **Actual:** the popover root `<div role="dialog">` has no `onKeyDown`. The trigger toggles state but there is no document-level pointerdown listener. Clicking outside relies on DaisyUI's CSS `:focus-within` blur, which only hides the popover visually — the React `open` state stays `true`, focus is not returned, and the next click on the trigger toggles back to `false` (visible blink).
- **Evidence:** code-only — the file contains zero references to `Escape`, `keydown`, `onPointerDown`, `mousedown`, or any outside-detection.
- **A11y impact:** AQ-015 says interactive elements need keyboard parity. A modal-like surface with no Esc fails WCAG 2.1.1 keyboard expectations and the spec's explicit a11y contract.
- **Test gap:** `packages/web/src/__tests__/TaskRequestPopover.test.tsx` has no `Escape` test, no click-outside test, no focus-return test other than implicit via the `error` test. Spec §6.2 + §6.3 are unverified.

### MUST-FIX 4 — Kanban story crashes the design-system viewer
- **Location:** `packages/web/src/shell/Kanban.stories.tsx:57–61` (and `EmptyBoard`, `Grouped`, `SingleColumn`).
- **Spec:** `.claude/rules/design-system.md` — "Every custom component must have a `.stories.tsx` file rendering key states at `/designsystem`." The viewer is an active design-review surface.
- **Actual:** every story now wraps `<Kanban>` in `<MemoryRouter>`. The `/designsystem` route already mounts inside the app's `<BrowserRouter>`. Result: `Error: You cannot render a <Router> inside another <Router>.` The story area shows a runtime-error fallback. Captured at `/tmp/L15-dbg.png`.
- **Evidence (console):** `Error: You cannot render a <Router> inside another <Router>. at invariant (.../react-router-dom.js:643:11) at Router (.../react-router-dom.js:7237:3)`.
- **Why this matters:** the design-system viewer is the canonical place to compare Kanban states against the approved mockup. The crash means the L15-relevant states (orphan, populated-with-thread, unread chip, terminal-with-thread, terminal-no-thread, popover-open) cannot be reviewed at `/designsystem` at all — only on the live `/work/team` page, which is missing fixtures for unread / populated-with-thread.
- **Fix shape:** the anchor is the `<a href>` inside `TaskCardActions` and (in the orphan branch) the `Open thread` link. Use `react-router-dom`'s `Link` instead and rely on the surrounding viewer's BrowserRouter — no MemoryRouter wrapper needed. Or add a runtime check that detects an existing Router and skips the wrapper.

### MUST-FIX 5 — Story fixture coverage is insufficient to prove L15's most-distinctive states
- **Location:** `packages/web/src/shell/Kanban.stories.tsx`.
- **Spec:** approved.md §3 "Card variants (driven by data state)" enumerates four card states. Approved mockup shows three of them on one screen (orphan, populated-with-thread, populated-unread, terminal-with-thread, terminal-no-thread).
- **Actual fixtures:** `Default` story has six tasks — five end up in orphan state (no `threadId`), one (`Build REST API`, in_progress) has `threadId="thread-2", threadCount: 3, threadUnread: 2` so it WOULD render the unread chip. `EmptyBoard`/`SingleColumn`/`Grouped` cover edges of the layout, not L15 card-state variants.
- **Why this matters:** because of MUST-FIX 4 the existing fixtures don't render at all. Even after MUST-FIX 4, a designer reviewing `/designsystem#Kanban::Default` cannot see (a) the terminal-with-thread variant (Done card with a `Thread (1)` chip), or (b) a populated-non-unread variant (`Thread (3)` neutral chip). At least one Done-state fixture must carry a populated `threadId` + non-zero `threadCount` and zero `threadUnread`.
- **Fix shape:** add a `t-done-with-thread` task to the existing fixture (state `done`, threadId set, threadCount: 2, threadUnread: 0) and a dedicated `Variants` story that renders one card per row labelled with the variant from approved.md §3.

---

## SHOULD-FIX (ship-blockers if found in QA)

### SHOULD-FIX 1 — Send button has no minimum-show floor on `Saving…`
- **Location:** `TaskRequestPopover.tsx:124–146`.
- **Spec:** approved.md §6.4.5 — "The Send button replaces with `Saving…` for **minimum 80ms** (perceptibility floor; matches L11 §5.4)."
- **Actual:** `setSending(true)` then `await postRequest` — on a fast localhost response the `Saving…` label flashes for one frame and is gone. No `Promise.all([…, sleep(80)])` floor.
- **Why this matters:** the spec calls this out as the only positive-feedback signal during the post. Without it, fast sends look like nothing happened.

### SHOULD-FIX 2 — Thread count chip increment has no `--motion-medium` crossfade
- **Location:** `Kanban.tsx:230–232` (the `handleSent` callback) + `WorkTeam.tsx` (state update).
- **Spec:** approved.md §6.4.6, Fix 1 in §1 — "The Thread (N) count animates from n → n+1 over **150 ms `--motion-medium`** opacity crossfade. This is the only positive feedback."
- **Actual:** `onTaskRequestSent` only writes new state on the parent. There's no transition wrapper, no `key`-based remount + opacity transition, and no `--motion-medium` reference anywhere in `Kanban.tsx` or `TaskRequestPopover.tsx`.
- **Why this matters:** the spec explicitly anchors all positive feedback on this micro-animation (§11 rejection list item 12 forbids toasts, "Sent!" copy, checkmarks, etc.). Without the crossfade there is **no** positive feedback at all.

### SHOULD-FIX 3 — Tag's unread chip uses `--r2` (8 px) instead of `--r-pill` (999 px)
- **Location:** `Tag.tsx:36` (TAG_BASE).
- **Spec:** approved.md §9 — "Closed radius scale: card `--r2`, popover `--r2`, buttons `--r1`, count chip `--r-pill` (AQ-011)." Mockup CSS line 139 uses `border-radius: var(--r-pill)` for `.tag`.
- **Actual:** Tag's TAG_BASE class is `rounded-[var(--r2)]` (inherited from the legacy Tag styling). The unread variant inherits this — the chip is rounded 8 px corners, not pill.
- **Evidence:** `/tmp/L15-tag-thread5-zoom.png` shows a soft-cornered rectangle, not a pill.
- **Why this matters:** the spec's whole point of the "count chip" being pill-shaped is that pills read as numeric containers (matches StatusChip pill), while r2 reads as a card. The chip-vs-rect ambiguity weakens the unread signal.
- **Caveat:** because Tag is a Tier-1 primitive used in many places, switching its base to `--r-pill` would be a global change. The right fix is probably a Tag-internal `kind === undefined && unread` branch that overrides the radius, OR a separate `count` shape. Spec rejection-list item 16 forbids new Tag variants beyond `default` and `unread` — so the override should live inside the existing `unread` branch.

### SHOULD-FIX 4 — Trigger button has no `data-open` styling
- **Location:** `TaskRequestPopover.tsx:157–166`.
- **Spec:** approved.md §6.1 — "Popover open: the Request ▾ trigger gets `data-open=\"true\"` styling: `--surface-ghost` background, `--text-hi` text."
- **Actual:** the trigger button gets only `aria-expanded={open}`. No `data-open` attribute, and the className doesn't react to the `open` state.
- **Why this matters:** in a dense column, when several Request triggers are visible, the user needs to see which one anchors the popover (especially because the popover overlaps neighbouring cards). A clear `--surface-ghost` background on the active trigger does that. Without it, the popover looks unanchored.

### SHOULD-FIX 5 — `Open thread` orphan link missing `aria-label`
- **Location:** `Kanban.tsx:156–158`.
- **Spec:** approved.md §9 — "`Thread (N)` link carries `aria-label=\"Open thread (N messages, K unread)\"` when K>0, `aria-label=\"Open thread (N messages)\"` when K===0, `aria-label=\"Open thread\"` when no thread."
- **Actual:** the orphan branch wraps the text in `<a href="…">…</a>` with no `aria-label`. Screen readers will announce only the visible "Open thread" text — fine for sighted users but the spec asks for explicit labels everywhere for grammar consistency with the populated branch.
- **Fix shape:** add `aria-label="Open thread"` to the orphan anchor.

### SHOULD-FIX 6 — `Saving…` button has no `aria-live`
- **Location:** `TaskRequestPopover.tsx:215–224`.
- **Spec:** approved.md §9 — "`Saving…` strip is `aria-live=\"polite\"`. Error strip is `role=\"alert\"`."
- **Actual:** the error strip correctly carries `role="alert"` (line 207). The `Saving…` state, however, just changes the button's text — no `aria-live`, no separate live region.
- **Why this matters:** screen reader users get no announcement that the post is in-flight. The spec calls this out explicitly; even though spec §9's wording says "Saving… strip" (suggesting a separate region), the right minimum is to wrap the button label in `aria-live="polite"` or add a sibling `<span aria-live="polite" className="sr-only">Saving…</span>`.

---

## NICE-TO-HAVE (file before next iteration; not blocking)

### NICE-TO-HAVE 1 — Mobile bottom-sheet adaptation deferred
- **Location:** `TaskRequestPopover.tsx`.
- **Spec:** approved.md §8 — "Popover renders as a bottom sheet: full-width, height auto, slides up from the bottom. DaisyUI `modal-bottom` substitution."
- **Actual:** the popover always renders as `dropdown-content` regardless of viewport.
- **Status:** acceptable as L15 first-pass. File a follow-up to add the mobile bottom-sheet branch when mobile QA lands. Spec §8 is a designer-call deferral.

### NICE-TO-HAVE 2 — Selected-card 200 ms `--primary` left-border flash on chip click
- **Location:** `Kanban.tsx:144–154` + `TaskCard.tsx`.
- **Spec:** approved.md §6.5.3 — "The selected card flashes a 200ms `--primary` left-border (the future-ready visual reservation from C, used here only as a navigation acknowledgment)."
- **Actual:** the chip click is just a route push. No visual ack.
- **Status:** the spec calls this a "future-ready visual reservation" and explicitly notes it's the future TaskDrawer hook. Skipping it in L15 is acceptable but it's the kind of tiny detail that signals to the user that "the click registered." File a follow-up.

### NICE-TO-HAVE 3 — Thread page lacks task context (breadcrumb / back link)
- **Location:** `WorkTeamTaskThread.tsx:34–114`.
- **Observation (not in spec):** when the user clicks `Thread (3)` on `Implement login endpoint`, they land on `/work/team/tasks/t1/thread`. The page renders the ThreadShell but offers zero context — no task title, no back-to-board link, and the Submenu does not highlight Team Board. The user can browser-back, but the spec §6.5 talks about "navigation acknowledgment" — the destination should reciprocate.
- **Status:** acceptable as L15 first-pass (the spec doesn't mandate a breadcrumb). File a follow-up — the most lightweight fix is a `ThreadHostBanner` reuse for `host_kind: "task"` showing the task title + a Team Board link.

### NICE-TO-HAVE 4 — Note textarea has no `placeholder`
- **Location:** `TaskRequestPopover.tsx:198–205`.
- **Spec:** mockup line 421 used `placeholder="auth provider docs disagree…"` (illustrative).
- **Actual:** no placeholder attribute.
- **Status:** purely illustrative in the spec (the spec itself doesn't lock placeholder copy). A placeholder helps users understand "this is optional" without reading the label. File a follow-up.

---

## What's CORRECT and worth defending

These are the parts of L15 the rejection list (§11) will need to defend against future changes. Documenting so the next agent knows where the line is.

- **Verb derivation matches §4 verbatim.** `requestableVerbsFor` in `@hyperidle/shared/src/task-verbs.ts` returns exactly the spec's table, exhaustive over `TaskState`. ✓
- **`plain` message body matches §5 verbatim.** `formatRequestMessageBody` produces line-1 deterministic / line-2 freeform with a trim-and-skip-blank rule. ✓
- **No new MESSAGE_TYPES enum entry.** Rejection-list item 3 honored. ✓
- **No state-mutation endpoint call from the popover.** Posts only to thread. Rejection-list item 4 honored. ✓
- **DnD scaffolding fully removed.** `DndContext`, `useDraggable`, `useDroppable`, `KeyboardSensor`, `PointerSensor`, `COLUMN_TO_STATE`, `DraggableTaskCard`, `KanbanDropZone`, `handleMoveTask`, `onMoveTask` all gone. `STATE_TO_COLUMN` survives as the read-direction map. ✓
- **Net-zero new components.** Tag and TaskCard each gain one optional prop; no new Tier-1/2/3 entries. The popover lives in `packages/web/src/shell/` per the file's `@lore` (page-internal composition, not a Tier-3 region). ✓
- **DaisyUI primitives used directly.** `dropdown`, `btn`, `textarea` not wrapped. Rejection-list item 15 honored. ✓
- **No emoji.** `▾` chevron is a typographic glyph; the unread dot is a `<span>` background. AQ-105 honored. ✓
- **Kill verb in `--danger` text only.** No filled red button, no exclamation icon. ✓
- **Selected-verb tint is distinct from hover.** Selected → `color-mix(in oklab, var(--primary) 8%, transparent)`. Hover → btn-ghost default (`--surface-ghost`). Matches Fix 2 in approved.md §1. ✓
- **Per-card `aria-label` carries unread count for the populated branch.** The orphan branch is the only gap (SHOULD-FIX 5).

---

## Files producing this review

- `/tmp/L15-workteam.png` — `/work/team` full page (orphan + Done states populated).
- `/tmp/L15-card-{0..4}.png` — per-card closeups.
- `/tmp/L15-popover-open.png` + `/tmp/L15-popover-closeup.png` — popover anchored to `Implement login endpoint`.
- `/tmp/L15-tag-unread-actual.png` + `/tmp/L15-tag-thread5-zoom.png` — Tag.UnreadVariant story.
- `/tmp/L15-dbg.png` — Kanban story crash (MUST-FIX 4 evidence).
- `/tmp/L15-thread-page.png` — thread route empty/error state.

---

## Cross-references

- Spec: `docs/work-packages/TRACK-L.md` § L15 (lines 511–540).
- Approved design: `docs/design-explorations/L15/approved.md`.
- Approved mockup: `docs/design-explorations/L15/approved-mockup.html`.
- Approved screenshot: `docs/design-explorations/L15/approved-screenshot.png`.
- Token reference: `packages/design-system/DESIGN.md`.
- Aesthetic rules: `.claude/rules/aesthetic-quality.md` (AQ-001, AQ-007, AQ-011, AQ-015, AQ-105).
- Existing tests: `packages/web/src/__tests__/TaskRequestPopover.test.tsx`, `packages/web/e2e/team-request.spec.ts`.
- Follow-ups already filed: `docs/work-packages/follow-ups.md` — `thread-list-include-message-count`, `kanban-thread-metadata-batched-endpoint`, `team-scoped-tasks-and-agent-membership`, `thread-message-rate-limit`.
