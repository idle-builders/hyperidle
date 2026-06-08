# Feature-Journey Audit

Deep audit of every HyperIdle feature against the user journey from Day 1 to Day 100. Two-phase audit: (1) 7 designer agents did scenario-play analysis per product group, (2) 6 code verification agents checked what actually exists, then 3 designer agents re-judged every feature against code reality.

**Target user:** Solo founder or 2-person founding team running 1-3 products with AI agent teams of 3-6 agents per product.

**Date:** 2026-06-07

---

## Executive Summary

HyperIdle's architecture is structurally sound. The core loop -- review threads with typed verdicts, bet lifecycle with money-not-duration budgets, block-rendered pitches, lifecycle propagation -- works end-to-end in code. The block system and lifecycle propagation are production-quality.

The systemic risk is **dead wiring** -- features where the backend is complete and tested, the frontend renders the UI, but the connection between them is missing. The routine scheduler, knowledge actions, autonomy editing, auto-provisioning, and notification settings all follow this pattern: professional UI surface, working API, zero wiring between them.

### Top 10 Findings (Code-Verified)

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | **Routine scheduler never starts** -- `startRoutineScheduler()` exists, tested, never called in production. Routines only fire via manual "Trigger Now." Sleep-time routines, delegation, cron scheduling all dead. | CRITICAL | One function call fix |
| 2 | **Cost visibility is zero** -- Rail deleted, no replacement. No component renders cost/spend anywhere. Founder flies blind on the resource that directly maps to money. | CRITICAL | API exists, needs UI |
| 3 | **Knowledge actions are dead buttons** -- Flag/Archive in overflow menu call `closeOverflow()` only. User clicks, nothing happens. API endpoints work. | HIGH | Wire onClick to POST |
| 4 | **Autonomy editing has no UI** -- PATCH endpoint works and creates audit threads. Profile shows read-only number. | HIGH | Add edit affordance |
| 5 | **Auto-provisioning broken** -- `defaultRoster()` never called. Team creation hardcodes builder + PM regardless of team functions. | HIGH | Call existing function |
| 6 | **Bet Pause/Resume endpoints missing** -- UI has buttons + consequence dialog. Endpoints don't exist. User follows 3-step flow, gets error. | HIGH | Add endpoints or remove buttons |
| 7 | **Notification settings don't persist** -- Toggles use `useState` only. Refresh resets everything. Backend PATCH endpoint ready. | MODERATE | Wire to `useSettings().save()` |
| 8 | **Search API missing** -- Cmd+K opens, types, shows "Search coming soon." Every time. | MODERATE | Add `/api/search` route |
| 9 | **No ambient awareness outside Conversations** -- Blocking/unread counts invisible from Work/Knowledge views. Only knowledge triage badge works. | MODERATE | Add sidebar badges |
| 10 | **CoS thread has no responder** -- Overlay invites conversation, user types, nothing responds. | MODERATE | Wire agent or hide until ready |

### Corrections from Code Verification

| Previous Claim | Reality |
|---|---|
| "First-time hints: backend only, no UI" | **WRONG.** Hints fully work -- 5 of 6 render across 4 pages with visible cards and "Got it" dismiss buttons. |
| "Sleep-time routines: most underrated feature" | **DEAD.** Scheduler never starts. Sleep-time is well-designed dead code. |
| "Auto-provisioning: best Day 1 decision" | **BROKEN.** Function exists, never called. Every team gets builder + PM. |
| "Delegation: not implemented" | **WRONG.** Fully implemented in scheduler. But scheduler never runs. |
| "Knowledge taxonomy premature (8 kinds)" | **PARTIALLY WRONG.** Creation UI only exposes 4 kinds (pattern/decision/failure/brief). List renders all 8. Right asymmetry. |
| "Dependency watcher: benefits" | **DEAD CODE.** Exists, tested, never called. Dependencies field never populated. |
| "Confidence indicator: not implemented" | **CONFIRMED.** No code anywhere. |
| "Bulk operations: not implemented" | **CONFIRMED.** No code anywhere. |
| "Snooze/Escalate: not implemented" | **CONFIRMED.** No code anywhere. |

