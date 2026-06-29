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

---

## Reopened cycle — equal-harness-coverage

AR2 first **shipped** (PR #382, CI green) covering only `claude`+`builtin`, then was reopened because that violated AR1's governing rule "harness integration tests run across EVERY supported harness." The reopened cycle hardened the *gate* (not just the test) to make subset coverage non-shippable, and surfaced two more real product bugs. Three builder rounds + three review rounds.

### Signal: A shipped, CI-green WP was rejected for a rule violation no gate caught

AR2's first ship (PR #382) covered only `claude`+`builtin` — two of four supported harnesses. CI was green. The founder caught the gap by **reading the test**, not from any gate firing. honest-harness-guard only banned *stubs* (a single real `claude` lane passes it clean); the attestation floor only checked global `agenticExecuted>0` (one harness satisfies it). Neither encoded harness *breadth*. **Evidence:** `git log` shows `e059c90f chore(AR2): reopen — expand to full supported-harness matrix`; the prior cycle's done/attestation (`dcd9de2c`, `a10edf5e`, `agenticExecuted=105`) minted green on the partial matrix.

### Friction (root cause): the local spec out-competed the governing rule — the EXACT failure AR1 was built to prevent

AR2's own spec said "at least one CLI binary" (TRACK-AR.md Plan-calls, ~line 154 pre-amend) and its ACs said "a real `HarnessAdapter`" (singular) — both narrower than AR1's rule "every supported harness." All three personas (designer, builder, reviewer) + the orchestrator followed the *local* spec and shipped a conforming-to-spec, violating-the-rule WP. **Evidence:** TRACK-AR.md diff (`267548b7` amend) replaces "at least one CLI binary" with "Cover the FULL supported-harness matrix (`builtin`+`claude`+`codex`+`opencode`)" and adds AC "The test covers the FULL supported-harness matrix … NOT 'at least one CLI binary.'" The rule itself (`.claude/rules/testing.md`) was *also* edited to name `SUPPORTED_HARNESSES` explicitly — i.e. the rule was clear in intent but not mechanically pinned, so a narrower local spec won.

### Win: the fix hardened the GATE, not just the test (belt-and-suspenders)

Founder direction was to make subset coverage *mechanically* non-shippable, two independent layers:
- **Lint coverage check** (`scripts/honest-harness-guard.ts` §1): every harness-facing `*.integration.test.ts` must `declare` a `requireHarness(<name>)` lane for all of `SUPPORTED_HARNESSES` (single source in `scripts/lib/honest-harness-predicate.ts`), or be on `scripts/coverage-debt.allowlist.json` (AR3–AR6 staged debt, shrinks monotonically). Gates the *source declaration*.
- **Attestation per-harness floor** (`assertPerHarnessFloor` in `scripts/lib/attestation-floor.ts`; `agenticExecutedByHarness` keyed off `[harness:X]` describe tags via `ancestorTitles`): fails if any supported harness ran *zero* executed agentic assertions. Gates *execution*.

The lint check proves the name appears; the floor proves the lane RAN. AR2's own test is on **neither** allowlist — it fully conforms (4 lanes, `agenticExecutedByHarness` = builtin/claude/codex/opencode each `{executed:1}`). **Evidence:** committed attestation `fbcb5b2e….json` carries all four keys non-zero; `coverage-debt.allowlist.json` lists 13 AR3–AR6 files, none AR2.

### Cost: a review *non-blocker* I tightened became a real BLOCKER (W-2) — ~1 avoidable full build cycle

The round-2 review (`31aba878`) flagged W-2 — codex/opencode floor admitting `not_returned` — as **"Defensible, not blocking,"** explicitly recommending acceptance with a justifying lore reference. The orchestrator nonetheless instructed the builder to tighten the floor to require `outcome==="completed"` (`fbcb5b2e`: "tighten CLI floor to completed+cost"). Both lanes then **timed out at 240s** (survived `retry:2` → structural, not flake): codex/opencode do real work but legitimately end `not_returned` on a file-write task (they don't fire the MCP return tool), so the return-gate re-prompt loop never reached `completed`. Reverted to an honest floor — non-crash outcome (`completed|not_returned`) + best-effort `answer.txt` capture (`a4a6cfc1`). **Cost:** one extra full build+verify cycle (~10min) chasing an over-tightening the reviewer had *pre-warned* about. **Lesson:** a "tighten this" instruction to a builder needs an explicit "or raise a BLOCKER with evidence" escape that the builder must USE before shipping the tightened version — the reviewer's "not blocking" should have been the stop signal.

### Win: honest harness tests surfaced TWO more real product bugs (AR-track thesis validated again)

Expanding to the real codex+opencode lanes exposed bugs stubs would bury forever:
- **opencode `tool_use` event unmapped → would crash `provisionSession`** (`crashed=true` via `UnknownHarnessEvent`). opencode `--format json` emits `tool_use` (not `tool`), plus `step_start`/`text` lifecycle events, none handled. **Fixed** (`c7bd4a03`, `harness-event-normalization.ts`; shape verified by running opencode manually 2026-06-29). Also added `XDG_DATA_HOME` isolation for SQLite lock contention.
- **codex cost-extraction vestigial → codex cost always 0.** `CLI_TOOL_CONFIGS.codex.costField = total_cost_usd` is never emitted; codex reports via `turn.completed` + a usage block, not a `result`+`total_cost_usd` event. **Deferred to AR3, lore'd** (`@lore codex-cost-zero`).

### Cost/Signal: builders repeatedly STRANDED the long agentic verify; the orchestrator drove it

The 4-lane agentic verify is slow (~80s+ when healthy, 240s on the timeout). Builders repeatedly **backgrounded it and ended the turn** → `agenticExecuted=0` interrupted attestations. The orchestrator had to drive verify itself each round. Reconfirms the AR1 ship-loop lesson: the long agentic run must complete *in-turn*; a backgrounded verify is a non-attestation.

### Cost: where the three rounds went (and which were avoidable)

designer-amend → architecture-critique → **builder R1** (gate+matrix, `468c31e7`) → **review R1** (`31aba878`) → **builder R2** (W-1 comment-strip / M-1 exports / W-2 tighten, `fbcb5b2e`) → **review R2** → **builder R3** (W-2 honest-floor revert, `a4a6cfc1`) → **review R3** (`20605c78`). Round 1→2 was legitimate (real W-1/M-1 findings). **Round 2→3 was avoidable**: it existed only to revert the W-2 over-tightening the reviewer had already labeled non-blocking. One of three builder rounds was pure round-trip cost on a pre-warned over-correction.
