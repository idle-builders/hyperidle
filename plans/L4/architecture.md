# L4 — Cost & Tokens (no Duration) appetite model: Plan

**Story.** TRACK-L L4 — `plans/work-packages/TRACK-L.md` lines 148-173.

**Status.** SPEC-ONLY. The deliverables are concept-doc edits and canonical-shapes.md entries. Type definitions and any runtime code land in **L17** (`plans/work-packages/TRACK-L.md` lines 543-575), which depends on L4. There are no Vitest or Playwright tests in this story; see the no-test rationale at the bottom.

**Sources of truth (do not re-litigate).**
- Story scope and acceptance criteria: `plans/work-packages/TRACK-L.md` § L4 (lines 148-173).
- Downstream consumer: `plans/work-packages/TRACK-L.md` § L17 (lines 543-575).
- Concept docs to edit: `docs/process-layer/the-five-primitives.md`, `docs/process-layer/wip-and-cost-limits.md`.
- Contract destination: `docs/process-layer/canonical-shapes.md` "Money and TokenUsage shapes (TRACK-L L4)".

`route-checklist:` in §3. Spec-only — no routes.

---

## 1. Decision log

### 1.1 Money type — currency-aware, precision-safe

**Choice.** Integer minor units (`bigint`) plus an explicit `currency` tag and a `scale` exponent.

```
type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'JPY'   // closed; extend in this doc only
type Money = {
  minor: bigint     // amount in the smallest indivisible unit of the currency
  currency: CurrencyCode
  scale: number     // exponent: USD/EUR/GBP scale=2 (cents); JPY scale=0 (yen)
}
```

**Justification.**
- **Precision-safe by construction.** `bigint` cannot lose precision under arithmetic — addition, subtraction, and bounded scaling are exact. JavaScript `number` (IEEE-754 float64) loses precision past ~15 significant decimal digits and silently rounds when summing many small token-priced operations. That failure mode is intolerable for budget enforcement.
- **No string parse on the hot path.** The alternative — a `BigDecimal`-style `{ amount: string, currency }` — requires parsing on every comparison and every sum. Cost ceilings are checked per session, per task, per team, per factory, on every cost event. Integer minor units do this comparison as a single `bigint` op.
- **Currency travels with the value.** No money value is dimensionless. A money instance without `currency` is rejected by the type. Mixed-currency arithmetic is invalid by construction (the helper API in L17 will require a single-currency invariant).
- **Scale is explicit, not implicit.** JPY (`scale=0`) and USD (`scale=2`) coexist in the same field shape without per-currency special cases in callers. The scale is a property of the value, not of the formatter. The default currency is `USD` (`scale=2`).
- **Why not floats.** Storing dollars as a `number` *will* drift. Storing 12.34 USD then summing it 10,000 times across sessions does not equal 123,400 cents in float64.
- **Why not `BigDecimal`-string.** Strings hide non-numeric values, demand a parser everywhere, and cannot be compared with `<`/`>`/`===` directly. The runtime cost compounds across the cost-sentinel routine (`docs/process-layer/wip-and-cost-limits.md` §10) which polls budget state continuously.

**Default currency:** `USD`. Stored explicitly with every value — the default is for new-row construction only, never for inference at read time.

**Numerical defaults:** none in this spec. The factory ships smart defaults at the team and factory level; the actual cap values are configuration (Primitive Store), not source. L17 will provide a `zeroMoney(currency)` constructor and a `formatMoney(money)` formatter.

### 1.2 TokenUsage type — prompt vs completion, model-tier signal

**Choice.** Per-tier breakdown with prompt and completion split; cached-input tokens recorded separately when the harness reports them.

```
type ModelTier = 'reasoning' | 'workhorse' | 'fast'   // closed; matches docs/agent-layer/model-routing-and-cost.md §6.1

type TierTokenCount = {
  prompt: bigint            // input tokens billed at the prompt rate
  completion: bigint        // output tokens billed at the completion rate
  cachedPrompt?: bigint     // optional: prompt tokens served from cache (cheaper rate)
}

type TokenUsage = {
  byTier: Partial<Record<ModelTier, TierTokenCount>>   // only tiers actually used appear
  // total counts are derived; never stored, to avoid drift between byTier and total
}
```

