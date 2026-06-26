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

### Proposed Call shape (AL7)

**Proposed Call primitive — full spec at `docs/process-layer/staged-operation.md`** (file path kept stable for cross-refs; the noun is **Proposed Call**).

The exact tool call (tool id + verbatim args) an agent **attempted** and HyperIdle **routed to review** when it was irreversible — captured verbatim as the subject a human reviews. **HyperIdle executes nothing of its own**: the agent holds its own credentials and runs its own tools (like a real employee with broad self-permission); on approve HyperIdle re-engages the **agent's own session** so it does the approved work and continues. The review gate is a **collaboration checkpoint on the consequential/irreversible** — carried by the harness's native permission mechanism (ask/allow/deny) as a workflow, not a security boundary — and it **fades as trust grows** (ETHOS §4).

**Schema** (`packages/db/src/schema.ts` — `proposed_calls` + `tailored_grants` + `operation_outcomes`):

```
// proposed_calls table — the captured tool call routed to review
type ProposedCall = {
  id: string                       // opaque, stable
  reviewMessageId: string          // FK → messages.id — the gate (verdict resolves it)
  subjectThreadId: string          // FK → threads.id — loader/index anchor
  artifactId: string               // FK → artifacts.id (action_operation canvas)
  originSessionId: string          // FK → sessions.id — session 1, where the call was attempted
  toolId: string                   // verbatim harness/MCP tool name the agent called
  args: string                     // JSON; verbatim bound args, IMMUTABLE once captured
  identityHash: string             // hash over (toolId, normalized args)
                                   // optional metadata for the arg-pin CONVENIENCE; NOT a guard
  reversibility: string            // "irreversible" | "reversible" (only irreversible captured)
  status: string                   // "captured" | "granted" | "executed" | "failed" | "held"
  stagedByAgentId: string          // FK → the agent that attempted the call
  createdAt: string
  // UNIQUE (originSessionId, identityHash) — capture idempotency (no duplicate Proposed Call)
}

// tailored_grants table — the session-2 workflow scope minted on approve
// Scope = task id + agent id (session 2's id does not exist at compose time).
type TailoredGrant = {
  proposedCallId: string           // PK/FK → proposed_calls.id
  taskScope: string                // tasks.id
  agentScope: string               // agents.id — the same owner resuming
  approvedToolId: string           // the approved op the agent works under
  approvedArgs: string             // JSON; recorded approved args (arg-pin uses these)
  argPinned: boolean               // pin to exact args only where a harness expresses arg-level scope
  identityHash: string | null      // optional, for the arg-pin convenience
  consumed: boolean                // consume-once: single-statement CAS WHERE consumed=false
  retryCount: number               // liveness net (re-provision once on crash/no-show), not a guard
  mintedAt: string
  consumedAt: string | null
}

// operation_outcomes table — written from session 2's real tool return
// PK = proposedCallId — enforces 0..1 per Proposed Call and immutability.
type OperationOutcome = {
  proposedCallId: string           // PK — 0..1 per Proposed Call, immutable once written
  status: string                   // "ok" | "failed"
  receipt: string | null           // JSON/identity tool return on ok
  error: string | null             // verbatim error on failed — never null+failed
  executedAt: string               // ISO 8601; humanized by the reviews loader before response
}
```

**Shared types** (`packages/shared/src/proposed-call.ts`):

```ts
const PROPOSED_CALL_STATUSES = ["captured", "granted", "executed", "failed", "held"] as const;
type ProposedCallStatus = (typeof PROPOSED_CALL_STATUSES)[number];

const REVERSIBILITY = ["irreversible", "reversible"] as const;
type Reversibility = (typeof REVERSIBILITY)[number];

const OPERATION_OUTCOME_STATUSES = ["ok", "failed"] as const;
type OperationOutcomeStatus = (typeof OPERATION_OUTCOME_STATUSES)[number];

interface ProposedCall {
  id: string;
  reviewMessageId: string;   // the gate
  subjectThreadId: string;   // anchor
  artifactId: string;        // action_operation artifact it nests on
  originSessionId: string;   // session 1
  toolId: string;            // verbatim tool name the agent called
  args: Record<string, unknown>; // verbatim input
  identityHash: string;      // optional metadata for the arg-pin convenience; NOT a guard
  reversibility: Reversibility;
  status: ProposedCallStatus;
}
```

**Reviews loader response shape** (nested on the artifact):

```ts
// Nested as artifact.proposedCall for action_operation kind artifacts
type ProposedCallView = {
  proposedCallId: string
  status: ProposedCallStatus
  toolId: string
  args: Record<string, unknown>   // verbatim captured args — rendered as readable key→value
                                  // (the human's approve is grounded in the real call, ETHOS §3)
  outcome?: {
    status: 'ok' | 'failed'
    receipt?: string    // ok: extracted tool-identity string (e.g. "abc1234… · merged")
    error?: string      // failed: verbatim, un-truncated
    executedAt: string  // humanized relative string ("2 min ago") — never raw ISO
  }
}
```

