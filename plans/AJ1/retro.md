# AJ1 REDO — Retro (vitest DOM-snapshot net)

**Date:** 2026-06-15 · **Workpackage:** AJ1 REDO (feat/AJ1-tsx-redo)

## What worked

1. **Founder-locked approach decision prevented architecture churn.** The decision to use vitest DOM snapshots instead of screenshot-based testing was locked at the visual-regression dossier stage. This eliminated the option-comparison phase and forced the architect + reviewer to pressure-test the chosen mechanism against invariants. Result: one tight plan (414 lines), no back-to-architecture loops, clean implementation.

2. **Empirical proof of non-vacuousness.** The code-review included a real test: injecting a restyle probe (ZZZ-REVIEW-PROBE) into a component and verifying the snapshot net caught it + named the component (StatusChip) + named all composing consumers (BetCard, TaskCard, etc.). This caught the prior #287 architecture blindspot where the Playwright net could silently skip on empty glob returns — the new net has explicit enumeration guards (≥56 modules) + per-variant non-empty guards.

3. **Web-researched dossier eliminated options rejection by spec.** The visual-regression dossier read 6 competing option categories (computed-style in jsdom, ARIA snapshots, screenshot SaaS tools, Chromatic, etc.), catalogued why each violated the hard constraints (H1–H4), and locked the approach with evidence rather than assertion. No second-guessing in implementation.

4. **Multi-pass guards + custom serializer are maintainable.** The determinism contract (id normalization + timestamp masking) is explicit in code comments and tested by 3 consecutive runs with zero churn. The serializer is ~80 lines, focused on structure+class+markers (not full DOM text), reducing snapshot churn on each intended style edit.

5. **Architect's plan reconciliation section caught 5 spec-vs-reality gaps.** The plan's phase-1 reconciliation listed viewer parity (TSX-only enum), HTML-file removal scope (all 49+7 stories), rule/skill guard names, and cross-cutting invariants (verify-must-work-locally, Docker forbidden). All gaps addressed before write-code phase — zero mid-stream scope surprises.

6. **Code-review's completeness table (AC1–AC5 + removal sweep) prevented shim regressions.** The review explicitly verified: (a) TSX source of truth in place (no HTML refs); (b) snapshot net empirically non-vacuous (restyle proof); (c) viewer TSX-only; (d) verify chain untouched by Playwright/Docker; (e) 5 skills + rules rewritten. A grep sweep (`ds:sync|toHaveScreenshot|golden|__screenshots__`) confirmed no stray screenshot language remained.

## What cost avoidable cycles

1. **The original #287 shipped through full pipeline despite violating a core invariant.** The Playwright `toHaveScreenshot` golden-PNG net broke the "verify must work locally without Docker" contract. It passed critique (9/10) and review (DONE verdict), yet was reverted off main by the founder. **Root cause:** neither critique nor review questioned the mechanism (screenshot-vs-baseline) against cross-cutting invariants — they treated it as a fixed input (the spec mandated it). The screenshot approach itself was wrong, not just the execution. **Lesson candidate:** critique must pressure-test mechanisms against invariants, not only against the spec.

