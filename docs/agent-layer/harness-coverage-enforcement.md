# Harness Coverage Enforcement (AR2)

Every harness-facing integration test must cover the full supported harness matrix. AR2 makes this **mechanically enforced** via two independent gates: a lint coverage rule that blocks source that declares fewer than the full set, and an attestation per-harness floor that blocks an attestation where any supported harness ran zero executed assertions.

---

## Supported harness matrix

`SUPPORTED_HARNESSES` in `scripts/lib/honest-harness-predicate.ts` is the single source of truth:

```ts
export const SUPPORTED_HARNESSES = ["builtin", "claude", "codex", "opencode"] as const;
```

`gh` is a tool, not an agent harness. `cursor-agent` is inert (not spawnable). Neither is in the matrix.

`packages/server/src/harness/__tests__/require-harness.ts` mirrors this as a compile-time-checked literal (a bidirectional type assert). `packages/` cannot import `scripts/` — the mirror keeps both in lockstep without a package-graph cycle. A divergence between the two causes a TypeScript error.

---

## Gate 1 — lint coverage rule (`honest-harness-guard.ts`)

`scripts/honest-harness-guard.ts` runs as part of `npm run lint`. For every harness-facing `*.integration.test.ts` it:

1. Identifies harness-facing files via `isHarnessIntegrationPath` (the predicate from `scripts/lib/honest-harness-predicate.ts`).
2. Checks for stub/mock patterns (stub rule — carried over from AR1).
3. **Coverage rule (AR2):** asserts that every member of `SUPPORTED_HARNESSES` appears as a real `requireHarness("<name>")` call in the source. Comments and string literals containing the harness name do not count — only an actual `requireHarness` call in non-comment code.

A file that declares only a subset of the harnesses fails lint with a message naming the missing members. This makes "subset coverage is still a false green" a build error, not a code-review concern.

**Staged debt:** files not yet converted to the full matrix are listed in `scripts/coverage-debt.allowlist.json`. AR3–AR6 converted the AL6/AL7 enforcement and MCP-bridge tests to full-matrix coverage (complete as of AR6). Remaining allowlisted files cover non-enforcement integration tests not yet migrated. The allowlist is a safety valve — adding a new file to it requires a deliberate edit.

---

## Gate 2 — attestation per-harness floor (`agenticExecutedByHarness`)

`scripts/verify-attest.ts` parses `vitest --reporter=json` output and produces a signed `.verify-attestation.json`. AR2 adds:

- **`agenticExecutedByHarness`** — a `Record<string, { executed: number; skipped: number }>` keyed by the `[harness:<name>]` describe-title tag.

`scripts/check-attestation.ts` calls `assertPerHarnessFloor(agenticExecutedByHarness, SUPPORTED_HARNESSES)` (from `scripts/lib/attestation-floor.ts`). The function fails when **any** supported harness has `executed === 0` — proving each harness actually RAN, not just that the test file declared it.

### How the tag is parsed

Each harness lane uses a describe title that begins with its mechanical tag:

```ts
describe(`[harness:builtin] Suite`, () => { … })
describe(`[harness:claude] Suite`, () => { … })
describe(`[harness:codex] Suite`, () => { … })
describe(`[harness:opencode] Suite`, () => { … })
```

The attestation floor reads the `ancestorTitles` array from the vitest JSON reporter — the tag is on the describe block, not the leaf test title. The regex `/\[harness:([a-z-]+)\]/` extracts the harness name and routes each assertion into the correct bucket.

The `SUPPORTED_HARNESS_LANES` table in `packages/server/src/harness/__tests__/provision-real-session.ts` derives `describeTag` mechanically from `harnessName`, so the tag and the `requireHarness` gate always name the same harness — a typo in one is visible as an inconsistency in the other.

---

## How the two gates interlock

| Gate | What it checks | When it fires |
|---|---|---|
| Lint coverage rule | Source declares `requireHarness` for every supported harness | `npm run lint` |
| Attestation per-harness floor | Every supported harness actually executed at least one assertion | `npm run verify` → `check-attestation.ts` |

The lint check gates the source; the attestation gates execution. Together, a subset-covered harness test cannot pass lint, and a full-coverage test whose lanes all silently skip cannot mint a green attestation.

---

## The 4-harness matrix tests

