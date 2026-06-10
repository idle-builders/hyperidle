# Z8 Exhaustive Audit Checklist

**Purpose:** Every feature, interaction, display element, data flow, and edge case that must be browser-tested and code-inspected before launch. Nothing is omitted. Each item specifies WHERE to test (browser route or API), WHAT to verify (expected behavior), and the CODE CHAIN (button → hook → API → DB → response → render).

---

## PART 1: SETUP & FIRST-RUN (11 items)

### 1.1 First-Run Redirect
- [ ] **FRR-1** Fresh install (no users) → `/` redirects to `/setup`
  - Code: `FirstRunRedirect.tsx` → `GET /api/auth/me` + `GET /api/teams` → redirect logic
- [ ] **FRR-2** Existing user → `/` redirects to `/work/portfolio`
- [ ] **FRR-3** API failure during redirect check → falls back to `/setup`
- [ ] **FRR-4** Loading state visible during redirect (no blank white flash)

### 1.2 Setup Flow (`/setup`)
- [ ] **SF-1** Page renders without AppShell chrome
- [ ] **SF-2** "Your name" field — required, text input, validates non-empty
- [ ] **SF-3** "Anthropic API key" field — required, password input, placeholder "sk-ant-..."
- [ ] **SF-4** API key field has no show/hide toggle (known gap — document or fix)
- [ ] **SF-5** "Project folder" field — optional, with folder picker button (Electron only)
- [ ] **SF-6** Team type selector — 5 presets (Software, Eng+UX, Full team, Growth, Custom)
  - Code: preset pills toggle, creates team with corresponding functions
- [ ] **SF-7** "Start HyperIdle" button — disabled until name + key filled
  - Code: `POST /api/users` → `POST /api/teams` → credential set → navigate to `/work/portfolio?onboarding=true`
- [ ] **SF-8** Submit error state — displays error message, doesn't navigate
- [ ] **SF-9** Loading spinner in button during submission
- [ ] **SF-10** After setup, revisiting `/setup` doesn't re-create user (idempotent)
- [ ] **SF-11** Pre-filled name field when user already exists (verify if intentional)

---

## PART 2: NAVIGATION & SHELL (48 items)

### 2.1 Sidebar Navigation
- [ ] **SB-1** Brand wordmark "HyperIdle" visible at top
- [ ] **SB-2** Three sections: Conversations, Work, Knowledge — all clickable
- [ ] **SB-3** Active section highlighted with correct styling
- [ ] **SB-4** Conversations section — shows "No threads yet" when empty
- [ ] **SB-5** Conversations section — shows max 5 recent threads when populated
- [ ] **SB-6** Thread sub-items — click navigates to `/conversations/:threadId`
- [ ] **SB-7** Thread sub-items — truncated display for threads without subject
- [ ] **SB-8** Work section — shows team sub-items when 2+ teams exist
- [ ] **SB-9** Work section — no sub-items when only 1 team
- [ ] **SB-10** Team sub-items — show agent count badge per team
- [ ] **SB-11** Team sub-items — health dot (agentHealthWarning) when agents unhealthy
- [ ] **SB-12** Knowledge section — shows triage count badge (Y4) when items need triage
  - Code: `useFetch("/api/knowledge/triage-count")` → badge rendering
- [ ] **SB-13** Conversations blocking count badge (AD5) shown when blocking threads exist
- [ ] **SB-14** Bottom strip — "Search" label + ⌘K hint visible
- [ ] **SB-15** Bottom strip — avatar button opens settings overlay
- [ ] **SB-16** Bottom strip — "Assistant" button opens assistant overlay
- [ ] **SB-17** Settings mode — sidebar shows settings section pills (Profile, Org chart, Models, etc.)
- [ ] **SB-18** Settings pills — click scrolls to corresponding section
- [ ] **SB-19** Sidebar width fixed at 200px on desktop

### 2.2 Mobile Navigation (viewport ≤ 768px)
- [ ] **MN-1** Mobile header renders (48px + safe-area-inset-top)
- [ ] **MN-2** Hamburger button visible on list routes
- [ ] **MN-3** Back arrow button visible on detail routes
- [ ] **MN-4** Page title centered in mobile header
- [ ] **MN-5** Search button (magnifying glass) in mobile header
- [ ] **MN-6** Hamburger opens mobile drawer (slide from left, z-50)
- [ ] **MN-7** Drawer scrim overlay covers content
- [ ] **MN-8** Escape key closes drawer
- [ ] **MN-9** Navigation closes drawer automatically
- [ ] **MN-10** Touch targets ≥ 44px on all interactive elements
- [ ] **MN-11** Attention dot on hamburger when blocking count > 0
- [ ] **MN-12** No duplicate page headings (title in header + page heading)

### 2.3 Global Search (Cmd+K)
- [ ] **GS-1** Cmd+K (or Ctrl+K) opens search panel
- [ ] **GS-2** Search panel has input with placeholder "Search conversations, work, knowledge..."
- [ ] **GS-3** "No recent queries" shown on empty state
- [ ] **GS-4** Typing query triggers live search (150ms debounce)
  - Code: `useGlobalSearch` → `GET /api/search?q=...` → result grouping
- [ ] **GS-5** Results grouped by: Work, Knowledge, Conversations
- [ ] **GS-6** Each result shows relevant metadata (status chip, title, excerpt)
- [ ] **GS-7** Keyboard navigation (arrow keys, Enter to select)
- [ ] **GS-8** Enter on result navigates to correct route
  - Code: `sanitizeRouteId()` validates ID before navigation (I4 security MED-1)
- [ ] **GS-9** Escape closes search panel
- [ ] **GS-10** Cmd+K while settings open closes settings, opens search
- [ ] **GS-11** Clear button (×) resets search input
- [ ] **GS-12** Search result for bet navigates to `/work/bet/:id`
- [ ] **GS-13** Search result for knowledge navigates to `/knowledge/:id`
- [ ] **GS-14** Search result for conversation navigates to `/conversations/:threadId`

### 2.4 Settings Overlay
- [ ] **SO-1** Avatar click in sidebar opens settings
- [ ] **SO-2** URL `?settings=open` opens settings overlay
- [ ] **SO-3** URL `?settings=open&section=models` opens at Models section
- [ ] **SO-4** All 8 sections render in stacked layout (Profile, Org Chart, Models, Appearance, Credentials, Notifications, Teams, Backend)
- [ ] **SO-5** 9th section (Assistant) renders when user exists (AD8b soul prompt editor)
- [ ] **SO-6** Worker section only visible in Electron shared-mode
- [ ] **SO-7** Agents section visible in settings nav
- [ ] **SO-8** Escape closes settings overlay

