# AR2 — Retro Observations

## Summary

AR2 succeeded: one production-seam test (two lanes, two harnesses) proving the real `provisionSession()` orchestrator, real model, real teardown flow. The capture-before-teardown seam is minimal, production-safe, and reusable. All acceptance criteria met.

The run surfaced three instructive patterns:

1. **Spec staleness caught early by design.** The initial spec naively prescribed extending `filesystem_captures` (migration 0041). Neither table existed. Architect caught it, pivoted to a test-observable seam (no DB table, no migration). Spec premise bugs are architecture work, not build work.

2. **Real tests expose real bugs.** The W1 production regex bug (`isReturnAction` MCP namespace stripping) was wrong end-to-end (CLI+MCP sessions verdicted wrong). A test is only as honest as its execution path — stubs bury this bug forever. Once corrected, the unit test locked it in deterministically.

3. **Builtin lane fitness is model-dependent.** Cheap OpenRouter models don't reliably call `commit_file`, so Lane 1 can't prove AC2 (file capture). Lane 2 (native Write via claude CLI) is the load-bearing proof. The split is honest and documented.

---

## Signals & Costs

### Win: Spec pivot → minimal production change

The concept naively prescribed extending `filesystem_captures` (migration 0041). Neither table existed. Architect caught it, pivoted to a simple test-only seam on `ProvisionSessionDeps` (optional field + one hook call site). Final: 60 LOC added to session-provisioning.ts (the hook + context interface), zero schema/migration, zero API surface change. **Cost for this course correction: zero — it was caught before any implementation.**

### Friction: Production fix gated on test honesty (W1 regex bug)

A real agent turn exposed the MCP namespace stripping regex bug (`/^mcp__[^_][^_]*__/` forbids underscores in server name). This is the exact class of bug stubbed tests can never find. The fix (`/^mcp__.+?__/` non-greedy) is one-line production code + four-line unit test. But the test can only be honest because AR1 laid down `requireHarness` and the hard-fail gate. Without AR1, the builder would have stubbed the test to pass and shipped the broken regex. **Cost signal: honesty is non-negotiable; real-harness tests found this, stubs would have buried it. This is why AR1 comes first.**

### Friction: Rebase + lockfile churn (C2 blocker, Phase 4)

The merge-base drifted (1 commit behind origin/main). The lockfile delta (~100 lines) was benign churn (phantom `@anthropic-ai/claude-agent-sdk` removal that main already did). Rebase cleaned it up. **Cost signal: stale base = phantom failures + CI/verify diff noise. Always fresh-rebase before review starts.** Also signals: feature branches live ~2 days; by end of Phase 4 (review), the base can drift. Rebase is part of the review loop.

### Win: Cheap lane (builtin) + strong lane (claude CLI)

The two-lane pattern is honest about model limitations. Lane 1 (builtin + OpenRouter mini) is cheap and parallel-safe (~30s). Lane 2 (claude CLI + native Write) is the load-bearing AC2 proof (File was written by the real agent via real tool, captured before teardown). **Cost signal: not all models are created equal for testing; cheap ≠ honest. The cost tradeoff (slow second lane, binary gated) is worth the truth.**

### Observation: Test infrastructure cost is upfront, then amortized

AR2 exports `createSandboxCapture` + `startMcpBridgeServer` from `provision-real-session.ts`. AR3–AR6 import those unchanged. The four-step recipe is repeatable. **Cost signal: good test infrastructure is expensive to design once, cheap to reuse. The payoff is proportional to how many tests follow.**

---

## Acceptance Criteria & Proof

| AC | Evidence | Proof |
|---|---|---|
| **AC1** — Real `provisionSession()`, real adapter, real model, assert real output | Both lanes call production `provisionSession(deps, params)`. Lane 1: `BuiltinHarnessAdapter` + OpenRouter (real model call, `result.totalCostCents > 0`). Lane 2: `CliHarnessAdapter(CLAUDE_CLI_CONFIG)` + native claude CLI (real write, `cap.files.get("answer.txt")`). | Real run through production orchestrator, no bespoke rig, no stubs. Sanity-break verified (red commit `0adf2215`: seam absent → test read empty → genuine red). |
| **AC2** — Capture seam observes output before teardown deletes | Seam fires in `runSession` after event-drain and before `endSession`'s `fs.promises.rm` (session-lifecycle.ts:341). Lane 2 asserts `cap.files.get("answer.txt").toContain("4")` — pure-sandbox file. | Wiring verified. Lane 2 load-bearing (native Write file, only observable via seam). Lane 1 proves seam-fired signal (`totalCostCents > 0`). Teardown not weakened (try/catch-swallow, unconditional rm). |
| **AC3** — `requireHarness` hard-fail, never skip | Lane 1: `requireHarness("builtin")`. Lane 2: `requireHarness("claude")`. No `skipIf`. No `ANTHROPIC_API_KEY`. | Absent harness → test throws "harness not installed — cannot complete." No green with every test skipped. |
| **AC4** — Extractable pattern for AR3–AR6 | `createSandboxCapture()` + `startMcpBridgeServer()` exported from `provision-real-session.ts`. Four-step recipe JSDoc'd. Both helpers consumed by both lanes. | Helpers are repeatable, no test-specific coupling. AR3–AR6 import unchanged. |

---

## Phase 4 Findings — All Resolved

### C1 — W1 production change (`isReturnAction`) ships with no deterministic test (RESOLVED)

The `stripMcpNamespace` regex fix alters production verdict logic for every CLI+MCP session. The only proof was the real-claude integration test (slow, model-dependent). **Fix:** added deterministic unit suite `AL6-return-actions.closure.test.ts:109-143` with four assertions:
- `mcp__hyperidle__send_message` → true
- `mcp__my_server__send_message` → true (underscore-server edge case; would fail under old regex)
- `mcp__hyperidle__update_task_status` → false
- `send_message` → true (bare name, builtin path)

Load-bearing: the underscore-server case would FAIL under the old regex and now PASSES, locking in the deterministic proof.

### C2 — Branch stale; rebase + lock churn (RESOLVED)

Branch was 1 commit behind origin/main. Lockfile delta (~100 lines) was benign churn of phantom `@anthropic-ai/claude-agent-sdk` removal. **Fix:** rebased onto current origin/main. Lock delta is now only benign `libc` field removals.

### W-1 — Regex fragile (RESOLVED)

Old regex: `/^mcp__[^_][^_]*__/` forbade underscores in server name. Fixed to `/^mcp__.+?__(.+)$/` (non-greedy, any server name).

### W-2 — Lane 1 file assertion tautology (RESOLVED)

Lane 1's `cap.files instanceof Map` was dead weight. Dropped. Lane 1 now asserts only `result.totalCostCents > 0`. Lane 2 carries AC2 proof.

### O-1 — Garbled comment (RESOLVED)

Line-397 comment replaced with one clean sentence.

---

## Key Learnings for AR3–AR6

1. **Test infrastructure is reusable.** Both helpers are exported and documented. Next WPs import unchanged.
2. **Real tests find real bugs.** The W1 regex bug only surfaced via a real agent turn. Stub tests bury such bugs forever.
3. **Two-lane pattern is honest about model limitations.** Cheap ≠ Honest. Both run, both gate on the real harness.
4. **Spec premises need architecture vetting.** Always review spec against reality before build starts.
5. **Stale base = noise.** Always work on a fresh-rebased feature branch.
