# U6 Architecture Critique -- App Shell: Sidebar + Main (Layout Restructure)

ARCHITECTURE-SCORE: 8/10  rounds=1  score-line: SA:9 LI:9 AC:8 DM:8 N:9 MD:8 FMC:8 S:8 V:8

---

## Dimension Scores

### 1. Spec Alignment -- 9/10

Every acceptance criterion (AC-1 through AC-19) maps cleanly to at least one task. The AC table is explicitly numbered and each AC has a named file, a description, and a verification method. The plan's 12 tasks cover the full scope: new Sidebar component (Task 1), AppShell restructure (Task 2), filter relocation (Task 3), route rename (Task 4), old component deletion (Task 5), old test deletion (Task 6), hook simplification (Task 7), density allowlist update (Task 8), E2E test updates (Task 9), unit test updates (Task 10), remaining reference cleanup (Task 11), and use-roving-focus verification (Task 12).

No scope-creep tasks are present -- every task traces back to an AC or a forced dependency of an AC.

The plan correctly identifies that PitchSelector is dead code (not imported by any page), validating that its deletion is safe. This was verified: `PitchSelector.tsx` has zero imports outside its own file, stories, and tests.

### 2. Layer Integrity -- 9/10

All changes are within `packages/web` (Human Interface layer). No tasks touch `packages/server`, `packages/db`, or `packages/fabric`. The sidebar consumes existing hooks (`useConversationsThreads`, `useTeams`) that already wrap API calls -- no new API endpoints are introduced.

The filter state stays in AppShell and passes to page components via Outlet context, which is the correct React Router pattern. No cross-layer leakage.

The density allowlist update (Task 8) touches `packages/eslint-plugin-design`, which is a development tooling package, not a runtime layer -- this is correct.

### 3. API Contracts -- 8/10

No new API endpoints are introduced, which is appropriate. The plan correctly resolves the design's open question Q1 (conversation data source) by reusing `useConversationsThreads` and Q2 (team data source) by reusing `useTeams`.

The `SidebarProps` type signature in Task 1 is well-specified with all fields typed (`ReadonlyArray<SidebarThread>`, `ReadonlyArray<SidebarTeam>`, explicit null unions for optional selections, callback signatures). The `AppShellOutletContext` extension (adding `conversationsFilter` and `onFilterChange`) is explicitly typed.

**WARNING**: The `SidebarProps.activeScope` is typed as `string | null`, but the actual scope values are a closed union (`KnowledgeScope = "practice" | "product" | "factory"`). The prop should be `KnowledgeScope | null` to preserve type safety. Using `string` is an unnecessary widening.

**SUGGESTION**: The `RedirectProductToTeam` wrapper component in Task 4 is a correct solution for React Router's limitation (no param forwarding in Navigate), but its type signature is not given. It should return `JSX.Element` explicitly.

### 4. Data Model Alignment -- 8/10

No schema changes are introduced. This is a frontend-only restructure.

The "Plan reconciliation: spec vs reality" table is thorough: 14 rows mapping spec assumptions to codebase reality with resolutions. Every row was verified by reading the actual files.

**CRITICAL found and validated**: The plan states `use-roving-focus.ts` consumers are "IconRail.tsx, Rail.tsx. Both deleted. Safe to delete." This is factually incomplete -- `PitchSelector.tsx` also imports `useRovingFocus`. Since PitchSelector is also being deleted (Task 5), the conclusion is still correct (safe to delete), but the analysis is wrong. Task 12 should list all three consumers.

The migration tables for symbols (`IconRail`, `Rail`, `Submenu`, `PitchSelector`, `useRail`, `useViewportBreakpoint`, `use-roving-focus`, route paths, test IDs) are comprehensive. Each table lists every file that needs migration, verified against grep results.

### 5. Naming -- 9/10

Names are honest and descriptive:
- `Sidebar` (replacing `IconRail + Submenu + Rail` -- the name reflects the new single-column role)
- `SidebarThread`, `SidebarTeam` (domain-specific prop types, not generic `Item`)
- `RedirectProductToTeam` (the function name exactly describes what it does)
- `sidebarMobile` (in simplified `useViewportBreakpoint`) -- clear boolean semantics

No naming conflicts with existing domain primitives (Thread, Bet, Task, etc.). The `SidebarThread` type has `id`, `title`, `hasUnresolvedReview` -- these are a projection of the existing `ThreadItem`, not a conflicting definition.

The `ViewId` type and `VIEW_ICONS` constants are retained unchanged -- no unnecessary renames.

### 6. Module Depth -- 8/10

The `Sidebar` component has a well-scoped interface: it takes props for all three sections' data, selection state, and callbacks, plus CoC/settings triggers. This is a single entry point that hides the complexity of three sections, brand wordmark, bottom strip, and settings overlay adaptation.

