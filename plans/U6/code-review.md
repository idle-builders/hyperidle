# U6 Code Review -- App Shell: Sidebar + Main (Layout Restructure)

**Reviewer:** Phase 4 code review (Phase 2 design + architecture critique context carried forward)
**Branch:** `feat/U6-sidebar-layout`
**Commit:** `e68af6a4`
**PR:** #158

---

## Lens 1: Architecture

### SHOULD-FIX: A1 -- Sidebar does not use NavItem for sub-items

**Spec reference:** Architecture plan Task 1 type signature, design spec Section 4 ("Sub-items render below their section header. They use the `NavItem` component from `@hyperidle/design-system`").

The plan and design spec both explicitly state that sub-items use `NavItem` from the design system. The implementation uses raw `<li><button>` elements instead. The `@lore` comment at line 8 of Sidebar.tsx even says "It uses NavItem from @hyperidle/design-system for sub-items" -- but the import never appears. The Sidebar does not import `NavItem` at all.

**Impact:** The sub-items do not inherit NavItem's density-aware behavior (`--density-row-h`), its `selected` visual treatment (left accent border), or its accessibility patterns. The design spec explicitly describes the active sub-item treatment as including `border-l-2 border-l-[var(--accent-primary)]` from NavItem -- this is entirely absent from the implementation. The `@lore` comment at line 12 claims "Sub-items use NavItem which already consumes --density-row-h" which is false -- they use raw buttons with hardcoded `min-h-[28px]`.

**Files:** `/Users/tg/hyperidle/.worktrees/U6/packages/web/src/shell/Sidebar.tsx` lines 8, 12, 239-269

### SHOULD-FIX: A2 -- Knowledge scope sub-items missing active state treatment

**Spec reference:** Design spec Section 4, "Active sub-item treatment"; Architecture plan AC-7.

Thread sub-items (line 247) and team sub-items (line 293) receive `bg-[var(--surface-elevated)] shadow-[var(--shadow-subtle)]` when active. Knowledge scope sub-items (line 331) do NOT -- the `<li>` has a static `className="pl-10"` with no conditional active classes. Also missing `aria-current="page"` on the active scope item (present on threads at line 245 and teams at line 294).

**Files:** `/Users/tg/hyperidle/.worktrees/U6/packages/web/src/shell/Sidebar.tsx` lines 328-348

### SHOULD-FIX: A3 -- E2E tests not updated (Task 9 skipped entirely)

**Spec reference:** Architecture plan Task 9.

Zero E2E test files were modified. The plan lists 10 E2E files requiring updates:
- `navigation.spec.ts` still references IconRail, Submenu, Rail (lines 14-15, 23)
- `conversations-submenu.spec.ts` still references "Submenu" throughout
- `rail-collapsed-pills.spec.ts` was NOT deleted (file still exists)
- `l10-conversations-filter.spec.ts` references `submenu-filter-clear` (lines 81, 85, 147)
- `L13-product-drilldown.spec.ts` uses `/work/product/` URLs (10+ occurrences)
- `L17-cost-tokens.spec.ts` uses `/work/product/` URLs (lines 141, 251)
- `lifecycle-propagation.spec.ts` uses `/work/product/` URL (line 272)
- `settings-redesign.spec.ts` references "Submenu" (lines 5, 119, 125)
- `knowledge-ia.spec.ts` references `knowledge-submenu` testid (lines 21, 25, 30, 33)
- `keyboard-and-responsive.spec.ts` references Submenu (lines 64-69)

These E2E tests will fail when run against the new layout because they look for deleted components and testids. The orchestrator claims verify passed (197/197 tests), but E2E tests may not have been included in the vitest run (they use Playwright separately).

**Files:** `/Users/tg/hyperidle/.worktrees/U6/packages/web/e2e/` (entire directory untouched)

### SHOULD-FIX: A4 -- Task 11 (update remaining references) skipped

**Spec reference:** Architecture plan Task 11.

