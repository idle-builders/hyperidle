# AU20 core-api bootstrap ownership implementation review

Date: 2026-07-24
Reviewer: fresh independent pipeline reviewer
Increment: `core-api-bootstrap-ownership`
Finding: F5

## Architecture

No findings.

`identifyBootstrapOwner` is private to `server-factory.ts`. It decorates the existing disposer function object without wrapping, replacing, awaiting, reordering, or changing any registration/cleanup body. The original nine registrations remain in exact order:

1. lifecycle-projection drain
2. relevance listener
3. review subscriptions
4. policy registration
5. git-export handler
6. notifications installation
7. retention reaper
8. dispatch lifecycle
9. cost sentinel

The notifications, dispatch, and cost composite bodies remain unchanged. Metadata exactly matches the accepted red contract, including constituent ledgers of 3, 4, and 2.

## Security

No boundary, authorization, input, persistence, or transport behavior changed.

## Adversarial / simplification / slop

- Authorized production path is only `packages/core-api/src/server-factory.ts`.
- No exported declaration, public return type, method, service, or type was added.
- `Object.assign` preserves function identity and callable behavior.
- No old disposer remains beside a decorated duplicate.
- No cleanup catches, ordering, or error semantics were changed.
- Helper is single-purpose and removes nine repetitions of raw `Object.assign`; no speculative abstraction or dead compatibility layer.
- Diff contains no census/gate tampering and no unrelated product edit.

## AC table

| Acceptance criterion | Result | Evidence |
|---|---|---|
| Exact nine owner identities | PASS | Focused integration asserts exact ordered metadata; 10/10 pass. |
| Exact cleanup effects and constituents | PASS | Exact owner-specific cleanup ledger and metadata pass, including notification 3 / dispatch 4 / cost 2. |
| Original functions/bodies/order unchanged | PASS | Diff only encloses original expressions in private metadata decoration; closure bodies and call order are identical. |
| No tenth owner | PASS | Nine decorated registrations, no additional registration. |
| No public surface growth | PASS | Helper is not exported; census remains 23 services / 231 methods / 181 types / 412 total. |
| Gates | PASS | corrective-map validator, check, lint, and focused O3 integration pass. |
| Full service integration | PASS for this increment | 2,863 pass, 7 skip; sole failure is protected AC2 retro snapshot, the already-authorized next independent correction. O3 is green in the full lane. |

## Commands observed

- `node .pipeline/work/AU20/probes/validate-corrective-change-map.mjs --require-review` → exit 0.
- focused O3 service integration → 10/10 pass.
- `npm run check` → exit 0.
- `npm run lint` → exit 0.
- `npm run test:integration:service` → 2,863 pass, 7 skip, one expected next-increment AC2 failure.
- census → 231 methods, 181 types, 412 total.

VERDICT: ACCEPT
