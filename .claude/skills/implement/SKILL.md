---
name: implement
description: "Aggregate: tests + code + reviews + DoD. Pure implementation — assumes /design and /architecture have already produced the design spec and the technical plan. Use for manual implementation outside the pipeline."
argument-hint: "[workpackage-id]"
user-invocable: true
min_tool_calls: 50
---

# Implement

**Why:** Implementation is a sequence of distinct phases, each with a different purpose. Doing them in this specific order prevents the most common failure modes: encoding bugs as expected behavior (tests after code), shipping over-abstracted code (no scan), and shipping incomplete work (no audit).

Runs the full **implementation** sequence for `<target>`. This is a convenience wrapper for manual use — the pipeline calls each skill directly.

**Pre-conditions** — these must already be done before `/implement` runs:
- `/design $ARGUMENTS` has produced an approved design (for UI stories) under `docs/design-explorations/<id>/approved.md`.
- `/architecture $ARGUMENTS` has produced a plan that passed its in-session architectural critique ≥7.

If those haven't run, run them first. `/implement` does not re-litigate design or architecture — it executes the plan.

| Step | Agent | Skill | Why this order |
|------|-------|-------|---------------|
| 1 | builder | `/write-tests $ARGUMENTS` | Tests first — define the requirement, not the implementation. |
| 2 | builder | `/write-code $ARGUMENTS` | With failing tests as targets, implementation stays lean. |
| 3 | adversary | `/simplification-scan` + `/slop-scan` | Adversary spawns once and runs both negative-lens scans in one session. |
| 4 | builder | `/apply-review` (step 3) | Apply simplification and slop findings. |
| 5 | reviewer | `/architecture-review` + `/security-review` + `/design-review` | Reviewer spawns once and runs all three positive lenses in one session. Design lens skipped silently if no UI files. |
| 6 | adversary | `/adversary-review` | Hostile-persona pass: Saboteur / New Hire / Auditor. |
| 7 | builder | `/apply-review` (steps 5-6) | Apply review findings (the previous developer-vs-qa split is now an internal mode within builder). |
| 8 | researcher | `/check-definition-of-done $ARGUMENTS` | Fresh-context audit against the spec with evidence. |
-- repeat 1 to 10 until done --

If step 8 returns NOT DONE, go back to step 1 with the gap list. Max 3 attempts — after that, the story is blocked and needs human attention.
