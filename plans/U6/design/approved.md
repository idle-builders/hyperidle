# U6 Approved Design -- App Shell: Sidebar + Main

## Summary

Replace `IconRail | Submenu | Main | Rail` with `Sidebar | Main`. The Sidebar is a 200px fixed-width vertical navigation with three labeled sections (Conversations, Work, Knowledge), dynamic sub-items under each, and a bottom strip for CoC trigger and settings access. Filters move from the Submenu to the main pane as pill tab bars.

The design synthesizes Variant A's flat NavItem-based structure with Variant B's merged section headers and Variant C's wordmark treatment and bottom area pattern.

## Chosen direction and rejection list

**Chosen:** Flat two-level sidebar. Section headers are clickable nav items (mono caps with icon). Sub-items are indented text-only rows. No expand/collapse. No disclosure chevrons. No tree behavior.

**Rejected and why:**
- Disclosure chevrons on sections: spec says "Sidebar NOT collapsible on desktop." Out of scope.
- "H" single-letter brand mark: too ambiguous. Full "HyperIdle" wordmark is needed.
- Icon-only bottom buttons: CoC trigger needs label text for discoverability.
- Custom sub-item component (non-NavItem): introduces maintenance cost. NavItem can be configured.
- User name in bottom strip: spec says "gear icon or user avatar", not a full identity row.
- Section expand/collapse with localStorage: over-engineering for three fixed sections.
- Drag-to-reorder: spec explicitly excludes.
- Active-bet/blocker/cost data in sidebar: the Rail's data sections are deleted, not relocated. That data moves to the main pane (future workpackages U7-U9).

---

## Component mapping

### Sidebar (new, `packages/web/src/shell/Sidebar.tsx`)

This is a Tier 3 shell composition (like the old Submenu/Rail), NOT a design-system primitive. It lives in `packages/web/src/shell/`, not in `packages/design-system/`.

**No new custom components are added to the 19-component budget.** The Sidebar is an AppShell composition that uses:
- `NavItem` (from `@hyperidle/design-system`) for sub-items
- DaisyUI primitives (`btn`, `badge`) for section headers and bottom buttons
- Semantic tokens from `tokens.css`

### Component budget impact

| Component | Action |
|---|---|
| Sidebar.tsx (new) | Tier 3 shell composition. Not counted against 19-component budget. |
| Sidebar.stories.tsx (new) | Story file for design system playground. |
| IconRail.tsx + stories | DELETE |
| Rail.tsx + stories | DELETE |
| Submenu.tsx + stories | DELETE |
| PitchSelector.tsx + stories | DELETE |
| useRail.ts | DELETE |
| useViewportBreakpoint.ts | SIMPLIFY (remove submenuCollapsed + railExpanded; add sidebarMobile) |

Net: -4 shell files, +1 shell file, -1 hook.

---

## Layout structure

### Desktop (>768px)

```
┌─────────────────┬─────────────────────────────────────┐
│    Sidebar      │              Main                   │
│    200px        │              1fr                    │
│    fixed        │        overflow-y: auto             │
│                 │                                     │
│  bg-container   │        bg-page                      │
│  border-right   │                                     │
│  border-subtle  │        px: density-page-gutter      │
│                 │        py: density-page-gutter      │
└─────────────────┴─────────────────────────────────────┘
```

The Sidebar is NOT collapsible on desktop. It is always 200px. No toggle button. No width transition.

### Mobile (<=768px)

The Sidebar becomes a drawer overlay. A hamburger button in a top bar opens/closes it. The drawer slides from the left over the main content. Clicking a nav item closes the drawer. This is out of scope for U6 (spec: "mobile sidebar refinement" is out of scope) but the component should be structured to support it later (conditional rendering via a `mobile` boolean from `useViewportBreakpoint`).

---

## Sidebar anatomy (top to bottom)

### 1. Brand wordmark

```
padding: 12px 16px
font-family: var(--font-sans)
font-size: 14px
font-weight: var(--fw-medium)
color: var(--text-primary)
text: "HyperIdle"
```

A clean sans-serif wordmark. Not mono, not uppercase, not oversized. Present but not dominant. Anchors the sidebar's identity without consuming vertical space. 14px at medium weight keeps it at the same visual level as section items -- it is part of the navigation landscape, not above it.

### 2. Section header (x3: Conversations, Work, Knowledge)

Each section header is a single clickable row with:

```
element: <button>
padding: 6px 16px
min-height: 32px
display: flex
align-items: center
gap: 8px

icon: 16px SVG from VIEW_ICONS (existing), color --text-tertiary (inactive) / --accent-primary (active)
label: font-family var(--font-mono), font-size 12px, uppercase, tracking var(--tracking-caps)
       color: --text-secondary (inactive) / --text-primary (active)
       font-weight: --fw-medium (inactive) / --fw-semibold (active)
count badge: (optional) font-mono 11px, background color-mix(text-secondary 8%, transparent), --r-pill

hover: background var(--accent-primary-dim)
active section: label and icon colors change as above. No left border (this is the header, not a NavItem).

click: navigates to section root route
```

