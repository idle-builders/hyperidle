# L15 Retro — Strip drag/drop from Kanban; let humans request task changes

**Trial:** ab/L15-1a (one of six A/B variants).
**Pipeline window:** ~3 hours (2026-05-03 23:41Z → 2026-05-04 02:35Z).
**Final state:** DONE — pushed to `origin/ab/L15-1a`. PR creation skipped (A/B branches are experiments, not merge candidates).

---

## What went well

1. **Concept-was-already-locked detection.** L15 doesn't introduce a new primitive — it reuses L1's Thread with `host_kind:'task'`. Recognising this up-front let me skip `/concept` legitimately and saved a step. The pipeline rule "fail fast if concept missing for a New / Reshaped noun" is sharp enough that the inverse path (proceed without concept) was equally fast to take.

2. **Multi-variant design exploration paid off.** Variant A (inline-action-row) won at 7.7, B at 6.9, C at 7.0; the synthesis pulled in B's two-state thread chip — a feature the founder would not have asked for but that demonstrably scans better. Final approved at 8.4. Skipping `/design` would have locked in variant A as-drawn and missed B's contribution.

3. **Architecture-critique caught real gaps.** Round 1 surfaced a CC-007 spec-drift (`Tag.test.tsx` referenced a non-existent path) and an L7-style missing route-checklist column for rate-limit posture. Both fixed in Round 2 before any test was written. Score moved 7.0 → 8.4.

4. **Parallel review fan-out worked.** Steps 7+8 (simplification + slop scans) and 10-13 (architecture + adversary + security + design reviews) ran as parallel sub-agents. Wall-clock saving was real (each batch ~3-5 min vs. ~15-20 min sequential).

5. **Inline-style touch-target fix was the right escape hatch.** After three Tailwind responsive variants failed to override DaisyUI's `.btn-xs` cascade, switching to `style={{ minHeight: 44, minWidth: 44 }}` resolved the K8 audit immediately. Bounded the cost (~5 min vs. an hour of CSS specificity wrestling) and tracked the cleaner long-term path as a follow-up.

---

## What went badly

1. **Slop-scan agent scanned the wrong branch.** The first slop-scan attempt grepped the L15 namespace and found `ab/L15-1b` (a sibling A/B trial with a different implementation of the same story). Its findings were against code I hadn't written. Caught by the fact that the recommended fixes referenced files that didn't exist in MY worktree. Re-ran with explicit file list. **Lesson:** when the worktree is one of N parallel A/B branches, sub-agents looking at "all things related to L15" can wander into siblings. The architect, adversary, and design review agents had to be told explicitly to ignore non-L15 paths in `git status`.

2. **Apply-review subagent hit usage limit mid-task.** Lost the resolutions doc and partial fixes had to be reconstructed manually from `git diff`. **Lesson:** the apply-review step is the highest-blast-radius moment in the pipeline (consolidating 4 reviews into code changes); when it gets cut off, recovery requires reading every modified file to figure out what's done and what isn't. Worth adding intermediate progress checkpoints.

3. **DoD audit missed a critical e2e contract.** The mock route handler in `team-request.spec.ts` had two bugs: (a) the `**/api/threads*` glob matched only `/api/threads`, not `/api/threads/<id>`, and (b) the GET list returned empty unconditionally. The vitest unit tests passed, the writer agent never ran the e2e, and only the QA auditor caught it. **Lesson:** the pipeline should run e2e BEFORE the DoD audit (or the audit step should be required to run e2e itself, which the current skill says it should).

4. **Tailwind responsive variants failed silently.** `max-lg:`, `[&]:`, `!min-h-[44px]` — none overrode DaisyUI's `.btn-xs` cascade. Wasted ~20 minutes trying variations before falling back to inline styles. The classes WERE in the className but had no measurable effect on computed style. Possible cause: arbitrary value + responsive prefix combination not being JIT-generated, or specificity loss against DaisyUI's theme cascade. Not investigated further — tracked as `kanban-thread-chip-density-tokens` follow-up.

5. **L18 forward dependency in spec text.** The L15 spec says "open the task's attached thread (from L18)" but L15 only depends on L1 in the dependency graph. Resolved by reading SHARED.md, which confirms `host_kind:'task'` already exists in L1. The spec text is outdated; should reference L1 directly.

---

## Numbers

| Metric                      | Value                                                  |
| --------------------------- | ------------------------------------------------------ |
| Pipeline steps              | 17 (concept skipped legitimately)                      |
| Sub-agents launched         | 16 (3 design variants + 4 reviews + others)            |
| Design score                | 8.4 / 10                                               |
| Plan score                  | 8.4 / 10                                               |
| MUST-FIX findings (4 reviews) | 14 (4 + 5 + 3 + 5 — apply-review consolidated)        |
| MUST-FIX findings (2 scans) | 8 (4 + 4)                                              |
| DoD audit                   | NOT DONE → DONE after e2e remediation                  |
| Final test count            | 3218 unit (1 pre-existing failure unrelated to L15)    |
| Final e2e count             | 130 passed / 17 skipped / 0 failed                     |
| Files touched               | 18 modified + 12 new + 1 deleted                       |
| Lines (final commit)        | +5,017 / -334 (mostly design-exploration docs)         |

---

## Proposed compound updates

1. **Sub-agent A/B-branch awareness.** When the pipeline runs in a worktree whose name matches `<storyId>-<variant>` and `git worktree list` shows siblings, ALL read-only review agents should be briefed with: "Multiple A/B trials of this story exist in sibling worktrees on sibling branches. Scope your reads to the working tree of THIS worktree only." Add to the standard sub-agent prompt prelude in the pipeline skill.

2. **Run e2e BEFORE DoD audit.** The current order is step 15 (DoD) → step 15b (verify). The verify step runs unit tests but NOT Playwright e2e. The DoD audit caught the e2e failures but only because the auditor was instructed explicitly to run them. Either move the e2e run into step 15b explicitly, or make the DoD skill require it.

3. **Apply-review checkpointing.** When the apply-review developer agent runs through 14 MUST-FIX items, lost-context risk is high. Have it write `docs/reviews/<id>-resolutions.md` incrementally (one finding at a time, append-only) rather than at the end. Recovery is then bounded.
