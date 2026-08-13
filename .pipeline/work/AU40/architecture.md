# AU40 — Architecture: shared service workers with deterministic teardown

**Engineering tier:** production. **Surface:** backend test lane plus product lifecycle cleanup. **UI/design:**
none. **Authority:** `plan.md`; `.claude/rules/typescript.md`; `.claude/rules/testing.md`; AU38's
`counterfactual-measurement.md` and `external-review-cursor.md`; current source at `origin/main`
`fe723ab876f444be00e1b6761d7dd56d488318fc`; `feasibility.md`.

## 1. Outcome and boundary

Set only the Vitest **service** project to `isolate: false`. Keep four workers, the threads pool, the service
include/exclude split, and every call to `truncateAllTables()` unchanged. One PGlite instance then lives on
each worker's shared `globalThis`; the existing `db` fixture still truncates that worker's database before
every test.

The implementation boundary is:

1. flip the service-project switch and correct the now-false testing lore;
2. give all three periodic owners (lifecycle projection, run runtime, and routine scheduler) explicit
   stop-and-join ownership, then propagate awaited teardown through
   the boot, app, and server boundaries;
3. await the two service tests that currently drop a `ServerHandle.dispose()` promise;
4. give the three service files with top-level `vi.mock` explicit file-boundary module cleanup; and
5. repair any additional causal owner reproduced after the flip, but only within the same two classes:
   unawaited owned work or top-level module state.

Do not change database truncation, test data, ids, assertions, worker count, the harness project, or production
domain behavior. Do not create AU41's dirty database world.

### AC-to-obligation map

| Acceptance criterion | Implementation obligation | Proof |
|---|---|---|
| service project is `isolate: false`, green, no test-count reduction | service-only config flip; per-test truncate unchanged; close every causal owner/mock boundary | full service JSON: zero failures and at least 2,865 tests |
| five consecutive green runs plus one shuffled-file run | no retries or order pinning; use the configured four-worker lane five times and Vitest's seeded file shuffle once | six recorded full-lane results, all green with preserved count |
| PR records setup/import/tests/wall reduction | rely on the config trigger to force the full existing CI lane; copy Vitest and Actions timing from that exact job | linked CI job and before/after table in PR description |
| reproduced failure cluster leaks nothing across files | stop new lifecycle/run/routine triggers, join work already in flight, await every construction-door owner, and explicitly close the three service mock registries/caches | focused stop-and-join tests plus owner→victim runs, then repeated and shuffled real file-boundary runs |

## 2. Reconciliation with current `origin/main`

| Plan statement / symbol | Current fact | Architectural consequence |
|---|---|---|
| service project uses `isolate: true` | `vitest.integration.config.ts` has exactly that setting; harness also has its own `isolate: true` | change the service value only; harness stays isolated |
| per-test wipe remains | `framework/db/src/__testing__/test-pool.ts::checkout()` calls `truncateAllTables()` before returning the primary instance | no logic change in `test-pool.ts`; update lore only |
| setup boots PGlite per file today | `vitest-integration-setup.ts` calls `warmPool()` and `globalThis` is fresh under current isolation | under the target config it becomes one warm pool per worker |
| baseline is 2,865 tests | current probe on exact HEAD discovered 2,865 | every proof run must report at least 2,865; additions are allowed, removals/skips are not |
| measured 23-file union / stable core seven | all 23 named files still exist; no relevant service/config/test source changed from measured commit `25ae1f65b` to current HEAD | retain the prior union as evidence, not a fixed edit list |
| failures are order-dependent | current run produced 14 failing files, ten in AU38's union and two new AU40-shaped victims; see `feasibility.md` | a failed file is a **symptom**, not automatically the owner; fix the earlier owner, not the victim's assertion/data |
| a handful of `vi.mock` files leak | source has exactly three actual top-level `vi.mock(...)` call sites in the service lane: `factory-run-config`, `server-disposal`, and `agent-and-team-creation-atomicity` | scope module cleanup to these three files; do not count comments containing the text `vi.mock` |
| background work is not fully disposed | `startLifecycleProjectionDrain()` clears only its timer while an initial/timed `drain()` can still be running; run-runtime's disposer clears triggers but does not join an active `wake()` or timed reap; real servers start both loops | model each owner's in-flight promise explicitly; stopping means prevent another start **and** await work already started |
| routine scheduling has the same gap | `startRoutineScheduler()` starts its async tick with `void`, and the tick starts reap and builtin/generic fire promises without awaiting them; `stop()` only clears the interval and event subscriptions | keep fire-and-forget scheduling semantics during runtime, but track tick and child promises so stop can join them |
| outer teardown also returns early | `ServerHandle.dispose()` is async and two tests call it without `await`; `disposeApp()` is sync although it owns async observability, routine-scheduler, and orchestration cleanup | propagate the awaitable contracts to every caller rather than add sleeps or after-the-fact database cleanup |
| CI runs an affected service slice | `.github/workflows/ci.yml` invokes `--project service --changed`; the integration config is already a `forceRerunTrigger` | the config diff forces the full lane in the PR; no CI workflow change is needed |

