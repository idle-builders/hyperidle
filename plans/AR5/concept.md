# AR5 — Concept

## Verdict: NO new or reshaped noun

AR5 is a **test-honesty conversion** of an existing, already-conceptualized flow. It introduces zero primitives, zero domain nouns, zero load-bearing vocabulary. The probes below confirm this and name the docs that already own every concept AR5 touches, so the architecture phase can proceed without concept work.

This file exists to record the negative result (per the pipeline rule: confirm, don't invent).

## What AR5 actually changes

The *fidelity of five test files*, not the system under test. The production contracts are frozen by spec ("Preserve the dispatcher's existing contracts; this changes the test fidelity, not the dispatch API"). AR5 splits each file's assertions into:

- **agent-driven** → real-harness `*.integration.test.ts` (real strategy agent produces the decomposition).
- **pure-logic** → honest `*.test.ts` unit (deterministic transform over a *supplied* decomposition).

No code under test is reshaped. The only "new" artifacts are test files and allowlist/config edits.

## Probe 1 — Is there a New or Reshaped noun?

Every noun in the AR5 surface is already defined and shipped:

| Noun | Status | Owner doc / code |
|---|---|---|
| **Bet** | Existing | `docs/process-layer/bets-shape-commit-change-ship.md` |
| **Task** | Existing | `docs/process-layer/task-lifecycle.md` |
| **Decomposition** | Existing | `docs/process-layer/decomposition-practice-grounded-decentralized.md` (§7: each agent decomposes their stream; the PM integrates) |
| **Strategy** (port) | Existing | `docs/architecture/kernel-strategy-split.md`; `packages/shared/src/strategy-port.ts` — `decomposeBet(req): Promise<DecompositionPlan>` is the 5th port method (shipped AK8) |
| **DecompositionPlan / DecomposeBetRequest / DecompositionTaskInput / DecompositionStatus / DecompositionBlockerReason** | Existing | `packages/shared/src/strategy-port.ts` + `@hyperidle/shared` (shipped AK3/AK8) |
| **provisionSession / SUPPORTED_HARNESS_LANES / runThroughHarness / createSandboxCapture** | Existing | AR2 — `packages/server/src/harness/__tests__/provision-real-session.ts` |
| **requireHarness / SUPPORTED_HARNESSES / honest-harness-guard / agentic floor** | Existing | AR1 — `scripts/lib/honest-harness-predicate.ts`, `scripts/lib/attestation-floor.ts`, `packages/server/src/harness/__tests__/require-harness.ts` |
| **Harness integration vs unit (the two archetypes)** | Existing | `.claude/rules/testing.md` §Integration tests: two archetypes |

No row is New. No row is Reshaped. AR5 consumes all of them at their current shape.

## Probe 2 — Is "real-agent decomposition" a concept AR5 must define?

No — it is already defined twice over:

1. **Domain**: `decomposition-practice-grounded-decentralized.md` §7 already says a real agent (the PM, integrating each member's stream) turns a committed bet into a task list. That *is* the agent-driven decomposition AR5's converted tests must prove.
2. **Production seam**: `bet-decomposition.ts` already implements the real path (`runRealPmTurn`, Branch 3): a real `SessionConfig` with `tools:[]`, driven through a harness adapter, whose JSON completion is parsed into `DecompositionTaskInput[]`. The current tests *bypass* this via the `runDecompositionTurn` override / `EchoHarnessAdapter`. AR5 makes the agent-driven assertions actually walk Branch 3 on a real binary; it does not invent the seam.

The "honest split" is a testing-discipline act, fully owned by `.claude/rules/testing.md`. It needs no new concept.

## Probe 3 — Vocabulary collisions / drift to guard against

One naming hazard the architecture phase must respect (not a new concept, a constraint):

- **`runDecompositionTurn` is a test seam, not an agent.** The override branch (Branch 2 in `runBetDecomposition`) injects a deterministic task list — it is *pure post-processing of a supplied decomposition*. A test using it is therefore a **unit** test by the two-archetypes rule, regardless of its current `.integration` suffix. The architecture triage must classify every override-based assertion as pure-logic → demote. Only assertions that exercise **Branch 3** (real `runRealPmTurn` on a real harness) or whose output genuinely depends on a real agent's decomposition qualify as agent-driven → convert.
- **`EchoHarnessAdapter` is the scripted-seam smell.** Its presence in a `*.integration.test.ts` is exactly the false-integration the track exists to kill. Any file retaining it after AR5 is wrong by construction.

## Concept docs the downstream phases should read

- `docs/process-layer/decomposition-practice-grounded-decentralized.md` (what a real decomposition *is*).
- `docs/architecture/kernel-strategy-split.md` (the Strategy port; why decomposeBet is a Strategy decision, not a Kernel constant).
- `.claude/rules/testing.md` §Integration tests: two archetypes (the rule the conversion enforces).

## Conclusion

No `/concept` work product is needed beyond this confirmation. AR5 proceeds directly to `/architecture`. The architecture's core deliverable is the per-file, per-assertion triage table — a test-fidelity decision, not a concept definition.
