# AU20 Cursor probe committed state — implementation review

**VERDICT: accept**

Candidate changes only the Cursor structural probe: +54 / -18, SHA-256
`852e6d63e6ca14fa372f6def10be2ac42e8b039015092c154639f85b53c43779`.

Independent lifecycle matrix, direct probe, side-effect-free import, and targeted
Vitest all exit zero; targeted result is 2 files / 71 tests. The probe exposes the
accepted seams, reads staged and unstaged paths separately, rejects intersections,
and accepts only clean, exact target2, or exact probe-self states. Disposable Git
coverage includes staged, unstaged, split, self, partial, unrelated, self-combination,
partial-stage overlap, and cancellation states.

Current formatted AR2 evidence and historical Cursor red evidence remain separately
bound. Tests, guard, registry, packages, locks, census, and product are unchanged.
Builder full gates: check 0; lint 0; unit/component test 0 (358 files / 3632 tests);
census 0 at 23 services / 231 methods / 181 types / 412 total.

No findings.