### 2.5 Keyboard Shortcuts
- [ ] **KS-1** Escape — closes drawer / settings / recipient picker / search
- [ ] **KS-2** Cmd+K — opens global search
- [ ] **KS-3** N key in conversations view — opens recipient picker
- [ ] **KS-4** D key — toggles dial-in when active session visible

### 2.6 Toast Notifications
- [ ] **TN-1** Success toast appears on successful operations (profile save, etc.)
- [ ] **TN-2** Error toast appears on failed operations
- [ ] **TN-3** Toast auto-dismisses after ~3 seconds
- [ ] **TN-4** Toast positioned bottom-right
- [ ] **TN-5** Toast visible across route changes

### 2.7 Error Handling
- [ ] **EH-1** 404 page — "Page not found" with "Go to conversations" + "Go back" buttons
- [ ] **EH-2** 404 page renders without AppShell chrome
- [ ] **EH-3** ErrorBoundary catches component crashes and renders fallback
- [ ] **EH-4** ErrorBoundary fallback has "Refresh" action

---

## PART 3: CONVERSATIONS (42 items)

### 3.1 Thread List (`/conversations`)
- [ ] **CL-1** Empty state — "No conversations yet" + "Start a thread" CTA
- [ ] **CL-2** Populated state — thread list renders with all threads
- [ ] **CL-3** Filter chips — "Blocking" and "Unread" toggles appear when relevant
- [ ] **CL-4** Filter chip toggle — filters thread list correctly
- [ ] **CL-5** "New thread" button visible when threads exist
- [ ] **CL-6** Thread row — shows sender avatar, subject/first message, timestamp
- [ ] **CL-7** Thread row click — navigates to `/conversations/:threadId`
- [ ] **CL-8** Selected thread highlighted in list
- [ ] **CL-9** Thread list loading state (skeleton)
- [ ] **CL-10** Thread list error state with retry button

### 3.2 New Thread Creation
- [ ] **NC-1** "Start a thread" or "New thread" button opens RecipientPicker
- [ ] **NC-2** RecipientPicker shows all agents and human users with search
- [ ] **NC-3** Each recipient shows name, role label, status chip (HEALTHY/IDLE)
- [ ] **NC-4** Recipient search filters list by name
- [ ] **NC-5** Selecting recipient shows message textarea
- [ ] **NC-6** Sending message creates thread + message via `POST /api/threads`
  - Code: `POST /api/threads` → inserts `threads` + `messages` → emits `thread_created` + `thread_message_appended`
- [ ] **NC-7** On success, navigates to new thread detail
- [ ] **NC-8** Cancel button returns to conversations list
- [ ] **NC-9** System users (e.g., "Propagation System") filtered from recipient list
- [ ] **NC-10** Escape closes recipient picker

### 3.3 Thread Detail (`/conversations/:threadId`)
- [ ] **TD-1** Thread loads with full message history
- [ ] **TD-2** Messages render with sender avatar, name, timestamp
- [ ] **TD-3** Rich message rendering — markdown, code blocks, tables
- [ ] **TD-4** Code blocks have syntax highlighting
- [ ] **TD-5** Tables don't overflow container (overflow-x-auto)
- [ ] **TD-6** Reply composer at bottom with "Write a message..." placeholder
- [ ] **TD-7** Enter sends message, Shift+Enter adds newline
- [ ] **TD-8** Message send — disabled while sending
  - Code: `POST /api/threads/:id/messages` → validates `messageInputSchema` → idempotency via `clientKey`
- [ ] **TD-9** Async-ack toast on successful message send
- [ ] **TD-10** Thread header — shows context link to host entity (bet, task, knowledge)
- [ ] **TD-11** Thread not found — shows "Thread not found" empty state
- [ ] **TD-12** Loading state while thread fetches (skeleton/spinner)
- [ ] **TD-13** Error state on fetch failure with retry

### 3.4 Reasoning Blocks
- [ ] **RB-1** Agent messages with reasoning show collapsible "Thinking..." block
- [ ] **RB-2** Block toggles open/closed
- [ ] **RB-3** Collapsed state height consistent

### 3.5 Block Reference Embeds
- [ ] **BRE-1** `[[block-id]]` syntax in messages renders inline block embed
  - Code: `BlockRefEmbed` → `useBlockResolution` → `GET /api/bets/:id` or `/api/knowledge/:id` → client-side block derivation
- [ ] **BRE-2** Degraded fallback renders when block not found
- [ ] **BRE-3** Error state renders when API fails

### 3.6 Session Dial-In (Q1)
- [ ] **DI-1** "Dial in" button appears when active session exists for task-hosted thread
  - Code: `useActiveSessionForTask` → `GET /api/sessions?task_id=:taskId&state=active`
- [ ] **DI-2** Button disabled with tooltip when harnessUrl is null
- [ ] **DI-3** Clicking "Dial in" shows companion split layout
- [ ] **DI-4** SessionActivityPanel renders on right side (flex-[2])
- [ ] **DI-5** Activity entries show tool calls, reasoning, cost ticks
- [ ] **DI-6** Filter tabs (All/Tools/Reasoning/Cost) work
- [ ] **DI-7** Auto-scroll with pause/resume on user scroll
- [ ] **DI-8** Keyboard shortcut 'D' toggles dial-in
- [ ] **DI-9** Close button dismisses companion panel

### 3.7 Assistant Overlay
- [ ] **AO-1** Trigger button in sidebar bottom opens overlay
- [ ] **AO-2** Overlay renders 360px wide, max-h 70vh, anchored bottom-right
- [ ] **AO-3** Shows thread shell with "Assistant" header and × close button
- [ ] **AO-4** Shows "System Agent" as participant with avatar
- [ ] **AO-5** "No messages yet" empty state with composer
- [ ] **AO-6** Composer works — "Reply to thread..." placeholder, Send button
- [ ] **AO-7** Does NOT close on click-outside (intentional design)
- [ ] **AO-8** Context chips above composer (when context attached)
- [ ] **AO-9** Context chip dismiss removes attached context
- [ ] **AO-10** Escape closes overlay

---

