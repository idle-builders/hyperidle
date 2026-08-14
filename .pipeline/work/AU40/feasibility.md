# AU40 — Feasibility amendment

**Date:** 2026-08-14. **Branch:** `chore/AU40-isolate-false-test-lane` at `ca021a54b`, based on
`origin/main@a54c352d6`. **Verdict:** GO — systemic fixture ownership is required and remains below the
maintainer's +1,000 net-added-code stop (pipeline artifacts excluded).

## 1. Superseding runtime evidence

Implementation review attempt 3 ran after file-local cleanup, explicit auth, and Git timeout repairs:

| run | result |
|---|---|
| fresh default full service | green; 2,865 passed, 4 skipped |
| fresh exact seed 4040 | red; 2,860 passed, 5 failed, 4 skipped |
| first victim | `agent-work-intent-production`: pending intent already consumed/changed before assertion |
| downstream victim | `explicit-session-start.production`: four 500 responses |

Other fresh seed-4040 evaluations moved failures among auth/request victims. The accepted auth/Git focused
slice is 35/35 green, so those fixes do not explain the remaining state transition. The common remaining
mechanism is fixture-started lifecycle drain work surviving test teardown and operating on the shared worker
database around checkin/truncate. This evidence supersedes the prior feasibility claim that the confirmed
systemic owner set was zero or that per-file owner→victim receipts were sufficient.

The default full run being green is expected for an order-dependent lifetime race; it is not stability proof.

## 2. Source feasibility

The shared path supports a narrow fix without a shutdown redesign:

- DB fixture order is `checkout → await use(db) → checkin`; next checkout performs truncate.
- Core `eventBus`, optional `agentOrchestration`, and canonical `app/createTestApp` paths each boot
  `AgentOrchestrationBoot` with the same fixture DB.
- Each boot unconditionally starts `startLifecycleProjectionDrain()`.
- Its immediate and interval calls are `void drain()`; returned stop only clears the interval.
- `AgentOrchestrationBoot.dispose()` is synchronous and calls that stop without a completion signal. Its
  production consumers are the desktop and remote synchronous app-disposer bags; changing its return type
  would introduce an ignored rejecting promise, so AU40 retains `() => void`.
- Bare shared fixtures do not pass runtime, and canonical app does not pass service bootstrap. Run-runtime and
  routine-scheduler are therefore unnecessary for this contract.

A source-compatible callable drain stop can attach a rejection handler to every launched drain immediately,
retain settled failures, and expose a separate memoized `.join()` promise. Join can therefore report a drain
that rejected before teardown without creating an unhandled rejection. Boot retains void `dispose()` and adds
a distinct `joinLifecycleDrain()` method used only by fixtures. A per-test awaitable
cleanup bag keyed by the wrapped fixture DB is the last common barrier. `createTestApp` can register
`dispose()` plus the join as soon as its boot exists; the two direct orchestration fixtures register their
boots. The DB fixture awaits the bag before checkin. Raw DB handles are not registered, and production
app/server teardown does not change.

Caller fact-check: `startLifecycleProjectionDrain` has three executable call sites (boot plus two integration
tests), all preserved by the callable stop type. Desktop and remote compose `AgentOrchestrationBoot.dispose`
into synchronous app bags and separately await `disposeRuntime`; test app composition and direct boot tests
also call void `dispose`. The eval fixture constructs a bare boot without cleanup; AU40 does not widen into
that pre-existing production-tool ownership gap. No current caller needs to ignore or await a changed
`dispose` result.

## 3. Load-bearing test feasibility

The lifecycle projector already accepts injected projection dependencies through `DurableAgentQueueDeps`.
A real PGlite test can seed an explicit-session lifecycle fact and defer
`explicitSessionStarts.projectTerminalState`, deterministically holding an active drain without sleeps or
source inspection.

The DB barrier is independently testable through imports in one test, without Vitest test ordering:

1. acquire the real primary pool instance through the same fixture lease helper used by the DB fixture;
2. register a deferred owner that writes on a later event-loop turn, begin release, and prove release remains
   pending;
3. unblock and await release, then checkout again inside the same `test()`;
4. prove the second lease wraps the same primary instance and cannot read the late row because checkout ran
   the unchanged truncate.

These automated tests remain executable after temporary sequencing diagnostics are removed and directly pin
the fixture contract that the full lane consumes.

Error paths are import-testable without source inspection: reject and settle a drain before teardown, observe
no `unhandledRejection`, then prove join delivers the retained error; register multiple failing fixture owners
and a success sentinel, prove all run, release aggregates only owner failures, and prove the same primary pool
instance can be checked out afterward. A one-owner case proves the original error is preserved. The lease uses
`try/finally` around Vitest's `use`; it never receives the body error. Native body-plus-teardown reporting stays
owned by the Vitest runner. A separate runner-level proof is added only if available through a stable imported
Vitest API; a nested subprocess/custom runner is disproportionate and excluded.

## 4. Accepted existing constraints

- Service alone is `isolate:false`; four thread workers and per-test truncate remain.
- Each service app captures a unique explicit API key; normal fixture/in-process requests attach it;
  intentional auth-negative tests opt out; production still defaults to env. The unique key also prevents
  credential-rate-limiter state from pooling across apps.
- Git bundle/worktree add/remove use a 120-second long-local default, while `localMs` remains an explicit
  override for all local commands. Focused auth/Git evidence is 35/35 green.
- Existing file-local mock, env, SQL-trigger, temporary Git, and explicit server cleanup remains; the fixture
  barrier does not replace unrelated ownership.

## 5. Size and verdict

Current net added code against `origin/main`, excluding `.pipeline/**`, is +320 lines (583 added, 263
deleted). Estimated systemic delta is +140 to +260 net code lines:

| part | estimate |
|---|---:|
| lifecycle stop + boot type/implementation | +35–60 |
| DB/core fixture registration and propagation | +25–45 |
| runtime tests | +80–155 |
| projected code total | **+460–580** |

The design remains below +1,000 with 420–540 lines of expected headroom. Pipeline artifact lines do not count
toward the maintainer cap. Stop for maintainer split if implementation code reaches +1,000 net; do not broaden
into app/server/routine/runtime shutdown.

**Verdict: GO.** The systemic fixture contract is required by fresh shuffled evidence, fits the current
public seams, preserves plan constraints, and is verifiable through deterministic runtime tests plus the five
default/full shuffled gates. No plan amendment, dependency, schema, route, UI, or production-wide shutdown
contract is required.
