# Architecture Critique: W3

ARCHITECTURE-SCORE: 7/10  rounds=1  score-line: SA:7 LI:9 AC:8 DM:8 N:8 MD:8 FMC:6 S:7 V:6

---

## Dimension Scores

### 1. Spec Alignment (7/10)

The plan maps all 59 ACs to concrete implementation approaches. Coverage is mostly complete, but several gaps and misreadings exist:

**CRITICAL gaps:**

- **Sidebar section header styling mismatch.** The HTML mockups use `.sidebar-view` for section headers: `font-size: 14px; font-weight: 600; color: var(--text-secondary)` in sans-serif, sentence case ("Conversations", "Work", "Knowledge"). The current TSX `SectionHeader` renders `font-mono text-[12px] uppercase tracking-caps`. The plan does not address this restyling. This visual mismatch affects every single page and is arguably more visible than the bottom strip changes the plan does address. This should be a Phase 1 task alongside the bottom strip changes.

- **Empty states not addressed.** Three mockup files (`conversations-empty.html`, `work-empty.html`, `knowledge-empty.html`) are listed in the spec's reference table but the plan never addresses them. The existing TSX empty states may or may not match the mockups -- the plan should at minimum state "verified as matching" or flag specific changes needed.

- **Knowledge list topic-header grouping.** The `knowledge-list.html` mockup groups knowledge rows under `.topic-header` sections ("Patterns", "Decisions", "Failures") with item counts. The plan (Section 4.1, AC-35) says "Verify no status dots; add preview text display" but does not mention implementing the topic-header grouping pattern visible in the mockup. If the mockup shows grouped-by-kind rendering, the TSX must match.

**WARNINGs:**

- **AC-7 misreads ThreadRow.** The plan says "If ThreadRow doesn't support a blocking badge, add a `blocking?: boolean` prop." ThreadRow already HAS a `blocking` prop (confirmed in `packages/design-system/src/ThreadRow.tsx:24`), but it only controls a left-border accent -- it does NOT render a visible "Blocking" text badge. The mockup shows `<span class="badge badge--blocking">Blocking</span>` in the thread meta area. The plan must specify: keep the existing border behavior AND add visible badge rendering when `blocking=true`.

- **AC-14 team pill location.** The `work-bet-overview.html` mockup places team pills on the right side of the header, between the tab-bar-pill and the "New bet" button. The plan says "Already implemented. Verify the styling matches the mockup's `.team-pill`" but the current implementation uses DaisyUI `btn` classes and may be positioned differently. The plan needs explicit positioning guidance (header right section, between tab pills and button).

### 2. Layer Integrity (9/10)

Clean layer boundaries. All changes stay within `packages/web` and `packages/design-system`. No cross-layer reaching. The `useTaskSessions` hook correctly proposes fetching from the API endpoint rather than accessing the DB directly.

### 3. API Contracts (8/10)

The plan correctly identifies the existing `/api/sessions?task_id=...` endpoint for the new `useTaskSessions` hook. The route addition in `router.tsx` is well-specified. No new server endpoints are proposed, which is appropriate for a UI parity workpackage.

**WARNING:** The plan does not specify what happens when `useBet(betId)` returns null/error on the task detail page (AC-27 breadcrumb resolution). The data dependency chain is: task detail needs `useBet(betId)` to get team name for the breadcrumb, plus the task from `bet.tasks`. What if the bet has no tasks matching `taskId`? The plan should specify the error/loading/not-found states for `WorkTask.tsx`.

### 4. Data Model Alignment (8/10)

No schema changes required (UI-only workpackage). The type changes are well-specified:
- `ConversationsFilter` from string union to toggle object -- clear before/after.
- `BetCardProps` extensions are additive and optional.
- `SidebarProps` removals (`activeScope`, `onSelectScope`) and additions (`onSearchClick`) are clear.

**WARNING:** `ConversationsFilter` type change from `"all" | "blocking" | "async"` to `{ blocking: boolean; unread: boolean }` removes the `predicateFor()` exhaustive switch in `ThreadSections.tsx`. The plan mentions updating `ThreadSections.tsx` type but does not mention updating `predicateFor()`, `FILTER_EMPTY_COPY`, `groupThreadsForConversations()`, and the section grouping logic that depends on the current filter type. These functions contain significant logic tied to the old type. The plan should explicitly list each function that must change.

### 5. Naming (8/10)

Names are honest and descriptive. `useTaskSessions`, `WorkTask`, `SettingsPage`, `StatsRow` all communicate purpose. `onSearchClick` is clear. No generic names.

