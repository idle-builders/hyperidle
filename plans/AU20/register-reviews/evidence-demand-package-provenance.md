# AU20 F1 demand-package provenance review

Date: 2026-07-24  
Reviewer: independent pipeline-reviewer  
Scope: provenance-only re-review

## Findings

### Historical rejected candidate

PASS — rejected generator `aa97fb3e…` and artifact `6143da86…` are no longer
hashed against current live paths. They are carried as rejected history and
cross-bound through:

- accepted expanded red review `78fef802…`, which freezes both rejected
  hashes and proves the rejected package fails;
- historical strict-review receipt `c8c79ede…`, referenced by the corrected
  review chain;
- corrected implementation review `87b9fbb1…`, which records the historical
  receipt while separately accepting product/tooling behavior.

Corrupting the historical rejected generator hash in a temporary map causes
`validate-corrective-change-map.mjs --require-review` to exit 1 with
`F1 rejected candidate history mismatch`.

### Current corrected candidate

CRITICAL — `.pipeline/work/AU20/probes/validate-corrective-change-map.mjs:231-242`
— current-live provenance — the validator checks the candidate's expected
hashes and hashes whichever paths the mutable map supplies, but it does not
require those paths to be the authorized live paths:

```text
scripts/generate-dependency-graph.ts
.pipeline/work/AU20/analysis/service-data-packages.json
plans/AU20/register-reviews/evidence-demand-package-implementation.md
```

Adversarial proof: a temporary map changed only
`activeIncrement.candidate.generatorPath` to a temporary same-byte copy outside
the worktree. `--require-review` still exited 0. Therefore the gate proves
“some file has corrected bytes,” not “the current authorized live generator
has corrected bytes.” The integrity block is outside `payloadSha256`, so this
path substitution is not caught elsewhere.

Direct current-hash corruption is rejected correctly with
`F1 corrected live candidate mismatch`; exact-path identity is the remaining
gap.

### State and locks

PASS — canonical map validation exits 0; stage is exactly
`review-demand-package-generator`; authorization is null; write-tests, code,
and product-code locks are all true.

## Acceptance audit

| Criterion | Result | Evidence |
|---|---|---|
| Historical `aa97/6143` is not compared to current live files | PASS | Historical chain only; canonical validator green. |
| Corrupted historical binding is rejected | PASS | Exit 1, rejected-history mismatch. |
| Corrected `3d27/f257` hashes are validated | PASS | Canonical green; stale-hash mutation exits 1. |
| Corrected candidate is bound to exact authorized live paths | FAIL | Same-byte temporary generator path substitution exits 0. |
| Review-demand state and locks | PASS | Stage exact; all three locks true. |

## Required correction

Require exact path equality for the corrected candidate before reading bytes:

```text
generatorPath === "scripts/generate-dependency-graph.ts"
artifactPath === ".pipeline/work/AU20/analysis/service-data-packages.json"
implementationReviewPath ===
  "plans/AU20/register-reviews/evidence-demand-package-implementation.md"
```

Apply the same exact-path checks in both map generation and validation. Keep
historical rejected paths non-authoritative. Then rerun canonical validation,
stale-current corruption, historical corruption, and same-byte path
substitution.

VERDICT: revise
