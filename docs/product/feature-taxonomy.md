# HyperIdle Feature Taxonomy

Complete inventory of features organized by architectural layer. Primitives compose into views. Views compose into the product. Each feature is tagged with its code status from the June 2026 audit.

**Code status key:** WORKS = shipped and functional, PARTIAL = exists with gaps, DEAD = code exists but not wired, NONE = not implemented

---

## Layer 1: Primitives

The building blocks that everything else composes. A primitive is a single concept with one schema, one API surface, and one or more view components that render it. Primitives are kernel-level (structural, stable). Some have a strategy-fabric extension (computed signals that evolve).

### Thread

One table, one primitive. No `type` column. A "review thread" is just a thread containing a review-type message. Classification (review/chat/coach/dm/feed) is derived at runtime via `classifyThreadConfiguration()`, never stored.

| Feature | Status | Layer | Notes |
|---|---|---|---|
| Thread table (hostKind, hostId, pinned, resolvedAt) | WORKS | Kernel | Hosts: bet, task, knowledge_item, artifact, agent, user, team, factory |
| Message types: plain, review, questionnaire, verdict | WORKS | Kernel | Discrimination is on the MESSAGE, not the thread |
| Verdict decisions: approve, approve-with-comments, request-changes, edit, reject | WORKS | Kernel | Verdict is a message type that resolves the thread |
| Idempotent append (clientKey deduplication) | WORKS | Kernel | At-least-once delivery safety |
| Coach thread = pinned thread with hostKind="user" | WORKS | Kernel | No separate schema. Auto-created via GET /api/threads/coach |
| Blocking derivation (is agent paused waiting?) | WORKS | Kernel | Derived from message state + session, not stored |
| Thread-level filtering (Blocking/Unread chips) | WORKS | View | Toggle chips in Conversations, independently toggleable |
| Snooze/Escalate sidecar operations | NONE | -- | Zero code. Not implemented. |
| Bulk operations (approve-similar, snooze-all) | NONE | -- | Zero code. Not implemented. |

**View components:** HostThreadSection (shared across 4 pages: WorkBet, WorkTask, KnowledgeDetail, ArtifactPermalink), ThreadShell (design-system, used in Conversations), ThreadRow (design-system, used in ThreadSections), CommentRow, RichMessageCard.

### Block

Derived, not stored. One pure function (`deriveBlocks()`) takes markdown + host info, returns typed blocks with stable IDs. No `blocks` table. On-disk format is always GFM markdown.

| Feature | Status | Layer | Notes |
|---|---|---|---|
| deriveBlocks() pure function (10 kinds) | WORKS | Shared | heading, paragraph, list, quote, code, table, divider, image, html, unknown |
| Server-computed deterministic IDs | WORKS | Shared | Scoped by host (knowledge_item:id or bet:id). Same markdown = same IDs. |
| Bet pitch rendering as blocks | WORKS | View | BetPitch adapter in WorkBet calls deriveBlocks() |
| Knowledge body rendering as blocks | WORKS | View | KnowledgeBody adapter in KnowledgeDetail calls deriveBlocks() |
| Block-anchored messages (blockId on plain messages) | WORKS | Kernel | Messages carry optional blockId. Rendered inline below blocks. |
| Anchor-lost indicator for orphaned anchors | WORKS | View | When body edited and block disappears, message preserved with indicator |

**View components:** Block (design-system), BetPitch (WorkBet co-located adapter), KnowledgeBody (KnowledgeDetail co-located adapter), AnchoredMessages.

### Artifact

Task-rooted record of something agents produced. One table, one API. Higher-level surfaces (bet, team, portfolio) aggregate read-only from tasks.

| Feature | Status | Layer | Notes |
|---|---|---|---|
| Artifact CRUD (POST/GET with axis filtering) | WORKS | Kernel | producingTaskId required. Kinds: code, document, diagram, decision, plan, proposal, report |
| Artifact permalink (/artifacts/:id) | WORKS | View | Renders single_full_preview layout |
| Preview data (null until populated, immutable once set) | WORKS | Kernel | No fake thumbnails. Explicit placeholder when null. |
| ArtifactView 5 shapes | PARTIAL | View | 3 of 5 reachable via artifactToView mapping (text_diff, action_summary, data_metrics). content_preview and visual_comparison coded but unmapped. |
| 3 view layouts (gallery_card, stack_item, single_full_preview) | WORKS | View | review_message_embed referenced in comments only, not built |
| Higher-level aggregation (bet/team/portfolio) | WORKS | View | Read-only union of task artifacts |

