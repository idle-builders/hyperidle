# AU40 — Capture the measured `isolate: false` prize: flip the switch, keep the wipe, fix the leak cluster

## Work package

**Outcome.** The service integration lane runs with `isolate: false` and per-test database cleanup unchanged, green and stable across repeated and reordered runs, with the measured speedup recorded in CI. Everyone who touches the backend gets back the largest single cost in CI — a prize that is already measured and currently unclaimed.

**Why this matters.** The lane's cost is dominated by per-file PGlite boot (~1.47s × 324 files ≈ 476s, matching vitest's reported `setup 472.89s`). PR #477 (commit `714edc9965f77c55175a79fb02547cbb51627adf`) proved a ONE-LINE flip to `isolate: false` — with `truncateAllTables()` still running — cut CI setup from 2,831s to 40.6s and wall from 1,170s to 258s on a 2-vCPU runner. An independent counterfactual on `origin/main` (`25ae1f65b`, 2026-08-13) reproduced it locally: 299s → 94–103s wall, same test count. Cost of not doing it: every PR keeps paying roughly three times the necessary lane time for a fix that is known, measured, and bounded.

**What exists today.** The service project runs `isolate: true`; every test file pays a fresh PGlite WASM boot plus migrations because `isolate: true` gives every file a fresh module registry (see `@lore pool-does-not-span-files` in `test-pool.ts`). The one-line flip has been measured twice (PR #477 in CI, the 2026-08-13 counterfactual locally) and both times the only failures were a small, order-dependent leak cluster — NOT database-state collisions, because the wipe was still running. Measured cluster: 13 / 5 / 12 failing files across three runs, union of 23 files, stable core of 7 (`server-bind-address`, `factory-run-config`, `server-disposal`, `session-requests`, `baked-transcript-mapping`, `agent-and-team-creation-atomicity`, `threads.assistant-turn-baked-emit`). Evidence: `work/AU38/counterfactual-measurement.md`, `work/AU38/external-review-cursor.md`.

**Missing delta.** Fix the leak cluster so the flip can land. The cluster is one shape: files that start background work — drain loops, schedulers, boot sequences — and do not deterministically dispose it, plus a handful of `vi.mock` module-registry leaks. Representative failures: a previous file's still-running drain consumes this file's request row; disposal-order assertions fail on leaked lifecycle; a mocked write-failure leaks in from another file. The disposal fixes are a genuine product defect class (production components that never stop their own background work), not test churn.

**Depends on.** None.

**Complexity.** M.

**Engineering tier.** production.

**Pre-build.** Not required — the outcome is settled, the failure set is measured, and the fix class is known. Work proceeds reproduce → fix → re-run until the failing set is empty and stays empty.

**Constraints.**

- Per-test database cleanup stays exactly as it is; whether the wipe should ever go is AU41's question, decided only after this lands.
- No assertion may be weakened. Tests whose behavior genuinely requires an isolated module registry get it by explicit, scoped means (e.g., a small separately-isolated project), never by flipping the whole lane back to `isolate: true`.
- Stability must be proven, not assumed: green across repeated runs and at least one reordered run, because the measured failure set is order-dependent.
- No suite-wide rewrite of how tests arrange data. The killed AU38 approach (mass scoped-ID migration, dirty default world) is explicitly not the mechanism.

**Out of scope.** Removing or replacing per-test cleanup (AU41). Foreign-row predicate correctness tests (AU42). The harness project. Any lint rule claiming to prove isolation.

## Acceptance criteria

- The service project runs with `isolate: false` and the full service lane is green with no reduction in test count (2,865 baseline at registration).
- The lane stays green across at least five consecutive runs and at least one run with shuffled file order — zero order-dependent failures.
- The CI pull request records setup / import / tests / wall timing for the lane, showing the captured reduction against the `isolate: true` baseline.
- Every file in the reproduced failure cluster no longer leaks: background work started by a test file is deterministically disposed before that file ends, and `vi.mock` state does not cross file boundaries.

## Validation scenarios

- Given the service project is flipped to `isolate: false`, when the full service lane runs five consecutive times, then every run is green with the test count preserved.
- Given the lane runs with a shuffled file order, when it completes, then no test fails that passed in the default order.
- Given a test file starts a scheduler, drain loop, or boot sequence, when the file's tests finish, then none of that background work survives into the next file the same worker processes.
- Given the pull request runs in CI, when the lane timing is recorded, then the recorded numbers show the setup-cost collapse measured by PR #477 (setup 2,831s → 40.6s on the 2-vCPU runner, or the current runner's equivalent).
