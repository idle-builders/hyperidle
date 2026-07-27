# AU20 core-api bootstrap ownership red-proof review

Date: 2026-07-24
Reviewer: fresh independent pipeline reviewer
Increment: `core-api-bootstrap-ownership`
Finding: F5
Frozen test SHA-256: `1d630619a4d292462e028f9e03245bfd906d60bcce023aa2feada9239a935b13`
Frozen red-proof SHA-256: `79a2c2376faaebc934193fb3e5933ad7ac98d1566388de46d5b04c39dba2dfdd`

## Architecture

No critical findings.

The revised proof binds the exact ordered nine-owner ledger and exact owner-specific cleanup ledger. Every disposer must produce the exact event-unsubscription sequence and exact interval-clear count; missing effects, extra effects, reordered owners, or swapping equivalent cleanup categories between owners fails equality.

Composite custody is explicit and complete:

- notifications: dispatcher, listener, drain (3)
- dispatch: builtin, assistant, task, scheduler (4)
- cost: sentinel, dedup subscription (2)

Dispatch receives its optional task dependencies and asynchronous startup is allowed to settle before observation. Each disposer is then invoked and settled independently before the next owner is measured, preventing later installation from contaminating an earlier cleanup slice.

## Security

No security boundary changed in this test-only increment.

## Adversarial / simplification / slop

- Exact owner-specific arrays use `toEqual`, not partial matching; extra cleanup calls fail.
- Equivalent-effect swaps fail because both cleanup ledger position and owner metadata order are exact.
- No tenth owner is present or implied.
- The prior misleading owner count is corrected: current runtime evidence is nine disposer positions and zero identified owners.
- The current failure is metadata-only. Exact cleanup ledgers pass before owner/cleanup/constituent metadata equality fails.
- The old unexplained `toHaveLength(10)` contract is removed; this is not a length-only replacement.

## AC table

| Acceptance criterion | Result | Evidence |
|---|---|---|
| Exact nine named owners | PASS (red contract) | Ordered owner/effect/constituent ledger asserted exactly. |
| No invented tenth owner | PASS | Exactly nine architecture-authorized entries. |
| Owner-specific cleanup, no missing/extra effects | PASS | Exact event arrays and interval counts for every owner. |
| Composite notifications cleanup | PASS | Exact dispatcher/listener/drain constituent metadata and five subscription removals plus drain timer cleanup. |
| Composite dispatch cleanup | PASS | Exact builtin/assistant/task/scheduler metadata, four event removals, and scheduler timer cleanup. |
| Composite cost cleanup | PASS | Exact sentinel/dedup metadata, two event removals, and sentinel timer cleanup. |
| Async isolation | PASS | Dispatch startup settles before observation; every disposer settles before next measurement. |
| Equivalent cleanup swaps rejected | PASS | Ordered exact cleanup ledger plus ordered exact ownership ledger. |
| Intended red causality | PASS | Focused integration: 1 failed, 9 passed; only owner/effect/constituent metadata is absent. |
| Honest runtime counts | PASS | Red proof records `disposerCount: 9`, `identifiedOwnerCount: 0`. |
| Authorized scope | PASS | Only protected O3 test changed in product paths; production code, other service tests, census, and gate scripts untouched by builder proof. |
| Gates and census | PASS | Corrective-map validator passes; census remains 23 services / 231 methods / 181 types / 412 total. |

## Commands observed

- `npx vitest run --config vitest.integration.config.ts --project service packages/core-api/src/__tests__/O3-service-move-bootstrap.integration.test.ts` → exit 1; 1 intended metadata failure, 9 pass.
- `node .pipeline/work/AU20/probes/validate-corrective-change-map.mjs --require-review` → exit 0.
- `npx tsx scripts/surface-census.ts --json` → 231 methods, 181 types, 412 total.
- Prior review round verified `npm run check` and `npm run lint` exit 0; revised changes are test/evidence-only.

VERDICT: ACCEPT
