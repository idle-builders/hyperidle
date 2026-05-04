# Track J: Design Synthesis Adoption

Adopts the design synthesis from `docs/design-synthesis/` (Shell, Conversations, Work, Knowledge) into the shipping codebase. Each story maps to the synthesis comparison axes and the Implementation Delta sections.

**Design decisions (agreed before build):**
- **Settings:** Overlay with focus trap. Rail is NOT visible while Settings is open. Rail is visible whenever main content is visible — but not literally always.
- **Collapsed Rail:** Three semantic pills (BLK/REV/PSD) with color coding. Try it — the design shows it's feasible at 56px.
- **Component budget:** No strict number enforced. Create new components only when necessary, as decided by the designer. Prefer composition inside existing components when possible.
- **No serif font.** Factory scope uses density (spacing, weight) not a new font family.

**Reference docs:** `docs/design-synthesis/ShellSynthesis.html`, `ConversationSynthesis.html`, `WorkSynthesis.html`, `KnowledgeSynthesis.html`, `docs/REVIEW_ADVERSARY_DESIGN.md`, `docs/REVIEW_ARCHITECT_DESIGN.md`.

See `CLAUDE.md` for tech stack and `plans/work-packages/dependency-graph.md` for the dependency graph.

---

### J1 — Token & Primitive Updates

**Story.** As a UI developer, I want the design token system updated (density knob activated, Tag extended with a `kind` variant) so that all downstream synthesis work inherits the correct visual foundation.

**Depends on.** UI-10.

**Acceptance criteria.**
- Density knob in `SettingsData.appearance.density` wired to actual CSS output — changing density visibly affects padding, gap, and text sizing across all components.
- `Tag` component accepts an optional `kind` prop (e.g., `pattern`, `decision`, `failure`) that renders with a subtle icon and muted tint. Default behavior (no `kind`) unchanged.
- No regressions: all existing Tag, StatusChip, KeyValue, NavItem, SearchField tests pass without modification.
- `bun run check` + `bun run lint` + `bun run test` all green.

**Validation scenarios.**
- Given density set to "compact", when any page renders, then spacing is visibly tighter than default.
- Given `<Tag kind="pattern" label="Pattern" />`, when rendered, then icon + tinted background visible.
- Given `<Tag label="Neutral" />` (no kind), when rendered, then identical to current behavior.

**Contracts / constraints.**
- Density modes: `compact | default | comfortable` — mapped to CSS scale variables.
- Tag kind icon map lives in a single constant (easy to extend, not scattered).
- No new fonts. No new color tokens beyond what `factory-dark` already defines.

**Effort.** S (~1d)

---

### J2 — Shell Navigation Redesign

**Story.** As a founding team member, I want the IconRail to show which view has my attention (2px active indicator) and which views have unread items (notification dot), and the collapsed Rail to show semantic pills (BLK/REV/PSD) with color coding, so that I can scan system state at a glance without expanding anything.

**Depends on.** J1.

**Acceptance criteria.**
- IconRail: active view has a 2px left-edge indicator in `--primary` color. Inactive views with unread items show a 6px notification dot.
- Rail collapsed state: three semantic pills — BLK (error/red), REV (primary/blue), PSD (neutral) — each showing count. Pills only render when count > 0. Expand chevron still present.
- Submenu: mono header with count bubble. Segmented filter row for Conversations (All / Needs review / Chats / Resolved) and Knowledge (All / Needs review). Work submenu has no filters (the board IS the filter).
- All existing keyboard navigation preserved (roving focus on IconRail, arrow keys in Submenu).
- `bun run test` passes. Playwright E2E for collapsed Rail pill rendering.

**Validation scenarios.**
- Given Conversations has 3 unread threads, when viewing Work, then Conversations icon in IconRail shows notification dot.
- Given Rail collapsed with 2 blockers and 1 review, when rendered, then BLK pill shows "2" in red, REV pill shows "1" in blue, PSD pill hidden (count 0).
- Given Submenu on Conversations, when "Needs review" filter selected, then only review threads shown.

**Contracts / constraints.**
- Unread data flows from same source as expanded Rail (no duplicate subscription).
- Notification dot: 6px, positioned top-right of icon button, `badge-error` color. ARIA label: "N unread items".
- Filter state is local (not URL-persisted). Switching views resets filter to "All".

**Effort.** M (~3d)

---

### J3 — Settings Overlay + Command-K Visual

