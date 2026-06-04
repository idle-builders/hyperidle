# X7 Architecture: E2E Eval Framework

## Overview

X7 adds an eval package (`packages/eval/`) that exercises the full session provisioning pipeline end-to-end: seed DB, compose prompt, build tool registry, start harness, stream events, invoke tools, verify DB outcomes. Evals use the existing `BuiltinHarnessAdapter` interface but replace the real LLM call with a `MockLlmTransport` that returns hand-crafted tool_use responses. When API keys are present, evals optionally run against a real LLM via the model gateway.

The eval runner is a standalone Node script (not Vitest) because evals are fundamentally different from tests: they are long-running, non-deterministic in live mode, produce a structured report artifact, and should never gate `npm run test`. The runner reuses `createTestDb()` from `@hyperidle/db` for ephemeral PGlite databases.

---

## Required reading

Before implementing, the builder must read:

- `packages/server/src/services/session-provisioning.ts` -- the 11-phase orchestrator being exercised
- `packages/server/src/skill-tools/tool-registry.ts` -- tool context, definitions, role filtering
- `packages/server/src/__tests__/session-provisioning.test.ts` -- the `ScriptedHarnessAdapter` pattern being adapted
- `packages/db/src/test-utils.ts` -- `createTestDb()` / `TestDbHandle` reuse
- `packages/shared/src/harness/harness-adapter.ts` -- `SessionConfig`, `HarnessAdapter`, `HarnessEvent` types
- `packages/shared/src/harness/harness-events.ts` -- event discriminated union
- `packages/fabric/src/prompt-composition.ts` -- `composePrompt` input/output
- `packages/fabric/src/session-context.ts` -- `SessionContextData` shape

---

## Phase 0: Interrogation

### Q1: Standalone script vs Vitest?

**Decision: Standalone script.** The spec says "evals are not unit tests." Vitest semantics (parallel workers, `describe`/`it`, coverage, watch mode) don't fit. The eval runner is a serial executor that produces a JSON report. It uses `createTestDb()` for DB lifecycle and `provisionSession()` for the pipeline, but the orchestration is its own script.

**Cost of Vitest:** Vitest parallel workers fight with PGlite WASM allocation. Eval scenarios are intentionally serial (deterministic ordering, shared report). Vitest's reporter would swallow the structured JSON output. Adding evals to `npm run test` would make the test suite flaky in live mode and slow even in mock mode.

**Cost of standalone:** New `packages/eval/` package, own tsconfig, `tsx`-based runner. ~150 lines of runner infrastructure. But it's isolated, doesn't touch the test suite, and the JSON report is the only output contract.

### Q2: Per-scenario or shared DB?

**Decision: Per-scenario ephemeral DB.** Each scenario gets its own `createTestDb()` handle, seeds its own world, runs its session, asserts outcomes, then calls `handle.close()`. Full isolation, no cross-scenario pollution. The PGlite pool makes this cheap (~5ms for a reused instance after first cold start).

### Q3: How does mock LLM work without X6 being implemented?

**Key insight:** X6 (BuiltinHarnessAdapter) is a stub that throws. Evals don't need the real X6 agent loop. Instead, evals build their own `EvalHarnessAdapter` -- a harness that implements `HarnessAdapter`, receives the `SessionConfig`, and replays a scripted sequence of tool_use calls (similar to `ScriptedHarnessAdapter` in session-provisioning tests). The adapter calls `registry.invoke()` directly from its `streamEvents()` implementation, emitting the corresponding `HarnessEvent` objects. This tests the full provisioning + tool + DB path without needing a real LLM or a real agent loop.

For live mode, evals use a `LiveHarnessAdapter` that wraps the actual LLM call with the Anthropic SDK, feeds tool results back, and streams events. This adapter is gated on API key presence.

---

## Plan reconciliation

| Spec assumption | Codebase reality | Resolution |
|----------------|-----------------|------------|
| `createTestDb()` from `@hyperidle/db` | Exists, PGlite-backed, pooled. Exported from `packages/db/src/test-utils.ts` and re-exported from `packages/db/src/index.ts`. | Reuse as-is. |
| `provisionSession()` | Exists at `packages/server/src/services/session-provisioning.ts`. Takes `ProvisionSessionDeps` + `ProvisionSessionParams`. | Evals call this directly. |
| `ScriptedHarnessAdapter` | Exists in `session-provisioning.test.ts` but is NOT exported -- it's a test-local class. | Extract the pattern into `packages/eval/`. Do NOT move or export the test class (it has test-specific hooks like `fileWrites` and `afterFileWrites`). |
| `BuiltinHarnessAdapter` | Stub that throws. X6 not implemented. | Evals use their own `EvalHarnessAdapter`, not the builtin stub. |
| `AdapterPool` | Exists. Requires `register()` with adapter + meta. | Evals create a fresh pool and register the eval adapter. |
| `LocalWorkspaceAdapter` | Exists. Rejects `NODE_ENV=production` for non-laptop profiles. | Evals run in test context (not production). Works as-is. |
| `buildToolRegistry` + `ToolContext` | Exists. Requires `db`, `eventBus`, `agentId`, `sessionId`, `taskId`, `teamId`, `workspacePath`, `watcher`. | The provisioning orchestrator builds this internally. Evals just call `provisionSession()` and let it handle tool registry creation. |
| `composePrompt` | Exists in `@hyperidle/fabric`. Called inside provisioning Phase 8.5. | No direct eval call needed -- provisioning handles it. |
| Tool names: `write_memory`, `write_session_notes`, `create_task`, `send_message`, `submit_review`, `create_artifact`, `handoff_to` | All exist in `packages/server/src/skill-tools/`. | Used in scenario scripts. |
| `sessions.notes` column | Exists. Written by `write_session_notes` handler. | Asserted in knowledge scenario. |
| `knowledgeItems` table | Exists. Written by `write_memory` handler. | Asserted in knowledge scenario. |
| `tasks` table + state machine | Exists. `create_task` inserts in "proposed" state. | Asserted in coordination scenario. |
| `messages` table | Exists. Written by `send_message` handler. | Asserted in coordination scenario. |
| `artifacts` table | Exists. Written by `create_artifact` handler. | Asserted in synthesis scenario. |
| Handoff protocol | Exists at `packages/server/src/services/handoff-protocol.ts`. | Asserted in handoff scenario. |
| Cost cap tracking | `recordCostAndCheck` exists in `@hyperidle/fabric`. `checkCostCap` exists. | Asserted in cost-bounded scenario. |
| No eval-specific DB tables | Confirmed. Schema has no eval tables. | None needed -- evals read existing tables for assertions. |
| `npm run eval` script | Does not exist in `package.json`. | Add to root `package.json`. |