The section header replaces the old Submenu title + first NavItem pair. "CONVERSATIONS" is both the section label and the nav target for `/conversations`. This eliminates one row per section compared to having a separate label + "All Conversations" item.

### 3. Section dividers

Between each section (between section headers + sub-items):

```
border-top: 1px solid var(--border-subtle)
margin-top: 6px (below last sub-item of previous section)
padding-top: 6px (above next section header)
```

Simple border dividers. No spacing-only separation (too ambiguous at this density). No decorative treatment.

### 4. Sub-items

Sub-items render below their section header. They use the `NavItem` component from `@hyperidle/design-system` with the following configuration:

```
NavItem props:
  label: truncated text (thread title, team name, scope name)
  icon: undefined (no icon for sub-items -- indentation handles visual hierarchy)
  count: undefined (no count badge on sub-items)
  selected: true when this sub-item is the active navigation target
  statusDot: "success" | "warning" | "error" | "info" | undefined
  onClick: navigates to parent view with filter/param

Styling override (via wrapper or className prop):
  padding-left: 40px (aligns text past the section header's icon)
  font-size: 13px (one step smaller than section header)
  min-height: 28px (compact, below default NavItem height)
```

**Active sub-item treatment:** The selected NavItem gets its existing `bg-[var(--surface-elevated)]` + `border-l-2 border-l-[var(--accent-primary)]` treatment. Additionally, the active sub-item receives `shadow-[var(--shadow-subtle)]` to create a subtle "pill" elevation effect that pops from the surrounding flat items.

**Sub-item counts per section:**
- Conversations: up to 5 most recent conversations. Sorted by last activity. Truncated titles.
- Work: all active teams. Typically 2-5. Short names, rarely truncated.
- Knowledge: scope labels ("Practices", "Teams"). Fixed 2-3 items. Never truncated.

**Sub-item navigation:**
- Clicking a conversation sub-item: navigates to `/conversations/:threadId`.
- Clicking a team sub-item: navigates to `/work/team/:teamId` (new route, replacing `/work/product/:productId`).
- Clicking a knowledge scope sub-item: navigates to `/knowledge?scope=<scope>`.

### 5. Scrollable body

The section headers + sub-items are wrapped in a `flex-1 overflow-y-auto` container. If the total content height exceeds the viewport (many teams + 5 conversations + 3 knowledge scopes), the sidebar body scrolls. The brand wordmark at top and bottom strip at bottom are NOT scrolled -- they are fixed within the sidebar flex column.

### 6. Bottom strip

Fixed at the bottom of the sidebar (not scrolled). Two rows:

**CoC trigger row:**
```
element: <button>
padding: 6px 16px
min-height: 32px
display: flex
align-items: center
gap: 8px

icon: 16px chat-bubble SVG (existing from Rail), color --text-tertiary
label: "Chief of Staff", font-size 13px, color --text-tertiary
hover: background var(--accent-primary-dim), color --text-secondary
aria-label: "Chief of Staff"
aria-expanded: cocOverlayOpen (boolean)

click: toggles CocOverlay (same behavior as current Rail trigger)
```

**Settings row:**
```
element: <button>
padding: 6px 16px
min-height: 32px
display: flex
align-items: center
gap: 8px

avatar: 24px circle, initials or image, background accent-primary-dim
gear icon: 14px, color --text-tertiary, margin-left auto (pushed to right edge)
hover: background var(--accent-primary-dim)
aria-label: "Settings"

click: opens settings overlay (same as current avatar button behavior)
```

Divider above the bottom strip: `border-top: 1px solid var(--border-subtle)`.

---

## Settings overlay adaptation

When settings is open:
1. Sidebar body (sections + sub-items) is replaced by settings nav items (existing NavItem components for Profile, Org Chart, Credentials, etc.).
2. Brand wordmark stays visible at top.
3. Bottom strip stays visible (CoC trigger + settings button remain accessible).
4. Main pane shows the active settings section component (unchanged from current).

This is the same pattern as the current Submenu-based settings overlay, adapted for the Sidebar.

---

## Filter relocation

Filters that currently live in the Submenu header (segmented tablist: All/Blocking/Async for Conversations, All/Needs review for Knowledge) move to the **main pane header** as a pill tab bar.

**Main pane header pattern:**
```
┌─────────────────────────────────────────────┐
│ [View title]                                │
│ [All] [Blocking] [Async]    ← pill tab bar  │
│                                             │
│ [Thread list / content]                     │
└─────────────────────────────────────────────┘
```

Each pill is a `<button>` styled as:
```
padding: 4px 12px
font-size: 13px
font-weight: var(--fw-medium)
border-radius: var(--r-pill)
border: 1px solid var(--border-default)
background: none (inactive) / var(--surface-elevated) (active)
color: var(--text-secondary) (inactive) / var(--text-primary) (active)
shadow: none (inactive) / var(--shadow-subtle) (active)
active border: var(--border-strong)
hover: background var(--accent-primary-dim)
transition: background var(--motion-fast)
```

