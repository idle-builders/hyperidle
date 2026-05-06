# L17 Concept: Cost + Tokens wired into Work (and the Harness Cost-Reporting Contract)

## Required reading for downstream agents

Downstream agents (`/design`, `/architecture`, `/write-tests`, `/write-code`) must read:

- `docs/process-layer/canonical-shapes.md` -- Money and TokenUsage shapes (locked by L4)
- `docs/process-layer/wip-and-cost-limits.md` -- appetite/budget/cost grammar, anti-pattern rule
- `docs/process-layer/the-five-primitives.md` -- Bet, Task, Session with cost_appetite, cost, tokens
- `docs/agent-layer/model-routing-and-cost.md` -- model tiers, cost posture, tier vocabulary
- `docs/agent-layer/harness-error-taxonomy.md` -- CostCapExceededError
- `packages/shared/src/harness/harness-adapter.ts` -- current SessionResult shape
- `packages/shared/src/harness/harness-events.ts` -- current TokenUsageEvent, CostUpdateEvent
- `packages/shared/src/types/artifact.ts` -- ArtifactCostFromSession (string-typed, to be replaced)
- `packages/shared/src/format/artifact-cost.ts` -- current formatMoney (local, micros-based)
- `packages/server/src/services/cost-cap.ts` -- current cost cap checking (integer cents)
- `packages/db/src/schema.ts` -- current DB columns (integer cents, no currency, no tier breakdown)
- `packages/web/src/shell/Rail.tsx` -- CostInfo (string-typed)
- `packages/web/src/types/bet.ts` -- BetDetail (appetite: string, task cost: string)
- `packages/shared/src/product.ts` -- ProductBurn, BetCardSummary (appetite: string, costActual: number)

---

## Phase 0 -- Identify the nouns

| Noun | Working definition | Classification |
|---|---|---|
| **Money** | Currency-aware, precision-safe integer minor-unit value | Stable -- locked by L4 in canonical-shapes.md |
| **TokenUsage** | Per-tier prompt/completion token counts | Stable -- locked by L4 in canonical-shapes.md |
| **ModelTier** | Coarse routing tier for models (reasoning/workhorse/fast) | Stable -- locked in model-routing-and-cost.md |
| **Appetite** | A bet's cost ceiling | Reshaped -- docs say Money cap, code says duration string |
| **Session Cost Report** | The structured cost data a harness reports when a session ends | New -- currently SessionResult.totalCost is a bare number |
| **Money Formatter** | The single function that renders Money for display | New -- currently there's a local formatMoney in artifact-cost.ts |

Only **Appetite** (reshaped), **Session Cost Report** (new), and **Money Formatter** (new) need concept work.

---

## Phase 1 -- Probe the essence

### 1. Session Cost Report (new)

**Identity.** A Session Cost Report is the structured payload a harness adapter returns when a session ends, reporting the cost incurred and the tokens consumed during that session. It is a value object -- a snapshot of cumulative spend, not a stream.

**Essential properties.** Every Session Cost Report must carry:
- `money: Money` -- the total money spent in this session, in the harness's billing currency. The harness is the authority on money; the meta layer records it, does not compute it.
- `tokenUsage: TokenUsage` -- prompt and completion tokens broken down by model tier. The harness knows which tiers were invoked.
- `outcome: SessionOutcome` -- what happened (completed, crashed, stopped). Already exists.

**What it is NOT:**
- It is NOT a stream of incremental cost updates. Those exist (CostUpdateEvent, TokenUsageEvent) and continue to exist for real-time display. The Session Cost Report is the final, authoritative, end-of-session total.
- It is NOT computed by the meta layer. The meta layer does not sum up streaming events to derive total cost -- it trusts the harness's reported total. Streaming events are for live display; the report is for the record.
- It is NOT a receipt or invoice. It carries no line items, no per-tool breakdown, no per-message cost. That granularity stays inside the harness.

**Authority.** The harness adapter is the sole authority on session cost. When a harness reports "$0.47 across 12k workhorse tokens and 800 reasoning tokens," the meta layer records exactly that. The meta layer's job is aggregation (task cost = sum of session costs; bet cost = sum of task costs), not derivation.

