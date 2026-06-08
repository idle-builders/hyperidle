# Architecture Critique: AE4

ARCHITECTURE-SCORE: 7/10  rounds=1  score-line: SA:8 LI:9 AC:7 DM:9 N:8 MD:7 FMC:6 S:8 V:7

---

## Dimension Scores

### 1. Spec Alignment: 8/10

All six ACs map to plan tasks. The mapping is explicit in the "Acceptance criteria + verification" section. No scope creep -- Task 6 (doc updates) is forced by the concept.md finding about 9 doc locations contradicting "desktop-only."

The plan correctly traces each task to an AC. The reverse mapping (every AC to a task) is also complete:

- AC-1 (mobile auth) -> Task 1 (CORS)
- AC-2 (sidebar collapse) -> Task 3 (AppShell drawer)
- AC-3 (views at 375px) -> Task 4 (responsive content)
- AC-4 (touch targets) -> Task 5 (touch enforcement)
- AC-5 (PWA manifest) -> Task 2 (PWA)
- AC-6 (review flow on mobile) -> Tasks 3 + 4 (drawer + responsive content)

**Finding (WARNING):** [plan, AC-5 verification] The verification for AC-5 says "Unit test in AE4-pwa-manifest.test.ts: Import/read manifest.json and assert required fields." Reading a JSON file and asserting on its static properties is not a test per the testing rules ("Reading source files with readFileSync to check for string patterns is a lint rule"). A manifest.json is a static file. Its correctness is a build-time property. The builder should either: (a) verify the link tag in index.html by rendering a page and checking `document.querySelector('link[rel="manifest"]')`, or (b) treat it as a static check outside the test suite. The plan should acknowledge this distinction.

### 2. Layer Integrity: 9/10

Clean layer separation. Task 1 (CORS) is server-only. Tasks 2-5 are web-only. Task 6 is docs-only. No cross-layer reaching. The web package consumes the server via HTTP (CORS), not via direct imports.

No findings.

### 3. API Contracts: 7/10

No new API routes are introduced. The only API change is CORS policy (which is middleware, not a route contract). The CORS contract is well-specified: exact-match origins, comma-separated env var, no wildcards.

**Finding (WARNING):** [plan, Task 1] The `parseConfiguredOrigins()` implementation parses the env var at module load time (`const CONFIGURED_ORIGINS = parseConfiguredOrigins();`). This is correct for runtime behavior but makes integration testing difficult. The existing CORS tests use `vi.stubEnv()` which sets the env var AFTER module initialization. The plan's tests use `vi.stubEnv("HYPERIDLE_CORS_ORIGINS", ...)` but by the time the test runs, `CONFIGURED_ORIGINS` is already frozen from module load (when the env var was unset). The builder will need to either: (a) make `parseConfiguredOrigins()` lazy (read env var on each request), (b) re-import the module after stubbing, or (c) use a different test strategy. The plan does not address this module-initialization timing issue.

**Finding (SUGGESTION):** [plan, Task 1] The CORS implementation uses `Array.includes()` for origin matching, which is O(n) per request. With a small number of configured origins (expected: 1-5), this is fine. But the plan should note this is intentionally simple and not a concern at expected scale, to prevent future over-engineering.

### 4. Data Model Alignment: 9/10

No schema changes. No migrations. No new tables. This dimension is nearly N/A for AE4.

The only data-adjacent concern is the PWA manifest.json, which is a static file with well-defined fields. The plan specifies every field correctly.

No findings.

### 5. Naming: 8/10

Names are honest: `sidebarMobile`, `drawerOpen`, `isDetailRoute`, `hasAttentionItems`, `MobileHeader`, `parseConfiguredOrigins`, `CONFIGURED_ORIGINS`. No generic names (Manager, Service, Handler).

`isDetailRoute` is descriptive but could be confused with "route detail page" vs "detail view of a route." In context, it clearly means "a route showing detail of an entity." Acceptable.

**Finding (SUGGESTION):** [plan, Task 3] `navigateBack` as a function name implies browser history navigation (`navigate(-1)`), but the plan specifies explicit parent paths. `navigateToParent` would be more accurate. Minor.

### 6. Module Depth: 7/10

The plan keeps AppShell as a single file with conditional rendering (mobile vs desktop). This is a reasonable v1 approach but the plan itself acknowledges the 487->~550 line growth and suggests extracting MobileHeader at 600 lines. That threshold is squishy.

