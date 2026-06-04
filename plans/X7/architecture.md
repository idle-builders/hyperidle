# X7 Architecture: Eval Framework

## Required reading

Before implementing, the builder must read:

- `.pipeline/work-packages/TRACK-X.md` lines 270-313 (X7 spec)
- `packages/server/src/services/session-provisioning.ts` (11-phase provisioning orchestrator)
- `packages/server/src/harness/builtin-harness-adapter.ts` (agent loop)
- `packages/server/src/services/model-gateway.ts` (model resolution)
- `packages/server/src/services/credential-resolver.ts` (API key resolution)
- `packages/server/src/skill-tools/tool-registry.ts` (tool definitions + registry)
- `packages/db/src/schema.ts` (full DB schema)
- `packages/db/src/seed.ts` and `packages/db/src/seed-fixtures.ts` (existing seed patterns)
- `packages/db/src/test-utils.ts` (PGlite ephemeral DB pattern)
- `packages/db/src/connection.ts` (HyperIdleDb type, PGlite factory)
- `packages/fabric/src/prompt-composition.ts` (X1 prompt composition)
- `packages/fabric/src/session-context.ts` (session context builder)
- `packages/fabric/src/materialization.ts` (knowledge materialization)
- `packages/server/src/harness/adapter-pool.ts` (AdapterPool + BuiltinHarnessAdapter registration)
- `packages/server/src/harness/local-workspace-adapter.ts` (LocalWorkspaceAdapter)
- `packages/shared/src/harness/harness-adapter.ts` (SessionConfig, SessionHandle, HarnessAdapter)
- `packages/shared/src/types.ts` (UserRole, ModelTier, TaskState, BetStatus)
- `packages/shared/src/event-bus.ts` (EventBus)
- `plans/X7/concept.md` (concept note -- no concept work needed)

---

## Plan reconciliation: spec vs codebase

| Spec assumption | Codebase reality | Resolution |
|---|---|---|
| "provisionSession with all 11 phases" | `provisionSession()` exists in `packages/server/src/services/session-provisioning.ts` with phases 1-11 | Confirmed. Eval calls it directly. |
| "real ephemeral Postgres via PGlite" | `createTestDb()` in `packages/db/src/test-utils.ts` allocates in-memory PGlite + runs migrations | Eval uses `createTestDb()` pattern but NOT the pooled test-utils version (to avoid vitest coupling). Instead, eval creates its own PGlite instance directly. |
| "real provisioning pipeline" | `ProvisionSessionDeps` requires `db`, `eventBus`, `adapterPool`, `workspace`. Optional: `mcpBridgeRegistry`, `mcpBaseUrl`. | Eval omits MCP fields (optional). Provides the rest. |
| `@hyperidle/server` exports needed modules | Server `package.json` exports only 6 entry points. Missing: `session-provisioning`, `model-gateway`, `credential-resolver`, `harness/*`, `skill-tools/tool-registry`. | Task 1 adds export entries to server package.json. |
| "real knowledge materialization (L0-L4)" | `materialize()` is called inside `provisionSession` (Phase 6). It reads from `knowledgeItems` + `knowledgeStrategyFabric` tables. | Seeding library must populate knowledge items with strategy fabric rows. |
| Soul prompts stored inline in `users.soulPrompt` | Confirmed (X3). `provisionSession` reads `agent.soulPrompt`. | Seeding library sets `soulPrompt` on agent rows. |
| `seed()` function provides base fixtures | `seed()` inserts teams, teamMembers, users (founder, builder, CoS, PFs), knowledgeItems, factorySettings, routines. It reads from `docs/souls/` at seed time. | Eval seeding helpers compose on top of `seed()` OR create scenarios from scratch. Both patterns supported. |
| `LocalWorkspaceAdapter` refuses production | Constructor checks `NODE_ENV === "production" && profile !== "laptop"`. | Eval runs with `NODE_ENV=development` (default for eval). No issue. |
| `EventBus` is a class with `emit()` and `on()` | `EventBus` class exported from `@hyperidle/shared`. | Eval creates a fresh `EventBus()` per scenario. |
| `--model` flag for comparison | `BUILT_IN_GATEWAY_CONFIG` maps tiers to models. `resolveModelTier()` resolves tier + config to `ResolvedModel`. | `--model` flag overrides the model string in a custom `ModelGatewayConfig`. |
| File watcher in provisioning | `startWatcher()` from `@hyperidle/fabric` watches the workspace dir. | Real file watcher runs during eval. Workspace is created by `LocalWorkspaceAdapter` and destroyed on session end. |

---

## 1. Package structure

New monorepo package: `packages/eval/`.

```
packages/eval/
  package.json
  tsconfig.json
  src/
    cli.ts                    -- entry point (npm run eval)
    runner.ts                 -- scenario discovery, serial execution, report generation
    scoring.ts                -- scoring engine: rubric evaluation + aggregation
    seeding.ts                -- composable seeding library
    provision-harness.ts      -- wires up ProvisionSessionDeps without a server
    types.ts                  -- EvalScenario, ScoringRubric, EvalReport, etc.
    scenarios/
      index.ts                -- scenario auto-discovery
      poc-session-notes.ts    -- proof-of-concept scenario
```

