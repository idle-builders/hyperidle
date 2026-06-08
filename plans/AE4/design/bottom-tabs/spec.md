# Variant B: Bottom Tab Bar + Top Header

**Constraint:** Challenge the drawer pattern. Optimize for the most common mobile interaction: switching between views and acting on reviews. Put the three views in a thumb-reachable bottom tab bar. The sidebar's navigation role is absorbed by the tabs; the sidebar's utility role (search, CoC, settings) moves to the top header.

**Thesis:** Mobile users switch views frequently (check conversations, glance at work, back to conversations). A bottom tab bar makes this one-tap with zero drawer ceremony. The founder's thumb stays in the natural reach zone for both navigation AND verdicts.

## User story

A founder opens HyperIdle on their phone. The bottom edge shows three tabs: Conversations, Work, Knowledge (matching the sidebar's three sections). The top shows a compact header with the current view title and utility buttons (search, avatar/settings). Tapping a tab switches views instantly. Thread detail pushes a full-screen view with a back button. The founder taps Approve on a review, switches to Work tab to check a blocked bet, back to Conversations — all with bottom-of-screen taps.

## Component composition

- **AppShell (modified, mobile branch):** At `sidebarMobile`, renders: MobileTopHeader + main content (flex-1) + MobileTabBar. No sidebar at all.
- **MobileTopHeader (shell element, not a new primitive):** 48px bar. Left: view title (or back arrow + thread title). Right: search icon (opens Cmd+K panel) + avatar button (opens settings).
- **MobileTabBar (shell element, not a new primitive):** Fixed to bottom. Three tabs with icons + labels, using the existing `VIEW_ICONS` from `shell-types.ts`. Active tab uses `--accent-primary` tint. 56px tall (48px content + 8px safe area for notched phones).
- **Sidebar:** Not rendered on mobile at all. Its nav role is replaced by the tab bar. Its utility role (search, CoC, settings) moves to the top header.
- **Main content:** Full width, between header and tab bar. Scrollable.

## Information hierarchy (mobile)

1. **Primary:** Content area (thread detail, thread list, bet cards, knowledge items). Full width, maximum vertical space.
2. **Secondary:** Bottom tab bar — always visible, shows active view + badge counts (knowledge triage, conversations blocking).
3. **Tertiary:** Top header — view title + utility icons.

## States

### Default (view selected)
- Top header: `Conversations` / `Work` / `Knowledge` title + utility icons.
- Main: full-width view content.
- Bottom: three tabs. Active tab highlighted. Badge dots on tabs with unresolved items.

### Thread detail (pushed view)
- Top header: `[back arrow] Thread title` (truncated).
- Main: full-width ThreadShell.
- Bottom: tab bar remains visible (consistent landmark; tapping another tab navigates away from thread).
- Composer pinned above the tab bar.

### Settings
- Top header: `[back arrow] Settings`.
- Main: full-width SettingsPage (scrollable sections).
- Bottom: tab bar hidden (settings is not a view).

### CoC / Assistant overlay
- The CoC trigger moves to a floating action button or to the top header.
- CocOverlay renders full-screen on mobile (already overlays the main pane).

### Empty / Loading / Error
- Same as Variant A — full-width EmptyState, SkeletonList, ErrorState.

## Behavior

- **Tab switching:** Instant, no animation. The active tab changes, the main content changes. Like native iOS/Android tab bars.
- **Back navigation:** Thread detail, settings, bet detail — any "pushed" view shows a back arrow in the top header. Tapping it pops the navigation stack.
- **Badges on tabs:** Conversations tab shows a small dot or count badge for `conversationsBlockingCount`. Knowledge tab shows a dot for `knowledgeTriageCount`. These are visible without opening a drawer — always-on awareness.
- **Touch targets:** Tab bar items are 56px tall. Top header buttons are 48px. All exceed 44px minimum.
- **Safe area:** Bottom tab bar includes `env(safe-area-inset-bottom)` padding for notched phones (iPhone X+).
- **Focus:** No focus trap needed — tabs are persistent landmarks, not modal.
- **Swipe:** Optional: horizontal swipe between views (Conversations <-> Work <-> Knowledge). Not blocking for v1.

## Mobile adaptation per view

### Conversations (no threadId)
- Full-width ThreadSections list.
- Filter chips in a scrollable row below the header.
- "New thread" button as a floating action button (bottom-right, above tab bar) or in the header.

### Conversations (with threadId)
- Full-width ThreadShell.
- Back arrow in header.
- Composer pinned to bottom, above tab bar.

### Work (portfolio)
- Single-column bet cards.
- Team selector as a horizontal scrollable row at the top (replacing sidebar sub-items).

### Work (team)
- Full-width. Agent rows stack vertically.

### Knowledge (list)
- Full-width KnowledgeRow list.

### Knowledge (detail)
- Full-width block body. Thread panel below.

## Signature

Three thumb-reachable tabs at the bottom. Badge counts always visible — you know at a glance if agents need attention without opening anything. The native-app feel of a tab bar.

## Trade-offs

- **Bad at:** Deep sidebar sub-items. The sidebar shows recent threads and team sub-items under each view. The tab bar only switches views — sub-navigation (which thread? which team?) happens inside the view content, not in the tab bar. This means thread selection requires: tap Conversations tab + scroll thread list + tap thread (same as now, but no sidebar thread shortcuts).
- **Bad at:** CoC/Assistant access. The sidebar has a dedicated Assistant button at the bottom. With a tab bar, the CoC trigger needs a new home (header icon or FAB). This is a minor displacement, not a loss.
- **Conceptual distance from desktop:** The desktop has a sidebar; the mobile has a tab bar. Two different navigation paradigms. A user switching between desktop and mobile must learn both. The mental model is the same (three views), but the affordance is different.
- **Component cost:** The MobileTabBar is a new shell element. It's not a design-system component (it lives in `packages/web/src/shell/`), but it's still new code to maintain. The VIEW_ICONS record from shell-types.ts provides icons, reducing duplication.
