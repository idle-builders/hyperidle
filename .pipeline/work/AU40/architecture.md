# AU40 — Architecture: shared service workers with fixture-owned drain completion

**Engineering tier:** production. **UI/design:** none. **Authority:** `plan.md`; maintainer option A and
orchestrator adjudication 1; declared TypeScript/testing rules; AU38 evidence; implementation-review attempts
1–3; current branch at `ca021a54b`; `feasibility.md`.

## 1. Outcome and boundary

Keep the service project at `isolate: false`, four thread workers, current service/harness membership, and
per-test `truncateAllTables()` unchanged. Preserve the already-built file-local cleanup, explicit service-test
auth seam, and Git timeout correction. Add one systemic ownership guarantee for the newly proven common leak:
background lifecycle-projection drains started with the shared service fixture's database must stop accepting
new work and finish work already in flight before that database is checked in, truncated, or given to the
next test.

This is not production-wide shutdown redesign. It does not make all app disposers async, join run-runtime,
routine-scheduler, observability, eval, or server work, or promise that production closes every database only
after every async owner. The new fixture registry accepts only the awaitable orchestration drain cleanup
created by `createTestApp` and the two fixture orchestration boots. Existing production `disposeApp` and server
phase behavior stay unchanged.

No assertion, test data, id, retry, sleep, lane membership, worker count, or database-wipe change is allowed.

### AC map

| AC | Implementation obligation | Proof |
|---|---|---|
| service `isolate: false`, full lane green, count preserved | retain service-only switch and per-test truncate; finish fixture-owned drains before DB reuse | structured full result: zero failures and at least the 2,865 registered baseline |
| stable across order | fixture teardown is a real completion barrier, not per-file timing | five consecutive full default runs and one full seed-4040 shuffled run, all green |
| CI records reduction | config remains a full-lane rerun trigger | successful CI job with setup/import/tests/total and Actions wall timing |
| reproduced cluster leaks nothing | retain accepted file-local repairs; shared fixture automatically owns every drain it starts | deferred teardown tests, next-test DB proof, then full repeated/shuffled runs |

## 2. Reconciliation with current branch

### Proven common owner

Fresh review after the broad file-local/auth/Git repairs produced one green default full run, then a red exact
seed-4040 run: 2,860 passed, five failed, four skipped. `agent-work-intent-production` observed a supposedly
pending intent already consumed/changed; `explicit-session-start.production` then returned four 500s.
Repeated fresh seeded runs move the victim while retaining the same late-drain shape. This supersedes the old
claim that named per-file predecessors are a complete owner set. The common owner is fixture-started
background drain work tied to the reused PGlite database.

The current ownership chain is exact:

1. `framework/db/src/__testing__/test-fixtures.ts` checks out the worker's PGlite instance, yields a wrapped
   `db`, then immediately calls `checkin()` after dependent fixtures finish. The next checkout truncates.
2. Core-api's `eventBus` fixture always calls `bootAgentOrchestration({ db, eventBus })`; that boot starts one
   lifecycle-projection drain.
3. The optional `agentOrchestration` fixture calls the same boot again and starts an independent drain.
4. The canonical `app` fixture calls `createServiceTestApp` → `createTestApp`; with a DB,
   `createTestApp` boots another orchestration handle and therefore another drain.
5. All three teardown paths currently call synchronous `AgentOrchestrationBoot.dispose()`. It invokes the
   lifecycle stop returned by `startLifecycleProjectionDrain()`, but that stop only clears the interval.
   The immediate/timed `void drain()` may still be reading or mutating the database after fixture teardown,
   checkin, or the next truncate.
6. Bare fixture boots omit `runtime`, and the canonical app omits `serviceBootstrap`. Therefore run-runtime
   and routine-scheduler are not part of this proven common owner.

### Accepted existing constraints

- Service stays `isolate: false`; harness stays `isolate: true`; `unstubEnvs` stays enabled.
- The explicit auth seam stays: each service app captures a unique key at construction, ordinary fixture and
  in-process requests attach it, and intentional missing/invalid-auth tests use `requestWithoutAuth`. The
  production default still reads deployment env. Focused auth/Git evidence is 35/35 green.
