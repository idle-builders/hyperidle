---
name: write-code
description: "Write minimum code to make all tests pass. TDD green phase."
argument-hint: "[story-id]"
user-invocable: true
min_tool_calls: 18
---

# Write Code

**Why:** With failing tests already in place, implementation has a clear target. Writing the minimum code to pass keeps the codebase lean and prevents scope creep. Every line of code exists because a test demands it.

Read the plan for `$ARGUMENTS` (check tasks or the story in the relevant track file under `docs/work-packages/`). Read the existing failing tests.

Implement each task in dependency order. Write the minimum code to make tests pass. For UI components, create a `.stories.tsx` file rendering key states. After each logical unit, run the relevant tests. Continue until all tests are green.

Never weaken a test to make it pass. If a test reveals a design flaw, fix the implementation.

**Don't rationalize shortcuts:**
- "The test is wrong" → prove it's wrong before changing it. Most of the time, the implementation is wrong.
- "I'll add this extra feature while I'm here" → scope creep is the #1 cause of story failure. Build exactly what was asked.
- "I can skip this task, it's covered by the next one" → each task exists because it was independently testable. Skipping creates gaps.
