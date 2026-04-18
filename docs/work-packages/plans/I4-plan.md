# I4 — Frontend Correctness & Spec Conformance — Plan

**Branch:** `feat/I4-frontend-correctness`
**Worktree:** `.worktrees/I4`
**Depends on:** I1 (done), I2 (done), I3 (done).
**Source spec:** `docs/work-packages/TRACK-I.md` § "I4 — Frontend Correctness & Spec Conformance" (lines 181–249).

---

## 1. Context & current state

The web package today carries six classes of small but visible defects:

1. **Status mapping is incomplete.** `BET_STATUS_MAP` in `packages/web/src/components/status-mapping.ts` only covers 5 of 9 `BetStatus` values; `KNOWLEDGE_STATUS_MAP` is missing `needs_human`. Any `behind`, `blocked`, `paused`, `review` bet will read `STATUS_BADGE_CLASS[undefined]` → blank chip.
2. **Two duplicate copies** of the mapping exist: a `betStatusToChipStatus` switch in `Rail.tsx` (covers `blocked`, `behind`, `paused` but `default → "healthy"` for `committed`/`in_progress`/`review`) and a `knowledgeStatusToChipStatus` switch in `KnowledgeDetail.tsx` (similar drift). This is a single-source-of-truth violation.
3. **No error boundary** wraps `<Outlet />` in `AppShell` and the router has no `path: "*"` catch-all → unknown URL = white screen.
4. **Search navigation is mocked.** `handleSearchNavigate` in `AppShell` ignores `_type`/`_id` and routes everything to `/conversations/review`.
5. **Kanban DnD has no keyboard sensor** (only `PointerSensor`); same in `Canvas`. Spec demands `KeyboardSensor` + tabbable cards with focus rings.
6. **Page composition does not match spec:** `WorkPortfolio` renders Canvas directly (the Portfolio canvas is supposed to be a *summary* of products with status cards/metrics), `WorkTeam` is missing the Canvas-on-top + Kanban-bottom composition, and `ReviewHeader` shows 10 buttons inline rather than 4 primary + overflow.
7. **Responsive defaults are not breakpoint-driven** (state initialised to constants, never reads viewport).
8. **Design-system drift:** `text-base-content/40,50,60` litters Canvas/Kanban/PitchSelector/GlobalSearchPanel/SettingsPanel/ThreadRow/NotificationRow/BetCard/KnowledgeRow/PitchCard/WorkBet → spec wants `var(--text-lo)` / `var(--text-hi)` / `var(--text-mid)`.
9. **`StatusChip` blocked == error** visually (both `badge-error`); spec demands they are distinguishable.
10. **GlobalSearchPanel.stories.tsx** is missing the `default` export with `title` (currently has no default), so it is silently dropped by `parseStoryModules`.
11. **CSF3 object stories** (e.g. `export const Default = { name, render }`) are skipped by `parseStoryModules` — only `typeof value === "function"` variants are picked up.

I3 closed dependency-watcher / FK / index work, so the data layer is stable. All I4 work is web-only (no schema, no API). The `ConfirmationDialog` / `ErrorBoundary` infra does not exist yet.

---

## 2. Constraints

- **No new custom components.** The 19-component budget is closed (`docs/UI_DESIGN.md`, `SHARED.md` § UI Stack). `ErrorBoundary`, `NotFound` page, `useViewportBreakpoint` hook are utilities/page compositions, not custom components.
- **Three-layer dependency.** Web only — no server changes.
- **No bare `bun test`** — use `bun run test` (Vitest).
- **DaisyUI primitives direct, no wrappers.** The Submenu/Rail collapse is state-driven; we add a hook, not a wrapper component.
- **All existing tests must continue to pass** (1759 tests after I3).
- **Aesthetic guardrails** (`.claude/rules/frontend.md`): no new purple/indigo, no extra `rounded-2xl`, no oversized padding, factory-dark tokens only.
- **TypeScript strict.** No `any`, no `@ts-ignore`. All exported functions get explicit return types.

