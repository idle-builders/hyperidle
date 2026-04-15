---
name: implement
description: "Aggregate: design + tests + code + verify + prove. Use for manual implementation outside the pipeline."
argument-hint: "[story-id]"
user-invocable: true
allowed-tools: Read Edit Write Bash Grep Glob Agent
---

# Implement

**Why:** Implementation is a sequence of distinct phases, each with a different purpose. Doing them in this specific order prevents the most common failure modes: building the wrong thing (no design), encoding bugs as expected behavior (tests after code), and shipping incomplete work (no audit).

Runs the full implementation sequence for `$ARGUMENTS`. This is a convenience wrapper for manual use — the pipeline calls each skill directly.

| Step | Skill | Why this order |
|------|-------|---------------|
| 1 | `Skill(skill: "plan", args: "$ARGUMENTS")` | Plan before building. The architect reads the spec and produces a task list. The adversary challenges it. Without this, you build based on assumptions and discover design flaws mid-implementation. |
| 2 | `Skill(skill: "write-tests", args: "$ARGUMENTS")` | Tests first. Tests written before code define the *requirement*. Tests written after code just confirm what exists — they encode bugs as expected behavior. Red phase proves the tests can actually fail. |
| 3 | `Skill(skill: "write-code", args: "$ARGUMENTS")` | Now implement. With failing tests as targets, every line of code exists because a test demands it. This keeps implementation lean and prevents scope creep. |
| 4 | `bun run check && bun run lint && bun run test` | Automated gates. Types catch contract violations, lint catches style drift, tests catch regressions. The next agent inherits whatever you leave behind — make it clean. |
| 5 | `Skill(skill: "check-definition-of-done", args: "$ARGUMENTS")` | Independent audit. The builder is the least qualified to verify their own work. A separate agent checks every acceptance criterion against the spec with evidence, not claims. |

If step 5 returns NOT DONE, go back to step 3 with the gap list. Max 3 attempts — after that, the story is blocked and needs human attention.