---

## AC-to-implementation mapping

| AC | Implementation | Verification |
|----|---------------|--------------|
| AC1: `npm run eval` executes suite against ephemeral DB | Root script `"eval": "npx tsx packages/eval/src/runner.ts"`, per-scenario `createTestDb()` + seed | Run `npm run eval` -- exits 0, produces `eval-results.json` |
| AC2: Each scenario defines world state, trigger, outcomes, assertion | `EvalScenario` interface with `seed()`, `trigger`, `expectedOutcomes`, `assert()` | Type system + runtime -- scenarios that don't match interface fail to compile |
| AC3a: Knowledge task | `scenarios/knowledge-task.ts` -- seeds agent + task, scripts `write_session_notes` + `write_memory` tool calls | Assert: `knowledgeItems` row exists, `sessions.notes` not null |
| AC3b: Coordination task | `scenarios/coordination-task.ts` -- scripts `create_task` + `send_message` + `submit_review` | Assert: new task row exists, message in thread, review message posted |
| AC3c: Synthesis task | `scenarios/synthesis-task.ts` -- scripts `create_artifact` after reading knowledge | Assert: `artifacts` row exists with correct `kind` |
| AC3d: Handoff task | `scenarios/handoff-task.ts` -- scripts `handoff_to` with `status: "blocked"` | Assert: task `ownerAgentId` changed, audit trail has handoff entry |
| AC3e: Cost-bounded task | `scenarios/cost-bounded-task.ts` -- scripts cost_update events exceeding cap | Assert: session outcome is "completed" (cap checked pre-flight), cost recorded on bet |
| AC4: JSON report | Runner writes `eval-results.json` with per-scenario results | Assert file exists, parse and verify schema |
| AC5: Mock LLM (no API keys) | `EvalHarnessAdapter` replays scripted tool_use responses | All scenarios pass with `ANTHROPIC_API_KEY` unset |
| AC6: Live LLM (with API keys) | `LiveHarnessAdapter` wraps Anthropic SDK, gated by `--live` flag + key presence | Scenarios execute against real API (may fail -- that's informational) |

---

## Package structure

```
packages/eval/
  package.json
  tsconfig.json
  src/
    runner.ts                    -- Entry point: parse args, discover scenarios, execute, write report
    types.ts                     -- EvalScenario, EvalResult, EvalReport interfaces
    eval-harness-adapter.ts      -- Mock harness: replays scripted tool calls through registry
    live-harness-adapter.ts      -- Live harness: real LLM calls (Anthropic SDK)
    seed.ts                      -- Shared seed helpers (team, agent, bet, task, knowledge)
    report.ts                    -- JSON report writer
    scenarios/
      index.ts                   -- Exports all scenarios as an array
      knowledge-task.ts          -- Scenario 1
      coordination-task.ts       -- Scenario 2
      synthesis-task.ts          -- Scenario 3
      handoff-task.ts            -- Scenario 4
      cost-bounded-task.ts       -- Scenario 5
```

### package.json

```json
{
  "name": "@hyperidle/eval",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "dependencies": {
    "@hyperidle/db": "*",
    "@hyperidle/server": "*",
    "@hyperidle/shared": "*",
    "@hyperidle/fabric": "*"
  }
}
```

### tsconfig.json

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "composite": true
  },
  "include": ["src"],
  "references": [
    { "path": "../shared" },
    { "path": "../db" },
    { "path": "../server" },
    { "path": "../fabric" }
  ]
}
```

Root `package.json` additions:

```json
{
  "scripts": {
    "eval": "npx tsx packages/eval/src/runner.ts"
  }
}
```

Root `tsconfig.json` additions:

```json
{
  "paths": {
    "@hyperidle/eval": ["./packages/eval/src"]
  },
  "references": [
    { "path": "packages/eval" }
  ]
}
```

Root `vitest.config.ts`: Do NOT add `packages/eval` to the projects list. Evals are not tests.

---

## Type definitions

### `packages/eval/src/types.ts`

```typescript
/** A scripted tool call the mock harness will execute. */
export interface ScriptedToolCall {
  readonly toolName: string;
  readonly args: Record<string, unknown>;
}

/** A scripted LLM turn: zero or more tool calls, then an optional text completion. */
export interface ScriptedTurn {
  readonly toolCalls: readonly ScriptedToolCall[];
  readonly completion?: string;
  /** Cost delta in dollars for this turn (used to emit cost_update events). */
  readonly costDelta?: number;
}

/** The script the mock harness replays. */
export interface HarnessScript {
  readonly turns: readonly ScriptedTurn[];
}

/** Seed data for an eval scenario's world state. */
export interface EvalSeedData {
  readonly team: {
    readonly id: string;
    readonly name: string;
  };
  readonly teamMember: {
    readonly id: string;
  };
  readonly agents: readonly {
    readonly id: string;
    readonly name: string;
    readonly role: string;
    readonly soulPrompt?: string;
    readonly costCapMinor?: number;
  }[];
  readonly bet: {
    readonly id: string;
    readonly description: string;
    readonly costAppetiteMinor?: number;
  };
  readonly tasks: readonly {
    readonly id: string;
    readonly title: string;
    readonly description?: string;
    readonly state: string;
    readonly ownerAgentId?: string;
  }[];
  readonly knowledgeItems?: readonly {
    readonly id: string;
    readonly title: string;
    readonly body: string;
    readonly scopeKind?: string;
    readonly scopeId?: string;
  }[];
}

