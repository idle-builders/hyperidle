# R3 Rebase Re-Review: Block Rendering in Messages

VERDICT: **DONE** -- all 17 ACs pass. Zero critical findings. Three carried-forward warnings accepted in prior review.

Reviewer: Opus 4.6 | Date: 2026-05-29 | Verify: 1691 passed, 0 failed, 39 skipped

---

## Rebase Context

R3 branch rebased onto origin/main after the SQLite-to-PGlite migration (PR #139). Two merge conflicts resolved in `pg-migration.test.ts`. Seven test files modified with timeout bumps for the npm runtime.

## Conflict Resolution

Both conflicts in `packages/db/src/__tests__/pg-migration.test.ts` were the same pattern: adding `{ timeout: 30_000 }` to test cases that existed on main but timed out after the PGlite migration. Resolution adds only the timeout option. No test bodies, assertions, or logic were modified. Correct.

## Timeout Changes Assessment

| File | Change | Verdict |
|---|---|---|
| `packages/db/src/__tests__/pg-migration.test.ts` | 2 tests: `{ timeout: 30_000 }` | Correct |
| `packages/shared/src/__tests__/blocks/browser-safe.test.ts` | 2 tests: `{ timeout: 60_000 }` | Correct |
| `packages/shared/src/__tests__/blocks/edge-cases.test.ts` | 1 test: `{ timeout: 30_000 }` | Correct |
| `packages/shared/src/__tests__/blocks/fuzz.test.ts` | 1 test: `{ timeout: 60_000 }` | Correct |
| `packages/shared/src/__tests__/blocks/purity.test.ts` | 1 test: `{ timeout: 30_000 }` | Correct |
| `packages/shared/src/__tests__/toon-codec.test.ts` | Threshold 100ms -> 1000ms | Correct |
| `packages/design-system/src/__tests__/block/payloads.test.tsx` | All 11 tests: `TEST_TIMEOUT` | Correct |
| `packages/web/src/__tests__/router.P4.test.tsx` | 2 tests: `{ timeout: 60_000 }` | Correct |

All timeout changes documented with `@lore` comments. No assertion changes or test weakening.

## R3 Feature Code

No accidental changes to R3 feature code during rebase. All source files (`derive-payloads.ts`, `CommentRow.tsx`, `ThreadShell.tsx`, `blocks/index.ts`, `shared/index.ts`) are byte-identical to pre-rebase versions.

## AC Completeness

| AC | Status | Evidence |
|---|---|---|
| AC-1 | PASS | derive-payloads.ts:254, barrel exports, type-level tests |
| AC-2 | PASS | code payload parsing + tests |
| AC-3 | PASS | inlineFromMd + tests (bold, italic, inlineCode, link) |
| AC-4 | PASS | list payloads + tests (ordered, unordered) |
| AC-5 | PASS | heading payloads + tests (h1-h6) |
| AC-6 | PASS | image downgrade + tests (alt text, empty alt) |
| AC-7 | PASS | empty/whitespace returns [] + tests |
| AC-8 | PASS | no Block identity fields + tests |
| AC-9 | PASS | CommentRow MessagePayloads + tests |
| AC-10 | PASS | CodePayload pre + tests |
| AC-11 | PASS | formatting elements + tests |
| AC-12 | PASS | link a href + tests |
| AC-13 | PASS | plain text p regression + tests |
| AC-14 | PASS | verdict/redacted unchanged + tests |
| AC-15 | PASS | sanitizeHtml prop + tests |
| AC-16 | PASS | javascript: URL stripping + tests |
| AC-17 | PASS | npm run verify: 1691 passed, 0 failed |

## Carried-Forward Warnings (not new)

- W-1: ~160 lines duplicated between derive-blocks.ts and derive-payloads.ts (plan specified extraction)
- W-2: Heading scale overrides from approved design missing (cosmetic)
- W-3: CommentRow stories not updated with markdown variant
