# AU40 — Capture the measured `isolate: false` prize: flip the switch, keep the wipe, fix the leak cluster

**Status: not done, blocked.** Three implementation reviews returned NOT DONE and the work was adjudicated
back to architecture; the amendment now needs a maintainer decision. See *How we work on this*.

## What we need

The service integration lane should run with `isolate: false` and per-test database cleanup unchanged —
green and stable across repeated and reordered runs, with the speedup recorded in CI. Everyone who touches
the backend gets back the largest single cost in CI, a prize that is already measured and still unclaimed.

The lane's cost is dominated by per-file PGlite boot (~1.47s × 324 files ≈ 476s, matching vitest's reported
`setup 472.89s`), because `isolate: true` gives every file a fresh module registry. A one-line flip — with
`truncateAllTables()` still running — cut CI setup from 2,831s to 40.6s and wall from 1,170s to 258s on a
2-vCPU runner (PR #477), and an independent counterfactual on `origin/main` reproduced it locally at
299s → 94–103s wall with the same test count. Not doing it means every PR keeps paying roughly three times
the necessary lane time for a fix that is known, measured and bounded.

Done means the service project runs `isolate: false` with the full lane green and no reduction in test
count (2,865 at registration); the lane stays green across at least five consecutive runs and at least one
run with shuffled file order, since the measured failure set is order-dependent; the CI pull request
records setup / import / tests / wall timing against the `isolate: true` baseline; and background work
started by a test file is deterministically disposed before that file ends, with `vi.mock` state not
crossing file boundaries.

Per-test database cleanup stays exactly as it is — whether the wipe should ever go is a separate question,
decided only after this lands. No assertion may be weakened. A test that genuinely needs an isolated module
registry gets it by explicit, scoped means, never by flipping the whole lane back. There is no suite-wide
rewrite of how tests arrange data: the killed mass scoped-ID migration is explicitly not the mechanism.
The agreed stop condition is 1,000 lines of *net added* code.

Out of scope: removing or replacing per-test cleanup; foreign-row predicate correctness tests; the harness
project; any lint rule claiming to prove isolation.

## How it works

The failing cluster is one shape, not many: files that start background work — drain loops, schedulers,
boot sequences — and do not deterministically dispose it, plus a handful of `vi.mock` module-registry
leaks. A previous file's still-running drain consumes this file's request row; disposal-order assertions
fail on leaked lifecycle; a mocked write-failure arrives from another file. These disposal problems are a
genuine product defect class — production components that never stop their own background work — not test
churn.

**The common owner turned out to be the shared fixture, not the individual files.** The database fixture
checks out the worker's PGlite instance, yields a wrapped `db`, and checks it back in as soon as dependent
fixtures finish; the next checkout truncates. Along the way the core-api event-bus fixture boots agent
orchestration (one lifecycle-projection drain), the optional orchestration fixture boots it again
(another), and the canonical app fixture boots a third through `createTestApp`. Four further integration
tests boot directly against the same pooled database outside those constructors. Every teardown path calls
a synchronous `dispose()`, which stops the drain's interval but does not wait for a drain already in
flight — so it can still be reading or mutating the database after teardown, after checkin, and into the
next truncate. That is why per-file causal cleanup kept moving the victim instead of fixing the class.

The designed answer separates **stop** from **join**. The drain handle stays synchronously callable, so its
existing callers stay source-compatible, and gains a `join()`. Stop sets a flag, clears the interval and
returns; a queued callback after stopping is a no-op. Join performs the same idempotent stop, then awaits
the observed in-flight drain and reports any failures retained along the way. Every drain launch attaches
both fulfillment and rejection handlers in the same synchronous turn, so a fire-and-forget drain can never
raise an unhandled rejection; the retained error surfaces only through the opt-in join. The public
`dispose()` stays `() => void` with its side-effect order unchanged, and a separate `joinLifecycleDrain()`
is added. The database fixture's cleanup then becomes a real completion barrier: it joins every drain it
owns before the database is checked in, truncated or handed to the next test.

This is deliberately not a production-wide shutdown redesign. It does not make every app disposer async or
join run-runtime, routine-scheduler, observability, eval or server work — those are absent from the bare
fixture boots, so they are not part of the proven owner. The registry accepts only awaitable
orchestration-drain cleanup. No cancellation, lease rewrite, retry, timeout, poll-cadence or projection
behavior changes. The harness project stays `isolate: true`.

Two repairs from the same branch are kept regardless: an explicit service-test auth seam, where each
service app captures a unique key at construction and the tests that intend missing or invalid auth ask
for it explicitly; and a Git timeout correction so that the `localMs` override actually applies to long
local operations (bundle, worktree add and remove), which had hard-coded 120 seconds and ignored it.

## How we work on this

Work proceeds reproduce → fix → re-run until the failing set is empty and stays empty. Proof is a
structured full run with zero failures at or above the 2,865 baseline, five consecutive default runs, and
one full seed-4040 shuffled run — plus per-owner ordered-pair receipts run single-worker, which must be
executable commands rather than references to a sequencer that no longer exists.

Three implementation attempts were reviewed and all returned NOT DONE, each time on a seeded shuffled run
that moved its victims while keeping the same late-drain shape. That is what disproved per-file causal
cleanup as a complete strategy and produced the fixture-ownership design above. Three critiques of that
amendment have also failed — on an async public dispose conflicting with the production synchronous
disposer bags, on the fixture's inability to aggregate errors and incomplete cleanup error-path proofs,
and on omitting the direct pooled-database boot callers from the ownership census. The retry cap is
exhausted.

**The one thing needed to resume:** maintainer approval to extend the fixture ownership contract to every
direct `bootAgentOrchestration` caller that uses the pooled fixture database, not only the three shared
fixture constructors.
