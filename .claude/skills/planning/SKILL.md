---
name: planning
description: "Use before /implement to properly plan the development work. Triggers: story about to be implemented, work package needs decomposition, 'plan this' request."
argument-hint: "[story-id or work package reference]"
user-invocable: true
allowed-tools: Read Grep Glob Bash Agent
---

# Plan

You are planning the development work for: **$ARGUMENTS**

Planning is not implementation. You write zero code here. Your job is to produce a plan so clear and complete that an agent with no context could pick it up and build exactly the right thing.

---

## Step 1 — Understand the full picture

1. Read the work package story in `docs/WORK_PACKAGES.md` matching `$ARGUMENTS`.
2. Read `docs/ARCHITECTURE.md` and any other referenced architecture docs.
3. Read `ETHOS.md` for builder principles.
4. Read existing code in the packages this story touches. Understand what already exists — patterns, conventions, utilities, tests.
5. Check git history for recent changes in the relevant packages — know what's in flux.

Do not skim. Read thoroughly. Misunderstanding the spec is the #1 source of wasted work.

---

## Step 2 — Extract and interrogate the acceptance criteria

List every acceptance criterion from the story. For each one:

1. **Restate it in your own words.** If you can't, you don't understand it.
2. **Identify ambiguities.** What's left unsaid? What assumptions are you making? What could be interpreted two ways?
3. **Define the verification method.** How will you prove this criterion is met? (Test, E2E, screenshot, inspection.) If you can't define verification, the criterion is underspecified — flag it.
4. **Identify dependencies.** Does this criterion require another criterion to be done first? Does it depend on external code, a migration, an API that doesn't exist yet?

If you find ambiguities or underspecified criteria, list them explicitly as **open questions**. Do not guess — these must be resolved before implementation begins.

---

## Step 3 — Identify the gaps

What needs to exist that doesn't exist yet? Be exhaustive:

- **New files** — schemas, routes, components, tests, migrations
- **Modified files** — existing code that needs changes
- **New dependencies** — packages to install
- **Infrastructure** — database tables, API endpoints, queue jobs
- **Patterns to follow** — existing conventions to match
- **Patterns to establish** — new conventions this story introduces

For each gap, note what it connects to. A migration affects the schema which affects the API which affects the frontend. Trace the chain.

---

## Step 4 — Decompose into ordered tasks

Break the work into thin vertical slices. Each task should be:

- **Small** — ~100 lines of change or less. If it's bigger, split it.
- **Independently testable** — you can write a test for it and verify it passes without the other tasks.
- **Ordered by dependency** — task B depends on task A, never circular.

For each task:
- **What:** One sentence describing the change.
- **Where:** Which files are created or modified.
- **Tests:** Which test(s) verify this task is done.
- **Depends on:** Which prior tasks must be complete.

Order them so that at every step, you have a working (if incomplete) system. Database first, then API, then frontend. Never build top-down with stubs.

---

## Step 5 — Risk check

**Spawn the adversary agent** with your plan. Ask it to find:

- Tasks that are too large or vague
- Missing dependencies between tasks
- Gaps in the acceptance criteria coverage — is every criterion addressed by at least one task?
- Over-engineering — are you planning more than what's needed?
- Assumptions that could be wrong

Address critical issues. Max 1 round — then finalize.

---

## Step 6 — Output the plan

Produce a structured plan:

```
## Plan: [story-id] — [title]

### Open Questions
[List any ambiguities that need resolution before implementation. If none, state "None — all criteria are clear."]

### Acceptance Criteria
| # | Criterion | Verification | Addressed by Task |
|---|-----------|-------------|-------------------|
| 1 | ...       | test/e2e/...| T3, T5            |

### Gaps
[Bulleted list of what needs to be created/modified]

### Tasks (in order)
| # | Task | Files | Tests | Depends on |
|---|------|-------|-------|------------|
| T1 | ... | ...   | ...   | —          |
| T2 | ... | ...   | ...   | T1         |

### Risks
[Anything the adversary flagged that you accepted with rationale]
```

This plan is the input to `/implement`. It replaces Phase 1 and Phase 2 of the implement skill — the agent skips straight to writing tests.

---

## Rules

- Zero code. This is a thinking exercise, not an implementation exercise.
- Every acceptance criterion must map to at least one task. If it doesn't, the plan is incomplete.
- Every task must map to at least one test. If it doesn't, the task is unverifiable.
- Flag ambiguities rather than guessing. A wrong assumption wastes more time than a question.
- Prefer many small tasks over few large ones. Small tasks are easier to test, review, and retry.
- The plan must be understandable by an agent that has never seen this codebase. Include enough context.