**Finding (WARNING):** [plan, Task 3] The mobile header, drawer wrapper, scrim, notification dot, isDetailRoute derivation, pageTitle derivation, navigateBack logic, and drawer open/close state management all land in AppShell.tsx. This is ~80-100 lines of new mobile-specific code in a file that's already 487 lines. The plan says "extract MobileHeader if it exceeds 600 lines" but the MobileHeader itself is only ~20 lines of JSX. The real extraction candidate is the entire mobile shell branch (header + drawer + scrim + state), not just the header. The plan should specify the extraction boundary more precisely: if `sidebarMobile` branch exceeds N lines, extract a `MobileShell` component that receives the same props.

### 7. Failure-Mode Coverage: 6/10

This is the weakest dimension. The plan's "Security & abuse cases" table is adequate for the CORS change but thin on failure modes elsewhere.

**Finding (CRITICAL):** [plan, Task 3, "Drawer focus trap"] The plan says "Use focus-trap-react (already in dependencies) or manual focus management." This is not a decision -- it's two options with no resolution. The design critique flagged this as CRITICAL. The plan must commit to `focus-trap-react` because: (a) it is already a dependency, (b) it is already used in GlobalSearchPanel.tsx (line 9: `import FocusTrap from "focus-trap-react"`), and (c) manual focus management is incomplete by definition (it misses edge cases like the browser's own tab-cycle behavior). The plan should specify wrapping the drawer content in `<FocusTrap>` with the same `tabbableOptions.displayCheck="none"` that GlobalSearchPanel uses (per the lore comment at line 124).

**Finding (WARNING):** [plan, Task 3] The plan does not address the Android back button / `popstate` event for drawer close. On Android, when a drawer is open, the hardware back button should close the drawer rather than navigating away. The standard pattern is: push a history entry when the drawer opens, listen for `popstate` to close the drawer. The design critique flagged this. The plan should at minimum acknowledge this as a known gap for v1 or provide the `popstate` handling.

**Finding (WARNING):** [plan, Task 3] The `hasAttentionItems` derivation references `conversationsBlockingCount` which does NOT exist as a variable in AppShell. Verified: AppShell passes `knowledgeTriageCount` to Sidebar but does NOT pass `conversationsBlockingCount`. The Sidebar prop exists (defined in SidebarProps, AD5 work) but AppShell never computes or passes it. The plan must specify how to derive this value. The existing `conversationsThreads.threads` array has `hasUnresolvedReview: boolean` on each item -- the blocking count can be derived as `threads.filter(t => t.hasUnresolvedReview).length`. The plan should add this derivation and also pass it to Sidebar while at it (closing the AD5 gap).

**Finding (WARNING):** [plan, Task 3] The plan says drawer animation is skipped in v1: "For simplicity in v1, skip the slide animation (just appear/disappear)." The design critique flagged this as contradicting the design spec, which specifies `translateX(-100%)` to `translateX(0)` with `--motion-default`. CSS transitions on transform are trivial (one `transition` property + toggling a class). Skipping animation on a mobile drawer feels broken to users. The plan should include the animation -- it is 2-3 lines of CSS, not a complexity concern.

**Finding (WARNING):** [plan, Task 3] ARIA roles for the drawer are not specified. The drawer should have `role="dialog"` and `aria-modal="true"`. The scrim should have `aria-hidden="true"`. These are standard modal-dialog accessibility requirements. The plan's implementation sketch has `data-testid` attributes but no ARIA attributes on the drawer or scrim.

### 8. Simplicity / Over-Engineering Risk: 8/10

The plan is commendably restrained. No feature flags, no abstract patterns, no generic helpers. The CORS change is minimal (one env var, one array check). The drawer is raw React state + Tailwind (no DaisyUI drawer component -- justified in Q2 with the checkbox-toggle reasoning). The sidebar width migration is clean (`w-[200px]` -> `w-full`, parent controls).

The plan's Q2 interrogation (DaisyUI drawer vs raw Tailwind) is a genuine design-it-twice with a clear resolution. Not theatre.

**Finding (SUGGESTION):** [plan, Task 3] The `isDetailRoute` regex could be replaced with a simple route-config lookup (check if the current route definition has a `params` key with an entity ID). But the regex is clear and the route set is small. Not worth over-engineering.

### 9. Verifiability: 7/10

Each AC has a named verification method with specific assertions. The test file names are specified. Protected tests are enumerated.

**Finding (WARNING):** [plan, AC-3 verification] "Playwright E2E test: Set viewport to 375x812, navigate to /conversations, assert no horizontal scrollbar." The assertion "no horizontal scrollbar" is underspecified. Playwright can check `document.documentElement.scrollWidth <= document.documentElement.clientWidth` but the plan does not say this. "Assert content is visible and interactive" is vague -- what content? Which interaction? The E2E test needs concrete selectors and assertions.