**Story.** As a founding team member, I want Settings to open as a focused overlay (not a small modal — a proper panel with focus trap) and Command-K search to show grouped results with keyboard navigation, so that configuration and navigation feel intentional and fast.

**Depends on.** J1.

**Acceptance criteria.**
- Settings opens from avatar click. Opens as overlay panel with focus trap. Rail is NOT visible while Settings is open. Main content dimmed/inaccessible behind overlay.
- Settings has five tabs: Profile, Products, Agents, Notifications, Appearance (including working density toggle from J1).
- Closes on Esc or explicit close button. If user presses Command-K while Settings is open, Settings closes first.
- Command-K search: centered overlay (max 640px), ghost search field, results grouped by type (Conversations / Work / Knowledge). Arrow keys navigate, Enter selects, Esc closes. Mono recent-queries row at bottom.
- `bun run test` passes. Playwright E2E: open Settings → press Esc → verify closed. Open Settings → press Command-K → verify Settings closed, search open.

**Validation scenarios.**
- Given Settings open, when Esc pressed, then Settings closes and focus returns to previous element.
- Given Settings open, when Command-K pressed, then Settings closes and search opens.
- Given Command-K open with query "bet", when results load, then grouped under Conversations / Work / Knowledge headings.
- Given Command-K open, when arrow-down pressed twice then Enter, then second result navigates.

**Contracts / constraints.**
- Settings overlay uses `focus-trap-react` (already a dependency).
- Command-K routing uses existing `sanitizeRouteId` + `handleSearchNavigate` from `useCommandK`.
- Stacking order: Settings at z-40, Command-K at z-50 (above Settings).

**Effort.** M (~3d)

---

### J4 — Conversations Surface

**Story.** As a founding team member reviewing agent work, I want threads grouped by urgency (Pinned → Blocking → Reviews → Chats → Resolved), a collapsible Reasoning block showing the agent's thought process before every artifact, keybind chips on verdict buttons, and polished ArtifactView rendering for all five shapes, so that I can make faster, better-informed review decisions.

**Depends on.** J2.

**Acceptance criteria.**
- Thread list grouped into sections: Pinned, Blocking (all kinds), Reviews, Chats, Resolved (last 24h). Blocking outranks kind — a blocking chat appears before a non-blocking review.
- Reasoning block: collapsible panel rendering `Message.reasoning[]` as numbered steps. Appears before the artifact in every review. Default state: collapsed.
- Verdict toolbar: Approve (A), Request Changes (R), Reject (X) always visible. Pause button visible when `blocking === true`. Remaining actions (delegate, fork, merge, archive, escalate) under overflow menu. Keybind chips shown on each button.
- ArtifactView: all five shapes render with metadata strip (kind badge, status, SLA, routing) at top and related-history section below.
- Chat mode (Chief-of-Staff): distinct from review — no verdict toolbar, grouped messages by sender, artifact previews inline.
- `bun run test` + `bun run check` + `bun run lint` all green.

**Validation scenarios.**
- Given 2 blocking reviews and 3 non-blocking chats, when thread list renders, then blocking reviews appear in "Blocking" section above "Chats" section.
- Given review with 5 reasoning steps, when Reasoning block expanded, then all 5 steps shown as numbered list.
- Given review with `blocking === true`, when verdict toolbar renders, then Pause button visible alongside Approve/RequestChanges/Reject.
- Given `text_diff` artifact, when rendered, then metadata strip shows kind badge "text_diff" + status.

**Contracts / constraints.**
- Section ordering is computed client-side from thread status/kind — no API change needed.
- Reasoning block is a new component (`ReasoningBlock`) composed inside ReviewHeader or ArtifactView context. Props: `steps: string[]`, `defaultOpen?: boolean`.
- Keyboard shortcuts: single-key (A/R/X/S) only fire when no input is focused. Pre-fill verdict, user confirms with Enter.
- Inline comment anchoring on `text_diff` is deferred to a follow-up story (not in this track).

**Effort.** L (~5d)

---

### J5 — Work Surface

**Story.** As a founding team member managing bets, I want a richer Portfolio overview (lead agent, progress, cycle stripe), TaskCards grouped by bet on the Kanban, a PitchSelector with inline detail pane, and a proper Bet detail page (breadcrumb + pitch body + task table + comments), so that I can go from "morning scan" to "deep understanding" in one click.

**Depends on.** J2.

