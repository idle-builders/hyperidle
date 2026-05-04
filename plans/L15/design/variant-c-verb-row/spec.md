# Variant C — Inline verb row

## Signature

A pinned row of named verb buttons under each task's metadata: `Thread`, plus 1–2 state-relevant request verbs (`Pause` / `Block` / `Resume` / `Reopen`), plus a `...` overflow menu for the rest. Verbs are spelled out, not hidden behind icons.

## User task

A founder sees `JWT refresh logic` is in review with three unread messages. The card already shows `Thread (3)`, `Pause`, `Block`, `…`. They click `Thread`, read, reply. Or click `Pause` directly — one click; no menu.

## Component composition

- `TaskCard` (extended) — `actions` slot consumed by a verb-row.
- The verb-row is a flex row of DaisyUI `btn-ghost btn-xs` instances + an overflow `<button>` opening a DaisyUI `dropdown`. **No new component** — it's a layout slot inside TaskCard.
- `StatusChip`, `Tag`, `KeyValue` — unchanged.

## Information hierarchy

1. Card title
2. Tag + StatusChip
3. Owner
4. Cost
5. Verb row:
   - `Thread <count?>` (primary tint when unread, else ghost)
   - State-relevant verb #1 (Pause when in_progress; Resume when paused/blocked)
   - State-relevant verb #2 (Block / Done / Reopen depending on state)
   - `…` overflow (the rest: Push to review, Mark done, Kill task, etc.)

## State-aware verb selection

| Card's TaskState | Inline verbs (in order) | Overflow |
|---|---|---|
| `proposed` / `accepted` (Planned) | Thread, Pause, Block | Push to review, Mark done, Kill |
| `in_progress` (In Progress) | Thread, Pause, Block | Push to review, Mark done, Kill |
| `review` (In Progress) | Thread, Pause, Block | Push to review (disabled), Mark done, Kill |
| `blocked` (Blocked) | Thread, Resume, Kill (danger tint) | Push to review, Mark done |
| `done` (Done) | Thread, Reopen | Kill |

The selection is deterministic from the state — no founder choice. The overflow always carries the un-shown verbs so nothing is unreachable.

## States

| State | Render |
|---|---|
| Populated, no thread | `Thread` button shows ghost; no badge. |
| Populated, thread exists, all read | `Thread` button shows ghost; no badge. |
| Populated, unread | `Thread` button shows primary tint with right-side count badge. |
| Request in flight | Selected verb shows `loading-xs` inline; button disabled until response. |
| Agent rejects | No card-level visual; conversation lives in the thread. |
| Hover on a verb | Background `surface-5`, border `--border-emphasis`. |
| Disabled verb (e.g. Push-to-review on already-review) | `aria-disabled`, `--text-lo`, `cursor-not-allowed`. |

## Behavior

- **Drag.** Pointer-down on card body does nothing. Cursor is `default` over body, `pointer` over verbs.
- **Click on `Thread`.** Routes to the task's thread surface.
- **Click on a state verb.** Posts a `plain` message into the task's thread; quiet toast confirms.
- **Click on `...`.** Opens overflow menu beneath the row.
- **Keyboard.** `Tab` walks the row left-to-right: Thread, verb 1, verb 2, overflow. Each is a focusable `<button>`. Enter activates. ESC closes the overflow menu.
- **Focus management.** Visible focus ring on whichever verb has focus.

## Mobile adaptation

- ≤1024 px: each verb button grows to 44 px height. The row may overflow horizontally — `overflow: hidden` clips and the overflow menu carries everything that doesn't fit. The first three buttons are the priority verbs and stay visible.
- Three-tab mobile: Kanban under "Work". Verb row stays inline; overflow menu opens as bottom sheet.

## The signature (one tell)

Every task carries the same verb-row footprint, with verbs spelled out. There is no kebab-only path.

## Trade-offs

- **Bad at density.** Adds ~36 px of vertical chrome to every card. A 7-card column is now ~252 px taller than under Variant A.
- **Bad at glance.** The eye lands on the verbs as much as the title — the card has two competing visual weights.
- **Good at discovery.** Founder onboarding cost is zero — the verbs say what they do.
- **Good at one-click intent.** Pause/Resume/Block are a single click, no menu.
- **Good at consistency.** The verb row matches the verdict-grammar pattern from review surfaces (one row of named verbs, primary action highlighted).

## Wire copy

- Verb labels: `Thread`, `Pause`, `Block`, `Resume`, `Reopen`, `Kill` (no full-stop; no description copy in the inline pill).
- Overflow `aria-label`: `"More request actions"`.
- Overflow menu items same as Variant A's menu but without "Open thread" (Thread is already inline).
- Thread message text — same as Variant A.

## Density behaviour

- Verb row uses `gap-1` (4 px) and `--density-card-gap` for padding-top distance from the divider.
- Verb buttons are 28 px height at default; 44 px at mobile (AQ-015).
- Comfortable density: button height bumps to 36 px, font 14 px (still uses `--density-text` indirectly via the button class which inherits density).

## Drag-no-op visual cue

**Affirmative substitute.** Drag is replaced by always-on verbs. A user who used to drag the card to "Done" now reaches for the visible `Mark done` button (in the overflow when it isn't a primary state verb). No grab cursor anywhere.