The `AppShellOutletContext` extension is minimal -- adding `conversationsFilter`, `onFilterChange`, and `onClearFilter` to the existing single-field context. This is the minimum surface for filter relocation.

**SUGGESTION**: The `SidebarProps` interface has 17 fields. While each field is justified (3 data sources x {data, selected, onClick} + 2 triggers x {onClick, open} + view state + settings), this is a large prop surface. The architect might consider grouping into sub-interfaces (e.g., `SidebarConversationsProps`, `SidebarWorkProps`, `SidebarKnowledgeProps`) to improve readability, but this is cosmetic -- the implementation is not deeper because of it.

### 7. Failure-Mode Coverage -- 8/10

The Security & abuse cases table covers all relevant vectors: rate-limiting (N/A -- no new endpoints), input-trust (N/A -- thread titles from existing API), secrets (N/A), path-traversal (Low -- existing `sanitizeRouteId` reused), SSRF (N/A), XSS via thread titles (Low -- React auto-escapes).

The risks section identifies five realistic risks with mitigations:
- Test count reduction (mitigation: write replacements before deleting)
- E2E flakiness during migration (mitigation: update in one batch after all changes)
- ThreadSections dependency on SubmenuFilter type (mitigation: ConversationsFilter already exists)
- Knowledge scope sub-items divergence (mitigation: acceptable per spec, noted for future)
- CocOverlay positioning (mitigation: position is independent of trigger, no change needed)

**WARNING**: Risk 3 states "The import of `SubmenuFilter` is only in a comment." This is incorrect. AppShell.tsx line 39 has a runtime import: `import type { SubmenuFilter, SubmenuFilterOption } from "../shell/Submenu"`. AppShell line 442 uses `SubmenuFilter` as a type for `useState`. The migration must actually replace these type usages -- either by inlining the type, re-exporting it from a shared location, or replacing `SubmenuFilter` with `ConversationsFilter` (which is the subset AppShell already narrows to). The plan should document this migration explicitly.

**SUGGESTION**: The plan does not mention what happens to the `KnowledgeSubmenu` component currently defined inline in AppShell.tsx (lines 154-215). This component renders the scope browser (Practice/Product/Factory tabs) + topic NavItems. The approved design replaces this with simple NavItem sub-items per scope in the Sidebar. The plan should explicitly note that `KnowledgeSubmenu` is deleted from AppShell as part of Task 2, and that the `SCOPE_LABELS` constant is either deleted or retained for the Sidebar's hardcoded scope sub-items.

### 8. Simplicity / Over-Engineering Risk -- 8/10

The plan is appropriately scoped. No feature flags, abstract base classes, or plugin points are introduced. The `RedirectProductToTeam` component is the minimum solution for React Router param forwarding.

The decision to keep filter state in AppShell component state (not URL params) is the simplest choice that works -- the plan explicitly argues "moving to URL params would require updating every test that checks filter behavior."

The decision to use hardcoded knowledge scope labels rather than a new endpoint is correct simplicity.

**WARNING**: The plan's Task 12 ("Verify use-roving-focus.ts consumers") is sequenced as a separate task that runs "Before Task 5." This verification was already performed during plan authoring (the plan states the result). Making it a separate task adds process overhead. It should be a pre-check within Task 5, not a standalone task. This is minor but adds artificial task count.

**SUGGESTION**: The plan specifies `settingsNavItems?: ReactNode` as an optional prop on Sidebar. This is the right abstraction (the Sidebar does not know about settings section structure), but the plan does not specify who renders the settings nav items into this prop. Task 2's description says AppShell passes settings nav items as a ReactNode, which is correct, but the mechanism should be explicit: AppShell renders the `<ul className="menu menu-sm">` with NavItems and passes it as the `settingsNavItems` prop.

### 9. Verifiability -- 8/10

Every AC (1-19) has a specific verification method. Most are unit tests with named assertions:
- AC-1: "asserts: brand wordmark 'HyperIdle' visible, three section headers..."
- AC-3: "renders Sidebar with 7 threads, asserts only 5 rendered"
- AC-10: "npm run check passes, grep returns zero results"
- AC-13: "navigating to /work/team/123 renders WorkTeam, /work/product/123 redirects"

The protected-tests block lists 4 test files with clear contracts: AppShell.threads.test.tsx (protected, not weakened), useTeams.test.ts (protected), useRail.test.ts (deleted, not silently weakened), L21-coc-overlay.spec.ts (must still pass after trigger relocation).

**WARNING**: The plan does not list `M3-AppShell.knowledge-disable.test.ts` or `M3-AppShell.no-mock.test.tsx` in either the deletion list (Task 6) or the update list (Task 10). These test files exist in the `__tests__/` directory and reference AppShell behavior that will change. The builder should check whether these tests reference Submenu/Rail/IconRail testids and add them to the appropriate list.

