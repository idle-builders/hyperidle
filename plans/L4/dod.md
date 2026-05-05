# L4 Definition of Done

- [x] AC1: `docs/process-layer/the-five-primitives.md` §10 (via `docs/process-layer/wip-and-cost-limits.md`) retitled "Appetite, Budget, and Cost"; opening paragraph: "Every cap is expressed in **Money** and optionally in **TokenUsage** — never in wall-clock duration." Bet/Task/Session/Team primitives in §3 swap `appetite`/`cost_cap`/`capacity` to Money + TokenUsage; §3.1 explicitly states "No duration budget axis on a bet"; §3.2 "A task has no duration cap"; §3.3 "`started_at` and `ended_at` exist for telemetry and retros; their delta is informational"; §10.1–10.5 rewritten in Money/TokenUsage terms.
- [x] AC2: `docs/process-layer/canonical-shapes.md` "Money and TokenUsage shapes (TRACK-L L4)" entry defines `Money = { minor: bigint; currency: CurrencyCode; scale: number }` (currency-aware, precision-safe via bigint minor units) and `TokenUsage = { byTier: Partial<Record<ModelTier, TierTokenCount>> }` with prompt/completion split per tier and `ModelTier = 'reasoning' | 'workhorse' | 'fast'` (coarse model-tier signal). Tier names recorded; default currency `USD` (scale=2) recorded; "No numerical defaults in source" rule recorded.
- [x] AC3: `docs/process-layer/wip-and-cost-limits.md` §10.6 "Rationale: does duration really matter in an AI world?" — opens "Shape Up's appetite was a calendar timebox… An AI factory does not. Agents work in bursts" and closes "Time is not the signal. Complexity is." §10.7 adds the anti-pattern rule rejecting any future `duration_cap` proposal.
- [x] AC4: `docs/process-layer/canonical-shapes.md` "Shared Contracts" carries the full Money / TokenUsage / TierTokenCount / ModelTier / CurrencyCode block with precision rules, scale-currency pairing, closed-enum rule, coerce-and-flag rule for unknown harness tiers, and explicit pointer "Implementation stories that consume this contract: L17". `CostCapExceededError` entry in `docs/agent-layer/harness-error-taxonomy.md` updated to note it fires for either axis.
- [x] AC5: `docs/agent-layer/one-agent-one-team-sub-agents-are-internal.md` §5 (sub-agents) updated — "Sub-agents share the session's workspace, the session's **Money cap and TokenUsage cap** (never a duration cap)" and "Each session row carries a `cost` field (Money) and a `tokens` field (TokenUsage)… Sub-agent spend rolls up into both fields". `docs/agent-layer/model-routing-and-cost.md` §6.3 "Cost posture" rewritten to "daily Money ceiling and an optional daily TokenUsage ceiling" with breach behaviour on either axis; tier vocabulary closed-enum rule mirrored here.
- [x] AC6: `bun run check` exit 0; `bun run lint` exit 0; `bun run test` exit 0.

## Verify
- check: to be run
- lint: to be run
- test: to be run

## Verdict
PENDING verification
