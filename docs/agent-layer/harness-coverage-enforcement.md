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

**Staged debt:** files not yet converted to the full matrix are listed in `scripts/coverage-debt.allowlist.json`. Both allowlists shrink monotonically as AR3–AR6 convert the remaining stubbed tests. The allowlist is a safety valve — adding a new file to it requires a deliberate edit.

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

## The 4-harness matrix test

`packages/server/src/harness/__tests__/AR2-provision-real-session.integration.test.ts` is the first test that satisfies both gates for all four harnesses. It drives each through production `provisionSession()` and is the reference implementation for AR3–AR6.

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

**AR3–AR6 adoption pattern:**

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

---

## Known honest behavior differences across harnesses

Both findings were surfaced by the AR2 real matrix run:

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

---

## `BUILTIN_ONLY_INTEGRATION` carve-out (AR4)

Some production paths are **builtin-only by construction** — the path cannot run a CLI harness regardless of test configuration. The canonical case is `runAssistantTurn`:

- It builds `SessionConfig` internally with `sandboxPath: ""` (hardcoded, `assistant-turn.ts:466`). `CliHarnessAdapter.startSession` spawns with `cwd: config.sandboxPath` — an empty `cwd` crashes the CLI at startup.
- It writes no `.mcp.json` MCP bridge file. `claude` and other CLI harnesses require one (`--mcp-config .mcp.json`); `provisionSession` is what writes it; `runAssistantTurn` does not call `provisionSession`.

Forcing CLI lanes onto `runAssistantTurn` would test a path that does not exist in production. That is the exact "phantom gate" the track header warns against.

**The `BUILTIN_ONLY_INTEGRATION` list** in `scripts/lib/honest-harness-predicate.ts` registers these genuinely-builtin-only files. A file on this list:

- Is **exempted** from the 4-harness coverage rule (Gate 1).
- **Still enforced** for: (a) zero stubs / no `vi.mock` of harness seams, (b) no `skipIf`-on-absent gates, (c) must declare `requireHarness("builtin")` — a builtin-only file that declares _no_ harness is still a violation.

The carve-out is not a weakening. The 4-harness obligation stays fully enforced via the files that genuinely flow through `provisionSession` (AD2-real + R1-real). The `BUILTIN_ONLY_INTEGRATION` exemption only removes the CLI lanes that the production code path cannot run.

**Why not the coverage-debt allowlist?** `coverage-debt.allowlist.json` means "below 4 harnesses _temporarily_, will reach 4." A builtin-only path will _never_ reach 4 — using it would be a permanent lie ("debt to be paid"). The carve-out states the truth: this path is builtin-only by construction.

**Attestation floor — unaffected.** The per-harness floor (`assertPerHarnessFloor`) checks whether each supported harness had ≥1 executed assertion across the whole selected set. The 4-harness files (AD2-real + R1-real) loop all four lanes; each satisfies claude/codex/opencode. The builtin-only files add builtin executions. No floor change is needed.

### Files in `BUILTIN_ONLY_INTEGRATION` (AR4)

| File | Path home | Why builtin-only |
|---|---|---|
| `AH3-assistant-turn-real.integration.test.ts` | `routes/__tests__/` | `runAssistantTurn` — no sandbox / no MCP bridge |
| `AK4-assistant-draft-real.integration.test.ts` | `routes/__tests__/` | same |
| `AH6-lane-gates-broken-turn-real.integration.test.ts` | `__tests__/` | same |

---

## Dispatch → provision → real-agent seam (AR4)

AR4 converted the task-dispatcher and session-route tests from stubbed adapters to real-harness integration, exercising the full `provisionSession` path through the dispatcher:

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

### 4-harness matrix tests (AR4)

| File | Path | Role |
|---|---|---|
| `AD2-task-dispatcher-real.integration.test.ts` | `__tests__/` | Dispatcher → provision → real agent; AC2 keystone |
| `R1-wire-agent-execution-real.integration.test.ts` | `__tests__/` | POST `/api/sessions` → real `provisionSession`; AC1 |

Both loop `SUPPORTED_HARNESS_LANES` via `runThroughHarness` (no bespoke rig). Both are in `EXPLICIT_HARNESS_INTEGRATION` — not in `BUILTIN_ONLY_INTEGRATION`.

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
| `packages/server/src/__tests__/AD2-task-dispatcher-real.integration.test.ts` | AR4: dispatcher → provision → real agent (4-harness matrix) |
| `packages/server/src/__tests__/R1-wire-agent-execution-real.integration.test.ts` | AR4: POST `/api/sessions` → real `provisionSession` (4-harness matrix) |
| `packages/server/src/routes/__tests__/AH3-assistant-turn-real.integration.test.ts` | AR4: real builtin assistant turn (builtin-only) |
| `packages/server/src/routes/__tests__/AK4-assistant-draft-real.integration.test.ts` | AR4: real builtin assistant draft (builtin-only) |
| `packages/server/src/__tests__/AH6-lane-gates-broken-turn-real.integration.test.ts` | AR4: real builtin lane-gate valid-lane proof (builtin-only) |
| `packages/fabric/src/services/task-dispatcher.ts` | AR4: `TaskDispatcherDeps.onBeforeTeardown` (additive optional field) |