/** Which agent and task triggers the session. */
export interface EvalTrigger {
  readonly agentId: string;
  readonly taskId: string;
  /** Override model tier for this scenario. */
  readonly modelTier?: import("@hyperidle/shared").ModelTier;
}

/** A single eval scenario. */
export interface EvalScenario {
  /** Unique scenario identifier (e.g., "knowledge-task"). */
  readonly id: string;
  /** Human-readable scenario name. */
  readonly name: string;
  /** Description of what this scenario tests. */
  readonly description: string;
  /** Seed data inserted before the session runs. */
  readonly seed: EvalSeedData;
  /** Which agent/task triggers the session. */
  readonly trigger: EvalTrigger;
  /** The scripted harness responses (mock mode only). */
  readonly script: HarnessScript;
  /** Assert expected outcomes against the DB after session completes. */
  readonly assert: (ctx: AssertionContext) => Promise<void>;
}

/** Context passed to the scenario's assert function. */
export interface AssertionContext {
  readonly db: import("@hyperidle/db").HyperIdleDb;
  readonly sessionResult: import("../../../server/src/services/session-provisioning.js").ProvisionSessionResult;
  readonly events: readonly import("@hyperidle/shared").HarnessEvent[];
}

/** Result of a single scenario run. */
export interface EvalScenarioResult {
  readonly scenarioId: string;
  readonly scenarioName: string;
  readonly passed: boolean;
  readonly durationMs: number;
  readonly costCents: number;
  readonly mode: "mock" | "live";
  readonly failure?: {
    readonly message: string;
    readonly stack?: string;
  };
}

/** The full eval report. */
export interface EvalReport {
  readonly timestamp: string;
  readonly mode: "mock" | "live";
  readonly scenarios: readonly EvalScenarioResult[];
  readonly summary: {
    readonly total: number;
    readonly passed: number;
    readonly failed: number;
    readonly totalDurationMs: number;
    readonly totalCostCents: number;
  };
}
```

---

## EvalHarnessAdapter (mock mode)

The mock harness replays scripted turns. Each turn executes tool calls via the provisioning orchestrator's event-stream interception path (the adapter emits `tool_call` events, and `provisionSession`'s Phase 10 loop dispatches them to `registry.invoke()`).

```typescript
// packages/eval/src/eval-harness-adapter.ts

import type {
  HarnessAdapter,
  HarnessCapabilities,
  HarnessEvent,
  SessionConfig,
  SessionHandle,
  SessionResult,
} from "@hyperidle/shared";
import type { HarnessScript } from "./types.js";

export class EvalHarnessAdapter implements HarnessAdapter {
  private readonly script: HarnessScript;
  private capturedConfig: SessionConfig | null = null;
  private nextId = 1;

  constructor(script: HarnessScript) {
    this.script = script;
  }

  async startSession(config: SessionConfig): Promise<SessionHandle> {
    this.capturedConfig = config;
    return { sessionId: `eval-session-${this.nextId++}` };
  }

  async *streamEvents(_handle: SessionHandle): AsyncGenerator<HarnessEvent> {
    for (const turn of this.script.turns) {
      // Emit tool_call events for each scripted tool call.
      // The provisioning orchestrator's Phase 10 intercepts these and
      // dispatches to registry.invoke().
      for (const tc of turn.toolCalls) {
        yield {
          type: "tool_call",
          toolName: tc.toolName,
          args: tc.args,
        };
      }

      // Emit cost_update if specified.
      if (turn.costDelta !== undefined && turn.costDelta > 0) {
        yield {
          type: "cost_update",
          totalCost: turn.costDelta,
          deltaCost: turn.costDelta,
        };
      }

      // Emit completion text if specified.
      if (turn.completion) {
        yield {
          type: "completion",
          text: turn.completion,
        };
      }
    }
  }

  async stopSession(_handle: SessionHandle): Promise<SessionResult> {
    return {
      outcome: "completed",
      cost: { minor: 0, currency: "USD" },
      tokenUsage: { byTier: {} },
    };
  }

  getCapabilities(): HarnessCapabilities {
    return {
      preCompactionTrigger: false,
      subAgents: false,
      modelProviders: ["anthropic"],
      mcpSupport: false,
    };
  }
}
```

**Key design choice:** The eval adapter emits `tool_call` events with `mcpSupport: false`. This means `provisionSession`'s Phase 10 intercepts and dispatches them to `registry.invoke()` -- exercising the full tool execution path including Zod validation, DB writes, and event emission. This is the same code path a real session uses when MCP is not available.

---

## LiveHarnessAdapter (live mode)

The live adapter wraps the Anthropic Messages API directly, feeding tool results back in a multi-turn loop.

```typescript
// packages/eval/src/live-harness-adapter.ts
// Implementation sketch -- full implementation in build phase

import type {
  HarnessAdapter,
  HarnessCapabilities,
  HarnessEvent,
  SessionConfig,
  SessionHandle,
  SessionResult,
} from "@hyperidle/shared";

/**
 * Live harness adapter that makes real LLM calls via the Anthropic SDK.
 * Gated on ANTHROPIC_API_KEY presence. Used only with `--live` flag.
 *
 * The adapter:
 * 1. Sends the composed prompt + tool definitions to the Anthropic API.
 * 2. When the model responds with tool_use blocks, yields tool_call events.
 * 3. Collects tool results from the provisioning orchestrator's registry.invoke().
 * 4. Feeds tool results back to the model in the next turn.
 * 5. Repeats until the model sends a stop_reason="end_turn" without tool_use.
 * 6. Yields cost_update events based on API usage headers.
 *
 * Max turns: 20 (safety rail for eval scenarios -- real sessions use 50).
 */