## PART 4: WORK — PORTFOLIO (28 items)

### 4.1 Portfolio Page (`/work/portfolio`)
- [ ] **WP-1** Header shows "All bets" title
- [ ] **WP-2** Summary line: "X routines across Y teams Z agents, N active"
- [ ] **WP-3** Health dot in summary when any agent has health warning
- [ ] **WP-4** Status filter pills: All, Active, Completed, Draft
- [ ] **WP-5** Status filter "All" selected by default
- [ ] **WP-6** Clicking status pill filters bet list
- [ ] **WP-7** "Completed" status matches both "completed" and "killed" bets
- [ ] **WP-8** Verdict filter pills: Validated, Refuted, Partial, Inconclusive, Not evaluated
- [ ] **WP-9** Verdict pills are multi-select (Set-based)
- [ ] **WP-10** Team filter pills — one per team (bordered style)
- [ ] **WP-11** Team pill toggleable (click again to deselect)
- [ ] **WP-12** "New bet" button visible (top-right)
- [ ] **WP-13** Bet grid — 2-column layout (max-width 960px)
- [ ] **WP-14** BetCard shows: status dot, status label, title, description excerpt
- [ ] **WP-15** BetCard click navigates to `/work/bet/:betId`
- [ ] **WP-16** Empty state — "No bets yet" with "New bet" CTA
- [ ] **WP-17** Filtered-empty state — "No bets match filters"
- [ ] **WP-18** Loading state — SkeletonCard placeholders
  - Code: `useBets()` → `GET /api/bets` → client-side filtering by status/verdict/team

### 4.2 Bet Creation Dialog
- [ ] **BC-1** "New bet" button opens BetCreateDialog
- [ ] **BC-2** Dialog shows "NEW BET" header
- [ ] **BC-3** Description textarea with "Describe the bet..." placeholder
- [ ] **BC-4** Title preview derives from description
- [ ] **BC-5** Team selector (visible when 2+ teams, auto-resolved when 1)
- [ ] **BC-6** "Create" button disabled until description filled
- [ ] **BC-7** "Cancel" button closes dialog
- [ ] **BC-8** Submitting creates bet via `POST /api/bets`
  - Code: `POST /api/bets` → validates `createBetSchema` → inserts `bets` → emits `bet_created`
- [ ] **BC-9** On success, navigates to new bet detail
- [ ] **BC-10** Error state shown on submission failure

---

## PART 5: WORK — BET DETAIL (38 items)

### 5.1 Bet Detail Page (`/work/bet/:betId`)
- [ ] **BD-1** Breadcrumb: "Work / {TeamName} / {BetTitle}"
- [ ] **BD-2** Title (h1) with bet name
- [ ] **BD-3** Status badge (Draft/Active/Completed/Killed) top-right
- [ ] **BD-4** Overflow menu (⋯) button visible
- [ ] **BD-5** Credential hint banner — "Your team will pick this up. Add a credential in Settings if you haven't yet."
- [ ] **BD-6** "Got it" dismisses hint (P5 hint system)
  - Code: `POST /api/hint-progress/:hintId/dismiss` → inserts `hintProgress`
- [ ] **BD-7** "Add knowledge" link visible

### 5.2 Stat Cards
- [ ] **BD-8** PROGRESS card — shows percentage
- [ ] **BD-9** BUDGET SPENT card — shows cost with "of X appetite"
- [ ] **BD-10** BUDGET SPENT handles null appetite gracefully (currently shows "--")
- [ ] **BD-11** TEAM card — shows team name with avatar initial
- [ ] **BD-12** Stat cards use tabular-nums for numeric alignment

### 5.3 Pitch Section
- [ ] **BD-13** PITCH section header visible
- [ ] **BD-14** Pitch body renders markdown from bet description
- [ ] **BD-15** Pitch is editable in draft/active state (click to edit)
- [ ] **BD-16** Pitch is read-only in completed/killed state
- [ ] **BD-17** TipTap BodyEditor appears in edit mode with autosave
  - Code: `useBetDescriptionSave` → `PATCH /api/bets/:id` with `{field: "description", value, reason}`
- [ ] **BD-18** Save indicator shows "Saved" after successful autosave
- [ ] **BD-19** Block actions popover on hover over text blocks (L18)
- [ ] **BD-20** "Discuss" action prefills HostThreadSection composer
- [ ] **BD-21** "Share" action copies `[[block-id]]` to clipboard

### 5.4 Task List
- [ ] **BD-22** TASKS section header visible
- [ ] **BD-23** Task rows show: title, status chip, owner
- [ ] **BD-24** Task row click opens TaskSheet drawer
- [ ] **BD-25** Task table sortable by column headers
- [ ] **BD-26** Empty task list — no CTA (known gap QW-8)
- [ ] **BD-27** Task verdict badges (met, rework, partial, not_met) when verdict set

### 5.5 Artifacts
- [ ] **BD-28** ARTIFACTS section visible
- [ ] **BD-29** Artifact cards show preview thumbnail, cost chip, kind badge
- [ ] **BD-30** Artifact card click opens ArtifactView
- [ ] **BD-31** ArtifactThreadsSummary shows thread count

### 5.6 Discussion Thread
- [ ] **BD-32** HostThreadSection renders below artifacts
  - Code: `useHostThread("bet", betId)` → `GET /api/threads?host_kind=bet&host_id=:betId`
- [ ] **BD-33** "No discussion yet" empty state
- [ ] **BD-34** Composer "Write a message..." with Send button
- [ ] **BD-35** Message append works (creates/reuses host thread)

### 5.7 Bet Lifecycle Actions
- [ ] **BD-36** Overflow menu shows correct actions per status:
  - Draft: Activate
  - Active: Pause, Kill, Adjust appetite
  - Paused: Resume, Kill
- [ ] **BD-37** ConsequencePreviewDialog shown before destructive actions (Kill)
  - Code: `POST /api/bets/:id/kill` → validates `killBetSchema` → transitions state → emits `bet_transitioned`
- [ ] **BD-38** Lifecycle action updates status badge after completion

---

## PART 6: WORK — TASK DETAIL (20 items)

### 6.1 TaskSheet Drawer
- [ ] **TS-1** Opens as right-side drawer from bet detail
- [ ] **TS-2** Task title (h2) visible
- [ ] **TS-3** Status badge
- [ ] **TS-4** Metadata grid: status, owner, created, cost
- [ ] **TS-5** Close button (×) or outside click closes sheet