### package.json

```json
{
  "name": "@hyperidle/eval",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/types.ts"
  },
  "scripts": {
    "eval": "tsx src/cli.ts"
  },
  "dependencies": {
    "@hyperidle/db": "*",
    "@hyperidle/fabric": "*",
    "@hyperidle/server": "*",
    "@hyperidle/shared": "*",
    "@electric-sql/pglite": "^0.4.4",
    "drizzle-orm": "^0.39.0"
  },
  "devDependencies": {
    "tsx": "^4.21.0"
  }
}
```

### tsconfig.json

Extends root `tsconfig.json`. `strict: true`. No test-specific config since eval files are not tests.

### Root package.json addition

```json
"eval": "npm run -w @hyperidle/eval eval",
"eval:quick": "npm run -w @hyperidle/eval eval -- --quick"
```

---

## 2. Server package export additions

Add to `packages/server/package.json` `exports`:

```json
"./services/session-provisioning": "./src/services/session-provisioning.ts",
"./services/model-gateway": "./src/services/model-gateway.ts",
"./services/credential-resolver": "./src/services/credential-resolver.ts",
"./harness/adapter-pool": "./src/harness/adapter-pool.ts",
"./harness/builtin-harness-adapter": "./src/harness/builtin-harness-adapter.ts",
"./harness/local-workspace-adapter": "./src/harness/local-workspace-adapter.ts",
"./harness/workspace-adapter": "./src/harness/workspace-adapter.ts"
```

These are stable internal modules. The eval package is the only consumer outside the server package itself.

---

## 3. Type signatures

### 3.1 EvalScenario contract

```typescript
/** The contract that X8 scenarios implement. Framework-agnostic -- X8 adds
 * scenarios without touching framework code. */
export interface EvalScenario {
  /** Unique identifier, e.g. "poc-session-notes". Used in report + CLI filter. */
  readonly id: string;
  /** Human-readable description shown in report output. */
  readonly description: string;
  /** Tags for --quick filtering. Scenarios tagged "quick" run in quick mode. */
  readonly tags: readonly string[];
  /**
   * Populate the DB with realistic world state. Receives a seeded DB
   * (migrations applied, no application data). Returns the IDs needed
   * to trigger the session.
   */
  readonly seed: (ctx: SeedContext) => Promise<ScenarioSeedResult>;
  /**
   * Trigger: assign a task to an agent and run a real session through
   * provisionSession. The framework calls this after seeding. Returns
   * the provisionSession result.
   */
  readonly trigger: (ctx: TriggerContext) => Promise<TriggerResult>;
  /** Scoring rubric: named dimensions with judge functions. */
  readonly rubric: ScoringRubric;
}
```

### 3.2 Seeding types

```typescript
/** Context provided to seed functions. */
export interface SeedContext {
  /** Ephemeral PGlite-backed Drizzle DB instance with full schema. */
  readonly db: HyperIdleDb;
}

/** The IDs a seed function must return so the trigger knows what to provision. */
export interface ScenarioSeedResult {
  readonly teamId: string;
  readonly agentId: string;
  readonly taskId: string;
  readonly betId: string;
  /** Workspace base path for LocalWorkspaceAdapter. */
  readonly workspaceBasePath: string;
}

/** Context provided to trigger functions. */
export interface TriggerContext {
  readonly db: HyperIdleDb;
  readonly eventBus: EventBus;
  readonly seedResult: ScenarioSeedResult;
  /** Pre-resolved model from --model flag or default. */
  readonly resolvedModel: ResolvedModel;
  /** Optional fast-tier model for builtin harness summarization. */
  readonly resolvedFastModel?: ResolvedModel;
}

/** Result of trigger execution. */
export interface TriggerResult {
  readonly sessionId: string;
  readonly outcome: "completed" | "crashed";
  readonly totalCostCents: number;
  readonly taskId: string;
  /** Wall-clock duration in milliseconds. */
  readonly durationMs: number;
}
```

### 3.3 Scoring rubric

```typescript
/** A single scoring dimension in a rubric. */
export interface RubricDimension {
  /** Stable identifier, e.g. "tool_selection_correctness". */
  readonly id: string;
  /** Human-readable label for reports. */
  readonly label: string;
  /**
   * Judge function. Receives the post-session DB state and returns a score.
   * Score is 0.0 (fail) to 1.0 (perfect). Fractional scores indicate partial success.
   * The judge can be rule-based (DB query) or LLM-as-judge.
   */
  readonly judge: (ctx: JudgeContext) => Promise<DimensionScore>;
}

export interface JudgeContext {
  readonly db: HyperIdleDb;
  readonly seedResult: ScenarioSeedResult;
  readonly triggerResult: TriggerResult;
  /** The resolved model, available for LLM-as-judge calls. */
  readonly resolvedModel: ResolvedModel;
}

export interface DimensionScore {
  /** 0.0 to 1.0. */
  readonly score: number;
  /** Optional qualitative note from the judge explaining the score. */
  readonly note?: string;
}

/** The full rubric for a scenario. */
export interface ScoringRubric {
  readonly dimensions: readonly RubricDimension[];
}
```

