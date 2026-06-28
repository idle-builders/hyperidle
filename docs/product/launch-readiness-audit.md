# HyperIdle Launch Readiness Audit

**Date:** 2026-06-05
**Commit:** `36dbb135`
**Methodology:** Three-pass audit — static code inventory, live application walkthrough (Playwright screenshots at `plans/Z8/screenshots/`), and test coverage mapping across 511 test files and 70 E2E specs.
**Auditor:** Z8 builder agent (automated)

---

## Executive Summary

| Category | Count |
|---|---|
| Launch-Ready | 53 |
| Built But Rough | 6 |
| Hidden Gem | 9 |
| Incomplete | 4 |
| Needs Wiring | 1 |
| **Total** | **73** |

**Overall readiness: 73% launch-ready.** The product has a solid structural foundation — all major routes exist, data flows through real APIs, and seed data demonstrates every view. The most prevalent gap category is "Launch-Ready" features with minor rough edges, not broken features. The 6 "Built But Rough" items are concentrated in error-message quality and notification persistence. The 9 Hidden Gems are features that exist but are not surfaced to users. The 4 Incomplete items are either deployment-mode-gated (Worker) or infrastructure gaps (notification dispatch, MCP bridge UI). The 1 "Needs Wiring" item (Session Dial-in) requires a UI connection to an existing backend capability.

**The 10 quick wins below represent ~12 developer-days of work that would shift 5–6 features from "Built But Rough" to "Launch-Ready" and make 3 of the 9 Hidden Gems discoverable.**

---

## Quick Wins

Ranked by (Impact × Severity) / Effort. All are 1–2 days of work.

### QW-1: Humanize error messages in team and bet error states

**Feature:** Work View — error states
**Effort:** 0.5 days | **Impact:** 5 | **Severity:** 5
**Problem:** `WorkTeam.tsx` and `WorkBet.tsx` display raw HTTP status codes to users (e.g., "Team fetch failed: 429"). Rate limiting and 5xx errors become confusing and alarming.
**Fix:** In `useTeam` and `useBet` hooks, map status codes to user-facing strings. 429 → "Too many requests — try again in a moment." 5xx → "Server error — please refresh." Never expose the numeric code in the UI. This is a < 1-hour code change.

### QW-2: Fix WorkTask "Task not found" — use EmptyState component

**Feature:** Work View — WorkTask not-found state
**Effort:** 0.5 days | **Impact:** 4 | **Severity:** 4
**Problem:** `WorkTask.tsx` renders a plain `<p>Task not found.</p>` for missing tasks. Every other page uses the `EmptyState` design-system component for this state.
**Fix:** Replace the plain text with `<EmptyState title="Task not found" description="No task exists at this ID." />`. One import, one JSX swap.

### QW-3: Notifications — wire toggles to a persistence endpoint

**Feature:** Settings > Notifications
**Effort:** 1.5 days | **Impact:** 4 | **Severity:** 4
**Problem:** Notification toggles (review requests, cost alerts, blocker alerts, email digests) are local-only React state. They reset on page refresh. The API `/api/settings` already returns `notifications` fields and PATCH exists.
**Fix:** On toggle change, call `PATCH /api/settings` with `{ notifications: { [key]: value } }`. Pre-fill from `GET /api/settings` on mount. The API is already wired — this is a UI integration task only.

### QW-4: Show "New bet" button in Work Portfolio when bets exist

**Feature:** Work View — portfolio bet creation CTA
**Effort:** 0.5 days | **Impact:** 5 | **Severity:** 3
**Problem:** The "New bet" CTA is hidden inside the EmptyState card and only shows when there are zero bets. Once a user has bets, the button vanishes from the header. They must scroll to find the creation path.
**Fix:** Move the "New bet" button to a persistent position in the portfolio header (top right), always visible regardless of bet count. Keep the EmptyState CTA as a secondary affordance for the zero-state.

### QW-5: Org Chart settings — investigate and fix the 429 / error-on-load failure

**Feature:** Settings > Org Chart
**Effort:** 1 day | **Impact:** 4 | **Severity:** 4
**Problem:** The live walkthrough showed the Org Chart settings section rendering an error state. The API (`GET /api/org`) returns 200 with valid data when called directly — the failure was triggered by rapid sequential Playwright navigation causing rate limiting. The root issue is that the UI has no retry or backoff logic; a 429 immediately triggers the error branch.
**Fix:** In `SettingsOrgChart.tsx`, add a simple retry with exponential backoff (one retry after 1 second). Since `loadOrg` is already in a `useCallback`, wrap the `apiFetch` call in a retry wrapper.

### QW-6: Model Gateway settings — same 429 / retry fix

**Feature:** Settings > Models
**Effort:** 1 day | **Impact:** 4 | **Severity:** 4
**Problem:** Same as QW-5. `SettingsModels.tsx` transitions immediately to "error" on any non-200 response including transient 429s.
**Fix:** Same retry-with-backoff pattern as QW-5. Additionally, the error state message uses `text-error` (a DaisyUI semantic class) rather than a Hearth semantic token — replace with `text-[var(--status-error)]` to maintain design system consistency.

### QW-7: Knowledge triage keyboard shortcuts — add a discoverable hint

**Feature:** Knowledge View — triage mode
**Effort:** 1 day | **Impact:** 5 | **Severity:** 3
**Problem:** The triage mode has excellent keyboard shortcuts (j/k navigate, v validate, x reject, Enter open) with a keyboard hint bar at the bottom of the screen. However, there is no way to discover that triage mode exists from the Knowledge list default (Curated) tab — the Triage tab only auto-activates when items need triage, but a new user visiting an empty triage queue would never see the hint bar.
**Fix:** Add a persistent "(Triage keyboard shortcuts)" label or tooltip to the Triage tab, visible in all states. This is a documentation affordance, not a new feature.

### QW-8: Add "new task" CTA to bet detail when task list is empty

**Feature:** Work View — bet task list empty state
**Effort:** 1 day | **Impact:** 4 | **Severity:** 3
**Problem:** The task list on a bet detail page shows an empty message when there are no tasks, but provides no CTA to create one. The task creation path is not discoverable from this surface.
**Fix:** Add an EmptyState component with a "Create task" button inside the task list section of `WorkBet.tsx` that opens the task creation flow. Check whether a task creation API and form already exist (the schema has tasks table and the server has task routes) — if so, this is wiring only.

### QW-9: Assistant overlay — add "close" affordance for non-power-users

**Feature:** Navigation & Shell — assistant overlay
**Effort:** 0.5 days | **Impact:** 3 | **Severity:** 4
**Problem:** The assistant overlay intentionally does not close on click-outside (this is a deliberate design decision per `@lore`). However, a new user encountering it for the first time has no obvious way to dismiss it. The overlay is 360px wide and overlaps content — users unfamiliar with the "click trigger button again" pattern will feel trapped.
**Fix:** Add a small "×" button in the top-right corner of the assistant overlay that closes it. Preserves the intentional "no click-outside close" behavior while adding a discoverable escape hatch.

### QW-10: Session Dial-in — connect "Dial in" button to real session URL

**Feature:** Conversations View — session dial-in
**Effort:** 2 days | **Impact:** 4 | **Severity:** 3
**Problem:** The "Dial in" button on conversations and task detail surfaces appears when active sessions are detected (`useSessionActivity`). The button is visible but depends on `latestSessionHarnessUrl` being set — in the seed data and typical dev setup, no session has a harness URL set, so the button renders but links nowhere (or is disabled).
**Fix:** Ensure the dial-in button is disabled (not hidden) when `harnessUrl` is null, with a tooltip: "Session running — no IDE connection available." When the URL is present, the button should navigate to it. Verify the `isValidHarnessUrl` utility correctly gates the button state.

---

## Hidden Gems

Features that are fully functional but fail discoverability. Each gets a surfacing recommendation.

### HG-1: Block Reference Embed

**Value:** Any message block in the system can be referenced by ID and rendered inline in any other thread. This enables cross-context knowledge linking that is more precise than hyperlinking.
**Why it's hidden:** There is no UI affordance in the Composer or block actions popover that explains how to create a block reference. The feature is fully wired (BlockRefEmbed, block actions popover, assistant overlay) but users must know the syntax `[[block-id]]` or use the assistant "Share" button — neither of which is labeled.
**Recommendation:** Add a "Copy block reference" option to the block actions popover with a label that says "Copy as reference — paste in any thread." Copy the `[[block-id]]` format to clipboard.

### HG-2: Knowledge Triage Keyboard Shortcuts

