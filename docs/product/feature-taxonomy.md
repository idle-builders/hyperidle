# HyperIdle Feature Taxonomy

Product group > product > feature. Code-verified June 2026.

**Status:** WORKS / PARTIAL / DEAD / NONE

---

## Conversations

### Messaging
- Send and receive messages with agents | WORKS
- Start new thread with any agent (N key, RecipientPicker) | WORKS
- Thread attached to any host (bet, task, knowledge item, artifact, agent, user) | WORKS
- Message types: plain, review, questionnaire, verdict | WORKS
- Thread resolution and re-opening | WORKS

### Review
- Agent proposals rendered with embedded artifact preview (3 of 5 shapes reachable) | WORKS
- 5 binding verdicts: approve, approve-with-comments, request-changes, edit, reject | WORKS
- Blocking indicator (agent paused waiting for verdict) | WORKS
- Filter by Blocking / Unread | WORKS
- Snooze, escalate | NONE
- Bulk approve-similar, snooze-all, mark-read | NONE

### Session Dial-In
- Watch agent's active session in real-time (D key, companion pane) | WORKS
- Filter activity (Tools / Reasoning / Cost) | WORKS

### Coach
- Pinned thread with Chief of Staff agent, auto-created | WORKS
- CoC overlay accessible from any view | WORKS
- Agent responds to messages | DEAD (no agent wired)

---

## Work

### Bets
- Create bet (description + team required, hypothesis/done-condition/appetite optional) | WORKS
- Start / complete / kill with reason tracking | WORKS
- Pause / resume | DEAD (UI exists, endpoints missing)
- Pitch rendered as blocks with per-section discussion | WORKS
- Cost appetite (structured money) | WORKS
- At-risk flag with reason | WORKS
- Outcome recording (validated / refuted / partial / inconclusive) | WORKS
- Retro that creates knowledge item | WORKS

### Tasks
- View task progress within bet (state, owner, cost) | WORKS
- 8-state machine (proposed through killed) | WORKS
- Handoff to agent, role, or human | WORKS
- Outcome verdict (met / met_with_rework / partially_met / not_met) | WORKS
- Session history per task with live indicator | WORKS
- Dependencies and auto-unblock | DEAD (schema + function exist, never wired)

### Portfolio
- Grid of bet cards across teams with filters (status, verdict, team) | WORKS

---

## Knowledge

### Curation
- Dual-tab list: Curated (by topic) + Triage (by attention score) | WORKS
- Scope filter pills (practice / product / factory) | WORKS
- Kind badges (8) and status badges (5) | WORKS
- Topic groups with health indicators | WORKS
- Triage keyboard flow (j/k/v/x, optimistic removal) | WORKS
- Sort by relevance, recency, frequency | WORKS
- Related items sidebar (backlinks) | WORKS

### Editing
- Inline editing with TipTap WYSIWYG auto-save | WORKS
- Version tracking with conflict detection | WORKS
- Body rendered as blocks with per-block discussion | WORKS
- Flag for revisit | DEAD (button visible, does nothing, API works)
- Archive | DEAD (button visible, does nothing, API works)
- Scope change with reason | WORKS
- Merge duplicates | PARTIAL (API only)
- Split items | PARTIAL (API only)

### Authoring
- Create knowledge items at any of 7 scopes | WORKS
- Choose kind (pattern / decision / failure / brief) | WORKS
- Create from bet/task discussion context | WORKS

---

## Organisation

### Agents
- Agent profile (identity, skills, activity, health signals) | WORKS
- Edit soul prompt (templates for 8 of 15 roles) | WORKS
- Set harness type, model tier, max concurrent sessions | WORKS
- Create agent with role from catalog | WORKS
- Retire agent (soft-delete) | WORKS
- Auto-provision agents based on team functions | DEAD (function exists, never called)

### Autonomy
- View per-agent-per-skill autonomy levels | WORKS (read-only)
- Edit autonomy levels | DEAD (API works, no UI)
- Success/failure tallies | PARTIAL (data exists, no increment logic)
- Automatic graduation | NONE

### Teams
- Create team | WORKS
- Team roster (agents with status, health) | WORKS
- Add / edit / retire agents from team view | WORKS
- Burn vs cap visualization | WORKS

### Routines
- Create routine (name, schedule, agent, team, cost caps) | WORKS
- Manual trigger | WORKS
- Run history (outcome, cost, duration) | WORKS
- Pause / resume / delete | WORKS
- Automatic cron scheduling | DEAD (scheduler tested, never started)
- Sleep-time silent runs | DEAD (flag exists, scheduler never runs)
- Delegation | DEAD (implemented, scheduler never runs)
- Per-run and monthly cost caps | WORKS

### Cost & Budget
- Structured money tracking (bigint minor units + currency) | WORKS (backend)
- Token usage per tier (reasoning / workhorse / fast) | WORKS (backend)
- Agent / team / factory nested cost caps | PARTIAL (enforcement exists, spend returns zeros)
- Cost visibility in UI | NONE (no component renders cost anywhere)

### Settings
- Profile (name, email) | WORKS
- Appearance (light/dark theme) | WORKS
- Model gateway (3 tiers, provider/model selection) | WORKS
- Org chart (review routing edges) | WORKS
- Notification config | DEAD (toggles render, not persisted)
- Credentials | PARTIAL (server works, UI partial)

### Onboarding
- Setup flow (name + API key + optional repo path) | WORKS
- Auto team creation | WORKS
- First-time hints (5 of 6 render with persistent dismissal) | WORKS

### Search
- Cmd+K search modal with keyboard navigation | DEAD (UI works, API returns 404)

### Ambient Awareness
- Knowledge triage badge on sidebar | WORKS
- Blocking/unread badges outside Conversations | NONE