- Git long local operations (`bundle`, worktree add/remove) keep a 120-second default;
  `CreateGitRunnerOptions.timeouts.localMs` overrides that default as well as short local commands. The live
  proof's explicit test timeout remains accepted.
- Three actual top-level-mock files keep their already-built file-local reset/unmock cleanup. Two prior search
  hits were comments, not mocks.

## 3. Locked fixture ownership contract

### 3.1 Separate stop and join

`startLifecycleProjectionDrain()` remains a synchronously callable stop so its three executable callers stay
source-compatible: orchestration boot and the two direct integration-test helpers. Its exported callable type
adds one method:

```ts
type LifecycleProjectionDrainStop = (() => void) & {
  readonly join: () => Promise<void>;
};
```

The returned value tracks one `stopping` flag, the current observed drain promise (or null), an ordered list
of retained failures, its interval, and one memoized join promise.

- Every immediate and timed drain enters through the same tracker.
- At launch, attach both fulfillment and rejection handlers in the same synchronous turn. The rejection
  handler retains the error and resolves the observed promise, so every fire-and-forget path is handled and
  cannot emit `unhandledRejection`. The tracker clears `active` only when that exact observed promise settles.
- Calling the function is the **stop phase**: synchronously set `stopping`, clear the interval, and return
  `void`. A queued callback after stopping is a no-op. Stop does not allocate or return a promise.
- Calling `.join()` first performs the same idempotent stop, then memoizes one completion. That completion
  awaits the observed active promise, then consumes every retained failure, including failures from drains
  that settled before join or before a later drain replaced them. It resolves with none, rejects with the
  original error for one, or rejects with an `AggregateError` for several in observation order.
- Consuming clears the retained-failure list only after the active observed promise settles and the join result
  is fixed. Repeated joins return that same settled/rejected promise; no post-stop work can add another error.
- Repeated stops and joins neither restart work nor wait on different work.
- No cancellation, lease rewrite, retry, timeout, new poll cadence, or projection behavior is added.

The stop phase has no async result to ignore. Production fire-and-forget drains now have an immediate rejection
handler rather than an unhandled promise; the retained error is exposed only through the opt-in join. Under
AU40 the DB-fixture cleanup barrier owns that join result and reports it after all owners settle and checkin.

### 3.2 Shortest public propagation

`AgentOrchestrationBoot.dispose` stays exactly `() => void`. Its synchronous side-effect order stays: detach
socket input, detach gateway input, stop lifecycle-drain triggers, then stop the activity buffer.
`disposeRuntime` remains separate and unchanged.

Add `AgentOrchestrationBoot.joinLifecycleDrain: () => Promise<void>`. It delegates to the drain handle's
idempotent `.join()` and therefore also stops the drain if a higher fixture failed before calling `dispose`.
It does not dispose runtime, socket, gateway, or activity state. Production does not register or call this
method, so no rejecting promise enters `disposeApp` or either server's synchronous app-disposer bag.

Only the fixture ownership path is required to await the result:

- core-api `eventBus` fixture: register `dispose()` followed by `joinLifecycleDrain()` for its boot, while its
  normal teardown still unregisters three reactions and calls synchronous `dispose()`;
- core-api `agentOrchestration` fixture: register the same cleanup for its independent boot, while retaining
  its synchronous teardown;
- `createTestApp`: when its DB is a checked-out shared fixture DB, register `dispose()` followed by
  `joinLifecycleDrain()` for the boot it creates or receives, immediately after boot and before later app
  construction can fail;
- canonical `app` fixture: keep `disposeApp(app)` for synchronous app subscriptions; fixture cleanup barrier
  invokes the separately registered join before DB checkin.

Caller census is reconciled against current source. Desktop and remote server put `dispose` into their
synchronous app bags and await `disposeRuntime` in a separate shutdown phase; both stay unchanged. The eval
fixture constructs a boot without disposing it; that pre-existing ownership gap is outside AU40. Test app
composition and direct boot integration tests continue calling void `dispose`. The two direct
`startLifecycleProjectionDrain` tests continue calling the returned stop as a function. Only the shared
DB-fixture/createTestApp seam consumes the new join method.

