# AU20 F4 knowledge-retro-snapshot implementation review

Date: 2026-07-24
Reviewer: independent pipeline-reviewer

## Bound candidate

| Evidence | SHA-256 |
|---|---|
| `packages/core-api/src/routes/bets.ts` | `7361a2fd2977c0f6ca74527006ea0838ebe7442e784816b412962d37ac7a8bf3` |
| `packages/core-api/src/__tests__/AC2-retro.integration.test.ts` | `a6efabd19d952737afdcc5b956c8a8f31cb45354d47ac187b213b143064e7107` |
| `.pipeline/work/AU20/red-proofs/knowledge-retro-snapshot.json` | `f75002097cdef4080a41772ec2077ac95e0f64534dc8b511c526d2aa70baadee` |
| `plans/AU20/red-proof-reviews/knowledge-retro-snapshot.md` | `f64999e9ade9f5632ceb49cc0dd100f8db609c9c746d809e4db200a2984e002f` |

## Findings

- Sole authorized product diff: `packages/core-api/src/routes/bets.ts`,
  33 additions / 18 deletions.
- Creation stores the current bet hypothesis once.
- Update reads the existing full projection and spreads its complete metadata,
  preserving `hypothesis`, `betId`, and any other existing fields.
- Update refreshes only `verdict`, `validatedAt`, and `validatedBy`.
- Existing-retro list, full projection read, bet outcome write, and optimistic
  knowledge update all execute in the same database transaction.
- Optimistic concurrency remains pinned to the version returned by the
  transactional list read.
- Existing general knowledge list/get/update/create operations are reused.
  No new export or service method was added.
- Protected test, RED proof, RED review, and census script remained frozen.

## Verification

| Gate | Result |
|---|---|
| Focused AC2 service integration | PASS — 23/23 |
| Service integration lane | PASS — 264 files, 2869 tests; 1 file/7 tests skipped by existing lane policy |
| `npm run check` | PASS — 37/37 packages |
| `npm run lint` | PASS |
| `npm run test` | PASS — 355 files, 3557 tests |
| Corrective-map `--require-review` | PASS |
| Census | PASS — 23 services / 231 methods / 181 types / 412 total |
| Knowledge census | PASS — 17 methods / 12 types / 29 total |

VERDICT: accept
