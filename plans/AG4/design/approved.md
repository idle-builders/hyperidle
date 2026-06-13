# AG4 — Approved design

> **Reviewer verdict (Phase 2):** APPROVED. design-critique score 8/10, no CRITICAL. Two WARNINGs **applied in this doc** (designer, post-critique): (1) breadcrumb link segments + separators now spec `--text-secondary` not `--text-tertiary` (AQ-010 ≥4.5:1 — tertiary is 2.85:1, decorative-only) — see Tokens + Component API; (2) breadcrumb link `:focus-visible` ring now specified (2px `--accent-primary` outset, offset 2px, reused from Button) — see Behavior/Focus + Component API. See `../design-critique.md`.

**Chosen:** Variant A (in-pane header) + Variant B's consistency/consolidation. See `synthesis.md`.

## The shape
On every **detail screen**, the existing bordered header's first row becomes the **nav row**:

```
[←][→]   Work / Acme / Ship onboarding redesign
─────────────────────────────────────────────────
Ship onboarding redesign            [ACTIVE] [$4k appetite]
```

- `[←][→]` = Back / Forward history cluster, left-aligned, same position on every detail screen (muscle memory).
- `Work / Acme / Current` = `Breadcrumb` — the structural Up affordance; each non-final segment is a link to its parent path.
- Nav row sits **above** the title, **inside** the existing `<header>` (no new global band).

Root/list screens (portfolio, knowledge list, conversations list) get **no nav row** — they are top-of-hierarchy. Back/Forward there are keyboard-only (⌘[ / ⌘]).

## Component mapping

| Slot | Component | Props / usage |
|---|---|---|
| Back button | `Button` (DS, `variant="ghost"`, icon-only, 28×28) | `aria-label="Back"`, `title="Back"`, chevron-left SVG; `disabled` when no back history |
| Forward button | `Button` (DS, `variant="ghost"`, icon-only, 28×28) | `aria-label="Forward"`, chevron-right SVG; **omitted from DOM** when no forward history |
| Breadcrumb | **`Breadcrumb`** (NEW DS component) | `segments: { label: string; to?: string }[]` — last segment has no `to` (current, non-link). Renders `<nav aria-label="Breadcrumb">`, `/`-separated. Link segments + separators `--text-secondary` (13px); current (non-link) segment `--text-primary`; hover `--accent-primary`. |
| History cluster wrapper | plain `div` (flex gap 3px) inside the nav row | not a component |

`Breadcrumb` is the only new visual shape. It replaces 4 hand-rolled `<nav>` blocks (WorkBet, WorkTask, WorkTeam, KnowledgeDetail). Earns its budget: 4+ contexts, currently divergent. Needs a `.stories.tsx` rendering: 2-segment, 3-segment, 4-segment (truncated middle), with/without leading cluster slot.

### Breadcrumb component API (design contract)
- `segments: ReadonlyArray<{ label: string; to?: string }>` — required.
- `leading?: ReactNode` — optional slot for the Back/Forward cluster (so the cluster + crumb share one row and one `<nav>`-adjacent flex container). Architecture decides whether cluster is `leading` prop or a sibling — design only requires they sit on one 13px row.
- Middle segments truncate at `max-w-[120px]` with ellipsis; first and last never truncate the cluster.
- **Link focus ring (required):** each link segment must render a visible `:focus-visible` ring — `outline: 2px solid var(--accent-primary); outline-offset: 2px` (reuse of DS Button's ring; links aren't DS Buttons so the ring is explicit, not inherited). Honor `prefers-reduced-motion` (ring is instant, no transition).
- **Link color:** `--text-secondary` (≥4.5:1 per AQ-010), hover `--accent-primary`; current (non-link) segment `--text-primary`.

## States (all)

| State | Nav row |
|---|---|
| Detail, history exists | `[←enabled][→ if fwd-history]  full breadcrumb` |
| Detail, deep-link / no back history | `[←disabled]  (no →)  full breadcrumb` — Back at 35% opacity, `aria-disabled`, no hover; **breadcrumb fully present** so Up always works. No dead/misleading affordance. |
| Detail, loading | Cluster renders immediately (history is synchronous). Breadcrumb entity segment = skeleton chip until entity data loads; structural segments ("Work", "Knowledge") render instantly. |
| Root / list screen | No nav row. (Back/Forward via ⌘[ / ⌘] only.) |
| Overflow (long titles) | Middle breadcrumb segments truncate `max-w-[120px]`; current segment truncates last; cluster never truncates. |
| Settings overlay open | Detail nav rows are not visible (Settings replaces the Outlet). No special handling needed beyond existing settings rendering. |

## Behavior

