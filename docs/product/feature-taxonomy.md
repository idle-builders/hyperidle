# HyperIdle Feature Taxonomy

Complete inventory of features grouped by product area. Used for user-journey auditing and product-fit analysis.

---

## Product Group 1: Conversations & Review

The inbox where humans review agent work and communicate with agents.

### 1.1: Review Threads
- Review thread creation (risk-tier >= medium or skill changes)
- ArtifactView: text_diff (code diffs with inline comments)
- ArtifactView: content_preview (rendered blog/email/landing page)
- ArtifactView: visual_comparison (before/after images)
- ArtifactView: action_summary (structured impact card)
- ArtifactView: data_metrics (charts, insights, recommendations)
- Verdict: approve, approve-with-comments, request-changes, edit, reject
- Non-binding: comment, inline comment
- Sidecar: snooze, escalate
- Bulk operations (approve-similar, snooze-all, mark-read)
- Agent reasoning block (collapsible, always shown)
- Confidence indicator
- Blocking indicator
- Companion layout (conversation + artifact side-by-side)

### 1.2: Chat Threads
- Agent-initiated chat (no verdict needed)
- Human-initiated chat (N key -> RecipientPicker)
- Thread resolution and re-opening

### 1.3: Coach Thread (Chief of Staff)
- Pinned thread at top of Conversations
- Cross-product pattern surfacing
- Rule-change proposals (PRINCIPLES.md / FOCUS.md)
- Monthly coaching rhythm
- CoC overlay (bottom-right, accessible from any view)
- Context chips for attached references

### 1.4: Session Dial-In
- Live session observation (D key toggle)
- Activity stream (tool calls, reasoning, cost ticks)
- Filter tabs (All, Tools, Reasoning, Cost)
- Auto-scroll with manual pause

### 1.5: Thread Infrastructure
- Universal thread primitive (attached to any host entity)
- Message types: plain, review, questionnaire, verdict
- Idempotent message append (clientKey deduplication)
- Thread-level filtering (Blocking, Unread)

---

## Product Group 2: Work & Planning

Where humans plan bets, track tasks, and manage the portfolio.

### 2.1: Portfolio
- Grid of product/team status cards
- Status/verdict/team filter pills
- Routine and agent summary lines

### 2.2: Team View
- Header (breadcrumb, name, status, phase, lead)
- Burn vs cap visualization
- Active bets section with BetCards
- Roster section with agent members
- Agent add/edit dialogs
- Create routine dialog

### 2.3: Bet Lifecycle
- Bet creation (BetCreateDialog: markdown pitch + appetite)
- Bet start (draft -> active)
- Bet completion (active -> completed)
- Bet kill (with required reason)
- Outcome recording (validated/refuted/partial/inconclusive)
- Retro (outcome + learnings -> knowledge item)
- Cost appetite (structured money: minor units + currency)
- At-risk flag, done condition, hypothesis

### 2.4: Task Management
- 8-state machine (proposed -> accepted -> hold -> in_progress -> blocked -> review -> done -> killed)
- Task transitions and handoffs (agent/role/human)
- Dependency tracking with auto-unblock
- Task outcome verdict (met/met_with_rework/partially_met/not_met)

### 2.5: Bet Detail
- Pitch rendered as Block primitives with anchored messages
- Task list with cost columns
- Outcome section with verdict badging
- Discussion thread, artifact section
- Knowledge creation from context

### 2.6: Task Detail
- Metadata grid (state, owner, team, cost, effectiveness)
- Session list with live indicator
- Artifact section, discussion thread

---

## Product Group 3: Knowledge & Learning

Where humans curate organizational knowledge.

### 3.1: Knowledge List & Browse
- Dual-tab view (Curated + Triage)
- Scope filter pills, sort controls (Relevance/Recency/Frequency)
- Kind badges (8): pattern, anti_pattern, decision, failure, brief, principle, reflection, focus
- Status badges (5): captured, provisional, active, stale, archived
- Topic groups with health indicators

### 3.2: Knowledge Triage
- Attention-score ordered inbox
- Keyboard shortcuts (j/k/v/x)
- Optimistic removal on action
- needs_human status filter

### 3.3: Knowledge Detail & Editing
- Inline editing with auto-save (TipTap WYSIWYG)
- Version tracking (optimistic concurrency)
- Block rendering with per-block discussion
- Related items sidebar, edit history

