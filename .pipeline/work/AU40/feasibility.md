# AU40 — Feasibility

**Date:** 2026-08-13. **Tree:** exact `origin/main` / worktree HEAD
`fe723ab876f444be00e1b6761d7dd56d488318fc`. **Verdict:** GO-WITH-CHANGE: two existing loop owners need
explicit stop-and-join; the current failure cluster remains bounded, with two environment-only failures
excluded from causal claims.

## Probe 1 — Does the AU38 no-isolate premise still reproduce on current `origin/main`?

**Question.** AU38 measured commit `25ae1f65b`. Does current HEAD still discover 2,865 service tests, capture
the same speed prize, and fail in the same bounded order-dependent shapes when only isolation is disabled?

**Method.** First verify that `25ae1f65b..fe723ab87` contains no changes under `layers/`, `framework/`,
`applications/`, `tools/`, `vitest.integration.config.ts`, package manifests/lock, or CI workflows. Then run,
without editing the tree:

```sh
/usr/bin/time -p npx vitest run --config vitest.integration.config.ts \
  --project service --no-isolate --reporter=json \
  --outputFile=/tmp/au40-architecture-repro.json
```

Vitest 4.1.10 documents `--no-isolate` as the CLI override for the project setting:
<https://vitest.dev/config/isolate.html>.

**Result.** Nonzero as expected:

| measure | result |
|---|---:|
| wall | 106.86s |
| total | 2,865 |
| passed | 2,836 |
| failed | 25 |
| pending | 4 |
| failing files | 14 |

Ten failing files were already in AU38's 23-file union:

- `boot-lifecycle-drain.integration.test.ts`
- `factory-run-config.integration.test.ts`
- `agent-work-intent-recovery.integration.test.ts`
- `server-disposal.integration.test.ts`
- `session-requests.integration.test.ts`
- `baked-transcript-mapping.integration.test.ts`
- `calling-thread-id-bake.integration.test.ts`
- `agent-and-team-creation-atomicity.integration.test.ts`
- `agent-work-intent-supersede.integration.test.ts`
- `filesystems-added-after-emit.integration.test.ts`

Two new failures had the same AU40 leak symptoms expected from order changes:

- `agent-run-boundary.integration.test.ts` — duplicate `agent_session_requests` writes;
- `sessions-routes.session-start-baked-emit.integration.test.ts` — a pending request was not handed off.

The other two are excluded from AU40's causal cluster for this run:

- `agent-session-request-sources.integration.test.ts` failed with explicit local `ENOSPC` creating a sandbox;
- `git-worktree-live-proof.integration.test.ts` failed its real filesystem proof while the same volume was
  exhausted.

Representative AU40 failures matched both independent AU38 measurements: request rows inserted by surviving
work, requests consumed by another drain, intended module faults bypassed, and missing mocked disposal phases.
The process also emitted repeated `TimeoutOverflowWarning` messages from live timers after their owning tests.

**Verdict: GO.** The test count and 3x-class local wall improvement still reproduce, while the failing file
set moves with order exactly as the plan says. The two disk failures mean this run is not completion evidence;
they do not weaken the isolation finding. Final proof must run on a healthy volume and be fully green.

## Probe 2 — Are the failures one bounded mechanism or do they require test-data migration?

**Question.** Does current source still support AU40's two mechanisms—unfinished background ownership and
module-cache/mock state—while leaving database truncation intact?

**Method.** Reconcile the current config/setup/fixture and census every actual service-lane top-level
`vi.mock(...)` call, `ServerHandle.dispose`, `disposeApp`, lifecycle-projection drain, run-runtime wake/reap,
routine-scheduler start/stop, and observability disposal call. Trace production `disposeApp` reach, then
confirm the trace negative with `rg -a` because the production graph does not fingerprint test/development
consumers.

**Result.** Bounded:

1. `checkout()` still calls `truncateAllTables()` before each test. No evidence requires changing data setup.
2. Exactly three service files contain actual top-level `vi.mock(...)` calls; all three failed in this run
   because their intended modules were already evaluated in the shared worker. Two additional `rg` hits were
   comments containing the words "No `vi.mock`", not call sites; they are not mock-boundary work.
3. `applications/remote-server` exposes async `ServerHandle.dispose()`. Two service files drop that promise:
   `app-runtime-route-boot` and `configuration-projection-boot`.
4. `disposeApp()` accepts and runs only `() => void`, but its bag contains async observability shutdown and a
   routine scheduler whose startup is a promise. Both wrappers currently discard their promise. Remote and
   desktop server disposal already await the app-domain phase, but the sync contract makes that await finish
   early.
5. `startLifecycleProjectionDrain()` (`session-requests/src/service.ts:218-239`) tracks only a boolean while
   running and returns only `clearInterval(timer)`. Its immediate and timed calls use `void drain()`, so
   `bootAgentOrchestration.dispose()` can return while `processLifecycleInternal()` is still reading/writing
   the database. `bootAgentOrchestration()` stores that function and invokes it synchronously from `dispose`
   (`agent-orchestration/src/boot.ts:345-350,409-414`).
6. Run-runtime has the same gap at a second owner. `bootAgentLayer()`
   (`run-orchestration/src/start-runtime.ts:296-321`) fires event/timer wakes with `void wake()` and timed reaps
   with `void reapExpired(...)`; its disposer clears triggers but joins neither active promise.
   `RuntimeHandle.dispose()` (`:400-412`) then proceeds to shutdown marking, and the server proceeds toward
   app, listener, and database teardown.
7. Real desktop and remote servers start both loops. They already order `disposeRuntime()` before
   `disposeApp()`, then websocket/HTTP/database, so a narrow joined leaf contract can flow through the existing
   phase order without a new shutdown coordinator.

Vitest's official API confirms the narrow module remedy: a hoisted `vi.resetModules()` clears evaluated
modules, and `vi.doUnmock` is separately required because module reset does not clear the mock registry:
<https://vitest.dev/api/vi#vi-resetmodules>.

**Verdict: GO-WITH-CHANGE.** Timer cancellation is not disposal. Each of the two existing loop owners must
track its in-flight work and expose an idempotent async stop that disables new triggers before awaiting the
active promise(s). Propagate those promises through `AgentOrchestrationBoot`, runtime/app disposal, test
fixtures, and the existing server shutdown order. This is still bounded: no scoped-id migration, database
rewrite, new project, shutdown service, or new dependency is justified.