The probe's four pending tests rather than AU38's five do not contradict the AC: the invariant is total test
count and zero failures, not a fixed pending count. Two probe failures were local `ENOSPC` noise and are not
AU40 product/test-isolation evidence. No plan amendment is needed.

## 3. Locked contracts

### 3.1 Database and worker contract

- `service.test.isolate` becomes `false`.
- `harness.test.isolate` remains `true`.
- `maxWorkers`/`minWorkers` remain `4`; pool remains `threads`.
- `warmPool()` remains a shared-`globalThis` pool and `checkout()` still runs `truncateAllTables()` before
  each test. `checkin()` still returns the instance after the test.
- No test may call `createTestDb`, `createTestApp`, or database cleanup directly to work around a leak.

### 3.2 Awaitable app-disposer contract

The app disposer value accepted by `APP_DISPOSERS`, `registerAppDisposers`, `takeAppDisposers`,
`AppOptions.serviceBootstrap`, `CoreApiBoot.disposers`, and both service-registration functions becomes
structurally `() => void | Promise<void>`.

`disposeApp(app)` becomes `Promise<void>` with these invariants:

1. detach the bag before the first `await`, so each registered cleanup runs at most once;
2. run cleanups sequentially in registration order;
3. await each cleanup before starting the next;
4. on sync throw or async rejection, log the existing `disposeApp: disposer threw` error and continue;
5. resolve after all owners have either completed or reported failure, preserving today's best-effort public
   behavior.

Do not add a timeout, retry, parallel cleanup, new shutdown phase, or error type. `ServerHandle.dispose()` in
desktop and remote-server already awaits the app-domain phase and keeps its existing phase order and
`AggregateError` behavior.

Two registered owners need real promises rather than fire-and-forget wrappers:

- observability returns `observabilityRuntime.dispose()` from its app disposer;
- routine-scheduler cleanup awaits `schedulerPromise`, then awaits `stop()`. This closes startup-versus-dispose
  races instead of scheduling a later `.then(stop)` after the caller was told teardown finished.

Every direct caller of `disposeApp()` and every test-owned `ServerHandle.dispose()` must await it before its
fixture/test ends. Synchronous owners remain valid without wrappers.

### 3.3 Lifecycle-projection drain stop-and-join contract

`startLifecycleProjectionDrain()` keeps its existing immediate first drain and periodic polling, but its
returned stop function becomes `() => Promise<void>`.

Its owner state is exactly:

- `stopping: boolean`, checked before any drain begins;
- `activeDrain: Promise<void> | null`, set before `processLifecycleInternal()` runs and cleared only in its
  `finally`; and
- one memoized stop promise so concurrent/repeated stop calls join the same completion.

Stop order is fixed: set `stopping` first, clear the interval second, then await `activeDrain` if present.
The interval callback and immediate boot call both go through the same tracked entry. After `stopping` is set,
no queued timer callback may start another projection. Stop does not cancel or roll back a row already being
projected; it lets that projection finish with today's database semantics, then resolves. If the in-flight
projection rejects, stop rejects with that error after the timer has been disabled.