### 3.4: Knowledge Actions
- Merge duplicates, split overloaded items
- Flag for revisit, archive stale items
- Scope change with reason + version bump

### 3.5: Knowledge Creation
- Full-page create (/knowledge/new)
- Seven scopes: factory, product, practice, team, bet, task, user
- Create from bet/task discussion context

### 3.6: Knowledge Fabric (Infrastructure)
- Materialization engine (TOON/markdown to workspace)
- Continuous writeback (file watcher, 500ms debounce)
- Relevance scoring (recency x frequency x citation)
- Attention scoring (8 signals)
- Conflict resolution (LWW structured, facilitator for prose)
- Layer precedence (L4 > L3 > L2 > L1)

---

## Product Group 4: Agent Management

### 4.1: Agent Profiles
- Identity, config, skills, 7-day activity, performance stats
- Health signals (failure rate, crash detection, harness availability)
- Active session indicator, idle duration

### 4.2: Agent Configuration
- Soul prompt editing (inline persona text)
- Soul prompt templates per role
- Harness type preference, model tier preference
- Max concurrent sessions

### 4.3: Agent Roster & Teams
- Agent creation (name, role, soul prompt, config)
- Agent soft-delete (retired status)
- Auto-provisioning based on team functions
- Three categories: team, strategy, personal

### 4.4: Skills & Autonomy
- Per-agent-per-skill autonomy (L1-L4)
- Success/failure tallies for graduation
- Autonomy level editing

---

## Product Group 5: Routines & Automation

### 5.1: Routine Management
- Create, edit, pause, resume, soft-delete
- Detail page (config, run history, budget)
- Manual trigger ("Run now")

### 5.2: Scheduling & Triggers
- Calendar trigger (cron with human-friendly presets)
- Run history table, last run summary, next run timestamp

### 5.3: Routine Cost Control
- Per-run cost cap, monthly cost cap
- Cost breakdown (bets vs routines) in team view

### 5.4: Sleep-Time Routines
- Memory-only runs (no threads, no reviews)
- Fast-tier agent context freshness

---

## Product Group 6: Cost & Budget Management

### 6.1: Cost Tracking
- Structured money (bigint minor units + currency)
- Token usage per tier (reasoning/workhorse/fast)
- Session -> task -> bet -> team rollup

### 6.2: Budget Enforcement
- Agent/team/factory nested caps
- Cap breach -> review thread (never silent drop)
- Model tier downgrade when approaching threshold
- Work pause on factory cap breach

### 6.3: Cost Visibility
- Daily/weekly burn vs budget
- Bet cost vs appetite, team burn chart
- Real-time cost in session dial-in

---

## Product Group 7: Ambient Awareness (Rail)

### 7.1: Rail Dashboard (deleted in U6, functions distributed)
- Active bets & progress
- Blocked agents/tasks with expand
- Knowledge additions count
- Cost burn rate, system stability
- Unread thread count

---

## Product Group 8: Search & Navigation

### 8.1: Global Search (Cmd+K)
- Search across Conversations, Work, Knowledge
- Grouped results, keyboard navigation

### 8.2: App Shell & Navigation
- 200px sidebar (Conversations, Work, Knowledge)
- Recent threads, team list, breadcrumbs
- Knowledge triage badge

---

## Product Group 9: Settings & Administration

### 9.1: User Settings
- Profile (name, email), Appearance (theme)

### 9.2: System Settings
- Notification config, model gateway config
- Credentials management, org chart (review routing)
- Backend config, worker status (shared-mode)

---

## Product Group 10: Onboarding & Setup

### 10.1: Setup Flow
- First-run: name + API key + optional repo path
- Auto team creation, post-setup redirect

### 10.2: First-Time Hints
- 6 contextual hints with per-user dismissal

### 10.3: Invite & Auth (Shared Mode)
- Invite codes, bearer token auth, claim flow

---

## Product Group 11: Cross-Cutting Primitives

### 11.1: Artifact System
- Task-rooted artifacts (7 kinds)
- Typed preview data, four view layouts
- Artifact permalink, higher-level aggregation

### 11.2: Block Primitive
- 10 block kinds, server-computed IDs
- Bet pitch and knowledge body rendering
- Block-anchored messages with anchor persistence

### 11.3: Lifecycle & Propagation
- Session->Task, Task->Bet auto-transitions
- Dependency watcher (auto-unblock)
- Propagation log with retry heartbeat
- Five-level hierarchy (portfolio -> product -> bet -> task -> session)
