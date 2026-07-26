# AU20 mock inventory evidence regeneration — implementation review

**VERDICT: accept**

Candidate scope is exactly the three generator-owned outputs:

- `inventory.json`: +3 / -12
- `inventory.md`: +6 / -7
- `queue.md`: +1 / -2
- aggregate: +10 / -21

Semantic replacement is exact: connection rows 97 and 113 collapse to current 114;
policy rows 547 and 549 relocate to 470 and 472. Offender total changes 14 to 13,
straight-swap changes 9 to 8, and the duplicate connection occurrence is removed.

Independent focused exits are all zero: default validator,
`npm run mock-inventory:check`, and validator `--verify-generation`. UTC
before/between/after/emitted is `2026-07-24`; both generator runs exit zero and produce
identical bytes:

- inventory JSON:
  `7a3b787b308e1eeaab39585c32cb8b92cf8c02b78b51f903e1ea790b33268837`
- inventory Markdown:
  `1ecee5e0994c0c93de94c821b72dbf6f7d98ddfe4d13a8a7b65839502c97b12d`
- queue:
  `bcbb9fea019e0eb5302e4fe8acef44eac524e4d00524c0eac3e6ab46b84570fb`

Frozen validator, proof, generator, two source files, two authored evidence files, and
census hashes remain unchanged. No source, product, test, script, gate, package, lock,
or census changes. `git diff --check` is clean. Builder aggregate gates:
check 0; lint 0; unit/component test 0 (356 files / 3561 tests); census 0 at
23 services / 231 methods / 181 types / 412 total.

No findings.