---

## Code-Verified Feature Matrix
 
### Conversations & Review

| Feature | Code Status | Verdict | Notes |
|---|---|---|---|
| Review threads | WORKS | **BENEFITS** | Core product. Full discriminated union, promoted card, sticky verdict footer. |
| Verdict system (5 decisions) | WORKS | **BENEFITS** | All 5 buttons render and POST. Approve-with-comments prevents rubber-stamping. |
| Chat threads + RecipientPicker | WORKS | **BENEFITS** | N key opens picker, creates threads. Human-to-agent DMs work. |
| Coach thread + CoC overlay | WORKS (UI shell) | **NEUTRAL** | UI exists, messages persist. But no agent processes them. User types, gets silence. |
| Session dial-in | WORKS | **BENEFITS** | D key, companion pane (3fr/2fr), filter tabs, auto-scroll. Distinctive feature. |
| Blocking indicator | WORKS | **BENEFITS** | Red left border, filter chip, derived from session state. Primary triage signal. |
| Thread filtering (Blocking/Unread) | WORKS | **BENEFITS** | Toggle chips, independently toggleable. Simple, correct. |
| Companion layout | WORKS | **BENEFITS** | Side-by-side review + live session. No other tool offers this. |
| ArtifactView (5 shapes) | 3 of 5 reachable | **NEUTRAL** | text_diff, action_summary, data_metrics reachable. content_preview + visual_comparison coded but unmapped. Dead code, not missing code. |
| Agent reasoning | PARTIAL | **NEUTRAL** | Reasoning array renders as `<ol>`. ReasoningBlockView component exists but unmounted. Cosmetic gap -- 10-line fix. |
| Bulk operations | NONE | **DEFER** | No code. Not needed at 3-6 agent scale (5-15 reviews/day). |
| Confidence indicator | NONE | **DEFER** | No code. Needs calibrated agent confidence signal first. |
| Snooze/Escalate | NONE | **DEFER** | No code. Solo founder doesn't need temporal review management. |

### Work & Planning

| Feature | Code Status | Verdict | Notes |
|---|---|---|---|
| Portfolio page | WORKS | **BENEFITS** | Real data, filters work. Right landing for multi-product. |
| Team View | WORKS | **BENEFITS** | Bets, roster, burn/cap, agent add/edit, routine create. Factory floor view. |
| Bet Creation | WORKS | **BENEFITS** | Only description + team required. Low ceremony for small bets. |
| Bet Start/Complete/Kill | WORKS | **BENEFITS** | Lifecycle transitions work. Kill requires reason (good discipline). |
| Bet Pause/Resume | MISSING ENDPOINTS | **HURTS** | UI buttons + consequence dialog exist. Endpoints don't. User follows 3-step flow, gets error. Broken promise. |
| Outcome recording + retro | WORKS | **BENEFITS** | POST /outcome and /retro. Closes the learning loop. |
| Bet Detail with blocks | WORKS | **BENEFITS** | Pitch as Block primitives, not `<pre>`. Per-section discussion works. |
| Task 8-state machine | WORKS | **BENEFITS** | Full state machine, valid transitions, handoffs. |
| Task Detail | WORKS | **BENEFITS** | Sessions, artifacts, discussion, live indicator. |
| Dependency auto-unblock | NOT WIRED | **NEUTRAL** | Code exists, tested, never called. Dependencies field never populated. Inert. |

### Knowledge & Learning