**Value:** j/k navigation, v to validate, x to reject — a full keyboard-driven triage workflow that is faster than any mouse-based equivalent.
**Why it's hidden:** The hint bar only appears in triage mode, which only activates automatically when items need triage. A user who manually navigates to the Triage tab finds the hints, but the auto-activation behavior means many users never encounter the keyboard workflow.
**Recommendation:** Pin a "?" keyboard shortcut indicator to the Triage tab header (always visible). On first visit, auto-open a one-shot tooltip: "Keyboard shortcuts: j/k navigate, v validate, x reject."

### HG-3: Artifact Permalink

**Value:** Every artifact has a stable permalink at `/artifacts/:id` that includes the artifact preview plus a discussion thread. This is a shareable, deep-linkable artifact page.
**Why it's hidden:** No UI surface links to artifact permalinks with a "Share" or "Copy link" affordance. The ArtifactSection on bet detail shows a list of artifacts but does not offer a "Open permalink" action. Users who want to share an artifact must know to construct the URL manually.
**Recommendation:** Add a "Copy permalink" icon button to each artifact card in ArtifactSection. On click, copy `window.location.origin + '/artifacts/' + artifactId` to clipboard and show a toast "Permalink copied."

### HG-4: Assistant Thread (L21)

**Value:** A persistent AI companion thread in the Conversations view that provides context-aware assistance, routing through the assistant overlay's thread shell.
**Why it's hidden:** There is no visible entry point to the assistant thread from the Conversations list. The assistant overlay contains the assistant thread but is labeled in a way that suggests "context attachment" rather than "talk to your assistant." First-time users do not discover it.
**Recommendation:** Add a persistent "Assistant" item to the Sidebar under Conversations, below "New thread." This provides a direct entry point. The assistant overlay can remain for context attachment — it does not need to be the only entry.

### HG-5: Routine Scheduler

**Value:** The system runs 5 built-in routines (cost watchdog, practice meeting, post-bet retro, portfolio retro, knowledge decay) automatically. These are the backbone of the "AI-first" workflow — the system does work without being asked.
**Why it's hidden:** No UI surface shows the routine scheduler or its status. The `/api/routines` endpoint returns all routines with their schedule, last-run, and next-run — but this data is never displayed to users. Users have no visibility into what the system is doing autonomously.
**Recommendation:** Add a "Routines" sub-section to Settings (or a dedicated /work/routines route) that lists active routines, their schedule, and last-run time. A read-only table is sufficient for launch.

### HG-6: Block Anchored Comments (T5)

**Value:** In Knowledge detail view, users can anchor a comment to a specific text block and have a threaded discussion attached to that precise location. More precise than page-level comments.
**Why it's hidden:** The block actions popover (Discuss + Share) appears on hover over text blocks in the knowledge body, but only in the assistant overlay view. There is no visible affordance in the knowledge detail reading view that suggests hovering over text reveals actions.
**Recommendation:** Add a subtle margin indicator (a faint `+` icon) that appears on text block hover in the knowledge body even outside the assistant overlay context. This telegraphs the block interaction model to new users.

### HG-7: Global Search (Cmd+K)

**Value:** Cross-type search across conversations, bets, and knowledge items with keyboard navigation. Fast, functional, and searches real data.
**Why it's hidden:** The Cmd+K shortcut is listed in the sidebar bottom section next to the search icon, but the icon has no label ("Search") that would prompt a new user to click or try the shortcut. The affordance text "⌘K" is small and tertiary-colored.
**Recommendation:** Make the sidebar search area a clickable button that also opens the panel (in addition to Cmd+K). Add the label "Search everything" next to the icon. This is a 30-minute change with high discoverability ROI.

### HG-8: Assistant Overlay

**Value:** The assistant overlay attaches a structured context thread to any page, letting agents and humans build a chain of custody for work items. Precise for knowledge-transfer and audit trails — every decision can be traced to the block and thread where it was made.
**Why it's hidden:** The trigger button at the bottom of the sidebar is unlabeled — it shows an icon only. Users do not know what it does until they click it. The assistant overlay is not communicated anywhere in the UI.
**Recommendation:** Add a label "Assistant" below the trigger button. On first activation, show a one-shot tooltip: "Talk to your assistant — attach context to your work."

### HG-9: Git Export

**Value:** `GET /api/git-export` exports the current knowledge base as a git-compatible snapshot. For teams that want to version-control their knowledge, this gives them a durable, diff-able history of everything the system knows.
**Why it's hidden:** API-only. No UI surface mentions git export or provides a button to trigger it.
**Recommendation:** Add a "Export knowledge to Git" button to Settings > Backend, calling `GET /api/git-export`. Show the export path in a toast. This is a one-endpoint call — 1 day of work.

---

## Feature Inventory by Area

---

### 1. Conversations View

#### Thread List

**Category:** Launch-Ready
**UI Path:** Sidebar > Conversations
**Discoverability:** 5 — first view on load
**Test Coverage:** `conversations.spec.ts`, `threads.spec.ts`, `Conversations.test.tsx`, `AppShell.threads.test.tsx`

**What works:** Thread list renders with all/blocking/unread filter chips. Empty state shows "Start a thread" CTA. Blocking and Unread chips appear contextually when relevant. Sub-menu items show recent threads (max 5) in the sidebar.
**What's rough:** Sub-menu items in the sidebar show raw thread IDs as labels when the thread has no subject. This makes the sidebar navigation feel developer-facing.
**Recommendation:** Truncate thread display names to the first 40 chars of the latest message body when no explicit subject exists.

#### Thread Detail / Message View

**Category:** Launch-Ready
**UI Path:** Sidebar > Conversations > [thread]
**Discoverability:** 5
**Test Coverage:** `Conversations.test.tsx`, `CommentRow.test.tsx`, `CommentRow.richVariant.test.tsx`, `thread-response.spec.ts`, `threads.spec.ts`

**What works:** Loads thread with full message history. Rich message rendering works (markdown, code blocks). Loading spinner while fetching. Error state on 404/5xx. Reply composer at bottom.
**What's rough:** Long threads have no pagination or virtual scroll — very long threads will cause rendering performance issues.
**Recommendation:** Document the scroll truncation limit. Add a "Load earlier messages" lazy-load trigger when thread length exceeds 50 messages.

#### Message Composition (Composer)

**Category:** Launch-Ready
**UI Path:** Sidebar > Conversations > [thread] > bottom input
**Discoverability:** 5
**Test Coverage:** `Composer.test.tsx`, `Conversations.dispatch.test.tsx`, `thread-response.spec.ts`

**What works:** Text input, Submit on Enter (Shift+Enter for newline), sends via POST /api/threads/:id/messages. Disabled while sending. Recipient targeting in DMs.
**What's rough:** No character count indicator. No attachment affordance.
**Recommendation:** None blocking launch. Consider adding a character count at 500+ chars.

#### Direct Message Creation (RecipientPicker)

**Category:** Launch-Ready
**UI Path:** Sidebar > Conversations > New thread button
**Discoverability:** 3 — button only visible when in Conversations view
**Test Coverage:** `RecipientPicker.stories.tsx` (Storybook), `q1-new-dm-thread.spec.ts`

**What works:** RecipientPicker opens a modal to select participants. Fetches from `/api/recipients`. Filters by name. Creates thread on submit.
**What's rough:** "New thread" button is not present in empty state — only the EmptyState CTA. If a user dismisses the EmptyState by creating a thread, then wants another, they must find the header button.
**Recommendation:** Keep "New thread" button permanently in Conversations header, not just in the EmptyState card.

#### Rich Message Rendering

**Category:** Launch-Ready
**UI Path:** Sidebar > Conversations > [thread] > any agent message
**Discoverability:** 4
**Test Coverage:** `CommentRow.richVariant.test.tsx`, `CommentRow.markdown.test.tsx`, `L11-rich-messages.spec.ts`

**What works:** Full markdown rendering (bold, italic, code, lists, tables). Syntax highlighting. TOON codec decoded.
**What's rough:** Tables overflow their container on narrow viewports.
**Recommendation:** Add `overflow-x-auto` wrapper around table renders. 30-minute fix.

#### Reasoning Block View

**Category:** Launch-Ready
**UI Path:** Sidebar > Conversations > [thread] > agent message with reasoning
**Discoverability:** 2 — only visible when agents emit reasoning
**Test Coverage:** `Conversations.reasoning.test.tsx`, `ReasoningBlockView.stories.tsx`

