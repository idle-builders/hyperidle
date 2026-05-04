---
name: review
description: "Combined skill: multi-perspective code review. Launches reviewer + adversary in parallel, then builder to fix."
argument-hint: "[file paths, PR number, or description of changes]"
user-invocable: true
min_tool_calls: 25
---

# Code Review

**Why:** A single agent has blind spots. Two specialists reviewing in parallel catch different classes of issues — the **reviewer** sees contract violations, the **adversary** finds slop, over-engineering, and hostile-persona attacks.

## Preparation (do not skip)

Step 1 (the diff) gates which docs you need from step 3 — run it first. Steps 2 and 3 are then independent: issue the workpackage Read and all the doc Reads in one parallel batch.

1. Identify changed files via `git diff --name-only`.
2. Read the relevant workpackage in the appropriate track file under `plans/work-packages/`.
3. Read the architecture plan at `plans/<workpackage-id>/architecture.md` — its **Required reading** section names the specific doc files. Read those in one parallel batch.

## Phase 1: Scan (launch two agents in parallel)

1. Launch **reviewer** agent with `/contract-review` — three positive lenses (architecture, design, security) in one session. Design lens skipped silently if no UI files changed.
2. Launch **adversary** agent with `/adversary-scan` — three negative lenses (adversarial, simplification, slop) in one session.

Merge findings into: CRITICAL (must fix), WARNINGS (should fix), OBSERVATIONS.

## Phase 2: Fix

If verdict is NEEDS WORK, launch **builder** agent with `/apply-review` to apply findings.

## Verdict

- **SHIP IT** — zero critical issues
- **NEEDS WORK** — builder fixes, then re-verify, upgrade to SHIP IT if resolved
- **BLOCK** — critical issues, needs human review

**Rules:**
- **Be thorough.** Read every changed file end-to-end — no drive-by reviews.
- **Check against the spec.** Every component, endpoint, and state machine has a spec in the doc files named in the architecture plan's Required reading. Cite the specific file + section.
- **Verify, don't trust.** If a component claims to handle drag-drop, check that `useDraggable` is actually called.
- Every issue must reference a file and line number
- Don't nitpick style — Biome handles formatting
- Distinguish fact from opinion — only facts can be CRITICAL
- Code without tests for its acceptance criteria is automatically NEEDS WORK
- New UI components without `.stories.tsx` files are automatically NEEDS WORK

## Target

$ARGUMENTS