export class LiveHarnessAdapter implements HarnessAdapter {
  // ... API key injected via constructor
  // ... Uses @anthropic-ai/sdk for API calls
  // ... Tool definitions derived from SessionConfig.tools + toClaudeToolSpecs()
}
```

The live adapter requires the `@anthropic-ai/sdk` package. This is added as an **optional** dependency of `@hyperidle/eval` and dynamically imported only when `--live` is passed.

---

## Runner infrastructure

### `packages/eval/src/runner.ts`

```typescript
// Entry point: npx tsx packages/eval/src/runner.ts [--live] [--scenario <id>]

import { createTestDb } from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import { AdapterPool } from "@hyperidle/server/harness/adapter-pool.js";
import { LocalWorkspaceAdapter } from "@hyperidle/server/harness/local-workspace-adapter.js";
import { provisionSession } from "@hyperidle/server/services/session-provisioning.js";
import { allScenarios } from "./scenarios/index.js";
import { EvalHarnessAdapter } from "./eval-harness-adapter.js";
import { seedWorld } from "./seed.js";
import { writeReport } from "./report.js";
import type { EvalReport, EvalScenarioResult } from "./types.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const live = args.includes("--live");
  const scenarioFilter = args.includes("--scenario")
    ? args[args.indexOf("--scenario") + 1]
    : undefined;

  // Gate live mode on API key presence.
  if (live && !process.env.ANTHROPIC_API_KEY && !process.env.OPENROUTER_API_KEY) {
    console.error("--live requires ANTHROPIC_API_KEY or OPENROUTER_API_KEY");
    process.exit(1);
  }

  const scenarios = scenarioFilter
    ? allScenarios.filter((s) => s.id === scenarioFilter)
    : allScenarios;

  if (scenarios.length === 0) {
    console.error(`No scenarios found${scenarioFilter ? ` matching "${scenarioFilter}"` : ""}`);
    process.exit(1);
  }

  const results: EvalScenarioResult[] = [];

  for (const scenario of scenarios) {
    const result = await runScenario(scenario, live);
    results.push(result);
    const icon = result.passed ? "PASS" : "FAIL";
    console.log(`[${icon}] ${scenario.name} (${result.durationMs}ms)`);
    if (result.failure) {
      console.log(`       ${result.failure.message}`);
    }
  }

  const report: EvalReport = {
    timestamp: new Date().toISOString(),
    mode: live ? "live" : "mock",
    scenarios: results,
    summary: {
      total: results.length,
      passed: results.filter((r) => r.passed).length,
      failed: results.filter((r) => !r.passed).length,
      totalDurationMs: results.reduce((sum, r) => sum + r.durationMs, 0),
      totalCostCents: results.reduce((sum, r) => sum + r.costCents, 0),
    },
  };

  writeReport(report);

  const exitCode = report.summary.failed > 0 ? 1 : 0;
  process.exit(exitCode);
}