`packages/server/src/harness/__tests__/AR2-provision-real-session.integration.test.ts` is the first test that satisfies both gates for all four harnesses. It drives each through production `provisionSession()` and is the reference implementation adopted by AR3–AR6 (conversion complete as of AR6).

`packages/server/src/__tests__/bet-decomposition-real-agent.integration.test.ts` (AR5) drives each harness through the production **decomposition** path — `runBetDecomposition` Branch 3 → `runRealPmTurn` — not through `provisionSession`. This is a distinct seam; the two test files prove complementary things: AR2 proves "a real session runs to completion under each harness," AR5 proves "a real agent decomposes a bet and the tasks land in the DB."

### Reusable matrix helpers

`packages/server/src/harness/__tests__/provision-real-session.ts` exports:

| Export | Purpose |
|---|---|
| `SUPPORTED_HARNESS_LANES` | Canonical four-lane table — each lane carries `harnessName`, `describeTag`, and a `prepFn` that provisions per-harness auth, adapter, and params |
| `runThroughHarness(lane, ctx)` | Loop runner: calls `prepFn`, creates a `SandboxCapture`, assembles `ProvisionSessionDeps`, calls `provisionSession`, returns `{ result, cap }` |
| `createSandboxCapture()` | Capture handle for the `onBeforeTeardown` seam |
| `startMcpBridgeServer()` | Ephemeral MCP bridge server on a random port (required by CLI lanes) |
| `provisionClaudeSandbox()` | Provisions `.mcp.json` + `.claude/settings.json` in a sandbox for the claude lane |
| `provisionCodexHome()` | Copies `auth.json` + `config.toml` into `.codex-home/` (NOT SQLite files — they cause file-lock exits) |
| `provisionOpencodeHome()` | Copies `auth.json` into `.opencode-data/opencode/` for XDG isolation |
| `initGitRepo()` | Creates an empty git repo in the sandbox (codex requires a git repo in cwd) |

**Adoption pattern (AR3–AR6, complete):**

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

**Decomposition pattern (AR5) — use `decompositionDepsForLane`, not `runThroughHarness`:**

For tests that drive the real decomposition path (`runBetDecomposition` Branch 3 / `runRealPmTurn`), use `provision-real-decomposition.ts` instead. The two helpers are for different seams — do not unify them.

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

The assertion is fail-closed: an empty or unparseable model response → `blocked/empty` → the `"done"` check fails.

---

## Known honest behavior differences across harnesses

Findings surfaced by real matrix runs (AR2 + AR5):

### `builtin` + `claude` → `completed`; `codex` + `opencode` → `not_returned` (on file-write tasks)

`builtin` and `claude` fire the MCP return tool (`send_message`) in response to the task prompt — outcome `"completed"`. `codex` and `opencode` do real billable work on the file task but do not call the MCP return tool — outcome `"not_returned"` (the return-gate enforcer triggers but they exhaust the force budget). This is honest harness behaviour on a file-write task, not a test gap. The correct assertion is:

```ts
expect(["completed", "not_returned"]).toContain(result.outcome);
expect(result.outcome).not.toBe("crashed"); // a crash = stub or binary failure
```

A `"crashed"` outcome on any harness is a hard fail — a real run does not crash.

### Codex cost always 0 (deferred to AR3)

Codex emits `turn.completed` with a `usage` block, not the claude-stream-json `result` event with `total_cost_usd`. The `CliHarnessAdapter` cost extraction fires only on `type === "result"` — so `totalCostCents` is always `0` for codex. The `costField: "total_cost_usd"` in `CLI_TOOL_CONFIGS.codex` is vestigial and never fires. Do not assert `totalCostCents > 0` for codex — it always fails. Fix is deferred to AR3 (`turn.completed` cost extraction).

### opencode `tool_use` event mapping (fixed in AR2)

opencode emits tool calls on a `tool_use` event that `harness-event-normalization.ts` was not mapping to the `tool_call` harness event. AR2 ships the fix: the normalizer now maps `tool_use` → `tool_call` for opencode so `isReturnAction` receives the tool name and the return gate fires correctly.

### opencode completion event carries `part.text`, not top-level `text` (fixed in AR5)

opencode's stream emits completion events where the text lives in `event.part.text`, not `event.text`. `harness-event-normalization.ts` was reading `event.text` (undefined for opencode) — so every opencode completion normalized to an empty string. AR5 ships the fix: the normalizer now reads `event.part?.text ?? event.text` for opencode completion events. Surfaced by the AR5 real-harness decomposition run (`bet-decomposition-real-agent`).

