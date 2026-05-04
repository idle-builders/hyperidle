## 10. WIP and Cost Limits

The single cheapest way to ruin an agent factory is to spawn unbounded parallel work. Three levels of caps, nested: agent < team < factory.

### 10.1 Per agent

Each agent has a maximum number of in-progress sessions (WIP limit, default: 3) and a **cost cap** (daily or per-cycle budget). When an agent hits its WIP limit, new task assignments queue or get reassigned to a teammate. When an agent hits its cost cap, the agent stops accepting new sessions and finishes in-progress work.

### 10.2 Per team

Each team has a maximum number of parallel tasks (default: team size × 2), a soft preference for one active bet at a time, and a **team cost cap** (the sum of all agent cost caps on the team, plus a team-level overhead budget for facilitator work). Multiple parallel bets are allowed but tracked as a *cost on focus*, surfaced in the Rail.

**When the team cost cap is reached, the team stops.** All agents on the team finish their current in-progress sessions but accept no new work until the next budget cycle or the cap is raised. A review thread fires to the founder.

Cost is allocated concurrently across agents within a team — each agent draws from its own cap, and the team cap is the ceiling on the aggregate. Smart defaults: equal splits across agents, with the Product Manager getting a smaller share (facilitator work is cheaper than build work).

### 10.3 Per factory

The factory has a **factory cost cap** (the sum of all team caps, plus a factory-level overhead budget for Chief of Staff routines and cross-product work). The Cost Sentinel (a heartbeat routine owned by the Chief of Staff) monitors burn rate.

**When the factory cost cap is reached, everything stops.** All teams finish in-progress sessions but accept no new work. Critical ops tasks (e.g., incident response) are not killed mid-session but cannot start new sessions either — they resume when the budget resets or the cap is raised. A review thread fires to the founder.

The hierarchy is strict: an agent cannot exceed its cap even if the team has headroom. A team cannot exceed its cap even if the factory has headroom. This prevents any single actor from consuming disproportionate resources.

### 10.4 What happens when limits hit

Hitting a limit produces a thread item, not a silent drop. The agent or team gets a review item in Conversations (or a flag in the Rail) explaining what was capped and asking for guidance. This makes capacity visible and forces the founder to either raise the cap (and accept the cost) or accept the throttling.

The opposite — silent dropping — is the failure mode of every agent system that "scales smoothly." It also makes diagnosis impossible.

### 10.5 Budget cycles and defaults

Cost caps reset on a configurable cycle (default: daily). The factory ships with conservative smart defaults: $X/day per agent (configurable), team caps derived from team composition, factory cap derived from team caps. The founder can override any level. All caps are stored in the Primitive Store and editable via the Settings view.

---