### 6.2 Task Detail Page (`/work/bet/:betId/task/:taskId`)
- [ ] **TDP-1** Breadcrumb navigation back to bet
- [ ] **TDP-2** Title, status badge, overflow button
- [ ] **TDP-3** Metadata grid renders correctly
- [ ] **TDP-4** Sessions section — table of session rows
- [ ] **TDP-5** Active session shows live pulsing dot
- [ ] **TDP-6** "Dial in" button on active sessions
- [ ] **TDP-7** Completed sessions show outcome (success/error)
- [ ] **TDP-8** Session cost displayed per session
- [ ] **TDP-9** Artifacts section (ArtifactSection)
- [ ] **TDP-10** Discussion section (HostThreadSection inline)
  - Code: `useHostThread("task", taskId)` → thread fetch + compose

### 6.3 Task State Machine
- [ ] **TSM-1** Task states: ready → in_progress → completed/blocked/failed
  - Code: `POST /api/tasks/:id/transition` → validates against state machine → emits `task_state_changed`
- [ ] **TSM-2** State transitions visible in UI (status badge updates)
- [ ] **TSM-3** Invalid transitions return 409 error
- [ ] **TSM-4** Handoff creates new session for next agent
  - Code: `POST /api/tasks/:id/handoff` → `handoffSchema` validation
- [ ] **TSM-5** Task outcome verdict settable after completion

---

## PART 7: WORK — TEAM DETAIL (26 items)

### 7.1 Team Page (`/work/team/:teamId`)
- [ ] **WT-1** Breadcrumb: "← Portfolio"
- [ ] **WT-2** Team name (h1), StatusChip, Phase, Lead agent name
- [ ] **WT-3** BURN VS CAP section — KeyValue grid
- [ ] **WT-4** Bet cost, Routine cost (this month), Total cost, Cap, Capacity values
- [ ] **WT-5** Progress bar (cap utilization)
- [ ] **WT-6** ACTIVE BETS section
- [ ] **WT-7** Bet rows — click navigates to `/work/bet/:betId`
- [ ] **WT-8** Empty bets — "No active bets" + hint
- [ ] **WT-9** ROUTINES section header + "+ New routine" button
- [ ] **WT-10** Routine rows — dot, name, agent avatar, schedule, last run, cost
- [ ] **WT-11** Routine row click navigates to `/work/routine/:routineId`
- [ ] **WT-12** AGENTS section header + "+ Add agent" button
- [ ] **WT-13** Agent rows — health dot, avatar, name, status, context, "Customize" button
- [ ] **WT-14** Agent row click navigates to `/agents/:agentId`
- [ ] **WT-15** "Customize" button opens AgentEditDialog
- [ ] **WT-16** "+ Add agent" opens AgentAddDialog
- [ ] **WT-17** ARTIFACTS section (ArtifactSection, stack layout)
- [ ] **WT-18** Team not found — "Team not found" error card
- [ ] **WT-19** Loading state — SkeletonCard placeholders
  - Code: `useTeam(teamId)` → `GET /api/teams/:teamId` → renders sections

### 7.2 Agent Dialogs
- [ ] **AD-1** AgentEditDialog — edit soul prompt, autonomy, model tier
- [ ] **AD-2** AgentAddDialog — select agent role + template
- [ ] **AD-3** Dialog close returns to team page
- [ ] **AD-4** Agent changes persist via `PATCH /api/agents/:id`

### 7.3 Routine Creation
- [ ] **RC-1** RoutineCreateDialog opens from "+ New routine"
- [ ] **RC-2** Create routine via `POST /api/routines`
- [ ] **RC-3** Validates required fields (name, agent, trigger)
- [ ] **RC-4** On success, routine appears in list
- [ ] **RC-5** Cancel closes dialog

---

## PART 8: WORK — ROUTINE DETAIL (18 items)

### 8.1 Routine Page (`/work/routine/:routineId`)
- [ ] **WR-1** Breadcrumb: "← Portfolio / {Team} / {Routine}"
- [ ] **WR-2** Routine name (h1), StatusChip, agent name, trigger type, description
- [ ] **WR-3** CONFIGURATION section — KV grid (Agent, Schedule, Trigger type, Autonomy, Next/Last run, Created)
- [ ] **WR-4** Pause/Resume button (state toggle)
  - Code: `PATCH /api/routines/:id` → toggles state → optimistic update
- [ ] **WR-5** Trigger Now button
  - Code: `POST /api/routines/:id/trigger` → creates session
- [ ] **WR-6** Delete button with inline confirmation
  - Code: `DELETE /api/routines/:id` → soft delete (sets deletedAt)
- [ ] **WR-7** Action buttons disabled during pending requests
- [ ] **WR-8** BUDGET section (AA3)
- [ ] **WR-9** Avg cost per run, Cost this month, Cost cap per run, Monthly cap values
- [ ] **WR-10** Progress bars for per-run and monthly utilization
- [ ] **WR-11** Amber warning at 80%+ utilization
- [ ] **WR-12** LAST RUN SUMMARY section — text content
- [ ] **WR-13** RUN HISTORY section — table of runs
- [ ] **WR-14** Run row: Time, Duration, Outcome dot (color-coded), Cost
- [ ] **WR-15** Outcome dot colors: green=success, red=error, amber=budget_exhausted
- [ ] **WR-16** Routine not found — error card
- [ ] **WR-17** Loading state — SkeletonCard
- [ ] **WR-18** Delete confirmation — "Are you sure?" with confirm/cancel

---

## PART 9: KNOWLEDGE (52 items)

### 9.1 Knowledge List (`/knowledge`)
- [ ] **KL-1** Header shows "Knowledge" title
- [ ] **KL-2** Curated/Triage tab toggle
- [ ] **KL-3** Curated tab selected by default
- [ ] **KL-4** Triage tab auto-activates when items need triage
- [ ] **KL-5** Scope pills: All, Shared, Team, Private
- [ ] **KL-6** Scope pill filter works — filters list by scopeKind
- [ ] **KL-7** Sort options: Relevance, Recency, Frequency
- [ ] **KL-8** Sort selection changes item ordering
- [ ] **KL-9** Search input — text search filters list in real time
- [ ] **KL-10** "+ New" button navigates to `/knowledge/new`
- [ ] **KL-11** Item row shows: title, excerpt, status chip, recency label
- [ ] **KL-12** Item row click navigates to `/knowledge/:id`
- [ ] **KL-13** GENERAL topic group header when items ungrouped
- [ ] **KL-14** Topic groups — collapse/expand works
- [ ] **KL-15** Topic group health dot (fresh/some_stale/mostly_stale)
- [ ] **KL-16** Item count per group
- [ ] **KL-17** Empty state — "Your knowledge base is empty" + "Create first item" CTA
- [ ] **KL-18** Loading state
- [ ] **KL-19** Triage tab — keyboard shortcuts hint bar (j/k navigate, v validate, x reject)
  - Code: `useKeyboardNavigation` → j/k changes activeIndex, v/x trigger actions

