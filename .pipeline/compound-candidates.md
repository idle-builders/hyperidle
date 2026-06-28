# Compound Candidates

Durable memory of recurring-friction patterns surfaced by `/pipeline:compound`. One row per
pattern. Never delete rows — history is the audit trail. States: `CONFIRMED` (3+ occurrences,
fix proposed), `EMERGING` (2 occurrences, watching), `RESOLVED` (fix landed + recent retros
stopped flagging it), `RECURRED` (reappeared after a fix).

First run: 2026-06-28. Retro files analyzed: 102 (`.pipeline/retro-log/*.jsonl`).

| ID | Pattern | State | Recurrence (distinct WPs) | Latest | Proposed fix target | Notes |
|----|---------|-------|---------------------------|--------|---------------------|-------|
| C1 | Integration/wiring proof gap — unit/red-green pass while the integrated surface is broken or the component is built-but-unwired | CONFIRMED | 7 (AL7, AM5, AH3, AG4, AI6, N4, Y4) | 2026-06-26 (AM5) | `write-tests` + `review` (Adversarial/Auditor) | Strongest + most recent. AL7 retro literally says "Matches AA2, W2". Red tests written against the mechanism in isolation, not the consuming seam. Aligns with MEMORY: mock-validation-trap, agent-behavior-needs-live-eval, live-proof-lanes-run-before-ship. |
| C2 | Scope-creep beyond the locked plan — WP balloons past its concept/architecture boundary | FIX LANDED (2026-06-28) | 6 (AL1, AM4, AE1, AE2, T3, api-typesafety) | 2026-06-23 (AM4) | `work-planning/SKILL.md` | Root cause for the worst case (AL1) was that a research-only WP existed at all. Fix: work-planning now refuses to register research/investigation/exploration-only WPs — research belongs in work-planning or `/concept`; every WP must deliver an observable feature/outcome. Added an "It is NOT" bullet + a refusal case. Other causes (AM4 = legitimate founder override; AE1/AE2 = exploratory sweep / dead code) not targeted by this fix; watch for recurrence. |
| C3 | Lint / pre-submit checklist skipped before declaring green | EMERGING→RESOLVED | 3 (AI4, T2, U6) | 2026-06-13 (AI4) | — | 2 of 3 are May (T2/U6); only AI4 recent. Trending resolved via verify discipline. Watch; no action. |
| C4 | Stale-base / mid-flight merge drift | RESOLVED | 4 (AF4, AK2, R5, U1) | 2026-06-15 (AK2) | — | Fix landed (MEMORY: pipeline-stale-base-revert — merge-base + revert gate at pipeline start). No AL/AM/AN recurrence. |
| C5 | Architecture-critique fact-audit catches false claims about existing code | RESOLVED (positive — protect) | 3 (AF11, AK4, AK7) | 2026-06-22 (AK7) | — | A working safeguard, not a friction. Protect from dilution. |
| C6 | Infrastructure overhead (attestation loops, CI re-runs) eats large % of WP time | RESOLVED | 3 (AJ6, AK2, U6) | 2026-06-16 (AJ6) | — | U6 attestation loop fixed (MEMORY: attestation-gate-bypass, ship-attestation-ci-pitfalls). Residual = stale-base (C4). |