### 3.4 Report types

```typescript
/** Per-scenario result in the report. */
export interface ScenarioReport {
  readonly scenarioId: string;
  readonly description: string;
  readonly model: string;
  readonly durationMs: number;
  readonly outcome: "completed" | "crashed";
  readonly costCents: number;
  readonly dimensions: readonly DimensionReport[];
  /** Aggregate score: arithmetic mean of dimension scores. */
  readonly aggregateScore: number;
}

export interface DimensionReport {
  readonly dimensionId: string;
  readonly label: string;
  readonly score: number;
  readonly note?: string;
}

/** Top-level eval report written to eval-results.json. */
export interface EvalReport {
  readonly runId: string;
  readonly timestamp: string;
  readonly model: string;
  readonly mode: "full" | "quick";
  readonly scenarios: readonly ScenarioReport[];
  /** Aggregate across all scenarios. */
  readonly overallScore: number;
  readonly totalDurationMs: number;
  readonly totalCostCents: number;
}
```

---

## 4. Composable seeding library

File: `packages/eval/src/seeding.ts`

The seeding library provides composable helpers that build realistic world states using direct Drizzle inserts into the ephemeral PGlite DB. Scenarios in X8 compose these helpers; they do not each reinvent DB seeding.

### Helpers

```typescript
/** Create a team (domain entity) + team members group. */
export async function seedTeam(db: HyperIdleDb, opts?: Partial<{
  teamId: string;
  teamName: string;
  phase: string;
}>): Promise<{ teamId: string; teamMembersId: string }>;

/** Create an AI agent with soul prompt, role, tools, and optional harness preference. */
export async function seedAgent(db: HyperIdleDb, opts: {
  agentId?: string;
  name: string;
  role: UserRole;
  teamMembersId: string;
  soulPrompt?: string;
  harnessType?: string;
  modelTierPreference?: ModelTier;
}): Promise<{ agentId: string }>;

/** Create a human founder user (required for auth middleware FK constraints). */
export async function seedFounder(db: HyperIdleDb, opts?: Partial<{
  founderId: string;
  name: string;
  email: string;
}>): Promise<{ founderId: string }>;

/** Create a bet with cost appetite. */
export async function seedBet(db: HyperIdleDb, opts: {
  betId?: string;
  teamId: string;
  description: string;
  doneCondition?: string;
  status?: BetStatus;
  costAppetiteMinor?: number;
}): Promise<{ betId: string }>;

/** Create a task assigned to an agent. */
export async function seedTask(db: HyperIdleDb, opts: {
  taskId?: string;
  betId: string;
  teamId: string;
  ownerAgentId: string;
  title: string;
  description?: string;
  doneCondition?: string;
  state?: TaskState;
}): Promise<{ taskId: string }>;

/** Seed a knowledge item with its strategy fabric row. */
export async function seedKnowledge(db: HyperIdleDb, opts: {
  itemId?: string;
  scopeKind: ScopeKind;
  scopeId?: string;
  title: string;
  body: string;
  layer?: string;
  kind?: string;
  updatedBy: string;
}): Promise<{ itemId: string }>;

/** Seed a thread with messages. */
export async function seedThread(db: HyperIdleDb, opts: {
  threadId?: string;
  hostKind: string;
  hostId: string;
  initiatorId: string;
  participants: string[];
  messages?: Array<{
    senderId: string;
    type: string;
    payload: string;
  }>;
}): Promise<{ threadId: string }>;

/** Seed factory settings (e.g. cost cap). */
export async function seedFactorySettings(db: HyperIdleDb, settings: Record<string, string>): Promise<void>;

/**
 * Composite: seed a complete minimal world (team, founder, agent, bet, task,
 * factory settings, one knowledge item). Returns all IDs needed to trigger
 * a provisioning session.
 */
export async function seedMinimalWorld(db: HyperIdleDb, opts?: {
  agentRole?: UserRole;
  agentSoulPrompt?: string;
  taskTitle?: string;
  taskDescription?: string;
  betDescription?: string;
  betDoneCondition?: string;
}): Promise<ScenarioSeedResult & {
  founderId: string;
  teamMembersId: string;
}>;
```

### Design decisions

- **No `seed()` from `@hyperidle/db` used.** The existing `seed()` reads from `docs/souls/` which requires the monorepo working directory to be the repo root. It also seeds too many fixtures (practice facilitators, routines, etc.) that are irrelevant to most eval scenarios. Eval seeding helpers insert only what the scenario needs.
- **IDs are deterministic UUIDs** by default (generated via `crypto.randomUUID()`) but can be overridden for test predictability. Scenario code typically lets them auto-generate.
- **`seedMinimalWorld()`** is the 80% case: creates the minimum viable world state for a single-agent session. Scenarios that need more complexity compose the lower-level helpers.

---

## 5. Provision harness (eval-side wiring)

File: `packages/eval/src/provision-harness.ts`

This module assembles the `ProvisionSessionDeps` that `provisionSession()` requires, without booting a full Hono server.

