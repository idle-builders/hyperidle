# WIP and Cost Limits

The single cheapest way to ruin an agent factory is to spawn unbounded parallel work. Three levels of caps, nested: **agent < team < factory** (`packages/fabric/src/services/cost-cap.ts`, levels `"agent" | "team" | "factory"`). Every cap is expressed in **Money** and optionally in **TokenUsage** — never in wall-clock duration.

## 10. Appetite, Budget, and Cost

The grammar is consistent at every level:

- A **Money cap** in a specific currency, currency-aware and precision-safe: integer minor units, `bigint` internally, `WireMoney` (number minor units) for JSON transport. Types in `packages/shared/src/types/money.ts`.
- An optional **TokenUsage cap** broken down by model tier, with prompt and completion counts tracked separately (`TokenUsage.byTier`, money.ts:66-67). Tier vocabulary (`reasoning | workhorse | fast`) is owned by [model routing and cost](../agent-layer/model-routing-and-cost.md) — any change to the tier set must update both docs together.
- **No duration cap.** Wall-clock duration is never a budget axis. See §10.6 for the rationale and §10.7 for the anti-pattern rule.

Bet appetites, task caps, session costs, agent caps, team caps, and factory caps all share this grammar. Bets carry a cost appetite (`bets.costAppetiteMinor/Currency`, schema.ts:151-153); the old duration `appetite` string is deprecated (schema.ts:134-139, L17). A consequence preview that shows "spend vs cap" shows it on the Money axis. It does not show it on a duration axis.

**Reality gap (recorded here, once):** TokenUsage is *tracked* (per-session tokens, per-tier breakdown) but TokenUsage *caps are unbuilt* — no token-cap columns exist at any level, and `CostCapExceededError` carries only `entityId/spend/cap` with no axis field (`packages/shared/src/errors.ts:32-41`). Everything below that mentions a TokenUsage cap is grammar the shipped enforcement does not yet implement; only the Money axis is enforced.

### 10.1 Per agent

Each agent has:

- A maximum number of in-progress sessions — WIP limit, **default 1** (`users.maxConcurrentSessions`, schema.ts:51). At the limit, new task assignments queue or get reassigned to a teammate (task-dispatcher.ts:414 skips the agent; `ConcurrencyLimitError`, errors.ts:43).
- A **Money cap** (`users.costCapMinor/costCapCurrency`, schema.ts:56-57). When hit, the agent stops accepting new sessions and finishes in-progress work.
- An optional **TokenUsage cap** in the grammar — not yet enforceable (see reality gap above).

### 10.2 Per team

Each team has a maximum number of parallel tasks (`teamMembers.capacity`, schema.ts:107 — no baked-in formula), a soft preference for one active bet at a time, and a **team Money cap** (`teamMembers.costCapMinor`, schema.ts:113). Multiple parallel bets are allowed but tracked as a *cost on focus*, surfaced in the WorkTeam burn-vs-cap stat strip (`data-testid="team-burn-vs-cap"`: Burn / Cap / Capacity / Status, `packages/web/src/pages/WorkTeam.tsx:306`).

**When the team Money cap is reached, the team stops.** All agents on the team finish their current in-progress sessions but accept no new work until costs are reset or the cap is raised. A review item fires (cost-cap.ts:430).