async function runScenario(
  scenario: EvalScenario,
  live: boolean,
): Promise<EvalScenarioResult> {
  const start = Date.now();
  const handle = await createTestDb();

  try {
    // 1. Seed the world.
    await seedWorld(handle.db, scenario.seed);

    // 2. Create adapter.
    const adapter = live
      ? await createLiveAdapter()
      : new EvalHarnessAdapter(scenario.script);

    // 3. Build deps.
    const eventBus = new EventBus();
    const pool = new AdapterPool();
    pool.register("eval", adapter, {
      name: "eval-adapter",
      kind: "local",
      modelProviders: ["anthropic"],
      maxConcurrent: 1,
    });

    const tmpDir = await import("node:os").then((os) => os.tmpdir());
    const workspace = new LocalWorkspaceAdapter();

    const deps: ProvisionSessionDeps = {
      db: handle.db,
      eventBus,
      adapterPool: pool,
      workspace,
    };

    // 4. Run the session.
    const sessionResult = await provisionSession(deps, {
      taskId: scenario.trigger.taskId,
      agentId: scenario.trigger.agentId,
      productId: scenario.seed.team.id,
      workspaceBasePath: path.join(tmpDir, "hyperidle-eval"),
      modelTier: scenario.trigger.modelTier,
    });

    // 5. Assert outcomes.
    await scenario.assert({
      db: handle.db,
      sessionResult,
      events: [], // Events captured via eventBus listeners in future iteration
    });

    return {
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      passed: true,
      durationMs: Date.now() - start,
      costCents: sessionResult.totalCostCents,
      mode: live ? "live" : "mock",
    };
  } catch (error) {
    return {
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      passed: false,
      durationMs: Date.now() - start,
      costCents: 0,
      mode: live ? "live" : "mock",
      failure: {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
    };
  } finally {
    await handle.close();
  }
}
```

---

## Seed helpers

### `packages/eval/src/seed.ts`

```typescript
import {
  bets,
  type HyperIdleDb,
  knowledgeItems,
  tasks,
  teamMembers,
  teams,
  users,
} from "@hyperidle/db";
import type { EvalSeedData } from "./types.js";

const NOW = "2026-06-01T00:00:00.000Z";

export async function seedWorld(db: HyperIdleDb, seed: EvalSeedData): Promise<void> {
  // Team
  await db.insert(teams).values({
    id: seed.team.id,
    name: seed.team.name,
    phase: "build",
    createdAt: NOW,
  });

  // Team member group (1:1 with team)
  await db.insert(teamMembers).values({
    id: seed.teamMember.id,
    teamId: seed.team.id,
    capacity: 10,
    activeBets: 1,
    formedAt: NOW,
  });

  // Agents
  for (const agent of seed.agents) {
    await db.insert(users).values({
      id: agent.id,
      name: agent.name,
      role: agent.role,
      status: "active",
      teamId: seed.teamMember.id,
      maxConcurrentSessions: 1,
      createdAt: NOW,
      soulPrompt: agent.soulPrompt ?? null,
      costCapMinor: agent.costCapMinor ?? null,
    });
  }

  // Bet
  await db.insert(bets).values({
    id: seed.bet.id,
    teamId: seed.team.id,
    description: seed.bet.description,
    status: "active",
    createdAt: NOW,
    costAppetiteMinor: seed.bet.costAppetiteMinor ?? null,
  });

  // Tasks
  for (const task of seed.tasks) {
    await db.insert(tasks).values({
      id: task.id,
      betId: seed.bet.id,
      teamId: seed.team.id,
      title: task.title,
      description: task.description ?? null,
      state: task.state,
      ownerAgentId: task.ownerAgentId ?? seed.agents[0]?.id ?? null,
      createdAt: NOW,
      updatedAt: NOW,
    });
  }

  // Knowledge items (optional)
  if (seed.knowledgeItems) {
    for (const ki of seed.knowledgeItems) {
      await db.insert(knowledgeItems).values({
        id: ki.id,
        title: ki.title,
        body: ki.body,
        format: "markdown",
        status: "active",
        version: 1,
        updatedBy: "system",
        scopeKind: ki.scopeKind ?? "factory",
        scopeId: ki.scopeId ?? null,
        createdAt: NOW,
        updatedAt: NOW,
      });
    }
  }
}
```

---

## The 5 scenarios

### Scenario 1: Knowledge task

**What it tests:** Agent writes session notes and a knowledge item. The full path: provisioning -> tool registry -> `write_session_notes` (FS write + DB update) -> `write_memory` (knowledge fabric insert) -> session completes.

```typescript
// packages/eval/src/scenarios/knowledge-task.ts

export const knowledgeTaskScenario: EvalScenario = {
  id: "knowledge-task",
  name: "Knowledge Task",
  description: "Agent reads context, writes session notes and a knowledge item",
  seed: {
    team: { id: "team-eval-1", name: "Eval Team" },
    teamMember: { id: "tm-eval-1" },
    agents: [
      { id: "agent-builder-1", name: "Builder", role: "builder" },
    ],
    bet: { id: "bet-eval-1", description: "Eval bet" },
    tasks: [
      { id: "task-eval-1", title: "Write knowledge", state: "accepted",
        description: "Read context and write findings" },
    ],
  },
  trigger: { agentId: "agent-builder-1", taskId: "task-eval-1" },
  script: {
    turns: [
      {
        toolCalls: [
          {
            toolName: "write_session_notes",
            args: { notes: "## Session Notes\n\nReviewed context. Key finding: system uses event-driven architecture." },
          },
        ],
      },
      {
        toolCalls: [
          {
            toolName: "write_memory",
            args: {
              layer: "L2",
              kind: "pattern",
              title: "Event-driven architecture pattern",
              body: "The system uses an event bus for inter-component communication.",
            },
          },
        ],
        completion: "I have documented my findings in session notes and created a knowledge item.",
      },
    ],
  },
  assert: async (ctx) => {
    // AC: knowledge item exists in DB
    const [ki] = await ctx.db.select().from(knowledgeItems)
      .where(eq(knowledgeItems.title, "Event-driven architecture pattern")).limit(1);
    assert(ki, "Knowledge item should exist");
    assert(ki.body.includes("event bus"), "Knowledge item body should contain expected content");
    assert(ki.scopeKind === "product", "Knowledge item should be scoped to product");

    // AC: session notes persisted
    const [session] = await ctx.db.select().from(sessions)
      .where(eq(sessions.id, ctx.sessionResult.sessionId)).limit(1);
    assert(session?.notes, "Session notes should be persisted");
    assert(session.notes.includes("event-driven"), "Session notes should contain expected content");

    // AC: session completed
    assert(ctx.sessionResult.outcome === "completed", "Session should complete successfully");
  },
};
```

### Scenario 2: Coordination task

**What it tests:** Agent creates subtasks and sends a review message. Exercises `create_task` (inserts task in "proposed" state) and `submit_review` (creates thread + review message).

```typescript
// packages/eval/src/scenarios/coordination-task.ts

export const coordinationTaskScenario: EvalScenario = {
  id: "coordination-task",
  name: "Coordination Task",
  description: "Agent creates subtasks and sends a review message",
  seed: {
    team: { id: "team-eval-2", name: "Coord Team" },
    teamMember: { id: "tm-eval-2" },
    agents: [
      { id: "agent-pm-1", name: "PM Agent", role: "product_manager" },
      { id: "agent-builder-2", name: "Builder 2", role: "builder" },
    ],
    bet: { id: "bet-eval-2", description: "Coordination bet" },
    tasks: [
      { id: "task-eval-2", title: "Plan implementation", state: "accepted",
        description: "Break down work and request review" },
    ],
  },
  trigger: { agentId: "agent-pm-1", taskId: "task-eval-2" },
  script: {
    turns: [
      {
        toolCalls: [
          {
            toolName: "create_task",
            args: { title: "Implement API endpoint", description: "Build the REST endpoint" },
          },
          {
            toolName: "create_task",
            args: { title: "Write integration tests", description: "Cover all API paths" },
          },
        ],
      },
      {
        toolCalls: [
          {
            toolName: "submit_review",
            args: {
              title: "Implementation plan ready for review",
              reasoning: ["Broke work into two subtasks", "API endpoint first, tests second"],
            },
          },
        ],
        completion: "Created subtasks and submitted review.",
      },
    ],
  },
  assert: async (ctx) => {
    // AC: tasks exist
    const newTasks = await ctx.db.select().from(tasks)
      .where(eq(tasks.betId, "bet-eval-2"));
    const subtasks = newTasks.filter(t => t.id !== "task-eval-2");
    assert(subtasks.length === 2, `Expected 2 subtasks, got ${subtasks.length}`);
    assert(subtasks.some(t => t.title === "Implement API endpoint"));
    assert(subtasks.some(t => t.title === "Write integration tests"));
    assert(subtasks.every(t => t.state === "proposed"), "Subtasks should be in proposed state");

    // AC: review message in thread
    const betThreads = await ctx.db.select().from(threads)
      .where(and(eq(threads.hostKind, "bet"), eq(threads.hostId, "bet-eval-2")));
    assert(betThreads.length === 1, "Bet thread should exist");
    const threadMessages = await ctx.db.select().from(messages)
      .where(eq(messages.threadId, betThreads[0].id));
    assert(threadMessages.length >= 1, "Review message should exist in thread");
  },
};
```

### Scenario 3: Synthesis task

**What it tests:** Agent reads multiple knowledge items (pre-seeded) and produces a summary artifact via `create_artifact`.

```typescript
// packages/eval/src/scenarios/synthesis-task.ts

export const synthesisTaskScenario: EvalScenario = {
  id: "synthesis-task",
  name: "Synthesis Task",
  description: "Agent reads knowledge items and produces a summary artifact",
  seed: {
    team: { id: "team-eval-3", name: "Synth Team" },
    teamMember: { id: "tm-eval-3" },
    agents: [
      { id: "agent-builder-3", name: "Synthesizer", role: "builder" },
    ],
    bet: { id: "bet-eval-3", description: "Synthesis bet" },
    tasks: [
      { id: "task-eval-3", title: "Synthesize findings", state: "accepted",
        description: "Read knowledge items and produce summary" },
    ],
    knowledgeItems: [
      { id: "ki-1", title: "Finding A", body: "First finding about performance." },
      { id: "ki-2", title: "Finding B", body: "Second finding about reliability." },
      { id: "ki-3", title: "Finding C", body: "Third finding about scalability." },
    ],
  },
  trigger: { agentId: "agent-builder-3", taskId: "task-eval-3" },
  script: {
    turns: [
      {
        toolCalls: [
          {
            toolName: "write_session_notes",
            args: { notes: "Read 3 knowledge items. Synthesizing into decision artifact." },
          },
        ],
      },
      {
        toolCalls: [
          {
            toolName: "create_artifact",
            args: {
              kind: "decision",
              preview: {
                kind: "decision",
                title: "Architecture Decision: Performance + Reliability",
                summary: "Based on findings A, B, and C, we recommend...",
              },
            },
          },
        ],
        completion: "Created summary artifact from knowledge synthesis.",
      },
    ],
  },
  assert: async (ctx) => {
    // AC: artifact created with correct content type
    const arts = await ctx.db.select().from(artifacts)
      .where(eq(artifacts.producingTaskId, "task-eval-3"));
    assert(arts.length === 1, `Expected 1 artifact, got ${arts.length}`);
    assert(arts[0].kind === "decision", `Expected kind=decision, got ${arts[0].kind}`);
    const preview = JSON.parse(arts[0].previewJson ?? "{}");
    assert(preview.title?.includes("Architecture Decision"), "Preview should contain title");
  },
};
```

### Scenario 4: Handoff task

**What it tests:** Agent works on a task, hits a blocker, and hands off to another agent. Exercises the handoff protocol (task ownership reassignment, audit trail).

```typescript
// packages/eval/src/scenarios/handoff-task.ts

export const handoffTaskScenario: EvalScenario = {
  id: "handoff-task",
  name: "Handoff Task",
  description: "Agent hits a blocker and hands off to another agent",
  seed: {
    team: { id: "team-eval-4", name: "Handoff Team" },
    teamMember: { id: "tm-eval-4" },
    agents: [
      { id: "agent-builder-4a", name: "Builder A", role: "builder" },
      { id: "agent-builder-4b", name: "Builder B", role: "builder" },
    ],
    bet: { id: "bet-eval-4", description: "Handoff bet" },
    tasks: [
      { id: "task-eval-4", title: "Complex implementation", state: "accepted",
        ownerAgentId: "agent-builder-4a",
        description: "Implement feature that requires expertise" },
    ],
  },
  trigger: { agentId: "agent-builder-4a", taskId: "task-eval-4" },
  script: {
    turns: [
      {
        toolCalls: [
          {
            toolName: "write_session_notes",
            args: { notes: "Started implementation. Hit a conceptual blocker on the DB schema design." },
          },
        ],
      },
      {
        toolCalls: [
          {
            toolName: "handoff_to",
            args: {
              toAgent: "agent-builder-4b",
              contextId: "task-eval-4",
              status: "blocked",
              reason: "Need expertise on PostgreSQL partitioning for the schema design",
              remainingWork: ["Design partitioned schema", "Implement migration"],
            },
          },
        ],
        completion: "Handed off to Builder B due to schema expertise requirement.",
      },
    ],
  },
  assert: async (ctx) => {
    // AC: handoff recorded -- task reassigned to agent-builder-4b
    const [task] = await ctx.db.select().from(tasks)
      .where(eq(tasks.id, "task-eval-4")).limit(1);
    assert(task, "Task should exist");
    assert(task.ownerAgentId === "agent-builder-4b",
      `Expected ownerAgentId=agent-builder-4b, got ${task.ownerAgentId}`);

    // AC: audit trail has handoff entry
    const audit = JSON.parse(task.auditTrail ?? "[]");
    const handoffEntry = audit.find((e: any) => e.type === "handoff");
    assert(handoffEntry, "Audit trail should contain a handoff entry");
    assert(handoffEntry.toAgent === "agent-builder-4b",
      "Handoff entry should reference target agent");
  },
};
```

### Scenario 5: Cost-bounded task

**What it tests:** Agent works within a cost cap. The session emits cost_update events that accumulate cost on the bet. The eval verifies that cost is recorded correctly. Because the mock harness doesn't actually breach a cap (the cost check is pre-flight at Phase 2), this scenario verifies the cost-tracking path: cost_update events -> `recordCostAndCheck` -> bet.costActualMinor increment.

```typescript
// packages/eval/src/scenarios/cost-bounded-task.ts

export const costBoundedTaskScenario: EvalScenario = {
  id: "cost-bounded-task",
  name: "Cost-Bounded Task",
  description: "Agent works within a cost cap; cost tracking verified",
  seed: {
    team: { id: "team-eval-5", name: "Cost Team" },
    teamMember: { id: "tm-eval-5" },
    agents: [
      { id: "agent-builder-5", name: "Cost Builder", role: "builder",
        costCapMinor: 500 },  // $5.00 cap
    ],
    bet: {
      id: "bet-eval-5",
      description: "Cost-bounded bet",
      costAppetiteMinor: 1000,  // $10.00 appetite
    },
    tasks: [
      { id: "task-eval-5", title: "Cost-tracked work", state: "accepted",
        description: "Do work within cost bounds" },
    ],
  },
  trigger: { agentId: "agent-builder-5", taskId: "task-eval-5" },
  script: {
    turns: [
      {
        toolCalls: [
          {
            toolName: "write_session_notes",
            args: { notes: "Starting cost-tracked work." },
          },
        ],
        costDelta: 0.50,  // $0.50 -- 50 cents
      },
      {
        toolCalls: [
          {
            toolName: "write_memory",
            args: {
              layer: "L2",
              kind: "pattern",
              title: "Cost tracking pattern",
              body: "Verified cost tracking works end-to-end.",
            },
          },
        ],
        costDelta: 0.25,  // $0.25 -- 25 cents
        completion: "Completed cost-bounded work.",
      },
    ],
  },
  assert: async (ctx) => {
    // AC: session completed (not crashed by cap breach)
    assert(ctx.sessionResult.outcome === "completed",
      "Session should complete within cost cap");

    // AC: cost recorded correctly on bet
    const [bet] = await ctx.db.select().from(bets)
      .where(eq(bets.id, "bet-eval-5")).limit(1);
    assert(bet, "Bet should exist");
    // Total cost: 50 + 25 = 75 cents
    assert(bet.costActualMinor !== null && bet.costActualMinor > 0,
      `Expected positive costActualMinor, got ${bet.costActualMinor}`);

    // AC: cost recorded correctly (total cost from session result)
    assert(ctx.sessionResult.totalCostCents > 0,
      `Expected positive totalCostCents, got ${ctx.sessionResult.totalCostCents}`);
  },
};
```

---

## JSON report format

### `packages/eval/src/report.ts`

```typescript
import * as fs from "node:fs";
import * as path from "node:path";
import type { EvalReport } from "./types.js";

const REPORT_PATH = path.join(process.cwd(), "eval-results.json");

export function writeReport(report: EvalReport): void {
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf-8");
  console.log(`\nReport written to ${REPORT_PATH}`);
}
```

Sample output:

```json
{
  "timestamp": "2026-06-04T12:00:00.000Z",
  "mode": "mock",
  "scenarios": [
    {
      "scenarioId": "knowledge-task",
      "scenarioName": "Knowledge Task",
      "passed": true,
      "durationMs": 234,
      "costCents": 0,
      "mode": "mock"
    },
    {
      "scenarioId": "coordination-task",
      "scenarioName": "Coordination Task",
      "passed": true,
      "durationMs": 189,
      "costCents": 0,
      "mode": "mock"
    }
  ],
  "summary": {
    "total": 5,
    "passed": 5,
    "failed": 0,
    "totalDurationMs": 1052,
    "totalCostCents": 0
  }
}
```

---

## Live eval gating

```
npm run eval           -- mock mode (always available)
npm run eval -- --live -- live mode (requires API key)
```

Detection logic in `runner.ts`:

1. Parse `--live` flag from `process.argv`.
2. If `--live`: check for `ANTHROPIC_API_KEY` or `OPENROUTER_API_KEY` in `process.env`. If neither present, exit with error message.
3. If `--live`: dynamically import `LiveHarnessAdapter` and use it instead of `EvalHarnessAdapter`. The scripted tool calls in `scenario.script` are ignored in live mode -- the real LLM decides what tools to call.
4. Live results may fail (the LLM might not call the expected tools). This is expected and informational. The report distinguishes `mode: "mock"` from `mode: "live"`.

---

## Security & abuse cases

| Concern | Applicable? | Resolution |
|---------|-------------|------------|
| Rate-limit on POST/PATCH | N/A -- evals don't expose HTTP endpoints | N/A |
| Input trust boundary for agent-authored fields | Yes -- tool args in scenarios are crafted by developers, not by agents | The eval framework doesn't introduce new trust boundaries. Tool args pass through the same Zod validation as real sessions. |
| Secret handling | Yes -- `ANTHROPIC_API_KEY` in live mode | Key is read from `process.env`, never logged, never written to the report. |
| Path traversal | Yes -- workspace paths | Uses `LocalWorkspaceAdapter` which creates directories under `os.tmpdir()`. Same path as existing tests. |
| SSRF for outbound URLs | N/A in mock mode. In live mode, the only outbound call is to `api.anthropic.com` or OpenRouter. | No user-controlled URLs. |
| Eval report data exposure | Low -- report contains scenario names, pass/fail, duration, cost. No PII, no secrets. | `eval-results.json` written to CWD. Add to `.gitignore`. |

---

## Protected tests

```
protectedTests: []
```

No existing test files are modified by X7. The eval framework is additive.

---

## Migrations

None required. X7 reads existing tables; it does not modify the schema.

---

## Design-it-twice: Eval harness approach

### Option A: Custom EvalHarnessAdapter (chosen)

The eval adapter implements `HarnessAdapter`, replays scripted tool_use events, and lets `provisionSession` Phase 10 dispatch them to `registry.invoke()`. The eval exercises the real provisioning pipeline.

**Trade-off:** Duplicates some patterns from `ScriptedHarnessAdapter` in session-provisioning tests. But the eval adapter is simpler (no fileWrites, no afterFileWrites hooks) and purpose-built for eval scenarios.

**Reject if:** We needed to test the actual agent loop (plan -> execute -> reflect). But evals test the *integration path*, not the agent loop. X6's agent loop is tested separately.

### Option B: Inject mock LLM into BuiltinHarnessAdapter

Replace `callLlm()` inside the builtin harness with a mock that returns scripted responses. The full agent loop runs.

**Trade-off:** Depends on X6 being implemented (it's a stub today). The agent loop's plan/reflect/stop logic would interfere with deterministic tool call ordering. More moving parts, more flakiness.

**Rejected because:** X6 is not implemented, and even when it is, testing the agent loop is X6's job, not X7's. The eval framework tests the *integration boundary* -- provisioning, tools, DB -- not the agent reasoning loop.

---

## Ordered implementation tasks

### Task 1: Package scaffolding
**Files:** `packages/eval/package.json`, `packages/eval/tsconfig.json`, `packages/eval/src/types.ts`
**What:** Create the eval package with dependencies, TypeScript config, and all type definitions.
**Verify:** `npm install` succeeds, `npm run check` passes with the new package.

### Task 2: Seed helpers
**Files:** `packages/eval/src/seed.ts`
**What:** Implement `seedWorld()` that inserts teams, agents, bets, tasks, and knowledge items from `EvalSeedData`.
**Verify:** Unit test: call `seedWorld()` with test data, query DB, assert rows exist.

### Task 3: EvalHarnessAdapter
**Files:** `packages/eval/src/eval-harness-adapter.ts`
**What:** Implement the mock harness that replays `HarnessScript` turns as `HarnessEvent` sequences.
**Verify:** Unit test: construct adapter with a script, call `startSession()` + iterate `streamEvents()`, assert events match script.

### Task 4: Report writer
**Files:** `packages/eval/src/report.ts`
**What:** Implement `writeReport()` that serializes `EvalReport` to `eval-results.json`.
**Verify:** Unit test: call `writeReport()` with mock data, read file, parse JSON, verify schema.

### Task 5: Runner infrastructure
**Files:** `packages/eval/src/runner.ts`
**What:** Implement the main entry point: arg parsing, scenario discovery, per-scenario execution loop (createTestDb -> seed -> provision -> assert -> close), report generation.
**Depends on:** Tasks 1-4.
**Verify:** `npm run eval` with no scenarios produces an empty report (or errors gracefully). Wire in Task 6 scenarios progressively.

### Task 6: Five eval scenarios
**Files:** `packages/eval/src/scenarios/knowledge-task.ts`, `coordination-task.ts`, `synthesis-task.ts`, `handoff-task.ts`, `cost-bounded-task.ts`, `index.ts`
**What:** Implement all five scenarios with seed data, scripted tool calls, and assertion functions.
**Depends on:** Tasks 2, 3, 5.
**Verify:** `npm run eval` executes all 5 scenarios, all pass, `eval-results.json` written with 5 green entries.

### Task 7: Root wiring + gitignore
**Files:** `package.json` (root), `tsconfig.json` (root), `.gitignore`
**What:** Add `"eval": "npx tsx packages/eval/src/runner.ts"` script. Add eval package to root tsconfig references and paths. Add `eval-results.json` to `.gitignore`.
**Verify:** `npm run eval` works from repo root.

### Task 8: LiveHarnessAdapter (optional, gated)
**Files:** `packages/eval/src/live-harness-adapter.ts`
**What:** Implement the live adapter using `@anthropic-ai/sdk`. Dynamic import gated on `--live` flag.
**Depends on:** Task 5.
**Verify:** With `ANTHROPIC_API_KEY` set and `--live` flag, at least one scenario executes against the real API.

### Task ordering

```
Task 1 (scaffolding)
  |
  +-- Task 2 (seed) --+
  |                    |
  +-- Task 3 (adapter)-+-- Task 5 (runner) -- Task 6 (scenarios)
  |                    |
  +-- Task 4 (report) -+
  |
  +-- Task 7 (root wiring)
  |
  +-- Task 8 (live adapter, optional)
```

Tasks 2, 3, 4 are independent and can be built in parallel after Task 1. Task 5 depends on all of them. Task 6 depends on Task 5. Task 7 is independent of task ordering but should be done early. Task 8 is optional and can be deferred.

---

## Risks and ambiguities

1. **`provisionSession` has deep dependencies.** It calls `materialize()`, `startWatcher()`, `composePrompt()`, `writeWorkspaceCLAUDEmd()`, and `processWriteback()`. All of these touch the filesystem. The eval must run in a real temp directory (not mocked FS). This is the same approach as `session-provisioning.test.ts` and is known to work.

2. **`handoff_to` tool requires `SessionContext`.** The handoff tool internally constructs a `SessionContext` from `ToolContext` fields. The `watcher` field is a real `FileWatcher` -- this is created by provisioning Phase 7 and passed through. Evals don't need to create a separate watcher.

3. **PGlite WASM cold start.** First scenario will take ~1s for PGlite initialization. Subsequent scenarios reuse pooled instances (~5ms). Acceptable for a 5-scenario suite.

4. **`LocalWorkspaceAdapter` production guard.** The adapter rejects `NODE_ENV=production` for non-laptop profiles. Evals run without `NODE_ENV=production`, so this is not an issue. If someone runs `NODE_ENV=production npm run eval`, it will fail. This is correct behavior.

5. **Live mode non-determinism.** The real LLM may not call the expected tools, may call them in a different order, or may call additional tools. Live assertions must be looser than mock assertions. For v1, live mode reuses the same assertion functions (some may fail -- that's informational). A follow-up can add live-specific "soft" assertions.

6. **The `handoff_to` tool constructs a `SessionContext` missing the `traceId` field.** `SessionContext` requires `traceId: string` (session-lifecycle.ts:37), but `handoff-to.ts:54-60` constructs it without one. This is a pre-existing type gap in the codebase (root `tsc --noEmit` does not flag it due to composite project reference resolution). The handoff scenario (Scenario 4) will exercise this path. If `handoff()` internally reads `sessionContext.traceId`, it will get `undefined` at runtime. The builder should verify the handoff scenario passes and, if it fails on missing traceId, the fix is to either make `traceId` optional in `SessionContext` or add it to the handoff tool's construction (not an X7 concern, but X7 will surface it).
