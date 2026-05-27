## 2. Usability Requirements

### UX-1: One App, One Door

The human interface ships as a single native macOS desktop application ("the Factory"). The human never decides "which app do I open." They open the Factory and the Factory presents the right thing.

**UX-1.1** Desktop is a single Electron window with four persistent zones: an **IconRail** (left, view switching), a **Submenu** (per-view, collapsible), a **Main** pane (active content — Conversations, Work, or Knowledge), and a **Rail** (right sidebar, ambient state — always visible, expandable to full panel or minimizable to icon strip). The Rail is the only notification surface; there is no top-bar bell or global toast stream.

**UX-1.2** Desktop-only. No mobile form factor.

**UX-1.3** First-run experience: SetupFlow page guides profile creation (name, email), first product setup, and optional API key configuration. Contextual hints (5 total) appear at key moments for first-time interactions (e.g., first empty bet view, first review thread).

**UX-1.4** One codebase. Electron bundles the Hono API server in-process with the React renderer.

### UX-2: One Interaction Grammar

**UX-2.1** The threading UI is built once and reused for review items, chat items, the Coach thread, and agent-to-agent threads the human is copied on. One component, written once.

**UX-2.2** Review threads use a streamlined verdict model. Primary actions: approve, request changes, reject, snooze — always visible with keyboard shortcuts (A, R, X, S). Secondary actions in overflow menu: edit, escalate, delegate, comment only. Inline comments on specific artifact parts.

**UX-2.3** Chat threads support reply, start-a-task, close, and escalate.

**UX-2.4** The Chief of Staff is accessible via an overlay triggered from a button in the bottom-right of the Rail. Opens as a dedicated overlay surface without leaving the current view context. Same interaction grammar as any other thread.

**UX-2.5** Every thread item carries visible `reasoning` — why the agent surfaced this. Non-negotiable for trust.

### UX-3: Notification Discipline

**UX-3.1** Push notifications fire only for blocking review items (risk ≥ medium) and chat items the agent explicitly flagged as urgent. Everything else is silent.

**UX-3.2** Non-urgent items batch into a daily digest.

**UX-3.3** Quiet hours and silence modes are per-human and per-product. A founder can mute one product without going dark on others.

**UX-3.4** Per-agent notification preferences allow dialing down a noisy agent without system-wide changes.

### UX-4: Ambient Awareness (The Rail)

**UX-4.1** The Rail is always visible on desktop. It shows: active bets with status indicators, current blockers, cost burn rate, unread chat count, and items awaiting ordering.

**UX-4.2** The Rail can change colors, show counters, animate status indicators. It cannot demand attention. If something needs attention, it goes to Conversations.

**UX-4.3** The Rail expanded panel shows: blocked agents (always first), active bets with progress, cost burn, agent activity summary, unread breakdown, knowledge additions, recent completions feed, and system stability.

**UX-4.4** Rail expand/collapse state persists globally across view switches. Expanding the Rail in Conversations keeps it expanded when switching to Work.

**UX-4.5** Keyboard shortcut to toggle Rail expand/collapse.

**UX-4.6** Keyboard-first interaction: arrow keys to move, enter to act, no mouse required.

### UX-5: Work View

**UX-5.1** The Work view has a five-level drill-down hierarchy: Portfolio (all products), Product (= Team — canvas + task list), Bet Detail (pitch as styled blocks + tasks + artifacts + thread), Task, and Session (jump-out to harness). Navigation drills down; breadcrumbs navigate back up.

**UX-5.2** Portfolio Overview shows product status cards (with velocity sparklines), portfolio-level metrics, and cycle management (phase indicator, advance action, past cycle summaries with cost variance).

**UX-5.3** Team View has two areas: a bet canvas (top, showing committed bets with capacity indicator) and a task kanban (bottom, showing all tasks across current bets in four columns: Planned, In Progress, Blocked, Done).

**UX-5.4** Pitches are only visible when the founder clicks "Add bet (+)" on the canvas. This opens a pitch selector overlay that replaces the task kanban temporarily. The founder can browse, expand, commit, reshape, kill, or create new pitches. Closing the selector returns to the task kanban.