- **Every approve fires ≥1 consequence** (internal state move or external tool call) — a review that changes nothing should not exist. A **Proposed Call** is the *irreversible* subset routed to a human.
- The gate keys on **reversibility, not familiarity** (ETHOS §3) — reversible consequences flow per the agent's earned trust signal (verdict-history approval rate); unknown-but-reversible is not gated. A no-signal tool is classified irreversible **out of care** (surface a consequential-looking call rather than miss one), not out of suspicion of the agent.
- **We trust the agent (ETHOS §4).** Creds are present in the sandbox **and that is correct** — tools and MCP servers need credentials to authenticate. We do **not** withhold credentials, do **not** build "the broker is the only path", and do **not** design against a hypothetical rogue agent. The agent *could* perform an irreversible op with its own creds — we trust it not to route around the collaboration checkpoint, exactly as we trust an employee not to route around a teammate's sign-off.
- **HyperIdle executes nothing of its own.** The agent's own session/tools/creds run the call. HyperIdle classifies, routes-to-review, and records — never authoring, re-implementing, or running a tool from its own process. There is no kernel executor, no `executeCapability` map, and no `executing` state HyperIdle holds.
- **The checkpoint rides the harness's native permission as a workflow.** HyperIdle composes one workflow — route irreversible → review; let reversible flow — and each harness carries it on its own native permission feature (Claude `canUseTool`; Codex native PreToolUse hooks; opencode native `permission` + `serve` `/event`+POST; builtin `registry.invoke` as the uniform record/consume point). All four feasible headlessly (verified June 2026). Not a re-implementation of the harness's permission system, not "the only path."
- **Re-attempting the approved op in session 2 is fine** — we trust the agent intends the approved thing. There is **no exact-hash-match-to-permit and no deadlock machinery**; byte-fidelity survives only as an optional arg-pin convenience where a harness expresses arg-level scope. The `identityHash` is optional metadata for that convenience; nothing gates on it.
- The trust signal is the agent's **verdict-history approval rate**, evaluated by the policy engine (`packages/fabric/src/services/policy-engine.ts`) against global thresholds with cold-start protection — NOT a per-tool allowlist/risk-table matrix, and NOT the per-skill autonomy ladder (removed by AD4; vestige removed by AL9). **The gate fades as trust grows** — more autonomy is the goal. AL7 ships only the gated arm; reversible auto-flow is AL8.
- **Capture idempotency** is the `(originSessionId, identityHash)` UNIQUE constraint (a duplicate routed call mints no second Proposed Call). **At-most-once execution** is the single-statement CAS on the tailored grant (`UPDATE … SET consumed=true … WHERE … AND consumed=false RETURNING *`) — independent of the at-least-once event bus.
- The `approve` verdict composes a **tailored grant** for the Subject's Proposed Call(s) and emits `proposed_call_granted`, re-engaging the agent's session; grammar unchanged. After the approved op returns its Outcome, the agent **continues working** (closes the story / updates docs / proceeds) within that same session-2 run (folded-in AL10).

Implementation story: **AL7** — Review execution loop (`.pipeline/work-packages/TRACK-AL.md`).

## Substrate shape (Track AO)

**Full spec:** `docs/process-layer/substrate-primitive.md`. Concept locked in `plans/AO/concept.md`.

```
// Durable file-like artifacts an agent AUTHORS, attached to an agent within
// a team. Team-scoped. ("Product" not modelled for now.)
type Substrate = {
  id: string             // opaque, stable
  teamId: string         // FK → owning Team (teams.id). The scope. Required.
  agentMemberId?: string // FK → agent-within-a-team (teamMembers.id) it attaches to.
                         //      Primary; null → a team-level (shared) substrate.
  kind: string           // OPEN vocab. Initial: 'code' (git repo) | 'doc_set' (authoring folder).
                         //      Systems of record (inbox/CRM/ticket) are EXCLUDED — they are AN tools.
  connectionId?: string  // OPTIONAL FK → Connection (AN): the account+auth the resource lives in.
                         //      By ref; auth provisioned INTO the sandbox. Null → bare local path.
  resourceRef: string    // which resource of the connection: a repo+branch, a folder path.
  writeback: 'git' | 'file' | 'none'   // how authored changes leave the sandbox
  state: 'attached' | 'reachable' | 'needs_attention'
  createdAt: string
}
```

- **Substrate vs Tool vs Knowledge (research-grounded, `plans/AO/research-substrate-vs-tool.md`).** A substrate is **only** a file-bearing corpus the agent **authors** — materialized into the sandbox, edited, written back with history. **Code repos + document authoring** materialize. **Systems of record** (email/ticket/CRM) are **live tools** (Track AN) — never materialized. **Reference corpora** (drive lookup) are **retrieval** (knowledge fabric). Discriminator: *author a corpus* → substrate; *operate a system of record* → tool; *look something up* → knowledge.
- **Connected like any connector** — account once in Settings = a **Connection** (AN; held token or inherited, **never a HyperIdle OAuth app**); then per-agent select **which resource** (repo/folder) is the substrate. Substrate ⟂ Connection: files vs auth/tools, compose.
- **Agents work *with* their credentials.** The sandbox is provisioned with the agent's inherited Connections/tools/creds (durable-auth→disposable-sandbox, PR #364); the bound Connection's forge auth is present so the agent's own `git`/`gh` push/PR. **No withholding, no broker-only path.** AL7 checkpoints irreversible *landing*, never access.
- **Write-back rides the host** — `git` (commit→push/PR) for code; `file` (last-write + snapshot) for a folder; **no custom sync/conflict engine.** Local-first; forward-only migration.

Implementation stories: **AO1** (substrate model + attach surface), **AO2** (materialization). Concept: `plans/AO/concept.md`.
