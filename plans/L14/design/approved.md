# L14 — Approved Design

**Based on:** Variant A (Inline Action Bar) + cost-context from Variant B

---

## What this is

Bet-level human actions wired into the WorkBet detail page. Four actions: Pause (→ Resume), Kill, Adjust appetite, Unblock/comment. Destructive actions gated by a non-skippable consequence preview dialog. All actions recorded in the revision log.

---

## Component mapping

| Surface | Component | Prop / usage |
|---|---|---|
| BetCard header in WorkBet | `BetCard` (existing) | `actions` prop slot — receives the action bar render |
| Action bar | `div` with DaisyUI `btn` | Rendered into `BetCard.actions`; not a new component |
| Pause / Resume / Unblock buttons | DaisyUI `btn btn-xs btn-ghost` | Ghost variant, text only |
| Kill bet button | DaisyUI `btn btn-xs btn-error` | Error variant = `color: var(--danger)` |
| Consequence preview (Pause/Kill) | DaisyUI native `<dialog>` via `showModal()` | Non-skippable; focus trap native |
| Appetite dialog | DaisyUI native `<dialog>` via `showModal()` | Select + reason textarea |
| Unblock | No new component | Scroll + focus HostThreadSection Composer |

**Component budget impact: 0 new components.**

---

## State-driven action bar

| Bet status | Actions shown |
|---|---|
| `in_progress` | Pause — Adjust appetite — Unblock — Kill bet |
| `behind` | Pause — Adjust appetite — Unblock — Kill bet |
| `blocked` | Pause — Adjust appetite — Unblock — Kill bet |
| `paused` | Resume — Adjust appetite — Unblock — Kill bet |
| `committed` | Kill bet only |
| `shaped` | Adjust appetite — Kill bet |
| `review` | Kill bet only |
| `shipped` | (no actions) |
| `killed` | (no actions) |

When no actions are available (shipped/killed), the `actions` slot renders `null` — no divider, no empty row.

---

## All states

### Empty (shipped or killed bet)
BetCard renders without the action bar divider. Actions slot returns `null`.

### Loading (action submitting)
Confirm button shows DaisyUI `loading loading-spinner loading-xs` inline. All dialog controls set `disabled`. Cancel button stays enabled.

### Error (action failed)
Error message appears below the reason textarea, colored `var(--danger)`, sized 12px. Dialog stays open. Example: "Failed to pause bet. Try again."

### Populated — action bar (in_progress bet)
```
[ Pause ]  [ Adjust appetite ]  [ Unblock ]  [ Kill bet ]
```
Separated from card content by `border-top: 1px solid var(--border-subtle)` and `padding-top: 4px`.

### Consequence preview dialog — Pause
- `aria-labelledby` links to title ID
- Title: "Pause this bet?" — `var(--text-hi)`, 15px, 600
- **Stops** section: "All agent sessions will be suspended. No new tasks will start."
- **Continues** section: "The bet, its tasks, and revision log are preserved in full."
- **Saved** section: "All completed tasks and artifacts are unaffected."
- **Cost context block** (conditional on `bet.costActual !== null`): `var(--surface-3)` background, `COST` mono label, value string e.g. "$12.40 spent this cycle — no additional spend while paused."
- Reason textarea — required, placeholder: "Why are you pausing this bet?"
- Footer: `[Cancel]` (ghost) `[Pause bet]` (surface-5 background)

### Consequence preview dialog — Kill
- Title: "Kill this bet?" — colored `var(--danger)`
- **Stops** (label colored `var(--danger)` at 70% opacity): "All agent sessions will be terminated immediately. All in-progress tasks move to killed."
- **Continues** (label `var(--danger)` 70%): "Nothing — this bet ends permanently."
- **Saved**: "Completed tasks, artifacts, and the full revision log are preserved."
- **Cost context block** (conditional): "$12.40 spent this cycle — this spend is final."
- Reason textarea — required
- Footer: `[Cancel]` (ghost) `[Kill bet]` (error variant: `color: var(--danger)`, `background: rgba(248,113,113,0.12)`)

### Appetite dialog
- Title: "Adjust appetite"
- Current appetite shown as KeyValue: "CURRENT — 2 weeks"
- Select: `1 week / 2 weeks / 6 weeks` (current value pre-selected)
- Reason textarea — required, placeholder: "What changed?"
- Footer: `[Cancel]` (ghost) `[Save]` (surface-5)