| Feature | Code Status | Verdict | Notes |
|---|---|---|---|
| Knowledge List (dual tabs) | WORKS | **BENEFITS** | Curated/Triage, scope filters, kind/status badges, topic groups. |
| Knowledge Triage (j/k/v/x) | WORKS | **BENEFITS** | Keyboard shortcuts, attention-score ordering, optimistic removal. Highest-value knowledge feature. |
| Knowledge Detail (TipTap) | WORKS | **BENEFITS** | Auto-save (1500ms), 409 conflict detection, edit toggle. Production-grade. |
| Knowledge Creation (4 kinds) | WORKS | **BENEFITS** | 4 of 8 kinds exposed in creation (right asymmetry -- agents create the other 4). All 7 scopes. |
| Per-block discussion | WORKS | **BENEFITS** | Anchored messages, orphan detection, anchor-lost indicator. Differentiator. |
| Knowledge Fabric | WORKS | **BENEFITS** | Materialization, writeback, relevance + attention scoring. The compounding engine. |
| Related items sidebar | WORKS | **BENEFITS** | BacklinksCard with API-driven data. Day 14+. |
| Topic health indicators | WORKS | **BENEFITS** | Fresh/some_stale/mostly_stale from archived ratio. Day 14+. |
| Knowledge Actions (Flag/Archive) | API WORKS, UI DEAD | **HURTS** | Buttons visible, click does nothing. Dead buttons erode trust. Wire or hide. |
| Merge/Split | API WORKS, NO UI | **DEFER** | Power-user curation features. Day 30+. Not visible in UI, so no trust damage. |
| Edit history UI | BACKEND ONLY | **DEFER** | Mutations logged. No timeline viewer. Solo founder uses last-modified timestamp. |

### Agent Management

| Feature | Code Status | Verdict | Notes |
|---|---|---|---|
| Agent Profile | WORKS | **BENEFITS** | Full operational picture: identity, config, skills, activity, health. |
| Agent Configuration (edit) | WORKS | **BENEFITS** | Soul prompt, harness, model tier, max sessions. Core knob. |
| Agent Creation | WORKS | **BENEFITS** | Role dropdown, POST /api/agents. Day 1 operation. |
| Agent soft-delete | WORKS | **NEUTRAL** | Two-click, status='retired'. Rare operation. |
| Auto-provisioning | FUNCTION EXISTS, NEVER CALLED | **HURTS** | defaultRoster() ignores team functions. Hardcodes builder + PM. False affordance. |
| Soul prompt templates | 8 of 15 roles | **BENEFITS** | Core roles covered. Biggest reducer of blank-page paralysis. |
| Skills viewing | WORKS | **NEUTRAL** | Read-only display. Useful information, no action possible. |
| Autonomy editing | API WORKS, NO UI | **HURTS** | PATCH endpoint creates audit threads. Profile shows read-only number. Advertises but doesn't deliver. |
| Skill graduation | NOT IMPLEMENTED | **DEFER** | No auto-increment on session completion. Day 60+ feature. |

### Routines & Automation

| Feature | Code Status | Verdict | Notes |
|---|---|---|---|
| Routine Management UI | WORKS | **BENEFITS** | Full CRUD: create, edit, pause, delete, detail page. |
| Manual Trigger | WORKS | **BENEFITS** | "Trigger Now" provisions session. Currently the ONLY way routines fire. |
| Run History | WORKS | **BENEFITS** | Last 20 runs with outcome/cost/duration. |
| Cost caps (per-run + monthly) | WORKS | **BENEFITS** | Both enforced on manual trigger. budget_exhausted outcome recorded. |
| Routine Scheduling (cron) | SCHEDULER NEVER STARTED | **HURTS (CRITICAL)** | `startRoutineScheduler()` complete and tested. Never called in production. One function call fix. |
| Sleep-time routines | DEAD (scheduler dependent) | **DEAD** | Silent flag implemented. Scheduler never runs. Well-designed dead code. |
| Delegation | DEAD (scheduler dependent) | **DEAD** | `findDelegate()` implemented and tested. Only fires during scheduler ticks that never happen. |

### Cost & Budget

| Feature | Code Status | Verdict | Notes |
|---|---|---|---|
| Cost tracking (backend) | PARTIAL | **PARTIAL** | Accumulated at team/agent level. Sessions cost column stripped (O2). Rail API returns zeros. |
| Budget enforcement | PARTIAL | **BENEFITS** | checkCostCap() blocks new sessions. Routine caps enforced. No model tier downgrade. |
| Cost visibility UI | NONE | **HURTS (CRITICAL)** | Zero components render cost data anywhere. Founder can't see what they're spending. |

