# L17 Architecture Plan -- Cost + Tokens wired into Work

## Required reading

Engineers implementing this plan must read:

- `plans/L17/concept.md` -- concept decisions (transport format, appetite migration, type guard)
- `plans/L17/design/approved.md` -- UI surface specifications
- `docs/process-layer/canonical-shapes.md` -- Money and TokenUsage shapes (L4)
- `docs/process-layer/wip-and-cost-limits.md` -- cost cap grammar
- `docs/agent-layer/model-routing-and-cost.md` -- model tiers
- `packages/shared/src/harness/harness-adapter.ts` -- current SessionResult
- `packages/shared/src/harness/harness-events.ts` -- current events
- `packages/server/src/services/cost-cap.ts` -- cost cap checking
- `packages/server/src/services/session-provisioning.ts` -- session drain loop
- `packages/server/src/harness/claude-agent-sdk-adapter.ts` -- concrete adapter
- `packages/db/src/schema.ts` -- current DB schema
- `packages/web/src/shell/Rail.tsx` -- CostInfo type
- `packages/web/src/types/bet.ts` -- BetDetail type

---

## Plan reconciliation: spec vs reality

| Spec assumption | Codebase reality | Resolution |
|---|---|---|
| `bets.appetite` is text "1 week"/"2 weeks"/"6 weeks" | Confirmed: `schema.ts:68` `appetite: text("appetite").notNull()`, validated by `BET_APPETITES` Zod enum in `bets.ts:20` | Migration 0010 adds `cost_appetite_minor`, `cost_appetite_currency`, `token_appetite_json`; drops `appetite` |
| `sessions.cost` is integer cents | Confirmed: `schema.ts:137` `cost: integer("cost").default(0)` | Migration 0010 adds `cost_minor`, `cost_currency`, `tokens_json`; drops `cost` |
| `agents.costCap/costActual` are integer cents | Confirmed: `schema.ts:35-36` | Migration 0010 renames to `cost_cap_minor`, adds `cost_cap_currency`; `costActual` becomes computed (sum of sessions) |
| `teams.costCap/costActual` are integer cents | Confirmed: `schema.ts:48-49` | Same migration pattern |
| `tasks.costCap/costActual` are integer cents | Confirmed: `schema.ts:101-102` | Same migration pattern |
| `SessionResult` has `totalTokens: number, totalCost: number` | Confirmed: `harness-adapter.ts:19-21` | Replace with structured types |
| `TokenUsageEvent` has no tier field | Confirmed: `harness-events.ts:3-7` | Add `tier?: ModelTier` field |
| `CostUpdateEvent` has `totalCost: number, deltaCost: number` | Confirmed: `harness-events.ts:26-30` | Add `currency?: CurrencyCode` field |
| `formatMoney` exists in `artifact-cost.ts` (local, micros-based) | Confirmed: private function taking micros | Replace with shared `formatMoney(Money): string` |
| `ArtifactCostFromSession` is `{ money: string|null, tokens: string|null }` | Confirmed: `artifact.ts:51-54` | Replace with `{ money: Money|null, tokens: TokenUsage|null }` at the wire level; display formatting stays in the component |
| Rail `CostInfo` is 4 string fields | Confirmed: `Rail.tsx:49-54` | Replace with structured Money fields |
| `BetDetail.appetite` is string | Confirmed: `bet.ts:32` | Replace with `costAppetite: WireMoney|null` |
| `BetCardSummary.appetite` is string | Confirmed: `product.ts:49` | Replace with `costAppetite: WireMoney|null` |
| `ProductBurn.costActual/costCap` are numbers | Confirmed: `product.ts:42-46` | Replace with `WireMoney|null` |
| Bet create validates appetite as enum `["1 week","2 weeks","6 weeks"]` | Confirmed: `bets.ts:20` | Replace with `costAppetite: { minor: number, currency: string }` |
| `cost-cap.ts` uses integer arithmetic | Confirmed throughout | Upgrade to Money-aware (still integer minor units, but currency-qualified) |
| `session-provisioning.ts:324-325` converts deltaCost (dollars float) to cents | Confirmed: `totalCostCents += Math.round(delta * 100)` | Replace with structured conversion from harness-reported Money |

---

## 1. Shared types -- Money at the wire boundary

### Design-it-twice: Money wire representation

**Option A: `number` minor units + `string` currency (flat)**
```typescript
interface WireMoney { minor: number; currency: string }
```
Trade-off: Simple, flat, JSON-serializable. Requires caller to know scale.
Reject reason: None -- this wins.

**Option B: `string` minor units (for bigint-safe transport)**
```typescript
interface WireMoney { minor: string; currency: string }
```
Trade-off: Handles values > MAX_SAFE_INTEGER. Requires parseInt at every consumer.
Reject reason: Practical cost values never approach MAX_SAFE_INTEGER. Over-engineering.

**Decision: Option A.** `WireMoney` uses `number` for minor units. The canonical `Money` type in shared uses `bigint` for arithmetic helpers; `WireMoney` is the JSON-safe subset.

### New types in `packages/shared/src/types/money.ts`