Money is allocated concurrently across agents within a team — each agent draws from its own cap, and the team cap is the ceiling on the aggregate (team spend = sum across the team's users, cost-cap.ts:140). Cap values are configuration; no automatic split formula is implemented.

### 10.3 Per factory

The factory has a **factory Money cap** (`factorySettings`; `factoryCap`/`factorySpend` in cost-cap.ts). The **Cost Sentinel** monitors burn rate against it — a 15-minute `setInterval` registered as application code in `bootstrapFabric`, deliberately **not** a routine row so it cannot be disabled by flipping a routine's `active` flag (`packages/fabric/src/services/cost-sentinel.ts:22-34`; warning ratio 0.8).

**When the factory Money cap is reached, everything stops.** All teams finish in-progress sessions but accept no new work. Critical ops tasks (e.g., incident response) are not killed mid-session but cannot start new sessions either — they resume when costs are reset or the cap is raised. A review item fires to the founder.

The hierarchy is strict: an agent cannot exceed its cap even if the team has headroom; a team cannot exceed its cap even if the factory has headroom (cost-cap.ts checks agent, then team, then factory; `allowed: false` at any level blocks new sessions). This prevents any single actor from consuming disproportionate resources.

### 10.4 What happens when limits hit

Hitting a cap produces a thread item, never a silent drop. On breach, `checkAndEmit` emits a `CostCapBreachedEvent` and creates a review item in Conversations when a review thread is configured (cost-cap.ts:430-462), explaining which cap was hit and what the threshold was, and asking for guidance. The Cost Sentinel dedupes by level transition (ok → warning at 0.8 → breach) so operators get exactly one event per state change, not one per tick (G4 lore, cost-sentinel.ts). This makes capacity visible and forces the founder to either raise the cap (and accept the cost) or accept the throttling.

The opposite — silent dropping — is the failure mode of every agent system that "scales smoothly." It also makes diagnosis impossible.

### 10.5 Budget cycles and defaults

`resetCosts` exists for starting a new billing cycle (cost-cap.ts:494) but **no scheduler calls it** — there is no automated daily reset; a cycle reset is a deliberate operator action. Caps live in the Primitive Store and are editable via Settings (`factorySettings` table; per-agent and per-team cap columns). Most cap *values* are configuration, but some numeric defaults are baked into source: `maxConcurrentSessions` defaults to 1 (schema.ts:51), the warning ratio is 0.8 and the sentinel interval 15 minutes (cost-sentinel.ts:30-34).

### 10.6 Rationale: does duration really matter in an AI world?

Shape Up's appetite was a calendar timebox because human teams shipped against calendar weeks. An AI factory does not. Agents work in bursts: a session might be six minutes or six hours; a task might span three sessions or thirty; a bet might be entirely parallel work or entirely serial; an agent might be paused for half a day waiting on a review thread. The thing wall-clock time measures — elapsed humans-at-keyboards — is no longer the resource the founder is rationing.

The resource the founder is rationing is **money** (what the factory spent) and **tokens** (how much complexity the models chewed through). Both are observable per session, additive across sessions, and meaningful at the bet level (`bets.costActualMinor` schema.ts:155, per-bet tokens JSON `bets.tokensActualJson` schema.ts:158 — sessions have no cost columns; cost is rolled up to bets/agents/teams at session end). Wall-clock duration is a side effect, not a budget axis. We record it for retros and telemetry — "this bet shipped in 11 days, spent $214.30 across 4.2M Workhorse tokens" — but we do not cap on it. The code followed this reasoning: L17 deprecated the duration appetite string on bets in favour of `costAppetiteMinor` (schema.ts:134-139).

The corollary: a bet that "took two weeks" but spent $0.30 because the model nailed it on the first session is not over-budget. A bet that ran one calendar day but burned through $400 of Reasoning tier in a runaway sub-agent loop is. Time is not the signal. Complexity is.

### 10.7 Anti-pattern: duration as a budget axis

Any future spec proposing a `duration_cap`, `time_budget`, `deadline_as_cap`, "max session length as a budget", or any other duration-shaped budget axis on a bet, task, session, agent, team, or factory is **rejected by this section**. The rationale is §10.6. The grammar is Money + TokenUsage. Duration may be displayed informationally; it may inform retros; it may not gate work. No `duration_cap` or `time_budget` exists in any schema or service — the only duration-shaped column is the deprecated bet `appetite` string.

This is the canonical statement of the rule; [canonical-shapes](./canonical-shapes.md) (Money + TokenUsage entry) points here.