---

## 3. Acceptance criteria → verification matrix

Each row maps a spec bullet to (a) the file(s) that change, (b) the test that proves it, (c) the verification method.

### 3.1 Status mapping completeness

| # | Acceptance criterion | Files touched | Test (file + assertion) | Verification |
|---|---|---|---|---|
| S1 | `BET_STATUS_MAP` covers all 9 `BetStatus` values | `packages/web/src/components/status-mapping.ts` | `__tests__/status-mapping.test.ts`: parametrised loop over `BetStatus` union — every value yields a defined non-string-`"undefined"` `Status`. Add explicit cases for `behind` → `behind`, `blocked` → `blocked`, `paused` → `paused`, `review` → `behind`. | Vitest `bun run test --filter status-mapping` |
| S2 | `KNOWLEDGE_STATUS_MAP` covers all 7 `KnowledgeStatus` values (incl. `needs_human`) | same | Add `it("maps needs_human to behind")` (or `paused` — see Open Q1). Add `covers all KnowledgeStatus values` assertion that exhaustively iterates the union. | Vitest |
| S3 | `TASK_STATE_MAP` covers all 8 `TaskState` values | same | Existing 8-state assertion already covers it, but extend to *also* assert each value is a member of the `Status` union (not just `typeof string`). | Vitest |
| S4 | Duplicate `betStatusToChipStatus` removed from `Rail.tsx`; imports `betStatusToStatus` from `status-mapping.ts` | `packages/web/src/shell/Rail.tsx` | `__tests__/Rail.test.tsx`: render Rail with a `behind` bet, assert `StatusChip` shows `BEHIND` text (not `HEALTHY`). Repeat for `blocked`, `paused`, `review`. Grep test in `__tests__/no-duplicate-mapping.test.ts`: read source files and assert they do not re-export `function betStatusToChipStatus`. | Vitest + RTL |
| S5 | Duplicate `knowledgeStatusToChipStatus` removed from `KnowledgeDetail.tsx` | `packages/web/src/pages/KnowledgeDetail.tsx` | `__tests__/KnowledgeDetail.test.tsx`: render with `status: "needs_human"`, assert chip renders correct label (not the `default → healthy` fallback). Grep test as above. | Vitest |
| S6 | Unit test: every value in each status union maps to a valid `Status` | new `__tests__/status-mapping.exhaustive.test.ts` (or extend existing) | Iterate each runtime constant array (`TASK_STATES`, plus `BET_STATUSES`/`KNOWLEDGE_STATUSES` we add to `@hyperidle/shared`) and assert `Object.keys(STATUS_BADGE_CLASS).includes(map(value))`. **Requires shared change** — see Cross-cutting §4. | Vitest |
| S7 | `StatusChip` "blocked" and "error" visually distinguishable | `packages/web/src/components/StatusChip.tsx` | `__tests__/StatusChip.test.tsx`: render `<StatusChip status="blocked" />` and `<StatusChip status="error" />`, assert their badge `className` strings differ AND their dot `className` differs. | Vitest. Implementation: change `blocked` → `badge-warning` (yellow) keeping `error` → `badge-error` (red); spec is silent on which class, only that they differ. |

### 3.2 Error resilience

| # | Acceptance criterion | Files touched | Test | Verification |
|---|---|---|---|---|
| E1 | `ErrorBoundary` wraps `<Outlet />` in `AppShell` | new `packages/web/src/components/ErrorBoundary.tsx` (utility, NOT in 19-budget — see CONFUSION 2), `packages/web/src/layouts/AppShell.tsx` | `__tests__/ErrorBoundary.test.tsx`: render a child that throws on mount, assert fallback UI containing "Something went wrong", a "Reload" link/button, and the error message is shown. `__tests__/AppShell.test.tsx`: render AppShell with a route whose element throws, assert fallback UI, IconRail still visible. | Vitest |
| E2 | Catch-all `path: "*"` route renders "Page not found" | `packages/web/src/router.tsx`, new `packages/web/src/pages/NotFound.tsx` (page, also not a custom component) | `__tests__/router.test.tsx`: add `it("renders NotFound for unknown URL")` using `createMemoryRouter` with `initialEntries: ["/no-such-route"]`. Assert `getByText(/page not found/i)`. | Vitest |
| E3 | E2E: `/nonexistent` shows "not found" | new `packages/web/e2e/error-resilience.spec.ts` | Playwright: `page.goto("/nonexistent")`, expect `getByText(/page not found/i)` and a "Go home" link. Also a test that injects a thrown error via `?errorBoundaryDemo=1` query param (handled by a hidden test-only component) — see CONFUSION 3. | Playwright |