**What works:** Collapsible reasoning block with "Thinking…" header. Renders extended thinking content from Claude API. Toggles open/closed.
**What's rough:** Collapsed state height is always the same regardless of reasoning length — users have no hint of how much content is inside before expanding.
**Recommendation:** Show a truncated preview line ("Analyzed 3 options…") in the collapsed state using the first sentence of the reasoning.

#### Assistant Thread (L21)

**Category:** Hidden Gem
**UI Path:** No direct entry point — only via assistant overlay
**Discoverability:** 1
**Test Coverage:** (see HG-4 above)

See Hidden Gems section HG-4.

#### Session Dial-in (Q1)

**Category:** Needs Wiring
**UI Path:** Conversations > [thread with active session] > "Dial in" button | Work > Task Detail > Sessions section > "Dial in" button
**Discoverability:** 3 — button appears contextually when a session is active
**Test Coverage:** `q1-session-dial-in.spec.ts`, `SessionActivityPanel.test.tsx`, `useSessionActivity.test.tsx`, `TaskSheet.session.test.tsx`

**What works:** `useSessionActivity` hook polls the session activity stream via WebSocket. `SessionActivityPanel` renders the activity feed alongside message history. The "Dial in" button appears when `useSessionActivity` detects an active session (`latestSessionHarnessUrl` check). Observe mode is read-only.
**What's rough:** Button renders but links nowhere when `harnessUrl` is null — in seed data and typical dev setup, no session has a harness URL set. See QW-10 for the fix.
**Recommendation:** See QW-10.

#### Assistant Overlay

**Category:** Built But Rough
**UI Path:** Sidebar > bottom icon button > assistant overlay opens
**Discoverability:** 2
**Test Coverage:** `CocOverlay.test.tsx` (being rebuilt as `AssistantOverlay` in AD8b), `CocOverlay.block-ref.test.tsx`, `L21-coc-overlay.spec.ts`

**What works:** Opens a 360px-wide thread shell anchored to the trigger. Thread shell in "assistant" configuration. Block reference support. Does not close on click-outside (intentional).
**What's rough:** No close affordance for new users (see QW-9). Trigger button is unlabeled. The assistant framing is not communicated in any visible UI text.
**Recommendation:** See QW-9 and HG-8.

---

### 2. Work View

#### Portfolio / Bet Grid

**Category:** Launch-Ready
**UI Path:** Sidebar > Work > Portfolio
**Discoverability:** 5
**Test Coverage:** `WorkPortfolio.test.tsx`, `BetCard.test.tsx`, `BetCard.portfolio.test.tsx`, `work.spec.ts`, `work-surface.spec.ts`

**What works:** 2-column bet grid with BetCard components. Status filter pills (All/Active/Completed/Draft). Team filter pills. EmptyState with "New bet" CTA when empty. Loads real seed data.
**What's rough:** "New bet" button disappears when bets exist (see QW-4).
**Recommendation:** See QW-4.

#### Team Drill-Down

**Category:** Launch-Ready
**UI Path:** Sidebar > Work > [team name]
**Discoverability:** 4 — team links visible in sidebar
**Test Coverage:** `WorkTeam.AB3.test.tsx`, `work-surface.spec.ts`, `L13-product-drilldown.spec.ts`

**What works:** Team header with name, status chip. Burn vs cap progress bar. Active bets section with empty state. Roster section. ArtifactSection. 404 and generic error states handled.
**What's rough:** Error state message exposes raw HTTP status code when rate-limited (see QW-1).
**Recommendation:** See QW-1.

#### Bet Detail Page

**Category:** Launch-Ready
**UI Path:** Sidebar > Work > Portfolio > [bet card]
**Discoverability:** 4
**Test Coverage:** `WorkBet.test.tsx`, `WorkBet.detail.test.tsx`, `WorkBet.pitch.test.tsx`, `bet-thread.spec.ts`, `L16-bet-pitch.spec.ts`

**What works:** Stat cards (progress, budget, team). Pitch section (editable for draft/active bets, read-only for completed/killed). Task list (flat rows, clickable). Overflow menu with bet lifecycle actions. ArtifactSection. Discussion thread (HostThreadSection). Artifact thread summary. ConsequencePreviewDialog before destructive actions.
**What's rough:** Task list has no empty state CTA (see QW-8).
**Recommendation:** See QW-8.

#### Bet Description Editing

**Category:** Launch-Ready
**UI Path:** Work > Bet Detail > Pitch section (click to edit, autosave)
**Discoverability:** 3 — editable only in draft/active state, no edit icon
**Test Coverage:** `WorkBet.pitch.test.tsx`, `bet-description-edit.spec.ts`, `L16-bet-pitch.spec.ts`

**What works:** TipTap BodyEditor with autosave on blur. Blocks rendered via BodyEditor for edit, BetPitch for viewing in completed/killed state. Title editing inline.
**What's rough:** No explicit "edited" indicator or timestamp after saves. New users may not realize the pitch is editable — there is no pencil icon or hover cue in view mode.
**Recommendation:** Add a subtle pencil icon on hover in view mode over the pitch section to signal editability.

#### Bet Creation Dialog

**Category:** Launch-Ready
**UI Path:** Work > Portfolio > "New bet" (empty state) or header button
**Discoverability:** 3 — only easy to find in empty state
**Test Coverage:** `BetCreateDialog.test.tsx`, `Q3-bet-creation.spec.ts`

**What works:** Modal dialog with title, team selection, appetite (size/time). Creates bet via POST /api/bets. Navigates to new bet detail on success.
**What's rough:** No validation feedback on field errors (just disabled submit button).
**Recommendation:** Add inline validation messages on blur for required fields.

#### Bet Lifecycle Actions

**Category:** Launch-Ready
**UI Path:** Work > Bet Detail > overflow menu (Activate, Pause, Kill, Resume, Adjust appetite, Unblock)
**Discoverability:** 3 — hidden behind overflow menu
**Test Coverage:** `WorkBet.test.tsx`, `L14-bet-actions.spec.ts`, `lifecycle-propagation.spec.ts`

**What works:** Full state machine (draft → active → paused → completed/killed). ConsequencePreviewDialog shows downstream impact before destructive transitions. Correct action subset shown per current state.
**What's rough:** Overflow menu is the only entry point — a first-time user on a draft bet has no primary CTA to "Start" it. The most important action is the least prominent.
**Recommendation:** Surface the primary lifecycle action as a visible button outside the overflow menu (e.g., "Activate" button on a draft bet header).

#### Task List on Bet

**Category:** Built But Rough
**UI Path:** Work > Bet Detail > task list section
**Discoverability:** 4 — visible on the page
**Test Coverage:** `WorkBet.test.tsx` (list rendering), `W3-task-detail.spec.ts`

**What works:** Flat task rows with owner, status chip, clickable to open TaskSheet. Status dots for in-progress tasks.
**What's rough:** No empty state CTA (see QW-8). No way to create a task from this surface.
**Recommendation:** See QW-8.

#### Task Detail / TaskSheet

**Category:** Launch-Ready
**UI Path:** Work > Bet Detail > task row > click → right-side drawer
**Discoverability:** 3 — sheet drawer not obviously a sheet to new users
**Test Coverage:** `TaskSheet.stories.tsx`, `L15-task-request.spec.ts`, `W3-task-detail.spec.ts`, `task-thread.spec.ts`

**What works:** Slide-in drawer with task metadata (owner, status, started, cost, sessions count). Sessions section with active/completed counts and "Dial in" button. Discussion thread (HostThreadSection inline). ArtifactSection.
**What's rough:** Deprecated props (`resolveThreadId`, `postRequest`, `onNavigateToThread`) still in the interface — dead weight.
**Recommendation:** Remove deprecated props in the next TaskSheet refactor. Document "Dial in" button behavior per QW-10.

#### Cost and Token Tracking Display

**Category:** Launch-Ready
**UI Path:** Work > Bet Detail > stat cards; Work > Task Detail > cost field
**Discoverability:** 4 — visible on both surfaces
**Test Coverage:** `L17-money-web.test.tsx`, `L17-cost-tokens.spec.ts`, `artifact-cost-pending.spec.ts`

**What works:** Budget vs spend progress bar on bet. Token counts (input/output) on session artifacts. Cost formatted in user currency. ArtifactCostChip shows spend for completed sessions.
**What's rough:** No running total visible on the Task detail header — only per-session cost is shown.
**Recommendation:** Add a "Total cost" aggregation to the TaskSheet metadata strip that sums across all sessions for that task.

#### Lifecycle Propagation