**Justification.**
- **Tier names are inherited, not invented.** `reasoning | workhorse | fast` are already canonical in `docs/agent-layer/model-routing-and-cost.md` §6.1. Inventing a new vocabulary (e.g. `economy | standard | frontier`) would fork the taxonomy used by the Scheduler and the Cost Sentinel. Single source of truth wins. The lowercase form is the type-level representation; the prose form (`Reasoning`, `Workhorse`, `Fast`) is the human-display form.
- **Prompt vs completion are separately priced.** Most providers price input and output tokens differently (often 3-5x apart). Reporting a single `tokens: bigint` would erase the price signal that money depends on.
- **`bigint` for token counts.** A long-running session can emit millions of tokens; sub-agent fan-out (`docs/agent-layer/one-agent-one-team-sub-agents-are-internal.md` §5.1) rolls up into the parent. `bigint` removes the ~9-trillion-token `Number.MAX_SAFE_INTEGER` ceiling and prevents silent accumulation drift.
- **Cached prompt tokens are optional, not implied.** Prompt caching (Anthropic, OpenAI) bills a different rate. We capture it when the harness reports it; we do not synthesise it.
- **`byTier` is sparse.** A session that only used Workhorse has only `byTier.workhorse`. Empty tiers do not appear with zero counts — the absence is the signal.
- **Totals are derived, never stored.** A naive `{ prompt, completion }` aggregate alongside `byTier` would drift the moment one side gets updated and the other doesn't. Aggregation lives in helper functions (L17), not in the data shape.

### 1.3 Tier vocabulary — defended

The closed tier set `reasoning | workhorse | fast` is what we ship. Reasons:
- It already exists and is load-bearing (`docs/agent-layer/model-routing-and-cost.md` §6.1, §6.2, §6.3).
- It carries a routing semantic that is meaningful to humans reading the Rail: "this session was on Reasoning tier" is more legible than "tier 3" or "frontier."
- It is provider-agnostic: the deployer maps tiers to actual models (`docs/agent-layer/model-routing-and-cost.md` §6.3). The tier is the routing primitive; the model is the implementation detail.
- Adding a fourth tier (e.g. `local`) requires concept-doc updates to both `docs/agent-layer/model-routing-and-cost.md` §6.1 and `docs/process-layer/canonical-shapes.md` simultaneously. Closed enum, single point of change.

### 1.4 Wall-clock duration — informational only

Sessions do record `started_at` and `ended_at`. Wall-clock duration is derivable for telemetry, retros, and "this session ran 30 minutes" displays. **Duration is never a budget axis.** Bets do not have a duration cap; tasks do not have a duration cap; sessions do not have a duration cap. The cost ceilings are money + tokens.

The current `appetite` field on `Bet` (`docs/process-layer/the-five-primitives.md` §3.1) is the legacy duration-as-budget shape. L4 rewrites this into money + tokens. The L17 implementation removes the string field and any duration-typed budget fields.

### 1.5 Anti-pattern: a `duration` budget axis

A future spec proposing a `duration_cap`, `time_budget`, `deadline_as_cap`, or any other duration-shaped budget axis is **rejected by these docs**. The rationale: agents work in bursts, often parallel, often paused; wall-clock time is a poor proxy for complexity. Complexity is reflected in tokens (how much the model had to process and emit) and in money (what that processing cost). Time elapsed is correlated with neither.

This anti-pattern is recorded:
- in `docs/process-layer/the-five-primitives.md` §3.1 (Bet) — explicit "no duration budget" callout
- in `docs/process-layer/wip-and-cost-limits.md` §10 (Appetite, Budget, and Cost) — caps are money + tokens, not time
- in `docs/process-layer/canonical-shapes.md` Money/TokenUsage entry — anti-pattern stated alongside the type contract

### 1.6 Failure modes addressed by the spec

These are the failure modes the contract must close, and where each is closed:

- **Currency mismatch on aggregation** (e.g. summing USD and EUR Money values in a team rollup). Closed by the single-currency invariant: helper functions in L17 (`addMoney`, `compareMoney`) reject mixed-currency arithmetic at the boundary. The DB stores currency per-row, so the invariant is enforced before any aggregation runs. Cross-currency totals are not a feature of this spec — every aggregate stays in a single currency until rendered.
- **`(currency, scale)` mismatch.** A `Money { currency: 'USD', scale: 0 }` value is invalid. The valid pairs are closed (USD/EUR/GBP=2, JPY=0). L17 helpers (`zeroMoney`, the `Money` constructor, the formatter) reject mismatched values. `docs/process-layer/canonical-shapes.md` records the pairs explicitly so the rule has a single source of truth and adding a currency forces a same-change update.
- **Precision overflow on tokens.** `bigint` removes the `Number.MAX_SAFE_INTEGER` ceiling (~9 trillion). Long-running sessions plus sub-agent fan-out cannot silently roll over. Money minor units are also `bigint` so per-cycle aggregation across a year of factory operation cannot drift.
- **Precision drift on money.** `number` (float64) is not used at any step — not in storage, not in transport, not in arithmetic. `bigint` minor-unit math is exact. The formatter is the only place that converts to a display string; converting back is not supported (one-way).
- **Unknown tier from a harness.** If a harness reports tokens under a tier name outside `reasoning | workhorse | fast`, the Harness Adapter MUST coerce-and-flag: bucket spend into the closest known tier (adapter-specific mapping) and emit a `ModelTierUnknownWarning` event. The adapter MUST NOT silently drop the tokens, MUST NOT widen the closed enum at runtime, and MUST NOT introduce a new tier without a concept-doc update to `docs/agent-layer/model-routing-and-cost.md` §6.1 and `docs/process-layer/canonical-shapes.md`. Recorded in `docs/process-layer/canonical-shapes.md`.
- **Cap breach.** Money cap or TokenUsage cap exceeded fires `CostCapExceededError` (overloaded across both axes; payload distinguishes which). Same review-thread mechanism for either axis. Documented in `docs/process-layer/wip-and-cost-limits.md` §10.4 and `docs/agent-layer/harness-error-taxonomy.md`.
- **Drift between `byTier` and a stored total.** Closed by construction: totals are derived in helpers, never stored. There is no aggregate field on `TokenUsage` that can disagree with the per-tier sum.
- **`cachedPrompt` synthesis.** Optional. The adapter only sets it when the harness reports cache-hit counts separately. We never compute it from heuristics; absence means "not reported," not "zero."

### 1.7 Founder framing — "Does duration really matter in an AI world?"

Captured as a Rationale subsection in the rewritten "Appetite / Budget / Cost" content of `docs/process-layer/wip-and-cost-limits.md`. The argument: in an AI factory, an agent does not "work for two weeks"; it works in bursts of many sessions, possibly in parallel with other agents on the same bet, possibly paused for hours while waiting on a review thread. The thing the founder actually wants to bound is *how much was spent* (money) and *how much complexity was burned through* (tokens). A two-week appetite that produces nothing is not under-budget; it is over-budget by the cost it consumed regardless of clock time.

---

## 2. Rationale subsection (founder framing) — text landed in wip-and-cost-limits.md

This prose lands in the rewritten "Appetite / Budget / Cost" section as §10.6.

> **Does duration really matter in an AI world?**
>
> Shape Up's appetite was a calendar timebox because human teams shipped against calendar weeks. An AI factory does not. Agents work in bursts: a session might be six minutes or six hours; a task might span three sessions or thirty; a bet might be entirely parallel work or entirely serial; an agent might be paused for half a day waiting on a review thread. The thing wall-clock time measures — elapsed humans-at-keyboards — is no longer the resource the founder is rationing.
>
> The resource the founder is rationing is **money** (what the factory spent) and **tokens** (how much complexity the models chewed through). Both are observable per session, additive across sessions, and meaningful at the bet level. Wall-clock duration is a side effect, not a budget axis. We record it for retros and telemetry — "this bet shipped in 11 days, spent $214.30 across 4.2M Workhorse tokens" — but we do not cap on it.
>
> The corollary: a bet that "took two weeks" but spent $0.30 because the model nailed it on the first session is not over-budget. A bet that ran one calendar day but burned through $400 of Reasoning tier in a runaway sub-agent loop is. Time is not the signal. Complexity is.

---

## 3. route-checklist

```
routes: none (spec-only)
```

L4 ships zero new HTTP routes, zero WebSocket topics, zero handlers. All runtime wiring (endpoints that read/write money fields, harness contract for cost reporting, formatter helpers) is delivered in L17.

---

## 4. Ordered task list — file edits

Each task lists the file, the section to edit, and what the edit does. Apply in order.

### T1 — `docs/process-layer/the-five-primitives.md` §3.1 Bet

Replace the `appetite` line in the Bet primitive box and add a money/token-cap pair. Specifically:
- Remove `appetite           # 1 week / 2 weeks / 6 weeks — bounded by capacity`.
- Replace with `cost_appetite      # Money cap on total spend for this bet — see §10` and `token_appetite     # optional TokenUsage cap, broken down by tier`.
- Add a one-paragraph callout under the Bet box: "There is no duration budget axis on a bet. Wall-clock duration is recorded informationally via `created_at` and `shipped_at` only."

### T2 — `docs/process-layer/the-five-primitives.md` §3.2 Task

