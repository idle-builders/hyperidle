# Track AB: Agent Management & Configuration

Make agents visible, configurable, and manageable as first-class team members. Today, agent configuration is buried in Settings (X3) and agent status is barely surfaced in the UI. HyperIdle needs clarity for human+AI teams where the human team lead needs to understand and manage their AI team members.

**Key insight:** Strategies ship with a set of predefined default agents per team. The primary user journey is *understanding and customizing existing agents*, not creating new ones from scratch. Agent creation from scratch is the secondary, power-user flow. The agent role model must account for three structurally different agent categories: team-level agents (functional domain specialists — development, product, design, sales, etc.), strategy-level agents (built-in aspects like Practice Facilitator that exist across all teams), and personal agents (like Chief of Staff, bound to a user, not a team). A strategy defines the default agent roster; a user customizes from there.

**What exists today.** The `users` table stores agent config (X3: soulPrompt, harnessType, modelTierPreference, maxConcurrentSessions). The `userSkills` table tracks per-agent skill autonomy and success/failure counts. Agent CRUD exists via Settings. The harness adapter pool (X5) selects adapters by type. The MCP bridge (X2) exposes skill-tools. Session history is queryable. Three soul prompt templates exist (`chief-of-staff.md`, `product-manager.md`, `practice-facilitator.md`) seeded into `factorySettings` — but these conflate three structurally different agent categories under one flat "role" enum. SOUL.md (user-edited personality/values) vs AGENT.md (strategy-materialized operational prompt) distinction is not formalized.

**Constraint:** Agent management enhances the existing agent configuration (X3), harness adapters (X5), and org chart (P2) — it does not replace them. `npm run verify` must pass after each workpackage merges.

See `CLAUDE.md` for tech stack and `.pipeline/work-packages/pipeline-manifest.yaml` for the dependency graph.

---

### AB0 — Agent Structure Concept (Role Model, Identity Composition, Default Roster)

**Workpackage.** Define the conceptual foundations for how agents are structured in HyperIdle: which categories of agents exist, where each category lives (team / strategy / personal), what is defined by the strategy vs editable by the user, and how agent identity is composed from multiple sources.

**What exists today.** A flat `USER_ROLES` enum (`product_manager`, `practice_facilitator`, `chief_of_staff`, `builder`, `growth`, `brand_voice`) with no distinction between agent categories. Soul prompt templates exist for 3 of 6 roles, seeded as JSON in `factorySettings`. There is no formalized boundary between what the user defines (soul/personality) and what the strategy materializes (operational prompt, knowledge injection, tool access). The existing templates conflate structurally different agent types: Practice Facilitator is a built-in strategy aspect (exists in every team), Chief of Staff is a personal assistant (bound to a user, not a team), and Product Manager is a domain-specific team agent (only relevant for product development teams).

**Why this matters.** Every downstream workpackage in Track AB (profile, team overview, setup wizard) depends on a coherent agent structure. Without this, the setup wizard offers the wrong roles, the profile page shows the wrong sections, and the team overview misrepresents which agents belong where. The AB3 pipeline proved this: the wizard was built around "pick a role, get a template" but the role model itself doesn't map to how agents actually work. This is the load-bearing concept work that must happen first.

**Depends on.** None.

**Complexity.** M

**Concept questions to resolve.**

1. **Agent categories.** Define the three (or more) structural categories:
   - **Team agents** — domain specialists tied to a team's functional focus. A development team gets different agents than a marketing team. Teams can be cross-functional (multiple domains) or functionally focused.
   - **Strategy agents** — built-in to the strategy, exist across all teams (e.g., Practice Facilitator). Less likely to be edited by users. The strategy controls their operational behavior.
   - **Personal agents** — bound to a user, not a team (e.g., Chief of Staff). Serve the individual, not the collective.
   
2. **Domain model for teams.** Teams are functional or cross-functional. Functions include: development, product, design, sales, marketing, finance, operations, and more. The agent roster for a team derives from its functional composition. Define how team function maps to available agent templates.