```typescript
// Canonical shapes from L4 -- implemented as TypeScript types
export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'JPY';

export const CURRENCY_CODES = ['USD', 'EUR', 'GBP', 'JPY'] as const;

// Scale per currency (closed mapping)
export const CURRENCY_SCALE: Record<CurrencyCode, number> = {
  USD: 2, EUR: 2, GBP: 2, JPY: 0
};

// Canonical Money type -- bigint minor units for precision-safe arithmetic
export interface Money {
  readonly minor: bigint;
  readonly currency: CurrencyCode;
}

// Wire-safe Money -- number minor units for JSON serialization
export interface WireMoney {
  readonly minor: number;
  readonly currency: CurrencyCode;
}

export type ModelTier = 'reasoning' | 'workhorse' | 'fast';
// (ModelTier already exists in types.ts -- re-export, don't redefine)

export interface TierTokenCount {
  readonly prompt: number;   // number at wire level (bigint in arithmetic helpers)
  readonly completion: number;
  readonly cachedPrompt?: number;
}

export interface TokenUsage {
  readonly byTier: Partial<Record<ModelTier, TierTokenCount>>;
}

// ── Helpers ──

export function zeroMoney(currency: CurrencyCode): Money;
export function moneyFromWire(wire: WireMoney): Money;
export function moneyToWire(money: Money): WireMoney;
export function addMoney(a: Money, b: Money): Money;  // throws if currencies differ
export function compareMoney(a: Money, b: Money): -1 | 0 | 1;  // throws if currencies differ
export function scaleForCurrency(currency: CurrencyCode): number;

// Token helpers
export function totalTokens(usage: TokenUsage): { prompt: number; completion: number };
export function addTokenUsage(a: TokenUsage, b: TokenUsage): TokenUsage;
```

### File: `packages/shared/src/format/money.ts`

```typescript
// The single shared formatter -- all Money-to-string conversions go through here
export function formatMoney(money: Money | WireMoney | null): string;
// null -> "--"
// USD 12340 -> "$123.40"
// JPY 1200 -> "1,200 JPY"
// Uses Intl.NumberFormat('en-US', { style: 'currency', currency }) internally

export function formatTokenCount(count: number | null): string;
// null -> "--"
// 800 -> "800"
// 42300 -> "42.3k"
// 1200000 -> "1.2M"
```

### ArtifactCostFromSession replacement

```typescript
// Before (packages/shared/src/types/artifact.ts:51-54):
export interface ArtifactCostFromSession {
  readonly money: string | null;
  readonly tokens: string | null;
}

// After:
export interface ArtifactCostFromSession {
  readonly money: WireMoney | null;
  readonly tokens: TokenUsage | null;
}
```

The `ArtifactCostChip` component continues to receive `ArtifactCostFromSession` but calls `formatMoney()` and `formatTokenCount(totalTokens())` internally instead of displaying raw strings.

### Export from `packages/shared/src/index.ts`

Add exports for: `CurrencyCode`, `CURRENCY_CODES`, `CURRENCY_SCALE`, `Money`, `WireMoney`, `TierTokenCount`, `TokenUsage`, `zeroMoney`, `moneyFromWire`, `moneyToWire`, `addMoney`, `compareMoney`, `scaleForCurrency`, `totalTokens`, `addTokenUsage`, `formatMoney`, `formatTokenCount`.

`ModelTier` is already exported from `types.ts` -- do not duplicate.

---

## 2. Harness contract changes

### `packages/shared/src/harness/harness-events.ts`

```typescript
// TokenUsageEvent gains optional tier
export interface TokenUsageEvent {
  readonly type: "token_usage";
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly tier?: ModelTier;  // NEW -- null for adapters that don't report tier
}

// CostUpdateEvent gains optional currency
export interface CostUpdateEvent {
  readonly type: "cost_update";
  readonly totalCost: number;    // in dollars (harness reports dollars)
  readonly deltaCost: number;
  readonly currency?: CurrencyCode;  // NEW -- defaults to 'USD' if absent
}
```

### `packages/shared/src/harness/harness-adapter.ts`

```typescript
// SessionResult gains structured cost
export interface SessionResult {
  readonly outcome: "completed" | "crashed" | "stopped";
  readonly cost: WireMoney;           // CHANGED from totalCost: number
  readonly tokenUsage: TokenUsage;    // CHANGED from totalTokens: number
}
```

### `packages/server/src/harness/claude-agent-sdk-adapter.ts`

Update `translateMessage` to:
- Add `tier` field to TokenUsageEvent. Claude SDK does not currently report per-message tier, so the adapter infers tier from the SessionConfig's `modelTier` parameter (the session was started with a specific tier).
- Add `currency: 'USD'` to CostUpdateEvent (Claude SDK reports in USD).

Update `stopSession` to return:
```typescript
return {
  outcome: "completed",
  cost: { minor: Math.round(session.totalCost * 100), currency: 'USD' as CurrencyCode },
  tokenUsage: {
    byTier: {
      [this.sessions.get(handle.sessionId)?.config.modelTier ?? 'workhorse']: {
        prompt: session.totalInputTokens,
        completion: session.totalOutputTokens,
      }
    }
  }
};
```

### `packages/shared/src/harness/mock-harness-adapter.ts`