**Composition.** The Session Cost Report is returned by `HarnessAdapter.stopSession()` as part of `SessionResult`. It is also extractable from the final `CostUpdateEvent` in the event stream (for sessions that crash before stopSession returns). The report's Money value is written to `sessions.cost*` columns; the TokenUsage is written to new `sessions.tokens*` columns.

**Lifecycle.** The report is produced once (at session end) and is immutable. If the harness later corrects a cost (delayed billing reconciliation), that is a separate operation, not a mutation of the original report.

### 2. Appetite (reshaped)

**Identity.** Appetite is the founder's answer to "how much is this bet worth?" expressed as a Money cap. Optionally, a TokenUsage cap accompanies it. It is the budget ceiling, not a prediction of actual spend.

This is already locked in `docs/process-layer/the-five-primitives.md` (the `cost_appetite` field) and `docs/process-layer/wip-and-cost-limits.md` (section 10). The concept is settled; what L17 does is wire the code to match:

- **DB:** `bets.appetite text("1 week"/"2 weeks"/"6 weeks")` becomes `bets.costAppetite integer` (money in minor units) + `bets.costAppetiteCurrency text` + `bets.tokenAppetite text` (JSON-encoded TokenUsage, nullable).
- **API:** `appetite: "2 weeks"` in create/update requests becomes `costAppetite: { minor: number, currency: string }` + optional `tokenAppetite`.
- **UI:** The bet card's appetite KeyValue changes from "2 weeks" to "$500.00" (or whatever the cap is).

**What appetite is NOT:**
- It is NOT duration. The L4 spec explicitly rejects duration as a budget axis (wip-and-cost-limits.md section 10.7).
- It is NOT a running spend total. Appetite is the cap; `cost_actual` is the running total. Spend vs. cap is the comparison.
- It is NOT an estimate. It is a ceiling the founder sets that says "I'm willing to spend up to this much."

**Backward compatibility.** Existing bets with `appetite = "2 weeks"` need a migration path. Since "2 weeks" has no Money equivalent, the migration must set a sensible default: null (no cap set) or a configurable default Money value from factory settings. The concept position is: migrate to null -- a bet without a money cap is an uncapped bet (consistent with the model where caps are optional per section 10).

### 3. Money Formatter (new)

**Identity.** The Money Formatter is the single shared function that converts a Money value to a human-readable display string. It is the only path from Money to string in the entire frontend.

**Essential properties:**
- Input: a Money value (minor units + currency + scale).
- Output: a locale-appropriate display string (e.g., "$12.40", "12,40 EUR", "1,200 JPY").
- Must handle the edge case of Money being null (renders "--" or equivalent empty marker).

**What it is NOT:**
- It is NOT a parser. String-to-Money conversion is a separate concern (Zod validators at API boundaries).
- It is NOT locale-negotiating. V1 uses a fixed format per currency. Locale awareness is a follow-up if needed.
- It is NOT the same as the existing `formatMoney` in `artifact-cost.ts`. That function takes micros (number) and returns `$X.XX`. The new formatter takes a Money value (with currency awareness) and replaces it.

---

## Phase 2 -- Rejection list

### Session Cost Report is NOT:

1. **Not a billing event.** The cost report is not forwarded to any billing system. It is internal bookkeeping. External billing reconciliation is out of scope.
2. **Not a cost approval.** The meta layer does not approve or reject the reported cost. The harness spent what it spent. The cost cap system reacts to the cumulative spend, not to individual reports.
3. **Not sub-agent-aware at the transport level.** If a harness spawns sub-agents internally, the parent session's cost report includes the sub-agent cost. The meta layer sees one session with one cost. Sub-agent cost breakdown is a harness-internal concern.

### Appetite is NOT:

1. **Not duration.** Already established by L4. The rejection is explicit and cited in wip-and-cost-limits.md section 10.7.
2. **Not a prediction.** It is a ceiling. A bet that ships at 10% of appetite is not under-budgeted; it shipped cheaply.
3. **Not per-task.** Appetite lives on the bet. Tasks have their own `cost_cap`. The two are independent; task caps sum against the bet's appetite but the system does not enforce that sum(task caps) <= appetite (that would be premature constraint).