**View components:** ArtifactSection (shared across WorkBet, WorkTeam), ArtifactPreviewSurface (design-system), ArtifactGalleryCard, ArtifactStackItem, ArtifactView.

### Knowledge Item

Kernel table + strategy fabric extension. Kernel owns identity and content. Fabric owns computed signals (attention, relevance, layer, confidence).

| Feature | Status | Layer | Notes |
|---|---|---|---|
| knowledge_items table (scopeKind, scopeId, topic, title, body, status, version) | WORKS | Kernel | 7 scopes: factory, product, practice, team, bet, task, user |
| knowledgeStrategyFabric table (layer, attentionScore, relevanceScore, confidence) | WORKS | Strategy | 1:1 extension via UNIQUE FK + CASCADE DELETE. Populated in production. |
| Status lifecycle: captured -> provisional -> active -> stale -> archived | WORKS | Kernel | needs_human as additional status for triage |
| 8 kind taxonomy (pattern, anti_pattern, decision, failure, brief, principle, reflection, focus) | WORKS | Strategy | Creation UI exposes 4 kinds (pattern/decision/failure/brief). List renders all 8. |
| Version tracking (optimistic concurrency) | WORKS | Kernel | 409 conflict on version mismatch |
| Edit log (every mutation tracked) | WORKS | Kernel | knowledgeEditLog table: editor, field, old/new values, edit type |
| Access log (detail fetches counted server-side) | WORKS | Kernel | knowledgeAccessLog table. Materialization does NOT count. |
| Scope change with reason + version bump | WORKS | Kernel | PATCH /api/knowledge/:id/scope |

**View components:** KnowledgeListRow (custom, replaces design-system KnowledgeRow), KnowledgeTopicGroup, KnowledgeBody, BacklinksCard.

---

## Layer 2: Process Primitives

Work coordination primitives. These define how work flows through the system.

### Bet

Shaped commitment with money-not-duration appetite. The unit of planned work.

| Feature | Status | Layer | Notes |
|---|---|---|---|
| Bet table (description, costAppetite, doneCondition, hypothesis, status) | WORKS | Kernel | 4 statuses: draft, active, completed, killed |
| Create (BetCreateDialog: description + team required) | WORKS | View | costAppetite, doneCondition, hypothesis optional. Low ceremony. |
| Start (draft -> active via POST /commit) | WORKS | Kernel | |
| Complete (active -> completed via POST /ship) | WORKS | Kernel | |
| Kill (with required reason via POST /kill) | WORKS | Kernel | |
| Pause/Resume | DEAD | -- | UI buttons + consequence dialog exist. Endpoints DON'T EXIST. Broken promise. |
| Outcome recording (validated/refuted/partial/inconclusive) | WORKS | Kernel | Evaluates whether the bet's HYPOTHESIS held true |
| Retro (outcome + learnings -> knowledge item) | WORKS | Kernel | POST /retro creates knowledge item atomically |
| At-risk flag | WORKS | Kernel | Boolean with reason |
| Revision log (audit trail) | WORKS | Kernel | Every change to doneCondition/hypothesis tracked |
| No betStrategyFabric | -- | -- | Strategy separation not yet designed for bets |

### Task

Agent-owned work unit within a bet. 8-state machine for agent coordination.

| Feature | Status | Layer | Notes |
|---|---|---|---|
| Task table (betId, ownerAgentId, title, description, doneCondition, state) | WORKS | Kernel | |
| 8-state machine (proposed -> accepted -> hold -> in_progress -> blocked -> review -> done -> killed) | WORKS | Kernel | Valid transitions enforced |
| Transitions (POST /tasks/:id/transition) | WORKS | Kernel | |
| Handoff (POST /tasks/:id/handoff) | WORKS | Kernel | To agent ID, role string, or human. Structured message. |
| Outcome verdict (met/met_with_rework/partially_met/not_met) | WORKS | Kernel | Set manually after task done. Evaluates whether DONE CONDITION was met. Rendered on 3+ pages. Bet outcomes aggregate from task verdicts. |
| Dependencies (JSON array of task IDs) | DEAD | Kernel | Field exists. NO API to set. NO UI to view. checkAndUnblockDependents() tested but never called. |
| taskStrategyFabric (riskTier) | DEAD | Strategy | Table exists. Never populated in production routes. |

### Session

Bounded agent execution on a task. The actual "agent does work" unit.