**WARNING**: The plan's E2E test list (Task 9) does not mention `accessibility.spec.ts` or `accessibility-K8.spec.ts`. These E2E tests likely reference shell structure (data-ds-shell attributes like "IconRail", "Submenu", "Rail") that will be deleted. The builder should verify and add them to Task 9 if affected.

---

## Findings Summary

### CRITICAL

1. **[plan Task 12 / Data Model]** `use-roving-focus.ts` consumer list is incomplete -- PitchSelector.tsx also imports it. The deletion conclusion is still correct (all three consumers are deleted), but the analysis in the plan text should list all three: IconRail.tsx, Rail.tsx, PitchSelector.tsx.

### WARNING

1. **[plan Task 1 / API Contracts]** `SidebarProps.activeScope` is typed as `string | null` but should be `KnowledgeScope | null`. Unnecessary type widening loses the closed-union safety that catches typos at compile time.

2. **[plan Risks §3 / Failure-Mode]** Risk 3 incorrectly states SubmenuFilter import is "only in a comment." AppShell.tsx line 39 has a runtime `import type { SubmenuFilter, SubmenuFilterOption }`. The plan must document how to migrate away from these type imports when Submenu.tsx is deleted. Recommended: replace `SubmenuFilter` usage in AppShell with `ConversationsFilter` (already defined in ThreadSections.tsx), and drop `SubmenuFilterOption` (define equivalent inline or in a shared types file).

3. **[plan Task 2 / Failure-Mode]** The `KnowledgeSubmenu` component (AppShell.tsx lines 154-215) is not mentioned in the plan. It must be deleted or adapted as part of Task 2. The `SCOPE_LABELS` constant, `HEALTH_DOT` mapping, and `KnowledgeSubmenuProps` interface must either be deleted (if the sidebar hardcodes scope labels) or relocated.

4. **[plan Task 10 / Verifiability]** Missing test files `M3-AppShell.knowledge-disable.test.ts` and `M3-AppShell.no-mock.test.tsx` from the update/deletion audit. The builder must check whether these reference deleted shell components.

5. **[plan Task 9 / Verifiability]** Missing E2E specs `accessibility.spec.ts` and `accessibility-K8.spec.ts` from the E2E update audit. These likely assert against `data-ds-shell="IconRail"`, `"Submenu"`, or `"Rail"` attributes.

6. **[plan Task 12 / Simplicity]** Task 12 is a verification step that was already performed during plan authoring. It should be a pre-check within Task 5, not a standalone task.

### SUGGESTION

1. **[plan Task 1]** Consider grouping `SidebarProps` 17 fields into domain-scoped sub-interfaces for readability: `SidebarConversationsProps` (threads, selectedThreadId, onSelectThread), `SidebarWorkProps` (teams, activeTeamId, onSelectTeam), `SidebarKnowledgeProps` (activeScope, onSelectScope).

2. **[plan Task 4]** `RedirectProductToTeam` wrapper should have its return type explicitly annotated per project TypeScript rules.

3. **[plan Task 2]** Explicitly state that `SUBMENU_CONFIG` and `SUBMENU_FILTERS` constants in AppShell.tsx are deleted (or significantly reduced) since the Sidebar does not consume them. The Sidebar's section routing is handled by `onViewChange` which navigates directly.

4. **[plan Task 8]** Note that PitchSelector also appears in the density allowlist or density-audit references (if it does), since it is being deleted.

---

## What's Working Well

1. **Plan reconciliation table is exemplary.** 14 rows mapping spec assumptions to codebase reality with grep-verified line numbers and explicit resolutions. This is the quality bar every architecture plan should hit -- it prevents the "plan says X, code says Y" failure mode that wastes builder time.

2. **Migration tables are comprehensive and actionable.** Eight symbol-migration tables listing every file, every line number, and the specific migration action. The builder can execute these mechanically. This is the difference between a plan that saves time and a plan that generates questions.

---

## Overall Assessment

**Score: 8/10 -- APPROVED with noted findings.**

The architecture plan is thorough, well-structured, and correctly scoped. It covers all 19 acceptance criteria with verifiable tasks, identifies realistic risks with mitigations, and provides detailed migration tables that the builder can execute mechanically.

The primary concerns are: (1) the incomplete use-roving-focus consumer list (factual error, correct conclusion), (2) the incorrect SubmenuFilter import analysis in Risk 3, (3) the missing KnowledgeSubmenu component from the migration audit, and (4) a few missing test files from the update/deletion lists. None of these are structural failures -- they are completeness gaps the builder should address during implementation.

Both the design critique (8/10) and architecture critique (8/10) score above the 7/10 threshold. **Both artifacts are APPROVED for implementation.**
