# AU20 F13 review-provenance feasibility

Date: 2026-07-24

| Probe | Observation | Verdict |
|---|---|---|
| Corrected live review | `sha256sum .pipeline/work/AU20/review.md` = `48360d3d…`; finding validator exits 0 with exact 13/6/6/1 and F1–F13 | GO |
| Historical evidence | Accepted architecture review `5194f038…` and accepted red-proof review `cc04e856…` both record historical live hash `cef525…` | GO-WITH-CHANGE: validate both immutable artifacts; do not read historical bytes from mutable live path |
| Stale cache | Existing `validate-corrective-change-map.mjs --require-review` exits 0 although generator would revoke the gate because live review no longer hashes to `cef525…` | GO-WITH-CHANGE: validator independently compares live current review and immutable historical artifacts |
| Determinism | Generator already writes canonical pretty JSON and fixed Markdown; new bindings are content-derived constants with no time/random input | GO; prove with double generation and byte comparison |

No web research or product POC is warranted. This is a local evidence-graph
correction using Node SHA-256 and deterministic file IO already established by
the accepted AU20 tooling.
