# Variant A — Inline Action Bar

**Constraint:** Stay close to existing patterns. All actions inline in the BetCard `actions` slot. ConsequencePreview is a DaisyUI `dialog`. Zero new components.

**Thesis:** The BetCard already has the slot; populate it. Destructive danger is communicated via button color (red) + label ("Kill bet") — no extra chrome needed until the user clicks.

## User task

Founder on WorkBet detail page sees the bet's action affordances directly in the BetCard — always visible, never hidden in a menu. Clicking a destructive action opens a non-skippable consequence preview dialog. Clicking "Adjust appetite" opens a compact form dialog. Clicking "Unblock" scrolls to and focuses the HostThreadSection Composer.

## Component composition

- **BetCard `actions` slot** — receives a horizontal `flex` row of DaisyUI `btn` elements. No new component; rendered from WorkBet page.
- **DaisyUI `btn btn-sm btn-ghost`** — Pause / Resume / Unblock (non-destructive actions). Text label only. No icons.
- **DaisyUI `btn btn-sm btn-error`** — Kill. Red, matching `--danger`. Text label "Kill bet".
- **DaisyUI `dialog`** (native `<dialog>` element, modal=true) — ConsequencePreview. Overlays the page; focus trapped inside. Contains: title (what action), consequence body (3 sections: Stops, Continues, Saved), reason textarea, Cancel + Confirm buttons.
- **DaisyUI `dialog`** — AppetiteDialog. Contains: select (3 values), reason textarea, Cancel + Confirm buttons.
- **HostThreadSection** (existing, no change) — Unblock scrolls to it and calls `.focus()` on the Composer's textarea.

## Information hierarchy

1. **BetCard** — title, product tag, status chip, appetite KeyValue (already there)
2. **Action bar** (in actions slot) — 3-4 buttons depending on bet status: [Pause | Resume] [Kill bet] [Adjust appetite] [Unblock]
3. **ConsequencePreview dialog** (on destructive action click) — dialog title, consequence sections, reason field, action buttons

## All states

**Empty (no valid actions — shipped/killed bet):** actions slot renders nothing. BetCard shows without any action affordances.

**In-progress bet:** `[Pause]  [Kill bet]  [Adjust appetite]  [Unblock]`

**Paused bet:** `[Resume]  [Kill bet]  [Adjust appetite]  [Unblock]`

**Consequence preview dialog (Pause):**
- Title: "Pause this bet?"
- **Stops:** All agent sessions will be suspended. No new tasks will start.
- **Continues:** The bet and its revision log are preserved.
- **Saved:** All completed tasks and their artifacts are unaffected.
- Reason field (required, placeholder: "Why are you pausing?")
- `[Cancel]` `[Pause bet]`

**Consequence preview dialog (Kill):**
- Title: "Kill this bet?"
- **Stops:** All agent sessions will be terminated immediately. All in-progress tasks move to killed.
- **Continues:** Nothing — this bet ends.
- **Saved:** All completed tasks and artifacts are preserved in the revision log.
- Reason field (required, placeholder: "Why are you killing this bet?")
- `[Cancel]` `[Kill bet]` (Kill button is btn-error)

**Appetite dialog:**
- Title: "Adjust appetite"
- Current appetite shown as text
- Select: `1 week / 2 weeks / 6 weeks`
- Reason field (required, placeholder: "What changed?")
- `[Cancel]` `[Save]`

**Loading (action submitting):** Confirm button shows DaisyUI `loading loading-spinner loading-xs`. Other dialog elements disabled.

**Error (action failed):** Error message below the reason field using `text-error` color. Dialog stays open.

## Behavior

**Hover:** btn-ghost buttons show `--surface-5` background at 80ms.

**Focus:** All dialog controls are in the focus trap. Tab cycles: Cancel → Confirm → first input → Cancel. Escape closes the dialog and cancels (same as Cancel).

**Keyboard:** Escape to cancel dialog. Enter does NOT submit (reason field is a textarea; Enter = newline). Confirm requires explicit button click.

**Dialog open:** `dialog.showModal()` — browser enforces focus trap natively. Backdrop clicks do not dismiss (non-skippable enforcement).

**Dialog close:** Only Cancel button or successful action completion closes the dialog.

**Motion:** Dialog open/close uses `--motion-slow` (250ms) opacity fade. The dialog element uses CSS `@starting-style` for the entry animation (transform: scale(0.97) → scale(1)).

**Unblock action:** `scrollIntoView({ behavior: 'smooth' })` on HostThreadSection root + `focus()` on Composer textarea. No dialog.

## Mobile adaptation

Three-tab mobile layout: WorkBet is accessible via the Work tab. The action bar wraps to two rows on narrow viewports (`flex-wrap: wrap; gap: 8px`). Dialog is full-width with bottom sheet feel (`width: 100%; max-height: 85vh; position: fixed; bottom: 0`). Not implemented in v1 — desktop first.

## Signature

**Always-visible, no-menu action bar** — the four actions are exposed directly in the BetCard at all times. The user never has to discover them in a dropdown. Destructive actions are visually differentiated by color at a glance.

## Trade-offs

**Bad at:** Bets with many valid simultaneous actions may feel crowded in the card. The action bar takes space even when the user has no intent to act. On narrow main columns (Rail expanded), the bar may wrap and the card grows taller.

**Good at:** Maximum discoverability. No hidden menus. Red "Kill bet" is unmissable. Non-skippable dialog enforces the consequence preview gate.