**UX-5.5** Capacity is a hard limit on the bet canvas. The commit action on a pitch card enforces it. Cards that exceed capacity cannot be committed. Founders can also create new bets with markdown pitches via BetCreateDialog ("+" button on Canvas).

**UX-5.6** No backlog. Pitches not picked drift off after two cycles unless reshaped.

**UX-5.7** Bet status lifecycle: shaped → committed → in-progress → behind → blocked → paused → shipped → killed. Terminal states (shipped, killed) persist in completed bets archive accessible from the portfolio.

**UX-5.8** Cycle management UI: cycle phase indicator (Shaping / Betting / Building / Cool-down), advance-cycle action, past cycle summaries with cost variance (actual vs. appetite per shipped bet).

**UX-5.9** Pitch creation happens in-app via the pitch selector: a "New Pitch" form (title, appetite, problem, solution sketch, rabbit holes, done condition). No external tooling required.

**UX-5.10** Work view is desktop only. Tasks are agent-owned — humans do not drag or move tasks between states. State changes are requested via thread conversations. Bet-level actions (pause, stop, adjust appetite) show consequence previews before execution.

### UX-6: Knowledge View

**UX-6.1** The Knowledge view supports three scopes (practice, product, factory) selectable via scope selector. Two main views: Curated (all active items grouped by topic) and Triage (needs attention + drafts + stale, sorted by attention score). Additional sort options within each view.

**UX-6.2** Supports: nudge priority, flag items, merge duplicates, split overloaded topics, rename, archive, and inline edit.

**UX-6.3** Merge workflow: select target item from same-topic list → preview combined result → confirm. Source item archived with redirect. Split workflow: select text section → promote to new item → auto-cross-link both.

**UX-6.4** Every knowledge item shows provenance: origin agent, creation context, evidence links. Related items sidebar shows auto-suggested and manually linked items.

**UX-6.5** Knowledge gap detection: topics with zero active items or no activity in 90+ days are highlighted in the topic browser.

**UX-6.6** Desktop only.

### UX-7: Trust-Building Mechanisms

**UX-7.1** Reasoning visible by default on every item.

**UX-7.2** Cost transparency: every action shows token spend; the Rail has a daily burn-rate strip.

**UX-7.3** Reversibility cues: items tagged "reversible" or "irreversible." Reversible items approve with lower friction.

**UX-7.4** Graduated autonomy per agent per skill, ranging from L1 (every action approved) to L4 (autonomous unless blocked). Levels are per-agent-per-skill (effectively per-team-per-skill, since the same skill in different products needs different oversight) and move up over time as the success rate justifies it.

### UX-8: App Shell & Navigation

**UX-8.1** Global search (⌘K) searches across all views. Results grouped by type: Threads, Bets/Tasks, Knowledge Items. Keyboard navigation through results (arrow keys, Enter to open, Escape to close).

**UX-8.2** No dedicated notification panel in the top bar. The Rail is the notification surface — minimized strip shows counts (blocked, unread, cost burn), expanded panel shows details and links to relevant views. Push notifications (UX-3) route through the Rail's data, not a separate panel.

**UX-8.3** Settings accessible via gear icon in IconRail. Opens as an overlay (Submenu swaps to settings nav, Main shows active section, Escape to close). Seven sections: Profile, Org Chart, Credentials, Notifications, Appearance, Products, Backend.

**UX-8.4** Keyboard shortcuts: ⌘K (search), ⌘1/2/3 (switch views), ⌘B (toggle Rail), J/K (next/previous in lists), A/R/X/S (verdict actions in review threads), ? (show shortcut help).

**UX-8.5** Thread filtering in Conversations submenu: filter by product, agent, type (review/chat), status (blocking/open/snoozed/resolved). Thread state actions: snooze with timer, archive, mute.

**UX-8.6** Estimated review time displayed on thread list items. Agent-estimated complexity tag helps triage without opening each thread.

**UX-8.7** Agent confidence indicator visible in review thread headers. Helps founder calibrate scrutiny level for complex decisions.

---