| Feature | Status | Layer | Notes |
|---|---|---|---|
| Session table (taskId, agentId, modelTier, state, cost, tokens) | WORKS | Kernel | States: queued, running, completed, failed |
| Create + provision (POST /api/sessions) | WORKS | Kernel | Full 11-phase provisioning when adapters present |
| End + effectiveness scoring (PATCH /api/sessions/:id) | WORKS | Kernel | effectivenessScore float 0-1 (AC1) |
| Activity stream (ring buffer for dial-in) | WORKS | Kernel | SessionActivityBuffer, consumed by SessionActivityPanel |
| Session -> Task propagation | WORKS | Strategy | session_ended event -> task auto-transitions to review when completed |

### Routine

Recurring automated work. Cron-triggered, cost-capped, with delegation.

| Feature | Status | Layer | Notes |
|---|---|---|---|
| Routine table (name, ownerAgentId, teamId, triggerType, triggerConfig, state) | WORKS | Kernel | States: active, paused, error |
| CRUD (create, edit, pause, delete) | WORKS | View | Full management UI on WorkRoutine page |
| Manual trigger ("Trigger Now") | WORKS | Kernel | POST /api/routines/:id/trigger provisions session |
| Cron scheduling (automatic fire) | DEAD | Strategy | startRoutineScheduler() tested, NEVER CALLED in production. One function call fix. |
| Run history (last 20 runs) | WORKS | View | Outcome, cost, duration per run |
| Per-run + monthly cost caps | WORKS | Kernel | Both enforced on manual trigger. budget_exhausted outcome on breach. |
| Sleep-time (silent flag) | DEAD | Strategy | Flag exists, scheduler logic checks it. But scheduler never runs. |
| Delegation (findDelegate) | DEAD | Strategy | Fully implemented in scheduler. But scheduler never runs. |
| Stub task (routine session without task context) | WORKS | Kernel | AA2 feature |

### Team

Persistent agent group bound to a product.

| Feature | Status | Layer | Notes |
|---|---|---|---|
| Team table (name, phase, functions) | WORKS | Kernel | |
| Team members table (members, leadAgentId, capacity, costCap) | WORKS | Kernel | |
| Auto-provisioning (defaultRoster from team functions) | DEAD | Kernel | Function exists. Team creation HARDCODES builder + PM. Functions field silently ignored. |
| Agent add/edit from team view | WORKS | View | AgentAddDialog, AgentEditDialog |

---

## Layer 3: Views

Compositions of primitives into user-facing surfaces. Each view assembles primitives — it doesn't own separate data.

### Conversations

Composes: Thread + Message + Verdict + ArtifactView + SessionActivityPanel

| Feature | Status | Notes |
|---|---|---|
| Thread list with section grouping (blocking/active/resolved) | WORKS | Derived from message content, not stored type |
| Review message rendering (RichMessageCard) | WORKS | Promotes review/questionnaire messages to card with verdict buttons |
| 5 verdict buttons (approve through reject) | WORKS | Sticky footer on promoted card |
| RecipientPicker for new threads (N key) | WORKS | Creates DM thread with selected agent/user |
| Session dial-in companion pane (D key) | WORKS | ThreadShell (3fr) + SessionActivityPanel (2fr) side-by-side |
| CoC overlay (bottom-right, Chief of Staff) | WORKS (shell only) | UI exists. No agent processes responses. User types, gets silence. |
| Agent reasoning display | PARTIAL | Reasoning array renders as `<ol>`. ReasoningBlockView exists but unmounted. |
| Confidence indicator | NONE | No confidence field on messages |

### Work

Composes: Bet + Task + Session + Artifact + Thread + Block

| Feature | Status | Notes |
|---|---|---|
| Portfolio page (grid of team cards) | WORKS | Navigation page. Filters work. Consider: skip when teams.count = 1. |
| Team view (bets, roster, burn/cap, routines) | WORKS | Factory floor view. Real data. |
| Bet detail (pitch as blocks, task list, artifacts, discussion) | WORKS | Pitch rendered via Block primitive. HostThreadSection for discussion. |
| Task detail (metadata, sessions, artifacts, discussion) | WORKS | HostThreadSection for discussion. Live session indicator. |
| Routine detail (config, run history, budget) | WORKS | Manual trigger works. Cron scheduling dead. |
| Bet create dialog | WORKS | Description + team required. Hypothesis/doneCondition/appetite optional. |

### Knowledge

Composes: KnowledgeItem + Block + Thread + KnowledgeStrategyFabric

