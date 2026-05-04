# Variant B — Body opens thread; Request button surfaces state changes

## Signature

The whole card body is a button to open the task's thread. A small bottom strip carries a quiet thread-status hint on the left and a `Request` button on the right that opens a state-change menu. Two affordances, two grammars.

## User task

A founder reads an unread thread badge on a card, clicks the card body, drops into the thread, reads the agent's question, replies. Or — without entering the thread — clicks `Request` on the bottom strip, picks `Pause`, and a message is posted.

## Component composition

- `TaskCard` (extended) — outer wrapper becomes a `<button class="card-link">` with role-button semantics. Adds an `actions` slot at the bottom.
- The bottom strip is rendered inside `TaskCard` as a slot consumer. New child components are not required — the strip is a flex row of: a `<span>` thread summary + a DaisyUI `dropdown` `<button>` with a chevron.
- DaisyUI `dropdown` + `menu` for the request menu.
- `StatusChip`, `Tag`, `KeyValue` — unchanged.

## Information hierarchy

1. Card title (15 px medium) — top of the click target
2. Tag + StatusChip
3. Owner
4. Cost (`KeyValue`)
5. Thread strip:
   - Left: thread summary in mono 11 px (`<n> UNREAD`, `<n> MSG`, `NEW THREAD`)
   - Right: `Request <chevron>` ghost button

The thread is the most-clicked target — so it gets the body. Request gets the smaller surface because it's used less.

## States

| State | Render |
|---|---|
| Populated, no thread yet | Strip says `NEW THREAD`. Request button still works (creates the thread + posts the message). Body click creates the thread + opens the composer. |
| Populated, thread exists, all read | Strip says `<n> MSG` in `--text-lo`. |
| Populated, unread | Strip says `<n> UNREAD` in `--primary`. The card itself does NOT get a primary border or background — the discipline is "color is reserved for act-now"; unread is mid-priority, not danger. |
| Request in flight | Picked menu item shows `loading-xs`; on success, strip refreshes (`<n> MSG` increments by 1). |
| Agent rejected | Strip increments. No card-level state change. |
| Hover over body | `surface-4 → surface-5` background swap over `--motion-fast`. |
| Focus on body | 2 px outline at `--primary`, 2 px offset (DaisyUI `focus-visible` pattern). |

## Behavior

- **Drag.** Pointer-down on body fires the click handler synchronously. No DnD context. Cursor is `pointer` over the body — the card *is* a link.
- **Click on body.** Routes to the task thread surface. Implementation is a `<button>` (so keyboard Enter/Space activate too) wired to the existing route resolver from L18.
- **Click on Request button.** `event.stopPropagation()` keeps the card-link click from firing. Opens the menu beneath the strip.
- **Keyboard.** `Tab` lands on the card-link (one tab stop per card); next tab moves into the Request button. Enter on card-link opens thread; Space on Request opens menu.
- **ESC inside menu.** Closes menu, returns focus to Request button.
- **Motion.** Body hover: `background var(--motion-fast)`. Menu open: opacity 80 ms. No transforms.

## Mobile adaptation

- ≤1024 px: card touch target satisfies AQ-015 trivially (card height ≥ 80 px). Request button grows to 44 px height + 12 px horizontal pad.
- Three-tab mobile: Kanban under "Work" tab. Tapping the body opens the thread inline (full-screen sheet). Menu opens as a bottom sheet.

## The signature (one tell)

The card *body itself* is the affordance. Cursor: pointer. Hover: tint. The card behaves like a Linear / Notion list row.

## Trade-offs

- **Bad at undeclared intent.** A user who misses the bottom strip and just wants to pause has to click body → thread → composer → type "pause". Strip mitigates this but at small density some users will miss it.
- **Bad at column scanning.** Hover-tint on the body means cursor passes invisibly tint cards as the user mouses across columns; can feel noisy.
- **Good at discovery.** Linear-style body-clicks are the dominant convention in productivity tools. Founders pattern-match instantly.
- **Good at unread visibility.** The thread strip's mono-coloured count is high-density and still legible at glance.

## Wire copy

- Card-link `aria-label`: `"Open thread for <title>"`.
- Strip messages: `<n> UNREAD` (primary) | `<n> MSG` (text-lo) | `NEW THREAD` (text-lo).
- Request button label: `Request <chevron>`.
- Menu (no section header — only state changes; the body is the open-thread affordance):
  - `Pause` / `Hold`
  - `Mark blocked` / `Blocked`
  - `Resume` / `Move`
  - `Push to review` / `Review`
  - `Mark done` / `Done`
  - `Kill task` / `Killed` (danger)
- Thread message text — same as Variant A.
- `EmptyState` description swap — same as Variant A.
- Toast: `Request posted to thread` after a request fires (also fires when not in the thread surface — keeps the user oriented).

## Density behaviour

- Outer card uses `--density-card-pad` and `--density-card-gap` (TaskCard's existing tokens).
- Strip uses `--density-card-gap` for the inter-element gap. Strip border-top is `--border-subtle`, kept literal `1px` (chrome).
- Request button: 28 px height at default; 44 px at mobile. Text 12 px → 14 px under comfortable.

## Drag-no-op visual cue

**Affirmative substitute.** Drag is replaced by click-to-navigate. The pointer cursor and hover-tint actively signal "this opens something" so users don't even reach for drag. A user who tries to drag-select text inside the card title gets a text-cursor on the title only — the card body is a `<button>` so the browser doesn't try to drag it as content.