### 9.2 Knowledge Create (`/knowledge/new`)
- [ ] **KC-1** Breadcrumb: "Knowledge / New"
- [ ] **KC-2** Title input — "Untitled" placeholder, editable
- [ ] **KC-3** Body editor (TipTap BodyEditor) with "Describe it in markdown..." placeholder
- [ ] **KC-4** SCOPE selector: Shared, Team, Private pills
- [ ] **KC-5** "Create" button disabled until title + body non-empty
- [ ] **KC-6** "Cancel" button navigates back to `/knowledge`
- [ ] **KC-7** Submit creates item via `POST /api/knowledge`
  - Code: `POST /api/knowledge` → validates `createKnowledgeSchema` → inserts `knowledgeItems` + `knowledgeStrategyFabric` → emits `knowledge_created`
- [ ] **KC-8** On success, navigates to `/knowledge/:createdId`
- [ ] **KC-9** Error state on submission failure

### 9.3 Knowledge Detail (`/knowledge/:knowledgeId`)
- [ ] **KD-1** Breadcrumb: "Knowledge" (link back)
- [ ] **KD-2** Title (h2) — correct title from API
- [ ] **KD-3** Status sub-header — HEALTHY chip, confidence, kind, timestamp
- [ ] **KD-4** Kind displays correctly (e.g., "principle", not "unknown")
  - Code: `GET /api/knowledge/:id` → LEFT JOIN `knowledgeStrategyFabric` → returns `kind`, `layer`
- [ ] **KD-5** Timestamp humanized (not raw ISO)
- [ ] **KD-6** Body renders markdown content correctly
- [ ] **KD-7** Body doesn't show "This knowledge item was not found." (FIX-4 verified)
- [ ] **KD-8** METADATA card — Kind, Scope, Status, Confidence, Last edited, Editor, Access count
- [ ] **KD-9** Editor name shows display name (not truncated agent ID)
- [ ] **KD-10** BACKLINKS card — "No related items" when empty
- [ ] **KD-11** Overflow menu (⋯) visible
- [ ] **KD-12** Overflow menu actions: Edit, Archive, Change scope

### 9.4 Knowledge Editing
- [ ] **KE-1** Edit button visible (when not factory-scope)
- [ ] **KE-2** Edit button NOT visible for factory-scope items
- [ ] **KE-3** Clicking Edit enters edit mode — TipTap BodyEditor replaces read view
- [ ] **KE-4** Auto-save with 1500ms debounce
  - Code: `useAutoSave` → `PATCH /api/knowledge/:id` → validates version → returns updated item
- [ ] **KE-5** Save indicator: idle → saving → saved → auto-clears
- [ ] **KE-6** Conflict detection (409 response) — shows conflict state
- [ ] **KE-7** "Done" button exits edit mode
- [ ] **KE-8** Read view shows EDITED content after Done (not original)
- [ ] **KE-9** Cancel discards draft, restores original

### 9.5 Knowledge Scope Change
- [ ] **KS-1** Scope badge click opens ScopeChangeDialog (Q2)
- [ ] **KS-2** Dialog shows current scope and new scope options
- [ ] **KS-3** Confirm changes scope via `PATCH /api/knowledge/:id/scope`
  - Code: validates `changeScopeSchema` → version check → updates `knowledgeItems` + `knowledgeStrategyFabric`
- [ ] **KS-4** Version mismatch returns 409

### 9.6 Knowledge Advanced Operations
- [ ] **KA-1** Archive — `POST /api/knowledge/:id/archive` → status becomes "archived"
- [ ] **KA-2** Flag — `POST /api/knowledge/:id/flag` → marks for human review
- [ ] **KA-3** Merge — `POST /api/knowledge/:id/merge` → combines two items
- [ ] **KA-4** Split — `POST /api/knowledge/:id/split` → creates child items

### 9.7 Knowledge Discussion
- [ ] **KDT-1** DISCUSSION section renders via HostThreadSection
  - Code: `useHostThread("knowledge_item", knowledgeId)` → thread fetch
- [ ] **KDT-2** "No discussion yet" empty state
- [ ] **KDT-3** Composer works for posting messages
- [ ] **KDT-4** Block anchored comments — hovering body text shows gutter icon
- [ ] **KDT-5** Discuss action opens thread with `Re: <excerpt>` prefill

---

## PART 10: AGENT PROFILE (14 items)

### 10.1 Agent Profile Page (`/agents/:agentId`)
- [ ] **AP-1** Breadcrumb: "← Agents"
- [ ] **AP-2** Avatar with initials, name, IDLE/ACTIVE StatusChip, Strategy/Team Tag
- [ ] **AP-3** Role label + "Created" date
- [ ] **AP-4** "Edit in Settings" link navigates to settings
- [ ] **AP-5** CONFIGURATION section — KV grid (Role, Category, Max Sessions, Harness, Model Tier, Created)
- [ ] **AP-6** Collapsible soul prompt (▸ Soul prompt toggle)
- [ ] **AP-7** HARNESS CAPABILITIES section — badge row (Tool use, MCP, File editing, Sub-agents)
- [ ] **AP-8** REVIEW TRACK RECORD section — "No reviews recorded yet" or review table
- [ ] **AP-9** RECENT ACTIVITY section — "No sessions recorded" or activity table
- [ ] **AP-10** PERFORMANCE section — Sessions count, Success rate %, Avg cost, Total cost
- [ ] **AP-11** Health banner (conditional, role="alert") for unhealthy agents
- [ ] **AP-12** Agent not found — "Agent not found" error card
- [ ] **AP-13** Loading state — SkeletonCard
  - Code: `useAgentProfile(agentId)` → `GET /api/agents/:id/profile` → joins `users` + `sessions`