**Category:** Launch-Ready
**UI Path:** Automatic (backend-driven, visible via status updates in UI)
**Discoverability:** 2 — no user action, status changes appear as UI updates
**Test Coverage:** `lifecycle-propagation.spec.ts`, `lifecycle-propagation.test.ts` (server)

**What works:** Session completion → task state update → bet state update cascade. Propagation log written to DB. Status chips update in UI after propagation.
**What's rough:** No visible notification or feed of propagation events to the user. State changes appear silently in the UI without explanation.
**Recommendation:** When a bet transitions automatically (not by user action), show a toast: "Bet 'X' auto-completed — all tasks finished." Wire to the notification dispatch already in the server.

---

### 3. Knowledge View

#### Knowledge List with Scope Pills

**Category:** Launch-Ready
**UI Path:** Sidebar > Knowledge
**Discoverability:** 5
**Test Coverage:** `KnowledgeList.test.tsx`, `KnowledgeRow.factory.test.tsx`, `knowledge.spec.ts`, `knowledge-ia.spec.ts`

**What works:** Curated/Triage tab toggle. Scope pills (All + dynamic per-item scopeKind). Sort bar (Relevance/Recency/Frequency). Populates with seed data. Auto-tabs to Triage when items need triage.
**What's rough:** Scope pills are derived dynamically from loaded items — if the list is empty, no pills appear. There is no "All" pill visible on first load before data arrives.
**Recommendation:** Eagerly render the "All" pill even before data loads (it's always valid). Show scope pills in a skeleton state while loading.

#### Knowledge List with Topic Groups

**Category:** Launch-Ready
**UI Path:** Sidebar > Knowledge > (populated, auto-grouped)
**Discoverability:** 3 — only appears when items exist and have topic metadata
**Test Coverage:** `KnowledgeTopicGroup.stories.tsx`, `knowledge-ia.spec.ts`

**What works:** Items grouped by topic when `topicGroupId` is populated. KnowledgeTopicGroup component collapses/expands groups. Smooth interaction.
**What's rough:** Topic groups only appear when fabric has run context assembly — seed data may not trigger grouping, so most users see a flat list.
**Recommendation:** Add a tooltip or info chip: "Items are grouped by topic after AI curation" to explain why the list might be flat initially.

#### Knowledge Search / Filter

**Category:** Launch-Ready
**UI Path:** Sidebar > Knowledge > search input at top
**Discoverability:** 4
**Test Coverage:** `knowledge.spec.ts`, `knowledge-ia.spec.ts`, `AppShell.knowledge-submenu.test.tsx`

**What works:** Text search filters the list in real time. Scope pills filter by source (bet, team, etc.). Sort toggles work. Combined filter+sort works.
**What's rough:** No "clear filters" affordance when multiple filters are active. Users must manually click each pill back to "All" and clear the search input.
**Recommendation:** Add a "Clear filters" link that appears when any non-default filter is active.

#### Knowledge Triage (Y4)

**Category:** Hidden Gem
**UI Path:** Sidebar > Knowledge > Triage tab > keyboard shortcuts (j/k, v, x)
**Discoverability:** 2
**Test Coverage:** `KnowledgeList.y4-triage.test.tsx`, `KnowledgeList.j8.test.tsx`, `knowledge-ia.spec.ts`

See Hidden Gems section HG-2 and QW-7.

#### Knowledge Detail (View Mode)

**Category:** Launch-Ready
**UI Path:** Sidebar > Knowledge > [item]
**Discoverability:** 5
**Test Coverage:** `KnowledgeDetail.factory.test.tsx`, `KnowledgeDetail.related.test.tsx`, `knowledge-detail.spec.ts`, `knowledge-thread.spec.ts`

**What works:** Title, body (rendered markdown), kind badge, scope badge, status chip. Related items sidebar. HostThreadSection for discussion. Block anchored comment popover. Signals display (frequency, recency).
**What's rough:** Kind badge and scope badge use raw enum values ("pattern", "bet") without capitalizing or humanizing the label.
**Recommendation:** Capitalize enum values in display (e.g., "Pattern", "Bet"). One-line change in display logic.

#### Knowledge Body Editing (L23, TipTap)

**Category:** Launch-Ready
**UI Path:** Sidebar > Knowledge > [item] > Edit body button
**Discoverability:** 3 — edit button not obvious in view mode
**Test Coverage:** `W3-knowledge-edit.spec.ts`, `knowledge-edit.spec.ts`, `l23-knowledge-body.spec.ts`

**What works:** TipTap BodyEditor with autosave, block toolbar, heading/paragraph/list formatting. Saves via PATCH /api/knowledge/:id.
**What's rough:** No visual distinction between view and edit modes — the body looks the same in both states. Users may not realize they are editing vs viewing.
**Recommendation:** Add a subtle border or background change to the body area in edit mode (e.g., `border border-[var(--border-default)] rounded-[var(--r-subtle)]`).

#### Knowledge Create (Q2)

**Category:** Launch-Ready
**UI Path:** Sidebar > Knowledge > "+" button at top of list
**Discoverability:** 3 — "+" button in knowledge sidebar header is small
**Test Coverage:** `KnowledgeCreateDialog.test.tsx`, `knowledge-q2-create.spec.ts`

**What works:** Full-page create at `/knowledge/new`. Title (required), body (TipTap, required), kind selector, scope kind + ID. Create button disabled until title + body non-empty.
**What's rough:** Navigates to a new full-page route (`/knowledge/new`) — in a tool that uses a sidebar + main layout, a full-page create breaks the app shell and can disorient users.
**Recommendation:** Consider a slide-over or modal for creation to keep the shell visible. This is a larger UX change — raise as a design decision.

#### Knowledge Scope Change

**Category:** Built But Rough
**UI Path:** Knowledge Detail > scope badge > click → scope change dialog
**Discoverability:** 2 — scope badge looks read-only
**Test Coverage:** `knowledge-detail.spec.ts` (partial — scope change tested but underpowered)

**What works:** Clicking the scope badge in knowledge detail opens a scope change dialog. Calls PATCH /api/knowledge/:id with new scope.
**What's rough:** Scope badge has no hover affordance (cursor, underline, or "edit" icon) indicating it is interactive. Users will not attempt to click it.
**Recommendation:** Add `cursor-pointer` and a subtle hover state (background color change) to the scope badge in detail view. Add a pencil icon on hover.

#### Curation Suggestion Cards

**Category:** Hidden Gem
**UI Path:** Knowledge Detail > related items sidebar (when suggestions are generated)
**Discoverability:** 2 — only appears when fabric produces suggestions
**Test Coverage:** `CurationSuggestionCard.test.tsx`, `CurationSuggestionCard.stories.tsx`

**What works:** Card shows a knowledge item with confidence score and "Accept" / "Reject" actions. Accepts/rejects via API. Clean design.
**Why it's hidden:** Curation suggestions only appear after the knowledge fabric runs context assembly and promotion pipeline. On a fresh install with seed data, no suggestions are generated. Users who never see the fabric run will never encounter this component.
**Recommendation:** Add a "Suggested items" section to the Knowledge List (not just Detail) that shows top-scored suggestions globally. Also show a sample card in the onboarding tour.

---

### 4. Navigation & Shell

#### Sidebar Navigation

**Category:** Launch-Ready
**UI Path:** Left rail — always visible
**Discoverability:** 5
**Test Coverage:** `Sidebar.test.tsx`, `W3-sidebar.spec.ts`, `navigation.spec.ts`

**What works:** Three sections (Conversations, Work, Knowledge). Recent threads (max 5) in Conversations sub-items. Team sub-items in Work. Knowledge count badge when triage items exist. User avatar + "Assistant" label at bottom. Search icon + Cmd+K hint.
**What's rough:** Sidebar does not respond to keyboard focus within sub-items consistently on all screen sizes.
**Recommendation:** Verify sidebar keyboard navigation with Tab and arrow keys (the `keyboard-nav.spec.ts` test exists but may not cover sidebar sub-items).

#### Global Search (Cmd+K)

**Category:** Hidden Gem
**UI Path:** Cmd+K keyboard shortcut | Sidebar > Search icon
**Discoverability:** 2 — icon unlabeled, shortcut not obvious
**Test Coverage:** `GlobalSearchPanel.test.tsx`, `GlobalSearchPanel.cmdk.test.tsx`, `global-search.spec.ts`

See Hidden Gems section HG-7.

#### Setup Flow / First Run

**Category:** Launch-Ready
**UI Path:** `/setup` — shown to new users before any data exists
**Discoverability:** 5 — automatic redirect for new users
**Test Coverage:** `SetupFlow.test.tsx`, `FirstRunRedirect.P4.test.tsx`, `FirstRunRedirect.R2.test.tsx`, `setup-flow.spec.ts`, `R2-work-first-landing.spec.ts`

**What works:** Clean single-scroll form at `/setup`. Name (required), Anthropic API key (required), repo path (optional). Creates user + team on submit. Navigates to `/work/portfolio` on success. No AppShell chrome (correct for onboarding).
**What's rough:** API key field has no "show/hide" toggle — password field only. Users cannot verify they typed the key correctly.
**Recommendation:** Add a show/hide toggle to the API key input (eye icon). Standard pattern, 1-hour implementation.

#### First-Run Redirect

**Category:** Launch-Ready
**UI Path:** `/` root → redirects to `/setup` or `/conversations` depending on state
**Discoverability:** 5 — transparent to user
**Test Coverage:** `FirstRunRedirect.P4.test.tsx`, `FirstRunRedirect.R2.test.tsx`

**What works:** Checks if setup is complete via `/api/users`. If no user, redirects to `/setup`. If user exists, redirects to `/conversations`.
**What's rough:** No loading state during the redirect check — a brief blank white screen is visible.
**Recommendation:** Show a centered spinner or the app logo during the redirect check (< 500ms, but visible on slow connections).

#### Settings Overlay

**Category:** Launch-Ready
**UI Path:** User avatar (bottom of sidebar) → Settings opens as slide-over panel
**Discoverability:** 3 — avatar as settings trigger is non-obvious
**Test Coverage:** `AppShell.settings-overlay.test.tsx`, `AppShell.P4-settings.test.tsx`, `settings-overlay.spec.ts`, `settings.spec.ts`, `settings-redesign.spec.ts`

**What works:** Full-height settings panel slides in from the left. Section navigation rail. Back button. All 8 section components render. URL-driven section navigation (`?settings=open&section=X`).
**What's rough:** Avatar as settings trigger is non-obvious. No tooltip or label on the avatar button.
**Recommendation:** Add a tooltip "Settings" on the avatar button. Or add "Settings" text next to the avatar in the sidebar bottom section.

#### Theme Switching (Appearance)

**Category:** Launch-Ready
**UI Path:** Settings > Appearance
**Discoverability:** 3 — requires navigating to Settings
**Test Coverage:** `theme-persistence.spec.ts`, `SettingsAppearance` (visual tests)

**What works:** Three visual swatch cards (Light, Dark, System). Clicking sets the theme immediately. Persists to localStorage via useTheme. System option follows OS preference.
**What's rough:** Theme preference is stored in localStorage only — if user switches browsers or devices, preference resets.
**Recommendation:** Persist theme preference to `PATCH /api/settings` so it follows the user across devices. The settings API already has a structure for user preferences.

#### Toast Notifications

**Category:** Launch-Ready
**UI Path:** Appears on successful/failed operations throughout the app
**Discoverability:** 5 — shown automatically
**Test Coverage:** `ToastRegion.stories.tsx`, `AppShell.test.tsx`

**What works:** Bottom-right toast region. Auto-dismisses after ~3s. Used consistently across Profile, OrgChart, Agent, BetCreateDialog, etc.
**What's rough:** No way to dismiss a toast manually. If a toast fires just before user navigates, it persists on the new page.
**Recommendation:** Add an "×" dismiss button to each toast. 30-minute change.

#### Error Boundary + 404 Page

**Category:** Launch-Ready
**UI Path:** Any invalid route → `/404`; any component crash → ErrorBoundary overlay
**Discoverability:** 5 — automatic on error
**Test Coverage:** `ErrorBoundary.test.tsx`, `NotFound.stories.tsx`, `error-resilience.spec.ts`

**What works:** 404 page shows clean "Page not found" EmptyState card without AppShell chrome. ErrorBoundary catches component crashes and renders a fallback.
**What's rough:** ErrorBoundary fallback does not offer a "Report this bug" action or a clear recovery path (only "Refresh").
**Recommendation:** Add a "Go to home" link to the ErrorBoundary fallback UI. One line of JSX.

#### Keyboard Navigation

**Category:** Launch-Ready
**UI Path:** Throughout the app (Tab, Shift+Tab, Enter, Escape, J/K in triage)
**Discoverability:** 3 — only in triage, shortcuts are listed; elsewhere, standard browser navigation
**Test Coverage:** `keyboard-nav.spec.ts`, `keyboard-and-responsive.spec.ts`, `useKeyboardNavigation.test.ts`, `accessibility.spec.ts`, `accessibility-K8.spec.ts`

**What works:** Tab navigation through sidebar, settings, forms. J/K in knowledge triage. Enter/Escape on dialogs. Focus trap in settings overlay and dialogs.
**What's rough:** Modal dialogs (BetCreateDialog, ConsequencePreviewDialog) do not always return focus to the trigger element on close.
**Recommendation:** Verify focus restoration in all dialogs via the existing accessibility spec. Extend `accessibility-K8.spec.ts` to include dialog focus return.

---

### 5. Settings

#### Profile

**Category:** Launch-Ready
**UI Path:** Settings > Profile
**Discoverability:** 4 — first section in settings
**Test Coverage:** `SettingsProfile.test.tsx`, `settings.spec.ts`

**What works:** Name and email inputs pre-filled from API. Dirty tracking (Save only enabled when changed). PATCH /api/users/:id on save. Toast on success/failure.
**What's rough:** Email field accepts any string — no format validation.
**Recommendation:** Add `type="email"` validation pattern (HTML5 native). Already set to `type="email"` — check if the form submission validates it.

#### Org Chart

**Category:** Built But Rough
**UI Path:** Settings > Org Chart
**Discoverability:** 3
**Test Coverage:** `SettingsOrgChart` (unit tests implied from spec stories), `X3-agent-config.spec.ts` (adjacent)

**What works:** Fetches org edges from `/api/org`. Table of edges (From | Mechanism | Target | Delete). Inline add form with context-aware target selector (direct → user select, team → team select, function → free text). Inline error display.
**What's rough:** Error state immediately shown when 429 occurs (no retry). In the live walkthrough, this section showed the error state during rapid navigation (see QW-5).
**Recommendation:** See QW-5.

#### Models (X4)

**Category:** Built But Rough
**UI Path:** Settings > Models
**Discoverability:** 3
**Test Coverage:** `SettingsModels.stories.tsx`, `settings.spec.ts` (partial)

**What works:** Three tier rows (reasoning, workhorse, fast). Provider select + model select/input per tier. Credential status dot for anthropic/openrouter. Auto-save with 500ms debounce. openai-compatible shows baseUrl + apiKey fields.
**What's rough:** Error state shown on 429 with no retry (see QW-6). `text-error` class instead of Hearth `--status-error` token.
**Recommendation:** See QW-6.

#### Appearance

**Category:** Launch-Ready
**UI Path:** Settings > Appearance
**Discoverability:** 3
**Test Coverage:** `theme-persistence.spec.ts`

**What works:** Three swatch cards (Light, Dark, System). Visual swatch preview using fixed hex values (intentional — CSS vars resolve to current theme). Aria-pressed state. Immediate theme switch. Toast feedback.
**What's rough:** Theme preference is localStorage-only (see Theme Switching recommendation above).
**Recommendation:** See Theme Switching section.

#### Credentials

**Category:** Launch-Ready
**UI Path:** Settings > Credentials
**Discoverability:** 3
**Test Coverage:** `CredentialsTab.stories.tsx`, `settings.spec.ts`

**What works:** Shows credential status for anthropic_api_key, openrouter_api_key, shared_backend_key (absent/present/error state). POST to set, DELETE to remove. Consistent with `/api/credentials` schema.
**What's rough:** "Absent" state badge looks the same as "error" badge to users — both render in a warning-colored state.
**Recommendation:** Differentiate "absent" (neutral, expected) from "error" (invalid, action needed). Use `--text-tertiary` for absent, `--status-error` for error.

#### Notifications

**Category:** Built But Rough
**UI Path:** Settings > Notifications
**Discoverability:** 3
**Test Coverage:** `SettingsNotifications` (no dedicated test file found)

**What works:** Four Toggle components (review requests, cost alerts, blocker notifications, email digests). Clean design using the design-system Toggle component.
**What's rough:** Local state only — no persistence (see QW-3). No test file for this component.
**Recommendation:** See QW-3. Add a `SettingsNotifications.test.tsx` verifying toggle state changes and mock the API call.

#### Teams

**Category:** Launch-Ready
**UI Path:** Settings > Teams
**Discoverability:** 3
**Test Coverage:** `team-management.test.ts` (server), `settings.spec.ts`

**What works:** Fetches teams from `/api/settings`. Lists teams with active/inactive status. (Specific team CRUD operations handled via the Teams API, not directly from Settings UI.)
**What's rough:** No "Create team" affordance in the Settings Teams section — teams are created during setup only.
**Recommendation:** Add a "Create team" button to Settings > Teams that opens a minimal team creation dialog.

#### Backend

**Category:** Launch-Ready
**UI Path:** Settings > Backend
**Discoverability:** 2 — only useful context in electron or shared mode
**Test Coverage:** `settings.spec.ts`

**What works:** Shows current backend mode (Local or Shared) as a text label. Shows platform string from the electron bridge when available. Falls back gracefully to "Local (laptop)" in web mode.
**What's rough:** Electron-gated features (mode switching) are not exposed — the UI correctly hides them in web mode, but the section provides minimal value in that context.
**Recommendation:** In web mode, add a hint explaining what "shared mode" enables and how to switch. This helps users understand the deployment model.

#### Worker (S4)

**Category:** Incomplete
**UI Path:** Settings > Worker (filtered from nav in non-shared-mode)
**Discoverability:** 1 — hidden from navigation in most contexts
**Test Coverage:** `SettingsWorker.stories.tsx`, `desktop-worker-client.test.ts` (desktop package)

**What works:** Renders graceful "requires desktop app" or "requires shared backend mode" messages in non-electron contexts. Full worker toggle, connection badge, and pause/resume present for shared-mode electron.
**What's rough:** The nav item is filtered out in `SETTINGS_SECTIONS` for non-shared-mode, making it unreachable for most users. The feature is Electron + shared-mode only.
**Recommendation:** This is by design — document as "Phase 2 deployment mode feature." Not a quick win.

#### Agents (X3)

**Category:** Launch-Ready
**UI Path:** Settings > Agents
**Discoverability:** 2 — settings section, non-obvious
**Test Coverage:** `SettingsAgents.stories.tsx`, `X3-agent-config.spec.ts`, `settings.spec.ts`

**What works:** Table of agents (Name, Role, Harness, Model Tier, Sessions, Actions). Inline edit form expands below selected agent. Add agent form with role selection + template system prompt fetch. Two-click delete with 3-second auto-revert. Keyboard Escape closes forms.
**What's rough:** Section is not surfaced from the SETTINGS_SECTIONS public array — it is rendered but may not be linked from the settings nav by default.
**Recommendation:** Verify that the Agents section appears in the settings nav for all user roles. Add to the public SETTINGS_SECTIONS array if missing.

---

### 6. Artifacts

#### Artifact Section on Bet Detail

**Category:** Launch-Ready
**UI Path:** Work > Bet Detail > Artifacts section
**Discoverability:** 4
**Test Coverage:** `ArtifactSection.stories.tsx`, `artifact-aggregation.spec.ts`, `bet-artifact-thread-summary.spec.ts`

**What works:** Lists artifacts attached to the bet with preview thumbnails, cost chip, kind badge. Clicking opens ArtifactView. Links to artifact permalink.
**What's rough:** Gallery grid is a fixed 2-column layout regardless of artifact count — a single artifact occupies a full-width card.
**Recommendation:** For single artifacts, render a single full-width row instead of a grid. CSS: `grid-cols-1 sm:grid-cols-2`.

#### Artifact Permalink

**Category:** Hidden Gem
**UI Path:** `/artifacts/:id` — direct URL only
**Discoverability:** 1
**Test Coverage:** `artifact-permalink.spec.ts`, `L12-artifact-surfaces.spec.ts`

See Hidden Gems section HG-3.

#### Artifact Preview / Gallery

**Category:** Launch-Ready
**UI Path:** Work > Bet Detail > Artifacts > click artifact
**Discoverability:** 4
**Test Coverage:** `ArtifactView.test.tsx`, `ArtifactView.metadata.test.tsx`, `L12-artifact-surfaces.spec.ts`, `artifact-no-preview.spec.ts`

**What works:** ArtifactPreview component renders rich content (code, markdown, image, table) based on artifact kind. Handles "no preview available" state. ArtifactView fetches and renders. Metadata displayed.
**What's rough:** Image artifacts larger than viewport have no zoom/expand affordance.
**Recommendation:** Add a "View full size" link on image artifacts that opens the raw URL in a new tab.

#### Artifact Cost Chip

**Category:** Launch-Ready
**UI Path:** Artifact card in ArtifactSection
**Discoverability:** 4
**Test Coverage:** `artifact-cost-pending.spec.ts`, `L17-cost-tokens.spec.ts`

**What works:** Shows spend in formatted currency. "Pending" state for in-progress sessions. Tabular numerals for alignment.
**What's rough:** No tooltip explaining what "cost" means in this context (model API spend for this artifact's session).
**Recommendation:** Add a tooltip: "AI session cost for producing this artifact." 15-minute change.