### CLI harnesses emit multiple completion events per session (surfaced in AR5)

During a CLI session, adapters emit several completion events in sequence: init/system lifecycle events produce empty completions, intermediate streaming blocks carry partial text, and the final `result` event carries the full response. Code that returns on the first `completion` event receives `""` and triggers `blocked/empty`. Always collect the **last non-empty** completion text across the stream. `drainForCompletion` in `bet-decomposition.ts` implements this correctly; the `runThroughHarness` session path drains the MCP return action instead and is not affected.

---

## `BUILTIN_ONLY_INTEGRATION` carve-out (AR4)

Some production paths are **builtin-only by construction** — the path cannot run a CLI harness regardless of test configuration. The canonical case is `runAssistantTurn`:

- It builds `SessionConfig` internally with `sandboxPath: ""` (hardcoded, `assistant-turn.ts:466`). `CliHarnessAdapter.startSession` spawns with `cwd: config.sandboxPath` — an empty `cwd` crashes the CLI at startup.
- It writes no `.mcp.json` MCP bridge file. `claude` and other CLI harnesses require one (`--mcp-config .mcp.json`); `provisionSession` is what writes it; `runAssistantTurn` does not call `provisionSession`.

Forcing CLI lanes onto `runAssistantTurn` would test a path that does not exist in production. That is the exact "phantom gate" the track header warns against.

**The `BUILTIN_ONLY_INTEGRATION` list** in `scripts/lib/honest-harness-predicate.ts` registers these genuinely-builtin-only files. A file on this list:

- Is **exempted** from the 4-harness coverage rule (Gate 1).
- **Still enforced** for: (a) zero stubs / no `vi.mock` of harness seams, (b) no `skipIf`-on-absent gates, (c) must declare `requireHarness("builtin")` — a builtin-only file that declares _no_ harness is still a violation.

The carve-out is not a weakening. The 4-harness obligation stays fully enforced via files that genuinely flow through `provisionSession` or another real harness seam. During AR3/AR4/AR5 consolidation, the builtin-only assistant real files were removed: assistant service behavior remains in deterministic service/unit tests, and real conversational harness capability is proven by the full-matrix `AR4a-conversational-reply-row.integration.test.ts`.

**Why not the coverage-debt allowlist?** `coverage-debt.allowlist.json` means "below 4 harnesses _temporarily_, will reach 4." A builtin-only path will _never_ reach 4 — using it would be a permanent lie ("debt to be paid"). The carve-out states the truth: this path is builtin-only by construction.

**Attestation floor — unaffected.** The per-harness floor (`assertPerHarnessFloor`) checks whether each supported harness had ≥1 executed assertion across the selected set. The retained full-matrix files loop all four lanes, so no builtin-only file is needed to satisfy the floor.

### Files in `BUILTIN_ONLY_INTEGRATION`

None. Keep this list empty unless a future production path structurally cannot run CLI harnesses and still must be tested as a harness-facing integration.

---

## Dispatch → provision → real-agent seam (AR4)

AR4 converted task-dispatcher and session-route happy paths from stubbed adapters to real-harness integration. AR3/AR4/AR5 consolidation then removed duplicate per-workpackage files and kept the shared journey tests:

`transitionTask(db, eventBus, taskId, "accepted")` → `drainQueue` → `resolveProvisionSession()` (registry-injected `provisionSession`) → real `HarnessAdapter` → `endSession` teardown.

**Production touch:** `TaskDispatcherDeps` gained an optional `onBeforeTeardown` field (additive, preserves the existing API). `drainQueue` threads it into the `provisionSession` deps so the dispatched agent's sandbox is observable via `createSandboxCapture` — the same seam AR2 added to `ProvisionSessionDeps`. The capture fires after drain, before teardown deletes the sandbox.

**Real trigger, not seeded `in_progress`:** the AC2 keystone test uses `transitionTask(..., "accepted")` as the real dispatcher entry. No `state:"in_progress"` seed inside the converted assertion — that seam-bypass is what the AR track exists to kill.

**Honest floor (matches AR2):** `builtin` + `claude` reliably reach `outcome="completed"` (fire `send_message`); `codex` + `opencode` reach `outcome="not_returned"` (real billable work, no MCP return call). `"crashed"` on any lane is an unconditional hard fail — a startup crash producing zero real agent work must not mint green.

