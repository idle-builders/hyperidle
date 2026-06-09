# AE4 Approved Design: Mobile & Responsive Access

## Direction

Drawer sidebar with notification dot on hamburger. The existing Sidebar component renders inside a left-edge drawer at mobile viewports (<= 768px). Desktop layout is unchanged.

---

## 1. Shell layout changes (AppShell)

### Desktop (viewport > 768px) -- UNCHANGED

```
[Sidebar 200px] [Main flex-1]
```

No changes. The existing `flex h-screen` layout with `gap-[3px] p-[3px]` remains.

### Mobile (viewport <= 768px)

```
[MobileHeader 48px]
[Main flex-1, full width]
```

When `sidebarMobile === true` (from `useViewportBreakpoint()`):
- Sidebar is NOT rendered in the normal flow.
- A MobileHeader bar renders at the top.
- Main content is full width.
- The Sidebar renders inside a drawer overlay, triggered by the hamburger button.

### Drawer overlay (mobile only)

```
[Scrim (full screen, z-40)]
[Sidebar (absolute left, z-50, w-[280px])]
```

- Sidebar renders at 280px width on mobile (wider than desktop's 200px to improve touch targets).
- Scrim covers the viewport behind the sidebar.
- Drawer slides from `translateX(-100%)` to `translateX(0)`.
- Tapping scrim closes drawer.
- Escape key closes drawer.
- Focus is trapped inside drawer when open.

---

## 2. MobileHeader (shell element in AppShell, not a design-system component)

A 48px-tall bar at the top of the mobile viewport.

### Layout

```
[HamburgerBtn 48x48] [Title flex-1 truncate] [SearchBtn 48x48]
```

### Variant: Back arrow (when viewing a detail page)

When the current route is a "detail" route (e.g., `/conversations/:threadId`, `/work/bet/:betId`, `/knowledge/:knowledgeId`), the hamburger is replaced by a back arrow:

```
[BackBtn 48x48] [Title flex-1 truncate] [SearchBtn 48x48]
```

Back arrow navigates to the parent list view (not `navigate(-1)`, explicit parent path).

### Styling

- Height: 48px.
- Background: `--surface-elevated` (matches main pane).
- Border bottom: 1px `--border-subtle`.
- Title: 15px, weight 600, `--text-primary`, truncate with ellipsis.
- Hamburger icon: 24x24 SVG, `--text-secondary`. Three horizontal lines.
- Back arrow icon: 24x24 SVG, `--text-secondary`. Chevron-left.
- Search icon: 24x24 SVG, `--text-secondary`. Magnifying glass. Opens GlobalSearchPanel.

### Notification dot on hamburger

When `conversationsBlockingCount > 0` OR `knowledgeTriageCount > 0`, a 6px `--accent-primary` dot renders at the top-right corner of the hamburger button (offset -2px, -2px from the corner). This signals "items need attention" without opening the drawer.

---

## 3. Sidebar in drawer mode

The `<Sidebar>` component renders with the same props as desktop. The differences are:

- Width: 280px (via wrapper, not Sidebar prop change). The Sidebar's `w-[200px]` class is overridden by the drawer wrapper's width.
- The drawer wrapper provides: absolute positioning, z-index, slide animation.
- On item click (view change, thread select, team select, settings, CoC), the drawer closes automatically.

The Sidebar component itself is NOT modified for mobile. The drawer behavior is a wrapper concern.

---

## 4. Responsive content areas

### Conversations (thread list, no threadId)

- Full-width ThreadSections.
- Header bar: title + filter chips + "New thread" button. On mobile, the filter chips may wrap to a second line if the viewport is too narrow. The "New thread" button stays in the header.
- Thread rows render at full width. Timestamps align right. Avatar groups compress (show max 2 instead of 3).

### Conversations (thread detail, with threadId)

- Full-width ThreadShell.
- Mobile header shows back arrow + thread title.
- Composer pinned to bottom. Input font >= 16px (AQ-005).
- RichMessageCard verdict buttons: at <= 375px, the 4-button row may need to wrap. Use `flex-wrap` so buttons wrap naturally. Each button is 44px min-height.
- Q1 dial-in split: on mobile, the SessionActivityPanel renders below the thread (stacked), not beside it. The `flex-row` becomes `flex-col` at mobile widths.

### Work (portfolio)

- BetCard grid: `grid-cols-1` at mobile (currently `grid-cols-2` or `grid-cols-3` on desktop). Single-column card layout.
- Each BetCard renders at full width.

### Work (team)

- AgentRow cards: full width, stacked vertically (already this way on desktop).
- Bet list within team: single column.
- Task table: if present, horizontal scroll container (`overflow-x-auto`) to preserve table structure.

### Knowledge (list)

- KnowledgeRow: full width. Already single-column on desktop.
- Scope pills: wrap naturally with `flex-wrap`.
- Create button: in header, same position.

### Knowledge (detail)

- Full-width block body.
- Thread panel (if present): renders below the block body on mobile (stacked), not as a side panel.
- Block popover: renders as a bottom sheet on mobile instead of a floating popover. (Deferred to visual-polish if complex.)

### Settings

- Full-width SettingsPage. All sections stack vertically (already the layout).
- Mobile header: back arrow + "Settings" title.
- On mobile, settings sidebar nav items move to a scrollable horizontal tab bar at the top of the settings area, OR settings opens from the drawer (user taps avatar -> drawer closes -> settings page shows). Simplest approach: settings page renders full-screen, accessible via avatar button in the sidebar (opened via drawer).

---

## 5. PWA Manifest

A `manifest.json` in `packages/web/public/` enabling install-to-homescreen:

```json
{
  "name": "HyperIdle",
  "short_name": "HyperIdle",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#f5f0e6",
  "theme_color": "#16764f",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- `background_color`: Hearth light surface-page (`#f5f0e6`).
- `theme_color`: Hearth accent-primary (`#16764f`).
- `display: standalone`: removes browser chrome, makes it feel like a native app.
- Icons: simple SVG-derived PNGs. The existing `favicon.svg` can be rendered at 192px and 512px.
- Link tag in `index.html`: `<link rel="manifest" href="/manifest.json">`.
- Apple-specific: `<meta name="apple-mobile-web-app-capable" content="yes">` and `<meta name="apple-mobile-web-app-status-bar-style" content="default">`.

---

## 6. CORS configuration

The server's `cors.ts` middleware gains support for a `HYPERIDLE_CORS_ORIGINS` environment variable:

- Format: comma-separated list of allowed origins (e.g., `https://hyperidle.local:3001,https://10.0.1.5:3001`).
- Each origin is matched exactly (no wildcards, no regex).
- Existing localhost:5173 and 127.0.0.1:* rules remain as hardcoded defaults.
- When `HYPERIDLE_CORS_ORIGINS` is set, its origins are added to the allow list.
- Empty or unset = current behavior (localhost + 127.0.0.1 only).

---

## 7. Touch targets

AQ-015 requires >= 44px on all interactive elements at viewport <= 1024px. Current compliance:

- Sidebar section headers: ~38px (accepted tradeoff per existing lore). In drawer mode, the wider 280px layout gives more room.
- Sidebar sub-items: 32px row height. Need to increase to 44px at mobile widths. Apply `min-h-[44px]` to sidebar sub-item buttons when `sidebarMobile` is true.
- Composer send button: already uses `btn-sm` (min-height varies). Must verify >= 44px.
- Verdict buttons (Approve/Reject/Request Changes/Snooze): already use pill buttons with adequate height. Verify.
- Filter chips: 30px approx. Need `min-h-[44px]` on mobile.
- All header buttons (hamburger, back, search): 48px. Compliant.

---

## 8. Component mapping

| Design element | Implementation | Package | New? |
|---|---|---|---|
| MobileHeader | `<header>` element inside AppShell | web/src/layouts/AppShell.tsx | New shell element |
| Drawer wrapper | `<div>` with absolute positioning + scrim | web/src/layouts/AppShell.tsx | New shell element |
| Sidebar (in drawer) | Existing `<Sidebar>` component, unchanged | web/src/shell/Sidebar.tsx | Unchanged |
| Scrim | `<div>` with `--surface-overlay` bg | web/src/layouts/AppShell.tsx | New shell element |
| Notification dot | Conditional 6px dot on hamburger | web/src/layouts/AppShell.tsx | New visual indicator |
| PWA manifest | `manifest.json` | web/public/manifest.json | New file |
| PWA icons | `icon-192.png`, `icon-512.png` | web/public/ | New files |
| CORS config | `resolveOrigin()` update | server/src/middleware/cors.ts | Modified |

**Design-system component budget impact: 0.** All mobile-specific elements are shell-level (Tier 3) code in AppShell, not new primitives.

---

## 9. Rejected directions (locked)

- Bottom tab bar (see synthesis.md -- second nav paradigm, permanent space consumption).
- Full bottom drawer (sidebar is vertical, not horizontal).
- Swipe-only navigation (undiscoverable).
- Split-pane tablet layout (deferred, not v1).
- Floating action button for CoC (AI-aesthetic pattern).

---

## 10. Acceptance criteria mapping

| AC | Design solution |
|---|---|
| AC-1: Mobile auth | No design change needed. Auth works in browser. CORS update enables non-localhost access. |
| AC-2: Sidebar collapses | Drawer pattern. Sidebar hidden behind hamburger at <= 768px. |
| AC-3: Views usable at 375px | Full-width content, single-column grids, wrapped flex rows, stacked panels. |
| AC-4: Touch targets 44px | Mobile header 48px buttons, sidebar items get `min-h-[44px]`, filter chips get `min-h-[44px]`. |
| AC-5: PWA manifest | `manifest.json` with standalone display, Hearth colors, app icons. |
| AC-6: Review flow on mobile | ThreadShell full-width, verdict buttons in RichMessageCard (wrap at narrow widths), composer at bottom with 16px font. Back arrow in header. |
