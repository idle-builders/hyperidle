# Variant A — Minimal Menu

## User story

A founder scanning the Team Board taps a small icon on a TaskCard, picks "Request: Blocked" or "Open thread", and the request flies as a `plain` thread message. One click for the common path; the card stays put.

## Component composition

- `TaskCard` (existing, Tier 2). The `actions` slot now renders a single icon button.
- DaisyUI `dropdown` + `menu` (used directly, never wrapped — per `frontend.md`).
- DaisyUI `btn btn-ghost btn-xs btn-square` for the icon trigger.
- Optional one-line note: a DaisyUI `input` appears as the FIRST item inside the menu (no second surface). `Enter` sends with note; clicking a target sends without.
- Confirmation: a DaisyUI `toast` (`bottom-end`, auto-dismiss `var(--motion-slow)*8` = 2s).

No new component invented. The 19-component budget is unchanged.

## Information hierarchy (top → bottom of the dropdown)

1. **"Request"** — uppercase mono `KeyValue`-style label (text-lo, 11px, +0.05em tracking) — section header for state requests.
2. **State target list** — one `<li><button class="menu-active">…` per valid target. Three to five rows max, gated on current task state (see "State gating" below).
3. **Divider** (`<li><hr/></li>`).
4. **"Open thread"** — full-width menu item with the same row height; opens the task's thread in the Rail.
5. **"Add note"** — toggles a small `input` (in the menu). When the input is open, hitting `Enter` posts the note as a `plain` message (no state target). Clicking a state target while the note is non-empty posts the state request WITH the note attached.

The icon trigger sits in the TaskCard `actions` slot (top-right of the card, adjacent to the StatusChip row would crowd it, so it lives on its OWN row at the card footer when the card is wide enough; on narrow cards it sits absolute top-right with `position: absolute; top: var(--density-card-pad); right: var(--density-card-pad)`).

## State gating (which targets to show)

Source of truth: TaskState union (8) → human-requestable subset (5) → minus current state.

| Current task state | Targets shown (in order) |
|---|---|
| `proposed` | _menu hidden — humans don't request on un-accepted pitches; only "Open thread" + "Add note" appear_ |
| `accepted` | Start, Block, Abandon |
| `hold` | Resume, Abandon |
| `in_progress` | Block, Review, Done, Abandon |
| `blocked` | Resume, Abandon |
| `review` | Done, Block, Abandon |
| `done` | Abandon |
| `killed` | _menu hidden_ |

Label-to-state mapping (UI shows the verb, not the state name):
- "Start" → `in_progress`
- "Resume" → `in_progress`
- "Block" → `blocked`
- "Review" → `review`
- "Done" → `done`
- "Abandon" → `killed`

This isn't a state-machine — it's the request the human is making. The agent decides whether to honor it.

## All states

| State | Render |
|---|---|
| Empty (no requestable targets, e.g. `proposed`) | Menu still opens; only "Open thread" + "Add note" rows appear. No "Request" header. |
| Loading (request in flight) | Trigger icon swaps to a 12px DaisyUI `loading loading-spinner loading-xs`; trigger is `aria-busy="true"`. |
| Error (POST failed) | Toast: `Couldn't reach the agent. Try again.` — variant `alert-error`. The trigger returns to its idle state. |
| Populated (success) | Toast: `Sent to {ownerName}.` — variant `alert-success` (uses `--ok` not green). Auto-dismiss. The card's StatusChip does NOT change. |
| Note-mode | Inside the menu, the input is focused, has 16px font (mobile zoom guard, AQ-005), `aria-label="Note for the agent"`. |
| Disabled (network offline) | Trigger remains visible, opens a menu containing only `<li class="menu-disabled">` for state targets and the input is read-only. "Open thread" still works (read-only thread fetch). |

## Behavior

- **Trigger:** click or `Enter`/`Space`. The icon is a 16px ellipsis (`⋯`) — actually rendered as three `<span class="dot">` to avoid emoji and to scale with `var(--density-text)`.
- **Hover:** trigger background → `var(--surface-5)` over `var(--motion-fast)`.
- **Focus:** trigger gets a 1px `var(--primary)` outline, `outline-offset: -1px` (matches TaskCard).
- **Open menu:** appears below-right of the trigger; transition `opacity` + `transform: translateY(-2px) → 0` over `var(--motion-medium)`. Honors `prefers-reduced-motion`.
- **Keyboard inside menu:** native `<menu>` arrow-key roving. `Enter` activates. `Esc` closes and returns focus to the trigger.
- **Focus trap:** none — DaisyUI dropdown is a popover, not a dialog. Click-outside closes.
- **Stop-propagation:** the trigger handler MUST `event.stopPropagation()` so clicking the icon doesn't also fire the TaskCard `onClick` (which navigates to task detail).
- **Requesting:** the menu posts to `POST /api/threads/{taskThreadId}/messages` with `{ type: "plain", text: <generated request copy>, refs: [{ kind: "task", id: <taskId>, requestedState: <enum> }] }`. The architect resolves the exact `refs` shape; the design fixes that the message is `plain` and the state intent is structured-not-prose.
- **Generated request copy:** `Please move "{taskTitle}" to {targetVerb}.` If a note is present: `Please move "{taskTitle}" to {targetVerb} — {note}.` First-person plural is wrong; this is the human asking the agent.
- **Open thread:** dispatches a `rail.open-thread` event with the task's thread ID. The Rail surface (existing) handles render. No new component.

## Mobile adaptation

- Trigger is 32px square at viewport ≤ 1024px (touch target ≥ 44px is honored by extending the hit area with `position: relative; inset: -6px` rather than enlarging the visible icon — keeps card density).
- Menu opens as a DaisyUI `modal-bottom`-style sheet (uses the existing modal primitive in fullscreen-bottom mode) on screens ≤ 640px so the menu doesn't get clipped by the tab bar. State labels become the same height (44px) menu rows.
- The note input becomes 16px (AQ-005).

## Signature

A barely-visible 16px ellipsis on the card. Tap it, see a verb list, click one, you're done. The card never lies about state — no optimistic chip swap. Density and speed beat completeness.

## Trade-offs

- **Bad at** discoverability for new users — the icon is intentionally tiny.
- **Bad at** signalling that the chosen verb is a *request*, not a command (we lean on the toast copy "Sent to {owner}" + no chip change to communicate this).
- **Bad at** richer notes — note is a single line; longer context wants the thread directly.