- [ ] **AP-14** Tables have aria-label for accessibility

---

## PART 11: ARTIFACTS (12 items)

### 11.1 Artifact Permalink (`/artifacts/:id`)
- [ ] **AR-1** ArtifactPreview renders at top (code, markdown, image, table based on kind)
  - Code: `useArtifact(id)` → `GET /api/artifacts/:id`
- [ ] **AR-2** Discussion section below (HostThreadSection for "artifact" hostKind)
- [ ] **AR-3** Artifact not found — error state
- [ ] **AR-4** Loading state

### 11.2 Artifact Components
- [ ] **AR-5** ArtifactGalleryCard — miniature preview, cost chip, kind badge
- [ ] **AR-6** ArtifactStackItem — list-row style
- [ ] **AR-7** ArtifactCostChip — formatted currency, "Pending" for in-progress
- [ ] **AR-8** ArtifactKindBadge — correct label per kind (text, code, html, data, image, url)
- [ ] **AR-9** ArtifactTimestamp — relative time formatting
- [ ] **AR-10** ArtifactPreview — renders rich content per kind
- [ ] **AR-11** Image artifacts — no zoom/expand affordance (known gap)
- [ ] **AR-12** "No preview available" state for unsupported kinds

---

## PART 12: SETTINGS — ALL SECTIONS (58 items)

### 12.1 Profile
- [ ] **SP-1** Display name input — pre-filled from API
- [ ] **SP-2** Email input — pre-filled from API
- [ ] **SP-3** "Save profile" button — disabled when unchanged (dirty tracking)
- [ ] **SP-4** Save calls `PATCH /api/users/:id`
- [ ] **SP-5** Toast on success/failure
- [ ] **SP-6** Email validation (type="email" HTML5)

### 12.2 Org Chart
- [ ] **SOC-1** "Add a second human user to start defining your org structure" when solo user
- [ ] **SOC-2** Table of edges (From | Mechanism | Target | Delete) when edges exist
- [ ] **SOC-3** Inline add form with context-aware target selector
- [ ] **SOC-4** Add edge calls `PUT /api/org/edges`
- [ ] **SOC-5** Delete edge calls `DELETE /api/org/edges/:id`
- [ ] **SOC-6** Error state handled (with retry)

### 12.3 Models (X4)
- [ ] **SM-1** Three tier rows: Reasoning, Workhorse, Fast
- [ ] **SM-2** Provider select (anthropic, openrouter, openai-compatible)
- [ ] **SM-3** Model select/input per tier
- [ ] **SM-4** Credential status dot (green=valid, amber=untested, red=absent)
- [ ] **SM-5** Auto-save with 500ms debounce
  - Code: `PATCH /api/model-gateway` → validates `PatchModelGatewaySchema`
- [ ] **SM-6** openai-compatible shows baseUrl + apiKey fields
- [ ] **SM-7** Error state styled with Hearth tokens (not raw `text-error`)

### 12.4 Assistant (AD8b)
- [ ] **SA-1** "Persona instructions" textarea with placeholder
- [ ] **SA-2** Soul prompt saves to assistant thread
  - Code: `PATCH /api/threads/assistant` with `{ soulPrompt }`
- [ ] **SA-3** Only visible when user exists

### 12.5 Appearance
- [ ] **SAP-1** Three visual swatch cards: Light, Dark, System
- [ ] **SAP-2** Click sets theme immediately (no save button needed)
- [ ] **SAP-3** aria-pressed state on active theme
- [ ] **SAP-4** System option follows OS preference
- [ ] **SAP-5** Theme persists to localStorage
  - Code: `useTheme` → localStorage "hyperidle-theme" → cross-tab sync
- [ ] **SAP-6** Toast feedback on theme change

### 12.6 Credentials
- [ ] **SC-1** Shows credential catalog: anthropic_api_key, openrouter_api_key, shared_backend_key
- [ ] **SC-2** Status badge per credential: present/absent/error
- [ ] **SC-3** "Absent" and "error" states visually distinct
- [ ] **SC-4** Set credential calls `PUT /api/credentials/:name`
  - Code: encrypts value → stores in `serverCredentials`
- [ ] **SC-5** Remove credential calls `DELETE /api/credentials/:name`
- [ ] **SC-6** Validate credential calls `POST /api/credentials/:name/validate` (rate-limited 3/min)

### 12.7 Notifications
- [ ] **SN-1** Four toggle switches: review requests, cost alerts, blocker alerts, email digests
- [ ] **SN-2** Toggle state changes persist to API (or known gap: local-only per QW-3)
- [ ] **SN-3** Toggle uses design-system Toggle component
- [ ] **SN-4** Toggles pre-fill from `GET /api/settings`

### 12.8 Teams
- [ ] **ST-1** Lists teams with active/inactive status
- [ ] **ST-2** Team CRUD accessible (or known gap: no "Create team" button)

### 12.9 Backend
- [ ] **SBK-1** Shows current backend mode (Local or Shared)
- [ ] **SBK-2** Shows platform string in Electron context
- [ ] **SBK-3** Falls back to "Local (laptop)" in web mode

### 12.10 Worker (S4 — Electron shared-mode only)
- [ ] **SW-1** Filtered from nav in non-shared-mode
- [ ] **SW-2** "Requires desktop app" message in web mode
- [ ] **SW-3** Worker toggle, connection badge, pause/resume in Electron shared mode

### 12.11 Agents (X3)
- [ ] **SAG-1** Table of agents (Name, Role, Harness, Model Tier, Sessions, Actions)
- [ ] **SAG-2** Inline edit form expands below selected agent
- [ ] **SAG-3** Add agent form with role selection + template soul prompt fetch
  - Code: `GET /api/agents/templates/:role` → pre-fills soul prompt
- [ ] **SAG-4** Two-click delete with 3-second auto-revert
- [ ] **SAG-5** Keyboard Escape closes forms
- [ ] **SAG-6** Agent create calls `POST /api/agents`
- [ ] **SAG-7** Agent update calls `PATCH /api/agents/:id`
- [ ] **SAG-8** Agent delete calls `DELETE /api/agents/:id`
- [ ] **SAG-9** Delete blocked if agent has active sessions (409)

---

## PART 13: API ENDPOINT VERIFICATION (85 items)

