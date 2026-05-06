# Architecture Critique: L17

ARCHITECTURE-SCORE: 8/10  rounds=1  score-line: SA:7 LI:9 AC:8 DM:7 N:9 MD:9 FMC:8 S:8 V:9

---

## Dimension Scores

### 1. Spec Alignment (7/10)

**Good:** Every AC maps to at least one task. The 28 ACs are thoroughly enumerated in section 11 with concrete verification methods. The task ordering reflects real dependency chains.

**Problems:**

- The canonical shapes doc (`docs/process-layer/canonical-shapes.md`) defines `Money = { minor: bigint, currency: CurrencyCode, scale: number }` with three fields. The plan's `Money` interface omits `scale`. The concept doc justifies this ("scale is derivable from currency"), but the canonical shapes doc explicitly states "The field is carried explicitly so callers and DB rows are self-describing without a per-currency lookup, but its value is constrained, not chosen." The plan deviates from the canonical spec without updating the spec. Either the Money type must include `scale` or the canonical shapes doc must be updated to match the plan's decision. This is a contract divergence.

- The concept doc (Phase 4, "Type guard contract") specifies a `MoneyMinor` branded type: "Any field that carries money must use the `Money` type or `MoneyMinor` branded type." The architecture plan does not implement `MoneyMinor` at all. Section 6 says "the type guard is structural, not an ESLint rule" and lists the guard as just "there are zero string-typed money fields left." This is weaker than what the concept doc specified. Either implement the branded type or update the concept doc to retract it.

- The canonical shapes doc says `TierTokenCount` fields are `bigint`. The plan defines a single `TierTokenCount` with `number` fields. Unlike Money (where the plan has both `Money` with `bigint` and `WireMoney` with `number`), there is no canonical-bigint version of `TierTokenCount`. The canonical shapes doc explicitly warns about cross-session rollup overflow. Either add a canonical-bigint `TierTokenCount` (parallel to the Money/WireMoney split) or document why token counts will never overflow `Number.MAX_SAFE_INTEGER`.

### 2. Layer Integrity (9/10)

Clean layer separation. All changes respect Human Interface -> Meta Layer -> Agent Runtime boundaries. The harness adapter changes are in `packages/shared` (the boundary contract), not in `packages/server`. The DB changes are in `packages/db`. The web changes never reach into server internals.

One minor note: the plan puts `ProductBurn` and `BetCardSummary` type changes in `packages/shared/src/product.ts` (section 5.6). These are wire types that cross the layer boundary, which is their correct location.

No layer violations found.

### 3. API Contracts (8/10)

**Good:** Section 4.4 specifies the full bet create schema with Zod validators. Section 4.5 specifies the ProductBurn and BetCardSummary wire changes. Section 4.6 specifies the CostBurnRate response shape. The GET /bets/:id response shape is shown as a full JSON example (section 4.4).

**Problems:**

- The plan does not specify error responses for the new bet creation schema. What happens when `costAppetite.currency` is not in `CURRENCY_CODES`? Zod handles it (400), but the plan should state this explicitly since the error shape changed (from "invalid appetite enum value" to "invalid currency code"). The test for AC15 covers this ("POST with '2 weeks' returns 400") but not all failure modes.

- The rail route's `CostBurnRate` (section 4.6) diverges from the existing `CostBurnRate` shape in the codebase. The existing shape is `{ cap: number, actual: number, percentage: number }` (see `rail.ts:20-24`). The plan proposes `{ todaySpend: WireMoney | null, todayCap: WireMoney | null, weekSpend: WireMoney | null, weekCap: WireMoney | null, weekTokens: number | null }`. This is a complete shape replacement, not an incremental change. The plan should explicitly note that the existing `RailResponse.costBurnRate` shape is replaced, and list any consumers that depend on the existing shape. The reconciliation table (section at the top) does not mention the Rail response shape.

### 4. Data Model Alignment (7/10)

**Good:** The migration SQL is detailed with backfill statements, column renames (not drops -- respecting SQLite limitations), and rollback safety via `_legacy` suffix. The design-it-twice on JSON vs per-tier columns is substantive, not theatre.

**Problems:**

- The migration is named `0010_cost_tokens_l17.sql`, which is correct (next after `0009_add_artifacts_l3.sql`).

- The bets table migration adds `cost_actual_minor` and `cost_actual_currency` columns. But the bets table currently has no `cost_actual` column -- only `appetite` (text). The plan's reconciliation table says nothing about bet-level cost tracking. This appears to be new functionality (aggregate bet spend) that is not in any AC. AC16 mentions `costActual` in the GET response, but this could be computed (sum of task costs) rather than stored. The plan needs to clarify: is `bets.cost_actual_minor` a materialized aggregate or a computed-on-read value? If materialized, what keeps it in sync? There is no trigger or service that updates it when session costs change.

- The migration backfills `artifacts.cost_minor = ROUND(cost_money_micros / 10000.0)`. This rounds micros to cents. The precision loss claim ("at most 0.005 cents") is stated in the risks table, but the rounding direction is not specified. `ROUND()` uses banker's rounding in some SQLite builds, which could cause inconsistencies. Consider `CAST(cost_money_micros / 10000 AS INTEGER)` for deterministic truncation, or document that the rounding mode is acceptable.

