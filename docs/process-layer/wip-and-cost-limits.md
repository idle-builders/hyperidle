# WIP Limits

The single cheapest way to ruin an agent factory is to spawn unbounded parallel work. WIP (work-in-progress) is bounded at two levels — **agent** and **team** — by a plain concurrency ceiling, never by a duration budget.

> **@lore AU21 Increment 14a (founder, 2026-08-03): the cost-cap/accounting feature this doc used to describe is HARD-DELETED, no replacement.** HyperIdle previously tracked a Money cap/actual-spend pair at the agent/team/factory/bet/routine levels (`@hyperidle/cost`'s `cost-cap.ts`) and gated new sessions on it. The founder's ruling, verbatim: *"the real cost cap is built into the upstream system like your openrouter or claude account. we do not actually enforce cost. all we do is lightweight cost accounting... this feature adds no value just chaos and complexity."* The entire mechanism — gate, ledger, events, display columns — is deleted with no replacement; the real spend ceiling lives at the upstream LLM provider account (OpenRouter/Anthropic), not in HyperIdle. A future, separate effort may rebuild lightweight cost accounting from scratch; nothing here anticipates that shape.

## Per agent

Each agent has a maximum number of in-progress sessions — WIP limit, **default 1** (`users.maxConcurrentSessions`, schema.ts:51). At the limit, new task assignments queue or get reassigned to a teammate (task-dispatcher.ts skips the agent; `ConcurrencyLimitError`, errors.ts).

## Per team

Each team has a maximum number of parallel tasks (`teamMembers.capacity`, schema.ts — no baked-in formula) and a soft preference for one active bet at a time. Multiple parallel bets are allowed but tracked as *focus on capacity*, not money.

## Per factory

There is no factory-level cap of any kind. (The former factory Money cap + Cost Sentinel are deleted along with the rest of the cost feature — see the notice above.)

## Rationale: why not a duration budget

Shape Up's appetite was a calendar timebox because human teams shipped against calendar weeks. An AI factory does not. Agents work in bursts: a session might be six minutes or six hours; a task might span three sessions or thirty; a bet might be entirely parallel work or entirely serial; an agent might be paused for half a day waiting on a review thread. The thing wall-clock time measures — elapsed humans-at-keyboards — is not the resource an AI-first team is rationing; concurrency (how many sessions run at once) is. Wall-clock duration is a side effect, not a budget axis: we record it for retros and telemetry, but we do not cap on it.

## Anti-pattern: duration as a budget axis

Any future spec proposing a `duration_cap`, `time_budget`, `deadline_as_cap`, "max session length as a budget", or any other duration-shaped budget axis on a bet, task, session, agent, or team is **rejected by this section**. Time is not the signal; duration may be displayed informationally and may inform retros, but it may not gate work. No `duration_cap` or `time_budget` exists in any schema or service — the only duration-shaped column is the deprecated bet `appetite` string.

This is the canonical statement of the rule; [canonical-shapes](./canonical-shapes.md) points here.