### Money Formatter is NOT:

1. **Not a currency converter.** Money values stay in their source currency through the entire pipeline. The formatter displays, it does not convert.
2. **Not a parser.** String-to-Money parsing belongs at API/form boundaries (Zod schema), not in the formatter.
3. **Not a rounding function.** The formatter formats for display. The precision-safe arithmetic happens in bigint minor units; the formatter is the last step.

---

## Phase 3 -- Lock the vocabulary

| Term | Definition | Aliases NOT to use |
|---|---|---|
| **Money** | Currency-aware integer minor-unit value per canonical-shapes.md | cost (too vague), amount, price, fee, spend (spend is derived from Money values), dollars |
| **TokenUsage** | Per-tier token count breakdown per canonical-shapes.md | tokens (too vague), token_count, usage |
| **Appetite** | A bet's Money cap (ceiling on spend) | budget, timebox, deadline, sprint size, t-shirt size, estimate |
| **Session Cost Report** | The Money + TokenUsage payload a harness returns at session end | billing, invoice, receipt, cost event, cost update |
| **formatMoney** | The single shared Money-to-display-string function | formatCost, formatDollars, formatCurrency, renderMoney, displayMoney |
| **ModelTier** | The coarse routing tier (reasoning/workhorse/fast) | model_class, tier_name, model_type |

---

## Phase 4 -- Contracts

### Session Cost Report contracts

- **Cardinality:** Exactly one report per session end. A session that crashes produces a report from the last known cost state (the meta layer constructs it from the last CostUpdateEvent if stopSession fails).
- **Closure:** The report's fields (Money + TokenUsage + outcome) are closed. Adding a new axis requires a concept-doc update.
- **Mutability:** Immutable once recorded. No post-hoc corrections to session cost (a future billing-reconciliation feature would be a separate entity).
- **Identity:** The report has no independent identity; it is a property of the Session row.
- **Hard rule:** The harness is the authority on money. The meta layer does not compute session cost from token counts and pricing tables -- it records what the harness reports. This keeps cost accuracy as a harness concern and prevents the meta layer from needing a model pricing database.

### Appetite contracts

- **Cardinality:** One Money appetite per bet. Zero or one TokenUsage appetite per bet.
- **Closure:** The appetite axes are closed: Money + optional TokenUsage. No duration axis (section 10.7).
- **Mutability:** Appetite is revisable (section 5.4 of bets doc). Each revision is logged in revision_log with timestamp and reasoning.
- **Identity:** Appetite is a property of the Bet, not a standalone entity.
- **Hard rule:** Duration strings ("1 week", "2 weeks", "6 weeks") are eliminated from the system. Any code path that constructs or validates duration-as-appetite is removed.

### Money Formatter contracts

- **Cardinality:** Exactly one formatter function in the entire codebase. All Money-to-string conversions go through it.
- **Closure:** The supported currencies are those in the CurrencyCode enum (USD, EUR, GBP, JPY). The formatter must handle all of them.
- **Hard rule:** No other code path may convert Money to a display string. The existing `formatMoney` in `format/artifact-cost.ts` is replaced, not supplemented.

### Money transport contract (bigint serialization)

- **Hard rule:** `bigint` cannot be serialized in JSON. At wire boundaries (API responses, harness results), Money.minor is transported as `number`. This is safe because: (a) SQLite stores integers as 64-bit signed, but practical cost values stay well within Number.MAX_SAFE_INTEGER (max safe = 9 quadrillion = $90 billion at cent precision), and (b) the canonical shapes doc specifies bigint for cross-session rollups that could overflow, but individual session costs and bet appetites will not. The Money type in `packages/shared` uses `bigint` for arithmetic helpers; the DB columns and wire format use `number`/`integer`.
- **Hard rule:** The DB uses integer columns for Money.minor (not text, not real). Currency is a separate text column. Scale is derivable from currency and is NOT stored separately in the DB (it is reconstructed by the shared helpers using the currency-to-scale mapping).

