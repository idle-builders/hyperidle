# AU20 F4 knowledge-retro-snapshot RED-proof review

Date: 2026-07-24
Reviewer: independent pipeline-reviewer

## Bound evidence

| Evidence | SHA-256 |
|---|---|
| `.pipeline/work/AU20/red-proofs/knowledge-retro-snapshot.json` | `f75002097cdef4080a41772ec2077ac95e0f64534dc8b511c526d2aa70baadee` |
| `packages/core-api/src/__tests__/AC2-retro.integration.test.ts` | `a6efabd19d952737afdcc5b956c8a8f31cb45354d47ac187b213b143064e7107` |
| `packages/core-api/src/routes/bets.ts` | `8b3785686fb9bd24f2d3f861ffe48a503facaa22b09cab97d0dc82a9ebf3104d` |
| F2 base commit | `1397db5a5b5a07e1bb6d1884ed550e0e148606a4` |

The protected test and product-route hashes exactly match the F2 base commit.
Neither path has a diff. The only builder-authored path is the authorized,
untracked RED-proof JSON.

## Proof audit

- Exact focused command exited `1`.
- Exactly 1 test file failed; 1 test failed and 22 passed; 0 unhandled errors.
- The sole failure is AC2-4 at line 292.
- Expected the creation-time hypothesis,
  `Users will complete onboarding in under 5 minutes.`
- Received the later edited hypothesis,
  `UPDATED HYPOTHESIS — should not appear in retro`.
- This directly proves the required defect: the second retro update reconstructs
  projection metadata from the current bet instead of preserving the immutable
  hypothesis snapshot captured by the first retro.

## Gates

- Corrective change-map validator with accepted-review binding: exit `0`.
- Lock state: write-tests unlocked only for this proof; code, product code, and
  commit remain locked.
- Surface census: 23 services / 231 methods / 181 types / 412 total.
- Knowledge census: 17 methods / 12 types / 29 total.
- No service surface growth.

VERDICT: accept
