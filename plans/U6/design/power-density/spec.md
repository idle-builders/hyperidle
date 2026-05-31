# Variant B -- Power Density

**Constraint:** Optimize for the single most common power-user task: quickly switching between a recent conversation and the work portfolio. Cut everything else from the primary view; push it to secondary surfaces.

**Thesis:** The sidebar shows ONLY what the user touches 80% of the time at maximum density. Section labels are the clickable nav items themselves (not separate from sub-items). Sub-items use a minimal custom treatment (not full NavItem) to pack more into 200px. Knowledge and Work sub-items are below the fold -- recent conversations dominate.

## User task

A founder rapidly toggles between reviewing a conversation and checking their work portfolio. The sidebar is a speed dial, not a navigation tree.

## Component composition

- **Sidebar root**: `<nav>` with `w-[200px]` fixed, `bg-[var(--surface-container)]`, full height, `flex flex-col`.
- **Brand mark**: Single "H" letterform in `--font-mono`, `text-[18px]`, `font-semibold`, `text-[var(--text-tertiary)]`, top-left, 12px padding. Minimal footprint. Not a full wordmark.
- **Section header row**: A clickable row that IS the nav item. `font-[family-name:var(--font-mono)]`, `text-[12px]`, `uppercase`, `tracking-[var(--tracking-caps)]`, `text-[var(--text-secondary)]`. The section label itself is the click target for the section root route. Active section gets `text-[var(--text-primary)]` + `font-semibold`. No icon.
- **Sub-items**: Compact text-only rows. No NavItem wrapper -- just `<button>` elements with `px-[16px] py-[4px] text-[13px] text-[var(--text-secondary)]`. Truncated with `truncate`. Active sub-item gets `bg-[var(--surface-elevated)]` + `rounded-[var(--r-subtle)]` + `shadow-[var(--shadow-subtle)]`. Status dot as a 6px circle before the label.
- **Section gaps**: 18px (`--space-6`) vertical gap between sections. No dividers -- spacing is the separator.
- **Conversations section**: Takes 60%+ of the sidebar height. Section header "CONVERSATIONS" + up to 5 recent thread sub-items. This is the dominant section.
- **Work section**: Section header "WORK" + team sub-items. Compact.
- **Knowledge section**: Section header "KNOWLEDGE" + scope sub-items. Compact.
- **Bottom strip**: A thin strip with two icon-only buttons side by side. Left: gear icon (settings). Right: chat-bubble icon (CoC trigger). Both 32x32px, `btn-ghost`, `text-[var(--text-tertiary)]`.

## Information hierarchy

1. **Recent conversations** (primary): Largest visual block. Thread titles are the most scanned content.
2. **Section headers** (secondary): Clickable mono-caps labels. Active section is visually promoted.
3. **Work/Knowledge sub-items** (tertiary): Compact, below the fold in common use.
4. **Bottom icons** (background): Settings + CoC as tiny icon buttons. Discoverable but not prominent.
5. **Brand mark** (background): Single "H" letter. Near-invisible anchor.

## All states

### Empty
- Conversations: "CONVERSATIONS" header only. Below it: "Start a conversation" text in `--text-tertiary` 12px, clickable (opens recipient picker).
- Work: "WORK" header only. "No teams" in `--text-tertiary` 12px.
- Knowledge: "KNOWLEDGE" header only. "No scopes" in `--text-tertiary` 12px.

### Loading
- Sub-items show 2 skeleton lines per section (narrow, matching sub-item width). Section headers always render.

### Error
- Sub-item area shows "Load failed" in `--status-error` 12px. Clickable "Retry" link.

### Populated
- Conversations dominates: 5 recent threads with truncated titles, status dots for unread/blocking.
- Work: 2-4 team names with active-bet count badges.
- Knowledge: 2-3 scopes with staleness dots.

### Overflow
- Conversations capped at 5. If all 5 are long titles, truncation at ~130px text width.
- Sidebar itself gets `overflow-y: auto` with thin scrollbar for edge cases (many teams).

## Behavior

- **Click section header**: Navigate to section root. Header becomes active (bold, primary color).
- **Click sub-item**: Navigate to parent view with filter/param.
- **Hover sub-item**: `bg-[var(--accent-primary-dim)]` tint.
- **Focus**: Tab order: brand -> section headers -> sub-items within section -> bottom icons. Arrow keys navigate within sections.
- **Settings click**: Opens settings overlay. Sidebar content replaced with settings nav items.
- **CoC click**: Toggles CocOverlay (position:fixed, unchanged).
- **Keyboard**: Standard arrow navigation. No new shortcuts.

## Mobile adaptation

Sidebar becomes a drawer. The "H" mark becomes a hamburger+H combined button in a top bar. Drawer slides from left.

## Signature

The conversations section is disproportionately large. The sidebar is weighted toward the most common task (reading/reviewing conversations). Work and Knowledge are compact secondary sections that don't fight for attention. The section headers ARE the nav items -- no separate label + nav item pair.

## Trade-offs

- **Bad at**: Work-heavy users who rarely use conversations would see a sidebar weighted toward the wrong section. No per-user customization.
- **Bad at**: Sub-items use custom treatment (not NavItem), adding a new visual pattern to maintain.
- **Good at**: Speed for the common case. Conversations-first layout matches usage patterns.
- **Good at**: Maximum information density. Compact sub-items pack more titles into 200px.
- **Good at**: Clean bottom strip for settings + CoC without taking sidebar real estate.
