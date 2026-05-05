## 10. Appetite, Budget, and Cost

The single cheapest way to ruin an agent factory is to spawn unbounded parallel work. Three levels of caps, nested: agent < team < factory. Every cap is expressed in **Money** and optionally in **TokenUsage** — never in wall-clock duration. The shapes of `Money` and `TokenUsage` are defined in `docs/process-layer/canonical-shapes.md` "Money and TokenUsage shapes (TRACK-L L4)".

The grammar is consistent at every level:
- A **Money cap** in a specific currency, currency-aware and precision-safe (integer minor units, no float drift).
- An optional **TokenUsage cap** broken down by model tier (`reasoning | workhorse | fast`, matching `docs/agent-layer/model-routing-and-cost.md` §6.1), with prompt and completion counts tracked separately.
- **No duration cap.** Wall-clock duration is never a budget axis. See §10.6 for the rationale and §10.7 for the anti-pattern rule.

Bet appetites, task caps, session costs, agent caps, team caps, and factory caps all share this grammar. A consequence preview that shows "spend vs cap" shows it on the Money axis and (when the bet sets one) on the TokenUsage axis. It does not show it on a duration axis.

### 10.1 Per agent

Each agent has a maximum number of in-progress sessions (WIP limit, default: 3), a **Money cap** (daily or per-cycle), and an optional **TokenUsage cap**. When an agent hits its WIP limit, new task assignments queue or get reassigned to a teammate. When an agent hits its Money cap *or* its TokenUsage cap, the agent stops accepting new sessions and finishes in-progress work.

### 10.2 Per team

Each team has a maximum number of parallel tasks (default: team size × 2), a soft preference for one active bet at a time, a **team Money cap** (the sum of all agent Money caps on the team, plus a team-level overhead budget for facilitator work), and an optional **team TokenUsage cap**. Multiple parallel bets are allowed but tracked as a *cost on focus*, surfaced in the Rail.

**When the team Money or TokenUsage cap is reached, the team stops.** All agents on the team finish their current in-progress sessions but accept no new work until the next budget cycle or the cap is raised. A review thread fires to the founder.

Money is allocated concurrently across agents within a team — each agent draws from its own cap, and the team cap is the ceiling on the aggregate. Smart defaults: equal splits across agents, with the Product Manager getting a smaller share (facilitator work is cheaper than build work).

### 10.3 Per factory

The factory has a **factory Money cap** (the sum of all team Money caps, plus a factory-level overhead budget for Chief of Staff routines and cross-product work) and an optional **factory TokenUsage cap**. The Cost Sentinel (a heartbeat routine owned by the Chief of Staff) monitors burn rate against both axes.

**When the factory Money or TokenUsage cap is reached, everything stops.** All teams finish in-progress sessions but accept no new work. Critical ops tasks (e.g., incident response) are not killed mid-session but cannot start new sessions either — they resume when the budget resets or the cap is raised. A review thread fires to the founder.

The hierarchy is strict: an agent cannot exceed its cap even if the team has headroom. A team cannot exceed its cap even if the factory has headroom. This prevents any single actor from consuming disproportionate resources.

### 10.4 What happens when limits hit

Hitting a Money cap or a TokenUsage cap produces a thread item, not a silent drop. The same review-thread mechanism fires regardless of which axis breached. The agent or team gets a review item in Conversations (or a flag in the Rail) explaining which cap was hit (Money or TokenUsage, and which tier in the case of TokenUsage), what the threshold was, and asking for guidance. This makes capacity visible and forces the founder to either raise the cap (and accept the cost) or accept the throttling.

The harness emits `CostCapExceededError` for either axis (see `docs/agent-layer/harness-error-taxonomy.md`); the error payload distinguishes which cap was breached.

The opposite — silent dropping — is the failure mode of every agent system that "scales smoothly." It also makes diagnosis impossible.

### 10.5 Budget cycles and defaults

Caps reset on a configurable cycle (default: daily). The factory ships with conservative smart defaults: a per-agent Money cap (configurable), team caps derived from team composition, factory cap derived from team caps. Optional TokenUsage caps are off by default and turned on when a deployer wants tier-level throttling. The founder can override any level. All caps are stored in the Primitive Store and editable via the Settings view. **No numerical defaults are baked into source** — caps live in configuration, not in code.

### 10.6 Rationale: does duration really matter in an AI world?

Shape Up's appetite was a calendar timebox because human teams shipped against calendar weeks. An AI factory does not. Agents work in bursts: a session might be six minutes or six hours; a task might span three sessions or thirty; a bet might be entirely parallel work or entirely serial; an agent might be paused for half a day waiting on a review thread. The thing wall-clock time measures — elapsed humans-at-keyboards — is no longer the resource the founder is rationing.

The resource the founder is rationing is **money** (what the factory spent) and **tokens** (how much complexity the models chewed through). Both are observable per session, additive across sessions, and meaningful at the bet level. Wall-clock duration is a side effect, not a budget axis. We record it for retros and telemetry — "this bet shipped in 11 days, spent $214.30 across 4.2M Workhorse tokens" — but we do not cap on it.

The corollary: a bet that "took two weeks" but spent $0.30 because the model nailed it on the first session is not over-budget. A bet that ran one calendar day but burned through $400 of Reasoning tier in a runaway sub-agent loop is. Time is not the signal. Complexity is.

### 10.7 Anti-pattern: duration as a budget axis

Any future spec proposing a `duration_cap`, `time_budget`, `deadline_as_cap`, "max session length as a budget", or any other duration-shaped budget axis on a bet, task, session, agent, team, or factory is **rejected by this section**. The rationale is §10.6. The grammar is Money + TokenUsage. Duration may be displayed informationally; it may inform retros; it may not gate work.

This anti-pattern is also recorded in `docs/process-layer/canonical-shapes.md` (Money + TokenUsage entry) and is the canonical statement of the rule.

---
