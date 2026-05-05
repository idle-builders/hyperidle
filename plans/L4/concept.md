# L4 — Concept Probe

## What does L4 add?

L4 replaces the Shape Up-style duration appetite (`1 week / 2 weeks / 6 weeks`) with a **Money + TokenUsage** budget grammar at every layer of the factory: bet, task, session, agent, team, and factory. Duration is demoted from a budget axis to an informational field recorded only for telemetry and retros.

Key decisions:
- `cost_appetite` (Money) replaces the old `appetite` string on Bet; `token_appetite?` (TokenUsage) is optional.
- Task gains `token_cap?` and `tokens_actual`; existing `cost_cap`/`cost_actual` become typed as `Money`.
- Session gains a `tokens` field (TokenUsage) alongside the existing `cost` field (now typed as `Money`).
- `§10` of the five-primitives doc is rewritten as "Appetite, Budget, and Cost" with a rationale subsection (§10.6) and an explicit anti-pattern rule (§10.7) that rejects any future `duration_cap` proposal.

## No BLOCKER

The story is spec-only. See `plans/L4/architecture.md` for the full plan. L17 is unblocked.
