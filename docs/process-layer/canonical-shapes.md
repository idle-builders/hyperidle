# Canonical shapes — Process

## RevisionLogEntry shape (for bets)

```
{ timestamp: string, field: string, old_value: unknown, new_value: unknown, reason: string }
```

## Money and TokenUsage shapes (TRACK-L L4)

**Money and TokenUsage primitives — full spec at `docs/process-layer/wip-and-cost-limits.md` §10.**

The single grammar for every cost field on bets, tasks, sessions, agents, teams, and the factory. Money is currency-aware and precision-safe; TokenUsage carries a coarse model-tier signal. **There is no duration budget axis** — wall-clock duration is informational only, and a future spec proposing a `duration_cap`, `time_budget`, `deadline_as_cap`, or any other duration-shaped budget axis is rejected by `docs/process-layer/wip-and-cost-limits.md` §10.7.

```
// Closed enum. Adding a currency requires updating this section first
// and verifying the per-currency `scale` value below.
type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'JPY'

// Integer minor units in the currency's smallest indivisible unit.
// Precision-safe by construction: bigint arithmetic does not drift.
// `scale` is the decimal exponent for display: USD/EUR/GBP scale=2 (cents),
// JPY scale=0 (yen). The scale is a property of the value, not of the formatter.
type Money = {
  minor: bigint
  currency: CurrencyCode
  scale: number
}

// Closed enum. Matches `docs/agent-layer/model-routing-and-cost.md` §6.1 routing tiers.
// Adding a tier requires updating both this entry and model-routing-and-cost.md §6.1.
type ModelTier = 'reasoning' | 'workhorse' | 'fast'

// Per-tier breakdown. `cachedPrompt` is optional and only present when the
// harness reports prompt-cache hits separately. We never synthesise it.
type TierTokenCount = {
  prompt: bigint
  completion: bigint
  cachedPrompt?: bigint
}

// Sparse map: only tiers actually used appear. Totals are derived (helper
// functions in L17), never stored, to prevent drift between byTier and total.
type TokenUsage = {
  byTier: Partial<Record<ModelTier, TierTokenCount>>
}
```