3. **Strategy-defined vs user-defined.** For each agent category, clarify:
   - What the strategy ships (default roster, operational prompt, tool access, knowledge injection)
   - What the user can customize (soul/personality, name, model tier preferences)
   - Where each type of editing happens (strategy agents edited rarely and maybe only by admins; team agents more commonly customized; personal agents fully user-controlled)

4. **SOUL.md vs AGENT.md composition.** Formalize the boundary:
   - **SOUL.md** (or equivalent) — user-authored. Personality, communication style, values, domain expertise framing. The user's input into "who this agent is."
   - **AGENT.md** (or equivalent) — strategy-materialized. Operational prompt composed from: the soul, the agent's role definition, team context, knowledge fabric, tool access, harness capabilities. The user doesn't write this directly — the strategy assembles it.
   - The user needs to understand: "You define the soul. The system gives the agent everything else it needs to do its job. You don't have to teach the agent about the codebase, the team's bets, or the tools — it learns that through the knowledge fabric."

5. **Default agent roster.** When a strategy creates a team, which agents are auto-provisioned? How does this differ by team type/function? What does the "ramp up" path look like — start with 1-2 agents, add more as the team matures?

**Acceptance criteria.**
- A concept document exists at `docs/agent-layer/agent-structure.md` (or appropriate location) defining the agent category taxonomy with clear boundaries.
- The role model is updated: `USER_ROLES` or its replacement reflects the category distinction (team/strategy/personal) and the domain model (which functions map to which agent templates).
- SOUL.md vs AGENT.md composition is documented: what the user controls, what the strategy materializes, and how they combine.
- The default agent roster per team type is defined: which agents ship with a new team, keyed by team function.
- The concept is reconciled with existing code: `factorySettings` templates, `users.role`, `userSkills`, and the harness adapter model. Migration path from current flat roles to the new structure is outlined.
- Shared contracts in `packages/shared/` are updated to reflect the new type hierarchy.

**Plan calls.** `/concept` required — this is the foundational concept work. No `/design` or `/architecture` needed; this is pure domain modeling.

**Contracts / constraints.**
- Must not break existing agent creation (X3) — this is a conceptual extension, not a replacement. Migration is planned, not forced.
- The concept must work for both the current 3-template state and a future with many more domain-specific templates.
- Must account for the materialization pipeline (knowledge fabric) as the mechanism for AGENT.md composition.