Update to return structured SessionResult:
```typescript
return {
  outcome: "completed",
  cost: { minor: 30, currency: 'USD' },  // 30 cents = $0.30
  tokenUsage: { byTier: { workhorse: { prompt: 100, completion: 50 } } }
};
```

---

## 3. Database migration (0010)

File: `packages/db/drizzle/0010_cost_tokens_l17.sql`

### Design-it-twice: TokenUsage storage

**Option A: JSON column**
```sql
ALTER TABLE sessions ADD COLUMN tokens_json TEXT;
-- stores: {"byTier":{"workhorse":{"prompt":100,"completion":50}}}
```
Trade-off: Flexible, single column, easy to extend with new tiers. Not queryable with SQL (no SUM across sessions by tier without application logic).
Reject reason: None -- this wins for v1. Aggregation is done in application code anyway.

**Option B: Separate columns per tier**
```sql
ALTER TABLE sessions ADD COLUMN tokens_reasoning_prompt INTEGER;
ALTER TABLE sessions ADD COLUMN tokens_reasoning_completion INTEGER;
-- ... 6 more columns
```
Trade-off: Directly queryable, SQL aggregation possible. 6-8 columns per table, rigid.
Reject reason: Too many columns. Adding a tier requires a migration. The closed tier enum makes this look safe, but the JSON approach is simpler and the aggregation is done server-side anyway.

**Decision: Option A.** JSON column for TokenUsage. Integer columns for Money (minor + currency).

### Migration SQL

```sql
-- === BETS: appetite text -> Money cap ===
ALTER TABLE bets ADD COLUMN cost_appetite_minor INTEGER;
ALTER TABLE bets ADD COLUMN cost_appetite_currency TEXT DEFAULT 'USD';
ALTER TABLE bets ADD COLUMN token_appetite_json TEXT;
-- Backfill: existing duration-string appetites become NULL (uncapped)
-- The old `appetite` column is NOT dropped yet -- kept as `appetite_legacy` for rollback safety
ALTER TABLE bets RENAME COLUMN appetite TO appetite_legacy;

-- === BETS: add cost tracking ===
ALTER TABLE bets ADD COLUMN cost_actual_minor INTEGER DEFAULT 0;
ALTER TABLE bets ADD COLUMN cost_actual_currency TEXT DEFAULT 'USD';

-- === SESSIONS: cost integer -> Money ===
ALTER TABLE sessions ADD COLUMN cost_minor INTEGER DEFAULT 0;
ALTER TABLE sessions ADD COLUMN cost_currency TEXT DEFAULT 'USD';
ALTER TABLE sessions ADD COLUMN tokens_json TEXT;
-- Backfill: copy existing cost (cents) into cost_minor
UPDATE sessions SET cost_minor = cost WHERE cost IS NOT NULL AND cost > 0;
-- Keep `cost` column as `cost_legacy` for rollback
ALTER TABLE sessions RENAME COLUMN cost TO cost_legacy;

-- === TASKS: costCap/costActual -> Money ===
ALTER TABLE tasks ADD COLUMN cost_cap_minor INTEGER;
ALTER TABLE tasks ADD COLUMN cost_cap_currency TEXT DEFAULT 'USD';
ALTER TABLE tasks ADD COLUMN cost_actual_minor INTEGER DEFAULT 0;
ALTER TABLE tasks ADD COLUMN cost_actual_currency TEXT DEFAULT 'USD';
ALTER TABLE tasks ADD COLUMN tokens_actual_json TEXT;
-- Backfill: copy existing values
UPDATE tasks SET cost_cap_minor = cost_cap WHERE cost_cap IS NOT NULL;
UPDATE tasks SET cost_actual_minor = cost_actual WHERE cost_actual IS NOT NULL AND cost_actual > 0;
ALTER TABLE tasks RENAME COLUMN cost_cap TO cost_cap_legacy;
ALTER TABLE tasks RENAME COLUMN cost_actual TO cost_actual_legacy;

-- === AGENTS: costCap/costActual -> Money ===
ALTER TABLE agents ADD COLUMN cost_cap_minor INTEGER;
ALTER TABLE agents ADD COLUMN cost_cap_currency TEXT DEFAULT 'USD';
-- costActual on agents is computed from sessions, not stored
ALTER TABLE agents RENAME COLUMN cost_cap TO cost_cap_legacy;
ALTER TABLE agents RENAME COLUMN cost_actual TO cost_actual_legacy;
-- Backfill
UPDATE agents SET cost_cap_minor = cost_cap_legacy WHERE cost_cap_legacy IS NOT NULL;

-- === TEAMS: costCap/costActual -> Money ===
ALTER TABLE teams ADD COLUMN cost_cap_minor INTEGER;
ALTER TABLE teams ADD COLUMN cost_cap_currency TEXT DEFAULT 'USD';
ALTER TABLE teams RENAME COLUMN cost_cap TO cost_cap_legacy;
ALTER TABLE teams RENAME COLUMN cost_actual TO cost_actual_legacy;
-- Backfill
UPDATE teams SET cost_cap_minor = cost_cap_legacy WHERE cost_cap_legacy IS NOT NULL;

-- === ARTIFACTS: already have cost_money_micros -- convert to minor units ===
-- Artifacts use micros (1/1,000,000 of a dollar). Convert to cents.
ALTER TABLE artifacts ADD COLUMN cost_minor INTEGER;
ALTER TABLE artifacts ADD COLUMN cost_currency TEXT DEFAULT 'USD';
ALTER TABLE artifacts ADD COLUMN cost_tokens_json TEXT;
-- Backfill: micros -> cents (divide by 10,000, round)
UPDATE artifacts SET cost_minor = ROUND(cost_money_micros / 10000.0)
  WHERE cost_money_micros IS NOT NULL;
-- Build token JSON from existing columns
UPDATE artifacts SET cost_tokens_json = json_object(
  'byTier', json_object(
    'workhorse', json_object(
      'prompt', cost_tokens_input,
      'completion', cost_tokens_output
    )
  )
) WHERE cost_tokens_input IS NOT NULL OR cost_tokens_output IS NOT NULL;
-- Rename old columns
ALTER TABLE artifacts RENAME COLUMN cost_money_micros TO cost_money_micros_legacy;
ALTER TABLE artifacts RENAME COLUMN cost_tokens_input TO cost_tokens_input_legacy;
ALTER TABLE artifacts RENAME COLUMN cost_tokens_output TO cost_tokens_output_legacy;
```

