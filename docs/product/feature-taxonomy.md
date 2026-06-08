# HyperIdle Feature Taxonomy

Product group > product > feature. Code-verified June 2026.

**Code status:** WORKS / PARTIAL / DEAD / NONE
**Journey verdict:** OVERBUILT (works but hurts by adding complexity without value for target user) / BROKEN PROMISE (UI exists, doesn't work, erodes trust)

>> remeber this is as much for a solo founder as for a small team (lets say 10 people), who are building stuff with a lot of AI power. Needs to work for tech company as much as for a marketing & design agency.

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

### Assistant
- Pinned thread with assistant agent, auto-created | WORKS · OVERBUILT — pinned at top of thread list from Day 1 before it has value. Takes prime real estate. No conditional: always pinned, even when empty.
- CoC overlay accessible from any view | WORKS
- Agent responds to messages | DEAD · BROKEN PROMISE — overlay invites conversation, user types, nothing responds. Silence.
>> yeah the coach / assistant / chief of staff. not only has it three names but also is poorly structured. This needs a well through restructure. we need a task for that.

---

## Work

### Bets
- Create bet (description + team required, hypothesis/done-condition/appetite optional) | WORKS
- Start / complete / kill with reason tracking | WORKS
- Pause / resume | DEAD · BROKEN PROMISE — UI has buttons + consequence dialog. User types reason, confirms. Endpoint doesn't exist. Error.
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
- Dependencies and auto-unblock | DEAD
>> this should trigger that another task spawns a session again which is not unblocked - continuous work. should be on the needs fixing list.

### Portfolio
- Grid of bet cards across teams with filters (status, verdict, team) | WORKS · OVERBUILT — for single-product founder this is a click-through page with no unique value. No auto-skip when teams.count = 1.

>> yeah lets remove it. we need a task for that.

---

## Knowledge

### Curation
- Dual-tab list: Curated (by topic) + Triage (by attention score) | WORKS
- Scope filter pills (practice / product / factory) | WORKS
- Kind badges (8) and status badges (5) | WORKS · OVERBUILT — full taxonomy visible from first visit regardless of item count. At 5 items the chrome-to-content ratio is punishing. No progressive disclosure.
>> I guess we have a bit of a mess here, docs need a cleanup. And code a minor simplification maybe. task
- Topic groups with health indicators | WORKS
- Triage keyboard flow (j/k/v/x, optimistic removal) | WORKS
- Sort by relevance, recency, frequency | WORKS
- Related items sidebar (backlinks) | WORKS

### Editing
- Inline editing with TipTap WYSIWYG auto-save | WORKS
- Version tracking with conflict detection | WORKS
- Body rendered as blocks with per-block discussion | WORKS
- Flag for revisit | DEAD · BROKEN PROMISE — button visible in menu, clicks do nothing
>> task
- Archive | DEAD · BROKEN PROMISE — button visible in menu, clicks do nothing
>> let's just delete for now. task
- Scope change with reason | WORKS
- Merge duplicates | PARTIAL (API only)
>> no need for a button we can just comment and have an agent edit. task
- Split items | PARTIAL (API only)
>> no need for a button we can just comment and have an agent edit. task

### Authoring
- Create knowledge items at any of 7 scopes | WORKS · OVERBUILT — solo founder needs 3 choices (whole company / this product / just me). 7 scopes creates decision paralysis. practice vs product vs team distinction unclear without domain knowledge.
>> we need to cleanup this scope system. task
- Choose kind (pattern / decision / failure / brief) | WORKS
>> is this classification really valuable? also skill is not in there? task
- Create from bet/task discussion context | WORKS
>> do we need a button for that can just have an agent to id. task

---

## Organisation

### Agents
- Agent profile (identity, skills, activity, health signals) | WORKS
- Edit soul prompt (templates for 8 of 15 roles) | WORKS
- Set harness type, model tier, max concurrent sessions | WORKS
- Create agent with role from catalog | WORKS
- Retire agent (soft-delete) | WORKS
- Auto-provision agents based on team functions | DEAD
>> task

### Autonomy
- View per-agent-per-skill autonomy levels | WORKS · OVERBUILT — shows 50+ level-cells for a solo founder who can't edit any of them. Per-skill granularity is premature; per-agent would suffice.
>> of yeah lets remove that. generally in our system agents have allow all on any tools, skills, ... that they use. they get their output judged when it goes to review and that can trigger something. Same goes for knowledge items (which skills are part of) those get scored behind the system to identify if edits to those should be reviewed. but autonomy levels per skill make no sense. task
- Edit autonomy levels | DEAD · BROKEN PROMISE — PATCH endpoint works and creates audit threads. Profile shows read-only number with no edit affordance.
- Success/failure tallies | PARTIAL (data exists, no increment logic)
>> remove. we have retros to improve skills. and we can just count how often a skill was called like we can measure usage for othr knowledge. task
- Automatic graduation | NONE

>> this entire product should not exist.

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

>> this product still needs work, but a routine is a work object or part of a strategy.

### Cost & Budget
- Structured money tracking (bigint minor units + currency) | WORKS (backend)
- Token usage per tier (reasoning / workhorse / fast) | WORKS (backend)
- Agent / team / factory nested cost caps | PARTIAL · OVERBUILT — three nesting levels for a solo founder with 1-2 teams. Agent cap + factory cap would suffice. Team level is empty ceremony at this scale.
>> wrong keep.
- Cost visibility in UI | NONE
>> not needed

### Settings
- Profile (name, email) | WORKS
- Appearance (light/dark theme) | WORKS
- Model gateway (3 tiers, provider/model selection) | WORKS
- Org chart (review routing edges) | WORKS · OVERBUILT — presents graph-theory concepts (edges, mechanisms: direct/function/team) to a solo founder where every review routes to the one human. Zero value, confusing vocabulary.
>> yeah thats overkill nobody needs that we have teams with a responsible human and agents inside. task
- Notification config | DEAD · BROKEN PROMISE — toggles render and flip. Settings vanish on page refresh. Backend PATCH endpoint exists and works.
>> remove we don't have notifications. task
- Credentials | PARTIAL (server works, UI partial)
>> task

### Onboarding
- Setup flow (name + API key + optional repo path) | WORKS
- Auto team creation | WORKS
- First-time hints (5 of 6 render with persistent dismissal) | WORKS

### Search
- Cmd+K search modal with keyboard navigation | DEAD · BROKEN PROMISE — opens with keyboard nav, shows "Search coming soon" every time. False affordance.
>> yeah lets get this to work. task.

### Ambient Awareness
- Knowledge triage badge on sidebar | WORKS
- Blocking/unread badges outside Conversations | NONE
