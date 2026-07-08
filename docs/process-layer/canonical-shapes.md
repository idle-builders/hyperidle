# Canonical Shapes — Process Primitives

Cross-primitive conventions and closed vocabularies for the process layer. The shapes themselves live in code — `packages/db/src/schema.ts`, `packages/shared/src/types/money.ts`, `packages/shared/src/types.ts` — and each primitive's semantics live in its own deep doc. This doc never carries Block shapes (see [../blocks/canonical-shapes.md](../blocks/canonical-shapes.md)) or knowledge shapes (schema.ts owns them).

## RevisionLogEntry (bets)

```
{ timestamp: string, field: string, old_value: unknown, new_value: unknown, reason: string, actor: string }
```

Appended as a JSON array in the `bets.revision_log` text column (`packages/server/src/routes/bets.ts:214`).

## Money and TokenUsage — as shipped

Cap grammar, hierarchy, and the money-not-duration doctrine are owned by [wip-and-cost-limits.md](wip-and-cost-limits.md). ModelTier vocabulary is owned by [../agent-layer/model-routing-and-cost.md](../agent-layer/model-routing-and-cost.md). Shipped conventions (`packages/shared/src/types/money.ts`):

- **`Money = { minor: bigint, currency: CurrencyCode }`** — no scale field. Scale is derived per currency via `CURRENCY_SCALE` (USD/EUR/GBP = 2, JPY = 0; `scaleForCurrency()`), never stored on the type. `CURRENCY_CODES` is a closed enum: `USD | EUR | GBP | JPY`.
- **`WireMoney` (`minor: number`)** is the JSON transport form — JSON has no bigint. DB stores integer minor units plus a currency text column.
- **Single-currency invariant.** `addMoney` / `compareMoney` throw on currency mismatch. No currency conversion exists anywhere; a Money value stays in its source currency until rendered.
- **Default currency `USD`** — applies only to new-row construction; the currency is always carried with the value at read time.
- **Token counts are `number`, not bigint.** `TierTokenCount = { prompt, completion, cachedPrompt? }`; `cachedPrompt` is present only when the harness reports cache hits separately, never synthesised.
- **`TokenUsage.byTier` is sparse** — `Partial<Record<ModelTier, TierTokenCount>>`; only tiers actually used appear. Totals are always derived (`totalTokens`, `addTokenUsage`), never stored, so `byTier` and totals cannot drift.
- **No numerical cap defaults in source.** Cap values live in DB columns and Settings — `costCapMinor`/`costCapCurrency` on bets and tasks (`schema.ts:56,113`), per-run and monthly agent caps (`schema.ts:358-360`).

## ModelTier — unknown-tier handling

`ModelTier = 'reasoning' | 'workhorse' | 'fast'` — closed vocabulary, defined in [../agent-layer/model-routing-and-cost.md](../agent-layer/model-routing-and-cost.md); runtime tuple `MODEL_TIERS` (`packages/shared/src/types.ts:116`). A session's reported token spend lines up with the routing decision that produced it.

**Contract: coerce-and-flag.** When a harness reports tokens against a tier name outside the closed enum, the adapter must bucket the spend into the closest known tier (provider-specific mapping owned by the adapter) and emit a `ModelTierUnknownWarning` event so the deployer can update the mapping. It must not silently drop the tokens and must not widen the closed enum at runtime.

**Gap:** shipped normalization silently drops unknown tiers instead — `isModelTier(n.tier) ? { tier: n.tier } : {}` (`packages/shared/src/harness/harness-event-normalization.ts:378`); `ModelTierUnknownWarning` is unimplemented. The contract above is the spec to build toward.

## Outcome verdicts (AC1)

Enums shipped in `packages/shared/src/types.ts` (`BET_OUTCOME_VERDICTS`:207, `TASK_OUTCOME_VERDICTS`:228). The semantics below are the canonical meanings; code carries only labels.

### BetOutcomeVerdict

```
'validated' | 'refuted' | 'partial' | 'inconclusive'
```

- `validated` — the hypothesis held; measured results confirm the prediction.
- `refuted` — the hypothesis did not hold; evidence contradicts the prediction.
- `partial` — some segments or dimensions validated; others did not.
- `inconclusive` — insufficient data or runtime to reach a verdict.

Null means not yet evaluated. Evaluation is only meaningful for `completed` or `killed` bets.

### TaskOutcomeVerdict

```
'met' | 'met_with_rework' | 'partially_met' | 'not_met'
```

- `met` — delivered as specified with no rework.
- `met_with_rework` — delivered but required revision after initial delivery.
- `partially_met` — partially completed; some acceptance criteria remain open.
- `not_met` — did not meet its acceptance criteria.

Null means not yet evaluated. Evaluation typically happens after the task reaches `done`.

### Session effectivenessScore

Float in [0, 1]; null means the session has not been evaluated.

- Stored as `text` — `.toString()` at write, `parseFloat` at read, always guarded with `Number.isNaN` (`packages/db/src/schema.ts:280`, @lore AC1 S-1).
- Values outside [0, 1] rejected at the API boundary — Zod `.min(0).max(1)` (`packages/server/src/routes/sessions-routes.ts:56`).

Implementation story: `TRACK-AC.md` in `.pipeline/work-packages/`.

## Cross-primitive invariants

- **No-FK convention for cross-track references.** A column referencing another track's primitive ships as plain text, not a DB FK, so tracks stay independent — `filesystems.connectionId` (`schema.ts:899`) is deliberately not an FK (`service_connections` reverted in migration 0038; @lore AO1 — Track AN may add the FK in its own migration).
- **Trust-first.** HyperIdle executes nothing of its own — the agent's own session, tools, and credentials run every call; HyperIdle classifies, routes to review, and records. `identityHash`/arg-pin is convenience metadata, never a guard; nothing gates on a hash match. Full Proposed Call spec: [staged-operation.md](staged-operation.md).
- **Filesystem primitive** — semantics owned by [filesystem-primitive.md](filesystem-primitive.md); shape owned by `packages/db/src/schema.ts`.
- **No duration budget axis** — duration is never a budget; canonical statement in [wip-and-cost-limits.md](wip-and-cost-limits.md) §10.7.
