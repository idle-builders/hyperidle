# U6 Architecture Plan -- App Shell: Sidebar + Main (Layout Restructure)

## Required reading

- `plans/U6/design/approved.md` -- the visual contract (DO NOT re-litigate)
- `packages/web/src/layouts/AppShell.tsx` -- the file being restructured
- `packages/web/src/shell/IconRail.tsx`, `Rail.tsx`, `Submenu.tsx`, `PitchSelector.tsx` -- files being deleted
- `packages/web/src/hooks/useRail.ts`, `useViewportBreakpoint.ts` -- hooks being deleted/simplified
- `packages/web/src/shell/shell-types.ts` -- VIEW_IDS, VIEW_ICONS (retained)
- `packages/web/src/router.tsx` -- route rename
- `packages/web/src/pages/WorkTeam.tsx`, `WorkPortfolio.tsx` -- productId -> teamId migration
- `packages/design-system/src/NavItem.tsx` -- sub-item rendering

---

## Phase 0 -- Resolved interrogation probes

### Q1: Conversation sub-items data source
**Resolution:** Reuse `useConversationsThreads` (already called in AppShell). Slice the first 5 threads sorted by `lastActivityAt` (already sorted by the server). No new endpoint needed. The hook already returns `threads: ThreadItem[]` with `id`, `title`, `lastActivityAt`, `hasUnresolvedReview`.

### Q2: Team sub-items data source
**Resolution:** Use `useTeams` hook (already exists at `packages/web/src/hooks/useTeams.ts`). Returns `TeamListResponse` with team `id`, `name`, `active` fields. Filter to `active: true` for sidebar display.

### Q3: Knowledge scope sub-items
**Resolution:** The spec says "specific scope sub-items (practices, teams)." Examining the current Knowledge Submenu, it has a scope browser with Practice/Product/Factory tabs from `KNOWLEDGE_SCOPES`. The sidebar sub-items should be the knowledge scopes as static entries: "Practices", "Products", "Factory". These are hardcoded labels (same as current `SCOPE_LABELS` in AppShell), not dynamic data. Each clicks to `/knowledge?scope=<scope>`.

### Q4: Filter state location
**Resolution:** Keep filter state in AppShell component state (same as current). Filters are session-transient, not URL-shareable. Moving to URL params would require updating every test that checks filter behavior. The filter state is passed to page components via Outlet context (extend `AppShellOutletContext` with `conversationsFilter` and `onFilterChange`). This is the minimal change that moves filters from Submenu to main pane.

### Q5: Sidebar density treatment
**Resolution:** Sidebar is density-AWARE for sub-items (they use NavItem which already consumes density tokens) but density-STATIC for its 200px width and section header chrome. The density allowlist needs updating: remove IconRail (deleted), add Sidebar with a "mixed" annotation. Practically, the Sidebar root element does not consume `var(--density-*)` tokens for width, but the NavItem children inside it do automatically.

### Q6: PitchSelector deletion
**Resolution:** PitchSelector is defined in `packages/web/src/shell/PitchSelector.tsx` but is NOT imported by any page component. It is a dead component. Delete it and its stories/tests. If it's needed later, it can be rebuilt from the Canvas/Kanban patterns.

---

## Plan reconciliation: spec vs reality

