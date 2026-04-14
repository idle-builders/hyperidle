---
name: review
description: Staff-level multi-perspective code review covering architecture, design, security, performance, and adversarial challenge. Produces a consolidated verdict with auto-iterate on NEEDS WORK.
argument-hint: "[file paths, PR number, or description of changes]"
user-invocable: true
allowed-tools: Read Grep Glob Bash Edit Agent
---

# Staff-Level Code Review

Comprehensive, multi-perspective code review of: **$ARGUMENTS**

This review acts lika a staff-level engineering review at a company where quality is non-negotiable. You coordinate specialist agents who each review from their domain of expertise, then synthesize their findings into a consolidated verdict.

---

## Step 1 — Scope the Review

1. Identify all changed files via `git diff --name-only` or the provided paths.
2. Read every changed file completely.
3. Read the relevant work package in `WORK_PACKAGES.md` for the intended goal.
4. Read relevant architecture documents for expected patterns.

---

## Step 2 — Parallel Expert Reviews

Spawn **all four agents in parallel:**

**2a. Architecture Review (architect)** — Layer boundary violations, API contract consistency, data model alignment, module boundary violations, naming consistency. Report with file:line references.

**2b. Design Review (designer)** — Component budget compliance, interaction pattern consistency, state handling, information density, accessibility, mobile adaptation. Skip if no UI files changed.

**2c. Adversarial Review (adversary)** — Over-engineering, error path analysis, type safety audit, coupling analysis, test quality, STOP/REVISE/PROCEED verdict.

**2d. Security Review (security-researcher)** — STRIDE analysis on new trust boundaries, input validation, authorization, agent-specific threats, OWASP top 10, performance (N+1 queries, unbounded lists, sync blocking, missing indexes, re-renders, memory leaks).

---

## Step 3 — Synthesize

Merge findings from all reviewers into:

- **CRITICAL ISSUES** (must fix) — deduplicated, with file:line references
- **WARNINGS** (should fix) — noting which reviewer flagged each
- **OBSERVATIONS** (consider) — actionable only
- **TEST COVERAGE** — acceptance criteria covered? error paths? edge cases?
- **ACCEPTANCE CRITERIA CHECK** — each criterion met or not, with evidence

---

## Step 4 — Verdict

**SHIP IT** — Zero critical issues. Tests cover acceptance criteria.
**NEEDS WORK** — Warnings to address, no blockers. Proceeds to Step 5.
**BLOCK** — Critical issues. Do NOT approve.

---

## Step 5 — Iterate (NEEDS WORK only)

Automatically fix the issues:

1. For each NEEDS WORK item: read the file, apply the fix. Skip anything ambiguous or requiring a product decision (note as "requires human decision").
2. Run `bun run check && bun run lint && bun test`.
3. Self-review the fixed files.
4. Report what was fixed and what was skipped. Upgrade to SHIP IT if all issues resolved.

Do NOT iterate on BLOCK verdicts — those require human review of the approach.

---

## Rules

- Read every changed file. No drive-by reviews.
- Every issue must reference a file and line number.
- Don't nitpick style — Biome handles formatting.
- Distinguish fact from opinion. Only facts can be CRITICAL.
- Code without tests for its acceptance criteria is automatically NEEDS WORK.
- Never rubber-stamp. Verify against architecture docs and acceptance criteria.
- Iterate is automatic. The user should see a clean result or a clear list of decisions only they can make.
