# AU41 — Decide with measurements whether per-test cleanup removal is worth doing, and only then how

## Work package

**Outcome.** The question "should the per-test database wipe go?" has a recorded answer backed by CI measurements: keep it, or replace it with a cheaper mechanism that is proven in the real lane. The lane's cleanup cost becomes a number, not an extrapolation.

**Why this matters.** AU38 assumed wipe removal was required and paid ~29,000 changed lines across 263 files for it — and its own evidence showed the assumption false (the measured `isolate: false` prize was captured with the wipe still running). The commonly cited ~110s truncate cost is an extrapolation from a three-file trace under the OLD configuration, where every file also paid a ~1.47s PGlite boot. Once AU40 lands, the boot cost is gone and the truncate's real share of the lane changes completely. Cost of not doing this: either the lane keeps paying a cleanup cost nobody has measured in its real configuration, or someone repeats AU38's unmeasured assumption.

**What exists today.** `truncateAllTables()` runs before every test in the service lane (~40ms measured per test on a three-file trace; ~2,800 tests). The hermetic world it buys is load-bearing for legitimate contracts: empty responses, exact pagination totals, first-boot defaults, fixed production singletons, queue/scheduler behavior, bootstrap idempotency.

**Missing delta.** Measure, then decide, then (only if justified) replace:

1. Measure the truncate's actual share of lane wall time in CI, in AU40's configuration.
2. Record the keep/replace decision with those numbers.
3. If — and only if — the measured cost justifies it, compare bounded mechanisms (transaction-per-test with rollback, per-file instead of per-test cleanup, database-template cloning) and implement the winner.

**Depends on.** AU40 — the measurement is only meaningful in the `isolate: false` lane, and the hermetic green lane AU40 delivers is the starting point.

**Complexity.** S for measurement + decision. A justified replacement may grow it; the simplicity stop below applies.

**Engineering tier.** production.

**Pre-build.** Not required for the measurement and decision. If replacement is justified, the chosen mechanism may need an architecture pass before implementation.

**Constraints.**

- The hermetic default is preserved unless measured evidence justifies a different mechanism.
- If the expected implementation of a replacement exceeds 1,000 lines, stop and return to the founder before building (repository simplicity rule) — that is exactly the trap AU38 fell into.
- Whatever mechanism wins, the contracts that need an empty world (empty responses, exact totals, first boot, singletons, queues, bootstrap) must keep a deterministic way to get one.

**Out of scope.** Suite-wide test rewrites. Making a dirty shared world the default test environment (killed with AU38). Foreign-row correctness testing (AU42).

## Acceptance criteria

- The truncate's cost — its share of service-lane wall time — is measured in the CI configuration and recorded with numbers.
- A keep/replace decision is recorded together with the measurements that justify it.
- If the decision is replace: the new mechanism runs the full lane green across repeated runs with test count preserved, and its measured cost reduction is recorded. If the decision is keep: the record shows the measured reason.

## Validation scenarios

- Given AU40 has landed, when the service lane runs with cleanup-cost tracing in CI, then the recorded numbers state the truncate's share of lane wall time.
- Given the recorded decision is "replace", when the replacement mechanism runs the full lane five times, then every run is green with the test count preserved and the before/after cost recorded.
- Given the recorded decision is "keep", when the record is read, then it names the measured cost and why no cheaper mechanism was justified.
