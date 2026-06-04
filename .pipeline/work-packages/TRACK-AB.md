# Track AB: Agent Management & Configuration

Make agents visible, configurable, and manageable as first-class team members. Today, agent configuration is buried in Settings (X3) and agent status is barely surfaced in the UI. Paperclip makes agent setup, capabilities, and operational status immediately visible — you can see what each agent does, what it costs, and whether it's healthy at a glance. HyperIdle needs the same clarity for human+AI teams where the human team lead needs to understand and manage their AI team members.

**Constraint:** Agent management enhances the existing agent configuration (X3), harness adapters (X5), and org chart (P2) — it does not replace them. `npm run verify` must pass after each workpackage merges.

See `CLAUDE.md` for tech stack and `.pipeline/work-packages/pipeline-manifest.yaml` for the dependency graph.

---

### AB1 — Agent Profile Pages

**Workpackage.** As a team lead, I want each agent to have a dedicated profile page showing its role, capabilities, configuration, recent activity, and health status — so that I can understand what each agent does, how it's performing, and whether it needs attention.

**Depends on.** None. The `users` table with agent fields (X3: soulPrompt, harnessType, modelTierPreference), session history, and team membership exist.

**Complexity.** M

**Acceptance criteria.**
- Each agent (user with kind="ai") has a profile page accessible from the sidebar, team page, and org chart.
- The profile page shows: agent name, role, team membership, soul prompt summary (first 2 lines), harness type, model tier, creation date, and current status (idle/active/error).
- An "Activity" section shows the agent's recent sessions (last 10) with: task title, outcome, duration, cost, and timestamp.
- A "Performance" section shows aggregate stats: total sessions, success rate, average cost per session, total cost this month, and average session duration.
- A "Skills" section lists the agent's registered skills (from `userSkills` table) with autonomy level and success/failure counts per skill.
- A "Configuration" section shows the agent's full soul prompt (expandable), harness type, model tier preference, and max concurrent sessions — with edit buttons that link to the agent settings page.

**Validation scenarios.**
- Given an agent "Builder-1" with 20 completed sessions, when the profile page loads, then the Activity section shows the 10 most recent sessions and the Performance section shows a 85% success rate.
- Given a user navigates from the team page to an agent's name, when they click, then the agent profile page opens.
- Given an agent with 3 registered skills, when the Skills section loads, then all 3 skills are listed with their autonomy levels and success counts.
- Given an agent currently running a session, when the profile page loads, then the status shows "active" with a link to the running session.

**Plan calls.** /design needed — the agent profile page is a new page with multiple sections. Architecture pass should design: the aggregate stats query (join sessions + cost events), the skills query (from userSkills), and the status computation (is the agent currently in a session?).

**Contracts / constraints.**
- The profile page is read-only — editing happens via the existing settings pages (X3).
- Aggregate stats are computed on-demand, not cached (acceptable for <1000 sessions per agent).
- The profile page uses the same design system components as other detail pages.

**Out of scope.**
- Agent creation from the profile page (use Settings).
- Comparing agents side-by-side.
- Agent-to-agent communication history.

**Effort.** M (~6h)

---

### AB2 — Agent Dashboard (Team Agent Overview)

**Workpackage.** As a team lead opening HyperIdle, I want to see all my agents at a glance — who's active, who's idle, who's erroring, what they're working on, and what they cost — so that I can manage my AI team members as naturally as I'd check on a human team in Slack.

**Depends on.**
- AB1 — Agent Profile Pages. AB1 establishes the individual agent profile; AB2 creates the team-level overview that links to profiles.

**Complexity.** M

**Acceptance criteria.**
- The team page includes an "Agents" section (alongside Bets and Routines) showing all team members with kind="ai" as agent cards.
- Each agent card shows: avatar/icon, name, role, current status (idle/active/error), current task (if active), session count today, and cost today.
- Agent cards are color-coded by status: green (active), gray (idle), red (error — last session failed).
- The agent section supports quick actions: click card → agent profile (AB1), hover → tooltip with last activity summary.
- The Work portfolio page (top-level) shows a per-team agent summary: total agents, active count, error count.
- An "Agent Health" indicator on each team row in the portfolio: green if all agents healthy, yellow if any idle for >24h, red if any in error state.

