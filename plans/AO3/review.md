# AO3 Review

Date: 2026-07-02T22:38:50Z

Reviewer verdict: DONE.

## Findings

- Resolved: `land_change` now binds execution to the exact reviewed `proposedCallId`. `SessionWorkflow.approvedCall.proposedCallId` flows from dispatcher to registry; registry consumes that exact `tailored_grants` row and injects `approvedProposedCallId`; handler refuses recency inference.
- Resolved: `land_change` review proof now fails closed. `GET /api/reviews/:id` returns `409 CONFLICT` if captured diff proof is unavailable.
- Resolved: tests now prove remote ref advancement, at-most-once unchanged remote state, sibling grant non-consumption, exact `code_diff` payload identity/files/lines, and missing proof failure.
- Non-blocking: review route remains under the existing `public-data` boundary baseline.

## Verification

- `npm run check` PASS
- `npm run lint` PASS
- `npm run test` PASS
- `npm run test:integration -- packages/server/src/tools/__tests__/land-change.integration.test.ts packages/server/src/__tests__/AO3-reviews-loader.integration.test.ts packages/server/src/reviews/__tests__/capture-code-diff.integration.test.ts packages/server/src/filesystem/__tests__/git-export-runner.integration.test.ts packages/server/src/__tests__/AL7-two-session-loop.integration.test.ts packages/server/src/__tests__/AL7-tailored-grant.integration.test.ts` PASS

VERDICT: DONE