Replace `cost_cap` and `cost_actual` with the structured shapes:
- `cost_cap           # Money — max spend on this task` becomes typed as Money (cross-reference to canonical-shapes.md).
- `cost_actual        # Money — running total of session costs rolled up`.
- Add `tokens_actual      # TokenUsage — running total, broken down by model tier`.
- Add `token_cap?         # optional TokenUsage — cap on token spend if the bet sets one`.
- Add a one-line "no duration cap" reminder.

### T3 — `docs/process-layer/the-five-primitives.md` §3.3 Session

Replace the `cost` field on Session with the structured shapes:
- `cost              # Money — what this session spent`.
- `tokens            # TokenUsage — prompt/completion split per tier used in this session`.
- Note that `started_at` and `ended_at` remain, but their delta is informational telemetry, not a budget input.

### T4 — `docs/process-layer/the-five-primitives.md` §3.4 Team

Replace `capacity           # max parallel bets, max parallel tasks per member, max daily cost`
with a structured-shape note: capacity records max parallel bets, max parallel tasks per member, and `daily_cost_cap` (Money) plus optional `daily_token_cap` (TokenUsage). The legacy "max daily cost" string is removed.

### T5 — `docs/process-layer/wip-and-cost-limits.md` — full rewrite into "Appetite / Budget / Cost"

Rename §10 from "WIP and Cost Limits" to "Appetite, Budget, and Cost" and rewrite so the section *is* the canonical Appetite/Budget/Cost spec. Keep the existing 10.1-10.5 substructure but shift every "cost cap" reference to be explicit about money + tokens:

- §10 intro: state the shape — every cap is **a Money cap and an optional TokenUsage cap**, never a duration cap.
- §10.1 Per agent: each agent has WIP (concurrent sessions, integer) plus a Money cost cap plus an optional TokenUsage cap.
- §10.2 Per team: team Money cap = sum of agent Money caps + facilitator overhead. Optional team TokenUsage cap.
- §10.3 Per factory: factory Money cap = sum of team Money caps + cross-product overhead. Optional factory TokenUsage cap.
- §10.4 What happens when limits hit: unchanged in spirit; clarify that cap-hit is computed against Money OR TokenUsage thresholds — either being breached fires the same review-thread mechanism.
- §10.5 Budget cycles and defaults: state that ceilings reset on a cycle (default daily); ship smart defaults; defaults stored in Primitive Store. Note: no defaults are baked into source (caps live in config).
- New §10.6 — "Rationale: does duration really matter in an AI world?" — the founder-framing prose from §2 of this plan lands here.
- New §10.7 — "Anti-pattern: duration as a budget axis" — explicit rejection rule plus citation: "any future spec proposing a duration cap on bets, tasks, sessions, or teams is rejected by this section."

Cross-reference to `docs/process-layer/canonical-shapes.md` Money / TokenUsage at the top of §10.

### T6 — `docs/agent-layer/one-agent-one-team-sub-agents-are-internal.md` §5.1 — sub-agent cost rollup

Rewrite the sub-agent cost sharing line to be explicit: sub-agents share the parent session's **Money cap and TokenUsage cap**, never a duration cap. Their token spend rolls up into the parent session's `cost` (Money) and `tokens` (TokenUsage), broken down by tier. Update the cost-tracking bullet to use the money + token grammar explicitly: "Cost tracking is per session: each session row carries a Money `cost` and a TokenUsage `tokens` field. Sub-agent spend rolls up into the parent session's two fields. Tier breakdown is preserved through the rollup so a Workhorse parent that spawned a Fast sub-agent shows both tiers in `tokens.byTier`."

### T7 — `docs/agent-layer/model-routing-and-cost.md` §6.3 Cost posture

Light edit. Reframe "daily cost ceiling" as "daily Money ceiling and optional daily TokenUsage ceiling." The downgrade ladder (Reasoning → Workhorse → defer) stays as-is. Cross-reference `docs/process-layer/canonical-shapes.md` Money / TokenUsage.

### T8 — `docs/process-layer/canonical-shapes.md` — add Money + TokenUsage entry

Append a new section titled "Money and TokenUsage shapes (TRACK-L L4)" containing:
- The `Money` type signature with `minor: bigint`, `currency: CurrencyCode`, `scale: number`.
- The closed `CurrencyCode` enum with `USD | EUR | GBP | JPY` and the per-currency scale rule (USD/EUR/GBP=2, JPY=0).
- The `ModelTier` enum (`reasoning | workhorse | fast`) cross-referencing `docs/agent-layer/model-routing-and-cost.md` §6.1.
- The `TierTokenCount` and `TokenUsage` shapes.
- Precision rules: integer minor units, `bigint` arithmetic, currency-must-match invariant for arithmetic.
- Default currency: `USD`. No numerical defaults baked into source.
- Anti-pattern callout: "no duration budget axis. A future spec proposing a duration cap is rejected. See `docs/process-layer/wip-and-cost-limits.md` §10.7."
- Consumer cross-reference: "Implementation stories that consume this contract: **L17** (Cost + Tokens wired into Work — TRACK-L lines 543-575)."

