# HyperIdle Feature Taxonomy

Product group > product > feature structure grounded in code evidence from June 2026 audit.

**Definition:** A feature is a specific capability that provides tangible value to the user.
**Code status:** WORKS / PARTIAL / DEAD / NONE

---

## Product Group: Oversight

*User need: "Am I in control of what my agents are doing?"*

### Product: Review

The founder's core daily activity. ~90% of time spent here.

| Feature | Status | Evidence |
|---|---|---|
| Review agent proposals with embedded artifacts | WORKS | review-type messages in threads, RichMessageCard renders 3 of 5 ArtifactView shapes |
| Submit binding verdicts (approve / approve-with-comments / request-changes / edit / reject) | WORKS | verdict-type messages, 5 sticky footer buttons |
| See which agents are blocked waiting on you | WORKS | blocking derived from session state, red left border + filter chip |
| Filter review queue (Blocking / Unread) | WORKS | toggle chips, independently toggleable |
| Inline discussion on reviews (comment, reply) | WORKS | plain-type messages in same thread |

### Product: Live Observation

| Feature | Status | Evidence |
|---|---|---|
| Watch agent's active session in real-time | WORKS | D key toggles SessionActivityPanel as companion pane (3fr/2fr split) |
| Filter activity stream (Tools / Reasoning / Cost) | WORKS | filter tabs in SessionActivityPanel |
| Auto-scroll with manual pause | WORKS | pauses when user scrolls up >40px |

### Product: Cost Awareness

| Feature | Status | Evidence |
|---|---|---|
| See daily/weekly spend vs budget | NONE | Rail deleted. No component renders cost. API returns zeros. |
| See per-team cost breakdown | NONE | Team API returns cost fields but no UI renders them |
| Get notified when budget caps are hit | PARTIAL | checkCostCap() blocks new sessions, but no review thread created |

---

## Product Group: Planning

*User need: "What should my agents work on and how is it going?"*

### Product: Bets

| Feature | Status | Evidence |
|---|---|---|
| Create a bet (description + team, optional hypothesis/done-condition/appetite) | WORKS | BetCreateDialog, POST /api/bets |
| Start a bet (draft -> active) | WORKS | POST /api/bets/:id/commit |
| Complete a bet (active -> completed) | WORKS | POST /api/bets/:id/ship |
| Kill a bet with required reason | WORKS | POST /api/bets/:id/kill |
| Pause / resume a bet | DEAD | UI buttons + consequence dialog exist. Endpoints DON'T EXIST. |
| View pitch as structured blocks with per-section discussion | WORKS | deriveBlocks() + Block component + HostThreadSection |
| Record outcome (validated / refuted / partial / inconclusive) | WORKS | POST /api/bets/:id/outcome |
| Run retro that creates knowledge item | WORKS | POST /api/bets/:id/retro |
| Set cost appetite (structured money) | WORKS | costAppetiteMinor + costAppetiteCurrency |
| Flag bet as at-risk | WORKS | boolean with reason |

### Product: Task Tracking

| Feature | Status | Evidence |
|---|---|---|
| View task progress within a bet (state, owner, cost) | WORKS | task rows in WorkBet, WorkTask detail page |
| See task outcomes (met / met_with_rework / partially_met / not_met) | WORKS | set manually after done, rendered on 3+ pages, bet outcomes aggregate from these |
| View session history per task | WORKS | session list in WorkTask with live indicator |
| Handoff between agents | WORKS | POST /tasks/:id/handoff to agent ID, role, or human |
| Task dependencies and auto-unblock | DEAD | schema field exists, watcher function tested, never called, no API, no UI |

---

## Product Group: Knowledge

*User need: "Does my organization get smarter over time?"*

### Product: Knowledge Curation

| Feature | Status | Evidence |
|---|---|---|
| Browse knowledge by topic within scope (practice / product / factory) | WORKS | dual-tab list (Curated + Triage), scope filter pills |
| Triage agent-contributed items (j/k/v/x keyboard flow) | WORKS | attention-score ordering, optimistic removal |
| Edit items inline with auto-save | WORKS | TipTap WYSIWYG, 1500ms debounce, 409 conflict detection |
| View topic health (fresh / some_stale / mostly_stale) | WORKS | derived from archived ratio, collapsible headers |
| View related items via backlinks | WORKS | BacklinksCard sidebar |
| Flag items for revisit | DEAD | button visible, onClick does nothing, API endpoint works |
| Archive stale items | DEAD | button visible, onClick does nothing, API endpoint works |
| Merge duplicates | PARTIAL | API works, no UI surface |
| Split overloaded items | PARTIAL | API works, no UI surface |
| Change scope with reason tracking | WORKS | ScopeChangeDialog |

### Product: Knowledge Authoring

| Feature | Status | Evidence |
|---|---|---|
| Create knowledge items at any of 7 scopes | WORKS | /knowledge/new full-page create |
| Choose kind (pattern / decision / failure / brief) | WORKS | 4 of 8 kinds in creation UI (right asymmetry — agents create the other 4) |
| Create from bet/task discussion context | WORKS | KnowledgeCreateDialog |
| Per-block discussion on knowledge body | WORKS | block popover "Discuss", anchored messages, orphan detection |