### Ambient Awareness

| Feature | Code Status | Verdict | Notes |
|---|---|---|---|
| Rail component | DELETED | **N/A** | Replaced by Sidebar in U6. |
| GET /api/rail | EXISTS | **ORPHANED** | Returns bets, blockers, queue. Cost returns zeros. No web client calls it. |
| Knowledge triage badge | WORKS | **BENEFITS** | Numeric count on Knowledge sidebar header. Only working ambient signal. |
| Blocking/unread badges | NOT VISIBLE | **HURTS** | Conversations and Work sections have no ambient indicators outside their own views. |

### Settings & Onboarding

| Feature | Code Status | Verdict | Notes |
|---|---|---|---|
| Setup flow | WORKS | **BENEFITS** | Name + API key + optional repo path. Creates user + team + credential. 60 seconds. |
| First-time hints | WORKS | **BENEFITS** | 5 of 6 hints render across 4 pages. Persistent dismissal. End-to-end functional. |
| Model gateway | WORKS | **BENEFITS** | 3 tiers, provider selection, auto-save, credential dots. |
| Org chart | WORKS | **NEUTRAL** | Works but irrelevant for solo founder. |
| Notification config | LOCAL-ONLY | **HURTS** | Toggles render, state evaporates on refresh. Backend endpoint ready, not wired. |
| Global search (Cmd+K) | UI EXISTS, API MISSING | **HURTS** | Opens beautifully, searches nothing. "Coming soon" every time. False affordance. |

### Artifacts, Blocks, Lifecycle

| Feature | Code Status | Verdict | Notes |
|---|---|---|---|
| Artifact CRUD + permalink | WORKS | **BENEFITS** | POST/GET, axis filtering, /artifacts/:id renders. |
| ArtifactSection | WORKS | **BENEFITS** | Gallery/stack/single layouts. Handles loading/empty/overflow. |
| Block derivation (10 kinds) | WORKS | **BENEFITS** | Pure function, all kinds rendered. Production-quality. Strongest subsystem in the codebase. |
| Block-anchored messages | WORKS | **BENEFITS** | blockId on messages, inline rendering, anchor-lost indicator. |
| Session to Task propagation | WORKS | **BENEFITS** | Subscribes to session_ended, auto-transitions task to review. |
| Task to Bet propagation | WORKS | **BENEFITS** | CAS-protected, all tasks terminal then bet to completed. |
| Propagation log | WORKS | **BENEFITS** | Every attempt logged and indexed. |
| Dependency watcher | NOT WIRED | **NEUTRAL** | Tested function, zero production calls. Dependencies never populated. Low severity -- not promised to users. |

---

## Priority Stack (Code-Verified)

### P0 -- One-Line Fixes That Unlock Major Value
1. **Start the routine scheduler** -- call `startRoutineScheduler()` in `bootstrapFabric()`. Unlocks cron scheduling, sleep-time, delegation. All tested and ready.
2. **Wire knowledge Flag/Archive** -- two POST calls from onClick handlers to existing tested endpoints.
3. **Wire notification persistence** -- import `useSettings` in `SettingsNotifications`, call `save()` on toggle change.
4. **Wire auto-provisioning** -- call `defaultRoster(functions)` in team creation instead of hardcoding builder + PM.
5. **Fix or remove bet Pause/Resume** -- add endpoints (same pattern as kill) or remove UI buttons that promise what doesn't exist.

### P1 -- Small Fixes With Big Trust Impact
6. **Add autonomy edit affordance** -- click-to-edit on skills table cell to existing PATCH endpoint that already creates audit threads.
7. **Add cost visibility** -- render team cost data (already in API responses) on Work team page.
8. **Add ambient badges** -- blocking/unread counts on Conversations sidebar section header, visible from any view.
9. **Mount ReasoningBlockView** -- replace plain `<ol>` with the purpose-built collapsible component that already exists.
10. **Map remaining ArtifactView shapes** -- add content_preview and visual_comparison to the artifactToView switch (renderers already coded).

