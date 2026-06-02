# W3 Code Review -- 6 Lenses + AC Completeness Audit

**Branch:** `feat/W3-screen-implementation-parity`
**Commits reviewed:** `b2fd3401` (red phase) through `6f087b51` (green phase)
**Diff scope:** `git diff origin/main..HEAD`

---

## Verdict: NOT DONE

57 existing tests broken. 2 new page components missing stories. SettingsPage created but NOT wired into AppShell. Sidebar section headers not restyled to match mockups (Phase 2 CRITICAL-1 not addressed). Multiple findings below must be fixed before this can ship.

---

## Lens 1: Architecture (Positive)

### What follows the plan

- **Route registration (AC-26):** `/work/bet/:betId/task/:taskId` correctly added in `router.tsx:75`. WorkTask component imported and wired.
- **Component budget:** No new design-system components. WorkTask and SettingsPage are Tier 3 page components. useTaskSessions is a thin hook. All within budget.
- **Layer integrity:** All changes in `packages/web` and `packages/design-system`. No cross-layer violations. useTaskSessions correctly fetches from API, not DB.
- **Type changes:** BetCard props are additive and optional. SidebarProps gained `onSearchClick`, lost `activeScope`/`onSelectScope`. ConversationsFilter type kept as string union (backward-compatible choice, diverging from plan which proposed object form).
- **Max-width centering:** Applied to WorkPortfolio (960px), WorkBet (800px), WorkTask (800px), KnowledgeList (800px), KnowledgeDetail (960px), SettingsPage (680px). Matches the plan's table.

### Architecture violations

**CRITICAL-A1: SettingsPage not wired into AppShell.** `SettingsPage.tsx` exists (`packages/web/src/pages/SettingsPage.tsx`) and renders all sections stacked. But `AppShell.tsx:411-423` still uses the old conditional section-switching pattern (`activeSettingsSection === "profile" && <SettingsProfile />`). The plan (Section 5.2) explicitly says: "When `settingsOpen=true`, render `<SettingsPage />` instead of the conditional section switch." This means AC-47 (stacked single-page layout) is NOT satisfied in production -- the SettingsPage component works in isolation (test passes) but is never mounted.

**CRITICAL-A2: ConversationsFilter type NOT changed to toggle object.** The plan (Section 9.1) proposed changing from `"all" | "blocking" | "async"` to `{ blocking: boolean; unread: boolean }`. The builder kept the old string type and added a separate `ConversationsToggleFilter` interface used only inside the flat-list branch. This dual-type approach works but means the old `FilterPillBar` component in Conversations.tsx (lines 444-519) still renders `All / Blocking / Async` as mutually exclusive tabs with `role="tab"`. When `groupBySection=false`, the old FilterPillBar is not rendered -- instead ThreadSections renders its own toggle chips. The old FilterPillBar is dead code when the flat list path is active. The Conversations page renders `groupBySection={false}` unconditionally (line 599). This leaves the old FilterPillBar component and its `FILTER_OPTIONS` constant as dead code.

**WARNING-A3: Conversations page removed FilterPillBar from thread list view.** The Conversations page (line 566-603) no longer renders `FilterPillBar` in the thread list state (no threadId). It renders a simple header with "Conversations" heading and "New thread" button, then delegates filtering to `ThreadSections` via `groupBySection={false}`. This is fine architecturally but the old `FilterPillBar` function (lines 450-519) is now unreachable dead code.

---

## Lens 2: Design (Positive)

### Mockup parity issues

**CRITICAL-D1: Sidebar section headers NOT restyled.** This was Phase 2 CRITICAL-1. The mockup (`.sidebar-view` in every HTML screen file) specifies: `font-size: 14px; font-weight: 600; color: var(--text-secondary)` in sans-serif, sentence case ("Conversations", "Work", "Knowledge"). The current TSX `SectionHeader` in `Sidebar.tsx:123` still uses: `font-[family-name:var(--font-mono)] text-[12px] uppercase tracking-[var(--tracking-caps)]`. This is mono, 12px, uppercase -- visually wrong on every page. This was explicitly called out as the most significant functional omission in the architecture critique.