### 3.3 Search navigation

| # | Acceptance criterion | Files touched | Test | Verification |
|---|---|---|---|---|
| N1 | `handleSearchNavigate` routes by type | `packages/web/src/layouts/AppShell.tsx` | `__tests__/AppShell.test.tsx`: render with memory router, open search programmatically (set `commandK.isOpen` via fixture), call `onNavigate("work", "b1")`, assert location changes to `/work/bet/b1`. Repeat for `conversation` → `/conversations/review`, `knowledge` → `/knowledge/k1`. | Vitest |
| N2 | `useGlobalSearch` clears results when query becomes empty | `packages/web/src/hooks/useGlobalSearch.ts` | `__tests__/useGlobalSearch.test.ts`: set query to `"foo"`, await results, then set query to `""`, assert `results === EMPTY_RESULTS` (no in-flight stale data). Extra: setting from `"foo"` → `""` aborts the AbortController. | Vitest with fake timers |
| N3 | E2E: search → click work result → navigate to `/work/bet/{id}` | `packages/web/e2e/global-search.spec.ts` (extend) | Playwright: `Cmd+K`, type query, mock `/api/search` via `page.route()` to return one work item with id `b1`, click it, expect `page.url()` ends with `/work/bet/b1`. | Playwright |

### 3.4 Kanban state mapping

| # | Acceptance criterion | Files touched | Test | Verification |
|---|---|---|---|---|
| K1 | `handleMoveTask` maps Kanban columns to valid `TaskState` (`planned`→`accepted`, `in_progress`→`in_progress`, `blocked`→`blocked`, `done`→`done`) | `packages/web/src/pages/WorkTeam.tsx` | `__tests__/WorkTeam.test.tsx`: render WorkTeam, simulate `onMoveTask("t2", "planned")`, assert the task's persisted state in component is `"accepted"` (not `"planned"`). Currently it's cast to TaskState which is unsound (`"planned"` is not a TaskState). | Vitest. Add `COLUMN_TO_STATE: Record<KanbanColumnState, TaskState>` mapping. |
| K2 | Unit test: dragging to "Planned" produces TaskState `"accepted"` | same | Covered by K1; also add Kanban unit test `__tests__/Kanban.test.tsx` that fires `onMoveTask` callback through a synthetic `dnd-kit` event and asserts the prop is called with `"planned"` (the column state — Kanban itself emits column state, the page maps to TaskState). | Vitest |

### 3.5 Keyboard accessibility

