---
name: implement
description: "Aggregate: tests + code + reviews + DoD. Pure implementation — assumes /design and /architecture have already produced the design spec and the technical plan. Use for manual implementation outside the pipeline."
argument-hint: "[story-id]"
user-invocable: true
min_tool_calls: 50
---

# Implement

**Why:** Implementation is a sequence of distinct phases, each with a different purpose. Doing them in this specific order prevents the most common failure modes: encoding bugs as expected behavior (tests after code), shipping over-abstracted code (no scan), and shipping incomplete work (no audit).

Runs the full **implementation** sequence for `$ARGUMENTS`. This is a convenience wrapper for manual use — the pipeline calls each skill directly.

**Pre-conditions** — these must already be done before `/implement` runs:
- `/design $ARGUMENTS` has produced an approved design (for UI stories) under `docs/design-explorations/<id>/approved.md`.
- `/architecture $ARGUMENTS` has produced a plan that passed `/architecture-critique` ≥7.

If those haven't run, run them first. `/implement` does not re-litigate design or architecture — it executes the plan.

| Step | Agent | Skill | Why this order |
|------|-------|-------|---------------|
| 1 | developer | `/write-tests $ARGUMENTS` | Tests first — define the requirement, not the implementation. |
| 2 | developer | `/write-code $ARGUMENTS` | With failing tests as targets, implementation stays lean. |
| 3 | adversary | `/simplification-scan` | Scan for over-abstraction and dead code. |
| 4 | adversary | `/slop-scan` | Scan for AI-specific anti-patterns. |
| 5 | developer | `/apply-review` (steps 3+4) | Apply simplification and slop findings. |
| 6 | architect | `/architecture-review` | Layer violations, API contracts, data model alignment. (Reviews the IMPLEMENTATION against the plan; `/architecture-critique` already scored the plan itself.) |
| 7 | adversary | `/adversary-review` | Over-engineering, error paths, type safety, coupling. |
| 8 | designer | `/design-review` | Implemented UI vs approved design. Skip if no UI. |
| 9 | developer | `/apply-review` (steps 6-8) | Apply review findings. |
| 9b | qa | `/apply-review` (steps 6-8) | Apply test-related findings if any. |
| 10 | qa | `/check-definition-of-done $ARGUMENTS` | Independent audit against the spec with evidence. |
-- repeat 1 to 10 until done --

If step 10 returns NOT DONE, go back to step 1 with the gap list. Max 3 attempts — after that, the story is blocked and needs human attention.