**WARNING-D2: Onboarding illustration is a single hex icon, not three mini-cards.** The mockup (`onboarding.html`) shows `.welcome-visual` with three `.welcome-card` elements containing colored dots and placeholder lines. The TSX (`SetupFlow.tsx:112-115`) renders a single circle with a hex unicode character. This is a simplified interpretation, not a match.

**WARNING-D3: Theme swatch cards lack colored swatches.** The mockup (`settings.html:57-60`) shows `.theme-option` cards with a `.theme-swatch` element: `width: 100%; height: 48px; border-radius: var(--r-subtle)` as a colored swatch above the label. The TSX (`SettingsAppearance.tsx:50-71`) renders text-only cards with label and description but no colored swatch element.

**WARNING-D4: Team pills use DaisyUI btn classes, not mockup's `.team-pill` styling.** The mockup (`work-bet-overview.html`) uses custom `.team-pill` with `border: 1.5px solid var(--border-default)` styling. The TSX (`WorkPortfolio.tsx:136-152`) uses `btn btn-xs btn-primary/btn-ghost`. This matches the visual intent but not the mockup's specific styling.

**WARNING-D5: Overflow menus use custom `toggleAttribute("open")` pattern, not DaisyUI dropdown.** The plan (Section 3.2, AC-19) suggested using "DaisyUI `dropdown` + `dropdown-content`". The implementation uses a custom `hidden [&[open]]:block` pattern with `el.toggleAttribute("open")`. This works but has no click-outside-to-close or Escape-to-close behavior. Users must click the "..." button again to close the menu.

---

## Lens 3: Security (Positive)

**WARNING-S1: WorkTask.tsx does not sanitize route params.** Phase 2 WARNING-6 flagged this: `/work/bet/:betId/task/:taskId` introduces two URL-sourced params. `WorkTask.tsx:39-40` uses raw `overrideBetId ?? routeBetId` and passes directly to `useBet(betId)` and `useTaskSessions(taskId)`. AppShell has `sanitizeRouteId()` for search navigation but WorkTask does not call it. The params are used in API fetch URLs via `useBet` and `useTaskSessions`. While React Router already decodes the params and the fetch hooks use `encodeURIComponent`, there is no path-traversal or injection validation on these params before they reach API calls.

**OK:** No XSS vectors. React's JSX escaping handles all dynamic text. No `dangerouslySetInnerHTML` in new code. API keys not exposed. No secrets in client code.

---

## Lens 4: Adversarial (Negative)

**CRITICAL-ADV1: 57 existing tests broken.** The implementation changed component structures (sidebar, BetCard progress type, filter bar, knowledge detail layout, setup flow) but did NOT update the 20 pre-existing test files that assert on the old structures. Failing test files include:
- `AppShell.filter-reset.test.tsx` (filter type change)
- `AppShell.knowledge-submenu.test.tsx` (scope sub-items removed)
- `AppShell.l10-filter.test.tsx` (filter vocabulary changed)
- `BetCard.test.tsx`, `BetCard.portfolio.test.tsx` (progress prop type changed)
- `Conversations.test.tsx` (filter bar structure changed)
- `KnowledgeDetail.*.test.tsx` (5 files -- layout restructured)
- `SetupFlow.test.tsx` (6 failures -- layout restructured)
- `Sidebar.test.tsx` (bottom strip restructured)
- `W2-settings-appearance.test.tsx` (select replaced with swatch cards)
- `U6-filter-relocation.test.tsx`, `U9-*.test.tsx` (structural changes)
This directly violates AC-58 ("npm run verify passes") and AC-59 ("all existing E2E tests pass or are updated").