**Validation scenarios.**
- Given a team with 3 agents (1 active on a task, 1 idle, 1 in error), when the team page loads, then the Agents section shows 3 cards with green, gray, and red status indicators respectively.
- Given agent "Builder-1" is actively running a session on task "Implement file upload," when the agent card renders, then it shows status "active" and current task "Implement file upload."
- Given the Work portfolio page, when a team has 1 agent in error state, then the team row shows a red Agent Health indicator.

**Plan calls.** /design needed — agent cards and the dashboard layout are new UI components. Architecture pass should design: the real-time status query (check for active sessions), the agent health computation, and the card component API.

**Contracts / constraints.**
- Agent cards use existing design system primitives (cards, badges, status indicators).
- Status is computed from session state: active = has a running session, error = last session outcome was failure, idle = otherwise.
- The dashboard does not poll for real-time updates — it reflects state at page load (refresh to update).

**Out of scope.**
- Real-time WebSocket updates for agent status changes.
- Agent-level notifications or alerts.
- Agent scheduling or workload balancing.

**Effort.** M (~6h)

---

### AB3 — Agent Setup Wizard

**Workpackage.** As a team lead adding a new agent to my team, I want a guided setup flow that walks me through configuring the agent's identity, capabilities, and operational parameters — so that I don't need to know about soul prompts, harness types, or model tiers to get an agent running.

**Depends on.** None. The agent configuration API (X3) and user creation routes exist.

**Complexity.** M

