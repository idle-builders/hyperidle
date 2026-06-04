# Track AB: Agent Management & Configuration

Make agents visible, configurable, and manageable as first-class team members. Today, agent configuration is buried in Settings (X3) and agent status is barely surfaced in the UI. Paperclip makes agent setup, capabilities, and operational status immediately visible. HyperIdle needs the same clarity for human+AI teams where the human team lead needs to understand and manage their AI team members.

**What exists today.** The `users` table stores agent config (X3: soulPrompt, harnessType, modelTierPreference, maxConcurrentSessions). The `userSkills` table tracks per-agent skill autonomy and success/failure counts. Agent CRUD exists via Settings. The harness adapter pool (X5) selects adapters by type. The MCP bridge (X2) exposes skill-tools. Session history is queryable. But there's no agent profile page, no agent overview on the team page, no guided setup, and agent status isn't surfaced outside Settings.

**Constraint:** Agent management enhances the existing agent configuration (X3), harness adapters (X5), and org chart (P2) — it does not replace them. `npm run verify` must pass after each workpackage merges.

See `CLAUDE.md` for tech stack and `.pipeline/work-packages/pipeline-manifest.yaml` for the dependency graph.

---

### AB1 — Agent Profile & Capabilities

**Workpackage.** As a team lead, I want each agent to have a profile page showing everything about that agent — identity, role, harness, MCP configuration, skills, capabilities, recent activity, performance, and health — so that I can understand what each agent does, how it's configured, and whether it needs attention.

**What exists today.** Agent data is spread across: `users` table (soul prompt, harness type, model tier), `userSkills` table (skills, autonomy, success/failure), `sessions` table (activity history), harness adapter `getCapabilities()` method (capability features), and MCP bridge configuration. None of this is surfaced in a unified view — you have to navigate Settings > Agents to see basic config.

**Why this matters.** A team lead managing humans can see who is working on what, how they are performing, and whether they need help. The same visibility does not exist for agents today — understanding whether an agent is misconfigured, underperforming, or stuck requires navigating three separate settings screens and cross-referencing session logs. That friction means agents get neglected rather than managed. The profile page is the operational anchor for the human+AI team model: without it, "agents as team members" is a slogan, not a reality.

**Depends on.** None.

**Complexity.** L

**Acceptance criteria.**
- Each agent has a dedicated profile page accessible from the team page, sidebar, and org chart.
- A team lead can see the agent's complete operational picture in one view: identity (name, role, team, creation date), configuration (soul prompt, harness type, model tier, max concurrent sessions, MCP setup), skills (available skill-tools filtered by role, with access indicators), recent activity (last 10 sessions with task, outcome, cost), and aggregate performance (session count, success rate, average cost).
- The profile shows the agent's current status: active (running a session — with link to it), idle, or error (last session failed).
- Health signals are surfaced: failure rate trend (last 7 days), cost trend, idle duration, and configuration validity (harness available, model gateway configured). If any signal is degraded, a warning is visible.
- Harness capabilities (what the harness supports — tool use, MCP, file editing) are shown so the team lead understands what the agent can actually do.
- The profile links to the Settings page for editing — the profile itself is read-only.

**Validation scenarios.**
- Given agent "Builder-1" using Claude Code harness with MCP enabled, when the profile loads, then harness type, MCP status, and harness capabilities are all visible alongside the agent's skills and activity.
- Given an agent with 8 of 10 recent sessions failed, when the profile loads, then the health section shows a failure rate warning.
- Given an agent currently running a session, when the profile loads, then the status shows "active" with a link to the running session.
- Given a team lead wants to change the agent's model tier, when they click "Edit" on the profile, then they navigate to the Settings page for that agent.

**Plan calls.** /design needed — the agent profile is a new page with multiple sections. Architecture pass should design: the unified data query (joining users, userSkills, sessions, harness capabilities), the health signal computation, and how to surface MCP configuration.

**Contracts / constraints.**
- Profile is read-only — editing happens via existing Settings pages (X3).
- Health signals are computed on-demand, not cached.
- Aggregate stats are computed from session history — acceptable for <1000 sessions per agent.

**Out of scope.**
- Agent creation from the profile page (AB2 covers the setup wizard).
- Comparing agents side-by-side.
- Agent-to-agent communication history.

**Effort.** L (~2d)

---

### AB2 — Agent Overview in Team Work Page

**Workpackage.** As a team lead opening the team Work page, I want to see my agents alongside bets and routines — who's active, who's idle, who's in error, what they're working on — so that the team page is the single place to understand the team's full operational state.

**What exists today.** The team Work page shows bets. Track AA adds routines. Agents are not shown on the team page at all — you have to go to Settings to see them.

**Why this matters.** The team page is where a team lead takes stock of their team's operational state. If agents are absent from that view, the mental model is split: human team members visible here, agent team members somewhere in Settings. That split reinforces the idea that agents are infrastructure to be configured, not members to be managed — the opposite of HyperIdle's thesis. A team lead who can see at a glance that two agents are active and one is in error has the situational awareness to intervene. Without this workpackage, the team page tells only half the story.