- **Precision rules.** Money arithmetic is `bigint` minor-unit arithmetic; no `number` (float64) representation is ever stored or transported. Mixed-currency arithmetic is invalid: helpers in L17 enforce a single-currency invariant on add/compare. Token counts are `bigint` so cross-session rollups (including sub-agent fan-out) cannot overflow `Number.MAX_SAFE_INTEGER`.
- **Default currency.** `USD` (with `scale=2`). The default applies only to new-row construction; the currency is always carried with the value at read time. JPY values use `scale=0`. No currency conversion is performed by the spec — every Money value stays in its source currency until rendered.
- **`scale` is a function of `currency`, not free.** The valid `(currency, scale)` pairs are closed: `USD/EUR/GBP -> 2`, `JPY -> 0`. L17 helpers reject any `Money` value whose `scale` does not match its `currency`. The field is carried explicitly so callers and DB rows are self-describing without a per-currency lookup, but its value is constrained, not chosen. Adding a currency requires updating both the `CurrencyCode` enum and the per-currency scale rule in this entry, in the same change.
- **No numerical defaults in source.** Cap values (per-agent / per-team / per-factory Money caps, optional TokenUsage caps) live in the Primitive Store and the Settings view, not in code.
- **Tier vocabulary is inherited and closed.** The `ModelTier` enum is the same vocabulary as the routing tier in `docs/agent-layer/model-routing-and-cost.md` §6.1 (`reasoning | workhorse | fast`). A session's reported token spend lines up directly with the routing decision that produced it.
- **Unknown tier from a harness.** If the Harness Adapter reports tokens against a tier name outside the closed enum (e.g. a future provider ships a `frontier` tier the deployer's adapter has not yet been mapped to a known `ModelTier`), the adapter MUST coerce-and-flag: bucket the spend into the closest known tier (provider-specific mapping owned by the adapter) and emit a `ModelTierUnknownWarning` event so the deployer can update the mapping. The adapter MUST NOT silently drop the tokens, and MUST NOT widen the closed enum at runtime. The `byTier` map is sparse but its keys are always one of the closed `ModelTier` values.
- **Anti-pattern rule.** Duration is never a budget axis. The canonical statement of this rule is in `docs/process-layer/wip-and-cost-limits.md` §10.7. A spec PR proposing duration-as-budget should be rejected at review with a citation to that section.

Implementation stories that consume this contract:
- **L17** (Cost + Tokens wired into Work — `plans/work-packages/TRACK-L.md` lines 543-575) ships the actual TypeScript types in `packages/shared`, the `formatMoney` formatter, the `zeroMoney` / `addMoney` / `compareMoney` helpers, the harness cost-reporting contract, the DB columns for Money and TokenUsage on bets / tasks / sessions / teams, and the API responses. L17 also installs the type-level guard preventing string-typed money from being reintroduced.

## Outcome Verdict shapes (AC1)

### BetOutcomeVerdict

Closed enum. Represents the retrospective assessment of a bet hypothesis after the bet completes or is killed.

```
type BetOutcomeVerdict = 'validated' | 'refuted' | 'partial' | 'inconclusive'
```

- `validated` — the hypothesis held; measured results confirm the prediction.
- `refuted` — the hypothesis did not hold; evidence contradicts the prediction.
- `partial` — some segments or dimensions validated; others did not.
- `inconclusive` — insufficient data or runtime to reach a verdict.

Null means the bet has not been evaluated yet. Evaluation is only meaningful for `completed` or `killed` bets.

### TaskOutcomeVerdict

Closed enum. Represents the post-execution assessment of a task's delivery quality.

```
type TaskOutcomeVerdict = 'met' | 'met_with_rework' | 'partially_met' | 'not_met'
```

- `met` — task delivered as specified with no rework.
- `met_with_rework` — task delivered but required revision after initial delivery.
- `partially_met` — task partially completed; some acceptance criteria remain open.
- `not_met` — task did not meet its acceptance criteria.

Null means the task has not been evaluated. Evaluation typically happens after the task reaches `done` state.

### Session effectivenessScore

Float in range [0, 1]. A scalar quality signal for a session's output, supplied by the evaluator.

- Stored as `text` in the DB (converting float → string at write time, parseFloat at read time) to avoid floating-point drift in the column type. See @lore AC1 S-1 in `packages/db/src/schema.ts`.
- Null means the session has not been evaluated.
- Values outside [0, 1] are rejected at the API boundary (Zod `.min(0).max(1)`).

Implementation story: **AC1** — Structured Outcome Fields (`plans/work-packages/TRACK-AC.md`).

### StagedOperation shape (AL7)

**Staged Operation primitive — full spec at `docs/process-layer/staged-operation.md`.**

The irreversible commit verb, frozen and parked un-executed behind a binding `approve` verdict — the one consequence that needs a human, while the agent iterates freely in a reversible draft space (branch / test key / in-app proposal).

**Shipped schema** (`packages/db/src/schema.ts` — `staged_operations` + `operation_outcomes`):

```
// staged_operations table
type StagedOperation = {
  id: string                       // opaque, stable
  reviewMessageId: string          // FK → messages.id — THE dispatch key (C1).
                                   // The verdict resolves this specific message;
                                   // dispatch filters on it. Never dispatch by subjectThreadId.
  subjectThreadId: string          // FK → threads.id — loader/index anchor ONLY
  artifactId: string               // FK → artifacts.id
  consequenceId: string            // the consequence it commits, within a Subject
  capabilityTool: string           // e.g. "stripe", "github", registered tool name
  capabilityHarnessType?: string   // null = built-in registry
  operation: string                // the verb/call, e.g. "merge_pr"
  params: string                   // JSON; fully-bound, IMMUTABLE once staged
                                   // (dispatcher JSON.parse()s before calling executeCapability)
  idempotencyKey: string           // UNIQUE (anti-fork guard — prevents two rows for the same key)
                                   // NOT the at-most-once execution guard (that is
                                   // WHERE status='pending' conditional UPDATE in the dispatcher)
  reversibility: string            // undo path, or "irreversible"
  status: string                   // "pending" | "executing" | "executed" | "failed"
                                   // No "held" value stored — non-approving verdict leaves
                                   // the op in "pending". "held" is the conceptual label only.
  stagedByAgentId: string          // FK → users.id
  createdAt: string
}

// operation_outcomes table
// PK = stagedOperationId — enforces 0..1 per staged op and immutability.
// A second write throws on PK conflict rather than overwriting.
type OperationOutcome = {
  stagedOperationId: string        // PK — 0..1 per staged op, immutable once written
  status: string                   // "ok" | "failed"
  payload: string | null           // JSON tool return on ok (dispatcher stringifies)
  error: string | null             // verbatim error on failed — never null+failed
  executedAt: string               // ISO 8601; humanized by the reviews loader before response
}
```

**Shared types** (`packages/shared/src/staged-operation.ts`):

```ts
const STAGED_OPERATION_STATUSES = ["pending", "executing", "executed", "failed"] as const;
type StagedOperationStatus = (typeof STAGED_OPERATION_STATUSES)[number];

const OPERATION_OUTCOME_STATUSES = ["ok", "failed"] as const;
type OperationOutcomeStatus = (typeof OPERATION_OUTCOME_STATUSES)[number];

// Passed to executeCapability — params is already Record<string,unknown> (JSON-parsed by dispatcher)
interface StagedOperationSpec {
  id: string;
  capabilityTool: string;
  operation: string;
  params: Record<string, unknown>;
  idempotencyKey: string;  // forwarded to external tool so it dedupes on its side (W1)
  reversibility: string;
}
```

**Reviews loader response shape** (`StagedOperationView`, nested on the artifact):

```ts
// Nested as artifact.stagedOperation for action_operation kind artifacts
type StagedOperationView = {
  stagedOperationId: string
  status: StagedOperationStatus
  outcome?: {
    status: 'ok' | 'failed'
    receipt?: string    // ok: extracted tool-identity string (e.g. "abc1234… · merged")
    error?: string      // failed: verbatim, un-truncated
    executedAt: string  // humanized relative string ("2 min ago") — never raw ISO
  }
}
```

- **Every approve fires ≥1 consequence** (internal state move or external tool call) — a review that changes nothing should not exist. A **Staged Operation** is the *irreversible* subset that a human must clear.
- The gate keys on **reversibility, not familiarity** (ETHOS §3) — reversible consequences flow per the agent's earned trust signal (verdict-history approval rate); unknown-but-reversible is not gated.
- **Capability split:** the agent never holds the live commit verb / credential — it is Kernel-held, provisioned to the agent only in draft form. Enforced by provisioning + sandbox + interception, not agent self-policing.
- The trust signal is the agent's **verdict-history approval rate**, evaluated by the policy engine (`packages/fabric/src/services/policy-engine.ts`) against global thresholds with cold-start protection — NOT a per-tool allowlist/risk-table matrix, and NOT the per-skill autonomy ladder (removed by AD4; vestige removed by AL9). Irreversible consequences stay gated regardless of trust. AL7 ships only the gated arm; reversible auto-flow is AL8.
- At-most-once is enforced by a persisted conditional transition on `status` (mirroring first-verdict-wins `WHERE resolvedAt IS NULL` in `threads.ts`), **independent of the at-least-once event bus**.
- `idempotencyKey UNIQUE` is an **anti-fork guard** (prevents two rows for the same key), NOT the at-most-once execution guarantee (that is the `WHERE status='pending'` conditional UPDATE claim).
- The `approve` verdict fires **all** of its Subject's consequences (verdict resolves the whole Subject); grammar unchanged. HyperIdle triggers; the connected tool/MCP executes (trigger-not-executor).
- **Per-agent capability provisioning is deferred to AL8/AM2** — `KERNEL_DISPATCHABLE_CAPABILITIES` is the current kernel-held-verb gate (validates capability at stage time); per-agent grants and the OPEN-vocab harness descriptor lookup land in those follow-on workpackages.

Implementation story: **AL7** — Review execution loop (`.pipeline/work-packages/TRACK-AL.md`).
