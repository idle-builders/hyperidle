# AU20 Cursor harness guard tests — implementation review

**VERDICT: accept**

Candidate scope is exactly two tests:

- AR1: +4 / -1, SHA-256
  `d2c6db87a0ad2efafcaa836f4daa7f5cf8327571f8f6ecd4c79add0b56892062`
- AR2: +33 / -38, SHA-256
  `b75a3367d137dcd56a11969ee0fb91422fdfa935e7381d276cb95ddd8ec796be`
- aggregate: +37 / -39

Independent probe exits zero. Targeted Vitest exits zero with 2 files and 71/71 tests.
AR1 complete fixtures contain the exact ordered five families and preserve clean,
coverage-debt, AR7, and model-import allowlist behavior. AR2 uses exact expected sets
for empty, partial, complete, unsupported-gh, comment-only, and real-call cases.

Registry, guard, package, lock, census, product, gates, and every non-target test remain
unchanged. Builder aggregate gates: check 0; lint 0; unit/component test 0 (358 files /
3632 tests); census 0 at 23 services / 231 methods / 181 types / 412 total.

No findings.
