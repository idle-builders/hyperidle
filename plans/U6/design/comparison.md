# U6 Design Comparison

## Side-by-side screenshots

All three mockups at 1280x800 desktop viewport, Hearth Light theme.

- `minimal-scaffold/screenshot.png` — Variant A
- `power-density/screenshot.png` — Variant B
- `linear-borrowed/screenshot.png` — Variant C

## Comparison table

| Dimension | Variant A (Minimal Scaffold) | Variant B (Power Density) | Variant C (Linear-Borrowed) |
|---|---|---|---|
| **Signature** | Every row is a NavItem. Mono section labels are the only non-NavItem elements. | Section headers ARE the clickable nav. "H" lettermark. Icon-only bottom strip. | Disclosure chevrons on sections. Avatar + name at bottom. Expand/collapse control. |
| **Component count** | 0 new. Sidebar is a `<nav>` composing NavItems + `<span>` labels. | 0 new custom components. But introduces a new sub-item pattern (not NavItem). | 0 new custom components. Introduces chevron disclosure pattern + sub-item pattern. |
| **Density** | Medium. NavItem min-height is 36px for primary, 28px for sub-items. All 3 sections + 10 sub-items visible without scrolling. | Highest. Section headers 24px, sub-items 24px. All content visible in much less vertical space. | Medium-high. Section items 32px with chevron, sub-items 28px. Slightly more vertical than A due to chevrons. |
| **Primary action surface** | Click any NavItem. Primary items navigate to section root. Sub-items navigate with filter. | Click section header label to navigate. Click sub-items for filtered view. | Click section item (label area) to navigate + expand. Click sub-item for filtered view. Click chevron-only to toggle without navigating. |
| **State strategy** | One layout for all states. NavItem `selected` prop handles active. Sub-items use the same layout with `.active` class adding elevated bg + shadow. | One layout. Section header `.active` uses bold text. Sub-item `.active` adds elevated bg + shadow + side margins. | One layout but two interaction modes: expanded vs collapsed. Section `.expanded` rotates chevron. Sub-item `.active` adds elevated bg + shadow. |
| **Motion budget** | Minimal. NavItem background transitions only (`--motion-fast`). No expand/collapse animation. | Minimal. Background transitions only. No structural animation. | Medium. Chevron rotation (`--motion-fast`), sub-item expand/collapse (`grid-template-rows` transition). |
| **Best at** | Simplicity. Zero learning curve. Familiar to anyone who has used Notion/Linear. | Speed for conversation-heavy users. Maximum density. Minimum chrome. | User-controlled density. Collapse sections you don't need. Tactile, responsive feel. |
| **Worst at** | Visual monotony. All rows look the same. Scanning relies heavily on section labels. | Assumes conversations are the primary use case. Work-focused users see a lopsided sidebar. Custom sub-item treatment is a new pattern to maintain. | Complexity. Two click targets per row (chevron vs label). More state to manage (open/closed per section + localStorage). |

## Phase 2 critique scores (9 dimensions, 0-10 each)

### Variant A — Minimal Scaffold

| Dimension | Score | Rationale |
|---|---|---|
| Hierarchy | 6 | Mono section labels create grouping but all nav rows look identical. Active state (green left border + elevated bg) is clear but doesn't create strong reading order within sections. |
| Spacing | 7 | Consistent use of density tokens. Sub-items properly indented at 40px. Sections separated by border-subtle. Gap between sections is adequate. |
| Typography | 7 | Three levels: 14px section label (mono caps), 14px primary items, 13px sub-items. Clean scale. Brand in mono caps is quiet. |
| Color | 8 | Correct token usage throughout. No hardcoded colors. Status dots use semantic tokens. Active state uses accent-primary for left border. |
| Coherence | 8 | Everything is a NavItem or a NavItem-like element. Maximum consistency. Feels like one component with two modes. |
| States | 6 | Empty, loading, error, populated described in spec. But sub-item active state (elevated bg + shadow) may not contrast enough from primary item active state -- both use surface-elevated. |
| Accessibility | 7 | Roving focus within sections. All elements are buttons. Status dots have color + position (but need aria labels). Touch targets: primary items 36px (below 44px AQ-015 in mobile). |
| Anti-slop | 9 | No AI aesthetic tells. No decorative elements. Clean, purposeful. Uses closed token set. |
| Premium polish | 5 | Functional but flat. No visual delight. The sidebar looks like a plain menu -- functional but not premium. The brand wordmark "HYPERIDLE" in mono caps is austere. |
| **Total** | **63/90** | |

