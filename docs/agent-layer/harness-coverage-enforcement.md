# Harness Coverage Enforcement

Every harness-facing integration test must cover the full supported harness matrix. Two independent gates enforce this: a lint coverage rule that blocks source declaring fewer than the full set, and an attestation symmetry floor that blocks an attestation whose tagged per-harness execution counts are unequal or missing.

The completed/not-returned outcome split below rides the return-gate mechanics — see [return-gate-enforcement.md](return-gate-enforcement.md). The run-on-host execution model and sandbox capture seam live in [run-unit-model.md](../architecture/run-unit-model.md). Day-to-day test commands and the affected-slice verify flow live in [guides/developer/testing.md](../guides/developer/testing.md), which links here for mechanism depth.

Harness/session error classes live in `packages/shared/src/errors.ts`. `CostCapExceededError` is Money-axis only — its payload is `(entityId, spend, cap)` with no axis field; no TokenUsage cap enforcement exists.

---

## Supported harness matrix

`SUPPORTED_HARNESSES` in `scripts/lib/honest-harness-predicate.ts:37` is the single source of truth:

```ts
export const SUPPORTED_HARNESSES = ["builtin", "claude", "codex", "opencode"] as const;
```

`gh` is a tool, not an agent harness. `cursor-agent` is inert (not spawnable). Neither is in the matrix.

`packages/server/src/harness/__tests__/require-harness.ts:38-47` mirrors this as a compile-time-checked literal (a bidirectional type assert — `_AssertSupportedInHarness` / `_AssertHarnessCoversSupported`). `packages/` cannot import `scripts/`; the mirror keeps both in lockstep without a package-graph cycle. Divergence is a `npm run check` error.

---

## Gate 1 — lint coverage rule (`honest-harness-guard.ts`)

`scripts/honest-harness-guard.ts --check` runs as part of `npm run lint` (package.json:30). For every harness-facing `*.integration.test.ts` it:

1. Identifies harness-facing files via `isHarnessIntegrationPath` (`scripts/lib/honest-harness-predicate.ts:78-83`).
2. Checks for stub/mock patterns (scripted/mock adapter construction, hand-rolled `implements HarnessAdapter`, adapter-returning factories, `vi.mock` of harness seams or the llm-client).
3. **Coverage rule:** asserts every member of `SUPPORTED_HARNESSES` appears as a real `requireHarness("<name>")` call. Comments and string literals are blanked before matching — only an actual call in non-comment code counts. Missing members are named in the failure (`honest-harness-guard.ts:231`).
4. **Model-seam rule (AR7):** bans imports of the raw model-callers (`cli-harness-adapter`, `builtin-harness-adapter`, `llm-client`) in harness-facing tests — drive the harness via the seam factories (`runThroughHarness` / `lockedHarnessAdapter`); the model is locked in `HARNESS_TEST_MODELS`.

A file declaring only a subset of the harnesses fails lint — "subset coverage is still a false green" is a build error, not a code-review concern.

**Staged debt:** files not yet converted to full-matrix coverage are listed in `scripts/coverage-debt.allowlist.json` (6 files remain). The stub-debt allowlist `scripts/honest-harness-guard.allowlist.json` is empty — all stub conversions are done. Adding a file to either requires a deliberate edit.

---

## Gate 2 — attestation harness-symmetry floor (`agenticExecutedByHarness`)

`scripts/verify-attest.ts` parses `vitest --reporter=json` output and produces a signed attestation under `.verify-attestations/` (verify-attest.ts:46). The attestation writer adds:

- **`agenticExecutedByHarness`** — a `Record<string, { executed: number; skipped: number }>` keyed by the `[harness:<name>]` describe-title tag (verify-attest.ts:161-200).

`scripts/check-attestation.ts:219-231` calls **`assertHarnessSymmetry`** (`scripts/lib/attestation-floor.ts:181`; the older `assertPerHarnessFloor` is `@deprecated since AT1`). Three cases:

1. `agenticExecuted === 0` → **pass**. The numeric count is zero — typical when no harness-facing file was in the changed set; the condition is purely numeric, not a file-change check.
2. `agenticExecuted > 0` with no `[harness:X]` buckets → **fail** (untagged guard). A harness-facing test ran but bucketed nothing per harness; tag it before it can count as coverage.
3. Tagged buckets present → **pass iff every supported harness has the same positive executed count**. A zero-count harness means one was silently dropped; unequal counts mean a harness-specific probe inflated a bucket. Harness-specific, transport-only, or admission-only probes must stay parity-neutral — untagged, outside the parity floor.

### How the tag is parsed

Each harness lane's describe title begins with its tag:

```ts
describe(`[harness:builtin] Suite`, () => { … })
describe(`[harness:claude] Suite`, () => { … })
describe(`[harness:codex] Suite`, () => { … })
describe(`[harness:opencode] Suite`, () => { … })
```

The floor reads the `ancestorTitles` array from the vitest JSON reporter — the tag lives on the describe block, not the leaf test title. `HARNESS_TAG = /\[harness:([a-z-]+)\]/` (attestation-floor.ts:68) extracts the harness name and routes each assertion into its bucket.

In `SUPPORTED_HARNESS_LANES` the `describeTag` sits co-located with `harnessName` in each lane entry, so the tag and the `requireHarness` gate name the same harness — a typo in one is visible as an inconsistency in the other.

---

## How the two gates interlock

| Gate | What it checks | When it fires |
|---|---|---|
| Lint coverage rule | Source declares `requireHarness` for every supported harness; no stubs; locked model seam | `npm run lint` |
| Attestation symmetry floor | When harness tests ran, every supported harness executed the same positive tagged count | `npm run verify` → `check-attestation.ts` |

Lint gates the source; attestation gates execution. A subset-covered test cannot pass lint, and a full-coverage test whose lanes silently skip (or run lopsided) cannot mint a green attestation.

---

## Locked test models (AR7)

`HARNESS_TEST_MODELS` in `require-harness.ts` is the founder-set, tiny-baseline model matrix — locked at the seam, never bumped to pass a flake:

| Harness | Model | Notes |
|---|---|---|
| builtin | `deepseek/deepseek-v4-flash` | OpenRouter, `OPENROUTER_API_KEY` |
| claude | `haiku` | Smallest claude tier; inherited keychain login |
| codex | `gpt-5.4-mini` | ChatGPT-account floor — nano is API-key-only and rejected; enforced via `--model {{model}}` in `CLI_TOOL_CONFIGS.codex.args` (adapter-pool.ts:390) |
| opencode | `openrouter/z-ai/glm-4.7-flash` | Provider-prefixed; `--model` requires the `openrouter/` prefix |

All four are argument/request-enforced. Consume via `harnessTestResolvedModel(harness)` or `lockedHarnessAdapter(harness)`; the guard's model-seam rule blocks any path around the lock.

---

## The 4-harness matrix tests

`packages/server/src/harness/__tests__/real-session-provisioning.integration.test.ts` satisfies both gates for all four harnesses. It drives each through production `provisionSession()` and is the reference implementation for other matrix tests.

`packages/server/src/__tests__/bet-decomposition-real-agent.integration.test.ts` drives each harness through the production **decomposition** path — `runBetDecomposition` Branch 3 (`runRealPmTurn`) — not through `provisionSession`. A distinct seam: one proves a real session runs to completion under each harness, the other proves a real agent decomposes a bet and the tasks land in the DB. The helpers are deliberately not unified.

### Reusable matrix helpers

`packages/server/src/harness/__tests__/provision-real-session.ts` exports:

| Export | Purpose |
|---|---|
| `SUPPORTED_HARNESS_LANES` | Canonical four-lane table — each lane carries `harnessName`, `describeTag`, and a `prepFn` that provisions per-harness auth, adapter, and params |
| `runThroughHarness(lane, ctx)` | Loop runner: calls `prepFn`, creates a `SandboxCapture`, assembles `ProvisionSessionDeps`, calls `provisionSession`, returns `{ result, cap }` |
| `createSandboxCapture()` | Capture handle for the `onBeforeTeardown` seam |
| `startMcpBridgeServer()` | Ephemeral MCP bridge server on a random port (CLI lanes need it) |
| `provisionClaudeSandbox()` | Provisions `.mcp.json` + `.claude/settings.json` in a sandbox for the claude lane |
| `provisionCodexHome()` | Copies `auth.json` + `config.toml` into `.codex-home/` (NOT SQLite files — they cause file-lock exits) |
| `provisionOpencodeHome()` | Copies `auth.json` into `.opencode-data/opencode/` for XDG isolation (opencode's global SQLite DB deadlocks concurrent processes) |
| `initGitRepo()` | Creates an empty git repo in the sandbox (`codex exec` requires a git repo cwd) |
| `lockedHarnessAdapter(harness)` | Direct adapter locked to `HARNESS_TEST_MODELS` — the sanctioned alternative to raw adapter imports |

**Adoption pattern:**

```ts
import { SUPPORTED_HARNESS_LANES, runThroughHarness, startMcpBridgeServer } from "./provision-real-session.js";
import { requireHarness } from "./require-harness.js";

const bridge = await startMcpBridgeServer();

for (const lane of SUPPORTED_HARNESS_LANES) {
  describe(`${lane.describeTag} Suite name`, () => {
    requireHarness(lane.harnessName);
    test("real session runs", async ({ db, eventBus }) => {
      const tmpDir = /* per-test scratch dir */;
      await seedDomain(db, { taskId, agentId, taskDescription, doneCondition });
      const { result, cap } = await runThroughHarness(lane, { db, eventBus, tmpDir, bridge });
      expect(["completed", "not_returned"]).toContain(result.outcome);
    });
  });
}
```

**Decomposition pattern — use `decompositionDepsForLane`, not `runThroughHarness`:**

For tests that drive the real decomposition path, use `provision-real-decomposition.ts`. It builds a real `AdapterPool` per lane and deliberately omits the `runDecompositionTurn` override, forcing Branch 3 (`runRealPmTurn`).

```ts
import { SUPPORTED_HARNESS_LANES } from "./provision-real-session.js";
import { decompositionDepsForLane } from "./provision-real-decomposition.js";
import { requireHarness } from "./require-harness.js";

for (const lane of SUPPORTED_HARNESS_LANES) {
  describe(`${lane.describeTag} Suite name`, () => {
    requireHarness(lane.harnessName);
    test("real agent decomposes bet", async ({ db, eventBus }) => {
      const tmpDir = /* per-test scratch dir */;
      await seedDomain(db, { agentId, teamId, betId });
      const deps = await decompositionDepsForLane(lane, { db, eventBus, tmpDir });
      await runBetDecomposition(betId, deps);
      const bet = await db.query.bets.findFirst({ where: eq(bets.id, betId) });
      expect(bet?.decompositionStatus).toBe("done");
      const tasks = await db.query.tasks.findMany({ where: eq(tasks.betId, betId) });
      expect(tasks.length).toBeGreaterThanOrEqual(1);
    });
  });
}
```

The assertion is fail-closed: `runRealPmTurn` returns `[]` on an empty or unparseable model response → bet marked `blocked/empty` → the `"done"` check fails.

---

## Known honest behavior differences across harnesses

Findings surfaced by real matrix runs:

### `builtin` + `claude` → `completed`; `codex` + `opencode` → `not_returned` (on file-write tasks)

`builtin` and `claude` fire the MCP return tool (`send_message`) in response to the task prompt — outcome `"completed"`. `codex` and `opencode` do real billable work on the file task but do not call the MCP return tool — outcome `"not_returned"` (the return-gate enforcer triggers but they exhaust the force budget). Honest harness behaviour, not a test gap. The correct assertion:

```ts
expect(["completed", "not_returned"]).toContain(result.outcome);
expect(result.outcome).not.toBe("crashed"); // a crash = stub or binary failure
```

A `"crashed"` outcome on any harness is an unconditional hard fail — a real run does not crash.

### Codex cost always 0

Codex emits `turn.completed` with a `usage` block, not the claude-stream-json `result` event with `total_cost_usd`. `CliHarnessAdapter` captures cost on `type === "result"` (cli-harness-adapter.ts:999-1004) — so `totalCostCents` is always `0` for codex; the `costField: "total_cost_usd"` in `CLI_TOOL_CONFIGS.codex` is vestigial. Never assert `totalCostCents > 0` for codex. (opencode cost IS now additionally extracted from `step_finish` events — cli-harness-adapter.ts:1021 — so the codex-only caveat does not generalize to all CLI harnesses.)

### opencode `tool_use` event mapping (fixed in event normalization)

opencode emits tool calls on a `tool_use` event; `packages/shared/src/harness/harness-event-normalization.ts:166-176` maps `tool_use` → `tool_call` for opencode so `isReturnAction` receives the tool name and the return gate fires.

### opencode completion text lives in `part.text` (fixed in event normalization)

opencode's completion events carry text in `event.part.text`, not `event.text`. The normalizer reads `event.part?.text ?? event.text` (harness-event-normalization.ts:205-216) — without this, every opencode completion normalized to an empty string.

### CLI harnesses emit multiple completion events per session

Init/system lifecycle events produce empty completions, intermediate blocks carry partial text, the final `result` event carries the full response. Code that returns on the first completion event receives `""` and triggers `blocked/empty`. Always take the **last non-empty** completion — `drainForCompletion` in `packages/server/src/services/bet-decomposition.ts:706` implements this; the `runThroughHarness` session path drains the MCP return action instead and is unaffected.

---

## `BUILTIN_ONLY_INTEGRATION` carve-out

`BUILTIN_ONLY_INTEGRATION` in `scripts/lib/honest-harness-predicate.ts:68` registers files whose production path is genuinely builtin-only by construction. A file on this list:

- Is **exempted** from the 4-harness coverage rule (Gate 1).
- **Still enforced** for: (a) `requireHarness("builtin")` declared, (b) zero stubs / no `vi.mock` of harness seams, (c) no `skipIf`-on-absent gates.

**The list is empty — keep it empty** unless a future production path structurally cannot run CLI harnesses and still must be tested as a harness-facing integration. The former canonical case (the assistant turn) no longer exists: AR4a routed assistant turns through `provisionSession` conversational mode (real sandbox, MCP bridge, all four harnesses), proven end-to-end by the full-matrix `conversational-reply-row.integration.test.ts`.

**Why not the coverage-debt allowlist?** `coverage-debt.allowlist.json` means "below 4 harnesses _temporarily_, will reach 4." A builtin-only path will _never_ reach 4 — listing it there would be a permanent lie. The carve-out states a structural truth; the allowlist states a temporary debt.

---

## Dispatch to real agent

Task-dispatcher and session-route happy paths run against real harnesses through the production dispatch pipeline:

`transitionTask(db, eventBus, taskId, "accepted")` → `drainQueue` → `resolveProvisionSession()` (registry-injected `provisionSession`, `packages/fabric/src/services/task-dispatcher.ts:185`) → real `HarnessAdapter` → `endSession` teardown.

**Production touch:** `TaskDispatcherDeps` carries an optional `onBeforeTeardown` field (additive, task-dispatcher.ts:120). `drainQueue` threads it into the `provisionSession` deps so the dispatched agent's sandbox is observable via `createSandboxCapture` — the capture fires after drain, before teardown deletes the sandbox.

**Real trigger, not seeded `in_progress`:** dispatcher tests use `transitionTask(..., "accepted")` as the real entry — never a seeded `state:"in_progress"` row.

**Honest floor (matches the real-session baseline):** `builtin` + `claude` reliably reach `outcome="completed"`; `codex` + `opencode` reach `outcome="not_returned"` (real billable work, no MCP return call). `"crashed"` on any lane is an unconditional hard fail.

### Consolidated matrix tests

| File | Role |
|---|---|
| `session-dispatch-wiring.integration.test.ts` | Accepted task → dispatcher → real session row |
| `nonblocking-session-creation.integration.test.ts` | `POST /api/sessions` returns 202 and the real run reaches terminal state |
| `provisioning-single-tool-execution.integration.test.ts` | Real agent tool call executes exactly once |
| `session-cost-per-step-delta.integration.test.ts` | Real session cost delta is persisted correctly |
| `conversational-reply-row.integration.test.ts` | Conversational assistant path persists a non-empty assistant reply across all harnesses |
| `minimal-strategy-session.integration.test.ts` | Real session runs under the real minimal strategy |
| `bet-decomposition-real-agent.integration.test.ts` | Real agent decomposes a bet and persists tasks |

---

## Files at a glance

| File | Role |
|---|---|
| `scripts/lib/honest-harness-predicate.ts` | `SUPPORTED_HARNESSES` + `isHarnessIntegrationPath` + `BUILTIN_ONLY_INTEGRATION` |
| `scripts/honest-harness-guard.ts` | Lint rule: stub check + coverage check + model-seam import ban |
| `scripts/coverage-debt.allowlist.json` | Files not yet converted to full-matrix coverage (6 remain) |
| `scripts/honest-harness-guard.allowlist.json` | Stub-conversion debt — empty |
| `scripts/lib/attestation-floor.ts` | `extractAgenticCounts` + `assertHarnessSymmetry` (live); `assertPerHarnessFloor` deprecated |
| `scripts/verify-attest.ts` | Writes `agenticExecutedByHarness` into a signed attestation under `.verify-attestations/` |
| `scripts/check-attestation.ts` | Calls `assertHarnessSymmetry` on `agenticExecutedByHarness` |
| `packages/server/src/harness/__tests__/require-harness.ts` | `requireHarness` hard-fail helper; mirrors `SUPPORTED_HARNESSES`; `HARNESS_TEST_MODELS` + `harnessTestResolvedModel` |
| `packages/server/src/harness/__tests__/provision-real-session.ts` | `SUPPORTED_HARNESS_LANES` + `runThroughHarness` + `lockedHarnessAdapter` + provisioning helpers |
| `packages/server/src/harness/__tests__/real-session-provisioning.integration.test.ts` | Reference four-harness matrix test |
| `packages/server/src/harness/__tests__/provision-real-decomposition.ts` | `decompositionDepsForLane` — real `AdapterPool` per lane, forces Branch 3 by omitting the `runDecompositionTurn` override |
| `packages/server/src/__tests__/bet-decomposition-real-agent.integration.test.ts` | 4-harness decomposition matrix test — ≥1 persisted task + `decompositionStatus=done` from a real agent |
| `packages/fabric/src/services/task-dispatcher.ts` | `TaskDispatcherDeps.onBeforeTeardown` (additive optional field) |