The following files were supposed to be updated but were not touched:
- `packages/web/src/test-setup.ts` line 95: still says "Submenu/Rail should" in comments
- `packages/web/src/components/ThreadSections.tsx` line 13: still says "Conversations Submenu (L8)"
- `packages/web/src/hooks/useConversationsThreads.ts` line 2: still says "Conversations Submenu"
- `packages/web/src/pages/KnowledgeList.tsx` line 7: still says "AppShell's Submenu scope browser"
- `packages/web/src/pages/WorkPortfolio.tsx` line 16: still says "navigates to /work/product/:id"
- `packages/web/src/pages/WorkTeam.stories.tsx` lines 47, 49: still uses `/work/product/` routes and `:productId` param

The stale stories file is a functional concern -- the stories will not render correctly with the renamed route.

**Files:** Multiple files listed above

### NIT: A5 -- GearIcon SVG path exceeds viewBox

The GearIcon SVG has `viewBox="0 0 16 16"` but the path data contains `L9 17` (y=17), meaning the bottom of the gear extends past the viewBox boundary and will be clipped. The gear icon will render with its bottom edge cut off.

**File:** `/Users/tg/hyperidle/.worktrees/U6/packages/web/src/shell/Sidebar.tsx` lines 100-107

### NIT: A6 -- Lore comment at Sidebar.tsx line 8 is factually incorrect

The comment says "It uses NavItem from @hyperidle/design-system for sub-items" but the component does not import or use NavItem. This will mislead future developers.

**File:** `/Users/tg/hyperidle/.worktrees/U6/packages/web/src/shell/Sidebar.tsx` lines 7-8

---

## Lens 2: Design

### SHOULD-FIX: D1 -- Missing border-l-2 accent on active sub-items

**Spec reference:** Design spec Section 4: "The selected NavItem gets its existing `bg-[var(--surface-elevated)]` + `border-l-2 border-l-[var(--accent-primary)]` treatment."

Active thread and team sub-items have `bg-[var(--surface-elevated)] shadow-[var(--shadow-subtle)]` but are missing the `border-l-2 border-l-[var(--accent-primary)]` left accent border specified in the design. This is a distinct visual indicator that distinguishes the active item from hover state.

**File:** `/Users/tg/hyperidle/.worktrees/U6/packages/web/src/shell/Sidebar.tsx` lines 246-250, 293-296

### SHOULD-FIX: D2 -- Section header min-height diverges from spec (intentionally, but inconsistently documented)

**Spec reference:** Design spec Section 2: "min-height: 32px"; Architecture critique AQ-015: "touch targets >= 44px".

The implementation uses `min-h-[44px]` on section headers and bottom strip buttons, citing AQ-015. This is the correct resolution of the conflict, but the design spec still says 32px and was not updated. The `@lore` comments correctly explain the override. The touch target compliance is good.

This is documented via `@lore` but the design spec itself remains inconsistent. Not blocking, but noted.

### OBSERVATION: D3 -- Conversations section header has no visible text

The Conversations section header renders no visible label text (only `aria-label`), unlike Work and Knowledge headers. This was done to avoid testing-library collision with "No recent conversations" empty state text. While technically accessible via `aria-label`, the visual output shows an icon-only button for the Conversations section header while other sections show icon + label. This is a visual inconsistency.

**File:** `/Users/tg/hyperidle/.worktrees/U6/packages/web/src/shell/Sidebar.tsx` lines 124-134, 164

### OBSERVATION: D4 -- Design spec says bg-container, code uses surface-container

Design spec Section "Layout structure" says `bg-container`. Implementation uses `bg-[var(--surface-container)]`. These may or may not be the same token. This should be verified against `tokens.css`.

**File:** `/Users/tg/hyperidle/.worktrees/U6/packages/web/src/shell/Sidebar.tsx` line 198

### OBSERVATION: D5 -- Font weight values are raw numbers, not token references

Design spec says `font-weight: var(--fw-medium)` and `var(--fw-semibold)`. Implementation uses `font-[500]` and `font-[600]` directly. These are numerically equivalent to medium/semibold but bypass the design token system. If the token values change, these won't follow.

**File:** `/Users/tg/hyperidle/.worktrees/U6/packages/web/src/shell/Sidebar.tsx` lines 155-156, 201, 261, 308, 340

---

## Lens 3: Security

### OBSERVATION: S1 -- Sidebar onSelectScope does not encode scope param

