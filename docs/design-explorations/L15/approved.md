# L15 — Strip drag from Kanban; let humans request task changes
## Approved design

**Status.** Locked. Input contract for `/architecture L15`. The architect does NOT re-decide visual hierarchy, component vocabulary, or interaction grammar — they decide types, schemas, endpoints, and ordered tasks. The adversary uses §11 (rejection list) to refuse re-litigation.

**Sources.**
- Story spec: `docs/work-packages/TRACK-L.md` § L15 (lines 511–540).
- Brief: `docs/design-explorations/L15/brief.md`.
- Variants: `inline-action-row/`, `thread-first-overflow/`, `right-rail-drawer/`.
- Critique scores: `comparison.md` (A 70/90, C 65/90, B 62/90).
- Synthesis rationale: `synthesis.md`.

---

## 1. Chosen base + pulls

**Base — Variant A (`inline-action-row`),** with two structural fixes:
- **Fix 1.** The increment-on-send animation must land crisply (the spec called for an 80ms opacity crossfade; the implementation should use 150ms `--motion-medium` so the count-delta is visibly perceived, not subliminal). The count is the only positive feedback that the message landed.
- **Fix 2.** The "selected verb" highlight inside the popover must be visually distinct from the "hovered verb" tint. Selected → `--primary-dim` (0.08). Hover → `--surface-ghost` (0.05). A's mockup used the same recipe for both, which read as ambiguous.

**Pull-in 1 (from B — `thread-first-overflow`).**
**Two-state thread chip with unread signal.** The `Thread (N)` count chip on the action footer carries two visual states:
- Default (no unread): `--surface-ghost` background, `--text-mid` count.
- Unread (agent has posted since the founder last opened the thread): `color-mix(in oklab, var(--primary) 14%, transparent)` background + a 6×6px `--primary` dot prefix, `--text-hi` count.

The unread state pulls the eye across the Kanban — a single-glance scan path for "where do I need to look first."

**Pull-in 2 (from C — `right-rail-drawer`, bounded).**
**Reserve `--primary` left-border treatment for selected/active cards as a future-ready pattern.** Not adopted as a persistent state in L15 — only used as a 200ms flash on card-click acknowledging the navigation to the thread route. This locks the visual vocabulary so a future TaskDrawer (if it ever ships) can use the persistent-border state without re-litigating.

**Drawer NOT pulled in.** Rejected because:
1. It would add a new Tier 3 component (`TaskDrawer`) for a single context.
2. The two-stacked-footer ambiguity (composer + action footer) is unresolved in the variant spec.
3. The Kanban column reflow on every drawer-open changes the founder's spatial map.

---

## 2. Components

### 2.1 What's added

**Zero new components.** The L15 deliverable is composed entirely from existing primitives + DaisyUI markup.

### 2.2 What's extended

**`TaskCard`** — Tier 2 (existing). Add a slot at the card's footer that renders the new action row:

```ts
interface TaskCardActionsProps {
  /** Verbs the user may request given the current task state. */
  requestable: ReadonlyArray<RequestVerb>;
  /** Total messages in the attached thread. */
  threadCount: number;
  /** Messages added since the user last opened the thread. */
  threadUnread: number;
  /** Fired when the user submits a request. The host posts to the thread. */
  onRequest: (verb: RequestVerb, note: string) => Promise<void>;
  /** Fired when the user clicks the thread chip. The host navigates. */
  onOpenThread: () => void;
}
```

The slot is rendered ONLY when `requestable.length > 0` OR `threadCount > 0`. When neither is true (truly orphan task), the slot is omitted (card height shrinks by ~28px).

**`Tag`** — Tier 1 (existing). Add an optional `kind` prop:

```ts
interface TagProps {
  label: string;
  /** Default = no dot, --surface-ghost; "unread" = leading dot + primary tint. */
  kind?: "default" | "unread";
}
```

The "unread" variant adds a 6×6px `--primary` circular dot before the label. Background switches to `color-mix(in oklab, var(--primary) 14%, transparent)`. Same dot+tint recipe as variant B.

### 2.3 What's deleted

