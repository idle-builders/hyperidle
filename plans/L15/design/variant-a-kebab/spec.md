# Variant A — Kebab menu

## Signature

A single 28&times;28 kebab icon button on the card head. Open it for one menu that lists everything: open thread, request state changes, kill task. The card body is a non-interactive container.

## User task

A founder spots an in-flight task they want to pause. They click the card's kebab, choose "Pause", a thread message is posted, the menu closes, and the card stays where it is — only its status chip might change later when the agent honours the request.

## Component composition

- `TaskCard` (extended) — adds a `actions` slot in the head consumed by a single kebab button.
- DaisyUI `dropdown` + `menu` — the kebab opens a `dropdown-content` menu with role `menu` items.
- `StatusChip` — unchanged, communicates the task's lifecycle state.
- `Tag` — unchanged, communicates the parent bet.
- `KeyValue` — unchanged, communicates cost.
- A small `<span>` "thread dot" beside the title — neutral when the thread has only read messages, primary tint when there's unread. **No new component** — it's a 6px disc plus optional accent.

## Information hierarchy

1. Card title (15 px medium) + thread dot (6 px disc, primary if unread)
2. Kebab button (top-right of card head, 28 px square)
3. Tag (bet) + StatusChip (lifecycle)
4. Owner (12 px hi)
5. Cost (`KeyValue`)

The kebab is the **only** verb surface on the card. Card body click does nothing.

## States

| State | Render |
|---|---|
| Empty (no card) | `EmptyState` already shown by `Kanban` when a column is empty. Description copy changes from "Drag tasks here…" to "Tasks land here when the team commits to them." |
| Loading | Existing `Skeleton` row pattern; kebab placeholder absent (over-iconification AQ-113). |
| Populated, no thread yet | Thread dot omitted. Menu still shows "Open thread" — first click creates the thread, opens the composer. |
| Populated, thread exists, all read | Thread dot rendered in `--text-lo`. Menu shows "Open thread" with no count. |
| Populated, unread messages | Thread dot rendered in `--primary`. Menu shows "Open thread <count> unread" right-aligned in mono 11px. |
| Request in flight (between human pick and agent ack) | The chosen menu item shows an inline `loading-xs` spinner; menu stays open until the message is appended; on success, menu closes and a quiet toast "Request posted to thread" fires for `--motion-medium`. |
| Agent rejects | The thread carries the agent's reply. The card's StatusChip does not change. No card-level error indicator — the conversation lives in the thread, not on the card. |
| Disabled item (e.g., "Resume" for a task already in progress) | `aria-disabled="true"`, `--text-lo`, "Already in flight" in the right-side mono target column. Click is ignored. |

## Behavior

- **Drag.** Pointer-down on the card body triggers nothing. No `useDraggable`. Cursor stays `default`. The `DndContext`, `KanbanDropZone`, and `DraggableTaskCard` wrappers are deleted; `STATE_TO_COLUMN` keeps its forward map but `COLUMN_TO_STATE` and `resolveKanbanDrop` are deleted.
- **Click on kebab.** Opens the menu, sets `aria-expanded="true"`. `--motion-fast` opacity fade only (no scale, no slide).
- **Click outside / ESC.** Closes the menu. ESC returns focus to the kebab.
- **Arrow keys inside menu.** Up/Down move focus, Enter activates, ESC closes.
- **Tab focus order.** Card chrome is not a focusable target. `Tab` lands directly on the kebab inside each card (one stop per card).
- **Motion.** Menu open/close: opacity 0 → 1 over `--motion-fast` (80 ms). No layout transitions. Honours `prefers-reduced-motion`.

## Mobile adaptation

- At ≤1024 px, the kebab grows to 44×44 (AQ-015). The dropdown opens as a centered bottom sheet via DaisyUI `modal-bottom` rather than a popover, so the menu items get full-width 44 px row heights.
- Three-tab mobile layout: Kanban lives under the "Work" tab; the menu sheet covers the screen until dismissed.

## The signature (one tell)

Every card has exactly one verb-bearing element: the kebab. There is no second affordance to learn.

## Trade-offs

- **Bad at discovery.** A user new to the system sees a kebab and has to click it to learn what's there.
- **Bad at one-tap actions.** Common asks (Pause, Resume) take two clicks: open menu, choose item.
- **Good at density.** Card chrome stays at five rows; nothing competes with the title.
- **Good at extensibility.** Adding a new request verb is a menu-item addition, not a layout change.

## Wire copy

- Kebab button `aria-label`: `"Task actions for <title>"`.
- Menu sections: `"Request state change"` (uppercase mono small).
- Menu items (verb / right-aligned target):
  - `Open thread` / `<n> unread` (or empty)
  - `Pause` / `Hold`
  - `Mark blocked` / `Blocked`
  - `Resume` / `Move`
  - `Push to review` / `Review`
  - `Mark done` / `Done`
  - `Kill task` / `Killed`  (rendered with `text-[var(--danger)]`)
- Thread message text on selecting a request:
  - Pause → `Requesting: pause this task.`
  - Mark blocked → `Requesting: mark this task as blocked.`
  - Resume → `Requesting: resume this task.`
  - Push to review → `Requesting: push this task to review.`
  - Mark done → `Requesting: mark this task as done.`
  - Kill task → `Requesting: kill this task.`
- Toast: `Request posted to thread` (mono 11 px, --text-lo).
- Empty `EmptyState` description swap: from `"Drag tasks here or create new ones to populate this column."` to `"Tasks land here when the team commits to them."`

## Density behaviour

- Card uses `--density-card-pad` and `--density-card-gap` via TaskCard's existing tokens (no change there).
- Kebab button is density-static (28 px square at compact/default; 44 px at mobile). It is brand-chrome-like — list-row icon-only buttons stay literal per K11 audit.
- Menu items are 14 px text with 8 px vertical pad → 32 px row height; comfortable bumps to 16 px text with 12 px pad → 40 px.

## Drag-no-op visual cue

**Deliberate absence.** No grab cursor, no dotted drop-zone, no "drag here" hint. The card looks like a static card. A user attempting a drag gets text-selection on the title (browser default) and the card does not move. The implication is that the previous drag-to-move gesture is simply not part of the grammar — there is nothing to discover here.