**Finding (WARNING):** [plan, AC-4 verification] "Already enforced by ESLint rule `design/require-touch-target-min` at viewport <= 1024px." The plan relies on an ESLint rule for runtime visual behavior (touch target size). ESLint rules check class names, not rendered pixel sizes. A `min-h-[44px]` class is correctly detected by lint, but the actual rendered height depends on content, flex layout, and parent constraints. For the sidebar sub-items specifically, the plan should add a component test asserting rendered height >= 44px, not just rely on lint.

**Finding (SUGGESTION):** [plan, Task 3 tests] The test for "Mobile pathname change: closes drawer" is good. But there is no test for "Escape key closes drawer." This should be in the test list.

**Finding (WARNING):** [plan, isDetailRoute regex] The regex `/^\/(conversations|work\/bet|work\/routine|knowledge|agents)\/[^/]+/` has gaps: (a) `/work/team/:teamId` is missing -- team detail should show a back arrow. (b) `/knowledge/new` matches `knowledge/[^/]+` but is a create page, not a detail view. (c) `/work/bet/:betId/task/:taskId` matches but `navigateBack` should go to `/work/bet/:betId`, not to `/work/portfolio`. The plan specifies parent paths as "/conversations, /work/portfolio, /knowledge" but this is incomplete for nested detail routes. The regex and parent-path mapping both need to be expanded.

---

## Summary

### CRITICAL (1)

- [plan, Task 3, "Drawer focus trap"] Focus trap must use `focus-trap-react`, not "or manual focus management." The dependency exists, GlobalSearchPanel already uses it, and manual focus management is incomplete. Specify `<FocusTrap>` wrapper with `tabbableOptions.displayCheck="none"`.

### WARNING (9)

- [plan, AC-5] Manifest test reads a static file -- this is a lint check, not a test per project rules.
- [plan, Task 1] `CONFIGURED_ORIGINS` parsed at module load makes `vi.stubEnv()` ineffective in tests. The builder needs a lazy-read pattern or module re-import strategy.
- [plan, Task 3] AppShell will grow to ~550-580 lines. The extraction boundary should be "MobileShell" (the entire mobile branch), not just "MobileHeader."
- [plan, Task 3] Android back button / `popstate` event not addressed for drawer close.
- [plan, Task 3] `hasAttentionItems` references `conversationsBlockingCount` which is not available in AppShell. Must be derived from `conversationsThreads.threads.filter(t => t.hasUnresolvedReview).length`.
- [plan, Task 3] Drawer animation should not be skipped -- CSS transform transitions are trivial and a non-animated drawer feels broken on mobile.
- [plan, Task 3] ARIA roles missing: drawer needs `role="dialog"` + `aria-modal="true"`, scrim needs `aria-hidden="true"`.
- [plan, AC-3] E2E test assertions are vague ("content visible and interactive") -- need concrete selectors.
- [plan, Task 3, isDetailRoute] Regex misses `/work/team/:teamId`, incorrectly matches `/knowledge/new`, and `navigateBack` parent-path mapping is incomplete for nested routes like `/work/bet/:betId/task/:taskId`.

### SUGGESTION (3)

- [plan, Task 1] Note that O(n) array scan for CORS origins is intentionally simple at expected scale.
- [plan, Task 3] `navigateBack` should be named `navigateToParent` for accuracy.
- [plan, Task 3] Add Escape key test to the test list.

### What's Working Well

- The plan reconciliation table ("Spec assumption vs Reality vs Resolution") is thorough and saves the builder from discovery during implementation. Every assumption is verified against the actual codebase with line numbers.
- The interrogation questions (Q1-Q5) show genuine architectural thinking. Q2 (DaisyUI drawer vs raw Tailwind) is a real design-it-twice with a grounded decision. Q5 (drawer close on pathname change) is an elegant solution that avoids new props on Sidebar.
- The sidebar width migration strategy (`w-[200px]` -> `w-full` with parent-controlled width) is clean and the migration table listing every call site and test file that needs attention is excellent forward planning.

---

## Verdict

Score 7/10. Passes the advancement threshold. The one CRITICAL finding (focus trap ambiguity) must be resolved by the builder -- `focus-trap-react` is the only acceptable approach. The nine WARNINGs are real implementation concerns that the builder should address; the most impactful are: (1) `conversationsBlockingCount` not available in AppShell (will cause a runtime bug if copied verbatim), (2) `isDetailRoute` regex gaps (will produce wrong mobile header on team pages), and (3) CORS module-load timing (will cause test failures). The plan is architecturally sound and well-reasoned, with gaps concentrated in failure-mode coverage and edge-case completeness rather than in structural decisions.
