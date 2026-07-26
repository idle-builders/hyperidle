# AU20 architecture amendment — vocabulary validator committed state

## Decision

The accepted terminology validator proves the uncommitted green candidate but rejects
the same byte-exact documents after commit because it requires both target paths in
`git diff`. Correct validator state handling only:

- baseline document hashes + exact six findings => intended red;
- reconstructed expected document hashes + either exact two-path candidate diff or
  clean committed diff => green;
- mixed hashes, unrelated tracked changes, or partial target diff => fail.

Changed paths are the normalized, sorted union of
`git diff --name-only --` and `git diff --cached --name-only --`. Keeping index and
worktree observations separate before union detects a staged edit followed by an
unstaged reversal to HEAD. Accepted green sets are exactly `[]`, exactly the two target
paths, or exactly the validator's own path while this validator-correction candidate
is uncommitted; every other set rejects. The self-path state still requires expected
document hashes and every original frozen invariant.

Do not change the original terminology proof, documents, guard, configuration,
product, tests, or census. This correction may add its own probe and red-proof JSON.

## Acceptance criteria

- **AC-C1 — Bug pinned.** Static red records committed HEAD, expected document hashes,
  empty tracked diff, current exit 2, and exact scope-mismatch diagnostic.
- **AC-C2 — Both lifecycle states valid.** Validator passes the byte-exact uncommitted
  two-document candidate and the byte-exact committed clean state.
- **AC-C3 — Strict scope retained.** Export pure `classifyGreenScope(paths)`,
  `classifyDocumentState(hashes)`, and `readChangedPaths(cwd)` seams from the same
  validator while preserving normal CLI execution behind an is-main guard. Probe a
  disposable Git repository through clean, staged, unstaged, mixed staged+unstaged,
  same-path staged/unstaged cancellation, exact-two-path, exact-validator-self,
  one-path, and unrelated-path states. Separately exercise the document-state seam for
  baseline, expected, mixed, and modified hashes.
- **AC-C4 — Gate stable.** Validator, vocabulary guard, check/lint/test, and census
  remain green after correction.

## Technical task tree

#### `pin-committed-state-defect`
- **Kind:** implementation
- **Owns:** `file:.pipeline/work/AU20/probes/validate-vocabulary-validator-state.mjs`, `file:.pipeline/work/AU20/red-proofs/vocabulary-validator-state.json`
- **Consumes:** committed validator/proof/documents
- **ACs:** AC-C1, AC-C2, AC-C3
- **Verify:** red probe exits only on current clean-state scope rejection
- **Parallel:** no

#### `correct-validator-state-machine`
- **Kind:** implementation
- **Depends on:** `pin-committed-state-defect`
- **Owns:** `file:.pipeline/work/AU20/probes/validate-harness-vocabulary-evidence.mjs`
- **Consumes:** accepted state probe and original proof
- **ACs:** AC-C2, AC-C3, AC-C4
- **Verify:** state probe and original validator pass; focused/full gates green
- **Parallel:** no

## Contracts

Only validator state acquisition/test seams and its diff-state predicate change.
`readChangedPaths(cwd)` unions the normalized output of exact unstaged
`git diff --name-only --` and staged `git diff --cached --name-only --` commands, then
sorts. `classifyGreenScope(paths)` returns committed-green only for empty input,
candidate-green only for the exact two target paths, validator-candidate-green only
for the exact validator path, and rejection otherwise.
`classifyDocumentState(hashes)` retains baseline/expected/mixed/unknown decisions.
Normal CLI remains the default when invoked directly. All content hashes, replacement
spans, document reconstruction, frozen guard/package/census hashes, and exact red
diagnostics remain enforced.

## Security and abuse

Validation infrastructure only. Runtime security categories are N/A.
