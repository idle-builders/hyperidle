DESIGN-CLASS: novel  ref=none  pattern=none

# U6 Design Brief -- App Shell: Sidebar + Main (Layout Restructure)

## Story

Replace the four-column shell layout (IconRail 48px | Submenu 240px | Main 1fr | Rail 56-360px) with a two-column layout (Sidebar 200px | Main 1fr). The Sidebar consolidates view switching, sub-navigation, and shortcuts into a single 200px column. Filters that lived in the Submenu header move to the main pane as pill tab bars.

## Resolved probes

### 1. Section separation
The spec mandates "dividers between sections." Three sections (Conversations, Work, Knowledge) need visual separation. I'll explore CSS border-bottom dividers, spacing-only gaps, and labeled mono headers across variants. The production choice must use semantic border tokens (`--border-subtle`).

### 2. CoC trigger relocation
The Rail (deleted) housed the CoC trigger at its bottom. The CocOverlay itself is position:fixed (`bottom-16 right-4`) and independent of the Rail. Only the trigger button needs a new home. Candidates: sidebar bottom, main pane toolbar, floating action button. The spec says "CocOverlay trigger relocated (no longer anchored to Rail)" but does not prescribe where.

### 3. Sub-item rendering at 200px
NavItem was designed for 240px Submenu width. At 200px, text truncation matters. Sub-items are compact labels: recent conversation titles (truncated), team names (short), knowledge scopes ("Practices", "Teams"). NavItem's padding consumes ~64px at default density (16px pad-x x2 + 16px icon + 16px gap), leaving ~136px for text. Indented sub-items would leave less. Variants explore whether sub-items use NavItem directly or a lighter sub-item treatment.

### 4. Settings access
Current: avatar button in IconRail bottom -> toggles settings overlay. The settings overlay swaps Submenu content with settings nav + Main with settings section. With Sidebar, the pattern must adapt. Settings nav items could render directly in the Sidebar (replacing section items) or the Sidebar could show a persistent gear/avatar at bottom.

### 5. Brand wordmark
No existing wordmark in the codebase. The brand name is "HyperIdle." Treatment should use the existing font system (`--font-sans` or `--font-mono`). Sizing should not dominate the sidebar -- this is a tool, not a marketing page.

## Constraints from spec

- Sidebar is NOT collapsible on desktop. On mobile (<=768px), becomes overlay/drawer.
- Three sections fixed. Sub-items dynamic.
- Clicking sub-item = navigating to parent view with filter. Not separate nav context.
- No drag-to-reorder. Two levels max: section -> sub-items.
- 200px fixed width.
- Active view highlighted. Active sub-item has elevated bg with shadow.
- Status dots on relevant sub-items.

## Anti-convergence axes to vary

| Axis | Variant A | Variant B | Variant C |
|---|---|---|---|
| Hierarchy | Section labels are primary | Section labels recede, sub-items primary | No section labels -- icons + sub-items |
| Density | Tight, maximum items visible | Spacious, breathing room between groups | Compact nav, spacious footer |
| CoC trigger | Bottom of sidebar | Floating fab in main | Removed from persistent UI |
| Settings | Gear icon at sidebar bottom | Avatar+name at sidebar bottom | Inline settings section |
| Wordmark | Large mono header | Small text, barely there | Icon-only with tooltip |