| # | Acceptance criterion | Files touched | Test | Verification |
|---|---|---|---|---|
| KB1 | `KeyboardSensor` added to Canvas + Kanban `@dnd-kit` sensors | `packages/web/src/shell/Canvas.tsx`, `packages/web/src/shell/Kanban.tsx` | Vitest assertion is unreliable in jsdom (sensors are opaque descriptor objects, not introspectable without monkey-patching `@dnd-kit/core`). **Primary verification is Playwright KB4** (real browser handles keyboard sensor end-to-end). For Vitest: only assert that `useSensors` is called with a `KeyboardSensor` argument by spying on `useSensors` import (acceptable smoke test, not behaviour). | Playwright KB4 is the load-bearing test. |
| KB2 | `clickableProps` adds `cursor-pointer` and `focus-visible:ring-1 focus-visible:ring-primary` | `packages/web/src/components/clickable.ts` plus 6 consumers (BetCard, KnowledgeRow, NotificationRow, ThreadRow, PitchCard, NavItem if applicable) | `__tests__/clickable.test.ts`: assert `clickableProps(onClick).className` includes both `cursor-pointer` and `focus-visible:ring-1 focus-visible:ring-primary`; assert `clickableProps(onClick, "bg-base-200").className` merges (`includes("bg-base-200")` and includes both focus classes). Update existing consumer tests if they snapshot className. | Vitest |
| KB3 | `useRovingFocus` handles Home/End keys | `packages/web/src/shell/use-roving-focus.ts` | `__tests__/use-roving-focus.test.tsx`: focus item 1 of 5, press Home → assert active index is 0; press End → assert 4. | Vitest |
| KB4 | E2E: tab to a Kanban card, keyboard-move it between columns | `packages/web/e2e/keyboard-and-responsive.spec.ts` (extend) | Playwright: goto `/work/team`, `page.keyboard.press("Tab")` until a TaskCard receives focus (assert via `:focus-visible` selector), then press Space (pick up), Arrow keys to move, Space to drop, assert task moves columns by reading column DOM. | Playwright |

### 3.6 Page composition (spec alignment)

| # | Acceptance criterion | Files touched | Test | Verification |
|---|---|---|---|---|
| P1 | WorkPortfolio renders **portfolio overview** (product status cards + metrics) — NOT Canvas | `packages/web/src/pages/WorkPortfolio.tsx`, `packages/web/src/fixtures/portfolio-data.ts` (new with `MOCK_PRODUCTS` array) | `__tests__/WorkPortfolio.test.tsx`: render, assert heading "Portfolio", every `MOCK_PRODUCTS[i]` produces a `data-testid="product-card"` with its `name`, `StatusChip` for `status`, `KeyValue("Active bets", activeBets)`, `KeyValue("Ship rate", shipRate)`. Assert `<Canvas />` is NOT in the tree (`queryByTestId("work-portfolio-canvas")` returns `null`). Defer real `/api/products` wiring to a later story; this is mock-only for now. | Vitest. Compose from existing primitives: `KeyValue`, DaisyUI `card`, `StatusChip`, `Tag`. No new components. |
| P2 | WorkTeam composes Canvas (top) + Kanban (bottom) | `packages/web/src/pages/WorkTeam.tsx` | `__tests__/WorkTeam.test.tsx`: render, assert both `data-testid="work-team-canvas"` and `data-testid="work-team-kanban"` are present and Canvas appears before Kanban in DOM order. | Vitest |
| P3 | ReviewHeader: 4 primary verdict buttons + overflow dropdown | `packages/web/src/shell/ReviewHeader.tsx` | `__tests__/ReviewHeader.test.tsx`: (a) assert exactly 4 buttons in the primary toolbar (`role="toolbar"`) — Approve, Request changes, Reject, Snooze; (b) assert a "More" button opens a DaisyUI `dropdown` containing the other 6 (approve-with-comments, comment, inline-comment, edit, reply, escalate); (c) `it("fires comment verdict via keyboard even when dropdown closed")` — focus inside header, press `c`, assert `onVerdict` called with `"comment"`. | Vitest |
| P4 | E2E: WorkPortfolio contains product status cards | `packages/web/e2e/work.spec.ts` (extend) | Playwright: `goto("/work/portfolio")`, expect at least 1 element with `data-testid="product-card"`. | Playwright |
| P5 | E2E: WorkTeam contains Canvas + Kanban sections | `packages/web/e2e/work.spec.ts` | `goto("/work/team")`, assert `data-testid="work-team-canvas"` and `data-testid="work-team-kanban"` both visible. | Playwright |

### 3.7 Responsive basics