- `useDraggable` / `useDroppable` / `DndContext` / `DragOverlay` / `KeyboardSensor` / `PointerSensor` from `Kanban.tsx`.
- The `DraggableTaskCard` wrapper component inside `Kanban.tsx`.
- The `KanbanDropZone` component's drop-target behavior (the wrapping div survives as plain layout).
- The `COLUMN_TO_STATE` constant from `Kanban.tsx` (the inverse map for moves; the read-direction `STATE_TO_COLUMN` survives).
- The `onMoveTask` prop on `Kanban`.
- The `handleMoveTask` handler in `WorkTeam.tsx` (lines 116–120).
- Any test files asserting drag behavior on Kanban tasks (test names will be re-purposed under L15's TDD red phase — drag is now a no-op assertion).

### 2.4 Component-budget accounting

- **Adds.** None. Two existing components extend their API by one optional prop each (`TaskCard.actions`-slot effectively, `Tag.kind`).
- **Deletes.** Code, not components. The Kanban file shrinks substantially.
- **Net.** 0. The 19-component budget is honoured at 19.

---

## 3. The card layout (the deliverable)

```
┌────────────────────────────────────────────┐
│ Implement login endpoint                   │  ← title (existing)
│ [Auth]  [HEALTHY]                          │  ← betTag + StatusChip (existing)
│ Dev Agent 1                                │  ← owner (existing)
│ COST              $4.20                    │  ← optional cost (existing)
├────────────────────────────────────────────┤  ← 1px --border-subtle, mt: 4px, pt: 4px
│ Request ▾              Thread ●3           │  ← NEW — the action footer
└────────────────────────────────────────────┘
```

- The footer divider is `1px solid var(--border-subtle)`, `margin-top: 4px`, `padding-top: 4px`.
- The footer's vertical pad is `4px` (sub-grid; chip-internal scale per AESTHETICS.md spacing rule). Horizontal pad inherits from the card's `--density-card-pad`.
- The two affordances are `btn-ghost btn-xs` styled buttons. Text size `12px`, weight `500`, color `--text-mid` at rest, `--text-hi` on hover.
- The thread chip uses the `Tag` primitive in either default or unread `kind`. Tabular nums on the count.
- The `▾` chevron is a 9px typographic glyph at `--text-lo`.

### Card variants (driven by data state)

| Card state | What renders in the footer |
|---|---|
| `requestable.length > 0` AND thread exists | `Request ▾` (left) + `Thread (N)` or `Thread ●N` (right). |
| `requestable.length > 0` AND no thread | `Request ▾` (left) + `Open thread` (right; mono caps small text, no chip). |
| `requestable.length === 0` (terminal) AND thread exists | Only the right side: `Thread (N)`. |
| `requestable.length === 0` AND no thread | The footer slot is omitted; card shrinks by ~28px. |

### The popover (canonical render)

```
┌──────────────────────────────────┐
│ REQUEST FROM DEV AGENT 1         │  ← mono caps label, --text-lo, +0.05em tracking
├──────────────────────────────────┤
│  Mark blocked                    │  ← btn-ghost, full-width, left-aligned, 13px
│  Pause                           │
│  Ready for review                │
│  Kill                            │  ← --danger text on kill
├──────────────────────────────────┤
│ NOTE (optional)                  │  ← mono caps label, --text-lo
│ ┌────────────────────────────┐   │
│ │ auth provider docs disagree│   │  ← textarea, 13px, min 56px tall
│ └────────────────────────────┘   │
│             [ Cancel ]  [ Send ] │  ← ghost + primary
└──────────────────────────────────┘
```

- 240px wide. `--surface-2` background. `--r2` corners. `1px solid var(--border-default)`. `--float` shadow.
- Anchored to the `Request ▾` trigger. `position: absolute; top: calc(100% + 4px); left: 0`.
- Auto-flip placement at viewport edges: when the popover would overflow the right edge, anchor to `right: 0` instead. Architect picks the boundary detection.
- `Send` is `btn-primary` (filled `--primary`). `Cancel` is `btn-ghost`. Both are DaisyUI primitives, used directly per the no-wrapping rule.

---

## 4. The verb list

The set of legal verbs is **closed at 5**. The verb shown for any given card is **derived from the card's current `TaskState`** by a pure function:

```ts
type RequestVerb =
  | "pause"            // request target state: hold
  | "resume"           // request target state: in_progress
  | "mark_blocked"     // request target state: blocked
  | "ready_for_review" // request target state: review
  | "kill";            // request target state: killed

function requestableVerbsFor(state: TaskState): ReadonlyArray<RequestVerb> {
  switch (state) {
    case "proposed":    return ["mark_blocked", "kill"];
    case "accepted":    return ["pause", "mark_blocked", "kill"];
    case "hold":        return ["resume", "kill"];
    case "in_progress": return ["pause", "mark_blocked", "ready_for_review", "kill"];
    case "blocked":     return ["resume", "kill"];
    case "review":      return ["mark_blocked", "kill"];
    case "done":        return [];
    case "killed":      return [];
  }
}
```

The exhaustive switch is a designer-visible part of the contract. The architect names the function and picks its location (`@hyperidle/shared` is a natural home alongside `taskStateToStatus`).

**Verb display labels** (the human-readable strings in the popover):

| Verb | Display label |
|---|---|
| `pause` | `Pause` |
| `resume` | `Resume` |
| `mark_blocked` | `Mark blocked` |
| `ready_for_review` | `Ready for review` |
| `kill` | `Kill` |

These labels also appear verbatim in the posted message body (see §5).

---

## 5. The posted message

When the user clicks `Send` in the popover, a single `plain`-type message is posted to the task's L1 thread. **No new `MESSAGE_TYPES` enum entry. No state mutation.**

Body format:

```
@<actor-name> requested: <display-label>
<optional one-line note, may be blank>
```

Examples:

```
@A. Founder requested: Mark blocked
auth provider docs disagree with the schema
```

```
@A. Founder requested: Pause
```

The first line is deterministic — the agent can parse it cheaply with a regex. The second line is human freeform. If the user submits with an empty note, only the first line is posted (no trailing blank).

The thread is `host_kind: "task"`, `host_id: <task-id>`. The thread is created implicitly server-side if it does not yet exist (per L1's existing contract for first-message-creates-thread on attached hosts).

**No state mutation.** The request DOES NOT POST to a state-change endpoint. Posting only to the thread is the entire mechanism. The agent's loop reads the thread message and decides whether to act. This is the spec's "humans request, agents decide" invariant.

---

## 6. Behavior

### 6.1 Hover

- Card: existing surface lift (`--surface-4 → --surface-5`). Unchanged.
- Action footer link: text colour `--text-mid → --text-hi`. Background remains transparent at rest, lifts to `--surface-ghost` on hover.
- Thread chip: Default-kind chip `--surface-ghost → color-mix(in oklab, var(--primary) 12%, transparent)`. Unread-kind chip stays at its primary tint (already the heaviest treatment).
- Popover open: the `Request ▾` trigger gets `data-open="true"` styling: `--surface-ghost` background, `--text-hi` text.

### 6.2 Focus

- Tab order: card body wrapper (one tab stop, opens task detail page in a future story) → `Request ▾` button → `Thread (N)` link → next card's body wrapper.
- Inside an open popover: verb rows top-to-bottom → textarea → `Cancel` → `Send`.
- `:focus-visible` ring: `outline: 1px solid var(--primary); outline-offset: -1px` on every interactive element. Matches existing primitives (TaskCard, ThreadRow).
- **Focus return contract.** When the popover closes (via `Esc`, `Cancel`, `Send` success, or click-outside), focus returns to the `Request ▾` trigger button. Announced via `aria-live="polite"`.

### 6.3 Keyboard

- `Esc` while popover is open: cancel + close.
- `Cmd/Ctrl + Enter` while textarea is focused: submit (matches Composer convention from L1).
- Arrow up/down inside the popover: navigate the verb list (DaisyUI `menu` natural behavior).
- `Cmd/Ctrl + Click` on the thread chip: open in new tab (browser-native).
- **No keyboard verb shortcuts** (founder filter — L1, L11, L15 all share this).

### 6.4 Click → request commit

1. User opens the popover by clicking `Request ▾`.
2. User clicks a verb row. The row gets `--primary-dim` (0.08) background to indicate selection. NO send yet.
3. User optionally types in the textarea.
4. User clicks `Send` (or presses `Cmd/Ctrl + Enter` while the textarea is focused).
5. The `Send` button replaces with `Saving…` for **minimum 80ms** (perceptibility floor; matches L11 §5.4).
6. On server confirm:
   - Popover closes.
   - Focus returns to the `Request ▾` trigger.
   - The `Thread (N)` count animates from `n` → `n+1` over **150ms `--motion-medium`** opacity crossfade. This is the only positive feedback. (Lifted from variant A's spec but extended to `--motion-medium` per Fix 1 above.)
7. On error: popover stays open with a 1-line `--danger` strip above the buttons reading `Couldn't post — try again`. `Send` stays enabled. Strip clears on next input.

### 6.5 Click → thread open

1. User clicks the `Thread (N)` chip.
2. Page transitions over `--motion-medium` to the thread route (route push).
3. The selected card flashes a 200ms `--primary` left-border (the future-ready visual reservation from C, used here only as a navigation acknowledgment).
4. Browser back returns. Kanban scroll position restores via React Router's default behavior.
5. On return, the thread's read-state advances on the server (per L1); next render of the Kanban shows the chip in default (non-unread) state.

### 6.6 Drag is dead

- Cards have `cursor: pointer` (was `cursor: grab`). The grab cursor was the most-visible vestige of DnD. The pointer cursor signals the card body is now a click target (for the future task-detail navigation).
- No `data-droppable-column` attributes (the current `Kanban.tsx` carries them for E2E test selectors — those tests are deleted with the drag handler).
- `DndContext`, `DragOverlay`, `KeyboardSensor`, `PointerSensor`, `useDraggable`, `useDroppable` removed from the Kanban file.
- The 4-column grid layout is preserved — it's how tasks are *grouped* (`STATE_TO_COLUMN` survives), not how they're *moved* (`COLUMN_TO_STATE` is deleted).

### 6.7 Transitions

- Popover open: `--motion-fast` opacity + `transform: translateY(-4px) → 0`.
- Popover close: `--motion-fast` reverse.
- Verb row hover/select: `--motion-fast` background.
- Thread count chip increment: `--motion-medium` opacity crossfade (Fix 1).
- Selected-card-on-click flash border: `--motion-medium` opacity, then 200ms hold, then `--motion-medium` opacity-0.
- All transitions honour `prefers-reduced-motion` per the existing `tokens.css` reduced-motion block.

---

## 7. All states

| State | Trigger | Render |
|---|---|---|
| **Empty (column has no tasks)** | Existing Kanban behavior. | Existing `EmptyState` per column. Unchanged. |
| **Loading (action footer)** | The card has data but the verb list / unread count is in flight. | Footer renders a `[skeleton 60px]` for `Request ▾` and a `[skeleton 60px]` for the thread chip. Geometry is preserved so the card doesn't jump. |
| **Error (request post failed)** | Network failure on `Send`. | Popover stays open. `--danger` 1-line strip above the buttons: `Couldn't post — try again`. `Send` button stays enabled. |
| **Populated — typical** | Card has both verbs and a thread. | Full footer: `Request ▾` + `Thread (N)`. Hover/click as designed. |
| **Populated — terminal** | `task.state = done` or `killed`. | Footer collapses to `Thread (N)` only. `Request ▾` hidden. |
| **Populated — orphan task (no thread yet)** | Card has verbs but `threadCount === 0`. | Footer: `Request ▾` (left) + `Open thread` (right, mono caps small text). First request creates the thread implicitly. |
| **Populated — unread present** | `threadUnread > 0`. | Thread chip uses the unread `kind` (`--primary` dot prefix + primary tint background + `--text-hi` count). |
| **Populated — terminal AND no thread (rare)** | Both vanish. | Action footer slot is omitted. Card height shrinks by ~28px. |
| **Overflow — long verb list** | Up to 4 verbs per card per the verb-derivation table. | Popover height is unconstrained for ≤ 5 rows; max ~280px including textarea + buttons. Always fits in viewport. |
| **Overflow — long note** | Textarea grows to 3 lines, then scrolls. | Hard cap at 280 chars (a thread message, not a thesis). |
| **Overflow — popover near viewport edge** | Card in the rightmost column. | Popover auto-flips placement: `right: 0` instead of `left: 0`. Architect picks the boundary detection. |

---

## 8. Mobile adaptation

Per HIL §3.2, mobile is the three-tab layout. Team Board lives under the Work tab. The Kanban is single-column on phones (the existing `groupByBet` pattern adapts to group-by-column).

- Card layout unchanged.
- Action footer unchanged — both affordances visible.
- **Touch targets ≥ 44px**: at viewport ≤ 1024px, the action footer's vertical pad expands from `4px` to `var(--density-pad-y)` (12px) so the buttons clear AQ-015. Total footer height becomes ~50px on mobile.
- **Popover renders as a bottom sheet**: full-width, height auto, slides up from the bottom. DaisyUI `modal-bottom` substitution. Same content; verb rows ≥ 44px tall. Note textarea ≥ 16px font-size to prevent iOS zoom (AQ-005).
- **Thread chip**: same geometry; touch hit zone padded to ≥ 44×44 via invisible padding.
- **Thread route**: navigates to the full-screen thread (mobile L1 pattern).

---

## 9. Accessibility

- `Request ▾` button is `aria-haspopup="menu" aria-expanded={open}`.
- `Thread (N)` link carries `aria-label="Open thread (N messages, K unread)"` when `K > 0`, `aria-label="Open thread (N messages)"` when `K === 0`, `aria-label="Open thread"` when no thread.
- Popover is `role="dialog" aria-label="Request state change"`.
- Verb rows are `<button>` elements (not `<a>` or `<div>`).
- The note label is wired to the textarea via `<label htmlFor>`.
- `Saving…` strip is `aria-live="polite"`. Error strip is `role="alert"`.
- The unread dot is NOT the only signal — the chip's primary-tint background AND the `--text-hi` count both reinforce the unread state. Color is never the sole differentiator.
- Touch targets ≥ 44 CSS px on mobile (AQ-015).
- Mobile inputs ≥ 16px font-size (AQ-005).
- All text contrast ≥ 4.5:1 against the surface it sits on (AQ-010). The architect must verify `--text-mid` and `--danger` over `--surface-2` (popover surface) in both Lucid Dark and Lucid Light.
- Tabular numerals on the thread count (AQ-006).
- Uppercase mono labels (`REQUEST FROM`, `NOTE OPTIONAL`) carry `--tracking-caps` (AQ-007).
- Closed radius scale: card `--r2`, popover `--r2`, buttons `--r1`, count chip `--r-pill` (AQ-011).
- Motion durations from `--motion-fast` / `--motion-medium`; `prefers-reduced-motion` honoured (AQ-013, AQ-014).
- No emoji as iconography (AQ-105). The `▾` chevron is a typographic glyph. The unread dot is a `<span>` with CSS background, not a unicode glyph.

---

## 10. Component mapping (existing DS components used)

| L15 slot | Existing DS component / DaisyUI primitive used |
|---|---|
| Card body | existing `TaskCard` (no changes to title/meta/owner/cost rows) |
| Card action footer divider | inline `border-t border-[var(--border-subtle)]` |
| `Request ▾` trigger | DaisyUI `dropdown` + DaisyUI `btn` (ghost, xs) |
| `Thread (N)` link | existing `Tag` primitive (with new `kind` prop) wrapped in DaisyUI `btn-ghost btn-xs` |
| Popover container | DaisyUI `dropdown-content` |
| Popover label | mono caps `<span>` styled per existing convention |
| Verb rows | DaisyUI `btn` (ghost variant) full-width |
| Note label | mono caps `<label>` styled per existing convention |
| Note input | DaisyUI `textarea` |
| Popover commit buttons | DaisyUI `btn` (primary) + `btn` (ghost) |
| Thread surface | existing `ThreadShell` (L1) reached via route |
| Bottom sheet (mobile popover) | DaisyUI `modal-bottom` |

---

## 11. Locked rejection list (do not re-litigate)

`/architecture L15` and `/write-code L15` MUST refuse re-introduction of any of the following:

1. **Drag on Kanban tasks.** This is what L15 explicitly removes. The DnD scaffolding stays deleted.
2. **Drag on anything other than Canvas (Shaped → Committed).** Spec mandate.
3. **A new `MESSAGE_TYPES` enum value** for `request` / `state_change_request` / etc. The message is `plain` with the deterministic body format from §5.
4. **Direct state mutation** from the request affordance. The request POSTS ONLY to the thread — no `PATCH /api/tasks/:id/state` call from this UI.
5. **B's `…` overflow trigger** as the request affordance. Rejected for discoverability — the labelled `Request ▾` is the chosen surface.
6. **B's no-confirmation-on-Kill.** `Kill` (and every verb) goes through the pick-then-Send flow. Auto-send-on-pick is rejected for safety + L1-grammar consistency.
7. **B's "context goes in the thread, not the popover" stance.** The optional note in the popover is the right friction-cost answer.
8. **C's `TaskDrawer` as a Tier 3 component for L15.** Rejected for component-budget pressure. May ship in a future story under separate budget review.
9. **C's drawer auto-collapsing the Rail.** No side-effects on sibling regions.
10. **C's two stacked footers** (composer + action footer in the dock). The L15 surface is a popover-anchored-to-card; no dock means no two-footer ambiguity.
11. **Keyboard verb shortcuts** (`B` to mark blocked, `K` to kill, etc.). Founder filter — same rule as L1 / L11.
12. **Optimistic UI bragging** (toasts, "Sent!" confetti, animated checkmarks). The `Thread (N)` count delta is the only positive feedback.
13. **A persistent "recent requests" feed** at the page level. The thread itself is the audit trail.
14. **Per-card unread badge in the column header roll-up.** The per-card chip already carries the signal.
15. **Wrapping a DaisyUI primitive** (`btn`, `dropdown`, `textarea`) in a custom component just to apply L15 styles. The frontend rule is "use DaisyUI primitives directly."
16. **Adding a new `Tag` variant beyond `default` and `unread`.** The Tag's `kind` enum stays at 2 entries.
17. **Multi-select / bulk-request UI.** L15 is one card at a time. Batched workflows are a separate story.
18. **Emoji** (`📌`, `🔒`, `⏸️`, `⚠️`, etc.) as iconography in any L15 surface.

The L20 / future task-detail / future TaskDrawer stories that consume L15 inherit this rejection list. Do not re-introduce any of these in downstream stories without a concept-doc update first.

---

## 12. Open questions for the architect

These are concept-shaped, not visual:

1. **Where does the verb-list derivation live?** Designer suggestion: a pure function `requestableVerbsFor(state: TaskState): ReadonlyArray<RequestVerb>` in `@hyperidle/shared`, alongside `taskStateToStatus`. Architect picks final location and signature.

2. **How is the thread's `unreadCount` resolved on the Kanban?** L1 has server-side read-state; L15 needs that count per card. Architect picks: batched endpoint (`/api/threads/by-task?taskIds=…`), per-card fetch, or server-side projection on the existing `/api/teams/:teamId/tasks` response. Visual contract: the count is correct on first render and updates on Kanban remount after the user opens-and-returns from a thread.

3. **The thread route URL shape.** Designer suggestion: `/work/teams/:teamId/tasks/:taskId/thread`. Architect picks final shape; constraint is that the route mounts `ThreadShell` with `host_kind: "task"` and the task's id.

4. **The popover anchor library.** DaisyUI `dropdown` is what variant A's mockup used; CSS-only, no JS placement-flipping. Architect picks: stay with DaisyUI + accept rightmost-column edge-clip risk, OR pull in `@floating-ui/react` for placement-flip. Designer's preference: stay with DaisyUI; the verb list is short and rightmost-column collisions are infrequent.

5. **Implicit thread creation on first request.** L1's contract is "first message to a `host_kind` + `host_id` creates the thread." Architect verifies this works for `host_kind: "task"` and adds a server test if the path isn't already covered.

6. **Idempotency of the request post.** L1 uses `(threadId, sender, clientKey)` as the unique constraint per the SHARED contract. Architect picks the client-side `clientKey` generator (UUID v4 / ULID / timestamp+nonce) — same picker as L11.

---

## 13. Validation — how the L15 acceptance criteria map to this design

| L15 AC | Design contract |
|---|---|
| Drag-to-move is removed from the Team Board's Kanban; sensors and column-to-state mapping in `Kanban.tsx` and the `WorkTeam.tsx:116-120` move-task handler are gone. | §2.3 What's deleted. The DnD scaffolding leaves the file. `STATE_TO_COLUMN` survives as a read helper; `COLUMN_TO_STATE` deletes. `handleMoveTask` and the `onMoveTask` prop go. |
| Each task gains an affordance to request a state change OR open the task's attached thread. | §3 The card layout — `Request ▾` and `Thread (N)` in the action footer. |
| Selecting a request posts a message to the task's thread; the agent decides whether to honour. | §5 The posted message — `plain`-type message in the thread. No state mutation. |
| Drag survives ONLY between Shaped → Committed columns on the Canvas. | Out of scope for L15's deletion; `Canvas.tsx` is untouched. The architect's plan must not accidentally remove DnD from `Canvas.tsx`. |
| Vitest tests cover: drag is a no-op on task cards; request actions post messages to the right thread; opening a thread lifts it correctly. | Test surface: (a) integration test asserting that a `dragstart` event on a TaskCard does not fire `onMoveTask` (because no handler exists). (b) Vitest asserting the request popover's `Send` posts the right message-shape to the right thread id. (c) Vitest asserting the thread chip's click navigates to the L15 route. |
| Playwright e2e: try to drag a task → no-op → request a state change → message appears in the task's thread. | E2E flow: navigate to Team Board → attempt `mouse.move + mouse.down + mouse.move` on a card → assert no state change in the dom → click `Request ▾` → click `Mark blocked` → click `Send` → navigate to the thread route → assert the new `plain` message renders in the stream with the deterministic body format. |
| `bun run check` + `bun run lint` + `bun run test` all green; the full e2e suite stays green. | Standard. The architect's plan must include the deletions from the existing tests that asserted DnD behavior. |

---

## 14. Cross-references

- Story: `docs/work-packages/TRACK-L.md` § L15 (lines 511–540).
- Concept: `docs/concept/HUMAN_INTERFACE_LAYER.md` § 4.5 (Thread).
- L1 design: `docs/design-explorations/L1/approved.md` (the verdict-popover grammar this design mirrors).
- L11 design: `docs/design-explorations/L11/approved.md` (the L7 dispatch / motion / minimum-show pattern this design borrows).
- SHARED contract: `docs/work-packages/SHARED.md` (`host_kind: "task"`, idempotency via `clientKey`).
- Existing code being modified:
  - `packages/web/src/shell/Kanban.tsx` (DnD scaffolding deletion).
  - `packages/web/src/pages/WorkTeam.tsx` (lines 116–120 `handleMoveTask` deletion).
  - `packages/design-system/src/TaskCard.tsx` (slot extension for the action footer).
  - `packages/design-system/src/Tag.tsx` (`kind` prop extension).
- Variants:
  - `docs/design-explorations/L15/inline-action-row/` (variant A — the chosen base).
  - `docs/design-explorations/L15/thread-first-overflow/` (variant B — pull-in: unread chip).
  - `docs/design-explorations/L15/right-rail-drawer/` (variant C — pull-in: future-ready selected-border).
- HTML mockups: each variant's `mockup.html`.

---

## 15. Critique pass on the approved design

Final critique against the 9-dimension rubric (this is the gate before `/architecture` consumes the design):

| Dimension | Score | Notes |
|---|---|---|
| Visual hierarchy (V) | 8 | Title remains heaviest; new footer is recessed by a 1px subtle divider; popover dominates only when active. Unread thread chip pulls the eye across cards (B's pull-in). |
| Spacing & density (S) | 8 | All density tokens honoured. Footer's 4px vertical pad is sub-grid (chip-internal allowed per AESTHETICS.md). Popover internal pad on the 4/8 ladder. |
| Typography (T) | 8 | Two families (Geist + Geist Mono). Footer 12px UI weight 500. Mono caps labels at 11px with `--tracking-caps`. Tabular nums on the count. |
| Color / contrast (C) | 9 | Pure semantic tokens. `--primary` reserved for: selected-verb tint, unread chip, focus ring. `--danger` reserved for `Kill` text. Color is never the only signal. |
| Coherence (Co) | 9 | Net zero new components. Two existing primitives extend by one prop each. Popover grammar mirrors L1's verdict popover. |
| States completeness (St) | 8 | Empty / loading / error / populated / terminal / orphan / unread / overflow / mobile all designed. Edge cases (popover near viewport edge, terminal-no-thread) are explicitly handled. |
| Accessibility (A) | 8 | `aria-haspopup`, `aria-expanded`, `aria-live`, `aria-label`. Focus-return contract specified. Touch targets ≥ 44 on mobile via padding. Mobile inputs ≥ 16px. Color-plus-shape for the unread signal. |
| Anti-slop (As) | 9 | No emoji, no purple gradient, no oversized padding, no `rounded-2xl`, no glass, no decorative icons, no centered hero, closed radius scale, closed motion scale. The `▾` chevron is a typographic glyph. The popover is a working dropdown — not cute. |
| Concept fit (F) | 9 | Drag dies on Kanban (spec). Drag survives on Canvas (spec). Request posts a `plain` message to the L1 thread (spec). Re-uses ThreadShell. No new MESSAGE_TYPES. Verb list closed at 5. |

**Total: 76 / 90 (avg 8.4).**

Above the ≥ 7 gate. Design contract locks here.