| Spec assumption | Reality | Resolution |
|---|---|---|
| `useRail.ts` is a hook in `hooks/` | Yes: `packages/web/src/hooks/useRail.ts` | Delete file + test |
| `useViewportBreakpoint.ts` is in `hooks/` | Yes: `packages/web/src/hooks/useViewportBreakpoint.ts` | Rewrite: remove submenuCollapsed/railExpanded, add sidebarMobile |
| Route `work/product/:productId` exists | Yes: `router.tsx:60` | Rename to `work/team/:teamId`, add redirect for old path |
| `WorkTeam` uses `useParams<{ productId: string }>()` | Yes: `WorkTeam.tsx:82` aliases `productId` to `teamId` | Change to `useParams<{ teamId: string }>()` directly |
| `WorkPortfolio` navigates to `/work/product/` | Yes: `WorkPortfolio.tsx:165` | Change to `/work/team/` |
| `IconRail` is in density-static allowlist | Yes: `density-allowlist.json` | Remove IconRail entry |
| `PitchSelector` is used somewhere | No: defined but never imported by any page | Safe to delete |
| `SubmenuFilter` type exported from Submenu.tsx | Yes: imported by AppShell, ThreadSections | Move `ConversationsFilter` type to remain in ThreadSections.tsx (already defined there). Remove `SubmenuFilter` import from AppShell. |
| `test-setup.ts` references Submenu/Rail | Yes: line 95, 105 comments | Update comments |
| `dsShellProps("IconRail")`, `("Rail")`, `("Submenu")`, `("PitchSelector")` | Used in deleted files only | No migration needed -- files are deleted |
| E2E `navigation.spec.ts` tests IconRail/Submenu/Rail layout | Yes: lines 14-45 | Rewrite to test Sidebar layout |
| E2E `conversations-submenu.spec.ts` | Yes: full test file for Submenu threads | Rewrite to test Sidebar conversation sub-items |
| E2E `rail-collapsed-pills.spec.ts` | Yes: full test file | Delete |
| E2E `l10-conversations-filter.spec.ts` | Yes: tests Submenu filter chips | Rewrite to test main-pane pill bar |
| E2E `L13-product-drilldown.spec.ts` | Yes: uses `/work/product/` URLs | Update to `/work/team/` URLs |

---

## Acceptance criteria

### AC-1: Sidebar component exists and renders correctly
**File:** `packages/web/src/shell/Sidebar.tsx`
**Verification:** Unit test renders Sidebar with mock data, asserts: brand wordmark "HyperIdle" visible, three section headers with correct labels (CONVERSATIONS, WORK, KNOWLEDGE), correct icons, dividers between sections, bottom strip with CoC trigger and Settings button.

### AC-2: AppShell uses Sidebar | Main layout
**File:** `packages/web/src/layouts/AppShell.tsx`
**Verification:** Unit test renders AppShell, asserts: Sidebar is present (data-ds-shell="Sidebar"), no IconRail/Submenu/Rail present, main content area present.

### AC-3: Conversations section shows up to 5 recent threads
**File:** `packages/web/src/shell/Sidebar.tsx` (consumes thread data from props)
**Verification:** Unit test renders Sidebar with 7 threads, asserts only 5 rendered as sub-items. Test with 0 threads asserts "No recent conversations" empty text.

### AC-4: Work section shows team sub-items
**File:** `packages/web/src/shell/Sidebar.tsx`
**Verification:** Unit test renders Sidebar with 3 teams, asserts 3 NavItem sub-items with team names. Test with 0 teams asserts "No teams yet" empty text.

### AC-5: Knowledge section shows scope sub-items
**File:** `packages/web/src/shell/Sidebar.tsx`
**Verification:** Unit test renders Sidebar with scopes, asserts sub-items "Practices", "Products", "Factory" rendered.

### AC-6: Active view highlighted on section header
**Verification:** Unit test renders Sidebar with activeView="conversations", asserts Conversations header has active styling classes (text-primary, fw-semibold, accent-primary icon). Other headers have inactive styling.

### AC-7: Active sub-item has elevated bg with shadow
**Verification:** Unit test renders Sidebar with a selected sub-item, asserts the NavItem has `selected={true}` prop and the wrapper has shadow class.

### AC-8: Settings button opens settings overlay
**Verification:** Unit test in AppShell: click settings button in sidebar, assert settings nav items appear in sidebar body, main pane shows settings section.

### AC-9: CoC trigger in sidebar bottom
**Verification:** Unit test: CoC trigger button present with aria-label "Chief of Staff", clicking it calls onCocClick.

### AC-10: Deleted components
**Files deleted:** `IconRail.tsx`, `IconRail.stories.tsx`, `Rail.tsx`, `Rail.stories.tsx`, `Submenu.tsx`, `Submenu.stories.tsx`, `PitchSelector.tsx`, `PitchSelector.stories.tsx`
**Verification:** `npm run check` passes (no dangling imports). `grep -r "IconRail\|Submenu\b" packages/web/src --include='*.tsx' --include='*.ts' | grep -v __tests__ | grep -v e2e` returns zero results (excluding comments).

### AC-11: useRail.ts deleted
**File deleted:** `packages/web/src/hooks/useRail.ts`
**Verification:** `npm run check` passes. No imports of useRail anywhere.