Minor: `MetadataAside` (Section 4.2, AC-40) is described as replacing `RelatedSidebar` but the plan does not confirm `RelatedSidebar` exists in the current code. Names should trace to actual current components.

### 6. Module Depth (8/10)

Good decisions: stat cards, metadata strip, and overflow menus as page-level composition rather than new design-system components. The 19-component budget is respected. `useTaskSessions` is a thin hook over an existing API endpoint.

The plan proposes two new page components (`WorkTask.tsx`, `SettingsPage.tsx`) and one new hook -- appropriately scoped for the problem size.

### 7. Failure-Mode Coverage (6/10)

This is the weakest dimension. The plan is overwhelmingly happy-path.

**CRITICAL:**

- **WorkTask page states.** The plan describes the populated state but says nothing about: loading state (skeleton), error state (API failure), not-found state (invalid betId or taskId). The mockup is just populated data. The builder needs guidance on what to render for these cases.

- **No security/abuse block.** The plan has no "Security & abuse cases" section. While this is a UI-only workpackage, there are trust boundaries:
  - The new route `/work/bet/:betId/task/:taskId` takes two URL params. Both must be sanitized (AppShell already has `sanitizeRouteId`). The plan should note this.
  - The data-driven scope pills (AC-33) derive labels from API data. What if scope labels contain malicious content? They're rendered as button text (safe in React) but this should be called out as "safe by default: React escapes text content."

- **Missing E2E test for AC-57 cross-cutting max-width.** The plan lists `W3-screen-parity.spec.ts` in Section 8.2 but provides no detail on what assertions it contains. "Max-width centering across all screens" needs concrete verification: which pages, what selectors, what property checks.

### 8. Simplicity / Over-Engineering Risk (7/10)

The plan is appropriately restrained. No unnecessary abstractions, no feature flags, no plugin points.

**WARNING:** The `SettingsPage.tsx` approach creates a new component that wraps all existing settings section components. But the current code in `AppShell.tsx` lines 412-424 already conditionally renders each section by `activeSettingsSection`. The plan should clarify: does `SettingsPage.tsx` import and stack all 7-8 settings sections, making AppShell just render `<SettingsPage />`? Or does it restructure the conditional? The current approach in AppShell is 13 lines of conditional rendering. The plan should specify whether `SettingsPage.tsx` receives props or fetches its own data, and how the settings sidebar scroll-to behavior works (the plan says "section labels for anchor-scroll" but then removes `activeSettingsSection` state -- who tracks which section is scrolled to?).

### 9. Verifiability (6/10)

**CRITICAL:**

- **No protected-tests list.** The plan lists 12 E2E files that will break (Section 8.1) but does not distinguish which test assertions are contracts that must be preserved in the updated tests versus which are incidental to the old UI shape. Without this, the builder may drop important test coverage while updating tests.

- **Verification methods are vague.** Phase 1 says "visual inspection of sidebar on all views; verify max-width with browser dev tools." Phase 2 says "E2E tests for thread list rendering, filter toggles, artifact card presence." These are directions, not concrete test names or assertions. Each phase should name the specific test file and at least the primary assertion pattern.

- **No WorkTask.stories.tsx content guidance.** The plan lists stories as a deliverable but does not specify which states to cover: populated, loading, error, not-found, with-active-session, without-active-session. Stories ARE the visual verification mechanism -- they need state coverage.

- **SettingsPage has no stories listed at all.** `SettingsPage.tsx` is a new page component but the plan's new files table (Section 13) does not list `SettingsPage.stories.tsx`. Every new component requires stories per the design-system rules.

---

## CRITICAL

1. **[plan is missing]** Sidebar section header restyling. The mockup uses sans-serif 14px/600 sentence-case section headers (`.sidebar-view`). The current TSX uses mono 12px uppercase tracking-caps. This affects every page. Add a Phase 1 task to restyle `SectionHeader` in `Sidebar.tsx` to match the mockup pattern.

2. **[plan is missing]** Empty state mockup verification. The spec lists `conversations-empty.html`, `work-empty.html`, `knowledge-empty.html` as reference mockups. The plan must either confirm the current empty states already match or list the changes needed.

3. **[plan §3.3]** `WorkTask.tsx` has no loading/error/not-found state guidance. The plan describes only the populated state. Add state coverage: skeleton while `useBet` resolves, error state on API failure, not-found when betId or taskId is invalid.

4. **[plan §8, §10]** No protected-tests list and no concrete verification assertions. The 12 E2E files listed as "will break" need annotation: which assertions survive restyling (contract) versus which are incidental. Each implementation phase needs at minimum the test file name and key assertion.