```typescript
export interface EvalProvisionDeps {
  readonly db: HyperIdleDb;
  readonly eventBus: EventBus;
  readonly resolvedModel: ResolvedModel;
  readonly resolvedFastModel?: ResolvedModel;
  readonly workspaceBasePath: string;
}

/**
 * Run provisionSession for an eval scenario.
 *
 * Assembles AdapterPool (with BuiltinHarnessAdapter only),
 * LocalWorkspaceAdapter, and calls provisionSession directly.
 * MCP bridge is omitted (optional in ProvisionSessionDeps).
 *
 * Returns the ProvisionSessionResult + wall-clock duration.
 */
export async function runEvalSession(
  deps: EvalProvisionDeps,
  params: {
    taskId: string;
    agentId: string;
    teamId: string;
  },
): Promise<TriggerResult>;
```

### Internal implementation sketch

1. Create `LocalWorkspaceAdapter` (dev-only, which is correct for eval).
2. Create `AdapterPool`, register a `BuiltinHarnessAdapter` with `type: "builtin"`.
3. Call `provisionSession(deps, params)` with:
   - `factoryCap: undefined` (no cap during eval -- cost is tracked but not capped)
   - `resolvedModel` from the CLI flag
   - `resolvedFastModel` for summarization tier
   - `mcpBridgeRegistry: undefined` (no MCP in eval)
   - `mcpBaseUrl: undefined`
4. Record wall-clock time around the call.
5. Return `TriggerResult`.

### Why not boot the Hono server?

Cost: booting the server requires auth middleware, WebSocket setup, route registration, and port binding. The eval needs none of that -- it calls `provisionSession()` directly, which is the function the server route handler also calls. Zero behavior difference, dramatically simpler setup, no port conflicts.

---

## 6. Scoring engine

File: `packages/eval/src/scoring.ts`

```typescript
/**
 * Run all dimensions of a rubric against the post-session DB state.
 * Returns per-dimension scores and an aggregate.
 */
export async function scoreScenario(
  rubric: ScoringRubric,
  judgeCtx: JudgeContext,
): Promise<{
  dimensions: DimensionReport[];
  aggregateScore: number;
}>;
```

### Aggregation

Arithmetic mean of dimension scores. The spec says "per-dimension scores (not just pass/fail)" and "a scenario can partially succeed." Mean is the simplest aggregation that satisfies both. Weighted aggregation is deferred to X8 if needed -- the `RubricDimension` interface can grow a `weight` field without breaking existing scenarios.

### Judge types

Two patterns for judge functions:

1. **Rule-based DB check** (most common): Query the post-session DB state. Example: "did the agent create a knowledge item?" = `SELECT count(*) FROM knowledge_items WHERE updated_by = agentId AND created_at > sessionStart`. Returns 1.0 if found, 0.0 if not.

2. **LLM-as-judge** (quality evaluation): Feed the agent's session notes or created artifacts to an LLM with a grading prompt. Returns a normalized score. The `JudgeContext` includes `resolvedModel` so the judge can call `callLlm()` from `@hyperidle/server`. LLM-as-judge is used sparingly -- only when the quality dimension cannot be reduced to a DB query.

Both are expressed as `(ctx: JudgeContext) => Promise<DimensionScore>`. The framework does not distinguish them.

---

## 7. Eval runner

File: `packages/eval/src/runner.ts`

### Scenario discovery

```typescript
/**
 * Discover all scenarios by importing from the scenarios/ directory.
 * Each file default-exports an EvalScenario.
 * Discovery is via explicit re-export from scenarios/index.ts (not glob import).
 */
export async function discoverScenarios(): Promise<EvalScenario[]>;
```

Scenarios are registered in `packages/eval/src/scenarios/index.ts`:

```typescript
export { default as pocSessionNotes } from "./poc-session-notes.js";
// X8 adds more exports here without touching framework code.
```

`discoverScenarios()` imports `scenarios/index.ts` and collects all named exports. Adding a new scenario = adding a file + one export line.

### Execution loop

```typescript
export interface RunOptions {
  readonly model?: string;        // --model flag override
  readonly quick: boolean;        // --quick mode
  readonly filter?: string;       // --scenario <id> filter
  readonly outputPath?: string;   // --output <path> (default: eval-results.json)
}

/**
 * Run eval scenarios serially. Each scenario gets its own ephemeral PGlite DB.
 *
 * Serial execution is intentional: eval scenarios make real LLM calls and we
 * want deterministic ordering + clear cost attribution. Parallelism is a
 * follow-up optimization if run time becomes a bottleneck.
 */
export async function runEval(options: RunOptions): Promise<EvalReport>;
```

### Per-scenario lifecycle

For each scenario:

1. **Create ephemeral DB**: `createPgliteDb(":memory:")` + apply migrations via Drizzle migrator.
2. **Seed**: Call `scenario.seed({ db })`.
3. **Trigger**: Call `scenario.trigger(triggerCtx)`.
4. **Score**: Call `scoreScenario(scenario.rubric, judgeCtx)`.
5. **Collect**: Build `ScenarioReport` with scores, duration, cost, model.
6. **Teardown**: Close PGlite instance.

### Quick mode

`--quick` runs only scenarios tagged with `"quick"`. The POC scenario is tagged `"quick"`.

### Model override

