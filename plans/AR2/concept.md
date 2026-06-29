# AR2 — Concept: the capture-before-teardown seam

AR2 introduces no domain primitive. The only load-bearing noun is the **capture-before-teardown seam**. This pass settles what it IS, what it ISN'T, and the contract it commits to — so the architecture and AR3–AR6 build on a fixed shape.

## Stale-premise correction (read first)

The spec says: *"AO2 added `filesystem_captures` (migration 0041) capturing some state before teardown … DECIDE: extend this vs a test-observable hook."*

**That table does not exist on this base.** Highest migration is `0040_chubby_chimera.sql`; a literal grep for `filesystem_captures` across the repo is empty (MEMORY: "Stale #370 discarded"; AO2 re-locked but the capture table never landed here). So the choice is **not** "extend an existing capture vs hook." It is "build a brand-new production capture subsystem (table + teardown-time copy) vs a thin test-observability hook." That reframes the concept decisively: a capture *table* would be a new, unearned production feature (ETHOS §security/features earned from learnings, not preemptive). The seam is the smaller, honest thing.

## What it IS

A **single optional observation point in the session run**, fired once after the agent's turn fully drains and the sandbox is completely written, but **before** any teardown deletes it. It hands the observer the live `sandboxPath` (+ `sessionId`) so a harness integration test can read the real files the real agent produced before `endSession()`'s `fs.promises.rm` (`session-lifecycle.ts:341`) removes them.

- **Identity:** a lifecycle hook, symmetric to the existing `onHarnessStarted` callback in `runSession` (post-start). This is its post-drain / pre-teardown twin.
- **Essential property:** it *observes*. The sandbox still exists when it fires; nothing it does (or fails to do) changes whether or how teardown runs.
- **Authority:** none over the lifecycle. It cannot pause, defer, or cancel teardown. Teardown runs unconditionally after it returns *or throws* (observer errors are caught and swallowed, never allowed to strand a sandbox).
- **Default:** absent. Every production caller (`startSessionProvision`, the dispatcher, routines) omits it → exact current behavior, zero new code path taken.

## What it ISN'T

- **NOT a new production concept / primitive / table.** No schema change, no migration, no `filesystem_captures`. Nothing persists. The observed bytes live only as long as the test holds them.
- **NOT a capture-back / export feature.** It does not copy sandbox work into the canonical store, git, or artifacts. That would be a real product capability (AO2's territory) and is out of scope.
- **NOT a teardown modifier.** It does not weaken, defer, gate, or make-conditional the `rm`. No leaked sandboxes — the inviolable AR2 constraint.
- **NOT a stub or fabrication.** It reads bytes a real agent really wrote on a real run. The honest-harness guard has nothing to object to: there is no scripted adapter, no `vi.mock`, no synthetic event. Observation of real output ≠ stubbing the seam.
- **NOT on the hot path.** Production never pays for it (absent → skipped). It is a test affordance that happens to live in production lifecycle code, the same way `onHarnessStarted` does.

## Contract it commits to

1. **Fires exactly once per run**, after the event-stream drain completes and the adapter slot is released, before the teardown-branch dispatch — for every outcome (completed / not_returned / budget_exhausted / crashed). At fire time the sandbox directory exists and is fully written.
2. **Receives `{ sessionId, sandboxPath }`** — read-only context. It returns `void | Promise<void>`; the run `await`s it (so a test can do async file reads) before proceeding to teardown.
3. **Cannot break teardown.** Wrapped in try/catch inside `runSession`; a throwing observer is logged and swallowed. Teardown (`endSession`/`crashSession` + `workspace.destroy`) always runs. A failed capture surfaces as a failed *test assertion* (the expected bytes were never captured), never as a leaked sandbox.
4. **Adds nothing to `ProvisionSessionResult`.** The production result type stays clean; the observer, not the result, carries test-only data. (Contrast with the rejected "snapshot-on-the-result" shape — see architecture §Decision.)