| # | Acceptance criterion | Files touched | Test | Verification |
|---|---|---|---|---|
| R1 | Submenu collapses by default on viewports <1024px | `packages/web/src/layouts/AppShell.tsx`, new `packages/web/src/hooks/useViewportBreakpoint.ts`, `packages/web/src/test-setup.ts` (add `matchMedia` polyfill) | `__tests__/useViewportBreakpoint.test.ts`: stub `window.matchMedia` per-test, assert hook returns `{ submenuCollapsed: true }` at 800px and `false` at 1280px. `__tests__/AppShell.test.tsx`: render at width 800 (matchMedia stubbed), assert Submenu has `w-0`. **Prerequisite:** add `Object.defineProperty(window, 'matchMedia', { value: vi.fn(...) })` to `test-setup.ts` because jsdom does not implement matchMedia. | Vitest |
| R2 | Rail collapses by default on viewports <1280px | same | Same hook returns `railExpanded: false` at 1024px and `true` at 1440px. AppShell test: at 1024 width, Rail renders the 14px collapsed rail. | Vitest |
| R3 | Kanban uses `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` | `packages/web/src/shell/Kanban.tsx` | `__tests__/Kanban.test.tsx`: assert grid container has all three classes (using `container.querySelector(".grid").className`). | Vitest |
| R4 | E2E: at 768px viewport, Submenu is collapsed | `packages/web/e2e/keyboard-and-responsive.spec.ts` | `page.setViewportSize({ width: 768, height: 800 })`, `goto("/")`, assert Submenu container has class `w-0` (or assert the navigation list inside Submenu is not visible). | Playwright |

### 3.8 Design-system fixes

| # | Acceptance criterion | Files touched | Test | Verification |
|---|---|---|---|---|
| D1 | GlobalSearchPanel stories get `export default { title: "GlobalSearchPanel" }` | `packages/web/src/components/GlobalSearchPanel.stories.tsx` | `__tests__/GlobalSearchPanel.stories.test.tsx`: import the module, assert `module.default.title === "GlobalSearchPanel"`. Plus DesignSystem integration test asserting `parseStoryModules` returns it. | Vitest |
| D2 | `parseStoryModules` detects CSF3 object stories (`.render` property) | `packages/web/src/designsystem/DesignSystem.tsx` | `__tests__/DesignSystem.test.tsx` (extend or create): pass a fake glob with `Default = { name, render: fn }` and assert it appears in modules with `Component === fn`. Also handles legacy function-style. | Vitest. Implementation: when `value` is an object with `.render` of type `function`, push `{ name: value.name ?? key, Component: value.render }`. |
| D3 | Color system standardised on `var(--text-lo)`/`var(--text-hi)` (remove `text-base-content/40,50,60`) | All 11 files listed in `grep` results above | `__tests__/no-base-content-text-tokens.test.ts`: walk every `.tsx` file under `packages/web/src/{components,shell,pages,layouts}` (exclude `*.stories.tsx` and exclude lines starting with `//` or inside `/* */` comments — use a simple line filter) and assert zero matches for `/text-base-content\/(40\|50\|60\|70)/`. Use `import.meta.url` + `fileURLToPath` to resolve paths (NOT `__dirname`, which is undefined in ESM). Mapping: `/40` & `/50` → `var(--text-lo)`, `/60` → `var(--text-mid)`. | Vitest grep test |

---

## 4. Cross-cutting changes

1. **Runtime constants for status unions in `@hyperidle/shared`.** Add `BET_STATUSES` and `KNOWLEDGE_STATUSES` `as const` arrays paralleling existing `TASK_STATES`. This unlocks the exhaustive S6 test (cannot iterate a TS-only union at runtime). **Scope discipline:** I4 only adds the constants and uses them in the web package. Server-side consolidation (replacing existing Zod enums with imports of these constants) is OUT OF SCOPE — defer to I6. Verification: `bun run check` on server still passes (adding constants is purely additive).
2. **`useViewportBreakpoint` hook** — single hook returns `{ submenuCollapsed, railExpanded }` derived from `window.matchMedia` so the breakpoints live in one place. Used by `AppShell` to seed `useState` initial values *and* by `useEffect` to re-collapse on resize across thresholds.
3. **`COLUMN_TO_STATE` constant** in `WorkTeam.tsx` is the single source for mapping Kanban columns to TaskState (mirrors `STATE_TO_COLUMN` in `Kanban.tsx`).
4. **`text-base-content/*` removal** is one mechanical sweep — also update component story files if they assert on those classes.