### Schema update (`packages/db/src/schema.ts`)

Update all table definitions to use the new columns. Legacy columns stay in schema as nullable for rollback, marked with `@deprecated`. Example for sessions:

```typescript
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "restrict" }),
  agentId: text("agent_id").notNull().references(() => agents.id, { onDelete: "restrict" }),
  modelTier: text("model_tier").notNull(),
  startedAt: text("started_at").notNull(),
  endedAt: text("ended_at"),
  state: text("state").notNull(),
  workspaceSnapshot: text("workspace_snapshot"),
  // NEW Money columns
  costMinor: integer("cost_minor").default(0),
  costCurrency: text("cost_currency").default("USD"),
  tokensJson: text("tokens_json"),
  // Legacy (kept for rollback)
  /** @deprecated L17: use costMinor + costCurrency */
  costLegacy: integer("cost_legacy"),
  outcome: text("outcome"),
  notes: text("notes"),
  traceId: text("trace_id"),
}, ...);
```

---

## 4. Server changes

### 4.1 Cost-cap service (`packages/server/src/services/cost-cap.ts`)

The service currently operates on integer cents. It continues to operate on integer minor units, but now validates that all comparisons are within the same currency.

Key changes:
- `getAgentSpend()` sums `sessions.costMinor` (was `sessions.cost`)
- `getTeamSpend()` same
- `recordCostAndCheck()` params gain `currency: CurrencyCode`
- `checkCostCap()` reads `agents.costCapMinor` (was `agents.costCap`)
- The `checkAndEmit()` function adds currency to the warning/breach events
- `resetCosts()` zeroes `sessions.costMinor` (was `sessions.cost`)

### 4.2 Session provisioning (`packages/server/src/services/session-provisioning.ts`)

The event drain loop at line 320:
```typescript
// Before:
if (event.type === "cost_update") {
  const delta = Math.max(0, event.deltaCost);
  totalCostCents += Math.round(delta * 100);
  await recordCostAndCheck(db, eventBus, {
    sessionId, cost: totalCostCents, ...
  });
}

// After:
if (event.type === "cost_update") {
  const delta = Math.max(0, event.deltaCost);
  const currency = event.currency ?? 'USD';
  totalCostMinor += Math.round(delta * (currency === 'JPY' ? 1 : 100));
  await recordCostAndCheck(db, eventBus, {
    sessionId, costMinor: totalCostMinor, currency, ...
  });
}
```

Token accumulation from `token_usage` events:
```typescript
// NEW: accumulate tokens by tier during the session
if (event.type === "token_usage") {
  const tier = event.tier ?? modelTier;
  accumulatedTokens[tier] = {
    prompt: (accumulatedTokens[tier]?.prompt ?? 0) + event.inputTokens,
    completion: (accumulatedTokens[tier]?.completion ?? 0) + event.outputTokens,
  };
}
```

At session end, write `tokensJson` to the session row.

### 4.3 Session lifecycle (`packages/server/src/services/session-lifecycle.ts`)

`endSession()` and `crashSession()` update `costMinor` + `costCurrency` + `tokensJson` on the session row. The `SessionEndedEvent.costDelta` stays as `number` (minor units).

### 4.4 Bets route (`packages/server/src/routes/bets.ts`)

**Create schema:**
```typescript
const createBetSchema = z.object({
  productId: z.string(),
  teamId: z.string(),
  pitch: z.string(),
  costAppetite: z.object({
    minor: z.number().int().nonnegative(),
    currency: z.enum(CURRENCY_CODES),
  }).nullable().optional(),
  tokenAppetite: z.object({
    byTier: z.record(z.object({
      prompt: z.number().int().nonnegative(),
      completion: z.number().int().nonnegative(),
    })).optional(),
  }).nullable().optional(),
  doneCondition: z.string().optional(),
  hypothesis: z.string().optional(),
});
```

Remove the `BET_APPETITES` enum validation.

**Update schema:**
```typescript
const MUTABLE_BET_FIELDS_L17 = ["done_condition", "hypothesis", "cost_appetite"] as const;
```

