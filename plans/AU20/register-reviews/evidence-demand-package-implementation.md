# AU20 F1 demand-package implementation review

Date: 2026-07-24  
Reviewer: independent pipeline-reviewer, implementation round 2  
Scope: strict read-only review

## Current inputs

| Input | SHA-256 |
|---|---|
| Revised generator | `3d27a26f17a2a29bcd2fbb780cb8a500e4c463dca808068ba16efaeaf2acd5b5` |
| Revised demand package | `f2575f32b02a66dd4d6f708c1123385433ac46e1ff91289ad70acde38e824aa5` |
| Frozen validator | `8cfaf4d8b4c1cf6c55b6941a7d2f6b16985603a68dd08c5ae63e5d8654db1758` |
| Frozen red proof | `fe50ae191154ce1bed20facff969ad7e061c3974a33bfbf071fc0dafd8aefe63` |
| Frozen red review | `78fef8028435cfa6f715a253bab8028a93cf45c265f7235ca58a1de3c4e87011` |

## Findings

### Product/tooling implementation

No product/tooling critical or warning remains.

The generator now parses nested composition groups independently and maps only
exact normalized live-service identities. It emits each provider's own nested
methods; it does not use generic method voting for nested groups, emit group
keys as methods, broadcast requests, collapse groups, or map
`workspaceFactory.create` to knowledge.

Two independent generations are byte-identical, equal the tracked artifact,
and pass the frozen independent validator:

```text
GEN=0,0 DOUBLE=0 TRACKED=0 VALID=0 WORKSPACE=0 GROUPS=0
candidateSha256=f2575f32b02a66dd4d6f708c1123385433ac46e1ff91289ad70acde38e824aa5
sourceSha256=b43f2a510f6bd4addea21716e95800e9eafd8ba4c06280aaace917c2a611cdbc
```

The generated nested sets reconcile to the source for all named
`DispatchPorts` groups. Census remains exactly 23 services / 231 methods / 181
types. Generator and artifact are the only authorized semantic implementation
paths; service/product code, tests, census, and ownership guard are unchanged.
The tracked diff is honestly net-negative: `+2839/-6544` overall and the
artifact replacement is `+2009/-6506`.

### Gate provenance

CRITICAL — `.pipeline/work/AU20/probes/generate-corrective-change-map.mjs`
rejected-candidate validation and
`.pipeline/work/AU20/probes/validate-corrective-change-map.mjs:247-253` —
pipeline provenance, not F1 product behavior — the gate models the rejected
candidate as historical evidence but verifies its old hashes against the
current live generator and artifact paths:

```js
sha256(readFileSync(rejected.generatorPath)) === rejected.generatorSha256
sha256(readFileSync(rejected.artifactPath)) === rejected.artifactSha256
```

That condition was true only while the rejected candidate remained live. The
authorized correction necessarily changes those same paths from rejected
hashes `aa97fb3e…` / `6143da86…` to corrected hashes `3d27a26f…` /
`f2575f32…`. Consequently the canonical map drops its accepted authorization,
and `validate-corrective-change-map.mjs --require-review` exits 1:

```text
AU20 change-map invalid: F1 rejected candidate history mismatch
```

This is a provenance-model contradiction. Reverting or disguising the correct
product output to satisfy old live-path hashes is forbidden. Historical
candidate identity must be proven through immutable historical lineage: the
accepted rejected-candidate review artifact already records both old hashes
and is itself hash-bound (`c8c79ede…`), alongside the accepted expanded red
proof that demonstrates the old candidate fails. The gate must validate that
history record/review chain without requiring current files to retain rejected
bytes, while separately validating current corrected hashes and output.

### Other gates

- `npm run lint`: exit 0.
- `git diff --check`: exit 0.
- review-finding validator: exit 0, exact 13 findings.
- census: 23 services / 231 methods / 181 types.
- `npm run check`: exit 0; all 37 packages pass.

## Acceptance audit

| Criterion | Result | Evidence / gap |
|---|---|---|
| Correct nested source semantics | PASS | Exact separated provider groups and methods; zero false adapter/group edges. |
| Exact source equality | PASS | Independent validator exit 0; source hash `b43f2a…`. |
| Deterministic double generation | PASS | Double comparison and tracked comparison exit 0. |
| No fabricated/omitted demand | PASS | Named groups source-exact; unresolved adapter excluded. |
| Frozen expanded red proof | PASS | Guard/proof/review hashes exact. |
| Census unchanged | PASS | 23/231/181, total 412. |
| Authorized scope | PASS | F1 semantic changes limited to generator + generated artifact. |
| Honest deletion | PASS | Overall net `-3705`; generated artifact net `-4497`. |
| Corrective-map/provenance gate | FAIL | Historical rejected hashes incorrectly asserted against corrected live paths. |

## Required correction

Return the gate/provenance issue to the coordinator/planner. Preserve the
rejected candidate as immutable reviewed history, validate its review-chain
hashes, and validate corrected live files separately. Do not alter product
generator semantics or regenerate rejected bytes to make the gate green.
After the gate is corrected, rerun map validation and final verification;
product implementation needs no revision unless those runs expose a new
behavioral defect.

VERDICT: revise