#### Artifact Thread Summary

**Category:** Launch-Ready
**UI Path:** Work > Bet Detail > below artifact list
**Discoverability:** 3
**Test Coverage:** `ArtifactThreadsSummary.stories.tsx`, `bet-artifact-thread-summary.spec.ts`

**What works:** Shows aggregate thread activity across all artifact threads attached to the bet. Counts unread and total messages.
**What's rough:** No direct navigation from the summary to the specific artifact thread — clicking the summary does not navigate.
**Recommendation:** Make artifact thread summary rows clickable, navigating to the artifact permalink's discussion section.

---

### 7. Agent Runtime (API-only)

These features have no direct UI but are callable via API and are foundational to the "AI-first" product promise.

#### Session Provisioning

**Category:** Launch-Ready
**UI Path:** API-only: POST /api/sessions (triggered by agent harness)
**Discoverability:** 1 — API consumers only
**Test Coverage:** `sessions-routes.ts` (route), `session-provisioning.test.ts` (implied), `work-bet-session.spec.ts`

**What works:** Full session lifecycle — create, update status, attach to task, record cost/tokens, set outcome.
**What's rough:** Session detail page (`/work/bet/:betId/task/:taskId`) shows active session count but does not show individual session history or logs.
**Recommendation:** Add a collapsible session history section to TaskSheet showing past sessions with outcome, cost, and duration.

