---
name: implement
description: "Combined skill: critique + tests + code + review. Orchestrates agent launches. Assumes /design and /architecture already ran. Use for manual implementation outside the pipeline."
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
| 1 | **reviewer** | `/design-critique $ARGUMENTS` | Score design variants (skip if no UI). Same reviewer session carries to step 4. |
| 1b | **reviewer** | `/architecture-critique $ARGUMENTS` | Score the plan. Must reach ≥7 before building. |
| 2 | **builder** | `/write-tests $ARGUMENTS` | Red phase: define the requirement as failing tests. Do NOT write code yet. |
| 3 | **builder** | `/write-code $ARGUMENTS` | Green phase: minimum code to pass. Must pass `bun run verify` before pushing. |
| 4a | **reviewer** | `/review $ARGUMENTS` | Same reviewer from step 1 (warm on design/arch). Three positive lenses + AC completeness audit. Emits DONE or NOT DONE. |
| 4b | **adversary** | `/adversary-review $ARGUMENTS` | Three negative lenses (adversarial, simplification, slop). Parallel with 4a. |
| 5 | **builder** | `/write-code $ARGUMENTS` | Apply findings from both reviews; runs `bun run verify`. |

If step 4a returns NOT DONE, go back to step 2 with the gap list. Max 3 attempts — after that, the story is blocked and needs human attention.
