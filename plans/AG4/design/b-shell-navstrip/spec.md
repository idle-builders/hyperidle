# Variant B — Shell-level nav strip

**Thesis:** Back/Forward are app chrome, not screen chrome. A single persistent thin nav strip sits at the top of the main pane (inside AppShell, above the `<Outlet/>`), present on every screen. It always holds Back/Forward; on detail screens the breadcrumb flows into the same strip. One nav zone for the whole app — like a browser toolbar, but Hearth-quiet.

## User task
Wherever the founder is, the top-left of the content pane has `[← →]`. On detail screens the strip reads `[← →]  Work / Acme / Bet title`. On roots it reads `[← →]` alone (Forward greyed/absent). One fixed place to look, always.

## Component composition
- **`NavStrip`** (Tier-3 shell component in `packages/web/src/shell/`, NOT design-system — it's a layout region like Sidebar): a 40px-tall bar, `border-b border-[var(--border-subtle)]`, `bg-[var(--surface-elevated)]`, rendered once in `AppShell` between sidebar-gap and the `<main>` Outlet.
- Holds: Back/Forward (`Button variant="ghost"` icon-only) + the **`Breadcrumb`** (NEW DS component, same as Variant A) when `isDetailRoute`.
- Detail pages **drop their own breadcrumb** entirely — all four hand-rolled `<nav>` blocks deleted; the strip owns location.
- Page headers keep only title + status + overflow (the breadcrumb row is removed from each page → simpler page headers).

## Information hierarchy
1. **NavStrip** (40px, top of pane) — `[Back][Fwd]` ghost buttons left, breadcrumb trail beside them, 13px, text-tertiary. Quiet: this is chrome, deliberately recessive (Principle S1 — dim the supporting chrome).
2. **Page content** below — title + body at full weight, now with a cleaner header (no breadcrumb line).

## States
- **Root screen (portfolio / knowledge list / conversations):** strip shows `[← →]` only; breadcrumb shows the single view label as current (e.g. just "Work" non-link, or empty). Back disabled when no history; Forward absent when none.
- **Detail screen:** strip shows Back/Forward + full breadcrumb.
- **Deep-link / no history:** Back disabled, Forward absent, breadcrumb fully present (Up always works).
- **Loading:** strip renders instantly; breadcrumb entity segment shows a skeleton chip; Back/Forward live immediately.
- **Settings overlay open:** strip hidden (settings is a modal context with its own Escape-to-close; a back button there is misleading). Mirrors how mobile header changes in settings.
- **Overflow:** breadcrumb middle segments truncate; strip never wraps (single 40px row, ellipsis on the trail).

## Behavior
Identical key/click semantics to Variant A (Back=`navigate(-1)`, Forward=`navigate(1)`, breadcrumb segment=Up, ⌘[ ⌘] ⌘1/2/3 via `useNavShortcuts`). Difference is purely *where* it renders.
- Strip is `shrink-0`, never scrolls — stays pinned as page content scrolls under it.
- Hover/focus identical to A.

## Mobile adaptation
NavStrip is desktop-only (`!sidebarMobile`). Mobile keeps its existing 48px header with the chevron back button — unchanged. So mobile gets zero new chrome; desktop gets the strip. Clean split, no double-back-button risk.

## Signature
A persistent, always-in-the-same-spot back/forward — muscle memory like a browser. The founder never hunts; top-left of content is *always* the way out.

## Trade-offs
- **Bad at:** adds 40px of permanent vertical chrome on every screen, including roots where Back is usually dead. On a list view the strip can read as near-empty (just two greyed chevrons) — risks looking like dead chrome (the exact AG2 complaint about meaningless controls). Mitigation: on roots, render Back only when history actually exists; otherwise the strip is genuinely useful only when it can act.
- More structural change to AppShell (new always-rendered region, both desktop + the settings-hidden case).
- The "browser toolbar" read is slightly less Hearth-distinctive — closer to generic app chrome.