#### Harness Adapter Pool

**Category:** Launch-Ready
**UI Path:** API-only: selected via agent configuration (harnessType field)
**Discoverability:** 1
**Test Coverage:** Multiple harness-specific tests; `aq1-adapter-pool-host-only.test.ts` asserts host-only local pool.

**What works:** 5 adapters: builtin, CLI, claude-agent-sdk, remote, local-workspace. Each implements the same interface. `docker-workspace` and `isolated` adapters were removed in AQ1 (host-only local run path).
**What's rough:** No UI to show which harness adapter is in use for a running session. The TaskSheet shows sessions but not which harness is powering them.
**Recommendation:** Expose `harnessType` in the session metadata visible in TaskSheet.

#### Skill-Tool Registry

**Category:** Launch-Ready
**UI Path:** API-only: tools injected into agent prompts via harness
**Discoverability:** 1
**Test Coverage:** Various `tools/__tests__/*.test.ts` files

**What works:** 18+ skill tools (create-artifact, create-item, send-message, promote-knowledge, query-practice, etc.). Each validated through unit tests.
**What's rough:** No UI listing available skill tools. Agents have no visibility into what tools they have been given.
**Recommendation:** Expose skill tool list in Settings > Agents inline with each agent's configuration.

#### Model Gateway (X4)

**Category:** Launch-Ready
**UI Path:** API-only: GET/PATCH /api/model-gateway; also Settings > Models UI
**Discoverability:** 3 (via Settings > Models)
**Test Coverage:** `model-gateway.ts` (route), `SettingsModels.stories.tsx`, `settings.spec.ts`

**What works:** Three tiers (reasoning, workhorse, fast) each with provider + model configuration. API key storage via credential encryption. Auto-save from Settings UI.
**What's rough:** No model validation — entering a non-existent model name is accepted silently and only fails at first agent invocation.
**Recommendation:** On PATCH, attempt a `models.list()` preflight check against the provider API to validate the model name. Return a 422 with a user-friendly error if the model is unknown.

#### MCP Bridge

**Category:** Incomplete
**UI Path:** API-only: GET /api/mcp (route exists, exposes MCP protocol)
**Discoverability:** 1
**Test Coverage:** `mcp-route.integration.test.ts`