- The `artifacts.cost_tokens_json` backfill builds a JSON object assuming all existing tokens are `workhorse` tier. This is an assumption (stated nowhere in the plan). If any existing artifacts were produced by reasoning-tier sessions, their token attribution is wrong. The plan should document this assumption explicitly.

- The plan says "`costActual` on agents is computed (sum of sessions), not stored" but the current schema has `costActual` as a stored column (`agents.costActual`). The plan renames it to `cost_actual_legacy` but does not add a replacement. Yet `resetCosts()` in `cost-cap.ts` currently writes to `agents.costActual`. After migration, `resetCosts()` would need to be updated to stop writing to a column that no longer exists (only `cost_actual_legacy` remains). The plan lists this in Task 3 but does not specify what replaces the agent costActual column for reset logic.

### 5. Naming (9/10)

Excellent naming throughout. `WireMoney` is a clear name for the JSON-safe subset. `costMinor` and `costCurrency` are honest column names. `formatMoney` and `formatTokenCount` are obvious. The vocabulary alignment with the concept doc is consistent ("Cap" not "Budget", "Appetite" as Money cap).

The `_legacy` suffix for renamed columns is a clear signal.

One minor note: the plan uses `tokensJson` as both a schema column name and a variable name in the provisioning code. This is fine but slightly ambiguous -- `tokensJson` could mean "the JSON string" or "the parsed TokenUsage." The plan should specify whether the schema column getter returns a raw string or a parsed object.

### 6. Module Depth (9/10)

The public surface is narrow. Two new files (`types/money.ts` and `format/money.ts`) with a focused export list. The helpers (`addMoney`, `compareMoney`, `moneyFromWire`, `moneyToWire`) are genuine operations on the Money type, not single-use wrappers.

`formatMoney` accepting both `Money | WireMoney | null` is a good design decision -- one function serves both the canonical and wire types, avoiding a parallel `formatWireMoney`.

The `scaleForCurrency` helper is justified by the concept doc's position that scale is derived, not stored.

### 7. Failure-Mode Coverage (8/10)

**Good:** Section 9 covers STRIDE categories, integer overflow, and currency mismatch. The harness trust boundary is correctly identified as "trusted" (the harness runs inside the meta layer). Rate-limiting is already in place.

**Problems:**

- The plan does not specify what happens when `addMoney` throws on mismatched currencies at runtime. The cost-cap service calls `addMoney` (or does it? -- actually the plan says it "validates same-currency before comparison" but does not show how). If the factory is single-currency in v1, this is a dead code path -- but the plan should state this explicitly rather than leaving it as an implicit assumption.

- The plan does not address what happens when a session's `CostUpdateEvent` has `currency: 'EUR'` but the agent's cap is in USD. The cost-cap service compares `sessions.costMinor` against `agents.costCapMinor`, but after L17, these could theoretically be in different currencies. The plan says "factory is single-currency in v1" but does not enforce this at the validation boundary (e.g., rejecting a CostUpdateEvent with a non-USD currency).

- The `totalCostMinor += Math.round(delta * (currency === 'JPY' ? 1 : 100))` in session-provisioning (section 4.2) is a currency-aware conversion, but it only handles JPY vs everything-else. What about future currencies with different scales? This should use the `scaleForCurrency` helper from the shared types, not a hardcoded ternary.

### 8. Simplicity / Over-Engineering Risk (8/10)

**Good:** Design-it-twice sections are substantive on both decisions (WireMoney wire format, TokenUsage storage format). The rejected options have real trade-offs, not straw-man alternatives.

The decision to use JSON columns for TokenUsage is pragmatically correct for v1.

No premature abstractions detected. No unnecessary plugin points or registries.

**Concern:**

- The plan exports 16+ new symbols from `packages/shared/src/index.ts` (section 1). This is a lot for one workpackage. However, each export is either a type (zero runtime cost) or a genuine utility function, so this is acceptable.

- The concept doc mentions a `MoneyMinor` branded type, but the plan drops it without explanation. If the branded type is genuinely not needed (structural typing is sufficient), the concept doc should be updated to reflect this simpler approach. As-is, the discrepancy creates confusion for the builder.

### 9. Verifiability (9/10)

**Strong.** All 28 ACs have concrete verification methods. The verification methods are realistic (unit tests for formatters, integration tests for routes, Playwright e2e for rendered output). The protected-tests list (section 10) correctly identifies the 8 test files whose contracts must be verified during update.

AC25 ("No string-typed money fields remain") has a grep-based verification method, which is a good pragmatic approach for a type-guard AC.

AC7 and AC8 have SQL query verifications for migration correctness. These are testable.

The test ordering in the task list is correct: tests are listed in each task alongside the implementation, not after.

---

## CRITICAL

