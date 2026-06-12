---
name: write-code
description: "Write minimum code to make all tests pass. TDD green phase — implementation has a clear target from the red phase."
argument-hint: "[workpackage-id]"
user-invocable: true
min_tool_calls: 18
---

# Write Code

**Why:** With failing tests already in place, implementation has a clear target. Writing the minimum code to pass keeps the codebase lean and prevents scope creep. Every line of code exists because a test demands it.

Read the plan for `<target>` (check tasks or the workpackage in the relevant track file under `.pipeline/work-packages/`). Read the existing failing tests.

Implement each task in dependency order. Write the minimum code to make tests pass. For UI components, create a `.stories.tsx` file rendering key states. After each logical unit, run the relevant tests. Once all tests are green, run `npm run verify` to confirm the full gate passes (types, lint, tests). **Verify must pass before pushing.** No broken code reaches reviewers — verification is the builder's responsibility, not the reviewer's.

Never weaken a test to make it pass. If a test reveals a design flaw, fix the implementation.

**Reuse first — think lazy (`.claude/rules/reuse-first.md`):** before writing any new component, hook, helper, or style, walk the decision ladder: (1) does it need to exist? (2) does `packages/design-system/src/index.ts` already export it? (3) can an existing component grow a prop instead? (4) is the logic already in `@hyperidle/shared` or `utils/`? (5) does DaisyUI cover it (use directly, never wrap)? (6) only then build new — in the design system if 2+ surfaces will use it, with stories. An existing component carries hundreds of already-tuned decisions (states, a11y, dark mode, grid, motion); new code restarts that long tail. The third copy of anything gets promoted, never pasted. The reviewer treats an undocumented hand-rolled equivalent of an existing component as a blocking finding — say which ladder rung you stopped at when your implementation summary mentions a new component.

**Regression ownership:** `npm run test` runs affected tests — if pre-existing tests break because of your changes, you own the fix. "Outside scope" is not valid for tests you broke.

**Rename sweep:** When your changes rename, remove, or replace a symbol (field, type, token, status value, route), grep the full codebase for the old name before pushing: `grep -rn 'OLD_NAME' packages/ --include='*.ts' --include='*.tsx'`. Zero matches required (excluding test assertions that verify absence).

**Doc sync:** If your implementation changes behavior documented in `docs/` (API shapes, state machines, UI layouts, lifecycles, data models, decision records), update the relevant doc section in the same commit. Docs are part of the deliverable, not a follow-up task. The reviewer will flag stale docs as CRITICAL.

**Don't rationalize shortcuts:**
- "The test is wrong" — prove it's wrong before changing it. Most of the time, the implementation is wrong.
- "I'll add this extra feature while I'm here" — scope creep is the #1 cause of workpackage failure. Build exactly what was asked.
- "I can skip this task, it's covered by the next one" — each task exists because it was independently testable. Skipping creates gaps.

## Target

$ARGUMENTS