### AC-12: useViewportBreakpoint.ts simplified
**File:** `packages/web/src/hooks/useViewportBreakpoint.ts`
**Verification:** Unit test: hook returns `{ sidebarMobile: boolean }`. At viewport <= 768px, `sidebarMobile` is true. No `submenuCollapsed` or `railExpanded` properties.

### AC-13: Router: work/product/:productId -> work/team/:teamId
**File:** `packages/web/src/router.tsx`
**Verification:** Unit test: navigating to `/work/team/123` renders WorkTeam. Navigating to `/work/product/123` redirects to `/work/team/123`.

### AC-14: WorkTeam uses teamId param
**File:** `packages/web/src/pages/WorkTeam.tsx`
**Verification:** Existing WorkTeam tests pass after changing `useParams<{ productId }>` to `useParams<{ teamId }>`.

### AC-15: WorkPortfolio navigates to /work/team/
**File:** `packages/web/src/pages/WorkPortfolio.tsx`
**Verification:** E2E test: clicking a team card in WorkPortfolio navigates to `/work/team/:id` (not `/work/product/:id`).

### AC-16: Filters in main pane
**Verification:** E2E test: Conversations page shows pill bar with All/Blocking/Async buttons. Clicking "Blocking" filters the thread list. The sidebar does NOT contain filter chips.

### AC-17: Sidebar.stories.tsx exists
**File:** `packages/web/src/shell/Sidebar.stories.tsx`
**Verification:** File exists, renders at `/designsystem`. Shows key states: populated, empty sections, active view variants.

### AC-18: All tests pass
**Verification:** `npm run verify` passes (zero errors).

### AC-19: Density allowlist updated
**File:** `packages/eslint-plugin-design/density-allowlist.json`
**Verification:** IconRail entry removed. No lint errors on `npm run lint:eslint`.

---

## Security & abuse cases

| Vector | Applicable? | Resolution |
|---|---|---|
| Rate-limit on POST/PATCH | N/A | No new endpoints. Sidebar is frontend-only. |
| Input-trust boundary for agent-authored fields | N/A | Thread titles displayed in sidebar come from existing API (already sanitized). |
| Secret-handling | N/A | No new credential surface. |
| Path-traversal | Low | `sanitizeRouteId` (existing) guards all navigate() calls from sub-item clicks. Reuse it. |
| SSRF | N/A | No outbound URLs introduced. |
| XSS via thread titles in sidebar | Low | Thread titles are rendered as text content in NavItem (React auto-escapes). No dangerouslySetInnerHTML. |

---

## Protected tests

Tests that must NOT have their assertions weakened (only deleted if the component they test is deleted):

```
protectedTests: [
  "packages/web/src/__tests__/AppShell.threads.test.tsx",
  "packages/web/src/hooks/__tests__/useTeams.test.ts",
  "packages/web/src/hooks/__tests__/useRail.test.ts",
  "packages/web/e2e/L21-coc-overlay.spec.ts"
]
```

Note: `useRail.test.ts` is protected in the sense that it should be deleted (not silently weakened). The CocOverlay E2E should still pass after trigger relocation.

---

## Ordered task list

### Task 1: Create Sidebar component
**Files:** `packages/web/src/shell/Sidebar.tsx`, `packages/web/src/shell/Sidebar.stories.tsx`
**Dependencies:** None
**Tests:** Unit tests for Sidebar component rendering, states, click handlers

#### Type signature

```typescript
// packages/web/src/shell/Sidebar.tsx

export interface SidebarThread {
  id: string;
  title: string;
  hasUnresolvedReview: boolean;
}

export interface SidebarTeam {
  id: string;
  name: string;
}

export interface SidebarProps {
  /** Currently active view */
  activeView: ViewId;
  /** Handler for section header clicks */
  onViewChange: (view: ViewId) => void;

  /** Recent conversation threads (max 5 displayed) */
  threads: ReadonlyArray<SidebarThread>;
  /** Currently selected thread id (null if none) */
  selectedThreadId: string | null;
  /** Handler for thread sub-item click */
  onSelectThread: (id: string) => void;

  /** Active teams */
  teams: ReadonlyArray<SidebarTeam>;
  /** Currently active team id (from URL, null if none) */
  activeTeamId: string | null;
  /** Handler for team sub-item click */
  onSelectTeam: (id: string) => void;

  /** Knowledge scope sub-items */
  activeScope: string | null;
  onSelectScope: (scope: string) => void;

  /** CoC trigger */
  onCocClick: () => void;
  cocOverlayOpen: boolean;

  /** Settings trigger */
  onSettingsClick: () => void;
  settingsOpen: boolean;

  /** Settings mode: replaces body with settings nav */
  settingsNavItems?: ReactNode;

  /** User avatar */
  avatarUrl?: string;
  userInitials?: string;
}

export function Sidebar(props: SidebarProps): JSX.Element;
```