**Acceptance criteria.**
- Portfolio: BetCard shows lead agent avatar, active bets count, shipped count, and progress indicator. Cycle management stripe below product cards (shows current cycle, days remaining).
- Canvas: capacity badge visually prominent (N/C format). "Over capacity" renders in error red.
- Kanban: TaskCards grouped by bet with collapsible group headers showing bet name + task count. Cards within groups keep existing drag behavior.
- PitchSelector: clicking a pitch expands an inline detail pane showing full pitch body (problem / appetite / solution / rabbit holes). "Add to canvas" action only in detail pane. PitchSelector is an overlay (replaces Kanban), not inlined between Canvas and Kanban.
- Bet detail page: breadcrumb (Product → Team → Bet), enriched bet header, pitch body rendered as markdown, task table (sortable columns: title, status, owner, cost), comment thread below.
- `blocked = warning` (amber) preserved everywhere. Red border on blocked TaskCards is additive to amber chip.
- `bun run test` + `bun run check` + `bun run lint` all green.

**Validation scenarios.**
- Given Portfolio with 4 products, when rendered, then each product card shows lead, bets, shipped count.
- Given Canvas with 3 committed bets and capacity 2, when rendered, then "Over capacity" warning in red.
- Given Kanban with tasks from 2 bets, when rendered, then tasks grouped under bet headers.
- Given PitchSelector open with pitch selected, when detail pane visible, then problem/appetite/solution/rabbit-holes sections shown.
- Given Bet detail page, when task table renders, then columns sortable by click.

**Contracts / constraints.**
- PitchSelector replaces Kanban when open (existing overlay pattern). Detail pane is internal to PitchSelector, not a separate route.
- Bet detail page composes existing BetCard (enriched) + markdown renderer + table + comment thread. Markdown: use `react-markdown` if available, else `<pre>` with whitespace preserved.
- Task table is denser than stacked TaskCards — use `<table>` with DaisyUI table classes, not card components.

**Effort.** L (~6d)

---

### J6 — Knowledge IA & List

**Story.** As a founding team member curating organizational knowledge, I want a scope browser (Practice / Product / Factory), topic-grouped lists with collapsible headers, and a Triage view with attention-scored items showing "Why now" reason lines, so that I can focus curation effort where it matters most.

**Depends on.** J1, J2.

**Acceptance criteria.**
- Scope browser: three-scope segmented control at top of Knowledge submenu (Practice / Product / Factory). Topic NavItems below with subtopic disclosure. Health dots on topics (green = fresh, amber = some stale, red = mostly stale).
- List grouping: KnowledgeRows wrapped in topic group headers with collapse affordance, item count, and stale-item count per group.
- Triage / Curated tab switcher above the list in Main pane. Default to Triage when any items have `status === 'needs_human'`, else Curated.
- Triage view: items sorted by attention score (descending). Each row shows a one-line "Why now" reason under the title (e.g., "3 new observations since review", "contradicted by kb-c1", "unused for 2 cycles"). Reason text max 60 chars, truncated with ellipsis.
- Curation suggestion cards in Triage (e.g., "Merge these 3 items?", "No coverage for topic X in 2 cycles"). These are visually distinct from KnowledgeRows — action-oriented, not passive.
- Switching scope resets list selection and filters. Tab choice remembered in component state (not localStorage).
- `bun run test` + `bun run check` + `bun run lint` all green.

**Validation scenarios.**
- Given Knowledge submenu, when "Factory" scope selected, then only Factory-scoped items and topics shown.
- Given topic "Architecture" with 8 items (2 stale), when rendered, then group header shows "Architecture (8)" with amber health dot.
- Given 5 items with `needs_human` status, when Knowledge page loads, then Triage tab active by default.
- Given Triage view, when rendered, then items sorted by attention score with reason lines visible.

**Contracts / constraints.**
- Scope browser lives inside Submenu `children` — Submenu component unchanged.
- Attention scores and reason lines come from the API (server computes). Reason format: template-based string from backend, not computed in UI.
- KnowledgeRow component unchanged — grouping is a wrapper, not a modification.
- Curation cards are a new component only if their structure differs materially from KnowledgeRow. If they can be a variant, prefer that.

**Effort.** L (~5d)

---

### J7 — Knowledge Detail & Factory Scope

**Story.** As a founding team member, I want a rich Knowledge detail page (metadata bar, rendered markdown, observation logs, edit toggle for Practice/Product scope) and distinct Factory scope treatment (larger rows, version pill, "Amendable under review" banner, no inline edit), so that I can read, edit, and govern knowledge items effectively.