**Per-harness real models (AR4 founder defaults):**

| Harness | Model | Notes |
|---|---|---|
| builtin | `deepseek/deepseek-v4-pro` | OpenRouter slug; seeded as `modelId` in agent row |
| claude | `claude-opus-4-8` | Passed via `--model` flag |
| codex | _(native default gpt)_ | No `{{model}}` placeholder in codex args template; field is metadata-only |
| opencode | `openrouter/moonshotai/kimi-k2.7-code` | Provider-prefixed; opencode's `--model` flag requires the `openrouter/` prefix |

### Consolidated AR3/AR4/AR5 matrix tests

| File | Role |
|---|---|
| `session-dispatch-wiring.integration.test.ts` | Accepted task → dispatcher → real session row |
| `nonblocking-session-creation.integration.test.ts` | `POST /api/sessions` returns 202 and the real run reaches terminal state |
| `provisioning-single-tool-execution.integration.test.ts` | Real agent tool call executes exactly once |
| `session-cost-per-step-delta.integration.test.ts` | Real session cost delta is persisted correctly |
| `AR4a-conversational-reply-row.integration.test.ts` | Conversational assistant path persists a non-empty assistant reply across all harnesses |
| `minimal-strategy-session.integration.test.ts` | Real session runs under the real minimal strategy |
| `bet-decomposition-real-agent.integration.test.ts` | Real agent decomposes a bet and persists tasks |

### Builtin assistant-turn runner (AR4)

`runAssistantTurnThroughHarness(ctx, params)` in `provision-real-session.ts` is the vehicle for the builtin-only files. It:

1. Builds a **real builtin `AdapterPool`**.
2. Constructs a **real OpenRouter `CredentialResolver`** from `OPENROUTER_API_KEY` — the builtin harness's only key (never Anthropic, per the harness-key model).
3. Seeds the agent row with `modelProvider: "openrouter"` + a real `modelId` so `resolveAgentModel` yields a runnable model.
4. Calls `runAssistantTurn({db, eventBus, adapterPool, credentialResolver}, params)`.

The credential step is load-bearing: without a real resolver, `runAssistantTurn` falls to the else-branch that requires `ANTHROPIC_API_KEY` — which never exists — and persists a `missing_key` notice instead of running a real turn.

---

## Files at a glance

| File | Role |
|---|---|
| `scripts/lib/honest-harness-predicate.ts` | `SUPPORTED_HARNESSES` + `isHarnessIntegrationPath` |
| `scripts/honest-harness-guard.ts` | Lint rule: stub check + coverage check |
| `scripts/coverage-debt.allowlist.json` | Files not yet converted to full-matrix coverage |
| `scripts/honest-harness-guard.allowlist.json` | Files not yet converted from stub to real harness |
| `scripts/lib/attestation-floor.ts` | `extractAgenticCounts` + `assertPerHarnessFloor` |
| `scripts/verify-attest.ts` | Writes `agenticExecutedByHarness` into signed attestation |
| `scripts/check-attestation.ts` | Calls `assertPerHarnessFloor` on `agenticExecutedByHarness` |
| `packages/server/src/harness/__tests__/require-harness.ts` | `requireHarness` hard-fail helper; mirrors `SUPPORTED_HARNESSES` |
| `packages/server/src/harness/__tests__/provision-real-session.ts` | `SUPPORTED_HARNESS_LANES` + `runThroughHarness` + `runAssistantTurnThroughHarness` + helpers |
| `packages/server/src/harness/__tests__/AR2-provision-real-session.integration.test.ts` | Reference 4-harness matrix test |
| `packages/fabric/src/services/task-dispatcher.ts` | AR4: `TaskDispatcherDeps.onBeforeTeardown` (additive optional field) |
| `packages/server/src/harness/__tests__/provision-real-decomposition.ts` | `decompositionDepsForLane` — builds `BetDecompositionDeps` with a real `AdapterPool` for each harness lane, forces Branch 3 by omitting the `runDecompositionTurn` override (AR5) |
| `packages/server/src/__tests__/bet-decomposition-real-agent.integration.test.ts` | 4-harness decomposition matrix test (AR5) — asserts ≥1 persisted task + `decompositionStatus=done` from a real agent |