### Task 2: Restructure AppShell to use Sidebar
**Files:** `packages/web/src/layouts/AppShell.tsx`
**Dependencies:** Task 1
**Tests:** Updated AppShell unit tests

Key changes:
- Remove imports: `IconRail`, `Rail`, `Submenu`, `SubmenuFilter`, `SubmenuFilterOption`, `useRail`
- Remove state: `submenuOverride`, `railOverride`, `submenuCollapsed`, `railExpanded`, `submenuFilter`, `submenuTotalCount`, `submenuBadgeCount`, `filtersDisabled`, `railData`
- Add: `useTeams` call for sidebar team data
- Replace layout JSX: `<IconRail /> <Submenu>...</Submenu> <main>...</main> <div(rail-wrapper)><Rail /></div>` with `<Sidebar ... /> <main>...</main>`
- Move CoC trigger props from Rail to Sidebar
- Move settings trigger from IconRail avatar to Sidebar settings button
- Pass `conversationsFilter` and `onFilterChange` via extended OutletContext to page components
- Extend `AppShellOutletContext` with filter props

#### Extended OutletContext type

```typescript
export interface AppShellOutletContext {
  selectedThreadId: string | null;
  conversationsFilter: ConversationsFilter;
  onFilterChange: (filter: ConversationsFilter) => void;
  onClearFilter: () => void;
}
```

### Task 3: Move filters to Conversations page
**Files:** `packages/web/src/pages/Conversations.tsx`
**Dependencies:** Task 2
**Tests:** Unit test: Conversations page renders pill bar, clicking pills changes filter

The Conversations page reads filter state from OutletContext and renders the pill bar inline. ThreadSections already accepts `activeFilter` prop -- wire it from context instead of AppShell-internal state.

### Task 4: Router rename work/product -> work/team
**Files:** `packages/web/src/router.tsx`, `packages/web/src/pages/WorkTeam.tsx`, `packages/web/src/pages/WorkPortfolio.tsx`
**Dependencies:** None (can parallel with Task 1-3)
**Tests:** Router unit test, WorkTeam param test, WorkPortfolio navigation test

Changes:
- `router.tsx`: Change `work/product/:productId` to `work/team/:teamId`. Add redirect: `{ path: "work/product/:productId", element: <Navigate to="/work/team/:productId" replace /> }`. Note: React Router does not support param forwarding in Navigate elements, so this redirect needs a small wrapper component.
- `WorkTeam.tsx`: `useParams<{ teamId: string }>()` instead of `useParams<{ productId: string }>()` + alias.
- `WorkPortfolio.tsx`: Navigate to `/work/team/${id}` instead of `/work/product/${id}`.

#### Redirect wrapper

```typescript
// Inline in router.tsx or a small component
function RedirectProductToTeam(): JSX.Element {
  const { productId } = useParams<{ productId: string }>();
  return <Navigate to={`/work/team/${productId ?? ''}`} replace />;
}
```

### Task 5: Delete old components
**Files to delete:**
- `packages/web/src/shell/IconRail.tsx`
- `packages/web/src/shell/IconRail.stories.tsx`
- `packages/web/src/shell/Rail.tsx`
- `packages/web/src/shell/Rail.stories.tsx`
- `packages/web/src/shell/Submenu.tsx`
- `packages/web/src/shell/Submenu.stories.tsx`
- `packages/web/src/shell/PitchSelector.tsx`
- `packages/web/src/shell/PitchSelector.stories.tsx`
- `packages/web/src/hooks/useRail.ts`
- `packages/web/src/shell/use-roving-focus.ts` (only used by IconRail and Rail -- verify no other consumers)

