# Variant C -- Linear-Borrowed

**Constraint:** Borrow Linear's sidebar interaction grammar: flat list of sections with inline expand/collapse of sub-items. Each section is a disclosure group. The sidebar feels like a professional project management tool, not a chat app or wiki.

**Thesis:** Linear's sidebar proves that a 200px nav panel can hold three tiers of information (workspace, team, view) without feeling cramped. Their approach: section items are disclosure toggles that expand/collapse sub-items inline. The sidebar is a tree with max depth 2.

## User task

A founder navigates between views and drills into sub-items. The sidebar acts as a persistent table of contents for the app. Sections expand/collapse to show/hide sub-items, giving the user control over density.

## Component composition

- **Sidebar root**: `<nav>` with `w-[200px]` fixed, `bg-[var(--surface-container)]`, full height, `flex flex-col`.
- **Brand wordmark**: "HyperIdle" in `--font-sans`, `text-[14px]`, `font-[var(--fw-medium)]`, `text-[var(--text-primary)]`. Left-aligned, `px-[16px] py-[12px]`. Not mono, not uppercase. Clean and present but not loud.
- **Section item (disclosure)**: A row with: optional expand/collapse chevron (8px, `text-[var(--text-tertiary)]`), section icon (16px SVG from VIEW_ICONS), section label in `text-[14px]`, `font-[var(--fw-medium)]`, `text-[var(--text-secondary)]`. The entire row is a click target. Click behavior: single-click navigates to section root AND expands sub-items (if collapsed). Active section: `text-[var(--text-primary)]`, chevron rotated.
- **Sub-items (disclosed)**: Render BELOW their parent section when expanded. Indented `pl-[36px]` (past chevron + icon). `text-[13px]`, `text-[var(--text-secondary)]`. Active sub-item: `bg-[var(--surface-elevated)]`, `rounded-[var(--r-subtle)]`, `shadow-[var(--shadow-subtle)]`, `text-[var(--text-primary)]`. Status dot before label. No icon.
- **Section dividers**: 1px `border-b border-[var(--border-subtle)]` between sections, with `my-[6px]` margin.
- **Scrollable body**: The section+sub-item list is in a `flex-1 overflow-y-auto` container, so the sidebar scrolls if content exceeds viewport.
- **Bottom area**: Fixed at bottom (not scrolled). Contains:
  - CoC trigger: Full-width row with chat-bubble icon + "Chief of Staff" label. `text-[13px]`, `text-[var(--text-tertiary)]`. Hover: `bg-[var(--accent-primary-dim)]`.
  - Settings row: User avatar (24px circle) + user name (truncated) + gear icon at right. `text-[13px]`, `text-[var(--text-secondary)]`. Click opens settings overlay. Divider above this bottom section.

## Information hierarchy

1. **Brand wordmark** (secondary): Present and readable but not dominant. Anchors the sidebar's identity.
2. **Active section item** (primary): Icon + label at primary text weight. Visually loudest when active.
3. **Active sub-item** (primary): Elevated background + shadow makes it pop within the disclosed list.
4. **Inactive section items** (secondary): Icon + label in secondary text color. Recede but still readable.
5. **Sub-items** (tertiary): Small text, indented, quiet. Active sub-item elevates to primary.
6. **Bottom strip** (tertiary): CoC + Settings/avatar. Quiet, bottom-anchored.

## All states

### Empty
- Sections render with icons and labels but no sub-items. Chevrons hidden (nothing to disclose).
- Empty text per section in `--text-tertiary` 12px: "No conversations", "No teams", "No scopes".

### Loading
- Section items render immediately (static). Sub-items show 2 skeleton rows at sub-item indentation when section is expanded.

### Error
- Sub-item area shows "Couldn't load" in `--status-error` 12px with "Retry" link. Section items unaffected.

### Populated
- **Conversations**: Chevron + chat icon + "Conversations" + count badge. Expanded: up to 5 recent thread titles as sub-items with status dots.
- **Work**: Chevron + briefcase icon + "Work". Expanded: team name sub-items with active-bet counts.
- **Knowledge**: Chevron + book icon + "Knowledge". Expanded: scope sub-items ("Practices", "Teams") with staleness dots.
- All three sections default to expanded on first render. User can collapse any section; collapse state persists in localStorage.

### Overflow
- Sub-items capped per section. Sidebar body scrolls if total content exceeds viewport (many teams + all sections expanded).

## Behavior

- **Click section item**: Navigates to section root + expands sub-items if collapsed. Does NOT toggle collapse on re-click of active section (that would be confusing -- clicking the active section should not hide its children).
- **Click chevron only**: Toggles expand/collapse WITHOUT navigating. This is a separate click target from the label.
- **Click sub-item**: Navigate to parent view with filter/param.
- **Hover**: Row background tint `bg-[var(--accent-primary-dim)]`.
- **Focus**: Roving tabindex across all visible items (sections + expanded sub-items). Arrow Up/Down traverses the flat visible list. Arrow Right expands a collapsed section. Arrow Left collapses an expanded section. Home/End jump to first/last visible item.
- **Transition**: Sub-items expand/collapse with `--motion-fast` (120ms) height animation using CSS `grid-template-rows: 0fr -> 1fr` pattern (GPU-friendly, no layout animation).
- **Settings click**: Opens settings overlay. Sidebar bottom strip stays visible. Sidebar body replaces section content with settings nav items.
- **CoC click**: Toggles CocOverlay (position:fixed).
- **Section collapse persistence**: Stored in localStorage per section. Defaults: all expanded.

## Mobile adaptation

Sidebar becomes a full-height drawer from left. Brand wordmark in drawer header. Bottom strip (settings + CoC) stays at drawer bottom. Hamburger icon in top bar triggers the drawer. Selecting an item closes the drawer.

## Signature

The expand/collapse chevrons. Each section is a disclosure group that the user can open/close. This gives users control over sidebar density without changing the sidebar width. The chevron rotation animation (120ms) and the sub-item slide-in give the sidebar a tactile, responsive feel that the other variants lack.

## Trade-offs

- **Bad at**: More interaction complexity. Users must understand that chevrons toggle and labels navigate -- two actions on one row. (Mitigated: clicking the label does both simultaneously.)
- **Bad at**: Sub-item expand/collapse adds animation cost and state management (localStorage persistence, per-section open state).
- **Bad at**: The avatar + name row at bottom consumes more vertical space than a single icon button.
- **Good at**: User-controlled density. Collapse sections you don't care about.
- **Good at**: Disclosure pattern is deeply familiar from file browsers, IDE sidebars, and Linear itself.
- **Good at**: Full information available when sections are expanded; clean when collapsed. Best of both worlds.
- **Good at**: CoC trigger has a labeled row (not just an icon) making it discoverable.