### Variant B — Power Density

| Dimension | Score | Rationale |
|---|---|---|
| Hierarchy | 7 | Section headers in mono caps create clear grouping. Sub-items clearly subordinate (smaller, no icon). "H" lettermark anchors the top without competing. |
| Spacing | 8 | Tight but legible. 18px between sections. 3px vertical padding on sub-items. Efficient use of 200px width. |
| Typography | 6 | "H" lettermark is ambiguous -- could be any app. Section headers are good (mono caps 12px). Sub-items at 13px are readable. But the overall type hierarchy is minimal (only two levels visible). |
| Color | 8 | Correct token usage. No hardcoded colors. Status dots use semantic tokens. Active sub-item has elevated bg + shadow. |
| Coherence | 6 | Section headers use mono caps, sub-items use sans 13px, bottom strip uses icon-only buttons. Three different visual patterns. Less unified than A. |
| States | 6 | Spec describes all states. But sub-items use a custom treatment (not NavItem) which means maintaining a parallel state system. |
| Accessibility | 5 | Compact rows (24px sub-items) fail the 44px AQ-015 touch target at mobile. Icon-only bottom buttons need aria-labels (spec includes them). No keyboard shortcut for section navigation. |
| Anti-slop | 8 | Clean. No AI aesthetic. But the "H" lettermark borders on under-designed -- it could be misread as a decorative initial. |
| Premium polish | 6 | Dense and efficient. The icon-only bottom strip is clean. But the overall feel is spartan -- more "terminal" than "precision instrument." |
| **Total** | **60/90** | |

### Variant C — Linear-Borrowed

| Dimension | Score | Rationale |
|---|---|---|
| Hierarchy | 8 | Three clear levels: brand wordmark (primary-secondary), section items with icons (secondary, primary when active), sub-items (tertiary, secondary when active). Chevrons add structural hierarchy without decorating. |
| Spacing | 7 | Sections separated by border-subtle + 6px margin. Sub-items indented at 40px. Adequate breathing room. Bottom area is denser (two rows). |
| Typography | 8 | "HyperIdle" in sans 14px medium is clean and present without shouting. Section labels 14px medium. Sub-items 13px. Three distinct levels. No off-scale sizes. |
| Color | 8 | Correct token usage. Active section icon uses accent-primary. Status dots semantic. Avatar uses accent-primary-dim tint. |
| Coherence | 7 | Disclosure pattern is consistent across all three sections. Bottom area introduces a different row style (avatar + name + gear) which breaks the pattern slightly. |
| States | 8 | All states described. Expand/collapse adds an interaction state dimension. Default: all expanded. User can collapse. LocalStorage persistence. Most complete state model. |
| Accessibility | 7 | Roving focus across flat visible list. Arrow Left/Right for expand/collapse (familiar tree pattern). Section items 32px (needs mobile adaptation). Avatar row is interactive with aria-label. |
| Anti-slop | 8 | No AI aesthetic tells. Chevrons are functional, not decorative. Disclosure is a proven pattern (file browsers, IDEs, Linear). |
| Premium polish | 8 | The chevron rotation animation, the sub-item slide-in, the avatar with initials, the CoC row with icon + label -- these add tactile quality. The wordmark treatment is confident. Feels like a professional tool. |
| **Total** | **69/90** | |

## Summary

Variant C scores highest (69/90) primarily on hierarchy, states, typography, and premium polish. Variant A (63/90) excels at coherence and anti-slop but lacks visual distinction and polish. Variant B (60/90) achieves maximum density but at the cost of coherence and accessibility.

The main weakness of C is the expand/collapse interaction complexity (two click targets per row). The main strength is that it looks like a product designed by someone who cares -- the disclosure pattern, the avatar row, the wordmark treatment all signal intentionality.