**Dependencies:** Task 2 (AppShell no longer imports these)
**Tests:** `npm run check` passes with no dangling imports

### Task 6: Delete old tests
**Files to delete:**
- `packages/web/src/__tests__/IconRail.test.tsx`
- `packages/web/src/__tests__/IconRail.unread.test.tsx`
- `packages/web/src/__tests__/Rail.test.tsx`
- `packages/web/src/__tests__/Rail.collapsed-pills.test.tsx`
- `packages/web/src/__tests__/M3-Rail.types.test.tsx`
- `packages/web/src/__tests__/Submenu.test.tsx`
- `packages/web/src/__tests__/Submenu.keyboard.test.tsx`
- `packages/web/src/__tests__/Submenu.filters.test.tsx`
- `packages/web/src/__tests__/Submenu.clear-affordance.test.tsx`
- `packages/web/src/__tests__/Submenu.disabled-chips.test.tsx`
- `packages/web/src/__tests__/PitchSelector.test.tsx`
- `packages/web/src/__tests__/PitchSelector.detailpane.test.tsx`
- `packages/web/src/__tests__/CocTrigger.test.tsx` (CoC trigger logic moves to Sidebar tests)
- `packages/web/src/__tests__/useViewportBreakpoint.test.ts` (rewritten)
- `packages/web/src/hooks/__tests__/useRail.test.ts`

**Dependencies:** Task 5
**Tests:** `npm run test -- --all` passes

### Task 7: Simplify useViewportBreakpoint
**File:** `packages/web/src/hooks/useViewportBreakpoint.ts`
**Dependencies:** Task 5 (old consumers removed)
**Tests:** New unit test for simplified hook

```typescript
export interface ViewportBreakpoint {
  sidebarMobile: boolean; // true when viewport <= 768px
}

const MOBILE_MAX = "(max-width: 768px)";

export function useViewportBreakpoint(): ViewportBreakpoint;
```

### Task 8: Update density allowlist
**File:** `packages/eslint-plugin-design/density-allowlist.json`
**Dependencies:** Task 5
**Tests:** `npm run lint:eslint` passes

Changes:
- Remove `IconRail` entry from `densityStatic.components`
- No entry needed for Sidebar (it's not in `packages/design-system/src/` so the lint rule doesn't scan it)

### Task 9: Update E2E tests
**Files:**
- `packages/web/e2e/navigation.spec.ts` -- rewrite for Sidebar layout
- `packages/web/e2e/conversations-submenu.spec.ts` -- rewrite as sidebar-conversations.spec.ts or delete + new
- `packages/web/e2e/rail-collapsed-pills.spec.ts` -- DELETE
- `packages/web/e2e/l10-conversations-filter.spec.ts` -- rewrite for main-pane pill bar
- `packages/web/e2e/L13-product-drilldown.spec.ts` -- update `/work/product/` to `/work/team/`
- `packages/web/e2e/L17-cost-tokens.spec.ts` -- update `/work/product/` to `/work/team/`
- `packages/web/e2e/settings-overlay.spec.ts` -- update: no rail-wrapper testid
- `packages/web/e2e/knowledge-ia.spec.ts` -- update: no knowledge-submenu testid
- `packages/web/e2e/lifecycle-propagation.spec.ts` -- update `/work/product/` URL
- `packages/web/e2e/synthesis.spec.ts` -- update Submenu references in comments

**Dependencies:** Tasks 1-8
**Tests:** `npm run test:e2e` passes

### Task 10: Update AppShell unit tests
**Files:**
- `packages/web/src/__tests__/AppShell.test.tsx` -- rewrite for Sidebar layout
- `packages/web/src/__tests__/AppShell.threads.test.tsx` -- update: threads in sidebar
- `packages/web/src/__tests__/AppShell.P4-settings.test.tsx` -- update: settings in sidebar
- `packages/web/src/__tests__/AppShell.settings-overlay.test.tsx` -- update: no rail-wrapper
- `packages/web/src/__tests__/AppShell.filter-reset.test.tsx` -- update: filter in main pane
- `packages/web/src/__tests__/AppShell.l10-filter.test.tsx` -- update: filter in main pane
- `packages/web/src/__tests__/AppShell.knowledge-submenu.test.tsx` -- rewrite: knowledge scopes in sidebar