**Depends on.**
- AB1 — Agent Profile & Capabilities. AB1 establishes the profile page that agent cards link to.

**Complexity.** M

**Acceptance criteria.**
- The team page shows an "Agents" section alongside Bets and Routines — a team lead sees people, projects, and recurring work in one view.
- Each agent appears as a card with: name, role, current status (active/idle/error), current task (if active), and a health indicator.
- Agent cards link to the agent profile (AB1) on click.
- Health is computed from the same signals as AB1 (failure rate, cost trend, idle duration, config validity) and shown as a simple indicator (green/yellow/red).
- The Work portfolio page shows per-team agent summary: agent count, active count, and a health indicator per team.
- When an agent transitions to error state (failure rate crosses threshold), the team lead is notified via the existing notification adapter (H2).

**Validation scenarios.**
- Given a team with 3 agents (1 active, 1 idle, 1 in error), when the team Work page loads, then the Agents section shows 3 cards with appropriate status indicators.
- Given an agent actively running session on "Implement file upload," when the card renders, then it shows "active" and the task name.
- Given an agent that has failed 5 of its last 6 sessions, when the health check fires, then the team lead receives a notification and the agent's card shows a red indicator.
- Given the Work portfolio page, when a team has an unhealthy agent, then the team row shows a warning indicator.

**Plan calls.** /design needed — agent cards and their placement in the team page are new UI components. Architecture pass should design: the health computation thresholds, the notification trigger (when does error state fire an alert), and how agent cards compose with bet and routine sections.

**Contracts / constraints.**
- Agent cards use existing design system primitives.
- Status is computed from session state: active = running session, error = high failure rate, idle = otherwise.
- Health checks are deterministic — no LLM calls.
- Notifications use the existing notification adapter (H2) — no new notification channel.
- Alert throttling: at most one alert per agent per health state transition.

**Out of scope.**
- Real-time WebSocket updates for agent status.
- Agent scheduling or workload balancing.
- Historical health trends beyond current state.

**Effort.** M (~6h)

---

### AB3 — Agent Setup Wizard

**Workpackage.** As a team lead adding a new agent, I want a guided setup flow that walks me through role, identity, harness, and model tier — so that I don't need to understand soul prompts or harness types to get an agent running.

**What exists today.** Agent creation exists via Settings > Agents (X3) but requires understanding of soul prompts, harness types, and model tiers. Three soul prompt templates exist (`chief-of-staff.md`, `product-manager.md`, `practice-facilitator.md`) — builder, growth, and ops roles have no templates. Soul prompt templates are seeded into `factorySettings` as JSON. Model tiers use the vocabulary `reasoning | workhorse | fast`.

**Why this matters.** A non-technical team lead who wants to add a builder agent today must write or paste a soul prompt, choose a harness type, and select a model tier — three concepts that require reading internal documentation to understand. Most team leads will give up or ask for help. That friction makes every agent adoption event dependent on a technically fluent person, which contradicts the premise that HyperIdle teams are self-managing. The wizard is not about prettiness; it is about whether a team lead can operate the product independently.

**Depends on.** None.

**Complexity.** M

**Acceptance criteria.**
- A team lead can add a new agent from the team page through a guided flow that presents choices in order: role → identity → harness → model tier, with sensible defaults at each step.
- Role selection shows predefined roles with descriptions of what each does. Selecting a role pre-fills the soul prompt template and selects appropriate defaults.
- The flow validates before creation: selected harness must be available, model tier must have a configured provider, agent name must be unique within the team.
- First-time users with no agents see a prominent call-to-action on the team page guiding them to create their first agent.
- After creation, the user knows what to do next: assign the agent to a bet, create a routine, or view the profile.
- Only roles with existing soul prompt templates are offered as presets. Roles without templates show a "custom" option where the user writes or pastes a soul prompt.

**Validation scenarios.**
- Given a team lead selects "Builder" role and accepts defaults, when they complete the flow, then an agent is created with the correct soul prompt, built-in harness, and default model tier.
- Given a user selects a harness that requires an API key not yet configured, when they reach the review step, then a validation warning explains what's missing.
- Given a team with zero agents, when the team page loads, then a prominent empty state guides the user to create their first agent.

**Plan calls.** /design needed — the guided setup flow is a new interaction pattern. Architecture pass should design: the role template data structure (which roles have templates, which are custom), validation logic, and integration with the existing user creation API. The concept pass should reconcile the available roles with actual soul prompt templates.

**Contracts / constraints.**
- Uses the canonical model tier names from the codebase (`reasoning | workhorse | fast`), not alternative vocabulary.
- Soul prompt templates come from `factorySettings`, not `docs/souls/` files.
- The flow creates a `users` row with kind="ai" and a `teamMembers` entry — same as the existing creation API.

**Out of scope.**
- Bulk agent creation.
- Agent cloning.
- Agent templates marketplace.

**Effort.** M (~6h)
