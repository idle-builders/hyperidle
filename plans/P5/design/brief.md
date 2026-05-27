# P5 FirstTimeHints -- Design Brief

DESIGN-CLASS: routine  ref=EmptyState+DaisyUI-alert  pattern=EmptyState.html

## Classification rationale

Both axes match:
- **Existing component reference:** The spec says "use existing design tokens", "no new visual patterns". EmptyState already has an action slot for inline guidance. DaisyUI `alert` is in the used-primitives list. No new custom component is needed.
- **Pattern match:** `packages/design-system/html/EmptyState.html` with its action slot is the closest existing pattern. DaisyUI `alert` is used in ErrorState and ArtifactView for inline messaging.

This is a routine design: compose existing primitives (DaisyUI `alert`, existing text tokens, existing `btn` primitives) into inline hint regions. The visual treatment is intentionally subtle -- the spec says "a highlighted button, a short inline text block, a gentle callout."

## Interrogation (Phase 0)

Three probes, all resolved from the spec and codebase:

**Q1: What IS a hint, visually?** The spec gives three options: "a highlighted button, a short inline text block, a gentle callout." My read: all three are valid depending on context. Hint #1 (create a bet) is best as text near the EmptyState + highlighted action. Hint #3 (knowledge empty) augments the existing EmptyState. Hint #4 (review verdict) is an inline text block near the verdict buttons. Hint #5 (rail indicators) is a text block in the rail header. The hint is NOT a component -- it is a rendering strategy that uses existing primitives in context.

**Q2: Where exactly does each hint render?** Based on codebase reading:
- Hint #1: `WorkProduct.tsx` -- inside the "Active Bets" section, below or replacing the EmptyState when zero bets exist.
- Hint #2: `WorkBet.tsx` -- inline in the bet detail view, near the top or after the header.
- Hint #3: `KnowledgeList.tsx` -- augments the existing empty state.
- Hint #4: `Conversations.tsx` or the review thread area -- inline near verdict buttons.
- Hint #5: `Rail.tsx` -- inline in the expanded rail, near the top.

**Q3: Dismiss mechanism?** The spec says "after action (or explicit dismiss)." My read: each hint has a small dismiss affordance (a ghost button or an "x" link-text). When the user takes the suggested action (e.g., creates a bet), the hint auto-dismisses via the trigger condition no longer being true. Explicit dismiss = a small "Got it" or close affordance.

## Chosen direction (single variant, routine)

The hint rendering is NOT a new component. It is a **rendering pattern**: a short `<p>` or `<div>` using existing tokens, placed inline in the relevant view's existing layout flow. Each hint location composes from:

1. **Text:** `text-[length:var(--density-text)]` in `text-[var(--text-mid)]` -- the same register as EmptyState descriptions but at body weight, not de-emphasized.
2. **Container:** A `div` with `bg-[var(--surface-2)]` (one step up from context), `rounded-[var(--r1)]`, `p-[var(--density-card-pad)]` -- matching the card treatment used throughout the app.
3. **Dismiss:** A `btn btn-ghost btn-xs` with "Got it" text, or the hint auto-dismisses when the trigger condition is no longer met.
4. **Action (optional):** When the hint suggests an action (e.g., "Create a bet"), the action text is a `btn btn-ghost btn-xs text-[var(--primary)]` inline link.

This pattern reuses EmptyState's density tokens, the card surface treatment from WorkProduct sections, and DaisyUI's btn-ghost for dismiss/action affordances. No new component. No new tokens. No new visual vocabulary.

## Rejected directions

- **DaisyUI `alert` component:** Too prominent. The `alert` class creates a bordered, padded region with icon space that reads as a system notification. Hints should be quieter than alerts -- they are guidance, not warnings. The alert also implies urgency the hints do not carry.
- **Tooltip/popover on hover:** Explicitly out of scope per AC. Also wrong interaction model -- hints should be visible without user action.
- **Numbered tour steps:** Explicitly rejected in spec. No progress indicators, no "1 of 5" badges.
- **Badge/dot indicators:** Too cryptic. A dot on a nav item says "something is here" but not what to do. The hint text IS the value.
- **Primary-tinted background:** Using `bg-[var(--primary-dim)]` would make hints look like selection highlights or active states. Hints are guidance, not selection.
- **New InlineHint component in design system:** Over-engineering. The hint is 3-5 lines of markup using existing tokens. A dedicated component for something used in 5 places with no shared behavior beyond "show text + dismiss" adds to the component budget without earning it. The rendering is just markup; the system (catalog + progress tracking) is the real abstraction.