Propagate this contract through `AgentOrchestrationBoot.dispose`, which becomes an idempotent
`Promise<void>`-returning method. Its order is: detach socket registration and event gateway, stop the activity
buffer, then await the lifecycle-projection stop. It remains separate from `disposeRuntime`: bare app fixtures
have only this lifecycle drain, while real server callers retain the existing requirement to await
`disposeRuntime()` first.

### 3.4 Run-runtime stop-and-join contract

`bootAgentLayer()`'s owned disposer becomes async. It explicitly tracks:

- the single active `wake()` promise (intent drain plus, when configured, agent-session-request drain); and
- every active periodic `reapExpired()` promise.

The existing no-overlapping-wake behavior remains. On stop: mark the owner stopping, clear both intervals,
unsubscribe the EventBus latency hint, then await the active wake and active reap set. A timer/event callback
that arrives after stopping becomes a no-op. Work already started is allowed to finish; no cancellation,
claim release, retry, or database-state change is added.

The boot-agent-layer stop is kept as a named owner rather than buried in the generic disposer array: its
active wake can still need writeback subscriptions and provisioning/reaper resources, so those dependencies
must not be torn down first. `disposeAll()` becomes sequential and awaitable for the remaining owners while
preserving their reverse ownership order, continue-after-error, and first-error retention. Startup rollback
first stops/joins the agent layer when it started, then awaits the remaining owners, but still throws the
original startup error. `RuntimeHandle.dispose()` memoizes and returns one disposal promise, so concurrent
callers cannot observe an early second-call success. Its fixed shutdown order is:

1. stop triggers and join active wake/reap through the named boot-agent-layer disposer;
2. dispose remaining runtime resources in existing reverse-registration order;
3. only after all drain work and dependencies have settled, mark still-running session requests for shutdown;
4. report the first error in this ordered cleanup, otherwise the shutdown-marking error.

No new timeout or force-cancel path is introduced. A slow real DB/harness operation makes shutdown wait; that
is the ownership guarantee AC4 requires.

### 3.5 Routine-scheduler stop-and-join contract

`RoutineScheduler.stop()` becomes an idempotent `Promise<void>` operation. The scheduler owns four kinds of
work: its interval, event subscriptions, at most one active tick, and every reap/builtin-fire/generic-fire
promise started by that tick or an event subscription.

Keep today's product behavior while running: ticks still do not overlap, reap and routine fires still do not
block later routine dispatch, and their failures remain swallowed at their current boundaries. Add ownership
tracking only: one `activeTick`, a set of active child promises removed in `finally`, a `stopping` guard, and a
memoized stop promise. Event-trigger lookup/fire work uses the same child tracker; unsubscribing prevents new
event work but does not abandon a handler already entered.

Stop order is fixed: mark stopping, clear the interval, unsubscribe event triggers, await the active tick,
then await the tracked children until the set is empty. Awaiting the tick before draining the child set is
load-bearing because that tick can add a final fire after stop begins. Child errors retain today's swallowed
behavior and therefore do not make stop reject; an unexpected tick failure may reject stop after triggers are
disabled. No routine is cancelled, retried, re-ordered, or made synchronous during normal operation.

For deterministic proof without mocking the real DB integration, factor the timer/tick ownership into a
package-private executor that accepts an async tick. A unit test holds that tick and proves stop stays pending
and no later timer entry starts. Extend the existing real-DB scheduler integration with deferred `reap`,
builtin port work, and generic `enqueueWorkIntent`: prove routine dispatch remains non-blocking before stop,
then prove stop waits for all three already-started children and an entered event fire before resolving.

### 3.6 Complete construction-door ownership

The source census is by construction door, not by existing disposer calls:

| door | exact current sites | ownership after AU40 |
|---|---|---|
| `createTestApp` | 167 service calls: one canonical `app` fixture plus 166 direct calls in 24 files; 163 receive a DB and therefore own lifecycle cleanup (the fixture plus 162 direct), while four are kernel-only | `createTestApp` registers every completed app in one worker-global test-owner registry; the integration setup detaches and awaits that test's owners after each test. The canonical fixture and existing explicit suites still dispose earlier and await it; idempotent `disposeApp` makes registry cleanup a no-op. This covers O3's two full-bootstrap apps without rewriting 166 calls. |
| `bootAgentOrchestration` | 13 syntactic sites: two production servers, one `createTestApp`, two canonical fixtures, six direct integration sites, one server-disposal wrapper around production, and one eval helper | servers own it through app/runtime phases; test-app ownership rides the registry; both fixtures and six direct tests await it. The eval helper returns `{ port, dispose }`, and its eight scenario consumers close it in `finally` instead of losing the boot handle. |
| real remote `createServer` | 14 sites: seven service integration sites, two unit sites, one real-harness site, one production entry, and three E2E scripts | production/scripts/harness and five service sites already await. Add awaits at the two service drops and two unit drops; the server-disposal mock wrapper must await real `disposeApp` before recording its phase. |
| `startRuntime` | eight direct starts: four runtime unit cases (two handles, two startup failures), one production boot, one direct integration test, and two test-runtime helpers | existing production/direct/runtime-unit handles remain awaited. Test helpers return owned handles; service consumers must await them. The worker helper exposes async cleanup, and its service caller closes it deterministically; unit consumers are updated only where their returned handle is currently discarded. |
| `startRoutineScheduler` | three starts: production service bootstrap and two startup-failure integration cases | service bootstrap awaits startup then awaited stop through `disposeApp`; both failure cases create no handle and already prove subscriptions/timers unwind. New successful stop/join cases close their returned handle in `finally`. |

The worker-global registry is test-only and stores disposer functions, not apps or DB state. It detaches the
current set before awaiting reverse construction order, continues after cleanup errors, and throws the first
error so teardown cannot silently green. It exists because `onTestFinished` is invalid in the two verified
`beforeEach` construction sites; Vitest documents that hook as test-body-only. No service file uses concurrent
tests, so one registry per worker cannot cross active tests.

### 3.7 Real-server shutdown order

Keep desktop and remote-server's phase order, now with real completion behind each awaited phase:

1. `run-runtime`: stop triggers, join active intent/request drains and reaps, then mark running requests;
2. `app-domain`: sequentially await core owners and `AgentOrchestrationBoot.dispose()`, whose lifecycle
   projector stops and joins;
3. `websocket`;
4. HTTP listener;
5. owned database.

Thus no drain can issue a DB query after the owned database closes. `disposeApp` keeps best-effort logging and
continues through later owners; the outer server's existing named-phase `AggregateError` behavior is otherwise
unchanged.

### 3.8 Module-mock boundary

For each of the three service top-level-mock files:

- clear the shared module cache from `vi.hoisted` before that file's static imports and `vi.mock` factories;
- after the file, `vi.doUnmock` every module that file mocked, then reset the module cache so the next file
  imports real modules;
- keep existing mock behavior and assertions unchanged.

This follows Vitest 4.1's documented behavior: [`vi.resetModules`](https://vitest.dev/api/vi#vi-resetmodules)
clears evaluated modules but not the mock registry, while `vi.doUnmock` removes a mock for the next import.
The reset must therefore be paired with explicit unmocking at file end. Do not put a global reset in the
service setup file: that would make every file repay import work. Do not split a new isolated project unless
the focused three-file proof shows this supported mechanism cannot close the boundary; that would be a new
architecture decision because it changes lane membership and CI selection.

### 3.9 Failure behavior

- A leaked task may no longer be hidden with a delay, retry, alternate id, or weakened expectation.
- A failed cleanup is logged once and does not prevent later cleanups. The caller is released only after the
  remaining cleanups finish.
- A rejected scheduler startup cannot leave a later interval/subscription: teardown awaits the same startup
  promise and the existing startup failure log remains.
- Lifecycle/run stop rejects only after triggers are disabled and already-started work settles. App-owned
  cleanup logs and continues under the existing best-effort contract; direct runtime disposal retains its
  existing first-error rejection.
- Test module cleanup cannot change the production export or fault being asserted.
- Existing PGlite checkout errors and truncate errors continue to propagate.

## 4. Data flow after the change

