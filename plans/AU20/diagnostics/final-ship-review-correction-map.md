# AU20 final ship-review correction map

Date: 2026-07-23
Inputs:

- `.pipeline/work/AU20/review.md`
- `/Users/tg/hyperidle/.worktrees/AU20-review/.pipeline/work/AU20/review.md`

Real-backend E2E belongs to AU23 and is excluded. Live AU20 invariant is 23
services, 231 methods, 181 types, 412 total. Every correction keeps methods
and types at or below 231/181; an increase requires planner adjudication before
write-tests.

## Count integrity

The final review footer says 6 critical + 6 warning + 1 observation, but its
headings contain 6 critical + 5 warning + 1 observation. The thirteenth finding
is therefore the review-ledger count contradiction itself; no sixth product
warning is invented.

## Identity-level map

| ID | Severity | Owner | Root cause / correction |
|---|---|---|---|
| F13 | warning: review integrity | AU20 evidence | Add stable finding IDs and mechanically require heading/footer equality. This is the first evidence-only increment. |
| F1 | critical | evidence generator | `service-data-packages.json` is the stale 31-service input; `generate-dependency-graph.ts` has no current 23-service demand-package serializer. Generate exports, DI receivers, consumers, and requests deterministically twice and reconcile with census. |
| F5 | critical | core-api composition | Protected O3 expects ten disposers, runtime returns nine. Replace magic count with an exact named ownership ledger and cleanup-effect proof; architecture currently expects nine, but tests must adjudicate every owner before changing expectation. |
| F2 | critical | run-orchestration/server lifecycle | `ServerHandle.dispose` returns void, fires `runRuntime.dispose()` without awaiting, then closes transports/owned DB. Make disposal awaitable, ordered runtime→transport→DB, idempotent, and failure-observable; migrate all callers. |
| F4 | critical | knowledge/bet retro | Updating a retro reconstructs metadata from the current bet hypothesis. Preserve creation-time `meta.hypothesis` while updating verdict/summary using existing knowledge CRUD—no new public method. |
| F3 | critical | harness-registry | Main export/dependency graph exposes MCP bridge, SDK, Hono, Zod. Move existing bridge to dependency-isolated `./mcp`; main entry must resolve without those dependencies and no duplicate export remains. |
| F9 | warning | notifications | `writeSecret` suppresses every cipher exception. Suppress only `MISSING_ROOT_SECRET`; propagate unexpected encryption faults and never audit/store false success. |
| F10 | warning | filesystems | Watcher setup has empty catch and runtime `error` is unobserved. Setup failure is synchronous/observable; runtime failure has one coherent existing-handle error contract; normal debounce/stop remains. |
| F8 | warning | ownership documentation | Comments name deleted context-assembly, lifecycle-projection, session-lifecycle, and capture-writeback owners. Update ownership prose only after runtime custody is final. |
| F7 | warning | census evidence | Regenerate `surface-census.md` and `census-after.json` from the executable final census; deterministic rerun must be byte-identical. |
| F6 | critical | AU20 aggregate | Only proof-inventory corrective implementation landed; all non-AU23 corrections and aggregate validation remain open. Close only after every accepted increment. |
| F11 | warning | AU20 durable state | Plan/architecture/progress say unfinished while ship was requested. Final evidence-only closeout makes state consistent only after all gates are green. |
| F12 | observation | surface invariant | Current 231m/181t is positive evidence and a continuous invariant, not a repair commit. |

## Ordered independent increments

1. `review-finding-ledger` — evidence only.
2. `evidence-demand-package` — generator + generated demand evidence only.
3. `core-api-bootstrap-ownership` — one composition-domain commit.
4. `run-orchestration-async-disposal` — one lifecycle-domain commit.
5. `knowledge-retro-snapshot` — one knowledge commit.
6. `harness-registry-mcp-entry` — one harness-registry commit.
7. `notifications-secret-errors` — one notifications commit.
8. `filesystems-watcher-errors` — one filesystems commit.
9. `ownership-prose-current` — documentation-only ownership commit.
10. `evidence-current-census` — generated evidence only.
11. `AU20-aggregate-closeout` — evidence/state only, F6+F11.

Every increment is serial and must traverse write-tests (or static validation
for evidence/docs) → independent red/static review → write-code → strict
review → green commit. No commit combines two services.

The nine bootstrap owners are lifecycle projection, relevance, review, policy,
git export, notifications, retention, dispatch, and cost sentinel; tests bind
their distinct cleanup effects. Server shutdown separately owns and orders bet
decomposition → awaited run runtime → app domain/bootstrap → websocket → HTTP
→ owned DB, with all phases attempted and ordered aggregate errors.

Filesystem watcher failure uses the existing config/handle shapes:
`FileWatcherConfig.onError(Error)` is required; setup failure throws after
closing partial setup; runtime error closes/cancels/clears, calls onError once,
and leaves `stop()` idempotent. Run-orchestration forwards it to structured
session/sandbox logging and ingestion stop. No new exported type or method.

## Verification contracts

- F1: deterministic generator integration with temporary output plus current
  scanner/census reconciliation.
- F5: real service integration proves every named disposer starts and its
  cleanup effect occurs; no unexplained length-only contract.
- F2: real DB integration proves awaited shutdown marking precedes transport
  and owned-DB close, repeat calls share one promise, and phase failures are
  observable while later cleanup is attempted.
- F4: protected `AC2-retro.integration.test.ts` creates retro, edits bet
  hypothesis, updates retro, and retains the original snapshot.
- F3: main-entry import/metafile excludes MCP SDK/Hono/Zod; `./mcp` resolves
  bridge; MCP unit/stateful integration remains green.
- F9: missing-root-secret is suppressed; arbitrary cipher failure rejects with
  no upsert/success audit.
- F10: injected watcher setup throw and emitted runtime error are observable;
  real filesystem debounce/stop stays green.
- F7/F8/F13: static validators, not source-reading runtime tests.
- Final: check, lint, unit, full service integration, relevant harness
  integration, census <=231/181, demand/census evidence reproducible, all
  review IDs closed. AU23 E2E is referenced as a dependency, never claimed as
  AU20 evidence.