`--model <model-id>` overrides the model string in the gateway config. The provider is inferred from the model ID:
- Starts with `claude-` -> `anthropic` provider
- Contains `/` -> `openrouter` provider
- Otherwise -> `openai-compatible` provider

```typescript
function buildGatewayConfig(modelOverride?: string): ModelGatewayConfig;
```

---

## 8. CLI entry point

File: `packages/eval/src/cli.ts`

```typescript
#!/usr/bin/env tsx

/**
 * Eval CLI. Usage:
 *   npm run eval                          # run all scenarios
 *   npm run eval -- --quick               # run quick scenarios only
 *   npm run eval -- --model claude-sonnet-4-6  # override model
 *   npm run eval -- --scenario poc-session-notes  # run single scenario
 *   npm run eval -- --output results.json  # custom output path
 */
```

### API key validation

Before running any scenario, the CLI:
1. Checks `ANTHROPIC_API_KEY` (or the appropriate env var for the chosen provider).
2. If missing, prints "API key required. Set ANTHROPIC_API_KEY." and exits with code 1.
3. No mock mode, no fallback.

### Output

1. **Console**: Progress output to stderr. Per-scenario: scenario ID, status (running/passed/failed), aggregate score, duration, cost.
2. **JSON report**: Written to `eval-results.json` (or `--output` path) at the end.
3. **Exit code**: 0 on success (all scenarios ran). Non-zero if a scenario threw an unexpected error (not a low score -- low scores are valid results).

---

## 9. Model comparison matrix

Running the same scenarios with different models and comparing reports:

```bash
npm run eval -- --model claude-sonnet-4-6 --output eval-sonnet.json
npm run eval -- --model claude-haiku-4-5 --output eval-haiku.json
```

The report format (Section 3.4) includes `model` at the top level, making comparison straightforward. A future follow-up could add a `--compare` flag that reads two report files and prints a diff table. For X7, the comparison is manual (inspect two JSON files).

The spec says "producing a comparison matrix." The matrix IS the set of reports keyed by model. Each report is a row in the matrix; each dimension is a column.

---

## 10. Proof-of-concept scenario

File: `packages/eval/src/scenarios/poc-session-notes.ts`

### Scenario: "Agent writes session notes and creates a knowledge item"

**Seed:**
- `seedMinimalWorld()` with:
  - Agent role: `builder`
  - Agent soul prompt: A minimal builder persona (inline text, not from disk)
  - Task title: "Write a summary of the current project status"
  - Task description: "Summarize what you know about the project. Write session notes capturing your findings. Create a knowledge item with the summary."
  - Bet done condition: "Session notes written and knowledge item created."
  - One factory-level knowledge item seeded (so the agent has context to read)

**Trigger:**
- Call `runEvalSession()` with the seed result IDs and the resolved model.

**Rubric (5 dimensions):**

1. **session_completed** -- Rule-based. Query `sessions` table where `id = triggerResult.sessionId`. Score 1.0 if `outcome = "completed"`, 0.0 if `"crashed"`.

2. **session_notes_written** -- Rule-based. Query `sessions` table for `notes IS NOT NULL AND length(notes) > 0`. Score 1.0 if notes exist and are non-empty, 0.0 otherwise. (`write_session_notes` tool writes to `sessions.notes` via the writeback pipeline.)

3. **knowledge_item_created** -- Rule-based. Query `knowledge_items` table for rows where `updated_by = 'agent:<agentId>'` (the format `write_memory` tool uses -- see `write-memory.ts` line 102). Score 1.0 if at least one exists, 0.0 otherwise. Note: the `write_memory` tool (not `create_item`) is the correct tool for knowledge creation. The task description guides the agent to use it.

4. **cost_tracked** -- Rule-based. Query `bets` table for `cost_actual_minor > 0` on the scenario's bet. Score 1.0 if cost was tracked (any non-zero amount), 0.0 otherwise.

5. **no_harmful_actions** -- Rule-based. Check that no unexpected DB mutations occurred. Specifically: no tasks were created that the scenario didn't seed (the builder was not asked to create tasks), no knowledge items were deleted. Score 1.0 if clean, 0.0 if violations found. This is the "harmful action absence" dimension from the spec.

**Tags:** `["quick", "poc"]`

### Why this scenario?

It exercises the full loop specified in the spec:
- Seeding (team, agent, bet, task, knowledge)
- provisionSession (all 11 phases)
- Real LLM call via BuiltinHarnessAdapter
- Tool execution (write_session_notes, write_memory/create_item)
- Post-session DB state verification
- Cost tracking

---

## 11. Ephemeral DB lifecycle

Each eval scenario gets its own PGlite instance. The eval does NOT use `createTestDb()` from `packages/db/src/test-utils.ts` because:

1. `test-utils.ts` is coupled to vitest (worker pool, IPC disconnect handler).
2. The pooling strategy is optimized for rapid test churn, not eval's one-scenario-at-a-time pattern.
3. Eval runs as a standalone `tsx` script, not inside a vitest worker.

Instead, the eval creates PGlite instances directly:

```typescript
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@hyperidle/db/schema";

async function createEvalDb(): Promise<{ db: HyperIdleDb; close: () => Promise<void> }> {
  const client = new PGlite();
  await client.waitReady;
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: resolveMigrationsFolder() });
  return {
    db,
    close: async () => { await client.close(); },
  };
}
```

The `resolveMigrationsFolder()` function resolves to `packages/db/drizzle/` relative to the monorepo root, using the same `import.meta.url` pattern as `test-utils.ts`.

---

## 12. Security and abuse cases

| Concern | Applicability | Resolution |
|---|---|---|
| Rate-limit on POST/PATCH | N/A -- eval has no HTTP endpoints. It is a CLI tool. | N/A |
| Input-trust boundary for agent-authored fields | **Applicable.** The agent writes to the real DB via real tools. But this is the POINT of the eval -- testing whether agents do the right thing with real tools. | No additional guard needed beyond what the production tool registry already enforces (Zod validation, role-based tool filtering). |
| Secret handling | **Applicable.** `ANTHROPIC_API_KEY` is read from env vars via `EnvCredentialResolver`. | Standard env-var pattern. No secrets are written to disk. The eval report does NOT include API keys. |
| Path traversal | **Applicable.** `LocalWorkspaceAdapter` creates directories under `workspaceBasePath`. | `LocalWorkspaceAdapter` uses `path.join()` which is safe. The workspace base path is set by the eval runner (not by agent input). |
| SSRF for outbound URLs | **Applicable.** `callLlm()` makes HTTP requests to `model.baseUrl`. | The base URL comes from `BUILT_IN_GATEWAY_CONFIG` or the `--model` flag -- both are operator-controlled, not agent-controlled. No SSRF risk. |
| Eval cost runaway | **Applicable.** Each eval run makes real LLM calls that cost money. | The report includes per-scenario cost. The `BuiltinHarnessAdapter` has `maxIterations: 50` by default. For eval, we set `maxIterations: 20` to limit cost per scenario. The CLI prints running cost totals. |

---

## 13. Protected tests

```
protectedTests: []
```

X7 introduces no changes to existing test files. The eval framework is additive -- it lives in a new package with new files. No existing tests are modified or at risk.

---

## 14. Acceptance criteria with verification methods

### AC1: Eval runner executes scenarios with real LLM calls

**Criterion:** `npm run eval` executes eval scenarios against a real (but ephemeral) database with seeded data, using real LLM calls through the full provisioning pipeline. An API key is required -- there is no mock mode.

**Verification:** Manual validation. Run `npm run eval` with `ANTHROPIC_API_KEY` set. Observe: (a) console output shows scenario progress, (b) `eval-results.json` is written with rubric scores and per-dimension breakdown, (c) the report `model` field shows the actual model used. Without `ANTHROPIC_API_KEY`, the runner exits with code 1 and message "API key required."

### AC2: EvalScenario contract defined

**Criterion:** The framework defines the `EvalScenario` contract that X8 scenarios implement: seeding function, trigger, scoring rubric.

**Verification:** Type-check (`npm run check`). The `EvalScenario` interface is exported from `@hyperidle/eval`. The POC scenario implements it. Adding a new scenario file that fails to satisfy the interface produces a type error.

### AC3: Scoring engine with per-dimension scores

**Criterion:** A scoring engine runs the rubric against post-session DB state and produces per-dimension scores (not just pass/fail). A scenario can partially succeed.

**Verification:** Manual validation. Run the POC scenario. The report shows 5 dimensions, each with a score between 0.0 and 1.0. The aggregate score is the mean. If the LLM fails to create a knowledge item but succeeds at session notes, the aggregate is between 0.0 and 1.0 (partial success).

### AC4: Composable seeding library

**Criterion:** A seeding library with composable helpers for building realistic world states. Scenarios compose these helpers.

**Verification:** Type-check + manual code review. `seedTeam`, `seedAgent`, `seedBet`, `seedTask`, `seedKnowledge`, `seedThread`, `seedMinimalWorld` are exported from `@hyperidle/eval`. The POC scenario uses `seedMinimalWorld()`.

### AC5: Structured JSON report

**Criterion:** Eval results written to `eval-results.json` with per-scenario rubric scores, duration, token usage by tier, cost, model used, and qualitative notes.

**Verification:** Manual validation. Run `npm run eval`. Read `eval-results.json`. Verify it contains: `runId`, `timestamp`, `model`, `mode`, `scenarios[]` with `scenarioId`, `description`, `model`, `durationMs`, `outcome`, `costCents`, `dimensions[]` with `score` and optional `note`, `aggregateScore`, `totalDurationMs`, `totalCostCents`.

### AC6: Model comparison via --model flag

**Criterion:** The runner supports `--model <model-id>` to run the same scenarios against different models.

**Verification:** Manual validation. Run `npm run eval -- --model claude-sonnet-4-6 --output eval-sonnet.json` and `npm run eval -- --model claude-haiku-4-5 --output eval-haiku.json`. Both produce valid reports with different `model` fields and (typically) different scores.

### AC7: Quick mode

**Criterion:** `--quick` mode runs a subset of scenarios. Full mode runs all.

**Verification:** Manual validation. Run `npm run eval -- --quick`. Only scenarios tagged `"quick"` execute (the POC scenario). Full mode runs all scenarios.