### Type guard contract (preventing string money regression)

- **Hard rule:** A branded type `MoneyMinor` (a number that has been validated as representing minor currency units) is introduced. An ESLint rule or Biome rule is NOT the primary guard -- the type system is. Any field that carries money must use the `Money` type or `MoneyMinor` branded type, never `string` or unbranded `number`. The Zod schemas at API boundaries validate and brand incoming values. Existing string-typed cost fields (`ArtifactCostFromSession.money: string`, `CostInfo.todaySpend: string`, `BetDetail.appetite: string`, `BetCardSummary.appetite: string`, task `cost: string`) are all replaced with structured Money types.

---

## Phase 5 -- Rationale

L4 established that the factory's budget grammar is Money + Tokens, never duration. L17 is the story where the code catches up with the concept. The gap is wide:

- The DB has integer cents with no currency. The spec says currency-aware Money.
- The harness reports a bare `totalCost: number`. The spec says structured Money + TokenUsage per tier.
- Appetite is "2 weeks" in the code. The spec says it is a Money cap.
- Cost display is scattered string formatting. The spec says one shared formatter.
- Token events carry `inputTokens/outputTokens` with no tier. The spec says per-tier breakdown.

The load-bearing technical work is the harness contract: defining what SessionResult carries (structured Money + TokenUsage), and wiring the end-to-end path from harness session completion through the server to the DB row. The UI changes follow mechanically once the data is structured.

The appetite transformation is conceptually simple (text duration becomes integer money) but operationally wide (every bet surface, every test, every fixture, the create/update API). The migration strategy is null-as-default: existing duration-string appetites become null Money appetites (uncapped bets), consistent with the model where caps are optional.

The type guard is the insurance policy: after this story ships, introducing a new string-typed money field should be caught by the type system before it reaches code review.

---

## Phase 6 -- Self-critique

**Is the rejection list distinct?** Yes. Session Cost Report's three rejections (not billing, not approval, not sub-agent-aware) cover genuinely different temptations. Appetite's three rejections (not duration, not prediction, not per-task) cover the three most common misconceptions about budget ceilings.

**Vocabulary collisions?** The term "cost" is used loosely throughout the codebase (integer cents, string dollars, number micros). L17 collapses this: "Money" is the structured type, "cost" describes the relationship (a session HAS a cost, which IS a Money value). No collision with the existing `cost` field names in the DB -- those field names stay, their types change.

**Contracts complete?** The transport contract (bigint to number at wire boundaries) is the most dangerous. It is safe for practical values but violates the canonical shapes doc's "bigint for precision" rule in letter. The resolution: the canonical type uses bigint for arithmetic; the DB and wire use number. This is documented as a deliberate pragmatic choice, not an oversight. If a single session ever costs more than $90 billion, we have bigger problems.

**Scale stored or derived?** Decided: NOT stored in DB. Scale is a function of currency (USD=2, JPY=0). Storing it would create a data integrity risk (mismatched currency/scale pairs). The shared helpers enforce the mapping.

**Appetite migration -- null or default?** Decided: null. Setting a default money amount for bets that previously had "2 weeks" would be arbitrary. Null means "no cap set" and is consistent with the existing model where caps are optional. The founder can set appetite on existing bets through the UI after migration.

**Does this concept doc touch the right files?** The concept positions are:
- `docs/process-layer/canonical-shapes.md` -- already updated by L4. No concept change needed.
- `docs/process-layer/the-five-primitives.md` -- already updated by L4. No concept change needed.
- `docs/process-layer/wip-and-cost-limits.md` -- already says Money + TokenUsage. No concept change needed.
- The harness contract is new but lives at the code level (SessionResult type), not in a concept doc. The architecture plan will specify the exact type change.

All concept grounding is already in place from L4. L17 adds no new concept docs to `docs/` -- it implements what L4 specified. The harness cost-reporting contract is a code-level contract, not a concept-level one, and will be specified in the architecture plan.