### T9 — `docs/agent-layer/harness-error-taxonomy.md` minor cross-link

In the `CostCapExceededError` line, add a parenthetical: fires for **either** Money or TokenUsage cap breaches; payload distinguishes which axis. No new error type; the existing one is overloaded.

---

## 5. Validation method per acceptance criterion

| AC | Verification method |
|---|---|
| §10 rewritten as money + tokens, no duration budget axis | Inspection: read `docs/process-layer/wip-and-cost-limits.md` §10 post-edit. The phrases "duration", "calendar", "weeks" appear only in the rationale and anti-pattern subsections, never as budget fields. `appetite           # 1 week / 2 weeks / 6 weeks` is gone from §3.1. |
| Money type currency-aware + precision-safe | Inspection: canonical-shapes.md entry shows `bigint` minor units + closed `CurrencyCode` + `scale`. `number`-typed money does not appear anywhere in the spec. |
| TokenUsage prompt/completion split + tier signal | Inspection: canonical-shapes.md entry shows `TierTokenCount { prompt; completion; cachedPrompt? }` and `byTier: Partial<Record<ModelTier, TierTokenCount>>`. |
| Rationale subsection captures founder framing | Inspection: `docs/process-layer/wip-and-cost-limits.md` §10.6 contains the "Does duration really matter in an AI world?" paragraph. |
| Money/TokenUsage shapes also in canonical-shapes.md | Inspection: `docs/process-layer/canonical-shapes.md` "Money and TokenUsage shapes (TRACK-L L4)" section contains the Money + TokenUsage block, cross-referenced from L17. |
| AGENT_LAYER updated where session cost is mentioned | Inspection: `docs/agent-layer/one-agent-one-team-sub-agents-are-internal.md` §5.1 and `docs/agent-layer/model-routing-and-cost.md` §6.3 speak in money + tokens. |
| `bun run check` + `bun run lint` + `bun run test` all green | Run the commands. Spec-only changes should not move any of them. |

---

## 6. No-test rationale

L4 is a SPEC-ONLY story. The acceptance criteria are: rewrite a concept-doc section, add a Rationale paragraph, add Money/TokenUsage shapes to canonical-shapes.md, update agent-layer docs. None of these introduce TypeScript types in `packages/*`, none introduce DB columns, none introduce HTTP routes or React components.

The verification of L4 is by inspection of the documents — the same way every other spec-only L-story is verified.

The story explicitly delegates type definitions to L17. L17 will:
- Add the `Money`, `CurrencyCode`, `ModelTier`, `TierTokenCount`, `TokenUsage` types to `packages/shared`.
- Add Vitest coverage for the formatter, the bigint arithmetic, the cross-currency rejection invariant, and the tier rollup.
- Add Playwright e2e for "open Bet detail → see cost in money + tokens, no string-money anywhere" (L17 AC).
- Add a type-level guard preventing string-typed money from being reintroduced (L17 AC).

Therefore L4 itself has no Vitest target, no Playwright target. The standard validation gate (`bun run check`, `bun run lint`, `bun run test`) is run at the end of L4 to confirm the doc-only edits did not break any pre-existing test, but no new tests are added in this story.

---

## 7. Out of scope (delegated to L17)

- Concrete TypeScript types in `packages/shared`.
- The harness cost-reporting contract (the "load-bearing technical work" per L17 AC).
- Money formatter (`formatMoney`) and helpers (`zeroMoney`, `addMoney`, `compareMoney`).
- DB column definitions for `Money` and `TokenUsage`.
- Replacement of string-money fixtures (L17 + L6 inventory).
- Backfill strategy for existing rows (L17).
- Type-level guard against re-introducing string money (L17).

---

## 8. Open questions

None. The architect resolves all four spec ambiguities in §1:
- Money representation: integer minor units + bigint (§1.1).
- Tier vocabulary: inherit `reasoning | workhorse | fast` from model-routing-and-cost.md (§1.3).
- Default currency: USD with scale carried explicitly (§1.1).
- Numerical defaults: none in source; configuration owns cap values (§1.1, §1.4).
