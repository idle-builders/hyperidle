---
name: review
description: "Multi-perspective code review. Spawns specialist agents in parallel."
argument-hint: "[file paths, PR number, or description of changes]"
user-invocable: true
min_tool_calls: 25
---

# Code Review

**Why:** A single agent has blind spots. Two specialists reviewing in parallel catch different classes of issues — the **reviewer** sees architecture / design / security contract violations, the **adversary** finds slop, over-engineering, and hostile-persona attacks. This is cheaper than fixing issues in production.

## Preparation (do not skip)

Step 1 (the diff) gates which docs you need from step 3 — run it first. Steps 2 and 3 are then independent: issue the workpackage Read and all the doc Reads in one parallel batch.

1. Identify changed files via `git diff --name-only`.
2. Read the relevant workpackage in the appropriate track file under `plans/work-packages/`.
3. Read the architecture plan at `plans/<workpackage-id>/architecture.md` — its **Required reading** section names the specific doc files this workpackage commits to. Read those files in one parallel batch. Do not browse `docs/` — the plan is the filter.

## Phase 1: Scan (two specialists in parallel)

Spawn review agents in parallel — each runs all its lenses, producing TOON findings blocks only:

1. **reviewer** — runs three positive lenses in one session: `/architecture-review`, `/design-review` (skip silently if no UI files changed; must screenshot + compare pixels, not read code), `/security-review`.
2. **adversary** — runs three negative lenses in one session: `/slop-scan`, `/simplification-scan`, `/adversary-review` (with Saboteur / New Hire / Auditor hostile-persona passes).

Merge findings into: CRITICAL (must fix), WARNINGS (should fix), OBSERVATIONS.

## Phase 2: Fix

If verdict is NEEDS WORK, spawn the **builder** with `/apply-review` to apply both code and test findings (the previous developer-vs-qa split is now an internal mode within builder).

## Verdict

- **SHIP IT** — zero critical issues
- **NEEDS WORK** — builder fixes, then re-verify, upgrade to SHIP IT if resolved
- **BLOCK** — critical issues, needs human review

**Rules:**
- **Be thorough.** Read every changed file end-to-end — no drive-by reviews. Read every function, check every type, verify every import. Skimming is how bugs survive review.
- **Check against the spec.** Every component, endpoint, and state machine has a spec in the doc files named in the architecture plan's Required reading. If the code diverges from the spec, that's a finding — either the code is wrong or the spec needs updating. Cite the specific file + section.
- **Verify, don't trust.** If a component claims to handle drag-drop, check that `useDraggable` is actually called. If a test claims to verify behavior, check that it actually asserts something meaningful. Surface-level "looks right" is not a review.
- Every issue must reference a file and line number
- Don't nitpick style — Biome handles formatting
- Distinguish fact from opinion — only facts can be CRITICAL
- Code without tests for its acceptance criteria is automatically NEEDS WORK
- New UI components without `.stories.tsx` files are automatically NEEDS WORK

## Target

$ARGUMENTS