| Feature | Status | Notes |
|---|---|---|
| Dual-tab list (Curated by topic + Triage by attention) | WORKS | Topic groups with health indicators. Scope filter pills. |
| Triage keyboard flow (j/k/v/x, optimistic removal) | WORKS | Highest-value knowledge feature |
| Detail with TipTap editing + auto-save | WORKS | 1500ms debounce, 409 conflict detection |
| Per-block discussion (anchored messages) | WORKS | Block popover with "Discuss". Orphan detection. |
| Related items sidebar (BacklinksCard) | WORKS | API-driven related items |
| Creation (4 kinds exposed, 7 scopes) | WORKS | Right asymmetry: agents create the other 4 kinds |
| Flag/Archive actions | DEAD | Buttons visible in overflow menu, onClick does nothing. API endpoints work. |
| Merge/Split | API ONLY | Endpoints work. No UI surface. |

---

## Layer 4: Shell & Infrastructure

Cross-cutting surfaces and capabilities.

### App Shell

| Feature | Status | Notes |
|---|---|---|
| Sidebar (200px, 3 sections: Conversations, Work, Knowledge) | WORKS | Bottom strip: CoC trigger, Settings, Search |
| Knowledge triage badge | WORKS | Count pill on Knowledge section header. Only working ambient signal. |
| Blocking/unread badges on other sections | NONE | Conversations and Work have no ambient indicators outside their own views |
| Global search (Cmd+K) | DEAD | UI opens, keyboard nav works. API returns 404. "Search coming soon." |
| Breadcrumbs (within-view navigation) | WORKS | Work: Portfolio > Team > Bet > Task |

### Settings

| Feature | Status | Notes |
|---|---|---|
| Profile (name, email) | WORKS | |
| Appearance (light/dark theme) | WORKS | |
| Model gateway (3 tiers, provider selection) | WORKS | Auto-save with debounce, credential status dots |
| Org chart (review routing edges) | WORKS | Direct/function/team mechanisms. Irrelevant for solo founder. |
| Notification config | DEAD | 4 toggles render. useState only, not wired to PATCH endpoint. Settings evaporate on refresh. |
| Credentials | PARTIAL | Server-side AES-256-GCM works. Partially exposed via model gateway UI. |

### Onboarding

| Feature | Status | Notes |
|---|---|---|
| Setup flow (name + API key + repo path) | WORKS | Creates user + team + stores credential. 60 seconds. |
| First-time hints (5 of 6 render) | WORKS | Contextual cards with "Got it" dismiss. Server-persisted. |
| Post-setup redirect | WORKS | -> /work/portfolio |

### Agent Configuration

| Feature | Status | Notes |
|---|---|---|
| Agent profile page | WORKS | Identity, config, skills, activity, performance, health |
| Soul prompt editing | WORKS | Templates for 8 of 15 roles |
| Agent creation/deletion | WORKS | AgentAddDialog, soft-delete to retired |
| Autonomy levels (L1-L4 per skill) | DEAD | Read-only display. PATCH endpoint works. No edit UI. No graduation logic. |

### Cost & Budget

| Feature | Status | Notes |
|---|---|---|
| Structured money (bigint minor units + currency) | WORKS | Token usage per tier (reasoning/workhorse/fast) |
| Budget enforcement (checkCostCap) | PARTIAL | Blocks new sessions. Routine caps enforced. No model tier downgrade. |
| Cost visibility UI | NONE | Zero components render cost anywhere. Rail deleted. API returns zeros for spend. |

### Lifecycle Propagation

| Feature | Status | Notes |
|---|---|---|
| Session -> Task (auto-transition to review) | WORKS | Via session_ended event in fabric |
| Task -> Bet (auto-transition to completed) | WORKS | CAS-protected. All tasks terminal triggers bet review. |
| Propagation log | WORKS | Every attempt logged with status (applied/skipped/failed) |
| Dependency watcher | DEAD | Function tested. Never called. Dependencies field never populated. |

---

## Kernel vs Strategy Boundary

The separation is real and enforced at the package level.

```
packages/server (kernel) --> packages/fabric (strategy) --> packages/db, packages/shared
                                    ^
                         strategyBootstrap hook in app.ts
                         (kernel-only mode works without it)
```

| Aspect | Kernel (server + db) | Strategy (fabric) |
|---|---|---|
| Package dependency | Does not import fabric business logic | Does not import server |
| Event coupling | Emits events | Subscribes via strategyBootstrap |
| Knowledge | knowledgeItems table | knowledgeStrategyFabric (attention, relevance, layer) |
| Tasks | tasks table | taskStrategyFabric (riskTier) -- exists but NOT populated |
| Bets | bets table | No extension table yet |
| Lifecycle | State machines, transitions | Propagation handlers (session->task->bet) |
| Routines | CRUD, manual trigger | Scheduler, delegation, sleep-time (all dead -- scheduler not started) |
| Scoring | -- | Attention scoring, relevance scoring |
| Notifications | Queue table | Dispatch handlers |