**Acceptance criteria.**
- A "Add Agent" action on the team page opens a multi-step wizard with: (1) Role selection — pick from predefined roles (Builder, Product Manager, Growth, Ops, Practice Facilitator) with descriptions of what each does; (2) Identity — name, optional avatar, optional custom soul prompt (with the role's default pre-filled and editable); (3) Capabilities — harness type selection (built-in, Claude Code, Aider, etc.) with capability descriptions, model tier preference (fast/balanced/capable) with cost implications; (4) Review — summary of all choices with a "Create Agent" button.
- Each wizard step has sensible defaults: selecting "Builder" pre-fills the builder soul prompt template, selects the built-in harness, and sets model tier to "balanced."
- After creation, the wizard shows a success state with: "Agent created. What's next?" linking to: assign to a bet, create a routine, or view agent profile.
- The wizard validates configuration before creation: the selected harness must be available, the model tier must have a configured provider (X4), and the agent name must be unique within the team.
- First-time users who have no agents see a prominent "Add your first agent" call-to-action on the team page.

**Validation scenarios.**
- Given a team lead clicks "Add Agent" and selects "Builder," when they proceed through the wizard accepting all defaults, then an agent is created with the builder soul prompt, built-in harness, and balanced model tier.
- Given a user selects "Claude Code" harness but no Claude API key is configured, when they reach the Review step, then a validation warning says "Claude Code harness requires an API key — configure in Settings > Models."
- Given a team with zero agents, when the team page loads, then a prominent empty state shows "Add your first agent" with a direct link to the wizard.

**Plan calls.** /design needed — the multi-step wizard is a new interaction pattern. Architecture pass should design: the role templates data structure, the validation logic, and how the wizard integrates with the existing user creation API (users.ts POST).

**Contracts / constraints.**
- Role templates (soul prompts) are read from `docs/souls/` — the wizard does not hardcode soul prompt text.
- The wizard creates a `users` row with kind="ai" and adds a `teamMembers` entry — same as the existing agent creation API.
- The wizard is web-only — no API-only fallback needed.
- Custom soul prompts are stored in the `soul_prompt` column on users, not in files.

**Out of scope.**
- Bulk agent creation.
- Agent templates marketplace.
- Agent cloning (duplicate an existing agent's configuration).

**Effort.** M (~6h)

---

### AB4 — Agent Capabilities & Skills Display

**Workpackage.** As a team lead reviewing my agents, I want to see each agent's capabilities — what tools it can use, what skills it has, what harness features are available — so that I can assign the right agent to the right task and understand why an agent succeeded or failed.

**Depends on.**
- AB1 — Agent Profile Pages. AB1 establishes the profile page; AB4 enriches the capabilities section.

**Complexity.** M

**Acceptance criteria.**
- The agent profile page's Skills section is enriched to show: available skill-tools (from the skill-tool registry filtered by agent role), harness capabilities (reported by the harness adapter's `getCapabilities()` method), and any custom skills (from `userSkills` + Y3 skill definitions if shipped).
- Each skill-tool shows: name, one-line description, and whether the agent's role has access (facilitator-only tools are grayed out for builder agents).
- Harness capabilities show: which execution features the harness supports (tool use, file editing, web browsing, code execution) as a feature matrix.
- The skills display is filterable: "All capabilities," "Available to this agent," "Restricted."
- When assigning an agent to a task, the task creation form shows a tooltip on the agent dropdown previewing the agent's key capabilities.

**Validation scenarios.**
- Given a builder agent using the built-in harness, when the capabilities section loads, then skill-tools show 10 available tools (builder-accessible) and 4 restricted (facilitator-only, grayed out).
- Given an agent using Claude Code harness, when the harness capabilities section loads, then features like "file editing: yes," "web browsing: no," "tool use: yes (via MCP)" are displayed.
- Given a task creation form, when the user hovers over agent "Builder-1" in the agent dropdown, then a tooltip shows "Builder | Built-in harness | 10 tools available."

**Plan calls.** Architecture pass should design: how to query harness capabilities (call `getCapabilities()` and cache the result), how to merge skill-tool access with role-based filtering, and the tooltip data structure for the task assignment dropdown. /design needed for the feature matrix layout.

**Contracts / constraints.**
- Capabilities are read-only — this workpackage displays them, does not modify them.
- Harness capabilities are queried once per agent profile load and cached for the session — no repeated adapter calls.
- The feature matrix uses a simple grid layout, not a complex visualization.

**Out of scope.**
- Capability-based agent recommendation ("which agent is best for this task?").
- Capability editing (that's in Settings > Agents, X3).
- Capability comparison across agents.

**Effort.** M (~6h)

---

### AB5 — Agent Operational Health & Alerts

**Workpackage.** As a team lead, I want to be notified when an agent is unhealthy — repeated failures, cost spikes, idle for too long, or configuration issues — so that I can intervene before problems compound.

**Depends on.**
- AB1 — Agent Profile Pages. AB1 shows agent status; AB5 adds proactive health monitoring and alerts.
- AB2 — Agent Dashboard. AB2 shows the health indicator; AB5 defines the health computation and alert mechanism.

**Complexity.** M

**Acceptance criteria.**
- An agent health score is computed from four signals: (a) failure rate — percentage of failed sessions in the last 7 days, (b) cost trend — whether average session cost is increasing, (c) idle duration — time since the agent's last session, (d) configuration validity — whether the agent's harness and model tier are still properly configured.
- Health is categorized as: healthy (all signals normal), warning (one signal degraded), unhealthy (two+ signals degraded or failure rate >50%).
- When an agent transitions from healthy to warning or unhealthy, an alert is created in the facilitator queue (for AI teams) or sent via notification adapter (for human team leads).
- The agent profile page shows the health score breakdown: each signal with its current value and status (normal/degraded).
- Health checks run automatically on a schedule (default: every 6 hours) as a lightweight system routine — not an LLM call.

**Validation scenarios.**
- Given an agent with 8 of 10 recent sessions failed, when the health check runs, then the agent's health transitions to "unhealthy" and an alert is sent to the team lead.
- Given an agent whose average session cost increased 3x this week compared to last week, when the health check runs, then the cost trend signal shows "degraded."
- Given an agent that has been idle for 48 hours in an active team, when the health check runs, then the idle duration signal shows "degraded."
- Given a healthy agent whose model gateway API key expires, when the health check runs, then the configuration validity signal shows "degraded" and the health transitions to "warning."

**Plan calls.** Architecture pass should design: the health score computation (thresholds for each signal), the health check routine (lightweight, no LLM — just DB queries), the alert creation mechanism, and how health status flows to the dashboard (AB2). Skip /design (health display uses existing badge/indicator components).

**Contracts / constraints.**
- Health checks are deterministic — no LLM calls. They query session history, cost events, and configuration state.
- Health check runs as a system routine, not a facilitator agent — it doesn't consume the team's cost budget.
- Alert frequency is throttled: at most one alert per agent per health state transition (not repeated alerts for the same problem).
- The health score is computed, not stored — it is recalculated on every profile page load and health check run.

**Out of scope.**
- Automatic remediation (restarting agents, reconfiguring harnesses).
- Historical health trends.
- Cross-team health comparison.

**Effort.** M (~6h)
