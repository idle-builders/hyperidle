# AU20 run-orchestration async disposal red-proof review

Date: 2026-07-24
Reviewer: fresh independent pipeline reviewer
Increment: `run-orchestration-async-disposal`
Finding: F2
Frozen test SHA-256: `f136b0f3b544070a92dd9cc63a9c281de468009b296bcd9dd0d76e6d1b3e94f3`
Frozen red-proof SHA-256: `56256c3bf8e74894df90115ca873f671c87c212ae3424debd7b0383fa330987b`

## Findings

No critical findings.

- Production code and existing callers are untouched. The builder added only
  the authorized disposal integration test and red-proof record; current
  progress/generator changes advance the already-approved gate state.
- The contract binds the exact ordered phases: bet decomposition, run runtime,
  app domain, websocket, HTTP, then owned database.
- A failure in the first phase plus additional synchronous/asynchronous
  failures must not prevent later phases. The resulting `AggregateError`
  contains ordered `{ phase, cause }` entries.
- Concurrent disposal calls must return one shared promise and execute every
  phase exactly once.
- Injected databases remain open and omit the owned-database phase. Owned
  database closure must be awaited.
- A real database write performed during durable runtime shutdown must finish
  before owned-database closure.
- The authorized six-caller inventory and all six SHA-256 hashes match the
  files on disk.
- The focused test has exactly the intended RED shape: 3 failures, 2 passing
  preconditions, and zero unhandled errors.

## Acceptance evidence

| Acceptance criterion | Result |
|---|---|
| Exact six-phase order | PASS (red contract) |
| All later phases attempted after failures | PASS (red contract) |
| Ordered phase-tagged `AggregateError` | PASS (red contract) |
| Shared-promise idempotence | PASS (red contract) |
| Injected database never closed | PASS |
| Owned database close awaited | PASS (red contract) |
| Durable runtime shutdown before database close | PASS (red contract) |
| Frozen six-caller inventory and hashes | PASS |
| Production and existing caller tests untouched | PASS |
| Service surface unchanged | PASS: 23 services / 231 methods / 181 types / 412 total |

## Commands observed

- `npx vitest run --config vitest.integration.config.ts --project service packages/core-api/src/__tests__/server-disposal.integration.test.ts`
  → exit 1; 3 intended failures, 2 passes, zero unhandled errors.
- `node .pipeline/work/AU20/probes/validate-corrective-change-map.mjs --require-review`
  → exit 0; write-tests authorized, product code locked.
- `npm run check` → exit 0.
- `npm run lint` → exit 0.
- `npx tsx scripts/surface-census.ts --json` → exit 0; 23 services,
  231 methods, 181 types, 412 total.
- `git diff --check` → exit 0.

VERDICT: accept