---

## 5. Ordered task list (TDD red-then-green)

Each step: write tests (red), implement (green), `bun run check && bun run lint && bun run test`.

| Step | Task | Files | Tests written first | Depends on |
|---|---|---|---|---|
| 1 | Shared status-union constants | `packages/shared/src/types.ts` | `packages/shared/src/__tests__/types.test.ts` (`BET_STATUSES`/`KNOWLEDGE_STATUSES` length and elements) | — |
| 2 | Complete `BET_STATUS_MAP`, `KNOWLEDGE_STATUS_MAP` (incl. `needs_human`); add exhaustive iteration test | `packages/web/src/components/status-mapping.ts` | `__tests__/status-mapping.test.ts` (extend) | 1 |
| 3 | StatusChip blocked vs error visual distinction | `packages/web/src/components/StatusChip.tsx` | `__tests__/StatusChip.test.tsx` (new assertions) | — |
| 4 | Remove duplicate mapping in Rail.tsx, KnowledgeDetail.tsx; add grep guard test | `packages/web/src/shell/Rail.tsx`, `pages/KnowledgeDetail.tsx`, `__tests__/no-duplicate-mapping.test.ts` | `__tests__/Rail.test.tsx`, `__tests__/KnowledgeDetail.test.tsx` (cover `behind`, `blocked`, `paused`, `review`, `needs_human`) | 2 |
| 5 | ErrorBoundary utility + AppShell wrap | `packages/web/src/components/ErrorBoundary.tsx`, `packages/web/src/layouts/AppShell.tsx` | `__tests__/ErrorBoundary.test.tsx`, `__tests__/AppShell.test.tsx` | — |
| 6 | NotFound page + catch-all route | `packages/web/src/pages/NotFound.tsx`, `packages/web/src/router.tsx` | `__tests__/router.test.tsx` (extend) | 5 |
| 7 | Search navigation by type | `packages/web/src/layouts/AppShell.tsx` | `__tests__/AppShell.test.tsx` (extend); E2E `e2e/global-search.spec.ts` | 5 |
| 8 | `useGlobalSearch.clear` on empty query | `packages/web/src/hooks/useGlobalSearch.ts` | `__tests__/useGlobalSearch.test.ts` | — |
| 9 | Kanban column → TaskState map; Kanban grid responsive classes | `packages/web/src/pages/WorkTeam.tsx`, `packages/web/src/shell/Kanban.tsx` | `__tests__/WorkTeam.test.tsx`, `__tests__/Kanban.test.tsx` | — |
| 10 | KeyboardSensor in Canvas + Kanban; useRovingFocus Home/End; clickableProps focus ring | `packages/web/src/shell/Canvas.tsx`, `Kanban.tsx`, `use-roving-focus.ts`, `components/clickable.ts` | `__tests__/Canvas.test.tsx`, `Kanban.test.tsx`, `use-roving-focus.test.tsx`, `clickable.test.ts`; E2E `e2e/keyboard-and-responsive.spec.ts` | 9 |
| 11 | WorkPortfolio overview composition (drop Canvas, show product cards + metrics) | `packages/web/src/pages/WorkPortfolio.tsx`, `fixtures/portfolio-data.ts` | `__tests__/WorkPortfolio.test.tsx`; E2E `e2e/work.spec.ts` | — |
| 12 | WorkTeam: Canvas top + Kanban bottom | `packages/web/src/pages/WorkTeam.tsx` | `__tests__/WorkTeam.test.tsx`; E2E `e2e/work.spec.ts` | 9 |
| 13 | ReviewHeader 4-primary + overflow dropdown | `packages/web/src/shell/ReviewHeader.tsx` | `__tests__/ReviewHeader.test.tsx` | — |
| 14 | useViewportBreakpoint + apply in AppShell | `packages/web/src/hooks/useViewportBreakpoint.ts`, `layouts/AppShell.tsx` | `__tests__/useViewportBreakpoint.test.ts`, `__tests__/AppShell.test.tsx`; E2E `e2e/keyboard-and-responsive.spec.ts` | 5 |
| 15 | GlobalSearchPanel.stories default export; parseStoryModules supports `.render` | `packages/web/src/components/GlobalSearchPanel.stories.tsx`, `designsystem/DesignSystem.tsx` | `__tests__/GlobalSearchPanel.stories.test.tsx`, `__tests__/DesignSystem.test.tsx` | — |
| 16 | Color token sweep | 11 files | `__tests__/no-base-content-text-tokens.test.ts` | — |
| 17 | Final `bun run check && bun run lint && bun run test` + Playwright run; update progress.json notes | — | — | all |