**Out of scope.**
- Implementation of the new role model in code (that's AB1-AB3 after this concept is locked).
- UI for editing agent identity (AB3 covers this after AB0 is done).
- Materialization pipeline changes (Track B / fabric work).

**Effort.** M (~6h)

---

### AB1 — Agent Profile & Capabilities

**Workpackage.** As a team lead, I want each agent to have a profile page showing everything about that agent — identity, role, harness, MCP configuration, skills, capabilities, recent activity, performance, and health — so that I can understand what each agent does, how it's configured, and whether it needs attention.

**What exists today.** Agent data is spread across: `users` table (soul prompt, harness type, model tier), `userSkills` table (skills, autonomy, success/failure), `sessions` table (activity history), harness adapter `getCapabilities()` method (capability features), and MCP bridge configuration. None of this is surfaced in a unified view — you have to navigate Settings > Agents to see basic config.

**Why this matters.** A team lead managing humans can see who is working on what, how they are performing, and whether they need help. The same visibility does not exist for agents today — understanding whether an agent is misconfigured, underperforming, or stuck requires navigating three separate settings screens and cross-referencing session logs. That friction means agents get neglected rather than managed. The profile page is the operational anchor for the human+AI team model: without it, "agents as team members" is a slogan, not a reality.

**Depends on.** AB0 — Agent Structure Concept. The profile page sections differ by agent category (team/strategy/personal), and the identity composition (SOUL vs AGENT.md) determines what the profile shows as user-editable vs strategy-managed.

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

### AB3 — Agent Configuration & Customization

**Workpackage.** As a team lead, I want to understand and customize the agents that ship with my team — editing their soul, adjusting their model tier, and optionally adding new custom agents — so that I can tailor the team's AI members to our specific needs without starting from scratch.

**What exists today.** Agent editing exists via Settings > Agents (X3) but is a flat form with no guidance. Strategies ship default agents per team, but there's no UI that presents these agents as "your team's starting roster, ready to customize." The primary journey (understand defaults → customize) is not supported; only the secondary journey (create from scratch) exists, and even that requires technical knowledge. The existing PR #195 (draft, blocked) contains a create-from-scratch wizard that assumed the wrong primary flow; its dialog mechanics may be reusable but the role model and flow need redesign after AB0.

**Why this matters.** The strategy ships a thoughtful default roster. A team lead's first interaction with agents should be "here are your agents, here's what they do, here's what you can change" — not "create an agent from nothing." The edit/customize flow is the 90% case. Create-from-scratch is the 10% power-user case. Getting this wrong means the default agents go unnoticed and uncustomized, which is the same as not having them.

**Depends on.**
- AB0 — Agent Structure Concept. AB0 defines the role model, agent categories, SOUL vs AGENT.md composition, and default roster. AB3 cannot design the right UI without knowing what agents exist, which are editable, and what "editing the soul" means vs what the strategy handles.

**Complexity.** M

**Acceptance criteria.**
- The team page surfaces the strategy-shipped default agents with clear descriptions of what each does, so a team lead understands their starting roster without navigating to Settings.
- A team lead can edit an agent's soul (personality, style, values) through a guided flow that explains what they control vs what the strategy handles ("You define the soul. The system gives the agent context, tools, and knowledge automatically.").
- The edit flow respects agent categories (AB0): team agents are readily customizable, strategy agents are editable but marked as "managed by strategy — changes may be overwritten," personal agents are fully user-controlled.
- A team lead can adjust harness and model tier with sensible defaults and validation (harness available, tier configured).
- Optionally, a team lead can add a fully custom agent (the 10% flow) — picking a domain, writing a soul prompt, selecting harness and model tier.
- First-time users see their default agents with a prompt to review and customize them, not a blank slate with "create your first agent."

**Validation scenarios.**
- Given a new team created by a strategy with 2 default agents, when the team page loads, then the agents section shows 2 agent cards with names, roles, and "Review & customize" affordances.
- Given a team lead opens the edit flow for a team agent, when they see the soul prompt, then it is pre-filled from the strategy template and the UI explains "Edit this to change the agent's personality. The system handles tools, context, and knowledge."
- Given a team lead opens a strategy-level agent (e.g., Practice Facilitator), when the edit flow opens, then a note explains this agent is managed by the strategy and local edits may be refreshed on strategy updates.
- Given a team lead wants a custom agent, when they click "Add custom agent," then a create flow walks them through domain selection, soul prompt, harness, and model tier.

**Plan calls.** `/design` needed — the edit-first flow is a different interaction pattern than the previous create-first wizard. Architecture pass should design: how default agents are surfaced on the team page, how the edit flow differs by agent category, and how SOUL.md editing integrates with strategy materialization. `/concept` is NOT needed here — AB0 handles concept.

**Contracts / constraints.**
- Uses the agent category taxonomy from AB0.
- Soul editing UI must align with the SOUL vs AGENT.md boundary defined in AB0.
- Uses canonical model tier names (`reasoning | workhorse | fast`).
- Must work with both strategy-shipped agents and user-created custom agents.
- The existing PR #195 dialog mechanics (native `<dialog>`, stepper, validation) may be reused or discarded — the concept work in AB0 determines whether the interaction model changes enough to warrant starting fresh.

**Out of scope.**
- Defining the agent categories or role model (AB0).
- Materialization pipeline changes (how AGENT.md is assembled from SOUL + strategy + context).
- Bulk agent operations.

**Effort.** M (~6h)