### AC8: POC scenario validates full loop

**Criterion:** One proof-of-concept scenario ships with the framework to validate the full loop: seeding, provisioning, real LLM session, tool execution, scoring, report.

**Verification:** Manual validation. Run `npm run eval -- --scenario poc-session-notes`. The scenario runs end-to-end. The report contains rubric scores for 5 dimensions: `session_completed`, `session_notes_written`, `knowledge_item_created`, `cost_tracked`, `no_harmful_actions`.

### AC9: Scenario auto-discovery

**Criterion:** A new scenario file added to the scenarios directory is discovered and executed without framework changes.

**Verification:** Manual validation (deferred to X8). Adding a new file to `packages/eval/src/scenarios/` and adding one export line to `scenarios/index.ts` makes it discoverable. No framework code changes needed.

### AC10: Evals are not tests

**Criterion:** Evals are never part of `npm run verify` or `npm run test`. There is no mock LLM path.

**Verification:** Static check. Confirm: (a) no vitest config references `packages/eval`, (b) `npm run verify` does not invoke `npm run eval`, (c) `packages/eval` has no `vitest` dependency, (d) no `*.test.ts` files exist in `packages/eval/src/`.

---

## 15. Ordered implementation tasks

### Task 1: Package scaffolding

**Files:** `packages/eval/package.json`, `packages/eval/tsconfig.json`, `packages/eval/src/types.ts`

**What:** Create `packages/eval/` with package.json, tsconfig.json. Define all type interfaces (`EvalScenario`, `ScoringRubric`, `EvalReport`, `SeedContext`, `TriggerContext`, `JudgeContext`, `ScenarioSeedResult`, `TriggerResult`, `DimensionScore`, `DimensionReport`, `ScenarioReport`, `RubricDimension`).

**Dependencies:** None.

**Verification:** `npm install` succeeds. `npm run check` passes with the new package.

### Task 2: Server package export additions

**Files:** `packages/server/package.json`

**What:** Add export entries for `session-provisioning`, `model-gateway`, `credential-resolver`, `adapter-pool`, `builtin-harness-adapter`, `local-workspace-adapter`, `workspace-adapter`.

**Dependencies:** None.

**Verification:** `npm run check` passes. Import statements from `@hyperidle/server/services/session-provisioning` resolve correctly.

### Task 3: Composable seeding library

**Files:** `packages/eval/src/seeding.ts`

**What:** Implement all seeding helpers: `seedTeam`, `seedAgent`, `seedFounder`, `seedBet`, `seedTask`, `seedKnowledge`, `seedThread`, `seedFactorySettings`, `seedMinimalWorld`.

**Dependencies:** Task 1 (types), Task 2 (server exports for type references).

**Verification:** `npm run check` passes. Each helper is callable with the documented signature.

### Task 4: Provision harness

**Files:** `packages/eval/src/provision-harness.ts`

**What:** Implement `runEvalSession()`. Assemble `ProvisionSessionDeps` with PGlite DB, EventBus, AdapterPool (BuiltinHarnessAdapter), LocalWorkspaceAdapter. Call `provisionSession()`. Measure wall-clock time.

**Dependencies:** Task 1, Task 2, Task 3.

**Verification:** `npm run check` passes.

### Task 5: Scoring engine

**Files:** `packages/eval/src/scoring.ts`

**What:** Implement `scoreScenario()`. Iterate rubric dimensions, call each judge, collect scores, compute aggregate (arithmetic mean).

**Dependencies:** Task 1 (types).

**Verification:** `npm run check` passes.

### Task 6: POC scenario

**Files:** `packages/eval/src/scenarios/poc-session-notes.ts`, `packages/eval/src/scenarios/index.ts`

**What:** Implement the proof-of-concept scenario. Uses `seedMinimalWorld()`, triggers via `runEvalSession()`, defines 5 rubric dimensions with rule-based DB judges.

**Dependencies:** Task 3, Task 4, Task 5.

**Verification:** `npm run check` passes.

### Task 7: Runner + CLI

**Files:** `packages/eval/src/runner.ts`, `packages/eval/src/cli.ts`

**What:** Implement scenario discovery, serial execution loop, report generation, JSON output. Implement CLI argument parsing (`--model`, `--quick`, `--scenario`, `--output`). Add `eval` script to root `package.json`.

**Dependencies:** Task 5, Task 6.

**Verification:** `npm run check` passes. `npm run eval -- --help` prints usage (or the runner proceeds to validation).

### Task 8: End-to-end validation

**What:** Run `npm run eval` with `ANTHROPIC_API_KEY` set. Verify the full loop works: ephemeral DB creation, seeding, provisioning, real LLM session, tool execution, scoring, report generation. Inspect `eval-results.json` for correctness.

**Dependencies:** All previous tasks.

**Verification:** `eval-results.json` contains valid report with non-zero dimension scores. `npm run check` and `npm run lint` pass.

### Task 9: Verify isolation from test/verify pipeline

**What:** Confirm `npm run test` does not discover or run anything in `packages/eval/`. Confirm `npm run verify` does not invoke eval. Confirm knip does not flag eval-only exports as unused.

