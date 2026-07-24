# AU20 vocabulary validator committed state — implementation review

**VERDICT: accept**

Candidate changes only the terminology validator: +116 / -70, SHA-256
`bbeb559f20833b67e3bb6c0e0bf500628051522ef2261999231928c3076c535e`.

Independent exits are zero: state probe, direct validator CLI, vocabulary guard, and
AH5 mock guard. The implementation exports the three accepted seams, keeps direct CLI
behind an is-main check, and reads the normalized/sorted union of staged and unstaged
tracked paths. Scope accepts only clean committed, exact two-document candidate, or
exact validator-self candidate states. The matrix rejects partial, unrelated,
self-plus-document, self-plus-unrelated, and staged/unstaged cancellation cases.

Document classification and full byte reconstruction remain intact. Original proof,
documents, guard, package, and census hashes remain frozen. No scripts, product,
tests, configuration, package, lock, or census changes. Builder gates: check 0; lint
0; unit/component test 0 (356 files / 3561 tests); census 0 at 23 services / 231
methods / 181 types / 412 total.

No findings.