- **Click:** Back → history back one step; Forward → history forward one step; breadcrumb segment → navigate to its `to` (explicit parent path = Up).
- **Keyboard (global, all screens, guarded against `input`/`textarea`/`contentEditable`):**
  - ⌘[ → Back · ⌘] → Forward
  - ⌘1 → Conversations · ⌘2 → Work · ⌘3 → Knowledge (order = sidebar order, top to bottom)
  - Must not fire while typing; must not collide with ⌘K (search), ⌘, (settings).
- **Hover:** ghost button bg → `--surface-container`, color → `--text-secondary`, `--motion-fast`. Breadcrumb link → `--accent-primary`.
- **Focus:** visible focus ring on every button + link. DS `Button` already provides it (`focus-visible:outline` 2px `--accent-primary`, offset 2px — `Button.tsx:57`). Breadcrumb link segments are plain `<a>`/`LinkComponent`, **not** DS Buttons, so they get **no** ring by default — the `Breadcrumb` component must explicitly specify `.crumb a:focus-visible` reusing Button's ring: `outline: 2px solid var(--accent-primary); outline-offset: 2px`. Without this the keyboard-first AC-5 path lands on invisible focus.
- **Motion:** color transitions only (`--motion-fast`); honor `prefers-reduced-motion`.

## Tokens / aesthetic (hard values)
- Breadcrumb link segments: `--text-sm` (13px), `--text-secondary` (#6b5d4d). **NOT `--text-tertiary`** — link segments are interactive content carrying meaning, so AQ-010 (≥4.5:1) applies; `--text-tertiary` (#9a8d7e = 2.85:1) is decorative/hint-only per its `@lore U3` (`tokens.css:159`) and would enshrine the pre-existing violation in a new Tier-1 component. `--text-secondary` clears 4.5:1.
- Current (trailing, non-link) segment: `--text-primary`.
- Separator `/`: `--text-secondary` (matches the link tier it sits between; reads as content, not a stray hint).
- Hover state: `--accent-primary` — re-verify it also clears 4.5:1 on page background.
- Cluster buttons: 28×28, `--r-subtle` radius, ghost.
- Row gap between cluster and crumb: `--space-3` (9px). Nav-row → title gap: `--space-2` (6px, existing `mb-[6px]`).
- Chevron SVG: same path as the mobile back button in AppShell (stroke-width 2, round caps), 18px.
- No new colors, no off-grid spacing, no AI-aesthetic tells (verified in mockup screenshots).

## Mobile adaptation
Untouched. Mobile keeps its existing 48px header + chevron back button (AppShell mobile branch). The detail nav row and `Breadcrumb` render desktop-only (`!sidebarMobile`). No double-back-button, no regression.

## Keyboard-shortcut collision map (for architecture)
| Key | Owner | AG4 |
|---|---|---|
| ⌘K | `useCommandK` (search) | untouched |
| ⌘, | Electron app-menu (settings) | untouched |
| ⌘[ / ⌘] | **AG4 Back/Forward** | new |
| ⌘1/2/3 | **AG4 view switch** (UX-8.4) | new |
| n / N | Conversations new-thread (AppShell) | untouched — AG4 shortcuts are ⌘-modified, no collision |

## UX-8.4 reconciliation
UX-8.4 documents ⌘1/2/3 (switch views) — AG4 implements them with order Conversations=1, Work=2, Knowledge=3 (sidebar order). It does **not** add `[`/`]` for Back/Forward to UX-8.4 because the doc only listed view-switch as the navigation shortcut; AG4 **adds** ⌘[ / ⌘] and updates UX-8.4 to list them alongside ⌘K and ⌘1/2/3. J/K, A/R/X/S, `?` remain owned by other workpackages — AG4 does not implement or claim them. /architecture: update UX-8.4 to include ⌘[ / ⌘] and pin the ⌘1/2/3 → view mapping.

## Open questions for the architect
1. **Up-path resolver location.** Promote AppShell's `navigateToParent` + `isDetailRoute` into a shared `useParentPath()` hook (or a pure `parentPathFor(pathname)` function) so both the mobile back button and the desktop breadcrumb compute the same parent. Where does it live — `packages/web/src/hooks/`?
2. **Breadcrumb segment data source.** Structural labels ("Work", "Knowledge") are static; entity labels (team name, bet title) come from page-loaded data. Does `Breadcrumb` receive ready-made `segments` from each page (pages already have the entity), or compute from a route map? Design preference: pages pass `segments` (they already hold the entity) — keeps `Breadcrumb` dumb. Confirm.
3. **History-availability signal.** How does the cluster know back/forward history exists? React Router v7 exposes navigation type / history index — architecture must source `canGoBack` / `canGoForward` reliably in both Electron (http renderer) and browser dev. Mark `⚠️ UNVERIFIED` until confirmed against RR v7 docs.
4. **Electron accelerator decision.** Renderer-level keydown (like `useCommandK`) vs Electron app-menu accelerators. Design intent: renderer-level (in-window nav, works identically in browser dev). Architecture owns the final call + rationale.
