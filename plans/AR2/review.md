# AR2 — Code Review (Phase 4)

**Verdict: NOT DONE** — one blocking gap (W1 production behavior change ships with zero deterministic test) plus a stale base that must be rebased before ship. The seam, the helper, and the two-lane real-integration test are correct and honest; the ACs are substantively met. The blockers are closeable in the build PR without redesign.

Reviewer ground-truthed every load-bearing claim against the real code: `session-provisioning.ts` (seam location + control flow), `return-actions.ts` (regex behavior tested with node), all three `isReturnAction` consumers, `commit-file.ts:39` (write target), the red commit `0adf2215` (genuine red), `honest-harness-guard --check` (clean), the AL6 closure unit test (passes), and the merge-base vs current `origin/main` lockfile state.

---

## AC table

| AC | Covered? | Evidence |
|---|---|---|
| **AC1** — real `provisionSession()` + real adapter + real model, assert on real output | **PASS** | Both lanes call production `provisionSession(deps, params)` (no bespoke rig). Lane 1 = `BuiltinHarnessAdapter` + real OpenRouter model; Lane 2 = `CliHarnessAdapter(CLAUDE_CLI_CONFIG)` (real `claude` binary). Both assert `result.totalCostCents > 0` (a stub yields 0). Zero stubs — grep for Scripted/Echo/Capturing/Mock/`vi.mock`/`skipIf` = NONE; `honest-harness-guard --check` clean. |
| **AC2** — capture-before-teardown seam observes output before `:341` rm | **PASS (Lane 2 load-bearing)** | Seam fires in `runSession` after `adapterPool.release` (drain done, `stopSession` done) and before the `if (crashed)` dispatch — verified the single fire-point precedes all four teardown branches and every `endSession` `rm`. Lane 2 asserts `cap.files.get("answer.txt")` contains "4" — a pure-sandbox native-Write file with no other channel. Sanity-break confirmed real: in red commit `0adf2215` the seam was absent from production (`onBeforeTeardown` count 0) and the test asserted on `cap.files` → genuine red. Teardown not weakened: try/catch-swallow, unconditional teardown afterward. |
| **AC3** — `requireHarness` hard-fail, never skip | **PASS** | Lane 1 `requireHarness("builtin")` (OPENROUTER_API_KEY), Lane 2 `requireHarness("claude")` (binary). No `skipIf`. No `anthropic-key`/`openai-key` token. |
| **AC4** — extractable pattern for AR3–AR6 | **PASS** | `createSandboxCapture()` + `startMcpBridgeServer()` in `provision-real-session.ts`, both consumed by both lanes, four-step recipe JSDoc'd. Genuinely reusable (returns `{onBeforeTeardown, files}` / `{registry, baseUrl, close}`), no test-specific coupling. Pointer added to `testing.md`. |

All four ACs are met **as written**. The NOT DONE verdict is driven by the W1 collateral change (below) and the stale base, not by an AC miss.

---

## CRITICAL

### C1 — W1 production behavior change (`isReturnAction`) ships with no deterministic test
`packages/shared/src/harness/return-actions.ts` — `stripMcpNamespace()` + the changed `isReturnAction()` alter production verdict logic for **every** CLI+MCP session (return-gate.ts:35, cli-harness-adapter.ts:813, builtin-harness-adapter.ts:576/830 all consume it). The only proof is the **real-claude integration test** (`session-provisioning.integration.test.ts`, assertion flipped `not_returned`→`completed`) — slow, binary-gated, nondeterministic. The natural unit home, `AL6-return-actions.closure.test.ts`, sits right beside the change and was **not** extended; it still passes (13/13) precisely because it never exercises a namespaced name.

This violates validation-before-implementation: a pure-logic behavior change in `shared` must have a fast deterministic unit asserting `isReturnAction("mcp__hyperidle__send_message") === true` and a bare/unknown name passes through unchanged. Without it, a future refactor of the regex regresses silently on every machine without `claude` installed.

**Fix:** add ~4 assertions to `AL6-return-actions.closure.test.ts` (namespaced returns true; bare still true; non-MCP unchanged; `mcp__hyperidle__update_task_status` still false). The baseline-test flip is a genuine fix (revert `stripMcpNamespace` → `isReturnAction` returns false on the namespaced name → `not_returned` → assertion goes red for the right reason), but a real-LLM test is not adequate sole proof of a deterministic string transform.

### C2 — Branch is on a stale merge-base; rebase before ship
The 104-line `package-lock.json` deletion of `@anthropic-ai/claude-agent-sdk-*` platform packages is **benign drift, not a regression**: the merge-base (`dd3795c`) lock still contained them; current `origin/main` (`0d60d78`) already removed them. The branch is 1 commit behind and its lockfile diverges from current main by ~13.7k lines. After rebasing onto current `origin/main` this delta disappears. **Do not revert the lock change** — rebase. This is the known stale-install/stale-base gotcha; trust check/test only after `npm ci` post-rebase. (Flagged CRITICAL because shipping on the stale base risks phantom verify failures and an attestation merge-ref drift.)

