# L14 Design Synthesis

## Strongest base: Variant A (Inline Action Bar)

**Why A wins:**

1. The L14 spec premise is "first-class affordances to act on a bet." First-class means visible, not hidden. The bet detail page is an infrequent visit with high-stakes decisions; discoverability is more important than BetCard cleanliness.

2. The spec explicitly says "humans act at the bet level" — this is the primary human-machine interface point for bet governance. Making it discoverable is not a tradeoff, it's the requirement.

3. Kill bet must be visually different from pause. In Variant A it always is. In Variant B the distinction is `color: var(--danger)` on a menu item — only after the user opens the menu.

4. Variant A scores 0.5 higher overall. The coherence ding (operational affordances on an identity card) is a real trade-off, but it is correct for this workpackage's premise.

## What to pull from Variant B

**Cost-context in the consequence preview dialog.** Variant B's richer dialog with a "Cost" row showing spend-to-date is genuinely useful for the kill/pause decision. The cost data is not available in the current DB (L17 wires money to bets), so this must be conditional: show cost context only when the bet has `costActual` data populated. The section renders as a subtle `var(--surface-3)` block with `COST` label and a value string.

**Implementation note:** The cost-context block is a conditional render inside the ConsequencePreview dialog — not a new component. If `bet.costActual` is null/zero, the block is absent. This is a progressive-enhancement pattern, not a required field.

## What gets explicitly rejected

- **Dropdown / overflow menu** for bet actions. The extra interaction step hides the Kill bet danger signal. For this specific surface — the bet detail page, visited intentionally — always-visible buttons are correct.
- **Inline expansion** for consequence preview (instead of dialog). Cannot enforce non-skippability. Rejected at Phase 0.
- **Custom Confirm component** (20th component). DaisyUI `dialog` via native `showModal()` is the right primitive.
- **Keyboard shortcut bindings** on action buttons. Explicitly rejected by L14 spec ("no keyboard shortcuts").
- **Emoji or decorative icons** on action buttons. L14 spec: "no emojis." System-level constraint.
- **Duration field** in appetite dialog. L4 anti-pattern. Appetite is the closed enum only.
- **Optimistic UI** on action buttons (button immediately shows "Paused" before server response). HyperIdle principle: no optimistic-UI bragging. Consequence preview enforces the deliberate two-step.

## The approved direction

**Variant A + cost-context from Variant B**

- BetCard `actions` slot: horizontal `flex` row of DaisyUI `btn btn-xs btn-ghost` buttons (Pause/Resume, Adjust appetite, Unblock) + `btn btn-xs btn-error` for Kill bet
- State-driven button set (see table in brief.md)
- ConsequencePreview: DaisyUI `dialog`, `showModal()`, non-dismissable by backdrop (`cancel` event prevented), focus trapped natively, Escape key prevented from closing
- Cost context block in dialog: conditional on `bet.costActual` being set
- Appetite dialog: same DaisyUI `dialog` pattern, select + reason textarea
- Unblock: scroll-to-focus on HostThreadSection Composer
- Zero new custom components