The pill tab bar renders in the page component (Conversations, KnowledgeList), not in AppShell. Filter state remains in AppShell (or moves to URL params) and is passed to the page component via Outlet context or props.

---

## CocOverlay trigger relocation

The CocOverlay trigger moves from the Rail (deleted) to the Sidebar's bottom strip. The CocOverlay itself (position:fixed, `bottom-16 right-4`) is unchanged -- it renders at AppShell root, above Main. Only the trigger button moves.

The trigger is a labeled row in the Sidebar bottom strip (not icon-only) for discoverability. The trigger's `aria-expanded` attribute tracks the overlay's open state.

---

## Router changes

| Old route | New route |
|---|---|
| `work/product/:productId` | `work/team/:teamId` |

The old route should redirect to the new one for backwards compatibility. The `WorkTeam` page component reads `teamId` instead of `productId` from params.

---

## All states summary

### Sidebar section states

| Section | Empty | Loading | Error | Populated |
|---|---|---|---|---|
| Conversations | Header only + "No recent conversations" text (12px, --text-tertiary) | Header + 2-3 skeleton lines at sub-item indentation | Header + "Failed to load" (--status-error, 12px) + "Retry" link | Header + up to 5 conversation sub-items |
| Work | Header only + "No teams yet" text | Header + 2 skeleton lines | Header + "Failed to load" + "Retry" | Header + team name sub-items |
| Knowledge | Header only + "No scopes" text | Header + 2 skeleton lines | Header + "Failed to load" + "Retry" | Header + scope sub-items with status dots |

### Active state hierarchy

| Element | Inactive | Active/Selected |
|---|---|---|
| Section header | icon --text-tertiary, label --text-secondary --fw-medium | icon --accent-primary, label --text-primary --fw-semibold |
| Sub-item | --text-secondary, no bg | bg-[var(--surface-elevated)], shadow-subtle, --text-primary, --fw-medium, border-l-2 accent-primary |

### Sidebar global states

| State | Behavior |
|---|---|
| Settings open | Body replaced by settings nav items. Brand + bottom strip persist. |
| CoC overlay open | CoC trigger shows aria-expanded=true. Icon color --accent-primary. |
| Desktop | Sidebar always visible, 200px, not collapsible. |
| Mobile (<=768px) | Sidebar becomes drawer overlay (out of scope for U6). |

---

## Behavior and keyboard

- **Tab order**: Brand -> section headers (top to bottom) -> visible sub-items within each section -> CoC trigger -> Settings button -> Main content.
- **Within sidebar**: Arrow Up/Down moves focus between adjacent items (flat list traversal). Home/End jump to first/last item.
- **Cmd+K**: Opens GlobalSearchPanel (unchanged).
- **Escape**: If settings overlay is open, closes it. If CoC overlay is open, closes it.
- **No section-level keyboard shortcuts** (Variant C's Arrow Left/Right rejected).

---

## Mobile adaptation (placeholder for future)

At viewport <= 768px:
- Sidebar is hidden by default.
- A hamburger button appears in a top bar (or floating).
- Clicking hamburger opens sidebar as a drawer overlay from left.
- Clicking any nav item closes the drawer.
- The drawer uses `--motion-default` (240ms) slide animation.

This is explicitly out of scope for U6 but the Sidebar component should accept a `mobile` prop or be conditionally rendered so it can be adapted later without restructuring.

---

## Open questions for the architect

1. **Conversation sub-items data source.** The current `useConversationsThreads` hook fetches threads for the Conversations Submenu. Should the Sidebar reuse this hook to get the 5 most recent conversations, or should there be a separate lightweight endpoint (e.g., `GET /api/conversations/recent?limit=5`)?

2. **Team sub-items data source.** The `useTeams` hook exists and returns all teams. The Sidebar can consume this directly. Confirm.

3. **Knowledge scope sub-items.** Currently the Knowledge Submenu has a scope browser (Practice/Product/Factory) that is hard to represent as sub-items. The spec says sub-items are "specific scope sub-items (practices, teams)." Confirm: are these the knowledge scopes (Practice, Product, Factory) or something else?

4. **Filter state location.** Filters move from Submenu to main pane. Should filter state live in URL search params (e.g., `?filter=blocking`) or remain in AppShell state passed via Outlet context? URL params are shareable and survive refresh.

5. **Sidebar as density-aware or density-static?** The old IconRail was density-static (AQ-017). The Submenu was density-aware. The new Sidebar combines both functions. My recommendation: density-aware for sub-items (they are content), density-static for the 200px width and section header chrome. The architect should decide the exact density token mapping.

6. **PitchSelector deletion.** The spec says to delete PitchSelector.tsx. Confirm: is PitchSelector functionality being relocated or fully removed? If relocated, where?
