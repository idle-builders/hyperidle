# P4 Design Comparison

## Variant Screenshots

- **A (Single Scroll):** `single-scroll/screenshot.png` -- full-page single column, all 4 setup sections visible at once
- **B (Split Pane Overlay):** `split-pane/screenshot.png` -- AppShell with Settings sections in Submenu, per-section forms in Main pane
- **C (Linear-Style Settings):** `drawer-slide/screenshot.png` -- own layout, fixed sidebar, scrollable content showing all sections

## Comparison Table

| Dimension | A: Single Scroll | B: Split Pane Overlay | C: Linear-Style |
|---|---|---|---|
| **Signature** | Everything visible at once. No transitions, no hidden state. | Overlay without a modal. Settings takes over Submenu + Main but stays inside the shell. | Settings is a workspace. Own layout, own sidebar, own route. Full context switch. |
| **Component count** | 0 new. DaisyUI primitives only. Full-page route outside AppShell. | 0 new components, but requires Submenu/Main content swap logic in AppShell. Complex state. | 0 new components. New SettingsLayout.tsx route layout. Simple state. |
| **Density** | Tight. All sections visible. ~5 scroll lengths on desktop. Compact for setup; sparse for settings (route-based, same pattern as A for Settings variant). | Dense. Full Main pane width. Sidebar navigation. One section at a time. | Dense. Full content area. Sidebar navigation. Shows one section but C's mockup demonstrates scrollable multi-section which works well. |
| **Primary action surface** | Bottom of page (setup). Per-section Save buttons (settings). | Per-section Save buttons. "Back" in Submenu footer. | Per-section Save buttons. "Back" in sidebar footer. |
| **State strategy** | Stateless. Everything visible, browser scroll state only. | Overlay state on AppShell (settingsOpen + activeSettingsSection). Complex: swap Submenu content and Main pane content when settings is open. | Route state. /settings/:section. Clean URL-driven state. Browser back works. |
| **Motion budget** | Zero. Static page. | Zero for section switches. Existing modal-close motion if needed. | Zero. Static content swap. |
| **Context preservation** | None (setup). Full context switch (settings goes to /settings route). | Full. User returns to exact previous position. No route change. | None. Full context switch to /settings. Must remember previous route for Back. |
| **Best at** | Zero complexity. Ships fastest. SetupFlow is very clean -- config-file aesthetic. | Quick tweaks. User stays in the app. Settings is an overlay, not a destination. Familiar spatial model (Submenu has always been a sidebar). | Clean mental model. Settings is a place with its own URL. Deep-linkable. OrgChart table has full width. |
| **Worst at** | Settings as full-page route means leaving the app. Breaks "avatar = overlay" mental model. Would need a 4th view icon or awkward navigation. | Complexity. AppShell already has 800+ lines. Adding Submenu/Main content swapping increases coupling. No URL for specific settings sections. | Full context switch. Loses all ambient info (Rail, Submenu threads). Two layout systems. |
| **SetupFlow quality** | Clean. Config-file aesthetic. Everything visible. Professional feel. | Overdesigned for 4 steps. Split-pane sidebar for 4 items is wasteful. | Clean. Single column, quiet density. Similar to A but tighter. |

## Anti-convergence Check

Variants differ on these axes per pair:
- **A vs B:** hierarchy (all-at-once vs one-section), density (scroll vs pane), state strategy (stateless vs overlay state), composition (standalone page vs AppShell integration), action surface (bottom-of-page vs per-section)
- **A vs C:** hierarchy (all-at-once vs one-section with sidebar), composition (no layout vs own layout), motion (none vs none -- same), state (stateless vs route-driven)
- **B vs C:** state strategy (overlay/React state vs route/URL), context preservation (full vs none), composition (reuse AppShell vs own layout), action surface (Submenu swap vs sidebar)

All pairs differ on 3+ axes. Anti-convergence passes.

## Scores (in-session self-critique, 0-10)

| Dimension | A | B | C |
|---|---|---|---|
| Hierarchy | 7 - section labels work but all-at-once reduces hierarchy signal | 8 - clear section isolation via Submenu navigation | 8 - clean sidebar + content split |
| Spacing | 8 - uses density tokens, 4px grid | 8 - uses density tokens | 8 - uses density tokens |
| Typography | 8 - mono uppercase labels, correct scale | 8 - same | 8 - same |
| Color | 8 - semantic tokens only | 8 - semantic tokens only | 8 - semantic tokens only |
| Coherence | 6 - settings as route breaks the app's overlay pattern | 9 - settings stays inside AppShell, matches existing overlay patterns | 7 - own layout is clean but inconsistent with AppShell pattern |
| States | 7 - all states handled but no section isolation for error states | 8 - per-section error handling, clean | 8 - per-section, clean |
| A11y | 8 - no focus trap needed, standard page | 7 - Submenu content swap needs careful ARIA management | 8 - standard page navigation |
| Anti-slop | 9 - zero AI-aesthetic tells | 8 - could feel like "settings dashboard" if not careful | 8 - Linear-inspired but not copied |
| Premium polish | 6 - settings as route feels like a different app | 8 - integrated, polished, spatial model works | 7 - clean but context-switching |
| **Total** | **67/90** | **73/90** | **70/90** |