The `updateBetField` function must handle `cost_appetite` by writing `costAppetiteMinor` + `costAppetiteCurrency` instead of a single text column.

**GET /bets/:id response:**
Returns the bet with structured cost fields:
```json
{
  "id": "...",
  "costAppetite": { "minor": 50000, "currency": "USD" },
  "tokenAppetite": null,
  "costActual": { "minor": 21430, "currency": "USD" },
  "tokensActual": { "byTier": { "workhorse": { "prompt": 38200, "completion": 4100 } } },
  "tasks": [
    {
      "id": "...",
      "costActual": { "minor": 420, "currency": "USD" },
      "costCap": null,
      ...
    }
  ]
}
```

### 4.5 Products route (`packages/server/src/routes/products.ts`)

`deriveProductStatus()` continues to compare minor units (no change in logic, just the column names change).

`ProductBurn` on the wire changes from `{ costActual: number, costCap: number | null }` to `{ costActual: WireMoney | null, costCap: WireMoney | null }`.

`BetCardSummary.appetite` changes from `string` to `costAppetite: WireMoney | null`.

### 4.6 Rail route (`packages/server/src/routes/rail.ts`)

The `CostBurnRate` response changes:
```typescript
interface CostBurnRate {
  todaySpend: WireMoney | null;
  todayCap: WireMoney | null;
  weekSpend: WireMoney | null;
  weekCap: WireMoney | null;
  weekTokens: number | null;  // aggregate token count
}
```

Server computes `todaySpend` and `weekSpend` by summing `sessions.costMinor` grouped by date ranges. `todayCap` and `weekCap` come from factory settings (now stored as `cost_cap_daily_minor` + `cost_cap_daily_currency`).

### 4.7 Artifacts route (`packages/server/src/routes/artifacts.ts`)

`formatArtifactCost()` call sites change to construct `ArtifactCostFromSession` with `WireMoney` and `TokenUsage` instead of strings. The function reads from the new columns (`costMinor`, `costCurrency`, `costTokensJson`).

### 4.8 Tasks route (`packages/server/src/routes/tasks.ts`)

Task create schema: `costCap` changes from `z.number().int().optional()` to `z.object({ minor: z.number().int().nonnegative(), currency: z.enum(CURRENCY_CODES) }).nullable().optional()`.

---

## 5. Web changes

### 5.1 Types (`packages/web/src/types/bet.ts`)

```typescript
import type { WireMoney, TokenUsage, TaskState } from "@hyperidle/shared";

export interface BetDetail {
  id: string;
  title: string;
  product: string;
  team: string;
  status: BetStatus;
  costAppetite: WireMoney | null;      // CHANGED from appetite: string
  tokenAppetite: TokenUsage | null;
  costActual: WireMoney | null;         // NEW
  tokensActual: TokenUsage | null;      // NEW
  progress: { done: number; total: number };
  pitch: string;
  tasks: Array<{
    id: string;
    title: string;
    owner: string;
    state: TaskState;
    costActual: WireMoney | null;       // CHANGED from cost: string
  }>;
}
```

### 5.2 Rail (`packages/web/src/shell/Rail.tsx`)

```typescript
import type { WireMoney } from "@hyperidle/shared";
import { formatMoney, formatTokenCount } from "@hyperidle/shared";

export interface CostInfo {
  todaySpend: WireMoney | null;
  todayCap: WireMoney | null;
  weekSpend: WireMoney | null;
  weekCap: WireMoney | null;
  weekTokens: number | null;
}
```

In the JSX:
```tsx
<KeyValue label="Today" value={formatMoney(cost.todaySpend)} />
<KeyValue label="Today Cap" value={formatMoney(cost.todayCap)} />
<KeyValue label="Week" value={formatMoney(cost.weekSpend)} />
<KeyValue label="Week Cap" value={formatMoney(cost.weekCap)} />
{cost.weekTokens !== null && (
  <KeyValue label="Tokens" value={formatTokenCount(cost.weekTokens)} />
)}
```

### 5.3 Fixtures (`packages/web/src/fixtures/app-shell-data.ts`)

```typescript
export const MOCK_RAIL_COST: CostInfo = {
  todaySpend: { minor: 1240, currency: 'USD' },
  todayCap: { minor: 5000, currency: 'USD' },
  weekSpend: { minor: 8420, currency: 'USD' },
  weekCap: { minor: 35000, currency: 'USD' },
  weekTokens: 42300,
};
```

### 5.4 WorkBet page (`packages/web/src/pages/WorkBet.tsx`)

The bet header now shows:
- BetCard with `appetite={formatMoney(bet.costAppetite)}` -- passes pre-formatted string
- Spend-vs-cap section below BetCard using KeyValue rows per approved design
- Task table cost column uses `formatMoney(task.costActual)`

### 5.5 WorkProduct page (`packages/web/src/pages/WorkProduct.tsx`)

Replace inline `$${((burn.costActual ?? 0) / 100).toFixed(2)}` formatting (line 175) with `formatMoney(burn.costActual)`.

### 5.6 Product types (`packages/shared/src/product.ts`)

