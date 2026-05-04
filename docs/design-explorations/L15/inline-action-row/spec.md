# L15 — Variant A: Inline action row

> The card grows a quiet bottom-edge action row carrying two affordances: `Request ▾` (popover) and `Thread (N)` (link). Nothing leaves the column. Zero new components.

## Signature

A 28px-tall **action footer** at the bottom of the card, separated from the body by a 1px subtle divider, carrying two links: `Request ▾` (left, opens a 240px popover anchored to the trigger) and `Thread (N)` (right, opens the attached thread in a sheet). The footer is always visible; it never collapses. The popover is the only thing that ever leaves the card silhouette, and it's anchored to the card it came from.

## User story

A founder scanning the Team Board notices `Implement login endpoint` has been `in_progress` for two days. She clicks `Request ▾` on that card, picks `Mark blocked`, optionally types `auth provider down?` in the inline note, hits `Send request`. The popover closes; the card stays where it is; the agent gets a thread message. The whole interaction took 4 seconds and her cursor never left the column.

## Component composition

| Component | Tier | Slot / props | Composes |
|---|---|---|---|
| `TaskCard` (extended) | 2 (existing — slot added) | `{ ...existing, requestable: VerbList, threadCount: number, onRequest, onOpenThread }`. New `actions` slot at the card's footer renders the action row. | DaisyUI `dropdown` (popover anchor), `btn-ghost btn-xs`, `Tag` |
| `TaskRequestPopover` | (NOT a new component — it's `<details>` markup inside DaisyUI `dropdown`) | A 240px popover containing: the verb list (each row is a `btn-ghost`), an inline `<textarea>` for the optional note, a primary `Send request` button, and an `Esc` to close hint. | DaisyUI `dropdown-content`, DaisyUI `textarea`, DaisyUI `btn` (primary + ghost) |
| `Kanban` (modified) | 3 (existing) | `onMoveTask` removed; `DndContext`/`DragOverlay`/`useDraggable`/`useDroppable` wrappers removed. The cards live in a plain layout div per column. | TaskCard, EmptyState |
| `ThreadShell` | 3 (existing — entry point is a sheet route) | Mounted via `/work/teams/:teamId/tasks/:taskId/thread` route on click of the `Thread (N)` link. | Existing L1 family |

**Net component change.** **Zero.** `TaskCard` gets a slot; `Kanban` loses code; the popover is markup inside the existing DaisyUI `dropdown`; the thread is the existing `ThreadShell` reached via a route.

## Information hierarchy (the new card layout)

The card body keeps its existing four rows (title, meta, owner, optional cost). Below that, separated by a 1px `--border-subtle` rule, a new **action footer**:

```
┌────────────────────────────────────────────┐
│ Implement login endpoint                   │  ← title (existing)
│ [Auth]  [HEALTHY]                          │  ← betTag + StatusChip (existing)
│ Dev Agent 1                                │  ← owner (existing)
│ COST              $4.20                    │  ← optional cost (existing)
├────────────────────────────────────────────┤  ← 1px --border-subtle
│ Request ▾              Thread (3)          │  ← NEW — the action footer
└────────────────────────────────────────────┘
```

The footer pads `4px var(--density-card-pad)` (vertically tighter than the body). The two links share the row. Both are `btn-ghost btn-xs`. `Thread (3)` reads as `Thread` + `Tag(3)` so the count is visually a chip — discoverable at a glance.

When the task has no attached thread (zero messages), `Thread` reads `Open thread` (no count chip). When the task is `done`/`killed` and has no valid request verbs, the `Request ▾` button is hidden and only `Open thread` shows — the footer never empties (the thread is always reachable for audit purposes).

### The popover layout (240px wide, anchored to the trigger)

```
┌──────────────────────────────────┐
│ REQUEST OF DEV AGENT 1           │  ← mono caps label, --text-lo
├──────────────────────────────────┤
│  Mark blocked                    │  ← btn-ghost, full-width, left-aligned
│  Pause                           │
│  Ready for review                │
│  Kill                            │  ← --danger text only on kill
├──────────────────────────────────┤
│ NOTE (optional)                  │
│ ┌────────────────────────────┐   │
│ │ auth provider down?        │   │  ← single-line textarea, grows to 3
│ └────────────────────────────┘   │
│             [ Cancel ]  [ Send ] │
└──────────────────────────────────┘
```

The verb selection is **pick + send** (two-step within the popover), NOT auto-send-on-pick. This:
- Lets the user attach a one-line context note without forcing a second prompt.
- Mirrors the L1 verdict-bar pattern (pick → confirm popover) and feels familiar.
- Prevents fat-finger `Kill` requests with no context.

`Cancel` and `Esc` close without posting. `Send` posts the message and closes.

The verb list is **filtered by current state** per the brief (Probe 2 table). A `done` card surfaces only `Kill` (greyed if already terminal — though `done` cannot be killed). An `accepted` card surfaces `Pause`, `Mark blocked`, `Kill`. The popover never renders an empty list — if no verbs apply, the `Request ▾` trigger is hidden (see footer rule above).

## All states

### Empty (column has no tasks)
Unchanged from current Kanban behavior. The column shows the existing `EmptyState`.

### Loading
The action footer renders skeleton: `[skeleton 60px] ─── [skeleton 60px]`. Footer geometry stays so the card doesn't jump on data arrival.

### Error (request post failed)
The popover stays open. A `--danger` 1-line strip appears above the `Cancel`/`Send` buttons: `Couldn't post request — try again`. The `Send` button stays enabled. No toast. Clearing the strip happens on the next input change.

### Populated — typical
As above. Two affordances always visible.

### Populated — terminal task (`done` / `killed`)
Footer collapses to `Open thread (3)` only. `Request ▾` hidden.

### Populated — orphan task (no thread yet)
Footer reads `Request ▾    Open thread`. Clicking `Open thread` lifts the empty thread (per L1's `populated-empty` state — banner + `EmptyState` + composer). The first request the founder posts becomes the thread's first message.

### Overflow — many in-flight requests
The popover is per-card. It can only have one `Request ▾` open at a time across the page; opening another auto-closes the first (DaisyUI `dropdown` natural behavior). If the founder fires multiple requests in succession (one per card, six cards), each click is independent — there is no batched UX. This is a deliberate trade-off (see § Trade-offs).

### Overflow — long verb list (impossible per brief — max 3 simultaneous)
The popover height is unconstrained for ≤ 5 rows; 5 rows + textarea + buttons = ~280px tall. Always fits in viewport.

### Overflow — long note
The textarea grows to 3 lines, then scrolls. Hard cap at 280 chars (a thread message, not a thesis).

### Promoted — thread open
Clicking `Thread (3)` navigates to the route — the page transitions to the thread view (existing L1 surface). Back navigation returns the user to the same scroll position on the Team Board (browser nav stack).

## Behavior

### Hover
- Card: existing `--surface-4 → --surface-5` lift. Unchanged.
- Action footer link: text colour shifts from `--text-mid` to `--text-hi` on hover; no background.
- Popover open: the trigger button shows `--surface-ghost` background to anchor the popover visually.

### Focus
- Tab order: card title (focusable for accessibility — `aria-label="Open task: <title>"`) → `Request ▾` button → `Thread (N)` link → next card.
- Inside an open popover: verb list (top to bottom) → textarea → `Cancel` → `Send`.
- `:focus-visible` ring: `outline: 1px solid var(--primary); outline-offset: -1px` on every interactive element (matches existing primitives).
- **Focus return.** When the popover closes (via `Esc`, `Cancel`, `Send` success, or click-outside), focus returns to the `Request ▾` trigger button.

### Keyboard
- `Esc` while popover is open: cancel + close.
- `Cmd/Ctrl + Enter` while textarea is focused: submit (matches Composer convention from L1).
- No verb shortcuts (founder filter).
- Arrow-up / arrow-down inside the popover navigates the verb list (DaisyUI `menu` natural behavior).

### Click → request commit
1. User clicks a verb. The verb row shows `--primary` background tint to indicate selection (no auto-send).
2. User optionally types in the textarea.
3. User clicks `Send` (or `Cmd+Enter`).
4. The `Send` button shows `Saving…` for ≥ 80ms (perceptibility floor — same as L11 § 5.4).
5. On server confirm: popover closes, focus returns to the trigger. No toast. The `Thread (N)` count chip **increments by 1**, animating from `(3)` → `(4)` over `--motion-fast` opacity crossfade. This is the only positive feedback — the count delta tells the user the message landed.
6. On error: § Error state above.

### Transitions
- Popover open: 80ms `--motion-fast` opacity + `transform: translateY(-4px) → 0`. (Matches L1's verdict popover.)
- Popover close: 80ms reverse.
- Verb row hover: 80ms `--motion-fast` background.
- Thread count chip increment: 80ms opacity crossfade. No bounce, no confetti.
- Card itself: NO motion. The card is a static container — drag is dead, hover is the only treatment.

### Drag is dead
- Cards have `cursor: default` (was `cursor: grab`). The grab cursor is the most visible vestige of DnD; removing it is the visual signal that the affordance is gone.
- No `data-droppable-column` attributes. No `useDroppable`/`useDraggable`. Plain layout.
- `DndContext` / `DragOverlay` / `KeyboardSensor` / `PointerSensor` removed from the Kanban file entirely.
- The 4-column grid layout is preserved — it's how tasks are *grouped*, not how they're *moved*.

## Mobile adaptation

Per HIL §3.2, mobile is the three-tab layout. Team Board lives under the Work tab. The Kanban is single-column on phones (collapses 4 columns into 1; columns become collapsible groups via the existing `groupByBet` pattern adapted to group-by-column).

- Card layout unchanged.
- Action footer unchanged — both links visible.
- Popover renders as a **bottom sheet** (full-width, height auto), not anchored — DaisyUI `modal`/`drawer` substitution. Same content, larger touch targets (verb rows ≥ 44px tall per AQ-015).
- `Thread (N)` link navigates to the thread tab full-screen — no back-by-side.
- Composer in the popover textarea is at least 16px font-size to prevent iOS zoom (AQ-005).

## Component mapping (existing DS components used, in order of appearance)

| Slot | Component used |
|---|---|
| Card body | existing `TaskCard` (no changes to title/meta/owner/cost rows) |
| Card action footer divider | 1px `--border-subtle` rule |
| Action footer | DaisyUI `btn-ghost btn-xs` × 2 |
| Thread count badge | `Tag` (the existing Tier 1 primitive) |
| Popover anchor + container | DaisyUI `dropdown` + `dropdown-content` |
| Popover label | mono caps `<span>` styled per existing convention |
| Verb list rows | DaisyUI `btn-ghost` full-width |
| Note input | DaisyUI `textarea` |
| Popover commit buttons | DaisyUI `btn` (primary) + `btn-ghost` |
| Thread surface | existing `ThreadShell` (L1) reached via route |

## Behavior contracts (architect-relevant invariants)

1. **The verb list is derived from `task.state` via a pure function**, not from a stored allowlist. The brief's Probe 2 table is the source.
2. **The posted message is a `plain` message** in the task's thread. Body format:
   ```
   @<actor> requested: <verb-label>
   <optional one-line note>
   ```
   No new `MESSAGE_TYPES` enum value.
3. **No state mutation.** The request DOES NOT POST to a state-change endpoint. It posts ONLY to the thread. The agent's loop is what eventually changes the state — or doesn't.
4. **The thread route is `/work/teams/:teamId/tasks/:taskId/thread`** (path is a designer suggestion; architect picks final). It mounts `ThreadShell` with a `host_kind: "task"` thread.
5. **Drag is removed entirely from `Kanban.tsx`**. The four-column layout is grouping-only. `STATE_TO_COLUMN` survives as a *read* helper; `COLUMN_TO_STATE` is deleted.
6. **The action footer is always present** unless the card is `done`/`killed` AND has zero thread messages — a state that, in practice, almost never occurs.

## Trade-offs (what this variant is bad at)

- **No batched/multi-card requests.** If the founder wants to "pause everything in the API team for the next hour", she clicks each card. There is no select-all + apply.
- **The popover is per-card and modal-feeling.** Click-outside dismissal helps, but a user who opens five popovers across an inattentive 30 seconds has to repeat clicks.
- **The thread surface is a route hop.** Users coming from a dock-style mental model (Linear, Notion) may expect the thread to appear *next to* the card, not replace the page. Variant C explicitly addresses this; variant A leaves it as a known cost.
- **Zero affordance for "what verb did I just send" history.** The increment of `Thread (N)` is the only acknowledgment. A power user might want a recent-actions trail; this variant leaves that to the thread itself.
- **Mobile bottom sheet is a context shift.** On desktop, the popover anchors to the card; on mobile, it slides up from the bottom. The grammar diverges. Familiar for mobile but noted.

## Anti-convergence audit (vs. B and C)

| Axis | This variant (A — inline) | B (overflow + thread-first) | C (right-rail drawer) |
|---|---|---|---|
| Hierarchy | Request first (text-left), Thread second (text-right). | Thread first (chip + count), Request second (`…` icon). | Both in the dock; equal weight. The card has no primary affordance. |
| Density | Highest — everything stays inline. | Medium-high (less footer chrome). | High in the column, medium in the dock (~360px sidebar). |
| Action surface location | Anchored popover ON the card. | `…` menu + thread-sheet over the page. | Right-rail dock — fixed position. |
| Composition | TaskCard + DaisyUI dropdown. Zero new pieces. | TaskCard + DaisyUI dropdown + thread route. | TaskCard + new shell-level `TaskDrawer` region. |
| Volume strategy | One pop, one send, one card at a time. | Open the thread once, do everything from there. | One dock open at a time; clicking another card replaces. |

A vs B differ on hierarchy / action surface / composition / volume strategy (4 axes).
A vs C differ on hierarchy / action surface / composition (3 axes).

Both pairs clear the 3-axis anti-convergence floor.

## Tokens & rules audit

- All paddings consume density tokens (`--density-card-pad`, `--density-gap`, `--density-pad-y`). The action footer's vertical pad is a literal `4px` — sub-grid (chip-internal scale per AESTHETICS.md).
- All colours are semantic (`--text-mid`, `--text-hi`, `--text-lo`, `--surface-ghost`, `--border-subtle`, `--primary`, `--danger`).
- All radii on the closed scale: card `--r2`, popover `--r2`, buttons `--r1`, count chip `--r-pill`.
- Motion durations from `--motion-fast` only — no `--motion-medium`/`--motion-slow` use (this is small-surface; instant feedback is the right register).
- No emoji as iconography. The `▾` chevron is a typographic glyph.
- No `rounded-2xl`/`rounded-3xl` (AQ-101).
- No purple/indigo gradients (AQ-102).
- No oversized padding (AQ-103) — densest variant.
- No 3-column card grid (AQ-108) — the Kanban is the existing 4-column grid, by design.
- Touch targets: ≥ 44px on mobile (AQ-015) via the bottom-sheet conversion.
- Tabular numerals on the `Thread (N)` count (AQ-006).
