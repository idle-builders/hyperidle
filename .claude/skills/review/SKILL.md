---
name: review
description: Staff-level multi-perspective code review covering architecture, design, security, performance, and adversarial challenge. Produces a consolidated verdict.
argument-hint: "[file paths, PR number, or description of changes]"
user-invocable: true
allowed-tools: Read Grep Glob Bash Agent
---

# Staff-Level Code Review

You are conducting a comprehensive, multi-perspective code review of: **$ARGUMENTS**

This review simulates a staff-level engineering review at a company where quality is non-negotiable. You coordinate specialist agents who each review from their domain of expertise, then synthesize their findings into a consolidated verdict.

---

## Step 1 — Scope the Review

1. Identify all files that were changed. Use one of:
   - `git diff --name-only` (for uncommitted changes)
   - `git diff --name-only HEAD~1` (for the last commit)
   - Read specific files if paths were provided in `$ARGUMENTS`
2. Read every changed file completely. Understand what changed and why.
3. Read the relevant work package in `WORK_PACKAGES.md` to understand the intended goal.
4. Read relevant architecture documents to understand the expected patterns.

**Output:** List of files under review and the intended goal of the changes.

---

## Step 2 — Parallel Expert Reviews

Spawn **all four agents in parallel** (use a single message with multiple Agent tool calls):

### 2a. Architecture Review (architect agent)
> Review these code changes for architectural correctness:
> Files changed: [list]
> Intended goal: [from work package]
>
> Check for:
> - Layer boundary violations (Human Interface → Meta Layer → Agent Runtime)
> - API contract consistency with ARCHITECTURE.md
> - Data model alignment with the Drizzle schema
> - Module boundary violations (cross-package imports that shouldn't exist)
> - Naming consistency with established patterns
>
> Read the changed files and relevant architecture docs. Report issues with file:line references.

### 2b. Design Review (designer agent)
> Review these code changes for UX/UI quality:
> Files changed: [list of .tsx files only, skip if none]
> Intended goal: [from work package]
>
> Check for:
> - Component budget compliance (only 19 custom components + DaisyUI)
> - Interaction pattern consistency with HUMAN_INTERFACE_LAYER.md
> - State handling (empty, loading, error, populated)
> - Information density (8-12px padding default)
> - Accessibility (keyboard navigation, focus management)
> - Mobile adaptation (if applicable)
>
> Skip this review if no UI files were changed.

### 2c. Adversarial Review (adversary agent)
> Adversarial review of these code changes:
> Files changed: [list]
> Intended goal: [from work package]
>
> Apply your full review protocol: over-engineering check, error path analysis, type safety audit, coupling analysis, test quality assessment, security scan, performance review.
> Report with CRITICAL / WARNINGS / OBSERVATIONS structure and a STOP/REVISE/PROCEED verdict.

### 2d. Security Review (security-researcher agent)
> Security review of these code changes:
> Files changed: [list]
> Intended goal: [from work package]
>
> Apply your full review protocol including:
> - STRIDE analysis on any new trust boundaries
> - Input validation at system boundaries
> - Authorization checks on API endpoints
> - Agent-specific threats (prompt injection via knowledge, workspace isolation, cost bounds)
> - OWASP top 10 scan
> - Dependency vulnerability check
>
> Also check performance:
> - N+1 query patterns
> - Unbounded list fetching (missing pagination/limits)
> - Synchronous blocking in async handlers
> - Missing database indexes for query patterns
> - Unnecessary re-renders in React components
> - Memory leaks (missing cleanup in effects/subscriptions)
>
> Report issues with file:line references and severity.

---

## Step 3 — Synthesize

After all agent reviews complete, synthesize findings into a single consolidated review:

### CRITICAL ISSUES (must fix)
Merge critical findings from all reviewers. Deduplicate. Include file:line references.

### WARNINGS (should fix)
Merge warnings. Note which reviewer flagged each issue.

### OBSERVATIONS (consider)
Merge observations and suggestions. Keep only actionable ones.

### TEST COVERAGE ASSESSMENT
- Are the acceptance criteria from the work package covered by tests?
- Are error paths tested?
- Are edge cases tested?
- Any missing test scenarios?

### ACCEPTANCE CRITERIA CHECK
For each acceptance criterion from the work package:
- [ ] Criterion 1 — Met/Not Met (evidence)
- [ ] Criterion 2 — Met/Not Met (evidence)
- ...

---

## Step 4 — Verdict

Issue one of these verdicts:

### SHIP IT
Zero critical issues. Warnings are minor and acceptable. Tests cover acceptance criteria. Code is production-ready.

### NEEDS WORK
Has warnings that should be addressed but no blockers. List the specific changes needed. The developer can fix these and the code is shippable after.

### BLOCK
Has critical issues that will cause failures, security vulnerabilities, or architectural violations. List every critical issue. Do NOT approve until these are resolved.

---

## Step 5 — Iterate (on NEEDS WORK verdict only)

If the verdict is **NEEDS WORK**, automatically fix the issues:

1. For each item in the NEEDS WORK list:
   - Read the file and line referenced.
   - Apply the fix. Prioritize the reviewer's suggested approach.
   - If the fix is ambiguous or requires a product decision, skip it and note it as "requires human decision."

2. After all fixes, run validation:
   ```bash
   bun run check && bun run lint && bun test
   ```

3. If validation passes, re-run a quick self-review of just the fixed files:
   - Did the fix actually address the reviewer's concern?
   - Did it introduce new issues?

4. Report what was fixed and what was skipped:
   ```
   Iterate: Fixed N of M issues
   
   Fixed:
   - [file:line] — description of fix
   
   Skipped (requires human decision):
   - [file:line] — why this needs human input
   
   Validation: ✓ typecheck ✓ lint ✓ tests
   ```

5. If all issues were fixed, upgrade the verdict to **SHIP IT**.
   If issues remain, keep the verdict as **NEEDS WORK** with the remaining items listed.

**Do NOT iterate on BLOCK verdicts.** Those require human review of the approach, not code fixes.

---

## Rules

- **Read every changed file.** No drive-by reviews. You must understand the full context.
- **Be specific.** Every issue must reference a file and line number.
- **Don't nitpick style.** Biome handles formatting. Don't flag style issues the linter would catch.
- **Distinguish fact from opinion.** "This violates the layer boundary in ARCHITECTURE.md §2" is fact. "I would have done this differently" is opinion. Only facts can be CRITICAL.
- **Test coverage is mandatory.** Code without tests for its acceptance criteria is automatically NEEDS WORK.
- **Never rubber-stamp.** Even if the code looks good, verify against the architecture docs and acceptance criteria. Trust but verify.
- **Iterate is automatic.** When the verdict is NEEDS WORK, fix what you can before reporting to the user. The user should see a clean result or a clear list of decisions only they can make.