**WARNING-ADV2: Overflow menu has no close-on-outside-click.** The custom `hidden [&[open]]:block` dropdown in `WorkBet.tsx:971-1033` and `KnowledgeDetail.tsx:466-508` uses `toggleAttribute("open")` but has no event listener for clicks outside the menu or Escape key. Once opened, the menu stays open until the user clicks "..." again or clicks a menu item. This is a regression from the DaisyUI dropdown behavior the plan specified.

**WARNING-ADV3: `as unknown as` double casts in WorkPortfolio.** `WorkPortfolio.tsx:185` uses `(bet as unknown as { team?: string }).team` and line 188 uses `(bet as unknown as { description?: string; progress?: ...; budget?: string })`. These are unsafe type assertions that bypass TypeScript's type system. The bet type from `useBets()` should be extended to include these fields, or the props should be mapped from known fields.

**WARNING-ADV4: WorkTask session status hardcoded.** `WorkTask.tsx:166` renders `<StatusChip status={taskStateToStatus("in_progress")} />` for every session regardless of actual session status. The `session.status` field exists but is not used for the StatusChip.

---

## Lens 5: Simplification (Negative)

**SIM-1: Dead code -- old grouping logic.** `ThreadSections.tsx` retains all of: `groupThreadsForConversations()`, `classifyForConversations()`, `sortById()`, `sortActive()`, `sortResolved()`, `CONVERSATIONS_SECTION_ORDER`, `CONVERSATIONS_SECTION_LABEL`, `ConversationsSection` type, `ConversationsSectionId` type, and the section-grouped rendering branch (lines 289-425). Since `Conversations.tsx` always passes `groupBySection={false}`, the entire grouped rendering path is dead code. That is 140+ lines of unused logic.

**SIM-2: Dead code -- FilterPillBar.** The `FilterPillBar` function in `Conversations.tsx` (lines 450-519) with its `FILTER_OPTIONS` constant is never rendered because the thread list view no longer calls it.

**SIM-3: Dead code -- SortableHeader.** `WorkBet.tsx:1305-1336` defines `SortableHeader` component that is never called. It was part of the old task table (replaced by flat task rows per AC-22) but was not deleted.

**SIM-4: Dead code -- RelatedSidebar.** `KnowledgeDetail.tsx:708-741` defines `RelatedSidebar` that is never called. It was replaced by the inline metadata aside (AC-40) but not deleted.

**SIM-5: sortColumn/sortDirection state unused.** `WorkBet.tsx:672-673` maintains `sortColumn` and `sortDirection` state and calls `sortTasks()` on line 744, but the `handleSort` function (line 877) is never connected to any UI element -- the sort headers were removed. The sort state is inert.

---

## Lens 6: AI Slop (Negative)

**SLOP-1: `// hearth-internal-padding` comment at top of BetCard.tsx.** This is a file-level directive that was already present, so not a new issue -- but it should not have been repeated in the diff header (line 1 of BetCard.tsx diff is `+// hearth-internal-padding`). This is fine per the AQ-001 exemption.

**SLOP-2: Redundant `id` prop on BetCardProps and KnowledgeRowProps.** Both `BetCard` (`id?: string`) and `KnowledgeRow` (`id?: string`) added an `id` prop documented as "allows caller to pass id without error" -- but neither component uses the prop in any rendering or logic. It is a passthrough prop added solely to suppress TypeScript spread errors. This is a code smell; the caller should filter props before spreading.

**SLOP-3: `costAppetite?: unknown` prop on BetCardProps.** BetCard added `costAppetite?: unknown` documented as "legacy prop name -- alias for appetite" but does not read or use it. Same pattern as the `id` prop -- added to suppress spread errors rather than fixing the caller.

**SLOP-4: Comments that describe what is obvious.** Multiple `// W3 AC-16: ...` comments on every prop definition in BetCard. The JSDoc is fine but the inline comments on the rendering branches are redundant when the code is self-explanatory.

---

## Architecture Critique CRITICAL Items -- Builder Disposition