2. **Revert-of-revert reintroduced incidental cruft.** When the original PR was reverted (#298), it cleaned the codebase (removed 342 PNGs, configs, etc.). The redo (#287 reverted again) re-introduced a Docker `VITEST_MAX_WORKERS` hack in vitest.config and committed compiled `discovery.js/discovery.d.ts` build artifacts. The orchestrator's gate-triage (knip + lint) caught both as regressions from main. **Lesson:** a revert-of-revert restores not just features but also the original's incidental technical debt. The builder should have started from the reverted-off state (clean main), not from the original PR (dirty with pre-existing cruft).

3. **Builder mislabeled branch-introduced gate failures as "pre-existing baseline."** When knip exited 1 (untracked `discovery.js`), the builder claimed it was a pre-existing problem from the original PR. The orchestrator triage verified against `origin/main` and found knip clean there — the claim was false. The artifacts were real branch-introduced regressions that had to be fixed. **Lesson:** "pre-existing" claims must be verified against origin/main via `git diff --stat origin/main HEAD`, not asserted.

4. **Docker dependency was introduced by over-generalization, not the builder.** The original ship instructions said "baselines must be canonical (Linux)" → the builder generalized this to "verify runs in Docker for platform consistency." This was a reasoning failure by the orchestrator (instructions), not the builder. The constraints should have been explicit: "Golden PNGs must be Linux-canonical; verify must NOT pull in Docker."

## Concrete `/compound` candidates

### 1. **CC-001 recurrence: Lint baseline drift blocks every workpackage** (high severity)
**Pattern:** The pre-existing Biome lint baseline (from #287 revert) would have remained a friction if the builder had not immediately fixed the Docker hack. The `vitest.config` changes introduced 2 new Biome errors. These were caught because the builder ran `npm run lint` before submitting — but the retro log shows lint-baseline drift is a recurring blocker (H1–H4, I4, J1–J3, J5–J6, L1, L9). **Recommendation:** Formalize a `lintBaseline` snapshot in `.pipeline/progress.json` (existing CONFIRMED candidate, CC-001). Mark AJ1 as an instance of drift management (managed + resolved).

### 2. **Spec-locking mechanism works; extend it to mechanism-pressure-testing** (high severity)
**Pattern:** The dossier locked the approach decision with founder authority. The architect could not re-open it. However, critique still needs to pressure-test the locked mechanism against cross-cutting invariants — the original #287 passed critique without checking "does this violate the verify-must-be-local invariant?" **Recommendation:** Extend `/design-critique` and `/architecture-critique` skills to include a "cross-cutting invariants audit" step: read CLAUDE.md + the plan's "Hard constraints" section, then verify the locked approach does not violate any. This is not "reopen the approach" — it's "audit the chosen approach against invariants." Add to `compound-candidates.md` as a new candidate if it emerges in a third workpackage.

### 3. **Builder mislabeling creates cascading review burden** (medium severity)
**Pattern:** The builder claimed "pre-existing" without verification. The orchestrator had to verify against origin/main. If the builder had run `git diff --stat origin/main HEAD` and included it in the DoD report, the false claim would have been caught immediately. **Recommendation:** Add a "claim verification" step to `/ship` skill: any claim of "pre-existing" or "deferred from prior X" must be cited with `git diff --stat origin/main HEAD` or the specific commit/issue/retro-log entry. DoD treats all uncited claims as un-verified.

---

## Instance summary

| Phase | Cost | Notes |
|---|---|---|
| Planning | ~4h | Dossier (web-researched options) + architecture + critique. Tight plan (414 lines) prevented rework. |
| Implementation | ~6h | 6 commits: docs (3), feat (1), fix (2). Determinism verified (3 runs). |
| Review | ~3h | Code-review multi-lens (architecture, design, security, adversarial, slop, AC completeness). One DONE verdict. |
| Revert saga overhead | ~8h | Original #287 shipped + reverted (PR #298) + redo started. Included cascade of gate-triage runs + builder re-diagnosis. |
| **Total redo-phase** | **~21h** | Tight execution with clean outcome. Revert saga cost was sunk in original PR; this phase recovered cleanly. |

---

## Key signal: The original approach violated an invariant, not just the execution

The distinction matters for `/compound`: the original #287 was not "shipped with bugs that needed fixing" — it was "shipped with a fundamentally wrong approach." The screenshot paradigm broke the local-verify invariant. **This is an architecture-level decision that critique+review did not catch.** They evaluated it against the spec ("provide visual regression") and assigned it a 9/10, but did not audit it against the system's non-functional invariants.

The redo worked because the founder locked the approach decision at the dossier stage (before critique). Critique then only had to verify the locked approach (vitest snapshots) against the invariants — which it did (local, no Docker, deterministic, fast). **Process lesson:** approach-locking by founder authority + mechanism-pressure-testing in critique is the pattern that prevents this class of failure.