5. **[plan §13]** `SettingsPage.stories.tsx` missing from new files. Every new component needs stories.

## WARNING

1. **[plan §2.1, AC-7]** ThreadRow already has `blocking` prop but it only renders a border accent. The plan must specify: add a visible `<span class="badge badge--blocking">Blocking</span>` text badge to the meta area when `blocking=true`, in addition to the existing border behavior.

2. **[plan §4.1, AC-35]** Knowledge list mockup groups items under `.topic-header` sections with kind counts. The plan does not address this grouping pattern. Clarify: does the TSX need to render topic-header groups, or is the mockup showing an illustrative layout that the flat list supersedes?

3. **[plan §2.1, AC-5/AC-6]** `ConversationsFilter` type change cascades further than documented. The plan lists type changes in Section 9.1 but does not enumerate the functions that depend on the old type: `predicateFor()`, `FILTER_EMPTY_COPY`, `groupThreadsForConversations()`, `classifyForConversations()`, and the section rendering logic in `ThreadSections`. The plan says "remove section grouping" (AC-5) -- this means deleting `groupThreadsForConversations`, `classifyForConversations`, `CONVERSATIONS_SECTION_ORDER`, `CONVERSATIONS_SECTION_LABEL`, and the `ConversationsSection` type. The builder needs this explicit.

4. **[plan §5]** Settings sidebar scroll-to behavior is under-specified. The plan says "sidebar items scroll to sections via `scrollIntoView`" but also says "Remove `activeSettingsSection` state." If section items should highlight as the user scrolls (current active state), an `IntersectionObserver` or scroll listener is needed. Specify whether the section highlight-on-scroll behavior is in scope or not.

5. **[plan §7]** Max-width table omits `bet-grid` `width: 100%`. The mockup uses `max-width: 960px; margin: 0 auto` on `.bet-grid` but the plan only mentions Tailwind classes for some pages, not all. Provide the complete class string for each page's content container for builder copy-paste accuracy.

6. **[plan is missing]** Security note for the new route params. `/work/bet/:betId/task/:taskId` introduces two URL-sourced params. The plan should note that `WorkTask.tsx` must validate both params (AppShell's `sanitizeRouteId` pattern or `useParams` type narrowing) before using them in API calls.

## SUGGESTION

1. **[plan §3.5]** `BetCard.stories.tsx` is listed as modified but no guidance on which new story variants to add (with-description, with-progress, with-avatar-group, with-budget-label, completed-state). This helps the builder write meaningful stories, not just "add props."

2. **[plan §10]** Phase ordering is good but Phase 5 (Knowledge + Settings + Onboarding) is too large. Consider splitting Knowledge (AC-33-46) and Settings+Onboarding (AC-47-56) into separate phases so they can be verified independently.

3. **[plan §2.2, AC-9]** The artifact card implementation is described speculatively ("may already cover this"). The plan should verify: does `ArtifactView`/`ArtifactPreview`/`ArtifactEmbed` currently render the mockup's card shape (type label, title, preview, status)? Or does a new `.artifact-card` sub-component need to be built? The builder should not be guessing.

4. **[plan §6]** Onboarding illustration is described as "three mini-cards with colored dots + placeholder lines" but the plan does not specify the CSS class names or Tailwind classes needed. The mockup uses `.welcome-visual`, `.welcome-card`, `.welcome-dot`, `.welcome-line` -- the plan should reference these directly so the builder maps them to Tailwind equivalents.

## What's Working Well

1. **Component budget discipline.** The plan explicitly states "No new custom design-system components" and limits new files to page components and a hook. This respects the 19-component budget and avoids premature abstraction. Stat cards, metadata strips, and overflow menus as page-level composition is the right call.

2. **Cross-cutting max-width table.** Section 7 provides a concrete per-screen max-width reference table with the specific pixel values from each mockup. This eliminates ambiguity and gives the builder a copy-paste reference.

3. **E2E impact analysis.** Section 8.1 identifies 12 specific test files that will break with reasons. This is thorough and saves the builder from discovering breakage reactively.

---

## Verdict

Score is 7/10, which meets the advancement threshold. The plan is structurally sound with good component budget discipline and clear per-AC implementation guidance. The main weaknesses are in failure-mode coverage (happy-path only for WorkTask, no security block) and verifiability (no protected-tests, no concrete assertions, missing stories for SettingsPage). The sidebar section header restyling gap is the most significant functional omission -- it affects every page but is a straightforward addition to Phase 1.

The builder should treat the CRITICAL items as mandatory pre-flight clarifications and the WARNINGs as guidance to follow during implementation. The plan is approved for advancement to the build phase.
