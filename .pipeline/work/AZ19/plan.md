# AZ19 — Work navigator

## Work package

**Outcome.** A person can switch team scope and scan or open relevant work directly in the sidebar navigator, with enough truthful status to choose where to focus next.

**Why this matters.** Work is inherently scoped and status-rich. A flat team shortcut list provides too little orientation, while a duplicated full Work page adds a navigation step before the person can reach the object they already know they need.

**What exists today.** AZ13 reserves the dynamic navigator for Work but preserves the old provisional team list. The main Work surfaces hold team selection, bets, routines, tasks and status summaries.

**Missing delta.** A Work-specific navigator that settles team scope placement, hierarchy or grouping, row status, controls and canonical order, then retires only the list surfaces it genuinely replaces.

**Depends on.** AZ13 — the stable domain switcher and dynamic navigator region must exist before Work can own that region.

**Complexity.** M

**Engineering tier.** mvp

**Pre-build.** Refinement and design required. The navigator must decide what “work item” means across teams, bets, tasks and routines, and how team scope changes the visible set.

**Constraints.** Status must come from authoritative current data and must not imply agent health or blocking state the system does not know. Team scope must be understandable on desktop and in the mobile drawer.

**Out of scope.** New work-domain entities, workflow state changes and redesigning object detail pages.

## Acceptance criteria

- The Work destination makes current team scope visible and lets the user change it without leaving the navigator.
- The navigator presents the work objects and truthful status selected in refinement, with consistent ordering and usable sort/filter/group controls.
- Responsive behavior is explicitly designed and validated for both the fixed desktop sidebar and the mobile drawer.
- Any Work list surface made redundant is removed only after its retained navigation and creation journeys are directly reachable.

## Validation scenarios

- Given work across multiple teams, when the user changes team scope, then the navigator updates predictably and makes the active scope unmistakable.
- Given an item needing attention among ordinary active work, when the user scans the navigator, then the available status helps them choose and open it without overstating system knowledge.
