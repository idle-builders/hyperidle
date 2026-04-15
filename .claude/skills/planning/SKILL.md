---
name: planning
description: "Use before /implement to properly plan the development work. Triggers: story about to be implemented, work package needs decomposition, 'plan this' request."
argument-hint: "[story-id or work package reference]"
user-invocable: true
allowed-tools: Read Grep Glob Bash Agent
---

# Plan

You are creating an internal plan for yourself to execute in the next step (/implement). This plan is NOT for a human — it is YOUR roadmap. Keep it concise. No presentation, no formatting for readability. Just the facts you need to build this correctly.

Target: **$ARGUMENTS**

---

## Step 1 — Read everything

1. Read the work package story in `docs/WORK_PACKAGES.md` matching `$ARGUMENTS`.
2. Read `docs/ARCHITECTURE.md` sections relevant to this story.
3. Read existing code in the packages this story touches — patterns, conventions, what exists.
4. Check git log for recent changes in relevant packages.

Do not skim. Misunderstanding the spec wastes implementation time.

---

## Step 2 — Extract acceptance criteria

For each criterion from the story:
1. Restate it — if you can't, you don't understand it.
2. Identify ambiguities — what's assumed? What could go two ways?
3. Define verification — test, E2E, inspection. If you can't verify it, flag it.
4. Note dependencies between criteria.

---

## Step 3 — Identify gaps

What needs to be created or changed? New files, modified files, new dependencies, new patterns.

---

## Step 4 — Decompose into ordered tasks

Small tasks (~100 lines each), independently testable, ordered by dependency. For each:
- What to do (one sentence)
- Which files
- Which test verifies it
- What it depends on

Database first, then API, then frontend. Always keep the system buildable.

---

## Step 5 — Risk check

Spawn the adversary agent with your task list. Ask it to find: tasks too large, missing dependencies, gaps in AC coverage, over-engineering. Address critical issues. Max 1 round.

---

## Step 6 — Save the plan

Write your plan to a task list (using TaskCreate) so you can reference it during /implement. Include:
- The ordered task list with files and tests
- Any risks or decisions made
- Any open questions that couldn't be resolved

**This is NOT the end of your work.** Planning is step 1 of 11 in the pipeline. /implement comes next. Do not stop.
