# Variant A: Drawer Sidebar

**Constraint:** Stay close to the existing desktop pattern. The Sidebar component renders identically in a slide-over drawer at mobile widths. Minimal conceptual distance from desktop — same nav hierarchy, same sections, same sub-items.

**Thesis:** A user who knows the desktop app instantly recognizes the mobile version. One mental model for navigation, not two.

## User story

A founder opens HyperIdle on their phone. They see the Conversations view (thread list or thread detail, depending on URL). A hamburger icon in the top-left opens the full Sidebar as a left-edge drawer over a scrim. They tap a view section or sub-item, the drawer closes, and the main pane shows the selected content.

## Component composition

- **AppShell (modified):** At `sidebarMobile`, renders a mobile header bar + main content (no persistent sidebar). The sidebar is conditionally rendered inside a drawer wrapper.
- **MobileHeader (new shell element, NOT a new design-system component):** A 48px-tall bar at the top of the screen with: hamburger button (left), current view/page title (center-left), optional action button (right). This is NOT a new primitive — it's a `<header>` element inside AppShell, built with raw Tailwind + DaisyUI primitives.
- **Sidebar (unchanged):** Rendered identically inside the drawer. No props change.
- **Scrim:** A `<div>` with `--surface-overlay` background that covers the main pane when the drawer is open. Tap scrim = close drawer.
- **Main content:** Full-width, no sidebar alongside it. All page components render at 100vw minus any mobile header.

## Information hierarchy (mobile)

1. **Primary:** Thread detail (messages + verdict actions) or view-specific list (threads, bets, knowledge items). Full width.
2. **Secondary:** Mobile header with view title + hamburger. Always visible.
3. **Tertiary:** Sidebar (in drawer, on demand). Contains navigation, search hint, CoC trigger, settings.

## States

### Drawer closed (default)
- Mobile header: `[hamburger] Conversations` or `[back arrow] Thread title` or `[hamburger] Work` etc.
- Main pane: full-width view content.
- No sidebar visible.

### Drawer open
- Sidebar slides in from left edge (240ms, `--motion-default`).
- Scrim fades in behind sidebar (120ms, `--motion-fast`).
- Main pane remains in place, dimmed by scrim.
- Tap scrim or tap a nav item = close drawer.
- Swipe left on sidebar = close drawer.

### Thread detail on mobile
- Mobile header shows `[back arrow] Thread title` (back navigates to /conversations).
- ThreadShell renders full-width, full-height minus header.
- RichMessageCard verdict buttons stack vertically if needed at narrow width.
- Composer input at bottom (full width, 16px font per AQ-005).

### Empty states
- EmptyState component renders full-width with left alignment (AQ-008).

### Loading
- SkeletonList renders at full width.

### Error
- ErrorState renders at full width with retry button (44px touch target).

## Behavior

- **Drawer animation:** `translateX(-100%)` to `translateX(0)` with `--motion-default` (240ms), `--motion-ease` easing. Scrim opacity 0 to 1 with `--motion-fast`.
- **Back navigation:** When viewing `/conversations/:threadId` on mobile, the mobile header shows a back arrow instead of hamburger. Tapping it navigates to `/conversations`. This reuses React Router's `navigate(-1)` or explicit path navigation.
- **Touch:** All interactive elements in the sidebar are already >= 44px (section headers via padding, sub-items via row height). The hamburger button in the mobile header is 48px.
- **Keyboard:** Escape closes drawer (matches desktop settings overlay pattern).
- **Focus trap:** When drawer is open, focus is trapped inside the sidebar. Tab/Shift-Tab cycle through sidebar items. Closing returns focus to the hamburger button.
- **Swipe:** Left swipe on drawer closes it. Edge swipe from left opens it. This is optional enhancement — not blocking for v1.

## Mobile adaptation per view

### Conversations (no threadId)
- Full-width ThreadSections list.
- Filter chips (Blocking, Unread) in the header bar below the title.
- "New thread" button moves into the header (already pill-shaped, fits at 375px).

### Conversations (with threadId)
- Full-width ThreadShell.
- Back arrow in mobile header.
- Composer pinned to bottom.
- No thread list visible (it's in the drawer or via back navigation).

### Work (portfolio)
- Full-width bet card grid becomes single-column.
- BetCard renders at full width.

### Work (team)
- Full-width team page. AgentRow cards stack vertically.
- Task table columns may need horizontal scroll or column reduction.

### Knowledge (list)
- Full-width KnowledgeRow list. Already single-column.

### Knowledge (detail)
- Full-width block body.
- Thread panel (if present) goes below the body instead of beside it.

## Signature

The same Sidebar, sliding in from the left. Familiar to anyone who's used a mobile web app with a navigation drawer. Zero learning curve.

## Trade-offs

- **Bad at:** Quick view switching. Every view change requires: hamburger tap, wait for drawer, tap view, wait for drawer to close. Three interactions for one navigation. Desktop is one click.
- **Bad at:** Ambient awareness. The sidebar's triage badges (knowledge count, blocking count) are hidden until the drawer opens. On desktop they're always visible.
- **Thumb reach:** The hamburger button is in the top-left — the worst thumb-reach zone on a phone held in one hand. The verdict buttons in ThreadShell are the primary action, and they're at the bottom of the screen (good) inside the message stream (potentially scrolled away).
