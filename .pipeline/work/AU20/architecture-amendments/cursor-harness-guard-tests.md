# AU20 architecture amendment — Cursor harness guard tests

## Decision

The authoritative harness registry contains five families, including `cursor-agent`.
Two AR1/AR2 guard test files still construct four-family fixtures and assert counts
from the former registry. Production guard logic is correct: it reports Cursor as
missing, causing 11 stale assertions.

Update tests only. Every fixture described as complete must declare all five current
families. Partial fixtures must explicitly assert Cursor is missing. Prefer exact set
equality against the registry-derived result over bare length assertions. Preserve
honesty, coverage symmetry, comment/string stripping, allowlist-debt, and banned-import
behavior. Do not change guard logic, registry, product, integrations, census, or gates.

## Acceptance criteria

- **AC-H1 — Exact red pinned.** Evidence records targeted Vitest result: 2 failed files,
  11 failed / 60 passed tests, with every failure caused by omitted Cursor coverage.
- **AC-H2 — Complete fixtures are truly complete.** AR1 clean/allowlist fixtures and
  AR2 “all families” fixtures declare all five supported families.
- **AC-H3 — Partial semantics remain strict.** Missing-family assertions compare exact
  sets, including Cursor where undeclared. `gh` remains unsupported and does not
  satisfy any registry family.
- **AC-H4 — No weakening.** Production guard/registry and non-target tests remain
  byte-frozen. Targeted tests pass 71/71; full check/lint/test and census stay green
  at 23 services / 231 methods / 181 types / 412 total.

## Technical task tree

#### `pin-cursor-guard-test-drift`
- **Kind:** implementation
- **Owns:** `file:.pipeline/work/AU20/probes/validate-cursor-harness-guard-tests.mjs`, `file:.pipeline/work/AU20/red-proofs/cursor-harness-guard-tests.json`
- **Consumes:** registry, guard, two test files, exact targeted output
- **ACs:** AC-H1, AC-H2, AC-H3, AC-H4
- **Verify:** probe exits red only for exact 11 stale expectations
- **Parallel:** no

#### `align-guard-test-matrix`
- **Kind:** implementation
- **Depends on:** `pin-cursor-guard-test-drift`
- **Owns:** `file:packages/db/src/__tests__/ar1-honest-harness-guard.test.ts`, `file:packages/db/src/__tests__/ar2-coverage-guard.test.ts`
- **Consumes:** accepted frozen probe/proof
- **ACs:** AC-H2, AC-H3, AC-H4
- **Verify:** `npx vitest run packages/db/src/__tests__/ar1-honest-harness-guard.test.ts packages/db/src/__tests__/ar2-coverage-guard.test.ts` exits 0 with 2 files / 71 tests; `npm run check`, `npm run lint`, and `npm run test` exit 0; `npx tsx scripts/surface-census.ts --table` exits 0 and reports 23 / 231 / 181 / 412
- **Parallel:** no

## Contracts

`SUPPORTED_HARNESSES` remains the single source of truth. Tests may use it to derive
exact expected sets; they must not duplicate a new independent registry. Fixture source
strings still declare literal `requireHarness` calls so parser behavior remains real.

Protected byte-frozen paths are `scripts/lib/honest-harness-predicate.ts`,
`scripts/honest-harness-guard.ts`, `package.json`, lockfiles,
`scripts/surface-census.ts`, every gate/guard/measurement script, and every test
outside the two owned test files. The red validator must enforce implementation
tracked scope as exactly the two owned tests; any other tracked path rejects.

## Security and abuse

Test-only correction. Honesty and symmetry enforcement is preserved, not relaxed.
Other runtime security categories are N/A.
