---
name: implement
description: "Aggregate: design + tests + code + verify + prove. Use for manual implementation outside the pipeline."
argument-hint: "[story-id]"
user-invocable: true
---

# Implement

**Why:** Implementation is a sequence of distinct phases, each with a different purpose. Doing them in this specific order prevents the most common failure modes: building the wrong thing (no design), encoding bugs as expected behavior (tests after code), and shipping incomplete work (no audit).

Runs the full implementation sequence for `$ARGUMENTS`. This is a convenience wrapper for manual use — the pipeline calls each skill directly.

| Step | Agent | Skill | Why this order |
|------|-------|-------|---------------|
| 1 | architect | `/plan $ARGUMENTS` | Plan before building. Architect reads the spec, adversary challenges it. |
| 2 | developer | `/write-tests $ARGUMENTS` | Tests first — define the requirement, not the implementation. |
| 3 | developer | `/write-code $ARGUMENTS` | With failing tests as targets, implementation stays lean. |
| 4 | adversary | `/simplification-scan` | Scan for over-abstraction and dead code. |
| 5 | adversary | `/slop-scan` | Scan for AI-specific anti-patterns. |
| 6 | developer | `/apply-review` (steps 4+5) | Apply simplification and slop findings. |
| 7 | architect | `/architecture-review` | Layer violations, API contracts, data model alignment. |
| 8 | adversary | `/adversary-review` | Over-engineering, error paths, type safety, coupling. |
| 9 | designer | `/design-review` | Component specs, states, `/designsystem` (skip if no UI). |
| 10 | developer | `/apply-review` (steps 7-9) | Apply review findings. |
| 10b | qa | `/apply-review` (steps 7-9) | Apply test-related findings if any. |
| 11 | qa | `/check-definition-of-done $ARGUMENTS` | Independent audit against the spec with evidence. |
-- repeat 2 to 11 until done --

If step 11 returns NOT DONE, go back to step 2 with the gap list. Max 3 attempts — after that, the story is blocked and needs human attention.