**Depends on.** J6.

**Acceptance criteria.**
- Detail page (read mode): metadata bar (kind Tag, status StatusChip, layer Tag, confidence indicator, timestamps, origin agent), markdown body rendered, observation log with facilitator-agent attribution in a gutter/sidebar.
- Detail page (edit mode): toggle via Edit button. In-place editing with textarea + markdown preview. Save/Cancel buttons. Edit mode only available when `scope !== 'factory'`. Unsaved changes stay in React state until Save.
- Factory scope list treatment: larger row height (`py-4` vs `py-2`), heavier font weight on titles (Space Grotesk bold, not serif), version pill on every row (e.g., "v2.1").
- Factory scope detail: "Amendable under review" banner (DaisyUI `alert-info`) above content when `status === 'needs_human'`. No Edit button — changes go through review (details of that workflow deferred).
- Related items sidebar on detail page (items with shared topic or explicit links).
- `bun run test` + `bun run check` + `bun run lint` all green.

**Validation scenarios.**
- Given Knowledge item with kind "decision" and status "active", when detail page renders, then metadata bar shows decision Tag + active StatusChip.
- Given Practice-scope item, when Edit button clicked, then textarea appears with current content. Cancel reverts without API call.
- Given Factory-scope item, when detail page renders, then no Edit button visible.
- Given Factory-scope item with `status === 'needs_human'`, when rendered, then "Amendable under review" banner at top.
- Given item with 3 observation log entries, when detail page renders, then all 3 entries shown with agent attribution.

**Contracts / constraints.**
- Markdown rendering: `react-markdown` (or equivalent). Sanitize HTML output.
- Edit mode is a React state toggle, not a separate route. URL stays the same.
- Factory version pill is a small `badge badge-neutral` showing version from `KnowledgeItem.version`.
- Observation log data shape must exist in the API response. If not yet available, render empty state with "No observations yet."

**Effort.** L (~5d)

---

### J8 — Synthesis Validation & Accessibility

**Story.** As a founding team member, I want the full design synthesis validated end-to-end — empty/loading/error states, keyboard navigation, screen reader support, responsive behavior at all breakpoints, and visual regression coverage — so that the app is production-quality after the synthesis adoption.

**Depends on.** J4, J5, J7.

**Acceptance criteria.**
- Playwright E2E suite: Settings overlay open/close, collapsed Rail pills, Triage tab switch, Knowledge edit toggle, scope browser navigation, Bet detail page load, PitchSelector detail pane, Reasoning block collapse/expand. Minimum 10 critical user flows.
- axe-core accessibility audit: zero violations at WCAG 2.1 AA level. Run via Playwright integration.
- Keyboard-only navigation: every interactive element reachable via Tab/Arrow/Enter/Esc. Focus indicators visible. Focus trap in Settings overlay verified.
- Empty states: Knowledge list (no items), Triage (nothing needs attention), Conversations (no threads), Work Portfolio (no products). Each shows a meaningful message, not a blank page.
- Loading states: skeleton loaders for thread list, knowledge list, work board, bet detail. DaisyUI `skeleton` component.
- Error states: API failure gracefully handled with retry affordance.
- Responsive: submenu collapses at <1024px, Rail expands at >=1280px. Settings overlay adapts to viewport. All verified in Playwright at multiple viewport sizes.
- Motion: transitions at 120/200/320ms (fast/medium/slow). No jarring layout shifts.
- `bun run test` + `bun run check` + `bun run lint` all green.

**Validation scenarios.**
- Given all E2E tests, when Playwright suite runs, then all pass.
- Given axe-core audit on every page, when run, then zero violations.
- Given keyboard-only navigation starting from page load, when Tab pressed repeatedly, then all interactive elements reachable in logical order.
- Given API failure on Knowledge list, when error state renders, then retry button visible and functional.
- Given viewport at 1000px wide, when Conversations page loads, then submenu collapsed.

**Contracts / constraints.**
- E2E tests live in `packages/web/e2e/` (or equivalent Playwright directory).
- axe-core integrated via `@axe-core/playwright`.
- Empty state messages should be helpful, not generic ("No knowledge items yet — agents will populate this as they learn" not "No data").
- Skeleton loaders match the shape of the content they replace (list skeletons for lists, card skeletons for cards).

**Effort.** M (~3d)

---