### 13.1 Health & Status
- [ ] **API-1** `GET /health` → 200 `{ ok: true }` (no auth)
- [ ] **API-2** `GET /api/health` → 200 with timestamp (no auth)
- [ ] **API-3** `GET /api/health/auth` → 200 with user context (requires auth)
- [ ] **API-4** `GET /api/health/auth` → 401 without auth
- [ ] **API-5** `GET /api/status` → server state
- [ ] **API-6** `GET /api/status/settings` → server config

### 13.2 Auth
- [ ] **API-7** `POST /api/auth/ws-token` → mints one-shot WS upgrade token
- [ ] **API-8** `GET /api/auth/me` → current user
- [ ] **API-9** `POST /api/auth/invite` → creates invite code (founder only)
- [ ] **API-10** `POST /api/auth/claim` → claims invite code (public, pre-auth)

### 13.3 Users
- [ ] **API-11** `POST /api/users` → creates human user (setup, idempotent)
- [ ] **API-12** `GET /api/users` → lists users with session counts
- [ ] **API-13** `GET /api/users/:id` → user detail with skills
- [ ] **API-14** `PATCH /api/users/:id` → updates user fields
- [ ] **API-15** `GET /api/users/:id/inbox` → user's threads

### 13.4 Teams
- [ ] **API-16** `GET /api/teams` → lists teams with member counts
- [ ] **API-17** `POST /api/teams` → creates team with functions
- [ ] **API-18** `GET /api/teams/:teamId` → team detail with roster
- [ ] **API-19** `PATCH /api/teams/:teamId` → updates team

### 13.5 Bets
- [ ] **API-20** `GET /api/bets` → lists bets
- [ ] **API-21** `POST /api/bets` → creates bet
- [ ] **API-22** `GET /api/bets/:id` → bet detail with tasks, team, sessions
- [ ] **API-23** `PATCH /api/bets/:id` → updates bet fields
- [ ] **API-24** `POST /api/bets/:id/commit` → activate bet
- [ ] **API-25** `POST /api/bets/:id/ship` → ship bet
- [ ] **API-26** `POST /api/bets/:id/kill` → kill bet
- [ ] **API-27** `POST /api/bets/:id/outcome` → record outcome verdict
- [ ] **API-28** `POST /api/bets/:id/retro` → run retro (transactional)
- [ ] **API-29** `GET /api/bets/:id/artifact-thread-summary` → thread counts

### 13.6 Tasks
- [ ] **API-30** `POST /api/tasks` → creates task under bet
- [ ] **API-31** `GET /api/tasks` → lists tasks (filterable by bet_id, state, owner)
- [ ] **API-32** `PATCH /api/tasks/:id` → updates task fields
- [ ] **API-33** `POST /api/tasks/:id/transition` → state machine transition
- [ ] **API-34** `POST /api/tasks/:id/handoff` → agent handoff

### 13.7 Sessions
- [ ] **API-35** `GET /api/sessions` → lists sessions (filterable by task_id, agent_id, state)
- [ ] **API-36** `POST /api/sessions` → provisions session
- [ ] **API-37** `GET /api/sessions/:id/activity` → activity stream
- [ ] **API-38** `PATCH /api/sessions/:id` → updates session

### 13.8 Threads
- [ ] **API-39** `GET /api/threads` → lists threads (filterable by host_kind, host_id, participant_id)
- [ ] **API-40** `GET /api/threads/:id` → thread detail with messages
- [ ] **API-41** `POST /api/threads` → creates thread + initial message
- [ ] **API-42** `POST /api/threads/:id/messages` → appends message (idempotent via clientKey)
- [ ] **API-43** `GET /api/threads/assistant` → assistant thread (idempotent create)

### 13.9 Knowledge
- [ ] **API-44** `GET /api/knowledge` → lists items with fabric signals
- [ ] **API-45** `POST /api/knowledge` → creates item
- [ ] **API-46** `GET /api/knowledge/:id` → detail with kind, layer, confidence
- [ ] **API-47** `PATCH /api/knowledge/:id` → updates body (version tracked)
- [ ] **API-48** `PATCH /api/knowledge/:id/scope` → changes scope
- [ ] **API-49** `POST /api/knowledge/:id/archive` → archives item
- [ ] **API-50** `POST /api/knowledge/:id/flag` → flags for review
- [ ] **API-51** `POST /api/knowledge/:id/merge` → merges items
- [ ] **API-52** `POST /api/knowledge/:id/split` → splits item
- [ ] **API-53** `GET /api/knowledge/triage-count` → count for sidebar badge
- [ ] **API-54** `GET /api/knowledge/search?q=...` → text search

### 13.10 Artifacts
- [ ] **API-55** `GET /api/artifacts` → lists artifacts (filterable by axis, limit, cursor)
- [ ] **API-56** `GET /api/artifacts/:id` → artifact detail
- [ ] **API-57** `POST /api/artifacts` → creates artifact
- [ ] **API-58** `PATCH /api/artifacts/:id/preview` → updates preview

### 13.11 Agents
- [ ] **API-59** `GET /api/agents` → lists agents with session counts
- [ ] **API-60** `GET /api/agents/:id/profile` → agent profile detail
- [ ] **API-61** `GET /api/agents/templates/:role` → role template
- [ ] **API-62** `POST /api/agents` → creates agent
- [ ] **API-63** `PATCH /api/agents/:id` → updates agent
- [ ] **API-64** `DELETE /api/agents/:id` → deletes agent (409 if active sessions)

### 13.12 Routines
- [ ] **API-65** `GET /api/routines` → lists routines
- [ ] **API-66** `POST /api/routines` → creates routine
- [ ] **API-67** `GET /api/routines/:id` → routine detail with run history
- [ ] **API-68** `PATCH /api/routines/:id` → updates routine
- [ ] **API-69** `POST /api/routines/:id/trigger` → manual trigger
- [ ] **API-70** `DELETE /api/routines/:id` → soft delete