```text
Vitest worker starts
  -> setup warmPool() allocates + migrates one PGlite
  -> file A imports real or explicitly mocked modules
  -> each test checkout() truncates -> test -> checkin()
  -> file A stops new drain triggers -> joins active drain/reap promises
  -> file A awaits every outer boot/app/server disposer
  -> mocked file removes its mocks + evaluated-module cache
  -> file B enters the same worker with no live background owner or stale mock
  -> checkout() truncates the same PGlite and continues
```

The full service run is the end-to-end consumer. It is the cheapest evidence that catches a broken wire:
unit tests cannot prove that state stays clean across real Vitest file boundaries in a reused worker.

## 5. Expected changed surfaces

### Configuration and authoritative test guidance

- `vitest.integration.config.ts` — service `isolate: false`; replace `integration-isolation` lore with the
  shared-worker ownership invariant. Harness unchanged.
- `framework/db/src/__testing__/test-pool.ts` — lore only: pool becomes per worker, not per file; truncate is
  still per test.
- `.claude/rules/testing.md` — correct the authoritative fixture description and state that DB cleanup remains
  fixture-owned while any scheduler/server/drain/module mock a file starts remains file-owned.

### Product lifecycle contract

- `layers/agent-orchestration/session-requests/src/service.ts` — track the active lifecycle projection;
  return an idempotent async stop that disables polling and joins it.
- `layers/agent-orchestration/run-orchestration/src/start-runtime.ts` — track active wake/reap work; async
  boot-agent-layer disposer; awaited reverse disposal; memoized `RuntimeHandle.dispose()`.
- `layers/agent-orchestration/src/boot.ts` — `AgentOrchestrationBoot.dispose()` becomes idempotent async and
  awaits the lifecycle drain after detaching its other inputs.
- `layers/core-api/routine/src/routine-scheduler.ts` — async idempotent scheduler stop; track entered tick,
  reap, builtin/generic fires, and event-trigger work without changing dispatch concurrency.
- `layers/core-api/src/app.ts` — awaitable disposer types; sequential awaited `disposeApp`; return the
  observability promise.
- `layers/core-api/src/boot.ts` — `CoreApiBoot.disposers` accepts async cleanup.
- `layers/core-api/src/service-bootstrap.ts` — async-capable owner metadata/types; awaited routine-scheduler
  startup + stop.
- `layers/core-api/src/__testing__/test-fixtures.ts` — await both direct orchestration fixtures and composed
  app disposal.
- `layers/core-api/src/__testing__/test-utils.ts` plus `vitest-integration-setup.ts` — register completed apps
  in the worker-global async-owner registry and await/detach it after each service test.
- `applications/desktop/src/create-server.ts` and `applications/remote-server/src/create-server.ts` already
  run `disposeRuntime` before `disposeApp`; retain that exact order and await the stronger contracts.

### Direct lifecycle/runtime consumers that must join

- `layers/core-api/src/__tests__/agent-lifecycle-projection.integration.test.ts` — await the returned lifecycle
  stop in its helper.
- `layers/core-api/src/services/__tests__/routine-scheduler.au15.integration.test.ts` — await lifecycle stop.
- `layers/agent-orchestration/src/__tests__/boot-lifecycle-drain.integration.test.ts` — await boot disposal.
- `layers/agent-orchestration/src/__tests__/boot-provisioning-wiring.integration.test.ts` — keep
  `disposeRuntime` first, then await boot disposal.
- `layers/core-api/src/__tests__/two-app-mount-session-routes.integration.test.ts` — await boot disposal.
- all three AU36 stored boot disposers and both core-api fixture-owned orchestration boots — return/await the
  new promise rather than discard it.

### Existing callers that must consume the promise

- `layers/core-api/src/__tests__/AD1-create-item-routing.integration.test.ts`
- `layers/core-api/src/__tests__/AU36-reach-wiring.integration.test.ts`
- `layers/core-api/src/__tests__/S1-e2e-flow.integration.test.ts`
- `layers/core-api/src/__tests__/notifications/dispatcher.integration.test.ts`
- `layers/core-api/src/__tests__/notifications/notifications-routes.integration.test.ts`
- `layers/core-api/src/__tests__/sessions.integration.test.ts`
- `layers/core-api/src/__tests__/O3-service-move-bootstrap.integration.test.ts`
- `layers/core-api/src/__tests__/server-disposal.integration.test.ts`

