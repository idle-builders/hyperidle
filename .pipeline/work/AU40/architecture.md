# AU40 — Architecture: shared service workers, causal leak repair

**Engineering tier:** production. **Surface:** service-test configuration and only leak owners proven by a
focused no-isolate owner→victim reproduction. **UI/design:** none. **Authority:** `plan.md`; maintainer option
A (2026-08-13); declared TypeScript/testing rules; AU38 evidence; current `origin/main`
`fe723ab876f444be00e1b6761d7dd56d488318fc`; `feasibility.md`.

## 1. Outcome and boundary

Set only the Vitest service project to `isolate: false`. Keep four thread workers, service/harness membership,
and every per-test `truncateAllTables()` call unchanged. Repair only a background or module-state owner that
is shown to break a named next-file victim in a focused same-worker run.

AU40 does **not** establish production-wide quiescence. It does not promise that every async app owner joins
before database close, inventory every constructor, change general app/server disposal contracts, or repair
unrelated cleanup debt. Routine-scheduler joining, a worker-global owner registry, eval cleanup, broad
`disposeApp` propagation, and blanket caller rewrites are excluded unless the causal loop below first proves
that exact owner is an AU40 leak. Such broader shutdown work is a separate work package.

No assertion, data arrangement, id, retry, sleep, test membership, or database wipe changes are allowed.

### AC map

| AC | Obligation | Proof |
|---|---|---|
| service `isolate: false`, full lane green, count preserved | service-only config flip; causal leak repairs only | JSON result: zero failed and at least 2,865 total |
| stable across order | no order pinning/retries | five consecutive full service runs and one seeded shuffled-file run, all green |
| CI records reduction | config remains a `forceRerunTrigger`; no workflow change | successful CI job with setup/import/tests/total and Actions wall timing |
| reproduced cluster leaks nothing | each changed owner has a red owner→victim pair and green pair after deterministic cleanup | saved commands/results per owner plus full-lane gates |

## 2. Current-source reconciliation

- `vitest.integration.config.ts` has `isolate: true` in both service and harness. Change service only.
- `framework/db/src/__testing__/test-pool.ts::checkout()` truncates before every test. Leave logic intact.
- Current no-isolate probe discovers 2,865 tests and fails in an order-dependent 14-file set; two failures are
  local `ENOSPC`, not AU40 evidence. Details are in `feasibility.md`.
- Three, not five, service files contain actual top-level `vi.mock(...)` calls:
  `factory-run-config.integration.test.ts`, `server-disposal.integration.test.ts`, and
  `agent-and-team-creation-atomicity.integration.test.ts`. Two other search hits are comments saying no mock.
- Source inspection finds plausible unjoined lifecycle, runtime, routine, app, and server work. Plausibility is
  not causal proof under option A. None enters the change set from inspection alone.
- AU38/current full-run JSON reports victims but not the preceding file on the same worker. Therefore no
  background owner is yet confirmed by a focused owner→victim run.

## 3. Locked causal-proof loop

For each failure from a full no-isolate run:

1. Use reporting/instrumentation only to record the victim's worker id and the file completed immediately
   before it on that worker. Do not infer the owner from filename or source smell.
2. Run exactly those two files in owner→victim order with the service project, `--no-isolate`, one thread
   worker, and file parallelism disabled. If Vitest's normal sequencer will not preserve the supplied order,
   use a temporary AU40-only sequencer/config outside shipping roots that hard-fails unless both named files
   are discovered and records actual start/end order.
3. Repeat the pair at least three times. It is causal only when owner→victim fails consistently and the
   victim alone is green. Reverse order is a useful negative check for unstable cases.
4. Add the smallest deterministic cleanup at the proven owner boundary. For a background owner, block new
   triggers and await only the in-flight work demonstrated by the pair. For module state, remove only that
   file's mocks/cache entries. Do not generalize to sibling owners.
5. Run the unchanged pair three times. The victim must stay green, owner assertions/count stay intact, and no
   delay/retry/data/wipe change may explain the result.
6. Re-run the full lane. A remaining failure starts a new loop; it does not expand the prior fix by analogy.

Keep one small evidence table during implementation: owner, victim, red command/result, cleanup surface,
green command/result. Temporary sequencing/worker logging is diagnostic and is removed before completion.

### Stop/join contract when a pair proves background work

The contract is deliberately local to the proven owner:

- one stopping flag prevents another entry after teardown starts;
- track the specific active promise(s) observed crossing the file boundary;
- cleanup disables that owner's timer/subscription first, then awaits those active promises;
- repeated cleanup joins the same memoized completion;
- work already started finishes with existing behavior; no cancellation, retry, timeout, reordering, or
  error-policy change is added;
- propagate an async cleanup only through the shortest ownership path exercised by the proven test file.

