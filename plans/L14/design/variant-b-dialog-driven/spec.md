# Variant B — Overflow Menu + Dialog-Driven

**Constraint:** Minimize visual noise on the BetCard. Actions live behind an overflow trigger (ellipsis button or "Actions" text button). The consequence preview dialog carries more weight — it's the primary surface for understanding what will happen, not an afterthought.

**Thesis:** Bet actions are infrequent and consequential. Making them always-visible creates scanning noise on every page visit. Collapsing them into a single trigger keeps the BetCard clean and focused on the bet's identity. The dialog compensates by being more informative.

## User task

Founder on WorkBet detail page sees a single "Actions" button (or "⋯") in the BetCard header area. Tapping it opens a compact menu (DaisyUI `dropdown`) listing available actions. Selecting any action opens the appropriate dialog (consequence preview for destructive, form for appetite).

## Component composition

- **BetCard `actions` slot** — receives a single DaisyUI `dropdown` trigger button (`btn btn-xs btn-ghost`), labeled "Actions" with a chevron-down, OR an ellipsis icon (3 dots). No new component.
- **DaisyUI `dropdown` + `menu`** — the action menu: list of available actions for current bet status. Non-destructive items styled normally; Kill item styled with `text-error`.
- **DaisyUI `dialog`** — ConsequencePreview. Same structure as Variant A but richer consequence sections: adds a "tokens at risk" line showing how many tokens have been spent and will be suspended/lost. Consistent with L4's Cost+Tokens model.
- **DaisyUI `dialog`** — AppetiteDialog. Same as Variant A.
- **HostThreadSection** — Unblock, same scroll-to-focus behavior.

## Information hierarchy

1. **BetCard** — title, product tag, status chip, appetite KeyValue (primary — same as A)
2. **Actions trigger** (single button in slot) — "Actions ▾" — secondary, low visual weight
3. **Dropdown menu** — appears on click; lists available actions; Kill has red text
4. **Dialog** — ConsequencePreview or AppetiteDialog (same as A, richer content)

## All states

**Actions trigger (always same size):** `[Actions ▾]` button in BetCard actions slot — always present when any action is valid; absent on shipped/killed.

**Dropdown menu (in_progress bet):**
```
Pause
Adjust appetite
Unblock
────────
Kill bet   (text-error)
```

**Dropdown menu (paused bet):**
```
Resume
Adjust appetite
Unblock
────────
Kill bet   (text-error)
```

**Consequence preview dialog (Pause):**
- Title: "Pause this bet?"
- Body sections:
  - **Stops:** All agent sessions suspended. No new tasks will start.
  - **Continues:** Bet and revision log preserved in full.
  - **Saved:** Completed tasks, artifacts, and revision log are unaffected.
  - **Cost context:** `$12.40 spent this cycle — no additional spend while paused.`
- Reason textarea (required)
- `[Cancel]` `[Pause bet]`

**Consequence preview dialog (Kill):**
- Same structure, Kill button is `btn-error`. The "Cost context" line reads: `$12.40 spent this cycle — this spend is final.`

**Appetite dialog:** identical to Variant A.

**Empty (shipped/killed):** actions slot renders nothing.

**Loading/Error:** identical to Variant A.

## Behavior

**Dropdown open:** Click the "Actions" trigger. Dropdown appears below-start, constrained to viewport. Click outside or Escape closes it.

**Dropdown keyboard:** Arrow up/down to navigate items. Enter/Space to select. Escape closes. Tab closes and moves focus to next focusable element.

**Dialog:** Identical non-skippable behavior to Variant A. Backdrop click does not dismiss.

**Motion:** Dropdown fade in at 80ms. Dialog open/close at 250ms.

**Unblock:** Same scroll-to-focus. No dialog.

## Mobile adaptation

Dropdown trigger is a 44px touch target. Dropdown opens as a bottom sheet on mobile (`position: fixed; bottom: 0; width: 100%`). Not implemented in v1.

## Signature

**Single-entry point, richer dialogs** — one "Actions" trigger keeps the BetCard pristine. The dialog compensates with cost-context lines pulled from the bet's current spend, making the consequence preview more informative than a generic warning.

## Trade-offs

**Bad at:** Discoverability. Users who don't know what actions are available won't find them without clicking the trigger. Adds one interaction step before any action can begin. Kill is less obviously dangerous because it's nested behind the same trigger as harmless "Adjust appetite."

**Good at:** Clean BetCard. Richer dialogs carry more context (cost spent). Scales gracefully to many actions without card overflow. Matches patterns users know from Linear's issue action menus.

## Key difference from Variant A

Variant A: 4 visible buttons → 0 menus → 1 dialog
Variant B: 1 button → 1 menu → 1 dialog

The extra interaction step in B is the cost of cleaner chrome. The richer dialog content is the trade-off benefit.