### 3.3 DB-fixture completion barrier

Add a development-only owner registrar beside the DB fixture. It associates awaitable cleanup functions with
the wrapped DB handle for the current test; registration against a non-fixture DB returns false so raw
`createTestDb` users keep their explicit ownership.

Extract the existing checkout/wrap/release body into a development-only fixture lease helper so the Vitest DB
fixture and its focused integration test exercise the identical release path. The DB fixture teardown
contract is:

1. detach the current cleanup bag so re-entry cannot add work to the closing test;
2. invoke every registered owner in reverse construction order without awaiting between calls, converting a
   synchronous throw to a rejected result; this synchronously stops all owners before any join can block;
3. settle every returned result and retain **owner-cleanup failures only**, in invocation order;
4. always call `checkin(instance)` after every owner settles;
5. then resolve with none, throw the original error for one owner failure, or throw an `AggregateError` for
   several owner failures in invocation order.

The fixture uses `try { await use(db) } finally { await release() }`; it does not and cannot capture the test
body's error as lease input. Vitest owns body-first reporting and native combination with a teardown error.
The lease never puts a body error into its `AggregateError`. `checkin` still happens on cleanup failure so the
primary pool cannot remain marked in use. The next test's checkout/truncate cannot begin until awaited fixture
teardown completes. Duplicate registration/calls are safe because drain stop and join are idempotent.

The registrar is not a general process shutdown service. `createTestApp` registers only the orchestration boot
it created or was given; the two core fixture boots register only themselves. Routine, runtime, observability,
Git, sockets, and arbitrary test promises cannot enter this bag under AU40.

## 4. Data flow

```text
test checkout
  -> truncate worker PGlite
  -> eventBus/app/agentOrchestration fixtures boot lifecycle drains
  -> each boot registers sync dispose + lifecycle join against this wrapped DB
  -> test behavior
  -> higher fixture cleanup stops subscriptions / disposeApp
  -> DB fixture detaches owner bag
  -> stop new drain entries -> await active projections -> settle all owners
  -> checkin
next test checkout -> truncate -> test behavior
```

The barrier lives immediately before checkin because that is the last common ownership point across direct
fixture use, canonical app use, assertion failures, and shuffled file boundaries.

## 5. Changed surfaces

### New systemic delta

- `layers/agent-orchestration/session-requests/src/service.ts` — source-compatible synchronous stop plus
  idempotent awaitable join.
- lifecycle drain integration test beside the existing session-request projector tests — held projector proves
  join remains pending while synchronous stop prevents later ticks.
- `layers/agent-orchestration/src/boot.ts` — keep void `dispose`; expose only a separate lifecycle-drain join.
- `framework/db/src/__testing__/test-fixtures.ts` — per-test DB owner registrar, shared fixture lease/release
  path, and awaited pre-checkin barrier.
- a DB-fixture integration test — within one `test()`, acquire/release the real pooled instance twice. A held owner
  keeps first release pending; after release, the second checkout is proved to reuse that same primary
  instance, runs its normal truncate, and cannot read the owner's late write.
- `layers/core-api/src/__testing__/test-utils.ts` — register only its orchestration boot when the passed DB is
  fixture-owned, including before subsequent composition steps that can throw.
- `layers/core-api/src/__testing__/test-fixtures.ts` — register direct fixture boots; canonical app retains sync
  `disposeApp`, with lifecycle completion guaranteed by the DB barrier.
- a core fixture integration test — held lifecycle join keeps fixture teardown pending and repeated cleanup
  remains one-shot.

### Already-built, retained delta

- `vitest.integration.config.ts`, `framework/db/src/__testing__/test-pool.ts`, `.claude/rules/testing.md` —
  service shared-module pool, four workers, per-test truncate, harness isolation, corrected lore/rule.
- core auth middleware/boot/test utilities and intentional auth tests — explicit per-app service-test auth and
  opt-out seam; production env default unchanged.
- `framework/host-process/src/git/git-runner.ts` and its integration/live tests — 120-second long-local default
  with working `localMs` override.
- already-proven file-local mock, environment, SQL-trigger, server, and temporary Git cleanup on the branch.
  Do not replace these with the fixture registry; they own different state.

