# W2 Design Comparison

## Classification: Routine

One variant produced. Design targets are fixed (HTML files). The "design" decision here is implementation strategy, not visual outcome.

## Chosen: Bottom-Up Trickle

Fix foundation primitives first (Avatar, Button, Input, etc.), then let improvements cascade upward through the component dependency graph. Each fix happens at the lowest possible layer -- once -- and every consumer inherits it.

## Rejected Directions

**A. Top-Down Page-First** -- Start with page-level assembly, stub in primitives as needed, work downward. Rejected because: this creates duplicate work. You'd stub Avatar in ThreadRow, then stub it differently in BetCard, then eventually build the real Avatar and have to go back and update all stubs. The ds:sync gate also requires component-level pixel matching, not just page-level.

**B. Parallel Component Sweep** -- Update all components simultaneously with no ordering. Rejected because: without the foundation primitives built first, every Tier 1-3 component would use inline avatar/button markup that gets replaced later. Massive churn. The dependency graph exists for a reason.

**C. Density-Last** -- Build primitives first, strip density last (so existing tests keep passing during development). Rejected because: every existing TSX component uses `var(--density-*)` tokens that would need to be in the primitives too (for intermediate ds:sync passes). Stripping density first means the new primitives never use density tokens at all -- they use the correct Hearth values from day one. This also unblocks the token sync immediately.

**D. HTML-Driven Code Generation** -- Parse the HTML files to auto-generate TSX component skeletons. Rejected because: the HTML uses inline CSS classes (`.avatar`, `.btn--primary`) while the TSX uses Tailwind utilities. The translation is semantic, not mechanical. A builder agent reading the HTML and writing equivalent Tailwind classes will produce better output than a CSS-to-Tailwind transpiler.

## Phase 2 Critique Score (In-Session)

| Dimension | Score | Notes |
|---|---|---|
| Hierarchy | 8/10 | Visual hierarchy is defined by the HTML refs; strategy preserves it through faithful TSX translation. |
| Spacing | 9/10 | Hearth 6px grid enforced by token sync + density removal. All values traced to DESIGN.md. |
| Typography | 9/10 | Type scale is closed and verified by existing lint rules. No new type decisions needed. |
| Color | 9/10 | All colors use semantic tokens. Agent green distinction preserved. Warm shadows maintained. |
| Coherence | 9/10 | Bottom-up approach guarantees component coherence -- each consumer uses the same primitive. |
| States | 8/10 | All states specified per HTML refs. Tooltip deferred (positioning complexity). |
| A11y | 7/10 | Focus-visible on all interactive elements. Density removal means no mobile auto-comfortable -- touch targets need verification at each breakpoint. |
| Anti-slop | 9/10 | No novel design decisions to introduce slop. Every pixel target is defined by HTML. |
| Premium polish | 8/10 | Expressive easing on toggle, warm shadows, pill buttons -- all Hearth signatures preserved from HTML. |
| **Overall** | **8.4/10** | |

The A11y score of 7 reflects the loss of mobile auto-density (comfortable tier at mobile breakpoints gave extra breathing room). The AESTHETICS.md AQ-003 explicitly says "There is no density system" and the default Hearth sizes meet the 44px touch-target floor per DESIGN.md, but this should be verified with touch-target E2E tests at mobile viewports after density removal.
