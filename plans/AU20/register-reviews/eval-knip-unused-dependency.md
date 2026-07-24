# AU20 eval unused dependency strict implementation review

VERDICT: accept

The candidate diff is exactly one deletion from `packages/eval/package.json`
and its one matching deletion from `package-lock.json`.

- Eval manifest SHA-256:
  `0a6388b34d0eafec15650b07b03bae2908325b98c4591d94525a6a9cf4af1b92`
- Lockfile SHA-256:
  `bd2d4ca14bdb9e38da74ba3ce3c26df7cbded1aa3f1f89047ca6c01ff9b70817`

The eval dependency is absent from both JSON objects. The root connections
workspace link, physical link target, and core-api/web lock dependencies remain
unchanged. Focused eval Knip is clean; full Knip reports only notifications’
two frozen dev-dependency findings.

Verification:

- eval typecheck: pass
- eval tests: 3 files / 26 tests
- full check: 37/37 packages
- lint: pass
- full unit: 356 files / 3561 tests
- corrective gate: 604 identities / 181 diagnosed / 0 unresolved
- census: 23 services / 231 methods / 181 types / 412 total
- diff check: pass

Whole-repository `npm install --package-lock-only` would normalize unrelated
pre-existing lock drift (+5006/-1632). That unrelated churn was fully reverted
and is excluded by the leaf’s exact-lock-diff contract.