**Dependencies:** Tasks 1-3
**Tests:** `npm run test` passes

### Task 11: Update remaining references
**Files:**
- `packages/web/src/test-setup.ts` -- update comments about viewport breakpoint
- `packages/web/src/components/ThreadSections.tsx` -- remove Submenu comment references
- `packages/web/src/hooks/useConversationsThreads.ts` -- update comment
- `packages/web/src/pages/KnowledgeList.tsx` -- update Submenu comment
- `packages/design-system/DESIGN.md` -- update Grid (Shell Layout) section

**Dependencies:** Task 5
**Tests:** `npm run check` + `npm run lint` passes

### Task 12: Verify use-roving-focus.ts consumers
**File:** `packages/web/src/shell/use-roving-focus.ts`
**Dependencies:** Before Task 5

Check if `use-roving-focus` is imported by anything other than IconRail and Rail. If only those two, delete it. If other consumers exist, keep it.

```bash
grep -rn "use-roving-focus\|useRovingFocus" packages/web/src --include='*.ts' --include='*.tsx' | grep -v __tests__
```

Current consumers: IconRail.tsx, Rail.tsx. Both deleted. Safe to delete.

---

## Risks and ambiguities

### Risk 1: Test count reduction
Deleting 15+ test files is a large blast radius. Mitigation: write replacement tests for Sidebar before deleting old tests. Run `npm run test -- --all` after each deletion batch.

### Risk 2: E2E flakiness during migration
Many E2E tests reference the old shell structure (IconRail, Submenu, Rail test ids). Mitigation: update E2E tests in one batch (Task 9) after all component changes are complete.

### Risk 3: ThreadSections dependency on SubmenuFilter type
`ThreadSections.tsx` imports `SubmenuFilter` for the type narrowing. But it also defines its own `ConversationsFilter` type which is a subset. Resolution: `ConversationsFilter` already exists in ThreadSections.tsx. The import of `SubmenuFilter` is only in a comment. Verify this in implementation and remove any runtime dependency.

### Risk 4: Knowledge scope sub-items diverge from current scope browser
The current Knowledge Submenu has a tablist-style scope browser (Practice/Product/Factory as tabs) with per-scope topic NavItems below. The sidebar replaces this with simple NavItem sub-items per scope. The per-scope topic NavItems (health dots, item counts) are lost. This is acceptable per spec ("specific scope sub-items") but the Knowledge view may need a scope browser in the main pane later (U7-U9 scope).

### Risk 5: CocOverlay positioning
The CocOverlay currently uses `position: fixed; bottom: 4rem; right: 1rem`. Since the trigger moves from the bottom-right Rail to the bottom-left Sidebar, the overlay's fixed positioning may look wrong (overlay near right, trigger near left). Mitigation: the CocOverlay's position is independent of its trigger per L21 design -- it's a floating panel. No change needed unless visual testing reveals an issue.

---

## Migrations: affected call sites

### Symbol: `work/product/:productId` (route path)

| File | Line | Migration |
|---|---|---|
| `packages/web/src/router.tsx` | 60 | Rename to `work/team/:teamId`, add redirect |
| `packages/web/src/pages/WorkTeam.tsx` | 82 | Change useParams to `{ teamId: string }` |
| `packages/web/src/pages/WorkPortfolio.tsx` | 165 | Navigate to `/work/team/` |
| `packages/web/src/shell/Canvas.tsx` | 27 | Comment-only (already uses teamId) |
| `packages/web/e2e/L13-product-drilldown.spec.ts` | 123, 156, 163, 177, 195, 207, 214 | Update URLs |
| `packages/web/e2e/L17-cost-tokens.spec.ts` | 141, 251 | Update URLs |
| `packages/web/e2e/lifecycle-propagation.spec.ts` | 272 | Update URL |

### Symbol: `IconRail` (component)

| File | Migration |
|---|---|
| `packages/web/src/shell/IconRail.tsx` | DELETE |
| `packages/web/src/shell/IconRail.stories.tsx` | DELETE |
| `packages/web/src/layouts/AppShell.tsx` | Remove import + usage |
| `packages/web/src/__tests__/IconRail.test.tsx` | DELETE |
| `packages/web/src/__tests__/IconRail.unread.test.tsx` | DELETE |
| `packages/eslint-plugin-design/density-allowlist.json` | Remove entry |