| Critique Item | Addressed? | Notes |
|---|---|---|
| CRITICAL-1: Sidebar section headers sans-serif 14px/600 | **NO** | Still mono 12px uppercase. Not restyled. |
| CRITICAL-2: Empty states verified/updated | Partial | Empty states exist but not verified against mockups. |
| CRITICAL-3: WorkTask loading/error/not-found | **YES** | WorkTask.tsx has loading (skeleton), error, and not-found states. |
| CRITICAL-4: Breaking E2E tests updated | **NO** | 57 existing tests broken. No updates to pre-existing test files. |
| CRITICAL-5: SettingsPage.stories.tsx | **NO** | No stories file created for SettingsPage or WorkTask. |

---

## AC Completeness Audit

| AC | Description | Test? | Impl? | Mockup? | Notes |
|---|---|---|---|---|---|
| AC-1 | Sidebar bottom strip: search hint, avatar, assistant | Yes (W3-sidebar.test) | Yes | Partial | Search hint uses div not button (mockup neutral). Avatar 28px matches. |
| AC-2 | Work sub-nav shows teams | Yes (existing) | Yes | Yes | Already correct, unchanged. |
| AC-3 | Knowledge sub-nav has no sub-items | Yes (W3-sidebar.test) | Yes | Yes | Scope items removed. |
| AC-4 | Conversations sub-nav shows recent threads | Yes (existing) | Yes | Yes | Unchanged. |
| AC-5 | Flat chronological thread list | Yes (W3-conversations.test) | Yes | Yes | `groupBySection={false}` passed. |
| AC-6 | Toggle filter chips (Blocking, Unread) | Yes (W3-conversations-filter.spec) | Yes | Yes | Toggle chips with `aria-pressed`. |
| AC-7 | Blocking badge on thread rows | Yes (W3-conversations-filter.spec) | Yes | Yes | Text badge added to ThreadRow. |
| AC-8 | New thread button in header | Yes (W3-conversations.test) | Yes | Yes | Button in header row. |
| AC-9 | Inline artifact card | No new test | Existing | Partial | ArtifactView used, no new artifact card shape verified. |
| AC-10 | Dial-in button with live indicator | Existing tests | Existing | Yes | Pre-existing from Q1. |
| AC-11 | Approve/Reject verdict buttons | Existing tests | Existing | Yes | Pre-existing from L7. |
| AC-12 | Composer items-stretch | Yes (W3-conversations.test) | Yes | Yes | `items-stretch` on composer row. |
| AC-13 | Status filter tabs in portfolio header | Yes (W3-work.test) | Yes | Yes | All/Active/Completed/Draft pills. |
| AC-14 | Team pill filters from API | Yes (W3-work.test) | Yes | Partial | Uses DaisyUI btn, not mockup `.team-pill`. |
| AC-15 | No status dots on bet cards | Yes (W3-work.test) | Yes | Yes | StatusChip only. |
| AC-16 | Bet cards: title, desc, progress, avatars, budget | Yes (W3-work.test) | Yes | Yes | All props added. |
| AC-17 | New bet button | Yes (existing) | Yes | Yes | Already existed. |
| AC-18 | Bet grid max-width 960px | Yes (W3-screen-parity.spec) | Yes | Yes | `max-w-[960px] mx-auto`. |
| AC-19 | Overflow action menu | Yes (W3-work.test) | Yes | Partial | Custom dropdown, no close-on-outside-click. |
| AC-20 | Stat cards row | Yes (W3-work.test) | Yes | Yes | 3-card grid with progress, budget, team. |
| AC-21 | Pitch section with Edit button | Yes (W3-work.test) | Yes | Yes | Section header + Edit button. |
| AC-22 | Task rows clickable, navigate to detail | Yes (W3-work.test) | Yes | Yes | Flat list with StatusChip, onClick navigates. |
| AC-23 | Artifacts section | Yes (existing) | Yes | Yes | ArtifactSection reused. |
| AC-24 | Discussion with composer | Yes (existing) | Yes | Yes | HostThreadSection reused. |
| AC-25 | Content max-width 800px | Yes (W3-screen-parity.spec) | Yes | Yes | `max-w-[800px] mx-auto`. |
| AC-26 | Route `/work/bet/:betId/task/:taskId` | Yes (W3-task-detail.spec) | Yes | Yes | Route registered in router.tsx. |
| AC-27 | Breadcrumb | Yes (W3-work-task.test) | Yes | Yes | Work / Team / Bet / Task breadcrumb. |
| AC-28 | Metadata strip | Yes (W3-work-task.test) | Yes | Partial | Flat flex row, not structured `.meta-strip` card from mockup. |
| AC-29 | Sessions section | Yes (W3-work-task.test) | Yes | Partial | Session rows rendered. Status hardcoded to "in_progress". |
| AC-30 | Discussion section | Yes (W3-work-task.test) | Yes | Yes | HostThreadSection with hostKind="task". |
| AC-31 | Artifacts section | Yes (W3-work-task.test) | Yes | Yes | ArtifactSection with task filter. |
| AC-32 | Content max-width 800px | Yes (W3-screen-parity.spec) | Yes | Yes | `max-w-[800px] mx-auto`. |
| AC-33 | Scope filter pills from data | Yes (W3-knowledge.test) | Yes | Yes | Data-driven scope pills. |
| AC-34 | Sort controls visible | Yes (W3-knowledge.test) | Yes | Partial | Always visible. Uses btn classes, not mockup's plain text style. |
| AC-35 | Knowledge rows: no status dots, preview | Yes (W3-knowledge.test) | Yes | Yes | Preview prop added. No status dots. |
| AC-36 | "+ New" button | Yes (existing) | Yes | Yes | Already existed. |
| AC-37 | Curated/Triage tab switching | Yes (W3-knowledge.test) | Yes | Yes | Tab switching with manual-selection tracking. |
| AC-38 | Content max-width 800px | Yes (W3-screen-parity.spec) | Yes | Yes | `max-w-[800px] mx-auto`. |
| AC-39 | Edit primary + overflow menu | Yes (W3-knowledge.test) | Yes | Partial | Edit btn is btn-ghost, not btn-primary as AC specifies. Overflow menu has no close-on-outside. |
| AC-40 | Two-column layout with metadata aside | Yes (W3-knowledge.test) | Yes | Yes | grid-cols-[1fr_14rem]. Metadata aside with Kind, Status, Confidence, Last edited, Access count. |
| AC-41 | Backlinks card in aside | Yes (W3-knowledge.test) | Yes | Yes | `knowledge-backlinks-card` testid. Related items rendered. |
| AC-42 | Discussion below body | Yes (existing) | Yes | Yes | HostThreadSection below the grid. |
| AC-43 | Content max-width 960px | Yes (W3-screen-parity.spec) | Yes | Yes | `max-w-[960px] mx-auto`. |
| AC-44 | Edit mode: Done replaces Edit, toolbar, border, save indicator | Yes (W3-knowledge-edit.spec) | Yes | Partial | Done replaces Edit. Save indicator in header. Editor border missing (no explicit border wrapper around BodyEditor in edit mode). |
| AC-45 | Done returns to read mode | Yes (W3-knowledge-edit.spec) | Yes | Yes | `exitEdit()` sets editing=false. |
| AC-46 | Metadata aside read-only during edit | Yes (W3-knowledge-edit.spec) | Yes | Yes | Aside not conditionally rendered. |
| AC-47 | Stacked single-page settings | Yes (W3-settings.test) | **Partial** | Yes | SettingsPage component exists but is NOT wired into AppShell. |
| AC-48 | "Save profile" button text | Yes (W3-settings.test) | Existing | Yes | SettingsProfile already has this. |
| AC-49 | "Org chart" section label | Yes (W3-settings.test) | Yes | Yes | Section renders with "Org chart" label. |
| AC-50 | Theme swatch cards | Yes (W3-settings.test) | Yes | Partial | Cards present but lack colored swatch element. |
| AC-51 | Backend section | Yes (W3-settings.test) | Yes | Yes | SettingsBackend rendered. |
| AC-52 | Content max-width 680px | Yes (W3-screen-parity.spec) | Yes | Yes | `max-w-[680px] mx-auto`. |
| AC-53 | Card with shadow, brand, tagline, illustration | Yes (W3-onboarding.test) | Yes | Partial | Card + shadow + brand + tagline. Illustration is a hex icon, not three mini-cards. |
| AC-54 | Three fields | Yes (W3-onboarding.test) | Yes | Yes | Name, API key, Project folder. |
| AC-55 | Start HyperIdle button disabled until filled | Yes (W3-onboarding.test) | Yes | Yes | Correct behavior. |
| AC-56 | No step indicator, no email, no team name | Yes (W3-onboarding.test) | Yes | Yes | Correct -- none present. |
| AC-57 | All content areas centered | Yes (W3-screen-parity.spec) | Yes | Yes | All pages have max-width + mx-auto. |
| AC-58 | npm run verify passes | **NO** | **NO** | N/A | 57 test failures. |
| AC-59 | All existing E2E tests pass or updated | **NO** | **NO** | N/A | Existing tests not updated. |