`handleSelectScope` in AppShell.tsx (line 332) navigates to `/knowledge?scope=${scope}` without `encodeURIComponent`. The scope values are hardcoded strings ("practices", "products", "factory") from `KNOWLEDGE_SCOPE_ITEMS` so this is not exploitable today, but if dynamic scopes are added later, this could become an injection vector.

**File:** `/Users/tg/hyperidle/.worktrees/U6/packages/web/src/layouts/AppShell.tsx` line 332

### OBSERVATION: S2 -- RedirectProductToTeam does not sanitize productId

The redirect wrapper at `router.tsx` line 37 passes `productId` directly into the navigate path without `sanitizeRouteId()` or `encodeURIComponent()`. The `productId` comes from URL params (user-controlled input).

**File:** `/Users/tg/hyperidle/.worktrees/U6/packages/web/src/router.tsx` line 37

No new POST/PATCH endpoints, no new trust boundaries, no secret handling changes. The security surface is minimal for this UI restructure.

---

## Lens 4: Adversarial

### SHOULD-FIX: V1 -- Double useConversationsThreads hook call

Both `AppShell.tsx` (line 245) and `Conversations.tsx` (line 503) call `useConversationsThreads(user?.id)`. This means the same API endpoint is fetched twice on every mount of the Conversations page -- once for the sidebar's 5-thread preview and once for the main pane's full list. The `@lore` comment at Conversations.tsx line 498 acknowledges this: "Both subscribe to the same API endpoint."

This is a performance regression. The architecture plan (Task 2) says to pass thread data via OutletContext, not to have the page re-fetch independently. The plan says "Reuse `useConversationsThreads` (already called in AppShell)" (Phase 0, Q1 resolution).

**Files:** `/Users/tg/hyperidle/.worktrees/U6/packages/web/src/layouts/AppShell.tsx` line 245; `/Users/tg/hyperidle/.worktrees/U6/packages/web/src/pages/Conversations.tsx` line 503

### SHOULD-FIX: V2 -- biome.json disables noUnusedVariables globally for all tests

The biome.json change adds `"noUnusedVariables": "off"` for all test and story files. This is a broad lint rule suppression that weakens lint coverage across the entire test suite. The specific file(s) that needed this suppression should use inline `// biome-ignore` comments instead.

**File:** `/Users/tg/hyperidle/.worktrees/U6/biome.json` lines 191-193

### OBSERVATION: V3 -- WorkTeam defensive guard duplicates existing null check

WorkTeam.tsx now has an additional `if (!data.team)` guard (line 139) that duplicates the logic of the existing `if (data === null)` check (line 123) and the 404 error check (line 103). The `@lore` comment says this handles "malformed API responses (e.g. stubs that return { threads: [], nextCursor: null } for unrecognised URLs in tests)" -- this is a test-infrastructure concern leaking into production code. The fetch stubs in tests should return proper team data shapes instead.

**File:** `/Users/tg/hyperidle/.worktrees/U6/packages/web/src/pages/WorkTeam.tsx` lines 135-149

### OBSERVATION: V4 -- Empty `<span className="flex-1" />` spacer

In the Settings button (line 404), there is an empty `<span className="flex-1" />` followed by `<span className="ml-auto">` containing the gear icon. The `flex-1` span and `ml-auto` are redundant -- either one alone would push the gear icon to the right. The empty span with no semantic purpose adds unnecessary DOM noise.

**File:** `/Users/tg/hyperidle/.worktrees/U6/packages/web/src/shell/Sidebar.tsx` lines 404-406

---

## Lens 5: Simplification

### OBSERVATION: P1 -- className join pattern repeated 15+ times

The pattern `[...classes].join(" ")` is used throughout Sidebar.tsx for conditional class composition. A small `cx()` helper (or `clsx` from node_modules) would reduce line count and improve readability. Not a finding per se, but a simplification opportunity if the codebase has a convention.

### OBSERVATION: P2 -- Duplicate "Team not found" EmptyState blocks

WorkTeam.tsx now has 3 identical "Team not found" EmptyState renders (lines 106-113, 125-131, 141-148). These could be extracted to a single variable or early-return pattern.

