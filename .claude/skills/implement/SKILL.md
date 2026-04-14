---
name: implement
description: Multi-step TDD implementation workflow that designs, tests, implements, and validates a work package story until all tests pass and linters are clean.
argument-hint: "[story-id or description]"
user-invocable: true
allowed-tools: Read Edit Write Bash Grep Glob Agent
---

# Implementation Workflow

You are executing a disciplined, multi-step implementation workflow for: **$ARGUMENTS**

This workflow follows Test-Driven Development with architectural validation. You coordinate specialist agents and do the implementation work yourself. Every phase must complete before moving to the next.

---

## Phase 1 — Understand

**Goal:** Build complete understanding of what needs to be built and why.

1. Read the relevant work package story in `WORK_PACKAGES.md`. Find the story matching `$ARGUMENTS`.
2. Read `ARCHITECTURE.md` sections relevant to this story.
3. Read any other referenced architecture documents (`PROCESS_LAYER.md`, `KNOWLEDGE_ARCHITECTURE.md`, `HUMAN_INTERFACE_LAYER.md`, etc.).
4. Read existing code in the packages this story touches. Understand current patterns.
5. List the **acceptance criteria** from the work package. These are your definition of done.

**Output:** A concise summary of what you're building, which packages are involved, and the acceptance criteria checklist.

---

## Phase 2 — Design

**Goal:** Get a validated technical approach before writing any code.

1. **Spawn the architect agent** with this prompt:
   > Design the technical approach for: [story description]. The acceptance criteria are: [list]. The relevant packages are: [list]. Read the architecture docs and propose: API contracts (if applicable), data model changes (if applicable), component structure, and module boundaries. Keep it simple.

2. Review the architect's design. Does it align with the architecture docs? Does it cover all acceptance criteria?

3. **Spawn the adversary agent** with the architect's design:
   > Review this technical design for [story description]: [architect's output]. Check for over-engineering, layer violations, missing edge cases, and unnecessary complexity. Verdict: STOP, REVISE, or PROCEED.

4. If the adversary says **STOP** or **REVISE**: address the critical issues. Re-consult the architect if needed. Do NOT loop more than 2 times — after 2 rounds, make a judgment call and proceed.

**Output:** Finalized technical approach.

---

## Phase 3 — Write Tests

**Goal:** Write failing tests that prove the acceptance criteria.

For each acceptance criterion from the work package:

1. Create a test file in the appropriate package (`packages/<pkg>/src/__tests__/<name>.test.ts`).
2. Write a test that will pass when the criterion is met. Use:
   - `createTestDb()` for database tests
   - `createTestApp()` for API tests
   - Standard Vitest patterns for unit tests
3. Run the tests to confirm they **fail** (red phase):
   ```
   bun test -- <test-file>
   ```

Do NOT write implementation code yet. Only tests.

**Output:** All test files created. All tests failing with clear error messages.

---

## Phase 4 — Implement

**Goal:** Write the minimum code to make all tests pass.

1. Implement the feature following the design from Phase 2.
2. After each logical unit of implementation, run the specific tests:
   ```
   bun test -- <test-file>
   ```
3. Continue until all tests from Phase 3 are **green**.
4. If a test reveals a design flaw, fix the implementation — do NOT weaken the test.

Follow these implementation rules:
- TypeScript strict mode. No `any`, no `@ts-ignore`.
- Use Drizzle for all database operations.
- Use Hono patterns for API endpoints.
- Use DaisyUI + Tailwind for UI components.
- Use workspace imports (`@hyperidle/db`, `@hyperidle/shared`, etc.).

**Output:** All tests passing.

---

## Phase 5 — Validate

**Goal:** Ensure the implementation is production-ready.

Run all validation steps. Fix any issues. Repeat until all pass.

```bash
# Step 1: Type check
bun run check

# Step 2: Lint + format
bun run lint

# Step 3: Full test suite (not just your new tests)
bun test
```

**Fix loop:** If any step fails:
1. Read the error output carefully.
2. Fix the root cause (not the symptom).
3. Re-run the failing step.
4. Maximum 5 fix attempts per step. If still failing after 5 attempts, stop and report the blocker.

**Output:** All three validation steps passing with zero errors.

---

## Phase 6 — Self-Review

**Goal:** Catch anything the automated checks missed.

Review your own changes:

1. List all files you created or modified.
2. For each file, verify:
   - No TODO/FIXME/HACK comments left behind
   - No console.log or debug statements
   - No commented-out code
   - Types are explicit on exports
   - Error paths are handled
   - No unnecessary imports
3. Verify all acceptance criteria from Phase 1 are met. Check them off one by one.

**Output:** Final confirmation that all acceptance criteria are met, all checks pass, and the implementation is clean.

---

## Rules

- **Never skip phases.** Even if the story seems simple.
- **Never weaken tests to make them pass.** Fix the implementation instead.
- **Never leave lint errors.** Biome is the law.
- **Never add scope.** Only implement what the acceptance criteria require.
- **Report blockers immediately.** If you hit something you can't solve, say so rather than working around it.