---

## Summary of Required Fixes

### CRITICAL (must fix before ship)

1. **Fix 57 broken existing tests (AC-58, AC-59).** Update the 20 pre-existing test files that broke due to structural changes. Key categories:
   - Sidebar tests: update for removed knowledge scope items, new bottom strip layout
   - Filter tests: update for new toggle chip pattern vs old tab pattern
   - BetCard tests: update for changed progress prop type (now `number | { done, total }`)
   - KnowledgeDetail tests: update for new two-column layout, overflow menu
   - SetupFlow tests: update for new card wrapper layout
   - Settings tests: update for swatch cards replacing select

2. **Wire SettingsPage into AppShell (AC-47).** Replace the conditional section rendering in `AppShell.tsx:411-423` with `<SettingsPage />`. The component exists but is not mounted.

3. **Restyle sidebar section headers to match mockup (Phase 2 CRITICAL-1).** Change `SectionHeader` in `Sidebar.tsx:121-129` from `font-[family-name:var(--font-mono)] text-[12px] uppercase tracking-[var(--tracking-caps)]` to `font-[family-name:var(--font-sans)] text-[14px] font-[600]` with sentence-case labels. This affects every page.

4. **Create WorkTask.stories.tsx and SettingsPage.stories.tsx (Phase 2 CRITICAL-5).** Every new component requires stories per design-system rules. WorkTask needs states: populated, loading, error, not-found, with-active-session. SettingsPage needs: default (all sections stacked).

### WARNING (should fix)

5. **Delete dead code:** FilterPillBar + FILTER_OPTIONS in Conversations.tsx, SortableHeader in WorkBet.tsx, RelatedSidebar in KnowledgeDetail.tsx, sortColumn/sortDirection state in WorkBet.tsx. Remove or gate the grouped rendering path in ThreadSections.tsx.

6. **Add close-on-outside-click to overflow menus** in WorkBet.tsx and KnowledgeDetail.tsx. Without it, menus stay open indefinitely.

7. **Remove unsafe `as unknown as` casts** in WorkPortfolio.tsx:185,188. Either extend the bet type or map props from known fields.

8. **Fix WorkTask session status** -- use `session.status` for StatusChip instead of hardcoded `"in_progress"`.

9. **Add editor border wrapper** around BodyEditor in KnowledgeDetail edit mode (AC-44 specifies "editor border").

10. **Make Edit button primary** on KnowledgeDetail (AC-39 says "Edit as primary button" but implementation uses `btn-ghost`).

11. **Remove unused `id` and `costAppetite` props** from BetCardProps, or document why they exist as passthrough props.

12. **Sanitize route params in WorkTask.tsx** -- apply `sanitizeRouteId` to `betId` and `taskId` before API calls.