### 13.13 Search, Org, Credentials, Settings
- [ ] **API-71** `GET /api/search?q=...` → cross-domain search
- [ ] **API-72** `GET /api/org` → org edges
- [ ] **API-73** `PUT /api/org/edges` → create/update edge
- [ ] **API-74** `DELETE /api/org/edges/:id` → delete edge
- [ ] **API-75** `GET /api/credentials` → credential catalog
- [ ] **API-76** `PUT /api/credentials/:name` → set credential
- [ ] **API-77** `DELETE /api/credentials/:name` → delete credential
- [ ] **API-78** `POST /api/credentials/:name/validate` → validate credential
- [ ] **API-79** `GET /api/settings` → user settings
- [ ] **API-80** `PATCH /api/settings` → update settings
- [ ] **API-81** `GET /api/model-gateway` → model config
- [ ] **API-82** `PATCH /api/model-gateway` → update model config
- [ ] **API-83** `GET /api/recipients` → recipient list
- [ ] **API-84** `GET /api/hint-progress` → dismissed hints
- [ ] **API-85** `POST /api/hint-progress/:hintId/dismiss` → dismiss hint

---

## PART 14: CROSS-CUTTING CONCERNS (30 items)

### 14.1 Rate Limiting
- [ ] **RL-1** Default 300 req/min allows normal SPA navigation
- [ ] **RL-2** Rapid navigation (5+ pages/sec) doesn't trigger 429
- [ ] **RL-3** Auth mint endpoint has dedicated 600/min limit
- [ ] **RL-4** Credential validation rate-limited at 3/min
- [ ] **RL-5** `/api/health` exempt from rate limiter
- [ ] **RL-6** 429 response includes `Retry-After` header

### 14.2 Authentication
- [ ] **AU-1** All `/api/*` routes (except health, setup, claim) require X-API-Key
- [ ] **AU-2** Invalid API key returns 401 with `{ error, code: "UNAUTHORIZED" }`
- [ ] **AU-3** Dev key "hyperidle-dev-local" works in laptop profile
- [ ] **AU-4** WebSocket upgrade requires one-shot token from `/api/auth/ws-token`

### 14.3 CORS
- [ ] **CO-1** CORS headers set on all `/api/*` responses
- [ ] **CO-2** Preflight (OPTIONS) returns correct headers

### 14.4 Body Size
- [ ] **BS-1** Requests > 1 MiB return 413

### 14.5 Error Responses
- [ ] **ER-1** All errors return `{ error: string, code: string }` (ApiErrorResponse)
- [ ] **ER-2** 400 for validation errors
- [ ] **ER-3** 401 for auth errors
- [ ] **ER-4** 403 for permission errors
- [ ] **ER-5** 404 for not-found (never 403 for private items — security)
- [ ] **ER-6** 409 for conflicts (state machine, version, active sessions)
- [ ] **ER-7** 429 for rate limiting
- [ ] **ER-8** Error handler maps `InvalidTransitionError` → 409

### 14.6 Event Bus
- [ ] **EB-1** `bet_created` event emitted on bet creation
- [ ] **EB-2** `bet_transitioned` event emitted on lifecycle actions
- [ ] **EB-3** `task_state_changed` event emitted on task transitions
- [ ] **EB-4** `thread_message_appended` event emitted on message append
- [ ] **EB-5** `knowledge_created` event emitted on knowledge creation
- [ ] **EB-6** `session_created` event emitted on session provisioning
- [ ] **EB-7** Events forwarded to WebSocket subscribers

### 14.7 WebSocket
- [ ] **WS-1** `GET /api/ws?token=...` upgrades to WebSocket
- [ ] **WS-2** Client receives events for subscribed topics
- [ ] **WS-3** Reconnect with exponential backoff (1s, 2s, 4s, 8s, max 15s)
- [ ] **WS-4** Worker WebSocket (`/api/ws/worker`) with separate token auth

### 14.8 Accessibility
- [ ] **A11Y-1** Sidebar has `role="navigation"` + `aria-label`
- [ ] **A11Y-2** Settings sections reachable via keyboard (Tab)
- [ ] **A11Y-3** Dialogs trap focus
- [ ] **A11Y-4** Dialogs return focus to trigger on close
- [ ] **A11Y-5** Agent tables have `aria-label`
- [ ] **A11Y-6** Theme swatches have `aria-pressed`
- [ ] **A11Y-7** Health banner uses `role="alert"`

---

## PART 15: DESIGN SYSTEM COMPLIANCE (18 items)

### 15.1 Token Usage
- [ ] **DS-1** No hardcoded hex colors — all semantic tokens
- [ ] **DS-2** No cool grays (slate, gray, zinc, neutral)
- [ ] **DS-3** Spacing on 6px grid: {3,6,9,12,18,24,36,48}px
- [ ] **DS-4** Type scale closed: {9,10,11,12,13,14,15,16,17,18,20,24,30}px
- [ ] **DS-5** Radius scale: --r-none, --r-subtle (10px), --r-default (16px), --r-pill
- [ ] **DS-6** Shadow tokens: --shadow-default for cards, --shadow-elevated for floating
- [ ] **DS-7** Motion tokens: --motion-fast (120ms), --motion-default (240ms), --motion-slow (450ms)

### 15.2 Component Compliance
- [ ] **DS-8** EmptyState component used consistently for empty states (not raw `<p>`)
- [ ] **DS-9** StatusChip used for all status displays
- [ ] **DS-10** KeyValue used for metadata grids with tabular-nums
- [ ] **DS-11** SkeletonCard/SkeletonList used for loading states
- [ ] **DS-12** ErrorState used for error displays
- [ ] **DS-13** Toast used for success/error feedback
- [ ] **DS-14** ThreadShell used for all thread rendering
- [ ] **DS-15** HostThreadSection used for entity-attached discussions

### 15.3 AI Aesthetic Avoidance
- [ ] **DS-16** No rounded-3xl (24px) — only rounded-2xl (16px) for cards
- [ ] **DS-17** No indigo/purple/violet gradient backgrounds
- [ ] **DS-18** No oversized padding (p-8+) outside hero contexts

---

## SUMMARY

| Part | Area | Item Count |
|------|------|-----------|
| 1 | Setup & First-Run | 11 |
| 2 | Navigation & Shell | 48 |
| 3 | Conversations | 42 |
| 4 | Work — Portfolio | 28 |
| 5 | Work — Bet Detail | 38 |
| 6 | Work — Task Detail | 20 |
| 7 | Work — Team Detail | 26 |
| 8 | Work — Routine Detail | 18 |
| 9 | Knowledge | 52 |
| 10 | Agent Profile | 14 |
| 11 | Artifacts | 12 |
| 12 | Settings — All Sections | 58 |
| 13 | API Endpoint Verification | 85 |
| 14 | Cross-Cutting Concerns | 30 |
| 15 | Design System Compliance | 18 |
| **TOTAL** | | **500** |
