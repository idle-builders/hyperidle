# L21 Design Critique — Variant B (Popover Overlay)

## Scoring (9 Dimensions)

### 1. Clarity — 8/10

The interaction model is straightforward: click trigger, popover grows upward from the Rail. The spatial relationship (popover "belongs to" the Rail) is well-reasoned. The mental model is sound — the CoC lives at the bottom of the Rail, and its conversation expands in place.

One deduction: the "conditional hover affordance" (items in Main show "+" only when the overlay is open) introduces a mode. Users must discover that opening the CoC changes the behavior of unrelated elements elsewhere on screen. The design acknowledges this coupling but does not specify how the user discovers the affordance on first use (no onboarding hint, no tooltip). Acceptable for v1 but flagged.

### 2. Consistency — 8/10

Uses `@floating-ui/react` which is already in the dependency tree. The trigger button follows existing Rail button vocabulary (icon + label in expanded, icon-only in collapsed). Surface/border/shadow tokens match the existing overlay pattern (SettingsPanel at z-40, GlobalSearchPanel at z-50; CoC at z-30 sits below both). The ThreadShell reuse is clean.

One gap: SettingsPanel and GlobalSearchPanel are both modals that dim/disable the shell. CocOverlay explicitly does NOT dim. This introduces a new overlay category ("persistent non-modal overlay") that has no existing precedent in the codebase. Not wrong, but a novel pattern the user must learn.

### 3. Efficiency — 9/10

Single click to open. Context attachment is click-on-item in Main (1 action). Send is standard composer submit. Close via Escape or trigger re-click. Minimal friction for the core loop: open -> type -> send. The context attachment mechanic (hover "+" while overlay open) is 2 actions (hover + click) which is acceptable.

### 4. Accessibility — 8/10

The spec covers:
- `aria-expanded` on trigger
- `role="dialog"` with `aria-labelledby` on the overlay
- Focus moves into overlay on open
- Not a focus trap (can Tab to Main)
- Escape closes and returns focus to trigger

Gaps:
- The "+" affordance on hover in Main items is not specified for keyboard navigation. How does a keyboard-only user attach context? They would need to Tab to a Main item, but the design does not specify a keyboard equivalent for the hover "+" action.
- The design mentions Tab cycles through messages and composer, but does not specify aria-live for new CoC responses arriving while the overlay is open.

### 5. Responsiveness — 7/10

Desktop spec is solid (360px popover in Rail's column, no spatial conflict). Mobile adaptation is well-specified (FAB + bottom sheet). However:

- The intermediate breakpoint (1024px-1280px) is not addressed. When the Rail is visible but the viewport is narrower, the 70vh max-height may leave very little visible area for both the overlay and the Rail content below the trigger.
- The design says "same as Variant A" for mobile but Variant A's mobile spec is more detailed (70% viewport, drag-handle dismiss). This is adequate but not deeply explored.

### 6. Hierarchy — 8/10

Visual weight is appropriate. The trigger is a small button at the very bottom of the Rail — discoverable but not competing with the ambient vital signs (bets, blockers, cost) above. The popover at z-30 is below critical system overlays (Settings z-40, Search z-50) which is correct — the CoC is a utility, not a system-level control.

The trigger's icon color change (`--text-lo` to `--primary` when open) provides state feedback without being loud.

### 7. Feedback — 8/10

States are well-specified:
- Closed: trigger visible
- Open, empty thread: EmptyState + Composer
- Open, populated: messages + Composer
- Open, sending: Composer disabled, message pending
- Open, with context chips: chips above composer

Missing: no specification of what happens when a CoC response arrives (loading indicator? typing animation? instant appearance?). The design punts real-time to a "future story" but should at least specify the v1 behavior (polling on interval? optimistic local-only?). The architecture plan says "fetched once on open, no polling" which means the user would never see a CoC response without closing and reopening. This is a UX gap the builder will need to address.

### 8. Error handling — 7/10

The architecture plan addresses the error state (ErrorState inside the popover when `/api/threads/coach` fails, with retry). The design spec does not mention error states explicitly, relying on ThreadShell's built-in error rendering. This is acceptable given ThreadShell already handles it, but the design should have been explicit about:
- Network failure during send (message in pending state, retry affordance?)
- Context ref pointing to a deleted/moved item (stale chip)
- Coach thread creation failure on first open

### 9. Delight — 8/10

Animation spec is restrained and appropriate (fade + translateY over 150ms, respects prefers-reduced-motion). The popover growing upward from the trigger is a pleasant spatial metaphor. No gratuitous polish, no AI aesthetic tells. The "spark" glyph suggestion for the icon is a nice touch for differentiating from the generic Conversations icon.

---

## Summary

| Dimension | Score |
|-----------|-------|
| 1. Clarity | 8 |
| 2. Consistency | 8 |
| 3. Efficiency | 9 |
| 4. Accessibility | 8 |
| 5. Responsiveness | 7 |
| 6. Hierarchy | 8 |
| 7. Feedback | 8 |
| 8. Error handling | 7 |
| 9. Delight | 8 |
| **Average** | **7.9** |

## Verdict: APPROVED

The average score of 7.9 exceeds the 7.0 threshold. The design is sound, well-reasoned, and grounded in existing patterns. The variant exploration was thorough (three distinct spatial approaches) and the winner was selected on clear structural merits.

## Actionable Notes for the Builder

1. **Keyboard context attachment:** The builder must provide a keyboard-accessible way to attach context items (e.g., a focus-visible "+" button that appears as a row action, not only on mouse hover).
2. **Response visibility without polling:** The builder should implement a "refresh" button or auto-refresh on overlay focus-return so users can see CoC responses without a WebSocket subscription.
3. **Intermediate breakpoints (1024-1280px):** Test the 70vh popover height at 1024px height viewports — it may need a slightly reduced max-height or scrollable content area.
4. **Context chip staleness:** If a referenced item is deleted, chips should degrade gracefully (show "[removed]" or auto-dismiss with a toast notification).