---

## Product Group: Team

*User need: "Who are my agents and how do I tune them?"*

### Product: Agent Configuration

| Feature | Status | Evidence |
|---|---|---|
| View agent profile (identity, skills, activity, health) | WORKS | AgentProfile page |
| Edit soul prompt | WORKS | AgentEditDialog, templates for 8 of 15 roles |
| Set harness type, model tier, max concurrent sessions | WORKS | AgentEditDialog |
| Create new agents with role from catalog | WORKS | AgentAddDialog, POST /api/agents |
| Retire agents | WORKS | soft-delete, status='retired' |
| Auto-provision agents based on team functions | DEAD | defaultRoster() exists, never called. Hardcodes builder + PM. |

### Product: Autonomy

| Feature | Status | Evidence |
|---|---|---|
| View per-agent-per-skill autonomy levels | WORKS | read-only table on AgentProfile |
| Edit autonomy levels | DEAD | PATCH endpoint works + creates audit thread. No edit UI. |
| Track success/failure tallies | PARTIAL | data structure exists, no increment on session completion |
| Graduate autonomy automatically | NONE | not implemented |

---

## Product Group: Automation

*User need: "Does work happen while I'm not looking?"*

### Product: Routines

| Feature | Status | Evidence |
|---|---|---|
| Create recurring agent tasks (name, schedule, agent, team, cost caps) | WORKS | RoutineCreateDialog, POST /api/routines |
| View run history (outcome, cost, duration) | WORKS | last 20 runs on WorkRoutine page |
| Trigger routines manually | WORKS | "Trigger Now" button provisions session |
| Pause / resume / delete routines | WORKS | PATCH state toggle, soft-delete |
| Automatic cron scheduling | DEAD | startRoutineScheduler() tested, NEVER CALLED. One function call fix. |
| Sleep-time context refresh (silent runs) | DEAD | silent flag exists, scheduler never runs |
| Delegation to teammate when owner overloaded | DEAD | findDelegate() fully implemented, scheduler never runs |
| Per-run cost cap | WORKS | enforced on manual trigger |
| Monthly cost cap | WORKS | enforced, budget_exhausted outcome on breach |

---

## Product Group: Navigation & Setup

*User need: "Can I find things and get started?"*

### Product: App Shell

| Feature | Status | Evidence |
|---|---|---|
| Sidebar with 3 sections (Conversations, Work, Knowledge) | WORKS | 200px fixed width |
| Recent threads under Conversations | WORKS | max 5 |
| Team list under Work | WORKS | |
| Knowledge triage count badge | WORKS | only working ambient signal |
| Breadcrumbs within Work view | WORKS | Portfolio > Team > Bet > Task |
| Blocking/unread badges on Conversations section | NONE | no ambient indicators outside Conversations view |

### Product: Search

| Feature | Status | Evidence |
|---|---|---|
| Cmd+K search modal | DEAD | UI opens, keyboard nav works. /api/search returns 404. "Coming soon." |

### Product: Onboarding

| Feature | Status | Evidence |
|---|---|---|
| First-run setup (name + API key + optional repo path) | WORKS | creates user + team + stores credential |
| Auto team creation from repo path | WORKS | derives team name from folder basename |
| First-time contextual hints | WORKS | 5 of 6 render across 4 pages with persistent dismissal |

### Product: Settings

| Feature | Status | Evidence |
|---|---|---|
| Profile (name, email) | WORKS | |
| Appearance (light/dark theme) | WORKS | |
| Model gateway (3 tiers, provider/model selection) | WORKS | auto-save, credential status dots |
| Org chart (review routing edges) | WORKS | direct/function/team mechanisms |
| Notification config | DEAD | toggles render, useState only, not wired to backend PATCH |

---

## Open Questions

1. **Where do primitives go?** Thread, Block, and Artifact are infrastructure that enables multiple products above. They're not products themselves (users don't think "I'm using the thread primitive"). But their quality shapes every product they compose into. Should they appear as a separate "Platform" section? Or just as implementation notes?

2. **Portfolio page** — is it a product? In code it's a navigation page with filters. No unique data. Consider: feature of App Shell navigation, not its own product. Or remove entirely and navigate directly to team.

3. **Chief of Staff** — is it a product? In code it's a pinned thread + overlay shortcut. No agent responds. Is it "AI executive assistant" or just "a thread with nobody home"?

4. **Lifecycle propagation** (session->task->bet auto-transitions) — is it a feature of Planning, or invisible infrastructure? Users experience it as "tasks move to review when agents finish" but never trigger it directly.

5. **Knowledge Fabric** (materialization, writeback, scoring) — invisible to users but is what makes knowledge compound. Infrastructure section? Or feature of Knowledge Curation ("your agents get the right knowledge at session start")?

6. **Budget enforcement** — belongs under Cost Awareness (Oversight) or Routines (Automation)? It spans both.

7. **Kernel vs Strategy** — the separation is real in code. Does it matter for product taxonomy? Most DEAD features are strategy-layer (scheduler, propagation wiring, scoring). Kernel features mostly work.