---

## Behavior

### Action bar
- **Hover:** Ghost buttons: `background: var(--surface-5); color: var(--text-hi)` at `var(--motion-fast)` (80ms)
- **Focus:** `outline: 1px solid var(--primary); outline-offset: 1px`
- **Active press:** `background: var(--surface-6)` at 80ms

### Dialog (all)
- **Open trigger:** `dialog.showModal()` — browser enforces focus trap
- **Backdrop click:** Does NOT close (non-skippable). `cancel` event is `preventDefault()`'d.
- **Escape key:** Does NOT close. `keydown` listener on the dialog prevents default on `Escape`.
- **Cancel button:** Closes via `dialog.close()`. Resets all form fields.
- **Confirm button:** Fires the action. On success: closes dialog, updates bet status in local state. On error: shows error message, stays open.
- **Tab order inside dialog:** Cancel → Confirm → (wraps) → first focusable input → Cancel
- **Motion (open):** 250ms (`var(--motion-slow)`) opacity 0→1, `transform: scale(0.97)→scale(1)` via CSS `@starting-style`. Backdrop: same timing, opacity 0→0.6.
- **Motion (close):** 150ms (`var(--motion-medium)`) reverse.
- **`prefers-reduced-motion`:** Animation collapses to 1ms per `tokens.css` media query.

### Unblock
- `scrollIntoView({ block: 'start', behavior: 'smooth' })` on the HostThreadSection root element
- 100ms delay then `focus()` on the Composer textarea
- No dialog

### Reason field (all dialogs)
- Required: Confirm button is `disabled` when the textarea is empty or contains only whitespace
- Enter key inside textarea: inserts newline (default); does NOT submit
- Max length: 500 characters (client-side soft limit; no server enforcement needed)

---

## Information hierarchy

1. **Bet title** (15px, 500 weight) — primary
2. **Status chip + tag + appetite KeyValue** — secondary
3. **Action bar** (12px ghost buttons, red Kill) — tertiary, separated by divider
4. **Dialog** — overlay; consequence sections are the primary hierarchy inside

---

## Copy register

- Button labels: imperative, lowercase ("Pause", "Kill bet", "Resume", "Unblock", "Adjust appetite", "Save", "Cancel")
- Dialog titles: question form ("Pause this bet?", "Kill this bet?", "Adjust appetite")
- Consequence section labels: STOPS / CONTINUES / SAVED — uppercase mono, no punctuation
- Consequence section body: declarative, present tense ("All agent sessions will be suspended.")
- Error messages: plain statement + action ("Failed to pause bet. Try again.")
- Reason placeholder: first-person question ("Why are you pausing this bet?")

No emojis anywhere.

---

## Mobile adaptation (v1 — not implemented)

The design is desktop-first. For v1 the action bar wraps with `flex-wrap: wrap; gap: 8px` on narrow viewports. The dialog uses default `max-width: 480px` centered. Full mobile-sheet behavior deferred to a future pass.

---

## Open questions for the architect

1. **Pause endpoint:** Is `POST /bets/:id/pause` the right shape, or does it fold into `PATCH /bets/:id` with a `status` field? The state machine supports the transition; the route is missing.
2. **Resume endpoint:** Same question — `POST /bets/:id/resume` vs. patch.
3. **Cost data availability:** The cost-context block in the dialog depends on `bet.costActual`. L17 wires money to bets. L14 should render the block only when the data is present. The architect should confirm the DB column name and whether the bet detail endpoint already returns it.
4. **Reason validation:** Server-side: should the reason field be required in the route schema (current kill route already requires it), or only client-side validated for pause/resume/appetite? Recommend: server-side required for kill; server-side optional with min-length 1 for pause/resume (the revision log records it).
5. **Fixture row closure:** The L6 inventory row ("WorkBet.tsx cost strings and appetites") — the appetite strings are already real data (from the DB via `useBet`). The remaining hardcoded cost strings in task rows are L17's responsibility. L14's fixture closure scope: ensure the BetCard renders `bet.appetite` from the API (not a fixture). Current `WorkBet.tsx` already does this via `useBet` hook.
6. **Revision log `actor` field:** The current RevisionLogEntry shape is `{ timestamp, field, old_value, new_value, reason }` — no `actor` field. The spec says "who did it." Either the existing shape is extended with `actor: string` or the route infers it from auth context. Architect decision.