The AU36 disposer collector must accept promise-returning functions and await them; O3's direct owner loops
must await each cleanup. Preserve sequential order in both. O3's two full-bootstrap `createTestApp` sites at
lines 368 and 377 are also covered by the test-owner registry even if the assertion exits early.

The test-only runtime helper consumers needing explicit cleanup are the discarded worker runtimes in
`layers/core-api/src/routes/__tests__/AF11-authz.integration.test.ts` and the unit consumers in
`worker-ws.test.ts`; keep `worker-ws-s4.test.ts`'s existing awaited cleanup. `tools/eval/src/agent-
orchestration-fixture.ts` must expose the owned boot handle, and the eight calls across `builtin-routines.ts`,
`routine-sessions.ts`, and `delegation.ts` must close it in their existing scenario cleanup boundary.

### Known dropped server promises and module boundaries

- `layers/core-api/src/__tests__/app-runtime-route-boot.integration.test.ts` — await `handle.dispose()`.
- `layers/core-api/src/__tests__/configuration-projection-boot.integration.test.ts` — await
  `handle.dispose()`.
- `layers/core-api/src/__tests__/server-factory.resolver.test.ts` — await both handle disposals.
- `layers/agent-orchestration/src/__tests__/factory-run-config.integration.test.ts` — explicit module-cache
  reset + unmock.
- `layers/core-api/src/__tests__/server-disposal.integration.test.ts` — explicit reset/unmock for all five
  mocked modules; await the real `disposeApp` wrapper before recording the app-domain phase.
- `layers/core-api/src/routes/__tests__/agent-and-team-creation-atomicity.integration.test.ts` — explicit
  reset/unmock.

### New regression evidence

- add a small unit test beside core-api app tests (builder chooses the local filename) that registers async
  disposers and proves ordered awaiting, continue-after-rejection, and at-most-once cleanup through imports.
- extend the public lifecycle-projection integration evidence with a deferred projection: call stop while the
  projection is blocked, prove stop remains pending, release it, prove stop resolves, then wait past the poll
  interval and prove no second projection starts.
- extend `run-orchestration/src/__tests__/start-runtime.test.ts` with deferred second-wake and periodic-reap
  cases: disposal remains pending until each active operation is released; events/timers after stop produce no
  new calls; two concurrent dispose calls receive the same completion and cleanup remains exactly once.
- extend the server disposal proof so its recorded order cannot reach `app-domain`, `http`, or `owned-db`
  while the mocked run-runtime join is held, and cannot reach `websocket`, `http`, or `owned-db` while the
  mocked app-domain join is held. This pins propagation, not only the leaf handles.
- add the package-private routine-loop unit proof and extend
  `routine-scheduler-completeness.integration.test.ts` with deferred reap/builtin/generic/event children as
  specified in section 3.5.
- add one test-owner registry proof: multiple apps/owners are disposed in reverse construction order, an
  early manual disposal is not repeated, cleanup is awaited before the next test, and the registry detaches
  before awaiting.

The 23 prior symptom files are not blanket edit targets. If a post-flip failure remains, first prove the
causal owner. A newly found owner may extend this list only when it starts work or top-level mock state and
fails to close that exact ownership; record the owner→victim pair in the PR. No data rewrites.

## 6. Dependency and ownership order

One builder owns this single technical task; the contract and consumers cannot safely be split across
parallel leaves.

1. Add failing stop-and-join tests for lifecycle projection, run wake/reap, routine tick/children, and outer
   server phase propagation;
   retain the current no-isolate red output.
2. Implement the three leaf stop-and-join owners, then propagate async disposal through orchestration boot,
   app ownership, and every caller without changing shutdown phase order.
3. Add the app-disposer unit evidence and make its registered async owners awaitable.
4. Close construction-door ownership: worker test registry, six direct orchestration tests, eval helper and
   eight consumers, four dropped server promises, and discarded worker-runtime handles.
5. close the three module-mock boundaries.
6. flip service isolation and update lore/rules.
7. run focused proofs, then the full repeated/shuffled gates. Diagnose any remaining victim back to its owner
   before editing.

## 7. Security surface

This change adds no route, input, credential, persistence field, outbound request, filesystem path, or agent
action. It changes shutdown timing for already-owned resources and test-only module state.

The concrete abuse/failure case is a server, socket listener, scheduler, or drain continuing after its owner
is disposed and then acting against a later test's database. Awaiting the owner closes that lifetime. Existing
bind-address behavior, auth middleware, credential handling, and route contracts remain unchanged. Do not add
a permission gate, confirmation, sandbox, or security policy.

## 8. Verification and proof

### Focused red/green evidence

- Lifecycle projection: a deferred in-flight projection keeps stop pending; after release, stop resolves and
  no new projection begins.
- Run runtime: deferred event wake and timed reap each keep `RuntimeHandle.dispose()` pending; after release,
  dispose resolves and later events/timers cannot restart work.
- Routine scheduler: held active tick keeps stop pending; held reap/builtin/generic/event children keep stop
  pending after the tick exits; runtime dispatch is still fire-and-forget; later timer/event triggers no-op.
- Construction census: registry proof plus O3's full-bootstrap tests show even assertion-only direct apps are
  awaited before the next test; focused eval/server/runtime owners leave no handle unclosed.
- Server propagation: held run-runtime work blocks `app-domain` and all later phases; held lifecycle/app work
  blocks websocket, HTTP, and database phases.
- New app-disposal unit test fails before implementation because `disposeApp` returns before async cleanup.
- Run the three module-mock files with representative real consumers under `--no-isolate`; each mock must be
  active in its own file and absent afterward.
- Run both `createServer` owner files and one request-drain victim in the same no-isolate process; no work may
  survive teardown.

### Repository gates

From the host project root, per repository policy:

```sh
npm run check
npm run lint
npm run test
npm run verify
```

`npm run test` covers the new unit behavior. `verify` covers builds and the configured non-test gates. Harness
integration is out of scope because no harness project/file/plumbing changes.

### Full service stability gate

Run the full configured service lane **five consecutive times**, saving one JSON result per run. Each must
exit zero and report `numFailedTests: 0`, `numTotalTests >= 2865`, and no reduced/hidden file set. Do not use
`--changed`, retries, `--passWithNoTests`, or a file filter.

```sh
for run in 1 2 3 4 5; do
  npx vitest run --config vitest.integration.config.ts --project service \
    --reporter=json --outputFile="/tmp/au40-service-${run}.json" || exit 1
