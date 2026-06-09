# AD8b Design Critique -- Assistant Agent + Overlay

DESIGN-CRITIQUE: variant=approved score=8/10 rounds=1 axes: H:8 S:8 T:8 C:9 Co:9 St:8 A:8 AS:9 PP:7

**Classification:** Routine (existing CocOverlay + ThreadShell pattern extension). Correct classification -- no new design-system primitive, all additions compose from existing Tier 2/3 components.

**Verdict: PASS.** Score 8/10 exceeds the 7-point threshold. Advances to architecture critique. Two warnings and two suggestions below.

---

## CRITICAL

None.

## WARNING

**W1: Tool-call collapsibility unspecified.** Section 2.1 mentions "collapsible section" but provides no collapse/expand mechanism details. If an assistant response includes 5+ tool calls (e.g., querying multiple data sources), the tool-call section could visually overwhelm the primary response text at 360px width. The builder needs to know: collapsed by default or expanded? Chevron toggle or tap-to-expand? Truncation after N items?

**W2: Focus return on overlay close not specified.** Section 3 describes keyboard behavior (Escape closes, focus moves in on open) but does not specify focus return. When the overlay closes, focus should return to the sidebar "Assistant" trigger button. Without this, keyboard-only users lose their place in the DOM after closing the overlay. This is a WCAG 2.1 requirement for non-modal dialogs.

## SUGGESTION

**S1: prefers-reduced-motion for overlay entrance.** Section 1 specifies `animate-[coc-open_var(--motion-fast)_ease-out_forwards]` for the overlay entrance but does not mention `prefers-reduced-motion`. AQ-014 requires honoring this media query. The builder should wrap the animation in a `@media (prefers-reduced-motion: no-preference)` guard or use the existing reduced-motion utility pattern.

**S2: Small desktop viewport behavior.** The overlay is 360px fixed at bottom-16 right-4. At viewport widths between 768-1024px, the sidebar (200px) + overlay (360px) + right margin (16px) = 576px, leaving as little as 192px for Main content. The design should specify whether the overlay maintains 360px at narrow desktops or if there is a breakpoint where it transitions to the full-screen view (or a narrower width).

## What's Working Well

- **Zero new components.** The design correctly identifies that everything composes from existing infrastructure (ThreadShell, RichMessageCard, CommentRow, ContextChip). This is disciplined.
- **Rejected directions are specific.** Six rejected alternatives with concrete rationale grounded in the 360px constraint and HyperIdle's information density philosophy. This demonstrates genuine design exploration, not a rubber-stamp of the first idea.
- **States are comprehensive.** Section 7 enumerates 7 overlay states plus 5 soul-prompt editor states. The 2-second "Saved" flash feedback is a nice polish touch.
- **Token compliance is thorough.** Every spacing, color, radius, and font-size value traces to a Hearth token. No hardcoded values detected.