```typescript
export interface ProductBurn {
  costActual: WireMoney | null;
  costCap: WireMoney | null;
  capacity: number;
  activeBets: number;
}

export interface BetCardSummary {
  id: string;
  pitchTitle: string;
  costAppetite: WireMoney | null;  // CHANGED from appetite: string
  status: BetStatus;
  progressDone: number;
  progressTotal: number;
}
```

### 5.7 Design-system: ArtifactCostChip

Update to call `formatMoney()` and `formatTokenCount()` internally:
```tsx
const moneyText = cost.money ? formatMoney(cost.money) : "--";
const tokenTotal = cost.tokens ? totalTokens(cost.tokens) : null;
const tokenText = tokenTotal ? formatTokenCount(tokenTotal.prompt + tokenTotal.completion) : null;
```

### 5.8 Hooks

- `useBet.ts`: no change (it just fetches and returns the BetDetail shape).
- `useProduct.ts`: no change to the hook, only the type it returns changes.

---

## 6. Type guard against string money

### Approach

The type guard is structural, not an ESLint rule. The mechanism:

1. `ArtifactCostFromSession.money` changes from `string | null` to `WireMoney | null`. Any code that assigned a string to it will fail `bun run check`.
2. `CostInfo` fields change from `string` to `WireMoney | null`. Same effect.
3. `BetDetail.appetite` (string) is replaced by `costAppetite: WireMoney | null`.
4. `BetCardSummary.appetite` (string) is replaced by `costAppetite: WireMoney | null`.
5. `ProductBurn.costActual` (number) is replaced by `WireMoney | null`.

The "guard" is that there are zero string-typed money fields left in the shared types. Any new code that tries to store a cost as a string would need to define its own type, which would fail design review.

An ESLint rule is NOT added. The type system is the guard. The canonical shapes doc is the documentation guard. Together they prevent regression without a custom lint rule.

---

## 7. Ordered task list

### Task 1: Shared types + formatters (no DB, no server, no web)

**Files:**
- NEW `packages/shared/src/types/money.ts` -- Money, WireMoney, TokenUsage, TierTokenCount, CurrencyCode types + arithmetic helpers
- NEW `packages/shared/src/format/money.ts` -- formatMoney, formatTokenCount
- EDIT `packages/shared/src/format/artifact-cost.ts` -- rewrite to use shared formatMoney
- EDIT `packages/shared/src/types/artifact.ts` -- change ArtifactCostFromSession
- EDIT `packages/shared/src/index.ts` -- add exports
- EDIT `packages/shared/src/harness/harness-events.ts` -- add tier, currency fields
- EDIT `packages/shared/src/harness/harness-adapter.ts` -- change SessionResult
- EDIT `packages/shared/src/harness/mock-harness-adapter.ts` -- update mock
- EDIT `packages/shared/src/product.ts` -- change ProductBurn, BetCardSummary

**Tests:**
- NEW `packages/shared/src/__tests__/money.test.ts` -- formatMoney, formatTokenCount, addMoney, compareMoney, moneyFromWire, moneyToWire
- EDIT `packages/shared/src/__tests__/artifact-cost.test.ts` -- update to new types

**Verification:** `bun run check` passes in packages/shared. All new formatter tests green.

### Task 2: DB migration

**Files:**
- NEW `packages/db/drizzle/0010_cost_tokens_l17.sql`
- EDIT `packages/db/src/schema.ts` -- new columns, legacy columns marked deprecated

**Verification:** `bun run db:generate` succeeds. `bun run db:migrate` runs the migration without error on a fresh DB and on an existing DB with data.

**Depends on:** Task 1 (types must exist before schema references them in comments).

### Task 3: Server -- cost-cap service + session lifecycle

**Files:**
- EDIT `packages/server/src/services/cost-cap.ts` -- use new column names, add currency
- EDIT `packages/server/src/services/session-lifecycle.ts` -- write new columns
- EDIT `packages/server/src/services/session-provisioning.ts` -- structured cost accumulation + token accumulation
- EDIT `packages/server/src/harness/claude-agent-sdk-adapter.ts` -- return structured SessionResult, emit tier/currency

**Tests:**
- EDIT `packages/server/src/__tests__/cost-cap.test.ts` -- update column references
- EDIT `packages/server/src/__tests__/cost-cap.dedup.test.ts` -- update column references
- EDIT `packages/server/src/__tests__/cost-cap.session-end-paths.test.ts` -- update column references
- EDIT `packages/server/src/__tests__/sessions.test.ts` -- verify new columns written

**Verification:** All cost-cap tests green. Session creation/end correctly writes new columns.

**Depends on:** Task 2 (schema must be migrated).

### Task 4: Server -- route updates (bets, products, rail, tasks, artifacts)

**Files:**
- EDIT `packages/server/src/routes/bets.ts` -- new create/update schemas, structured response
- EDIT `packages/server/src/routes/products.ts` -- ProductBurn + BetCardSummary wire changes
- EDIT `packages/server/src/routes/rail.ts` -- new CostBurnRate shape
- EDIT `packages/server/src/routes/tasks.ts` -- costCap as WireMoney
- EDIT `packages/server/src/routes/artifacts.ts` -- use new cost columns + formatArtifactCost
- EDIT `packages/server/src/services/bet-state-machine.ts` -- handle cost_appetite field

