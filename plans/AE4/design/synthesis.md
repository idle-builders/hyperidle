# AE4 Design Synthesis

## Chosen direction: Variant A (Drawer Sidebar) with one pull-in from B

**Variant A is the strongest base** because:

1. **Conceptual simplicity.** One navigation paradigm across desktop and mobile. The sidebar IS the navigation — on desktop it's persistent, on mobile it slides in. Same component, same hierarchy, same affordances.
2. **Maximum content space.** The primary mobile task is reading thread messages and tapping verdicts. Every pixel of vertical space helps. No permanent tab bar consuming 56px.
3. **Lower implementation surface.** Wrapping the existing Sidebar in a drawer is a shell-level change. No new component, no relocated CoC trigger, no sub-navigation redesign.
4. **Desktop parity contract.** AC says "Desktop remains primary -- no desktop regressions." Using the same Sidebar on both form factors makes regressions structurally impossible — there's one component.

## Pull-in from Variant B: Badge dot on hamburger

From Variant B, pull in the **always-visible attention signal**. The hamburger button in the mobile header gets a small notification dot (6px, `--accent-primary`) when either `conversationsBlockingCount > 0` or `knowledgeTriageCount > 0`. This gives the founder ambient awareness without opening the drawer — they see at a glance whether agents need attention.

This is a minor visual addition (a dot on the hamburger icon), not a structural change.

## Rejected directions (locked -- do not re-litigate)

1. **Bottom tab bar.** Rejected because it introduces a second navigation paradigm (tabs vs sidebar), consumes 56px of permanent vertical space, requires relocating the CoC trigger, and loses sidebar sub-items (thread shortcuts, team list). The complexity cost outweighs the benefit of always-visible tab labels. See comparison.md for full analysis.

2. **No hamburger / full bottom drawer.** An alternative where the sidebar pulls up from the bottom (like a mobile sheet). Rejected because the sidebar is 200px wide and designed as a vertical column — reorienting it horizontally would require a completely different layout, violating "same component everywhere."

3. **Swipe-only navigation (no hamburger).** Edge-swipe from left to open the sidebar, no visible hamburger button. Rejected because swipe gestures are undiscoverable. First-time users would have no affordance to find navigation.

4. **Split-pane at tablet widths.** Showing the sidebar + content side-by-side at 768px-1024px (tablet). Deferred. V1 uses a binary: <= 768px = drawer, > 768px = persistent sidebar. Tablet optimization is a follow-up. The `useViewportBreakpoint()` hook already uses 768px as the threshold.

5. **Floating action button for CoC.** Placing the Assistant trigger as a FAB on mobile. Rejected because FABs are the quintessential AI-aesthetic pattern (every AI chatbot has a floating bubble). The CoC trigger stays in the sidebar, accessible via drawer.

## Open questions for architect

1. **CORS configuration mechanism.** How is `HYPERIDLE_CORS_ORIGINS` env var structured? Comma-separated list of origins? Should there be a wildcard mode for development?
2. **PWA manifest scope.** The manifest `start_url` and `scope` need to match the deployed path. If served from root (`/`), this is straightforward. If behind a reverse proxy prefix, it needs configuration.
3. **Safe area insets.** The mobile header and drawer need `env(safe-area-inset-top)` padding for notched phones. The composer needs `env(safe-area-inset-bottom)`. How to apply these conditionally (only when viewport is mobile)?
4. **Drawer state management.** Should drawer open/close state live in AppShell state? In a context? In URL? (Recommendation: AppShell state, not URL — drawer is transient UI state.)
5. **Back navigation pattern.** On mobile, thread detail shows a back arrow. Should this use `navigate(-1)` (browser history) or `navigate('/conversations')` (explicit)? History-based is more correct for deep links but can break if the user arrived from outside the app.