### Symbol: `Rail` (component)

| File | Migration |
|---|---|
| `packages/web/src/shell/Rail.tsx` | DELETE |
| `packages/web/src/shell/Rail.stories.tsx` | DELETE |
| `packages/web/src/layouts/AppShell.tsx` | Remove import + usage |
| `packages/web/src/__tests__/Rail.test.tsx` | DELETE |
| `packages/web/src/__tests__/Rail.collapsed-pills.test.tsx` | DELETE |
| `packages/web/src/__tests__/M3-Rail.types.test.tsx` | DELETE |
| `packages/web/src/__tests__/CocTrigger.test.tsx` | DELETE (CoC trigger tested via Sidebar) |
| `packages/web/e2e/rail-collapsed-pills.spec.ts` | DELETE |

### Symbol: `Submenu` (component)

| File | Migration |
|---|---|
| `packages/web/src/shell/Submenu.tsx` | DELETE |
| `packages/web/src/shell/Submenu.stories.tsx` | DELETE |
| `packages/web/src/layouts/AppShell.tsx` | Remove import + usage |
| `packages/web/src/__tests__/Submenu.test.tsx` | DELETE |
| `packages/web/src/__tests__/Submenu.keyboard.test.tsx` | DELETE |
| `packages/web/src/__tests__/Submenu.filters.test.tsx` | DELETE |
| `packages/web/src/__tests__/Submenu.clear-affordance.test.tsx` | DELETE |
| `packages/web/src/__tests__/Submenu.disabled-chips.test.tsx` | DELETE |
| `packages/web/e2e/conversations-submenu.spec.ts` | Rewrite for Sidebar |

### Symbol: `PitchSelector` (component)

| File | Migration |
|---|---|
| `packages/web/src/shell/PitchSelector.tsx` | DELETE |
| `packages/web/src/shell/PitchSelector.stories.tsx` | DELETE |
| `packages/web/src/__tests__/PitchSelector.test.tsx` | DELETE |
| `packages/web/src/__tests__/PitchSelector.detailpane.test.tsx` | DELETE |

### Symbol: `useRail` (hook)

| File | Migration |
|---|---|
| `packages/web/src/hooks/useRail.ts` | DELETE |
| `packages/web/src/hooks/__tests__/useRail.test.ts` | DELETE |
| `packages/web/src/layouts/AppShell.tsx` | Remove import + usage |

### Symbol: `useViewportBreakpoint` (hook)

| File | Migration |
|---|---|
| `packages/web/src/hooks/useViewportBreakpoint.ts` | Rewrite (remove submenuCollapsed, railExpanded) |
| `packages/web/src/__tests__/useViewportBreakpoint.test.ts` | Rewrite |
| `packages/web/src/layouts/AppShell.tsx` | Update to use new interface |
| `packages/web/src/test-setup.ts` | Update comments |

### Symbol: `use-roving-focus` (hook)

| File | Migration |
|---|---|
| `packages/web/src/shell/use-roving-focus.ts` | DELETE (no consumers after IconRail/Rail removed) |

### Symbol: `rail-wrapper` (testid)

| File | Migration |
|---|---|
| `packages/web/src/__tests__/AppShell.settings-overlay.test.tsx` | Remove assertion |
| `packages/web/src/__tests__/AppShell.P4-settings.test.tsx` | Remove assertion |

### Symbol: `knowledge-submenu` (testid)

| File | Migration |
|---|---|
| `packages/web/src/__tests__/AppShell.knowledge-submenu.test.tsx` | Rewrite for sidebar scope sub-items |
| `packages/web/e2e/knowledge-ia.spec.ts` | Update to new sidebar structure |

### Symbol: `submenu-filter-clear` (testid)

| File | Migration |
|---|---|
| `packages/web/src/__tests__/Submenu.clear-affordance.test.tsx` | DELETE (file deleted) |
| `packages/web/src/__tests__/Submenu.disabled-chips.test.tsx` | DELETE (file deleted) |
| `packages/web/src/__tests__/Submenu.keyboard.test.tsx` | DELETE (file deleted) |
| `packages/web/src/__tests__/AppShell.l10-filter.test.tsx` | Rewrite for main-pane filter |