**Tests:**
- EDIT `packages/server/src/__tests__/bets.test.ts` -- update fixtures and assertions
- EDIT `packages/server/src/routes/__tests__/bets.validation.test.ts` -- update validation tests
- EDIT `packages/server/src/__tests__/rail.test.ts` -- update cost assertions
- NEW `packages/server/src/__tests__/money-wire.test.ts` -- verify bet create with structured appetite, verify round-trip

**Verification:** All route tests green. API responses match the wire shapes defined above.

**Depends on:** Task 3 (cost-cap service must be updated first).

### Task 5: Web -- types + formatters + Rail + pages

**Files:**
- EDIT `packages/web/src/types/bet.ts` -- BetDetail with costAppetite, costActual, tokensActual
- EDIT `packages/web/src/shell/Rail.tsx` -- CostInfo with WireMoney fields
- EDIT `packages/web/src/fixtures/app-shell-data.ts` -- structured fixtures
- EDIT `packages/web/src/pages/WorkBet.tsx` -- spend-vs-cap section, formatMoney calls
- EDIT `packages/web/src/pages/WorkProduct.tsx` -- formatMoney calls
- EDIT `packages/web/src/shell/Canvas.tsx` -- appetite prop uses formatted Money
- EDIT `packages/web/src/shell/PitchSelector.tsx` -- appetite prop uses formatted Money
- EDIT `packages/web/src/components/GlobalSearchPanel.tsx` -- appetite field
- EDIT `packages/web/src/hooks/useGlobalSearch.ts` -- appetite field type
- EDIT `packages/design-system/src/ArtifactCostChip.tsx` -- use formatMoney internally

**Tests:**
- EDIT existing BetCard, TaskCard, PitchCard, Rail tests to use new fixtures
- EDIT `packages/web/src/__tests__/WorkProduct.test.tsx` -- update burn fixtures
- EDIT `packages/web/src/__tests__/WorkBet.*.test.tsx` -- update bet fixtures

**Verification:** `bun run check` passes in packages/web. All component tests green.

**Depends on:** Task 4 (API must return structured data).

### Task 6: Playwright E2E

**Files:**
- NEW `packages/web/e2e/L17-cost-tokens.spec.ts` -- Bet detail shows cost in money + tokens, no string-money anywhere
- EDIT existing e2e fixtures that use cost/appetite strings

**Verification:** Full Playwright suite green. The L17-specific test:
1. Seeds a bet with structured costAppetite
2. Seeds tasks with costActual
3. Opens Bet detail
4. Asserts money is formatted ("$" prefix, decimal point, no raw integer)
5. Asserts no string-money patterns visible (no bare "2 weeks" on cost surfaces)
6. Asserts token count is visible in compact format when present

**Depends on:** Task 5 (web must render correctly).

### Task 7: Cleanup + final verification

- Remove `appetite` from `MUTABLE_BET_FIELDS` in shared `types.ts` (replace with `cost_appetite`)
- Verify no string-typed money fields remain: `grep -rn "money.*string\|cost.*string\|appetite.*string" packages/shared/src/ packages/web/src/types/` should return zero hits (excluding test files, comments, and the `@deprecated` legacy fields)
- `bun run check` + `bun run lint` + `bun run test` all green
- Full Playwright e2e suite green

**Depends on:** Task 6.

---

## 8. Risks and ambiguities

| Risk | Mitigation |
|---|---|
| SQLite ALTER TABLE limitations (cannot drop columns) | Use RENAME instead of DROP. Legacy columns stay with `_legacy` suffix. A follow-up story can recreate tables without legacy columns. |
| Existing test fixtures use string appetites ("small", "medium", "1 week", etc.) | Bulk-update all test fixtures to use structured values. Grep for `appetite:` across all test files. |
| `formatMoney` uses Intl.NumberFormat which requires a JS runtime | Vitest runs in Node which supports Intl. No issue. |
| Claude SDK adapter does not report per-message model tier | Infer from SessionConfig.modelTier. Sessions are single-tier by design (section 6.1 of model-routing doc). |
| Artifact cost was in micros (1/1,000,000 of USD), new system is in cents | Migration converts: `ROUND(cost_money_micros / 10000.0)` = cents. Precision loss is at most 0.005 cents, acceptable. |
| `CreateArtifactInput.cost` uses `{ money_micros, tokens_input, tokens_output }` | Change to `{ cost: WireMoney | null, tokens: TokenUsage | null }` to match. Requires updating artifact creation call sites. |

---

## 9. Security and abuse cases

| Check | Applicable? | Resolution |
|---|---|---|
| Rate-limit on POST/PATCH | Yes -- bet create/update | Already rate-limited by existing middleware. No change. |
| Input-trust boundary for agent-authored fields | Yes -- harness-reported cost | The harness is trusted (it runs inside the meta layer). The meta layer does not expose cost-write endpoints to agents. Cost is written server-side from harness events, not from agent tool calls. |
| Secret-handling for new credential surface | N/A | No new credentials introduced. |
| Path-traversal for path input | N/A | No new path inputs. |
| SSRF for outbound URL | N/A | No new outbound URLs. |
| Integer overflow on money values | Applicable | `number` in JS is safe up to 2^53. Max practical value: $90 billion at cent precision. Cost cap service validates non-negative before write. |
| Currency mismatch on addMoney | Applicable | `addMoney()` throws on mismatched currencies. The cost-cap service validates same-currency before comparison. Factory is single-currency in v1. |

