# AU42 — Catch missing-predicate bugs where they live: targeted foreign-row correctness tests

## Work package

**Outcome.** The read paths where a missing tenant/team/owner/actor predicate is a real production risk each have a deterministic test that seeds a foreign row alongside the test's own row and proves, through the real API/service path, that the own row is included and the foreign row is excluded. The bug class AU38 was originally created to catch is caught — without destroying the suite's meaning.

**Why this matters.** A query that misses its scoping predicate cannot be caught by a hermetic test: with only your own rows in the table, an unfiltered `SELECT` returns exactly what you expect. That is a genuine coverage hole. AU38's answer — make all 2,865 tests inherit arbitrary residue from earlier tests — was the wrong fix: it is an order-dependent oracle, it makes test order semantic, and it destroys legitimate empty-world contracts (empty responses, exact totals, first boot, singletons, queues). Three independent external reviews converged on the targeted form instead: arrange the contamination explicitly where the predicate risk is real. Cost of not doing it: the scoping-predicate hole stays open, and the pressure to "fix" it by dirtying the whole suite returns.

**What exists today.** The suite is hermetic (per-test cleanup); there is no systematic foreign-row predicate coverage. One known hazard surfaced by the reviews: `resolveApiKeyActorUserId` (`layers/core-api/src/middleware/auth.ts`) resolves the actor as the first human user in the table — correct for a single-human local product, wrong the moment the table holds many humans. Tests must encode the production shape, not an artificial multi-human world the product does not run in.

**Missing delta.** An inventory of read paths that are tenant/team/owner/actor-scoped and carry real predicate risk, and for each one an explicit contamination test: seed own row + foreign row, exercise the real route/service, assert own-in / foreign-out.

**Depends on.** None.

**Complexity.** S.

**Engineering tier.** production.

**Pre-build.** Not required — the inventory is part of the work, and the test shape is fixed by the constraints.

**Constraints.**

- Foreign data is arranged explicitly per test (own row + foreign row); no test relies on ambient residue from other tests.
- The hermetic default for the rest of the suite is unchanged.
- No test rewrites product behavior to accommodate a world the product does not run in (e.g., multi-human actor resolution); where the product is single-human by design, the test encodes that.

**Out of scope.** A suite-wide dirty world (killed with AU38). Predicate audits that produce findings without tests. Lane performance (AU40) and cleanup mechanics (AU41).

## Acceptance criteria

- An inventory exists of the read paths that are tenant/team/owner/actor-scoped and carry a real missing-predicate risk, with the risk for each named.
- Every path in the inventory has a test that seeds the test's own row and at least one foreign row, exercises the real API or service path, and asserts the own row is included and the foreign row is excluded.
- The foreign-row tests are deterministic: green across repeated runs, independent of any data they did not seed.

## Validation scenarios

- Given a foreign team's row exists alongside the acting team's row, when the acting team reads through the real route, then the response contains the own row and not the foreign row.
- Given a foreign-row test runs five consecutive times in a populated lane, when it completes, then every run is green with no dependence on rows the test did not seed.
- Given a read path in the inventory lacks its predicate, when its foreign-row test runs, then the test fails — the oracle bites.