This contract does not imply that lifecycle projection, run runtime, routine scheduler, observability, or
every app disposer must all change. Each needs its own red pair before entering scope.

### Module-boundary contract when a pair proves mock leakage

For a proven top-level-mock owner, use file-local Vitest cleanup. `vi.resetModules()` clears evaluated modules
but not the mock registry, so pair it with explicit `vi.doUnmock()` for only modules that file mocked. Prove
the mock is active in its owner and absent in the next-file victim. Do not add a global module reset or a new
isolated project unless the supported local cleanup fails its focused proof.

## 4. Exact owner set and changed surfaces

**Confirmed causal owners now: zero.** Existing measurements prove a bounded, order-dependent cluster but do
not identify same-worker predecessor→victim pairs. This is the only blocker to naming implementation files.
The build phase begins with the causal loop, as `plan.md` explicitly permits (`reproduce → fix → re-run`).

Unconditional changed surfaces:

- `vitest.integration.config.ts` — service `isolate: false`; harness unchanged; update local isolation lore.
- `framework/db/src/__testing__/test-pool.ts` — lore-only correction from per-file to per-worker pool; retain
  per-test truncate.
- `.claude/rules/testing.md` — correct only the authoritative isolation/pool description if it becomes false.

Bounded candidate probes, not pre-authorized edits:

- the three actual top-level-mock files named in section 2;
- files that immediately precede a reproduced drain/request victim;
- the two service files currently dropping `ServerHandle.dispose()` promises
  (`app-runtime-route-boot.integration.test.ts`, `configuration-projection-boot.integration.test.ts`) only if
  either is recorded as the causal predecessor;
- lifecycle, run-runtime, routine-scheduler, app, boot, or server production surfaces only when their focused
  pair stays red until that exact stop/join path is made deterministic.

The 23-file AU38 union and current 14 failing files are victim/candidate evidence, not an edit list. O3 direct
constructors, eval scenarios, unit-only runtime helpers, and unrelated production callers are outside AU40
without their own focused pair.

## 5. Failure behavior, security, dependencies, docs

Cleanup must finish before the owner file releases its database fixture. A cleanup rejection fails that test;
it is not logged-and-hidden. Existing product behavior while the owner runs stays unchanged. Existing PGlite
checkout/truncate errors continue to propagate.

No route, credential, permission, persistence schema, input, output, or network exposure changes. The only
security-relevant effect is removing a proven cross-file lifetime leak. No gate or policy is added.

One builder owns reproduction, repair, and verification so evidence cannot be separated from its causal fix.
No dependency is added. No user-facing docs change. Only stale local test lore/rules are corrected; any
non-obvious proven teardown invariant gets a local `@lore` comment at that owner.

Estimated implementation, tests, and docs: **250–650 LOC**, depending on proven pairs, with a hard stop before
1,000 LOC. If causal repairs would reach 1,000 LOC, stop and ask the maintainer to split broader shutdown work.

## 6. Ordered build tasks

1. Flip service isolation in a red branch state and capture full JSON plus worker/file-order diagnostics.
2. For each failure, establish the three-run owner→victim proof before editing an owner.
3. Add focused failing cleanup evidence, implement the narrow owner fix, and prove the pair green three times.
4. Repeat full lane until one default run is green. Remove temporary diagnostics/sequencer.
5. Update only stale testing lore/rules and run repository gates.
6. Run five consecutive full service lanes, then one seeded shuffled-file lane.
7. Use the config-triggered CI lane for final timing evidence.

## 7. End-to-end verification

Focused evidence for every changed owner:

```sh
npx vitest run <owner> <victim> --config vitest.integration.config.ts \
  --project service --no-isolate --pool=threads --maxWorkers=1 \
  --minWorkers=1 --no-file-parallelism
```

Record actual order; run red three times and green three times. Also run victim alone green. Use no retry,
sleep, altered assertion, altered data, or cleanup bypass.

Repository gates from the host project root:

```sh
npm run check
npm run lint
npm run test
npm run verify
```

Full stability gate:

```sh
for run in 1 2 3 4 5; do
  npx vitest run --config vitest.integration.config.ts --project service \
    --reporter=json --outputFile="/tmp/au40-service-${run}.json" || exit 1
done

npx vitest run --config vitest.integration.config.ts --project service \
  --sequence.shuffle.files --sequence.seed=4040
```

Every run must exit zero with `numFailedTests: 0`, `numTotalTests >= 2865`, and no reduced file set. Harness is
out of scope. From the successful GitHub Actions job, record commit/link, total/passed/pending/failed counts,
Vitest setup/import/tests/total durations, and Actions step wall time; compare with PR #477's 2-vCPU baseline
or name runner differences. No fixed cross-runner time threshold is added.