**File:** `/Users/tg/hyperidle/.worktrees/U6/packages/web/src/pages/WorkTeam.tsx`

---

## Lens 6: AI Slop

### OBSERVATION: L1 -- Verbose @lore comments duplicated between Sidebar.tsx and its callers

The testing-library quirk about Conversations header text is explained in three separate `@lore` comments: lines 124-134 (SectionHeader function), lines 227-234 (empty state rendering), and could have been a single comment at the component level. The repetition is a maintenance hazard -- if the workaround changes, three comments must be updated.

### OBSERVATION: L2 -- Comment section separators

The file uses `// ---------------------------------------------------------------------------` separator comments 9 times. These add visual noise without semantic value. The functions themselves are clear enough.

### OBSERVATION: L3 -- "Page component" comment header appears twice

In Conversations.tsx, the comment block `// Page component` appears at both line 414 and line 478. The first one (line 414) precedes the FilterPillBar component, not the page component. Misleading.

**File:** `/Users/tg/hyperidle/.worktrees/U6/packages/web/src/pages/Conversations.tsx` lines 414, 478

---

## AC Completeness Audit

| AC | Description | Verdict | Evidence |
|----|-------------|---------|----------|
| AC-1 | Sidebar renders with brand, sections, icons, dividers, bottom strip | **PASS** | `Sidebar.test.tsx` tests brand "HyperIdle", 3 section headers, dividers (hr elements), bottom strip with CoC + Settings buttons. `data-ds-shell="Sidebar"` attribute present. |
| AC-2 | AppShell uses Sidebar \| main (no IconRail/Submenu/Rail) | **PASS** | `U6-AppShell-sidebar.test.tsx` asserts `data-ds-shell='Sidebar'` present, IconRail/Submenu/Rail absent, `main-content` testid present. |
| AC-3 | Conversations section: up to 5 threads, empty state | **PASS** | `Sidebar.test.tsx` tests 7 threads showing only 5, empty state text "No recent conversations". |
| AC-4 | Work section: team sub-items, empty state | **PASS** | `Sidebar.test.tsx` tests 3 teams rendered, empty state "No teams yet". |
| AC-5 | Knowledge section: scope sub-items | **PASS** | `Sidebar.test.tsx` tests Practices, Products, Factory labels rendered. `AppShell.knowledge-submenu.test.tsx` tests scope navigation. |
| AC-6 | Active view highlighting | **PASS** | `Sidebar.test.tsx` tests `data-active='true'` on active section header, absence on inactive sections. |
| AC-7 | Active sub-item elevated bg + shadow | **PARTIAL** | Thread and team sub-items have bg-elevated + shadow (tested). Knowledge scope sub-items do NOT have this treatment. Missing `border-l-2 accent-primary` per design spec on all sub-item types. |
| AC-8 | Settings overlay in sidebar | **PASS** | `Sidebar.settings.test.tsx` tests settingsNavItems rendered when settingsOpen=true, hidden when false. `AppShell.P4-settings.test.tsx` tests full settings flow. |
| AC-9 | CoC trigger in sidebar | **PASS** | `Sidebar.test.tsx` tests button with aria-label "Chief of Staff", click handler, placement in bottom strip. |
| AC-10 | Old components deleted | **PASS** | Verified: IconRail.tsx, Rail.tsx, Submenu.tsx, PitchSelector.tsx, and all their stories files are deleted. No dangling imports in production code. |
| AC-11 | useRail deleted | **PASS** | File and test file both deleted. No imports remain. |
| AC-12 | useViewportBreakpoint simplified | **PASS** | `U6-viewport-breakpoint.test.ts` verifies `sidebarMobile` boolean, absence of `submenuCollapsed`/`railExpanded`, boundary at 768px. |
| AC-13 | Router rename + redirect | **PASS** | `U6-router.test.tsx` tests `/work/team/t1` renders WorkTeam, `/work/product/t1` redirects to `/work/team/t1`. |
| AC-14 | WorkTeam uses teamId | **PASS** | `WorkTeam.tsx` line 81 uses `useParams<{ teamId: string }>()`. `U6-router.test.tsx` tests it renders at new route. |
| AC-15 | WorkPortfolio navigates to /work/team/ | **PASS** | `WorkPortfolio.tsx` line 165 changed to `/work/team/`. `U6-router.test.tsx` tests no `/work/product/` links remain. |
| AC-16 | Filters in main pane | **PASS** | `U6-filter-relocation.test.tsx` tests pill bar (All/Blocking/Async) in main pane, NOT in sidebar. `AppShell.l10-filter.test.tsx` tests filter narrowing/clearing. |
| AC-17 | Sidebar.stories.tsx exists | **PASS** | File exists at `packages/web/src/shell/Sidebar.stories.tsx` with 8 story variants (ConversationsActive, WorkActive, KnowledgeActive, EmptySections, WithSelectedThread, CocOverlayOpen, SettingsOverlayOpen, WithUserAvatar). |
| AC-18 | npm run verify passes | **PASS** | Attestation file exists at `.verify-attestations/70258a11...json`. `npm run check` and `npm run lint` both pass with zero errors (verified during review). |
| AC-19 | Density allowlist updated | **PASS** | `density-allowlist.json` diff shows IconRail, Submenu, Rail, and PitchSelector entries all removed. `npm run lint:eslint` passes. |

