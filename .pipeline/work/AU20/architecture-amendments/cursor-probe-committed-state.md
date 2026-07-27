# AU20 architecture amendment — Cursor probe committed state

## Decision

The accepted Cursor guard-test probe validates the uncommitted two-test candidate but
rejects the same byte-exact tests after commit because it requires those paths in the
working diff. Correct only the probe lifecycle state.

**Depends on:** committed `cursor-ar2-format` leaf. Before its red proof is accepted,
refresh this lifecycle proof's frozen AR2 hash to the formatter-produced committed
hash and bind the format commit/tree receipt. The historical Cursor red proof remains
byte-frozen; only this lifecycle proof and the probe's current green-state evidence
may adopt the formatted hash.

**Satisfied dependency receipt:** commit
`ec9f7b39409baadc3b732e269cef7cdcfc51ec32`, tree
`801242ea1aacd30168d7f51c7626665c6c4a5bd1`, parent
`3bf55368712dfaf29ff6db883c0f1b67e0479f07`; formatted AR2 SHA-256
`40637c22d91d495e1b91d2176200974be65bf89386cd1a8849761d2e1c557e02`.

`readScopeState(cwd)` returns normalized sorted `stagedPaths`, `unstagedPaths`,
`changedPaths` (their union), and `overlapPaths` (their intersection). Any overlap is
rejected; this conservatively rejects same-path cancellation and partially staged
same-path edits.
For green content, accept exactly: clean committed `[]`, exact two target tests, or
exact probe-self while this correction is uncommitted. Reject partial, unrelated,
self-plus-target, self-plus-unrelated, and any overlap. Red
baseline semantics remain historical proof only.

## Acceptance criteria

- **AC-P1:** New static evidence pins the post-format committed HEAD/tree/receipt,
  formatted green test hashes, empty tracked diff, current probe exit 2, and exact
  scope-mismatch diagnostic.
- **AC-P2:** Probe exports side-effect-free `readScopeState(cwd)` and
  `classifyGreenScope(scopeState)` plus `main()`. Importing performs no hashes, Git,
  Vitest, output, or exit. Direct execution calls `main()` only when
  `import.meta.url === pathToFileURL(process.argv[1]).href`.
- **AC-P3:** Disposable Git matrix pins: clean accepts; target2 all-staged accepts;
  target2 all-unstaged accepts; target2 split across staged/unstaged accepts; self-only
  accepts; partial, unrelated, self+target, self+unrelated reject; same-path
  staged+unstaged overlap/cancellation rejects.
- **AC-P4:** Original Cursor proof, tests, guard, registry, package, locks, gates,
  product, and census remain frozen. Corrected probe, targeted 71/71, check/lint/test,
  and census are green.

## Technical task tree

#### `pin-cursor-probe-lifecycle`
- **Kind:** implementation
- **Owns:** `file:.pipeline/work/AU20/probes/validate-cursor-probe-state.mjs`, `file:.pipeline/work/AU20/red-proofs/cursor-probe-state.json`
- **Consumes:** committed Cursor probe/proof/tests
- **ACs:** AC-P1, AC-P2, AC-P3
- **Verify:** current red exits only on clean committed scope mismatch
- **Parallel:** no

#### `correct-cursor-probe-lifecycle`
- **Kind:** implementation
- **Depends on:** `pin-cursor-probe-lifecycle`
- **Owns:** `file:.pipeline/work/AU20/probes/validate-cursor-harness-guard-tests.mjs`
- **Consumes:** accepted lifecycle proof
- **ACs:** AC-P2, AC-P3, AC-P4
- **Verify:** lifecycle probe, Cursor probe, exact targeted Vitest, and full gates green
- **Parallel:** no

## Contracts

Only Cursor probe state acquisition, pure scope seam, is-main wiring, and the
formatter-caused current AR2 green hash evidence may change. All structural fixture
assertions, historical Cursor red proof bytes, and every other frozen hash remain
intact. Exact accepted scope sets are `[]`, target2, or probe-self only, always with
`overlapPaths=[]`.

## Security and abuse

Validation infrastructure only; runtime security categories are N/A.
