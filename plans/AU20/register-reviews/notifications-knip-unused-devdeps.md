# AU20 notifications unused dev-dependencies strict implementation review

VERDICT: accept

The candidate changes only the notifications manifest and package lock:

- manifest SHA-256:
  `a87edcd4fac0b82bd5eb0feb7e306bce06a11c3c864a832cd99de42b58760b7a`
- lock SHA-256:
  `cad0e88ea2c0f6406e67df4ad0fb6b8addab85cd0c96d136f25d248aa86418a5`

Both manifest and workspace lock entries are removed. The orphan
`@types/smtp-server`, `smtp-server`, and `ipv6-normalize` nodes are absent.
`@types/node`, `@types/nodemailer`, `nodemailer`, and `punycode.js` remain.
No Bun lock, source, product, gate, or census file changed.

Verification:

- focused and full Knip: pass, no actionable findings
- notifications check: pass
- notifications unit: 2 files / 30 tests
- relevant service integration: 3 files / 37 tests
- full check: 37/37 packages
- lint: pass
- full unit: 356 files / 3561 tests
- corrective gate: 604 identities / 181 diagnosed / 0 unresolved
- census: 23 services / 231 methods / 181 types / 412 total
- diff check and JSON semantic checks: pass