---

## 10. Protected tests

The following test files have assertions that must be verified (not blindly changed) during implementation:

```
protectedTests:
  - packages/shared/src/__tests__/artifact-cost.test.ts
  - packages/shared/src/__tests__/artifact-types.test.ts
  - packages/server/src/__tests__/cost-cap.test.ts
  - packages/server/src/__tests__/cost-cap.dedup.test.ts
  - packages/server/src/__tests__/cost-cap.session-end-paths.test.ts
  - packages/server/src/__tests__/bets.test.ts
  - packages/server/src/__tests__/bet-state-machine.test.ts
  - packages/server/src/routes/__tests__/bets.validation.test.ts
```

These tests currently verify the old cost shapes. They must be updated to the new shapes, but the update must be intentional (verifying the new contract), not mechanical (making old tests pass by weakening assertions).

---

## 11. Acceptance criteria with verification methods

| # | Criterion | Verification |
|---|---|---|
| AC1 | Money type exists in shared with bigint minor units, currency, and all helpers | `bun run check` passes; unit tests for `addMoney`, `compareMoney`, `zeroMoney`, `moneyFromWire`, `moneyToWire` all green |
| AC2 | WireMoney type exists for JSON transport | Type-check test: `WireMoney` is assignable to `{ minor: number, currency: string }` |
| AC3 | TokenUsage type exists with per-tier breakdown | Type-check test: `TokenUsage.byTier` is `Partial<Record<ModelTier, TierTokenCount>>` |
| AC4 | `formatMoney(null)` returns "--"; `formatMoney({minor:1240,currency:'USD'})` returns "$12.40" | Unit test in `money.test.ts` |
| AC5 | `formatTokenCount(42300)` returns "42.3k"; `formatTokenCount(null)` returns "--" | Unit test in `money.test.ts` |
| AC6 | DB migration 0010 adds Money + TokenUsage columns to bets, tasks, sessions, agents, teams, artifacts | Migration runs without error; schema inspection shows new columns |
| AC7 | Existing sessions.cost values are backfilled to cost_minor | Query `SELECT count(*) FROM sessions WHERE cost_legacy > 0 AND cost_minor = 0` returns 0 |
| AC8 | Bet appetite "2 weeks" strings are migrated to null costAppetite | Query `SELECT count(*) FROM bets WHERE cost_appetite_minor IS NOT NULL AND appetite_legacy IS NOT NULL` returns 0 (legacy values don't create spurious Money values) |
| AC9 | SessionResult returns structured `{ cost: WireMoney, tokenUsage: TokenUsage }` | Unit test on MockHarnessAdapter.stopSession() returns correct shape |
| AC10 | TokenUsageEvent carries optional `tier` field | Type-check + mock adapter test |
| AC11 | CostUpdateEvent carries optional `currency` field | Type-check + mock adapter test |
| AC12 | ClaudeAgentSdkAdapter returns structured SessionResult | Integration test (if SDK is available) or mock test |
| AC13 | Cost-cap service uses new column names and validates currency match | Unit tests in cost-cap.test.ts updated and green |
| AC14 | Session provisioning accumulates tokens by tier during event drain | Unit test: drain events with tier, verify tokensJson written to session row |
| AC15 | Bet create API accepts `costAppetite: { minor, currency }` and rejects duration strings | Integration test: POST /bets with structured appetite succeeds; POST with "2 weeks" returns 400 |
| AC16 | Bet detail API returns structured cost fields | Integration test: GET /bets/:id returns costAppetite, costActual, tokensActual |
| AC17 | Product list/detail API returns WireMoney burn | Integration test: GET /products/:id returns ProductBurn with WireMoney |
| AC18 | Rail API returns structured CostBurnRate | Integration test: GET /rail returns WireMoney cost fields |
| AC19 | `ArtifactCostFromSession` uses WireMoney + TokenUsage (not strings) | Type-check test confirms `money: WireMoney | null` (not `string | null`) |
| AC20 | ArtifactCostChip renders money via formatMoney | Unit test: render chip with WireMoney input, assert "$X.XX" text content |
| AC21 | BetCard shows formatted Money appetite (not "2 weeks") | Playwright e2e: open portfolio, BetCard shows "$" prefix on appetite |
| AC22 | Bet detail shows spend-vs-cap in Money + Tokens | Playwright e2e: open bet detail, see "$ / $" spend/cap + token count |
| AC23 | Rail cost section shows formatted Money values | Component test: Rail renders with CostInfo containing WireMoney, asserts "$" in rendered output |
| AC24 | WorkProduct burn shows formatted Money | Playwright e2e: open product page, burn section shows "$" formatted values |
| AC25 | No string-typed money fields remain in shared/web types | Grep verification: zero hits for `money.*string` in type definitions (excluding legacy/deprecated) |
| AC26 | MUTABLE_BET_FIELDS updated from "appetite" to "cost_appetite" | Type-check + existing bet-state-machine tests updated |
| AC27 | `bun run check` + `bun run lint` + `bun run test` all green | CI/local verification |
| AC28 | Full Playwright e2e suite stays green | Local e2e run |