### P2 -- Features to Build
11. **Search API** -- `/api/search` endpoint. Client code is ready, just needs the backend.
12. **Wire dependency watcher** -- call `checkAndUnblockDependents()` in task transition routes. Function exists and is tested.
13. **Cost burn rate display** -- populate Rail API with real spend data (not zeros), add a UI surface.
14. **CoS agent wiring** -- connect coach thread to actual agent processing so it responds.

### P3 -- Defer Until Scale Demands
15. Bulk operations (approve-similar, snooze-all)
16. Confidence indicators on reviews
17. Snooze/Escalate sidecar operations
18. Edit history timeline viewer
19. Knowledge merge/split UI
20. Skill graduation (auto-promote on session success/failure)
21. Rail rebuild (wait for 3+ product users)

---

## Cross-Cutting Themes

### Theme 1: The Wiring Gap Pattern

The most common failure mode is not missing capability but missing wiring. The routine scheduler, knowledge actions, autonomy editing, auto-provisioning, and notification settings all have: (a) working, tested backend, (b) rendered UI surface, (c) zero connection between them. This pattern suggests the build process ships backend and frontend in separate passes without an integration verification step.

### Theme 2: Dead Buttons Erode Trust Faster Than Missing Features

A button that does nothing is worse than no button. Knowledge Flag/Archive, autonomy levels, bet Pause/Resume, and search all create expectations they cannot fulfill. The user tries the feature, it fails silently, and they learn to distrust the interface. Hiding unfinished features is strictly better than showing them.

### Theme 3: The Strongest Subsystems Are Invisible

Blocks (10 kinds, pure derivation, anchored messages, orphan detection), lifecycle propagation (session to task to bet, CAS protection, propagation log), and knowledge fabric (materialization, writeback, relevance + attention scoring) are production-quality. They are also invisible to the user. The user experiences them as "the pitch renders nicely" and "tasks move to review when agents finish." This is correct -- infrastructure should be invisible.

### Theme 4: Five Lines of Code Unlock Half the Feature Set

The routine scheduler, auto-provisioning, knowledge actions, autonomy editing, and notification persistence are each 2-30 lines of new code calling existing tested functionality. Together they would: unlock automated agent work (cron + sleep-time + delegation), fix 4 dead-button surfaces, make notification config real, and give teams proper role-based agent provisioning. The ROI on these wiring fixes is the highest in the entire codebase.

---

## Appendix: Doc-Based Audit Highlights (Phase 1)

The initial doc-based audit (before code verification) identified these themes that remain valid:

**Money-not-duration appetite** is a genuine conceptual innovation. Shape Up's 6-week timebox made sense for humans; for AI agents that work in bursts, money is the right budget axis.

**One thread primitive** is the best architectural decision. Collapsing review/chat/coach into one Thread with typed messages eliminates N+1 bugs across every cross-domain discussion.

**The blocking/non-blocking distinction** is the right primary sort axis. Most review products sort by time or priority; HyperIdle sorts by "is an agent literally paused waiting for you."

**Knowledge curation burden** remains a concern. 20 min/week x 52 weeks = 17 hours/year. No mechanism shows the founder "this curation session saved your agents 3 hours." Value is invisible, cost is visible.

**The Day 1-14 cold start** is the highest-risk moment. Every view has an empty-state problem. The gap between "setup complete" and "first visible agent output" needs AD2 (Task-to-Session Dispatcher) and AE2 (Onboarding Journey) to bridge it.

**Progressive disclosure** is mentioned nowhere in the Knowledge UI spec. The full taxonomy (8 kinds x 5 statuses x 7 scopes) is shown from first visit regardless of dataset size. At 5 items, the chrome-to-content ratio is punishing.
