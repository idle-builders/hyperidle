# AU20 F7/F12 current census evidence static-red review

VERDICT: accept

Reviewed `.pipeline/work/AU20/probes/validate-current-census-evidence.mjs`
at SHA-256
`d04163f248be09bef650b0b5c5c783063f0475b3f9b7d4ec57ac18cdfa117c95`.

- The unchanged executable census is bound at SHA-256
  `df74ee90cce2bf075f2fd32199e6c86780871c2530c6baa981a4cc8498d0cc9b`.
- Read-only validation exits 1 truthfully because both committed evidence
  artifacts are stale.
- Live census contains 23 unique valid rows and totals 231 methods, 181 types,
  412 declarations. Row arithmetic and recomputed totals match.
- The 231-method and 181-type ceilings are enforced.
- A temporary-copy proof showed `--write` changes exactly the two authorized
  evidence artifacts; a second run is byte-identical; ordinary validation then
  passes.
- The validator has no baseline or output-path override and refuses writes
  when live structure, arithmetic, service count, or ceilings fail.
- Product code and `scripts/surface-census.ts` remain unchanged.

The static red is accepted. Evidence generation may update only:

1. `.pipeline/work/AU20/rearch/census-after.json`
2. `plans/AU20/surface-census.md`