- **C1** [plan section 1, concept Phase 4 vs canonical-shapes.md] The `Money` type omits the `scale` field that the canonical shapes doc specifies. The canonical doc says "The field is carried explicitly so callers and DB rows are self-describing without a per-currency lookup." The concept doc says "NOT stored separately in the DB (it is reconstructed by the shared helpers)." These are contradictory positions. **Fix:** Either (a) add `scale: number` to the `Money` type and derive it from currency in constructors (making it always-present but never free -- matching the canonical doc's intent), or (b) update `docs/process-layer/canonical-shapes.md` to remove `scale` from the type definition and state it is derived. Option (b) is simpler and consistent with the concept doc's reasoning. The plan must explicitly resolve this before the builder starts, because it affects the type signature of every Money-touching function.

## WARNING

- **W1** [plan section 3, migration SQL] The `bets.cost_actual_minor` column is added but there is no mechanism to keep it in sync. No AC requires bet-level cost aggregation as a stored column. If this is a materialized aggregate, the plan must specify when it is updated (on session end? on task cost change?). If it is computed-on-read, remove the column from the migration and compute it in the API route from `SUM(tasks.cost_actual_minor)` or `SUM(sessions.cost_minor)`. **Fix:** Clarify the sync mechanism or remove the column.

- **W2** [plan section 1 vs concept Phase 4] The concept doc specifies a `MoneyMinor` branded type as a type-level guard against unbranded numbers. The plan drops this silently. Section 6 says "the type guard is structural" (zero string-typed fields), but the concept doc says "Any field that carries money must use the `Money` type or `MoneyMinor` branded type, never `string` or unbranded `number`." A branded type would catch `recordCostAndCheck({ sessionId, cost: someRandomNumber })` at compile time. **Fix:** Either implement the branded type (a 3-line declaration + constructor function) or explicitly document in the plan why it was dropped and update the concept doc.

- **W3** [plan section 4.2] The currency-scale conversion in session-provisioning uses a hardcoded ternary (`currency === 'JPY' ? 1 : 100`) instead of the shared `scaleForCurrency` helper. This duplicates knowledge about the currency-scale mapping and will break if a future currency with a non-standard scale is added. **Fix:** Use `Math.pow(10, scaleForCurrency(currency))` or equivalent from the shared helpers.

- **W4** [plan section 1] The canonical shapes doc specifies `TierTokenCount.prompt` and `TierTokenCount.completion` as `bigint`. The plan defines them as `number` with no canonical-bigint counterpart. Unlike Money (which has both `Money` with bigint and `WireMoney` with number), there is no bigint-based `TierTokenCount` for arithmetic. If cross-session token rollups are computed in the application layer, they could theoretically overflow `Number.MAX_SAFE_INTEGER` for a high-volume factory. **Fix:** Either add a canonical-bigint `TierTokenCount` (parallel to Money/WireMoney split) or document why token overflow is not a practical concern (e.g., "MAX_SAFE_INTEGER = 9 quadrillion tokens; at 1M tokens/session, this is 9 billion sessions").

- **W5** [plan section 3, migration SQL] The artifacts token backfill assumes all existing tokens are `workhorse` tier. This assumption is not documented. If any existing artifacts were produced by reasoning-tier sessions, their tier attribution is silently wrong. **Fix:** Add a comment in the migration SQL and a note in the risks table documenting this assumption.

## SUGGESTION

- **S1** [plan section 4.6] The plan proposes replacing the `CostBurnRate` shape in the rail route but does not mention the existing shape (`{ cap, actual, percentage }`) in the reconciliation table. Add a reconciliation row for the rail response shape change. This helps the builder understand the full scope of the replacement.

- **S2** [plan section 3, schema update] The plan says `tokensJson` is a text column storing JSON. When the schema getter returns this column, Drizzle returns a raw string. The plan should specify whether the server code parses the JSON at the query site or in a shared helper, to prevent inconsistent parsing patterns across routes.

- **S3** [plan section 7, Task 7] The final cleanup task includes a grep verification (`grep -rn "money.*string|cost.*string|appetite.*string"`). This regex will produce false positives on comments, JSDoc, and the concept doc itself. Consider a more targeted grep that excludes `*.md`, `*.test.*`, and `_legacy` patterns.

- **S4** [plan section 4.3] The plan says `SessionEndedEvent.costDelta` stays as `number` (minor units). But the existing `SessionEndedEvent` carries `costDelta` as cents. After L17, this is minor units which could be cents (USD) or yen (JPY). The event should carry currency information alongside the cost delta, or the plan should document that `costDelta` is always in the same currency as the session's `costCurrency`.

## What's Working Well

- **The reconciliation table is thorough.** 13 rows mapping spec assumptions to codebase reality with explicit resolutions. This is the single most useful artifact for the builder -- it eliminates the "what does the code actually look like?" guessing game.

- **Design-it-twice on substantive decisions.** Both the WireMoney wire format and the TokenUsage storage format decisions have real trade-offs, not straw-man alternatives. The rejection reasons are honest.

---

## Verdict

**PASS.** Score 8/10. The plan is well-structured, thorough, and buildable. The critical finding (C1: Money.scale divergence from canonical shapes) must be resolved before implementation -- it is a 5-minute decision that affects every Money-touching function signature. The warnings are real but addressable during implementation without plan revision. The plan can advance to `/write-tests`.
