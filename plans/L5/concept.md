# L5 — Concept Probe

## What does L5 establish?

L5 is **spec-only** — no code, no schema, no routes. It rewrites the "Relevance / Attention" section of the knowledge-architecture docs so that recency and frequency are first-class data contracts, and unblocks L22 (the implementation story) with a single unambiguous target.

## The core move

Knowledge items need a user-facing rank (`relevanceScore`) that is separate from the facilitator-facing queue signal (`attentionScore`). The two scores ride the same row but derive from disjoint inputs and never collapse.

**Recency and frequency ship as data contracts.** Every knowledge item will know: when it was last validated, last edited, last accessed, and how many times it was accessed in a trailing 30-day window. All signals are populated from server-side tracking — `knowledge_access_log` via `GET /api/knowledge/:layer/:id` detail fetches — never client analytics or agent self-report.

**Citation is staged with `—` placeholder.** Citation as a signal requires a trustworthy source (a typed harness tool that records `readKnowledge(id)` server-side, not an agent self-report). That source does not exist today and is bigger than L22. The `citationCount` column exists in the data contract as nullable; the UI renders `—` until it is non-null. The anti-pattern is explicit: the existing `IMPACT_BY_KIND` constant in `packages/fabric/src/attention-scoring.ts` is a fake number — L22 deletes it.

**Composite formula: 0.4 recency + 0.4 frequency + 0.2 citation (staged).** Exponential decay at a 14-day half-life for recency; linear-saturating at 5 accesses/30 days for frequency. The effective denominator drops citation while it is null so the two live signals normalise correctly.

**Tunable via `factory_settings`.** All seven constants (`relevance.weight.recency`, `relevance.weight.frequency`, `relevance.weight.citation`, `relevance.recencyHalflifeDays`, `relevance.frequencySaturation`, `relevance.frequencyWindowDays`, `relevance.citationSaturation`) live in the existing DB table, not in source. Same loader pattern as `attention.weight.*` in `packages/fabric/src/scoring-config.ts`. Human-write-only; agent writes to `relevance.*` keys are rejected.

## No BLOCKER

L5 is integration of a spec into the docs. Concept is intact. L22 is unblocked.

## Cross-references

- Spec section: `docs/knowledge-architecture/relevance-and-attention.md`
- Architecture plan: `plans/L5/architecture.md`
- Bug to fix in L22: `packages/fabric/src/attention-scoring.ts` (`IMPACT_BY_KIND` constant, `computeUsage` returning 0)
- Improvements cross-link: `plans/reviews/improvements-knowledge.md` #1
