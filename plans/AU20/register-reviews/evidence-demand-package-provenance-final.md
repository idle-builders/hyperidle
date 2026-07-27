# AU20 F1 demand-package provenance final review

Date: 2026-07-24  
Reviewer: independent pipeline-reviewer  
Scope: final provenance-only review

## Findings

No critical or warning finding remains.

Historical rejected candidate identity is semantic-only and cross-bound through
accepted expanded red review `78fef802…`, historical strict receipt
`c8c79ede…`, and corrected implementation review `87b9fbb1…`. It is not
compared to corrected live bytes.

Current corrected identity is independently bound to exact paths and hashes:

| Surface | Exact path | SHA-256 |
|---|---|---|
| Generator | `scripts/generate-dependency-graph.ts` | `3d27a26f17a2a29bcd2fbb780cb8a500e4c463dca808068ba16efaeaf2acd5b5` |
| Artifact | `.pipeline/work/AU20/analysis/service-data-packages.json` | `f2575f32b02a66dd4d6f708c1123385433ac46e1ff91289ad70acde38e824aa5` |
| Implementation review | `plans/AU20/register-reviews/evidence-demand-package-implementation.md` | `87b9fbb1ab33be53b2031582e0896b14ce341b281fd09e9b6291cbde8b6cf99c` |

## Adversarial results

- Same-byte generator path substitution: exit 1,
  `F1 corrected live candidate mismatch`.
- Corrected generator hash corruption: exit 1,
  `F1 corrected live candidate mismatch`.
- Historical rejected generator hash corruption: exit 1,
  `F1 rejected candidate history mismatch`.
- Canonical validator: exit 0.
- Two corrective-map generations: JSON and Markdown byte-identical.

Product semantics remain green: demand generation is byte-identical across two
runs, equals the tracked artifact, passes the independent demand validator,
contains zero workspace/group false edges, and preserves census
23 services / 231 methods / 181 types.

Stage is exactly `review-demand-package-generator`; authorization is null;
write-tests, code, and product-code locks are all true.

## Acceptance audit

| Criterion | Result |
|---|---|
| Historical rejected lineage semantic-bound, not live-path-bound | PASS |
| Exact corrected generator/artifact/review paths | PASS |
| Exact corrected hashes and source hash | PASS |
| Same-byte path substitution rejected | PASS |
| Current hash corruption rejected | PASS |
| Historical corruption rejected | PASS |
| Deterministic map generation and canonical validation | PASS |
| Product demand semantics and census preserved | PASS |
| Review stage and all locks | PASS |

VERDICT: accept