---

## 6. Risks & open questions

### CONFUSION: `needs_human` mapping
`KnowledgeStatus = "needs_human"` has no obvious presentation `Status`. Spec is silent.
- A) Map to `paused` (matches `KnowledgeDetail.tsx`'s existing default for `provisional`/`needs_human`). Reads as "awaiting input".
- B) Map to `behind` (signals attention required, more urgent visual).

Proceeding with **(B) `behind`** because the literal name `needs_human` is an action-required signal, not idle. Flag for review.

### CONFUSION: ErrorBoundary in 19-component budget
`docs/UI_DESIGN.md` lists 19 custom components; ErrorBoundary is not among them. Spec says "ErrorBoundary component wraps the `<Outlet />`". Two readings:
- A) ErrorBoundary is a *utility class component*, not a presentational component → not counted in the 19. (Same way `AppShell` isn't.)
- B) Spec is implicitly bumping the budget to 20.

**Action before implementing step 5:** open `docs/UI_DESIGN.md` and verify the 19-component list. If ErrorBoundary is absent and the document is silent on utility infrastructure, treat as (A) and add a `@lore` note in `ErrorBoundary.tsx` and an entry to `docs/UI_DESIGN.md` under a new "Infrastructure (non-budget)" subsection covering ErrorBoundary, NotFound page, hooks. If UI_DESIGN.md explicitly says "the budget is hard-capped at 19", escalate as a `### CONFUSION` to the parent skill — do NOT silently add a 20th.

Proceeding with **(A)** as the working assumption, but treat this as a hard read-and-verify gate before step 5.

### CONFUSION: E2E for ErrorBoundary
Triggering an ErrorBoundary in production code from Playwright requires a controlled crash. Two options:
- A) Test-only route `/__test/throw` mounted only when `import.meta.env.DEV` or `import.meta.env.MODE === "test"`.
- B) Skip the E2E for the throw path and rely on Vitest+jsdom; only E2E the 404 path.

Proceeding with **(B)** — Vitest with `@testing-library/react`'s error suppression already proves the React boundary; Playwright covers the 404 case which is the user-visible path. Flag for review.

### CONFUSION: clickableProps `className`
The current `clickableProps` returns only event/role/tabIndex props — no `className`. Spec wants `cursor-pointer` and `focus-visible:ring-1 focus-visible:ring-primary` "added by clickableProps".
- A) Extend `clickableProps` to return `{ ...handlers, className }` and update all 6 call sites to merge: `<div {...clickableProps(onClick, "bg-base-200 rounded p-2 ...")}>` (helper accepts an optional caller className and merges).
- B) Add a sibling helper `clickableClassName` and require call sites to call both.

Proceeding with **(A) revised** — change `clickableProps(onClick, callerClassName?)` so it owns merging, returns a single object including `className`, and update all 6 consumers (BetCard, KnowledgeRow, NotificationRow, ThreadRow, PitchCard, NavItem if it uses it) in the same step. Single source of truth wins over additive helpers; future agents won't forget to call a sibling helper.