---

## Phase 2 Critique Issue Resolution

| Issue from Phase 2 | Status | Notes |
|---------------------|--------|-------|
| CRITICAL: Touch targets at tablet viewports (AQ-015) | **ADDRESSED** | Section headers use `min-h-[44px]`. Bottom strip buttons use `min-h-[44px]`. Sub-item buttons use `min-h-[28px]` which is below 44px -- but the `@lore` at line 12 claims NavItem consumes `--density-row-h` which is false since NavItem is not used. Sub-item touch targets may be too small at tablet. |
| WARNING: NavItem className override mechanism | **NOT APPLICABLE** | NavItem is not used for sub-items (deviation from plan). |
| WARNING: aria-current="page" on active nav items | **PARTIALLY ADDRESSED** | Present on threads (line 245) and teams (line 294). Missing on knowledge scope sub-items. |
| WARNING: SubmenuFilter import migration | **ADDRESSED** | `ConversationsFilter` type imported from `ThreadSections.tsx` in both AppShell and Conversations. No `SubmenuFilter` import remains. |
| WARNING: KnowledgeSubmenu inline component cleanup | **ADDRESSED** | Knowledge scope browser replaced by static sidebar scope items. |
| WARNING: Missing test files from audit | **PARTIALLY ADDRESSED** | New unit tests cover Sidebar component well. E2E tests NOT updated. |

---

## Verdict: NOT DONE

### Must-fix before approval:

1. **A3 (SHOULD-FIX):** E2E tests not updated. 10 E2E files reference deleted components, old routes, and stale testids. At minimum: delete `rail-collapsed-pills.spec.ts`, update `navigation.spec.ts`, update `L13-product-drilldown.spec.ts` and `L17-cost-tokens.spec.ts` route URLs, update `lifecycle-propagation.spec.ts` route URL. The full E2E suite will fail against the new layout.

2. **V1 (SHOULD-FIX):** Double `useConversationsThreads` fetch. The Conversations page should receive thread data via OutletContext (as the architecture plan specifies) rather than independently calling the hook, causing duplicate API requests on every page load.

3. **A2 (SHOULD-FIX):** Knowledge scope sub-items missing active state treatment (bg-elevated + shadow) and `aria-current="page"`. Inconsistent with thread and team sub-item behavior.

4. **V2 (SHOULD-FIX):** biome.json globally disables `noUnusedVariables` for all test files. This should be scoped to the specific files that need it, not a global override.

### Should-fix (not blocking but should be addressed in this PR):

5. **A1:** Sidebar does not use NavItem for sub-items as both the architecture plan and design spec require. The `@lore` comment falsely claims it does. Either use NavItem (as planned) or update the plan + lore comments to document the deviation and rationale.

6. **D1:** Missing `border-l-2 border-l-[var(--accent-primary)]` left accent border on active sub-items per the design spec.

7. **A4:** Task 11 stale references (comments and WorkTeam.stories.tsx routes).

8. **A5:** GearIcon SVG path exceeds viewBox (y=17 in 16x16 box).