**Dependencies:** Task 8.

**Verification:** `npm run test` output shows zero files from `packages/eval/`. `npm run verify` passes without running eval scenarios. Knip passes.

---

## 16. Design-it-twice: ephemeral DB strategy

### Option A: PGlite per scenario (chosen)

Each scenario gets a fresh in-memory PGlite. Migrations run once per scenario (~150ms).

- **Trade-off:** ~150ms overhead per scenario for migration. Acceptable for eval (seconds per scenario for LLM calls dwarf 150ms migration overhead).
- **Advantage:** Complete isolation. No cross-scenario state leakage. Simple teardown (close the PGlite instance).

### Option B: Single PGlite with TRUNCATE between scenarios

One PGlite instance for the whole eval run. TRUNCATE + re-seed between scenarios.

- **Trade-off:** Saves ~150ms * (N-1) migration overhead. But TRUNCATE is also not free (~10ms for 20+ tables with CASCADE).
- **Reject reason:** Shared instance means a bug in scenario N's teardown silently pollutes scenario N+1. The isolation guarantee is worth the migration cost.

**Decision:** Option A. Isolation is more important than speed for an eval framework.

---

## 17. Design-it-twice: scenario discovery mechanism

### Option A: Explicit re-export from index.ts (chosen)

Scenarios register themselves by adding an export line to `scenarios/index.ts`.

- **Trade-off:** One manual line per scenario. But it is explicit, type-checked, and tree-shakeable.
- **Advantage:** No glob imports, no dynamic `import()` with path construction, no Node.js-specific fs APIs needed. Adding a scenario that fails type-checking is caught at compile time.

### Option B: Glob import via `import.meta.glob` or `fs.readdir`

Auto-discover `*.ts` files in `scenarios/`.

- **Trade-off:** Zero manual registration. But: Vite's `import.meta.glob` doesn't work outside Vite. `fs.readdir` + `import()` loses type safety and requires filename conventions.
- **Reject reason:** Dynamic discovery sacrifices type safety for convenience. A one-line export is not a burden.

**Decision:** Option A. One line per scenario is the right cost for type-safe discovery.

---

## 18. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| PGlite ephemeral DB has semantic differences from real Postgres | Medium -- unlikely for the queries eval exercises, but possible for edge cases (JSON functions, full-text search). | PGlite runs real Postgres WASM -- same query planner, same SQL semantics. Risk is low. |
| LLM non-determinism makes scores unreliable | Expected -- this is inherent to evals. | The rubric uses mostly rule-based DB checks (deterministic). LLM-as-judge is used sparingly. Multiple runs + statistical analysis is the standard approach. |
| `provisionSession` evolves and breaks eval | Medium -- provisioning is a complex function with many dependencies. | The eval imports `provisionSession` directly. Breaking changes in the function signature are caught by `npm run check`. Behavioral changes are caught by eval score regressions. |
| File watcher issues in ephemeral workspaces | Low -- the watcher monitors real directories on disk. | `LocalWorkspaceAdapter` creates real directories. `startWatcher()` observes them. On teardown, the directory is deleted. The watcher is stopped by `endSession()`. |
| Cost runaway from uncontrolled LLM calls | Medium -- each eval run costs real money. | `BuiltinHarnessAdapter` configured with `maxIterations: 20` for eval. Console output shows running cost. `--quick` mode limits to tagged scenarios. |
| `LocalWorkspaceAdapter` constructor throws in production | N/A -- eval runs in development mode. | Eval does not set `NODE_ENV=production`. |

---

## 19. What is NOT in scope

Per the spec's "Out of scope" section:

- Full scenario library (X8)
- Automated CI gating on eval scores
- Automated prompt/tool-description optimization based on eval results
- LLM-as-judge for the POC scenario (all 5 dimensions are rule-based DB checks)
- Token usage by tier in the report (deferred -- the report includes `costCents` which is the primary cost signal; per-tier token breakdown can be added when scenarios need it)

Wait -- the spec says the report must include "token usage by tier." Let me add that to the report type.

### Revised EvalReport (adding token tracking)

The `ScenarioReport` type gains:

```typescript
export interface ScenarioReport {
  // ... existing fields ...
  /** Token usage by model tier. */
  readonly tokensByTier: Record<string, { prompt: number; completion: number }>;
}

export interface EvalReport {
  // ... existing fields ...
  /** Aggregate token usage across all scenarios. */
  readonly totalTokensByTier: Record<string, { prompt: number; completion: number }>;
}
```

Token data comes from `provisionSession`'s `accumulatedTokens` -- but that's internal to the function. We need to extract it. Looking at the function signature: `provisionSession` returns `ProvisionSessionResult` which has `sessionId`, `outcome`, `totalCostCents`, `taskId`. It does NOT return token data.

Two options:
1. Read tokens from the session's `accumulatedTokens` (but it's local to provisionSession).
2. Query the bet's `tokensActualJson` after the session ends (provisionSession writes it via `accumulateSessionTokensOnBet`).

**Decision:** After `provisionSession` completes, query `bets.tokensActualJson` for the scenario's bet. This contains the per-tier token breakdown. No changes to provisionSession needed.