---

## WARNINGS

### W-1 — `stripMcpNamespace` regex rejects server names containing underscores
`return-actions.ts` — `/^mcp__[^_][^_]*__(.+)$/`. The `[^_]` server segment means `mcp__a_b__send_message` returns **unchanged** (verified via node). The real server name is hardcoded `hyperidle` (`mcp-bridge.ts:129`, no underscore), so production is correct **today** — but the regex is fragile and lies about generality (the JSDoc says "Pattern: `mcp__<server>__<name>`"). A non-greedy `/^mcp__.+?__(.+)$/` matches the documented contract. Not blocking (real case works), but a latent trap.

### W-2 — Lane 1 W2-demotion is honest and correct, but leaves Lane-1 AC2 unproven (acceptable)
Lane 1 asserts only `result.totalCostCents > 0` + `cap.files instanceof Map` (file assertion demoted because cheap OpenRouter models don't reliably call `commit_file`). This is the honest split: Lane 1 carries AC1/AC4 + seam-fires; Lane 2 (native Write) is the load-bearing AC2 proof. Lane 1 is still a **real integration** (real model call, real cost). Correct call. `cap.files instanceof Map` is a tautology (it is always a Map) — it proves nothing about the seam; the seam-fired signal for Lane 1 is really `totalCostCents > 0` (run completed → seam in the path). Drop the `instanceof Map` assertion or replace with something meaningful (it's filler).

### W-3 — Lane 1 retry loop can collide on `maxConcurrentSessions`
The candidate loop reuses the same `taskId`/`agentId` (`maxConcurrentSessions: 1`). If candidate-1 throws a non-auth error mid-`runSession` before teardown sets the session terminal, candidate-2's `admitSession` throws `ConcurrencyLimitError` (non-auth → recorded as `lastError`), exhausting the loop with a misleading "all candidates failed" message. Low-likelihood (gpt-4o-mini almost always resolves first try) but the failure mode is confusing. Consider re-seeding or a fresh taskId per candidate, or documenting the limitation.

---

## OBSERVATIONS (slop / cleanliness — non-blocking)

- **O-1 — garbled comment, line 397** of the AR2 test: three trailing-comment fragments concatenated into one nonsensical line (`// drops to one turn; until then... // AL6 re-prompt loop. Once... // 240s: matches...`). Clearly a botched edit. Replace with one clean sentence.
- **O-2 — `console.warn` in production** (`session-provisioning.ts`, seam catch) with `biome-ignore noConsole: observability adapter not yet stood up`. Consistent with the file's existing pattern and the ignore is honest; acceptable.
- **O-3 — `// biome-ignore noExplicitAny` on the Lane 2 `bridge` type** (test, line 305): the helper already exports a typed return (`McpBridgeRegistry`); the local could be typed `Awaited<ReturnType<typeof startMcpBridgeServer>> | null` instead of `any`. Minor.
- **O-4 — seam is the minimal change.** One optional dep field + one context interface + ~6 lines in `runSession`; `ProvisionSessionResult` untouched; no schema/migration. Mirrors `onHarnessStarted`. No over-engineering. The stale-premise pivot (no `filesystem_captures` table) is correct.

---

## Security / Adversarial / Simplification summary
- **Security:** no new endpoints, no user-input boundary, no auth surface. Seam is test-only (production callers omit it). `commit-file.ts` sandbox-containment check unchanged. Nothing to flag.
- **Adversarial:** seam cannot weaken teardown (try/catch-swallow, unconditional rm). No backdoor. Tests are not weakened — they assert on real bytes/real cost, sanity-break verified. The only "test bent to pass" candidate (baseline `not_returned`→`completed`) is a genuine fix, not theater.
- **Simplification:** helper is genuinely reused (AC4), not single-use. No dead code beyond O-1/W-2.

---

## What closes the verdict
1. (C1) Add deterministic unit assertions for namespaced `isReturnAction` in `AL6-return-actions.closure.test.ts`.
2. (C2) Rebase onto current `origin/main`; `npm ci`; re-verify (lock delta vanishes).
3. (W-1) Loosen the regex to `^mcp__.+?__(.+)$`.
4. (W-2/O-1) Drop the `instanceof Map` filler; fix the line-397 comment.

Files: `/Users/tg/hyperidle/.worktrees/AR2/packages/shared/src/harness/return-actions.ts`, `/Users/tg/hyperidle/.worktrees/AR2/packages/server/src/tools/__tests__/AL6-return-actions.closure.test.ts`, `/Users/tg/hyperidle/.worktrees/AR2/packages/server/src/harness/__tests__/AR2-provision-real-session.integration.test.ts`, `/Users/tg/hyperidle/.worktrees/AR2/packages/server/src/services/session-provisioning.ts`.