done
```

Then run one full file-order shuffle with a recorded seed:

```sh
npx vitest run --config vitest.integration.config.ts --project service \
  --sequence.shuffle.files --sequence.seed=4040
```

Vitest documents this exact file shuffle and numeric seed at
[`sequence.shuffle.files`](https://vitest.dev/config/sequence#sequence-shuffle-files). The shuffled run must
meet the same count and zero-failure conditions. Five default runs plus one shuffled run are mandatory even
if the first run is green.

### CI timing evidence

The PR's config change is already a `forceRerunTrigger`, so the existing affected CI command must execute the
full service lane. From the successful GitHub Actions log, copy into the PR description:

- commit and runner/job link;
- total/passed/pending/failed test counts;
- Vitest `setup`, `import`, and `tests` durations as printed;
- Vitest total duration and the Actions step duration as wall evidence;
- comparison with PR #477's 2-vCPU baseline (`setup 2,831s -> 40.6s`, wall `1,170s -> 258s`) or, if the
  runner differs, the current runner's equivalent ratio with that difference named.

No fixed absolute threshold is introduced across different runners. Evidence must still show the setup-cost
collapse and a material wall reduction, not merely a green lane.

## 9. Documentation impact

No user or architecture document becomes false. Update the two stale isolation/pool `@lore` blocks and the
declared testing rule named in section 5. Add local `@lore` at the lifecycle and run-runtime stop functions:
clearing a trigger is not completion; disposal first blocks new entries, then joins the tracked work. Do not
add a general testing guide or a lint rule claiming isolation.
