# AU20 architecture amendment — production Knip test reachability

## Decision

`knip:production` is diagnosing four live test-support modules as unused because
Knip production mode excludes their test-entry consumers while `--include files`
still evaluates the helper files. Deleting or inlining those modules is forbidden:
each has direct static importers and provides shared runtime test capability.

Split the two questions currently conflated by the command:

1. run unused-file analysis with normal entry reachability, including tests;
2. run production-mode file/dependency/unlisted/binary analysis through a narrow
   Knip preprocessor that removes only test-owned file findings.

The standalone contract is:

```text
npx knip --include files &&
npx knip --production --include files,dependencies,unlisted,binaries \
  --preprocessor ./scripts/knip-production-test-files.mjs
```

The preprocessor recognizes only the repository's structural `__tests__` directory
boundary, removes only `files` issues below that boundary, and updates only the
`files` counter. It never filters a source path outside `__tests__` or any
dependency/export issue. The first invocation still catches genuinely unused
test-owned files. The production invocation still catches a production source module
imported only by tests.

## Plan reconciliation

- `cli-adapter-fixtures.ts` has six direct static-import consumers.
- `dispatch-test-helpers.ts` has seven direct static-import consumers.
- `run-orchestration-test-runtime.ts` has four direct static-import consumers.
- `worker-runtime-test-helper.ts` has three direct static-import consumers.
- The aggregate release failure is therefore a validation-substrate defect, not four
  product-code deletion opportunities.
- No service API, service implementation, test assertion, Knip configuration, census
  script, or generated evidence may change in this increment.

## Acceptance criteria

- **AC-K1 — Live helpers remain intact.** A static validator proves every named helper
  exists and has at least one direct static import. It also records the exact importer
  set so deletion or import removal fails the proof.
- **AC-K2 — Honest unused-file coverage in both graphs.** `npm run knip:production`
  includes ordinary-reachability and production-reachability `files` invocations.
  An executable adversarial fixture proves an unused test helper fails the ordinary
  invocation, a live test helper is excluded only from the production result, and a
  production module imported only by tests still fails the production invocation.
- **AC-K3 — Production dependency coverage remains.** The same script runs a separate
  production-mode invocation including `files,dependencies,unlisted,binaries`.
  The preprocessor may alter only test-owned `files` issues and their counter.
- **AC-K4 — Release validation advances.** `npm run knip:production` exits zero.
  `npm run check`, `npm run lint`, and `npm run test` remain green; the census remains
  23 services / 231 methods / 181 types / 412 total. `npm run verify:release` must
  pass the Knip phase and record the next reached phase/result.

## Technical task tree

#### `prove-knip-reachability-defect` — Pin the false-positive mechanism
- **Kind:** implementation
- **Depends on:** none
- **Owns:** `file:.pipeline/work/AU20/probes/validate-knip-production-reachability.mjs`, `file:.pipeline/work/AU20/red-proofs/knip-production-reachability.json`
- **Consumes:** `file:package.json`, the four live helper modules and their importers
- **ACs:** AC-K1, AC-K2, AC-K3
- **Start here:** this amendment; `package.json`; the four paths emitted by `knip:production`
- **Verify:** validator exits non-zero against the current conflated command and reports all four helpers as live
- **Parallel:** no

#### `split-knip-production-validation` — Correct the validation command
- **Kind:** implementation
- **Depends on:** `prove-knip-reachability-defect`
- **Owns:** `file:package.json`, `file:scripts/knip-production-test-files.mjs`
- **Consumes:** accepted red proof and validator
- **ACs:** AC-K2, AC-K3, AC-K4
- **Start here:** accepted red-proof review; `package.json#scripts.knip:production`
- **Verify:** validator and `npm run knip:production` exit zero, then check/lint/test/census
- **Parallel:** no

## Contracts and migration

- Only `package.json#scripts.knip:production` and
  `scripts/knip-production-test-files.mjs` may change in write-code.
- No call-site migration exists; all four helpers and all importers are protected.
- `protectedTests`: all current importers reported by the static proof.
- `sharedFiles`: `package.json`.

## Security and abuse

No route, credential, path input, outbound URL, or state-changing endpoint changes.
Rate limiting, input trust, secret handling, path traversal, and SSRF are N/A.

## Risks

- Filtering all production file findings would hide production modules reachable only
  from tests; the preprocessor must classify the issue path and the adversarial proof
  must pin this negative case.
- Adding Knip ignores would affect ordinary analysis too; ignores are forbidden.
- Expanding to export/type cleanup is outside this corrective leaf.
