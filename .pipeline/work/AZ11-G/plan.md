# AZ11-G — One page geometry

## Work package

**Outcome.** Every primary page uses the approved centered 1120px lane, so its visible header content and first page-level body content begin on the same edge across standard and managed layouts.

**Why this matters.** Moving between pages currently changes the reading origin and makes the product feel assembled from unrelated surfaces. Lists, forms, prose, and managed panes need one outer spatial grammar while preserving the narrower measures that make their content usable.

**What exists today.** AZ2 supplies PageScaffold and its scroll ownership. AZ11-O supplies the PageHeader/outline substrate for all 17 primary surfaces. The approved Option B mockups settle a centered 1120px outer lane with 24px gutters. Existing Settings and conversation/session content use narrower 680px and 760px readable measures, and Blocks have an intentional internal handle/discussion gutter.

**Missing delta.** Apply the approved outer lane to every real standard and managed route state, align the exact qualifying page-level body box to the PageHeader title edge, and preserve valid inner geometry.

**Depends on.** AZ11-O — Setup, NotFound, and Artifact need its PageHeader/outline substrate before all 17 header/body relationships can be implemented and verified.

**Complexity.** M

**Engineering tier.** mvp

**Pre-build.** Architecture required after AZ11-O merges: derive the real branch matrix from fresh `main`, name the exact visible measurement target for every surface/state family, allocate component versus painted evidence, inventory retained/reverted hunks, and prove the package remains below the repository complexity threshold. Design is not required: Option B, managed origin/destination roles, Block-shell ownership, and readable inner measures were approved on 2026-08-13.

**Constraints.** The outer PageColumn is centered, at most 1120px, and owns 24px horizontal gutters. Visible header content and the qualifying page-level body box align within 1 CSS px at 1440px, 1024px, and 390px. Settings retains a left-aligned 680px descendant; conversation/session retains a left-aligned 760px descendant; other readable measures remain left-aligned descendants. For authored Block documents, the outer `article[data-block-id]` shell owns the page edge while its existing 32px handle/discussion track plus 9px payload gap remains internal. Managed outers stay full width, origins align through PageColumn, destinations remain pane-local with H2 titles, and split ratios do not change. Static syntax checks must not claim branch completeness or painted alignment.

**Out of scope.** Breadcrumb identity or truncation; heading normalization or fallback-title copy; Block redesign; routes, APIs, loading behavior, content, sidebar composition, split ratios, or new managed abstractions.

## Acceptance criteria

- All 17 real primary surfaces and every real rendered state resolve their outer body geometry from the approved PageColumn rule.
- On lists, forms, standard details, and managed origins, the PageHeader title and each named qualifying first page-level body element share a left edge within 1 CSS px at 1440px, 1024px, and 390px.
- Existing 680px, 760px, prose, field, card, and Block payload measures remain left-aligned inner geometry rather than becoming new centered page columns or being widened silently.
- Managed split layouts keep their full-width outer, PageColumn-aligned origin, pane-local destination, heading levels, scroll ownership, and split ratios.
- Every migrated page remains scrollable to its final content, and enforcement/evidence states truthfully whether it proves syntax, rendered branches, or painted geometry.

## Validation scenarios

- Given a populated list, form, standard detail, and authored Block detail at 1440px, 1024px, and 390px, when each renders, then its title and named page-level control, row, field group, card, or Block shell share the same x-coordinate within 1px.
- Given Conversations normal and split states, a selected WorkTeam or WorkRoutine pane, and Review with and without an open Artifact, when each renders, then the origin follows the page lane while the destination keeps pane-local geometry.
- Given Settings or a conversation/session, when it renders on a wide screen, then its 680px or 760px readable content remains left-aligned inside the outer lane.
- Given a tall migrated page, when the user scrolls to the end, then the final content remains reachable and the pinned header does not move.
