# L14 Design Comparison

## Side-by-side

| Dimension | Variant A — Inline Action Bar | Variant B — Overflow Menu |
|---|---|---|
| Signature (one tell) | Four buttons always visible in BetCard; "Kill bet" always red | Single "Actions ▾" trigger in card header; clean BetCard |
| Component count (new) | 0 | 0 |
| Density | 4 action buttons in card actions slot; card grows taller when active | 1 button in header; card stays compact |
| Primary action surface | Buttons directly in card | Dropdown menu → dialog |
| State strategy | Status-dependent button set swaps inline | Menu items change; trigger stays constant |
| Motion budget | Dialog: --motion-slow (250ms). Buttons: --motion-fast (80ms) | Dropdown: --motion-fast (80ms). Dialog: --motion-slow (250ms) |
| Interaction steps (destructive) | 1 click → dialog | 1 click (trigger) + 1 click (menu item) → dialog |
| Best at | Discoverability. Kill bet is visually impossible to miss. Zero hidden affordances. | Clean BetCard. Works at any card width. Scales to N actions gracefully. |
| Worst at | Card width pressure. Four buttons may wrap on narrow main columns. Always-visible Kill is high-noise on every view. | Discoverability. New users will not find actions. Kill is no more salient than Adjust appetite in the menu. |
| Phase-2 critique score | 7.5/10 | 7/10 |

## Phase-2 critique notes

### Variant A

- **Hierarchy (8/10):** Kill bet in red gives clear destructive signal immediately. Card actions separated by subtle border-top from card content — good.
- **Spacing (8/10):** 8px gap between action buttons; 4px padding-top on action bar above the divider — correct 4px grid.
- **Typography (8/10):** 12px buttons match the "small secondary controls" register. Not competing with the 15px title.
- **Color (9/10):** Only Kill bet is colored (red). All others are ghost. Correct monochrome philosophy with red-only danger.
- **Coherence (7/10):** The always-visible action bar breaks the BetCard's "at-a-glance identity" purpose slightly — adds operational affordances to a card designed as a status snapshot. Acceptable but notable.
- **States (8/10):** Three distinct card states shown (in_progress/paused/shipped). Button set changes correctly per state.
- **A11y (8/10):** Dialog uses `aria-labelledby`. Backdrop cancel event is prevented. Focus trapping via native `showModal()`. Keyboard escape is handled but doesn't confirm (correct).
- **Anti-slop (7/10):** No AI-aesthetic tells. The action bar with a border-top divider is a pragmatic pattern, not decorative chrome. Minor: the divider could feel like adding unnecessary structure.
- **Premium polish (6/10):** Missing: dialog open animation with `@starting-style`. Present in spec but the mockup uses default dialog appearance. The action buttons could use slightly more surface background presence at rest.

**Overall: 7.5/10**

### Variant B

- **Hierarchy (7/10):** "Actions ▾" in the header is low-visual-weight — deliberately so, but it means the bet's operational state (can I pause this? is killing it an option?) is invisible until the user clicks. This is a real hierarchy trade-off.
- **Spacing (8/10):** BetCard remains as tightly structured as the base design. Dropdown 4px padding, 1px gaps between items — correct.
- **Typography (8/10):** Same as A. Dropdown items at 13px — appropriate.
- **Color (7/10):** Kill bet in the dropdown is `color: var(--danger)` — red text on `var(--surface-1)` background. Correct. But it has the same visual weight as a normal menu item until the user reads it. Less immediate than Variant A's always-visible red button.
- **Coherence (8/10):** BetCard is purely an identity card. Operational affordances are behind the trigger — cleaner separation of concerns.
- **States (7/10):** The trigger button itself doesn't change state. The menu contents change. A user cannot tell at a glance whether the bet is pausable without opening the menu.
- **A11y (8/10):** Dropdown needs `role="menu"` on container and `role="menuitem"` on items — partially done. `aria-haspopup="menu"` is present.
- **Anti-slop (8/10):** Clean BetCard with a single affordance. No decorative chrome.
- **Premium polish (7/10):** Dropdown doesn't animate in the mockup — spec calls for 80ms fade. The cost-context block in the dialog is distinctive and adds genuine information value (Variant B's best feature).

**Overall: 7/10**

## Anti-convergence check

The two variants differ on:
1. **Hierarchy** — A makes all actions visible; B hides them behind a trigger
2. **Density** — A adds a row to the card; B keeps the card at baseline height
3. **Interaction steps** — A is 1-click to dialog; B is 2-clicks to dialog
4. **Kill salience** — A: always red, always visible; B: red text in a menu
5. **Dialog richness** — A: minimal; B: cost-context block
6. **State strategy** — A: button set changes; B: trigger is static

6 axes of difference. Anti-convergence requirement satisfied.