### CONFUSION: ReviewHeader 4 primary buttons + secondary keyboard shortcuts
Spec says "Approve, Request Changes, Reject, Snooze" as primary. Current `VERDICT_BUTTONS` has 10 items with single-key shortcuts on A, C, I, R, E, X, S. After grouping, the secondary shortcuts (C, I, E) belong to buttons hidden inside the dropdown.

Decision: keyboard shortcuts continue to fire from the global `keydown` listener regardless of whether the button is currently visible — the dropdown is a UI affordance, not a gating control. Test must assert: with focus inside ReviewHeader and the dropdown closed, pressing `c` still invokes `onVerdict("comment")`. Add `it("fires comment verdict via keyboard even when dropdown closed")` to `ReviewHeader.test.tsx`.

### Risk: `useGlobalSearch` clear-on-empty
Currently `useEffect` with `if (!query) return;` does NOT clear stale results — it just stops the fetch. Implementation: in the `if (!query)` branch, also call `setResults(EMPTY_RESULTS); setError(null); setLoading(false);`. The `EMPTY_RESULTS` module constant is reused so `Object.is` bails the second `setResults` call. Test must explicitly assert no infinite re-render: render the hook, type `"foo"`, await fetch, then run `setQuery("fo")` → `setQuery("f")` → `setQuery("")` (validation scenario "cleared character by character") and assert (a) results are `EMPTY_RESULTS` after the final `""`, and (b) the render counter from a `useRenderCount` test helper is bounded (≤ 6 renders for 4 setQuery calls). This catches the regression that the spec validation scenario explicitly calls out.

### Risk: Kanban `KeyboardSensor` test under jsdom
`@dnd-kit/core` keyboard sensor uses `Element.scrollIntoView` and `getBoundingClientRect` which are partially polyfilled in jsdom. Vitest tests should assert *configuration* (sensor present in `useSensors` array) rather than full keyboard drag simulation; full keyboard DnD is exercised by Playwright (real browser). ⚠ UNVERIFIED with current `@dnd-kit/core` version — verify against https://docs.dndkit.com/api-documentation/sensors/keyboard before committing.

### Risk: `parseStoryModules` CSF3 detection breaks existing stories
Many existing `.stories.tsx` files export *function* variants, which the current code finds. Adding `.render` detection must be additive: if value is a function → keep current; if value is an object with `.render` of type function → add it. Don't change function detection.

### Risk: Responsive breakpoint changes could surprise desktop users
Spec constraint: "Responsive breakpoints must not change the desktop layout at full width." `useViewportBreakpoint` must initialise from `window.innerWidth` at mount and only collapse Submenu/Rail when width *crosses* a threshold downward. Add explicit test at 1920px asserting both panels open by default.

### Note: React Router `errorElement` vs React error boundary
RR v7 ships its own `errorElement` route property that catches loader/action errors as well as render errors (https://reactrouter.com/start/data/route-object#errorelement). The spec explicitly says "ErrorBoundary component wraps the Outlet" — so we ship the React boundary as the spec dictates. As a belt-and-suspenders move with zero cost, also set `errorElement: <NotFound mode="error" />` (or similar) on the root route for future loader errors. Document this decision in `@lore` on `router.tsx`.

---

## 7. Effort & scope

Spec marks I4 as **L (~4 days)**. With ~17 ordered steps and TDD per step, realistic walltime is 1–2 sessions. No schema migrations. No server changes. No new endpoints. Risk of touching ~25 files is mitigated by the `text-base-content` sweep being mechanical and grep-verified.

---

## 8. Definition of done

- All 30 acceptance-criterion rows above pass their declared test.
- `bun run check` (zero TS errors), `bun run lint` (zero), `bun run test` (all 1759+ pass, plus the new tests).
- Playwright suite green: `bunx playwright test --project=chromium` from `packages/web/`.
- No regressions in existing tests.
- `progress.json` updated with notes summarising commits and any deferred follow-ups.
- All `@lore` comments captured for the three CONFUSION resolutions above.