**What works:** MCP route is registered and integration-tested. Exposes the MCP protocol endpoint.
**What's rough:** No UI entry point. No agent-facing tool to invoke the MCP bridge explicitly. No documentation in the UI about what MCP capabilities are available.
**Recommendation:** Document MCP bridge in Settings > Agents as "MCP protocol available at [endpoint]." Not a blocking launch issue.

#### Worker WebSocket Protocol

**Category:** Incomplete
**UI Path:** Settings > Worker (Electron + shared-mode only)
**Discoverability:** 1
**Test Coverage:** `ws-subscribe-authz.test.ts`, `desktop-worker-client.test.ts`

**What works:** WebSocket protocol spec exists. Desktop worker client tested. Authorization tested.
**What's rough:** Not usable without the Electron shell and shared backend mode. No web-mode equivalent.
**Recommendation:** Track as Phase 2. Not a pre-launch blocker for the single-player laptop use case.

#### Routine Scheduler

**Category:** Hidden Gem
**UI Path:** API-only: GET /api/routines (returns all routines with schedule)
**Discoverability:** 1
**Test Coverage:** `routine-scheduler.test.ts`, `practice-meeting.test.ts`

See Hidden Gems section HG-5.

#### Handoff Protocol

**Category:** Launch-Ready
**UI Path:** API-only: triggered by agent state machine
**Discoverability:** 1
**Test Coverage:** `lifecycle-propagation.spec.ts`, server tests for handoff

**What works:** Agents can hand off context to other agents via the handoff protocol. State persists in sessions.
**What's rough:** No visible trail in the UI when a handoff occurs — the user cannot see which agent is "holding" a task at any given moment.
**Recommendation:** Show `ownerAgentId` and agent name prominently in the TaskSheet metadata strip.

---

### 8. Infrastructure (API-only)

#### Authentication (S1)

**Category:** Launch-Ready
**UI Path:** API-only: X-API-Key header; login/invite via /api/auth
**Discoverability:** 1
**Test Coverage:** `P2-auth-resolution.test.ts`, `N2-auth.spec.ts`, `cors.test.ts`, `ws-subscribe-authz.test.ts`

**What works:** API key authentication on all protected routes. Dev key shortcut (`<your-api-key>`). Invite code flow. Login session management. CORS configuration.
**What's rough:** Dev key is hardcoded and must be manually disabled in production. No warning when running with the dev key in a non-dev environment.
**Recommendation:** Log a startup warning when `HYPERIDLE_DEV_KEY_ENABLED=true` in non-development environments.

#### Notification Dispatch (H2)

**Category:** Incomplete
**UI Path:** No UI — dispatch is backend-only
**Discoverability:** 1
**Test Coverage:** `silence-policy.test.ts`, `notifications-routes.ts` (route)

**What works:** Notification queue in schema. Silence policy (quiet hours). Route for notification dispatch. Multiple adapter types (ntfy, SMTP, console).
**What's rough:** No UI to show notification history or test notification delivery. The Settings > Notifications toggles do not actually wire to the dispatch system.
**Recommendation:** Wire Settings > Notifications to the dispatch system (see QW-3). Add a "Send test notification" button in Settings > Notifications.

#### Observability

**Category:** Launch-Ready
**UI Path:** API-only: /api/observability routes (traces, spans)
**Discoverability:** 1
**Test Coverage:** `observability-routes.ts` (route), pipeline otel tests

**What works:** OpenTelemetry span creation. Audit log. Route-level tracing. Exportable.
**What's rough:** No UI to view traces. Observability is development/ops tooling.
**Recommendation:** None for launch. This is infrastructure.

#### Git Export

**Category:** Hidden Gem
**UI Path:** API-only: GET /api/git-export
**Discoverability:** 1
**Test Coverage:** `git-export-routes.test.ts`

See Hidden Gems section HG-9.

#### Health Endpoint

**Category:** Launch-Ready
**UI Path:** API-only: GET /api/health (public), GET /api/health/auth (authenticated)
**Discoverability:** 1
**Test Coverage:** `health.ts` (route — direct)

**What works:** Returns 200 with `{ ok: true }`. Auth variant returns user context. Suitable for uptime monitors.
**What's rough:** No structured health data (DB status, session count, memory) — just a binary ok/not-ok.
**Recommendation:** None blocking launch. Enrich health response as an operations improvement.

#### Lifecycle Propagation Engine (L20)

**Category:** Launch-Ready
**UI Path:** API-only: triggered by state machine events; visible as status updates in UI
**Discoverability:** 1
**Test Coverage:** `lifecycle-propagation.spec.ts`, `lifecycle-propagation.test.ts` (server)

See Lifecycle Propagation under Work View.

#### Dependency Watcher

**Category:** Launch-Ready
**UI Path:** API-only: internal service; surfaced via blockers in Conversations and WorkTeam AgentRow health indicators
**Discoverability:** 1
**Test Coverage:** `dependency-watcher.perf.test.ts`

**What works:** Watches task dependencies and marks tasks as blocked when dependencies are unmet. `/api/rail` endpoint returns blockers list.
**What's rough:** No UI to add/remove task dependencies. Dependencies exist in the schema but there is no form to create them.
**Recommendation:** Add dependency management to TaskSheet — a "Depends on" field that accepts other task IDs.

---

### 9. Threads & Blocks

These features form the block-level interaction layer across all content surfaces (Bet, Knowledge, assistant overlay). They are referenced throughout earlier sections but were omitted from the original inventory enumeration.

#### Host Thread Section

**Category:** Launch-Ready
**UI Path:** Work > Bet Detail > Discussion section | Work > Task Detail (inline via TaskSheet) | Knowledge Detail > Discussion section | Artifact permalink > Discussion section
**Discoverability:** 4 — visible on all host-entity detail pages
**Test Coverage:** `HostThreadSection.test.tsx`, `HostThreadSection.filter.test.tsx`, `HostThreadSection.prefill.test.tsx`, `M3-HostThreadSection.agentId.test.tsx`, `useHostThread.test.tsx`

**What works:** Unified thread-and-composer shell used across Bet, Task, Knowledge, and Artifact surfaces. Wraps `useHostThread` for data fetching. Renders message list with loading skeleton, empty state, and error recovery. Reply composer with `prefill` support for block-anchored comment flow. In-line mode for TaskSheet (suppresses section header chrome). Auto-scroll and focus on prefill change.
**What's rough:** Non-plain message types (e.g., review-request) render a bracketed type label rather than full rich rendering — acceptable for MVP.
**Recommendation:** Full ThreadShell convergence is planned as a follow-up. No blocking issues for launch.

#### Block Reference Embed

**Category:** Hidden Gem
**UI Path:** Any thread message containing `[[block-id]]` syntax → inline block embed rendered
**Discoverability:** 1 — no UI affordance explains the syntax or how to create a block reference
**Test Coverage:** `BlockRefEmbed.test.tsx`, `AssistantOverlay.block-ref.test.tsx` (rebuilt from `CocOverlay.block-ref.test.tsx` in AD8b), `T4-block-reference.spec.ts`

See Hidden Gems section HG-1. The embed itself (`BlockRefEmbed.tsx`) resolves the referenced block via `useBlockResolution`, fetches the host entity body client-side, and renders the block payload inline with a degraded fallback when the block cannot be resolved.

#### Block Actions Popover

**Category:** Launch-Ready
**UI Path:** Work > Bet Detail (pitch body) | Knowledge Detail (body) > hover over a text block > gutter icon > popover opens
**Discoverability:** 2 — gutter icon is only visible on hover; no standing affordance
**Test Coverage:** `WorkBet.block-popover.test.tsx`, `WorkBet.discuss-block.test.tsx`, `WorkBet.share-block.test.tsx`, `KnowledgeDetail.block-popover.test.tsx`, `KnowledgeDetail.share-block.test.tsx`

**What works:** Clicking a block's gutter icon opens a two-action popover: "Discuss" (prefills the HostThreadSection composer with a `Re: <excerpt>` chip) and "Share" (copies the `[[block-id]]` reference to clipboard). Escape closes the popover and returns focus to the gutter. Fully wired in both WorkBet and KnowledgeDetail.
**What's rough:** The gutter affordance requires hover discovery — new users will not find it without a hint. See HG-1 recommendation.
**Recommendation:** Add a "Copy block reference" label to the "Share" action. Surface the gutter icon as a persistent faint `+` icon in the margin to telegraph that blocks are interactive.

#### Block Anchored Comments (T5)

**Category:** Hidden Gem
**UI Path:** Knowledge Detail > body text > hover block > "Discuss" action → thread comment anchored to block
**Discoverability:** 2 — only visible in assistant overlay context on hover
**Test Coverage:** `block-anchor-comment.spec.ts`, `T5-block-discussion.spec.ts`

