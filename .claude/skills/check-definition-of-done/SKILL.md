---
name: check-definition-of-done
description: "Use when implementation is complete and you need independent proof that every acceptance criterion is met. Triggers: post-implementation verification, before shipping, DoD gate."
argument-hint: "[story-id or work package reference]"
user-invocable: true
allowed-tools: Read Grep Glob Bash Agent
---

# Check Definition of Done

Independently verify that every acceptance criterion for **$ARGUMENTS** is met. No criterion passes on trust — each one must be proven through observable evidence.

---

## Step 1 — Extract Criteria

Read the work package story in `docs/WORK_PACKAGES.md` matching `$ARGUMENTS`. Extract every acceptance criterion as a numbered checklist. Read the relevant architecture documents to understand the expected behavior.

---

## Step 2 — Classify Each Criterion

For each criterion, determine the verification method:

- **Automated test** — A unit or integration test exists that directly proves this criterion. The test must be green. Most criteria should fall here.
- **E2E test** — A Playwright test that exercises the feature through the UI. Required for any criterion involving user-visible behavior.
- **Eval** — A programmatic check that can be run (type coverage, lint rules, dependency checks, schema validation). Used for structural or quality criteria.
- **Screenshot** — A visual capture of the UI state that proves the criterion. Used for layout, styling, or visual design criteria.
- **Inspection** — Direct code reading to verify a structural requirement (file exists, export exists, pattern followed). Last resort — prefer automated checks.

---

## Step 3 — Verify Each Criterion

For each criterion, spawn the most suitable agent to verify it independently:

- **Backend criteria** (API endpoints, database queries, data flow) → spawn **developer** agent to run the relevant tests and confirm they pass, or write a missing test and run it.
- **Frontend criteria** (UI components, interactions, visual states) → spawn **developer** agent to run Playwright tests, take screenshots, and confirm behavior matches specification.
- **Architecture criteria** (layer boundaries, module structure, naming) → spawn **architect** agent to inspect the code and verify compliance.
- **UX/Design criteria** (component usage, density, accessibility, states) → spawn **designer** agent to review screenshots and code.
- **Security criteria** (auth, validation, isolation) → spawn **security-researcher** agent to verify.
- **Test coverage criteria** → spawn **qa** agent to verify coverage numbers and test quality.

Each agent must return one of:
- **PASS** — Criterion is met. Evidence: [test name, screenshot path, or specific observation].
- **FAIL** — Criterion is not met. Gap: [what's missing or wrong].
- **PARTIAL** — Criterion is partially met. Met: [what works]. Gap: [what doesn't].

---

## Step 4 — Coverage Audit

After individual criteria are checked, verify holistic test coverage:

1. Run `bun test --coverage` and check that coverage meets the 100% target.
2. Verify that Playwright E2E tests exist for every user-facing feature in this story.
3. Verify that every API endpoint added or modified has integration tests.
4. Verify that every database query/mutation has tests covering success and error paths.
5. Verify that every UI component renders correctly in all states (empty, loading, error, populated).

---

## Step 5 — Verdict

Produce a DoD report:

**For each criterion:** number, description, verification method, PASS/FAIL/PARTIAL, evidence.

**Summary:**
- **DONE** — All criteria PASS. Coverage audit clean. Proceed to next work package.
- **NOT DONE** — One or more criteria FAIL or PARTIAL. List every gap. Do NOT proceed.

If NOT DONE, list the specific work remaining to close each gap. This list becomes the input for the next `/implement` iteration.

---

## Anti-Rationalization Table

| Excuse | Rebuttal |
|--------|----------|
| "I just implemented this, I know it works" | You're the implementer — you're the LEAST qualified to verify. That's why this is an independent check. |
| "The tests pass, so the criterion is met" | Tests prove code behavior. Criteria describe user outcomes. A passing test doesn't mean the RIGHT thing was built. |
| "This criterion is subjective, I can't test it" | Then classify it as inspection/screenshot and get specific. "Looks good" is not evidence — "matches mockup X with density Y" is. |
| "PARTIAL is close enough to PASS" | PARTIAL means the user gets an incomplete feature. Ship complete or don't ship. |
| "Coverage is at 95%, that's good enough" | The 5% you skipped is where the bugs live. 100% of new code means 100%. |
| "I'll mark this PASS and fix it in the next story" | The next story has its own criteria. Deferred fixes become permanent gaps. Fix it now. |

---

## Rules

- Every criterion must have observable evidence. "I implemented it" is not evidence.
- Tests are the primary evidence. If a criterion doesn't have a test, write one as part of verification.
- Screenshots are evidence for visual criteria. Take them and reference them.
- Never mark a criterion as PASS without running the proof yourself.
- If a criterion is ambiguous, flag it as needing clarification rather than guessing PASS.
- This skill is a gate. Nothing proceeds past a NOT DONE verdict.
