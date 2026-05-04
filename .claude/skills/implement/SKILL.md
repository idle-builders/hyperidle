---
name: implement
description: "Combined skill: build + review + DoD. Orchestrates agent launches. Assumes /design and /architecture already ran. Use for manual implementation outside the pipeline."
argument-hint: "[workpackage-id]"
user-invocable: true
min_tool_calls: 50
---

# Implement

**Why:** Implementation is a sequence of distinct phases, each with a different purpose. Doing them in this specific order prevents the most common failure modes: encoding bugs as expected behavior (tests after code), shipping over-abstracted code (no scan), and shipping incomplete work (no audit).

Runs the full **implementation** sequence for `<target>`. This is a convenience wrapper for manual use — the pipeline calls each step directly.

**Pre-conditions** — these must already be done before `/implement` runs:
- `/design $ARGUMENTS` has produced an approved design (for UI stories) under `plans/<workpackage-id>/design/approved.md`.
- `/architecture $ARGUMENTS` has produced a plan that passed its in-session critique ≥7.

If those haven't run, run them first. `/implement` does not re-litigate design or architecture — it executes the plan.

## Steps

| Step | Launch agent | With skill | Why this order |
|------|-------------|-----------|---------------|
| 1 | **builder** | `/build $ARGUMENTS` | TDD: failing tests first, then minimum code to pass. |
| 2 | **adversary** | `/adversary-scan` | All three negative lenses (adversarial, simplification, slop) in one session. Findings only. |
| 3 | **reviewer** | `/contract-review` | All three positive lenses (architecture, design, security) in one session. Design lens skipped silently if no UI files. Findings only. |
| 4 | **builder** | `/apply-review` (steps 2-3) | Apply all findings from both reviews. |
| 5 | **researcher** | `/check-definition-of-done $ARGUMENTS` | Fresh-context audit against the spec with evidence. |

If step 5 returns NOT DONE, go back to step 1 with the gap list. Max 3 attempts — after that, the story is blocked and needs human attention.