See Hidden Gems section HG-6. Block anchored comments use the same block-actions popover and HostThreadSection prefill mechanism — the distinction from a standard thread reply is the `blockId` + `blockExcerpt` prefill state passed to the composer.

#### Thread Host Banner

**Category:** Launch-Ready
**UI Path:** Any thread rendered via ThreadShell — Bet thread, Task thread, assistant overlay thread
**Discoverability:** 4 — always visible at the top of every thread shell
**Test Coverage:** `ThreadHostBanner.test.tsx`, `ThreadShell.test.tsx`

**What works:** Persistent header above the message stream in every ThreadShell instance. Shows host entity title (linkable to host page), blocking status chip (BLOCKED when `blocking=true`), resolved tag (`resolved=true`), pinned glyph (Lucide SVG — no emoji), and participant avatar stack (up to 3 + overflow "+N" count). Design-system component (`packages/design-system/src/ThreadHostBanner.tsx`).
**What's rough:** None identified.
**Recommendation:** None for launch.

#### Thread Resolution

**Category:** Launch-Ready
**UI Path:** Thread with review-request message → resolved when all reviewers respond; ThreadHostBanner shows resolved tag
**Discoverability:** 2 — state change is surfaced in ThreadHostBanner; no explicit "Resolve thread" button in current UI
**Test Coverage:** `ThreadShell.test.tsx`, `ThreadShell.promotion.test.tsx`, `useHostThread.test.tsx`

**What works:** Thread resolution state (`resolved`) flows from the host entity status through `useHostThread` and is rendered as the resolved tag in `ThreadHostBanner`. The `ThreadShell.promotion.test.tsx` tests the resolution promotion path (review-request acknowledgment → resolved state).
**What's rough:** Resolution is automatic (system-driven by lifecycle propagation) — there is no manual "Mark resolved" affordance for general discussion threads that are not review-request typed.
**Recommendation:** Add a "Mark as resolved" option to the ThreadHostBanner for non-review threads. Low priority for launch.

---

## Appendix: Test Coverage Matrix

### Coverage by Package

| Package | Unit/Component Tests | E2E Specs | Notes |
|---|---|---|---|
| `packages/web` | 180 test files | 70 specs | Strong coverage across all major pages and components |
| `packages/server` | 194 test files | — | Route, service, and integration tests |
| `packages/fabric` | — | — | Covered via server integration tests |
| `packages/db` | 1 test file | — | Migration tests only |
| `packages/pipeline` | 6 test files | — | Scheduler and runner tests |
| `packages/desktop` | 11 test files | — | Electron bridge and worker client |
| `packages/design-system` | 1 test file | — | Viewer discovery only |
| **Total** | **511 files** | **70 specs** | |

### Feature-to-Test Mapping (Key Features)

| Feature | Test Files |
|---|---|
| Thread list / conversations | `Conversations.test.tsx`, `conversations.spec.ts`, `threads.spec.ts` |
| Thread detail / messages | `CommentRow.*.test.tsx`, `thread-response.spec.ts` |
| Message composer | `Composer.test.tsx`, `Conversations.dispatch.test.tsx` |
| Direct message creation | `q1-new-dm-thread.spec.ts` |
| Rich message rendering | `CommentRow.richVariant.test.tsx`, `L11-rich-messages.spec.ts` |
| Reasoning block view | `Conversations.reasoning.test.tsx` |
| Assistant overlay | `CocOverlay.test.tsx` (being rebuilt as `AssistantOverlay` in AD8b), `L21-coc-overlay.spec.ts` |
| Work portfolio | `WorkPortfolio.test.tsx`, `work.spec.ts` |
| Team drill-down | `WorkTeam.AB3.test.tsx`, `L13-product-drilldown.spec.ts` |
| Bet detail | `WorkBet.test.tsx`, `WorkBet.detail.test.tsx`, `bet-thread.spec.ts` |
| Bet description editing | `WorkBet.pitch.test.tsx`, `bet-description-edit.spec.ts` |
| Bet creation | `BetCreateDialog.test.tsx`, `Q3-bet-creation.spec.ts` |
| Bet lifecycle actions | `L14-bet-actions.spec.ts`, `lifecycle-propagation.spec.ts` |
| Task detail / TaskSheet | `L15-task-request.spec.ts`, `task-thread.spec.ts` |
| Cost/token tracking | `L17-money-web.test.tsx`, `L17-cost-tokens.spec.ts` |
| Lifecycle propagation | `lifecycle-propagation.spec.ts` |
| Knowledge list | `KnowledgeList.test.tsx`, `knowledge.spec.ts` |
| Knowledge triage | `KnowledgeList.y4-triage.test.tsx`, `KnowledgeList.j8.test.tsx` |
| Knowledge detail | `KnowledgeDetail.factory.test.tsx`, `knowledge-detail.spec.ts` |
| Knowledge editing | `W3-knowledge-edit.spec.ts`, `l23-knowledge-body.spec.ts` |
| Knowledge create | `KnowledgeCreateDialog.test.tsx`, `knowledge-q2-create.spec.ts` |
| Block anchored comments | `block-anchor-comment.spec.ts`, `T5-block-discussion.spec.ts` |
| Block reference embed | `BlockRefEmbed.test.tsx`, `T4-block-reference.spec.ts` |
| Artifact section | `artifact-aggregation.spec.ts` |
| Artifact permalink | `artifact-permalink.spec.ts` |
| Artifact preview | `ArtifactView.test.tsx`, `L12-artifact-surfaces.spec.ts` |
| Sidebar navigation | `Sidebar.test.tsx`, `W3-sidebar.spec.ts` |
| Global search | `GlobalSearchPanel.test.tsx`, `global-search.spec.ts` |
| Setup flow | `SetupFlow.test.tsx`, `setup-flow.spec.ts` |
| First-run redirect | `FirstRunRedirect.P4.test.tsx`, `R2-work-first-landing.spec.ts` |
| Settings overlay | `AppShell.settings-overlay.test.tsx`, `settings-overlay.spec.ts` |
| Theme switching | `theme-persistence.spec.ts` |
| Toast notifications | `AppShell.test.tsx` |
| Error boundary / 404 | `ErrorBoundary.test.tsx`, `error-resilience.spec.ts` |
| Keyboard navigation | `keyboard-nav.spec.ts`, `accessibility.spec.ts` |
| Settings: Profile | `SettingsProfile.test.tsx` |
| Settings: Agents | `X3-agent-config.spec.ts` |
| Settings: Models | `SettingsModels.stories.tsx`, `settings.spec.ts` |
| Authentication | `P2-auth-resolution.test.ts`, `N2-auth.spec.ts` |
| Routine scheduler | `routine-scheduler.test.ts` |
| Git export | `git-export-routes.test.ts` |
| Session dial-in | `q1-session-dial-in.spec.ts`, `SessionActivityPanel.test.tsx`, `useSessionActivity.test.tsx` |
| Host thread section | `HostThreadSection.test.tsx`, `HostThreadSection.filter.test.tsx`, `HostThreadSection.prefill.test.tsx` |
| Block reference embed | `BlockRefEmbed.test.tsx`, `T4-block-reference.spec.ts` |
| Block actions popover | `WorkBet.block-popover.test.tsx`, `WorkBet.discuss-block.test.tsx`, `KnowledgeDetail.block-popover.test.tsx` |
| Block anchored comments | `block-anchor-comment.spec.ts`, `T5-block-discussion.spec.ts` |
| Thread host banner | `ThreadHostBanner.test.tsx`, `ThreadShell.test.tsx` |
| Thread resolution | `ThreadShell.test.tsx`, `ThreadShell.promotion.test.tsx` |

### Features with Zero Test Coverage (Gaps)

| Feature | Gap |
|---|---|
| Settings > Notifications | No unit test file. Toggle behavior not covered. |
| Settings > Backend | No dedicated test. Covered only by general settings spec. |
| Curation suggestion cards (accept/reject) | `CurationSuggestionCard.test.tsx` exists but no E2E spec for the accept/reject flow. |
| Knowledge scope change | Partially covered in `knowledge-detail.spec.ts` but scope change dialog interaction not fully tested. |
| Assistant overlay trigger discoverability | No test verifying the assistant trigger button is accessible and labeled. |
| Worker WebSocket (non-electron) | Tested in desktop package but not via the web settings UI. |
| Notification dispatch integration | `silence-policy.test.ts` tests policy; actual dispatch integration with UI toggles is untested. |
