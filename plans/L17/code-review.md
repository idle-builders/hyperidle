# L17 Code Review: Cost + Tokens wired into Work

**Verdict: NOT DONE**

39 files changed. Shared types, formatters, harness contracts, DB migration, bets route, cost-cap service, web components, and tests all updated. However, several plan tasks were partially or entirely skipped, leaving 5 ACs unmet and multiple runtime-observable bugs in the products route.

---

## AC Completeness Audit

| # | Criterion | Status | Evidence |
|---|---|---|---|
| AC1 | Money type with bigint, currency, helpers | PASS | `types/money.ts` — all helpers present and tested |
| AC2 | WireMoney type for JSON transport | PASS | Type-check test confirms assignability |
| AC3 | TokenUsage with per-tier breakdown | PASS | Type + unit tests |
| AC4 | formatMoney null/USD | PASS | Unit tests green |
| AC5 | formatTokenCount 42.3k/null | PASS | Unit tests green |
| AC6 | Migration 0010 adds columns | PASS | SQLite + PG migrations present |
| AC7 | Backfill sessions.cost to cost_minor | PARTIAL | Migration does not backfill — no `UPDATE sessions SET cost_minor = cost` statement in the actual 0010 file. The plan specified this; the migration only adds columns and recreates the bets table. |
| AC8 | Bet appetite strings migrated to null costAppetite | PASS | Migration keeps appetite column as nullable, costAppetite columns are new/null |
| AC9 | SessionResult structured cost + tokenUsage | PASS | Mock adapter returns correct shape; type tests pass |
| AC10 | TokenUsageEvent optional tier | PASS | Type + test |
| AC11 | CostUpdateEvent optional currency | PASS | Type + test |
| AC12 | ClaudeAgentSdkAdapter structured SessionResult | NOT VERIFIED | No diff to claude-agent-sdk-adapter.ts. Plan Task 3 required updating this file. |
| AC13 | Cost-cap uses new columns, validates currency | PASS | cost-cap.ts updated with costCapMinor fallback, costMinor writes |
| AC14 | Session provisioning accumulates tokens by tier | FAIL | session-provisioning.ts has zero changes. Still uses `totalCostCents += Math.round(delta * 100)` at line 325. No token accumulation code exists. |
| AC15 | Bet create accepts costAppetite, rejects duration strings | PASS | Zod schema + .strict() rejects old appetite field |
| AC16 | Bet detail returns structured cost fields | PASS | GET /bets/:id builds WireMoney objects from DB columns |
| AC17 | Product list/detail returns WireMoney burn | FAIL | products.ts unchanged — line 239-240 returns `costActual: teamRow.costActual ?? 0` (number), not WireMoney. Line 198 returns `appetite: bet.appetite` (string), not `costAppetite: WireMoney`. |
| AC18 | Rail API returns structured CostBurnRate | NOT VERIFIED | rail.ts has zero changes. The plan (section 4.6) specified a new CostBurnRate shape. |
| AC19 | ArtifactCostFromSession uses WireMoney + TokenUsage | PASS | Type changed, tests confirm |
| AC20 | ArtifactCostChip renders via formatMoney | PASS | Component updated, tests green |
| AC21 | BetCard shows formatted Money appetite | PASS | WorkBet.tsx calls `formatMoney(bet.costAppetite)` |
| AC22 | Bet detail shows spend-vs-cap in Money + Tokens | PASS | New cost section with KeyValue rows |
| AC23 | Rail cost section shows formatted Money | PASS | Rail.tsx updated with formatMoney calls |
| AC24 | WorkProduct burn shows formatted Money | PASS (web) | WorkProduct.tsx uses formatMoney. However, the server (AC17) still sends numbers, not WireMoney. This means the real data path is broken — only mock data works. |
| AC25 | No string-typed money fields in shared/web types | FAIL | `MUTABLE_BET_FIELDS` still contains `"appetite"` (types.ts:32). Plan Task 7 specified changing it to `"cost_appetite"`. `BetCardSummary` type says `costAppetite: WireMoney | null` but products.ts still assigns `appetite: bet.appetite`. |
| AC26 | MUTABLE_BET_FIELDS updated | FAIL | types.ts:32 still reads `["done_condition", "hypothesis", "appetite"]` |
| AC27 | check + lint + test all green | PASS | Reported as passing (typecheck is green because Hono's c.json accepts any) |
| AC28 | Playwright e2e suite green | PASS | 11/11 reported green (hermetic route mocks, so AC17 server bug is invisible) |

**Score: 22/28 PASS, 3 FAIL, 3 NOT VERIFIED**

---

## Findings by Lens

### Architecture Lens (Positive)

**F-A1 [CRITICAL] Session provisioning not updated (AC14).** `packages/server/src/services/session-provisioning.ts` has zero diff. The plan (section 4.2) specified replacing `totalCostCents += Math.round(delta * 100)` with structured currency-aware conversion and adding token accumulation by tier in the event drain loop. The file still uses the hardcoded `* 100` conversion (line 325) and does not accumulate `tokensJson`. This means sessions completed after L17 will NOT have their token usage recorded, and cost conversion ignores currency entirely. This is the core plumbing of the workpackage and it is missing.

**F-A2 [CRITICAL] Products route not updated (AC17).** `packages/server/src/routes/products.ts` has zero diff. The route still:
- Returns `appetite: bet.appetite` (string | null) on `BetCardSummary` (line 198) instead of `costAppetite: WireMoney | null`
- Returns `costActual: teamRow.costActual ?? 0` (number) in the burn object (line 239) instead of `WireMoney | null`
- Returns `costCap: teamRow.costCap ?? null` (number | null) in the burn object (line 240) instead of `WireMoney | null`

The web frontend (`WorkProduct.tsx`) was updated to expect `burn.costCap.minor` (line 135). With the server returning a raw number, `burn.costCap.minor` is `undefined`, making `capPercent` always 0.

**F-A3 [CRITICAL] Rail route not updated (AC18).** `packages/server/src/routes/rail.ts` has zero diff. The plan (section 4.6) specified a complete replacement of the `CostBurnRate` shape from flat strings to `WireMoney` fields. The Rail.tsx component was updated to consume `WireMoney`, but the server route still sends the old shape. In production, this would render "--" for all cost values since the WireMoney fields would be undefined.

**F-A4 [CRITICAL] ClaudeAgentSdkAdapter not updated (AC12).** `packages/server/src/harness/claude-agent-sdk-adapter.ts` has zero diff. The plan (section 2) specified updating `translateMessage` to add tier/currency fields and `stopSession` to return structured `SessionResult`. Only the mock adapter was updated.

**F-A5 [WARNING] MUTABLE_BET_FIELDS not updated (AC26).** `packages/shared/src/types.ts:32` still contains `"appetite"` in the `MUTABLE_BET_FIELDS` array. The plan (Task 7) specified replacing it with `"cost_appetite"`. The PATCH /bets/:id endpoint uses this enum for field validation, meaning the old `appetite` field can still be patched via the update endpoint even though the create endpoint rejects it.

**F-A6 [WARNING] Session lifecycle not updated.** `packages/server/src/services/session-lifecycle.ts` has zero diff. The plan (section 4.3) specified that `endSession()` and `crashSession()` write `costMinor` + `costCurrency` + `tokensJson` to the session row. Without this change, session end events do not persist the structured cost data.

**F-A7 [WARNING] Migration lacks backfill statements.** The actual migration file (`0010_cost_tokens_l17.sql`) only adds columns and recreates the bets table. The plan specified `UPDATE sessions SET cost_minor = cost WHERE cost IS NOT NULL AND cost > 0` and similar backfills for tasks and agents. These are missing, so existing data will have `costMinor = NULL` after migration. The cost-cap service uses `coalesce(costMinor, cost, 0)` which provides a fallback, but this is a fragile implicit contract rather than the clean backfill the plan specified.

### Design Lens (Positive)

**F-D1 [OK] WorkBet cost section.** The new cost section uses semantic tokens (`--r1`, `--surface-2`, `--density-card-pad`, `--text-lo`), KeyValue primitive, and `formatMoney`/`formatTokenCount`. No off-grid spacing. No hardcoded colors. The section heading uses `text-xs font-heading font-semibold uppercase tracking-wider` which is consistent with existing section headers.

**F-D2 [OK] Rail token row.** Conditionally rendered via `cost.weekTokens != null`, using `formatTokenCount`. Progressive disclosure implemented correctly.

**F-D3 [OK] ArtifactCostChip.** Correctly uses em dash for null money (matching existing convention) and calls shared formatters internally.

**F-D4 [NOTE] Design critique W1/W2 (density gap).** The bet cost section uses `gap-1` (4px) which is a valid 4px-grid value. The section uses `--density-card-pad` for padding. W1 was about the per-tier breakdown which is not present in this implementation (tokens are shown as a single total, not per-tier). This is an acceptable simplification.

### Security Lens (Positive)

**F-S1 [OK] Zod validation on costAppetite.** The `wiremoneySchema` validates `minor` as `z.number().int().min(0)` and `currency` as `z.enum(CURRENCY_CODES)`. The `.strict()` on `createBetSchema` rejects unknown fields including the old `appetite` string.

**F-S2 [OK] Integer overflow protection.** Minor units are JS `number` for wire/DB (max ~9 quadrillion cents = ~$90 trillion) and `bigint` for arithmetic. Adequate for practical cost values.

**F-S3 [OK] No new credential surfaces.** No secrets exposed.

**F-S4 [NOTE] Currency mismatch not enforced at API boundary.** The `recordCostAndCheck` function does not validate that the incoming currency matches the agent's cap currency. The plan (section 9) stated "factory is single-currency in v1" but does not enforce this. Since the cost-cap comparison uses raw integers without currency awareness, comparing USD cents against JPY yen at the minor-unit level would give wrong results. This is acceptable for v1 (single-currency factory) but should have a `@lore` comment.

### Adversarial Lens (Negative)

**F-V1 [CRITICAL] Test uses `undefined as never` to skip where clause.** `L17-money-wire.test.ts:171` has:
```typescript
const session = db.select().from(sessions)
  .where(/* eq(sessions.id, "s1") */ undefined as never)
  .get();
expect(session).toBeDefined();
```
This bypasses the where clause entirely (selecting any row), then asserts only `toBeDefined()`. This test proves nothing about whether `costMinor` was written correctly. The `as never` cast is a type-safety escape hatch that violates the TypeScript rules ("No `any`, no `@ts-ignore`, no unsafe `as` casts"). The commented-out `eq()` call suggests the builder hit a type error and worked around it rather than fixing it.

**F-V2 [WARNING] Products route type mismatch invisible to typecheck.** `products.ts:198` assigns `appetite: bet.appetite` (string | null) to a position that should be `costAppetite: WireMoney | null`. This compiles because Hono's `c.json()` accepts any JSON-serializable value without checking against the declared TypeScript interface. The `BetCardSummary` type changed in `product.ts` but the route code was never updated. This would cause a runtime crash in `WorkProduct.tsx:135` where `burn.costCap.minor` is accessed on a number value.

**F-V3 [WARNING] Bet cost section shows no spend-vs-cap ratio.** The approved design specified a "SPEND vs CAP" section with `$214.30 / $500.00` format. The implementation shows `Spend` and `Cost` as separate KeyValue rows, not as a slash-separated ratio. This is a minor design divergence but noticeable.

**F-V4 [NOTE] formatMoney has two unnecessary `as` casts.** Line 17: `(value.minor as number)` — the else branch already guarantees `typeof value.minor !== "bigint"`, so it must be `number`. The cast is redundant but harmless. Line 18: `value.currency as CurrencyCode` — the input type is `WireMoney | Money`, both of which already have `currency: CurrencyCode`. This cast is entirely unnecessary.

### Simplification Lens (Negative)

**F-P1 [WARNING] Dead code in bets route GET handler.** Lines 130-133 of `bets.ts`:
```typescript
if (taskIds.length > 0 && bet.costActualMinor == null) {
  // Fall back to summing sessions if the rollup column isn't populated yet
}
```
This is an empty if-block with a comment describing functionality that was never implemented. It should either be removed (dead code) or implemented (if the fallback is actually needed).

**F-P2 [NOTE] `resetCosts` gained a string overload without plan justification.** The function signature changed from `(db, params: ResetCostsParams)` to `(db, params: ResetCostsParams | string)` where the string form is equivalent to `{ level: "team", id: teamId }`. This overload was not in the plan and adds complexity. It works but is a convenience that was not specified.

**F-P3 [NOTE] `MoneyModelTier` re-export.** `packages/shared/src/index.ts` exports `ModelTier as MoneyModelTier` from `types/money.ts`. `ModelTier` is already exported from `types.ts`. This creates a second export path for the same type under a different name. Consumers might import either, creating confusion. The plan said "do not duplicate" but the implementation re-exports under a new name.

### Slop Lens (Negative)

**F-L1 [NOTE] Redundant null check in formatTokenCount.** Line 290 of `money.test.ts`: `it("returns '--' for null (edge case recheck)")` — this is an exact duplicate of the test on line 266. Not harmful but unnecessary.

**F-L2 [NOTE] Comment says "$3.00" but value is 300 cents.** `mock-harness-adapter.ts:45`: `// $3.00 in cents` — 300 minor units in USD = $3.00, correct. However, the pre-L17 value was `0.003` (dollars), and the mock now returns a substantially different value ($3.00 vs $0.003). This may break any test that depends on the mock's cost magnitude. Worth verifying that no downstream test depends on the old 0.003 value.

---

## Phase 2 Critique Findings Resolution

| Finding | Status | Notes |
|---|---|---|
| C1 (Money.scale divergence) | RESOLVED | Builder chose option (b): scale is derived via `scaleForCurrency()`, not stored on the type. The canonical shapes doc already states "L17 helpers enforce a single-currency invariant." Consistent approach. |
| W1 (bets.cost_actual_minor sync) | PARTIALLY ADDRESSED | Column exists in migration but the bets route has a dead code block (F-P1) where the fallback was supposed to go. No sync mechanism implemented. |
| W2 (MoneyMinor branded type) | NOT ADDRESSED | No branded type. No documentation of why it was dropped. Acceptable for v1 but the concept doc was not updated. |
| W3 (hardcoded ternary in session-provisioning) | NOT ADDRESSED | session-provisioning.ts was not changed at all (F-A1). |
| W4 (TierTokenCount bigint) | NOT ADDRESSED | Kept as `number`. No overflow documentation. Acceptable — MAX_SAFE_INTEGER = 9 quadrillion tokens. |
| W5 (artifacts backfill assumes workhorse) | NOT APPLICABLE | The migration file does not contain artifact backfill statements. The plan's migration was not implemented as specified. |

---

## Summary of Required Fixes

### Must Fix (blockers)

1. **Update session-provisioning.ts** (F-A1, AC14) — add token accumulation by tier and currency-aware cost conversion in the event drain loop.
2. **Update products.ts** (F-A2, AC17) — return `costAppetite: WireMoney | null` instead of `appetite: string`, and `WireMoney | null` for burn cost fields.
3. **Update rail.ts** (F-A3, AC18) — implement the new `CostBurnRate` shape with `WireMoney` fields.
4. **Update claude-agent-sdk-adapter.ts** (F-A4, AC12) — return structured `SessionResult`.
5. **Update MUTABLE_BET_FIELDS** (F-A5, AC26) — replace `"appetite"` with `"cost_appetite"`.
6. **Fix test** (F-V1) — remove `undefined as never` cast, properly query by session ID, assert `costMinor === 500`.

### Should Fix

7. **Update session-lifecycle.ts** (F-A6) — write costMinor + costCurrency + tokensJson on session end/crash.
8. **Add migration backfills** (F-A7) — sessions, tasks, agents cost backfill statements.
9. **Remove dead code** (F-P1) — empty if-block in bets route.
10. **Remove duplicate ModelTier export** (F-P3) — `MoneyModelTier` alias adds confusion.
