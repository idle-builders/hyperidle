# AU20 eval unused dependency static-red review

VERDICT: accept

Reviewed `.pipeline/work/AU20/red-proofs/eval-knip-unused-dependency.json`
at SHA-256
`72adaaf2b212f56ee34c7f0f61dd5a52acee5d2ef9d09ed8783b48b71cb608e1`.

- Focused Knip reproduces the sole eval finding:
  `@hyperidle/connections` is unused.
- Eval has no import, dynamic import, require, or runtime reference to the
  package. Its credential contract comes from `@hyperidle/shared`.
- The matching lock entry is exactly
  `packages["packages/eval"].dependencies["@hyperidle/connections"]`.
- The root connections workspace link and core-api/web dependency entries are
  legitimate and must remain byte-identical.
- Notifications’ two findings remain frozen for their separate increment.
- Product sources and the 23/231/181/412 census remain unchanged.

Write-code authorization is limited to removing the eval dependency entry from
`packages/eval/package.json` and its matching eval workspace entry from
`package-lock.json`. Unrelated lockfile regeneration is forbidden.
