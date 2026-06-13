DESIGN-CLASS: routine-low-conf  ref=AppShell.navigateToParent+isDetailRoute,hand-rolled-breadcrumbs  pattern=none(no Breadcrumb component, no nav-strip html)

# AG4 — Design brief

## User task
A founder drilling between screens in the Electron window (no browser chrome) needs to: go back to where they just were (1 click + 1 key), see where they are and step up one level on any detail screen, and switch primary views from the keyboard. Decision being made every interaction: "how do I get out of this screen without hunting the sidebar?"

## Three affordance families (all in scope)
- (a) **Back / Forward** — visit-history traversal. Visual buttons + keyboard (⌘[ / ⌘]). Cross-view. Disabled/absent when no history behind current entry (deep-link case).
- (b) **Up / breadcrumb** — structural parent. One consolidated affordance on every detail screen. Always available (derived from path), never lies.
- (c) **View switch** — ⌘1/2/3 → Conversations / Work / Knowledge.

## Concept constraints (from plans/AG4/concept.md — locked, do not relitigate)
- Back ≠ Up. Back = `navigate(-1)` (temporal). Up = explicit parent path (structural, `navigateToParent`). Never wire Up to `navigate(-1)`.
- Up is always available; Back is conditional on history depth.
- No route changes, no breadcrumb-trail data model, no history rewriting.

## Phase 0b — Reuse inventory

| Element needed | Existing component / where | Verdict |
|---|---|---|
| Back/Forward icon buttons | `Button` (variant="ghost", icon-only) — DS export line 40 | EXTEND — pass chevron SVG as children; new `iconOnly`/`aria-label` usage, no new shape |
| Up/back parent action (mobile) | `navigateToParent` + `isDetailRoute` in `AppShell.tsx` (mobile branch) | EXTEND — promote to a shared hook `useParentPath`, consume on desktop too |
| Breadcrumb strip | 4 hand-rolled `<nav aria-label="Breadcrumb">` in WorkBet/WorkTask/WorkTeam/KnowledgeDetail | CONSOLIDATE — one `Breadcrumb` DS component replaces all four. **NEW**, justified: used in 4+ contexts today, currently duplicated/inconsistent (WorkTeam uses a `btn-ghost` chip with "← Portfolio"; others use `/`-separated text links). Meets the 2+-context budget rule by a wide margin. |
| View-switch keyboard | `useCommandK.ts` (document keydown + text-input guard pattern) | EXTEND — clone the pattern into a `useNavShortcuts` hook; reuse the guard |
| Detail-route detection | `isDetailRoute` in AppShell | REUSE as-is (move into the shared hook) |
| Disabled button state | `Button` has disabled styling | REUSE |

NEW components: **1** (`Breadcrumb`). NEW hooks: 2 (`useParentPath` extracted from AppShell, `useNavShortcuts` cloned from `useCommandK`). The `Breadcrumb` is the only new *visual* shape and it earns its budget by collapsing four divergent implementations into one.

## Settled by spec / rules (not asked)
- Desktop primary form factor; mobile already has back button (out of scope, leave alone).
- Aesthetic: Hearth, warm tones, ghost buttons, `--text-tertiary` for breadcrumb chrome (matches existing). 13px breadcrumb text (existing). Chevrons via inline SVG (matches mobile back button + sidebar icons).
- Shortcuts must guard text inputs (concept + `useCommandK` pattern). ⌘[ / ⌘] chosen for Back/Forward — these are the macOS-standard history keys (Safari/Finder), and don't collide with ⌘K (search), ⌘, (settings), ⌘1/2/3 (views).

## Open question for the two variants
**Where do Back/Forward live?** Two credible homes:
- **A — In-pane header**: Back/Forward + breadcrumb together in each screen's top header row (where breadcrumbs already render). One nav zone per detail screen; nothing new at shell level.
- **B — Shell-level nav strip**: a persistent thin nav bar at the top of the main pane (above the Outlet), holding Back/Forward always, with the breadcrumb flowing into it on detail screens. One nav zone for the whole app.

This is the load-bearing fork → 2 variants, A vs B.