No schema, route, API response, dependency, or user documentation changes.

## 6. Failure, security, and ownership

Fixture cleanup failures fail teardown but cannot skip later owner cleanup or DB checkin. One owner error is
preserved; several owner errors are aggregated. The lease does not merge a test-body error: Vitest reports
body and teardown failures using its supported runner behavior. Existing `disposeApp` best-effort logging
remains unchanged for its synchronous bag.

The systemic delta adds no untrusted input, route, credential, filesystem operation, outbound request, agent
action, or persistence field. It prevents a prior test's trusted background worker from mutating the next
test's database. The accepted auth seam remains test-only at its auto-injection edge: the sentinel header is
stripped before Hono receives the request, while production authentication still uses constant-time key
comparison and deployment env by default. Git argument validation/redaction is unchanged.

One builder owns leaf stop, boot propagation, fixture barrier, and tests because their teardown ordering is
one contract. No parallel leaf is safe.

Current implementation net addition outside `.pipeline/**` is +320 code lines. The systemic delta is
estimated at +140 to +260 net code lines:
roughly 35–60 implementation/type lines, 25–45 fixture propagation lines, and 80–155 runtime tests. Projected
code total is +460 to +580, below the maintainer's +1,000 stop. `.pipeline/**` artifacts are excluded from
this cap. If code exceeds +1,000 net against `origin/main`, stop and request a split. This does not contradict
`plan.md`.

## 7. Ordered tasks

1. Write failing lifecycle stop/join and single-test DB-fixture barrier proof.
2. Implement tracked lifecycle stop plus separate boot join, retaining void boot disposal.
3. Add the DB fixture owner bag and register/await only the three fixture/createTestApp orchestration paths.
4. Run focused fixture, auth, Git, and prior per-file regression slices.
5. Run check/lint/test/verify, then the full repeated and shuffled service gates.

## 8. Verification

Focused automated contract:

- deferred real lifecycle projector enters; synchronous stop returns immediately; awaited join remains pending
  until release; after release it resolves, and advancing beyond poll cadence starts no new projection;
- a drain rejects and fully settles before teardown; an immediately attached `unhandledRejection` observer
  records nothing, while later join rejects with that retained original error;
- one test holds a fixture owner, proves release/checkin is pending, releases it, reacquires the exact same
  primary instance, and proves that checkout's truncate removed the owner's late DB write;
- one fixture-lease test registers two rejecting owners plus a succeeding sentinel owner, proves every owner
  ran, release throws `AggregateError`, then reacquires the same primary instance to prove checkin still ran;
- a single rejecting owner is rethrown as that original error, not needlessly wrapped;
- two join calls share one promise; repeated stop/join effects occur once;
- existing auth/Git focused slice remains 35/35 green.

Do not simulate test-body aggregation inside the lease test. Vitest, not the fixture, owns body-first
multi-error reporting. Add a runner-level body+teardown probe only if the installed Vitest exposes a stable
import-testable API for it; do not add a nested Vitest subprocess or custom runner for this AU40 contract.

Repository gates from host root:

```sh
npm run check
npm run lint
npm run test
npm run verify
```

Full stability gate, with no receipts that depend on removed temporary tooling:

```sh
for run in 1 2 3 4 5; do
  npx vitest run --config vitest.integration.config.ts --project service \
    --reporter=json --outputFile="/tmp/au40-service-${run}.json" || exit 1
done

npx vitest run --config vitest.integration.config.ts --project service \
  --sequence.shuffle.files --sequence.seed=4040 \
  --reporter=json --outputFile=/tmp/au40-seed-4040.json
```

Each run must exit zero, report zero failed tests, preserve at least the 2,865-test baseline, and keep the file
set. These structured results plus the committed automated fixture tests replace non-executable causal receipt
commands. Harness remains out of scope.

The config change remains a CI full-rerun trigger. From the successful Actions job, record commit/link,
total/passed/pending/failed counts, Vitest setup/import/tests/total durations, and Actions wall time; compare
with PR #477's runner baseline or name runner differences. No fixed cross-runner time threshold is added.
