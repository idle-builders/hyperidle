# Variant A -- Minimal Scaffold

**Constraint:** Smallest possible component count; reuse NavItem for everything without inventing new primitives. The shape falls out of recombining what exists.

**Thesis:** The sidebar is just a vertical list of NavItems grouped by labeled dividers. No new visual vocabulary. The existing NavItem with its icon, label, count, statusDot, and selected state handles every row.

## User task

A founder glances at the sidebar to switch between Conversations, Work, and Knowledge views, and to jump to recent threads, specific teams, or knowledge scopes.

## Component composition

- **Sidebar root**: `<nav>` with `w-[200px]` fixed, `bg-[var(--surface-container)]`, full viewport height, `flex flex-col`.
- **Brand wordmark**: `<span>` with `font-[family-name:var(--font-mono)]`, `text-[14px]`, `uppercase`, `tracking-[var(--tracking-caps)]`, `text-[var(--text-tertiary)]`. The word "HyperIdle" in mono caps. Quiet, not dominant.
- **Section label**: `<span>` with `font-[family-name:var(--font-mono)]`, `text-[11px]`, `uppercase`, `tracking-[var(--tracking-caps)]`, `text-[var(--text-tertiary)]`, `px-[var(--density-pad-x)]`. Same pattern as current Submenu title.
- **Section dividers**: `border-b border-[var(--border-subtle)]` between sections. Padding above/below divider: `py-[var(--space-2)]` (6px).
- **Section items (primary)**: NavItem with icon (16px SVG from VIEW_ICONS) + label + optional count badge. Full width. Clicking navigates to section root.
- **Sub-items**: NavItem WITHOUT icon, indented with `pl-[calc(var(--density-pad-x)+20px)]` to align text past the parent icon. Truncated labels. Optional statusDot. Clicking navigates to parent view with filter/param.
- **Settings button**: NavItem at bottom with gear SVG icon, label "Settings", pushed to bottom with `mt-auto`.
- **CoC trigger**: Small button below settings, same row style. Label "Chief of Staff" with the existing chat-bubble SVG icon.

## Information hierarchy

1. **Section labels** (tertiary): Mono uppercase 11px in `--text-tertiary`. Orientation only.
2. **Primary nav items** (secondary, primary when active): NavItem with icon. Active gets `bg-[var(--surface-elevated)]` + left border accent.
3. **Sub-items** (tertiary, secondary when active): NavItem without icon, indented. Active gets `bg-[var(--surface-elevated)]` + `shadow-[var(--shadow-subtle)]`.
4. **Brand wordmark** (tertiary): Quiet mono text. Does not compete.
5. **Settings / CoC** (tertiary): Bottom-anchored, dimmed until hovered.

## All states

### Empty
- Conversations section: primary "Conversations" item only, no sub-items. Text below: "No recent conversations" in `--text-tertiary` 12px.
- Work section: primary "Work" item only. Text: "No teams yet" in `--text-tertiary` 12px.
- Knowledge section: primary "Knowledge" item only. Text: "No scopes" in `--text-tertiary` 12px.

### Loading
- Sub-items replaced by 2-3 skeleton lines (SkeletonList pattern) at sub-item indentation level. Primary items always render (they're static).

### Error
- Sub-items replaced by inline error text: "Failed to load" in `--status-error` 12px with a "Retry" text button.

### Populated
- Conversations: "Conversations" primary + up to 5 recent thread titles as sub-items (truncated). Status dots on threads needing attention.
- Work: "Work" primary + team name sub-items. Count badge on primary showing total active bets.
- Knowledge: "Knowledge" primary + scope sub-items ("Practices", "Teams"). Status dot for staleness.

### Overflow
- Sub-items capped at 5 for conversations, all teams for Work (typically 2-5), all scopes for Knowledge (2-3). No scrolling within sections -- the sidebar itself scrolls if content overflows.

## Behavior

- **Click primary item**: Navigate to section root (`/conversations`, `/work/portfolio`, `/knowledge`). Set active view.
- **Click sub-item**: Navigate to parent view with filter/param. E.g., clicking team "Acme" navigates to `/work/team/acme-id`.
- **Hover**: NavItem's existing `hover:bg-[var(--accent-primary-dim)]` treatment.
- **Focus**: Roving focus within each section. Tab moves between sections. Arrow keys move within a section.
- **Keyboard**: No global shortcuts added. Existing Cmd+K for search unchanged.
- **Settings click**: Opens settings overlay (same pattern as current but Sidebar replaces its content with settings nav items, Main shows settings section).
- **CoC click**: Toggles CocOverlay (same behavior as current Rail trigger).

## Mobile adaptation

At viewport <= 768px, Sidebar becomes a drawer overlay triggered by a hamburger button in a top bar. The hamburger sits at top-left. Tapping a nav item closes the drawer and navigates.

## Signature

This variant looks like it always existed -- no new visual language. Every row is a NavItem. The sidebar is a vertical menu with mono section headers, identical to what Linear and Notion ship. The section headers are the only non-NavItem elements.

## Trade-offs

- **Bad at**: Visual distinction between sections is weak. All items look the same, so scanning relies on section labels. Dense.
- **Bad at**: The 200px constraint makes NavItem text truncation aggressive for long conversation titles.
- **Good at**: Zero new components. NavItem handles everything. Familiar pattern.
- **Good at**: Settings and CoC have clear homes at the bottom.
