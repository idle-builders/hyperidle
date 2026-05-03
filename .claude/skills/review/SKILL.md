---
name: review
description: "Multi-perspective code review. Spawns specialist agents in parallel."
argument-hint: "[file paths, PR number, or description of changes]"
user-invocable: true
min_tool_calls: 25
---

# Code Review

**Why:** A single agent has blind spots. Multiple specialists reviewing in parallel catch different classes of issues — the architect sees layer violations, the adversary finds over-engineering, the security researcher spots injection vectors, the designer catches UX gaps. This is cheaper than fixing issues in production.

## Preparation (do not skip)

Step 1 (the diff) gates which docs you need from step 3 — run it first. Steps 2 and 3 are then independent: issue the story Read and all the concept-doc Reads in one parallel batch.

1. Identify changed files via `git diff --name-only`.
2. Read the relevant story in the appropriate track file under `docs/work-packages/`.
3. Read the relevant concept docs for context (all in the same parallel batch as step 2):
   - Always: `docs/ARCHITECTURE.md`, `docs/work-packages/SHARED.md`
   - If backend changes: `docs/PROCESS_LAYER.md`, `docs/AGENT_LAYER.md`, `docs/KNOWLEDGE_ARCHITECTURE.md`
   - If frontend changes: `docs/UI_DESIGN.md`, `docs/HUMAN_INTERFACE_LAYER.md`, `docs/INFORMATION_ARCHITECTURE.md`
   - If requirements questions: `docs/REQUIREMENTS.md`

## Phase 1: Scan (specialists in parallel)

Spawn review agents in parallel — each runs its scan skill, producing findings only:

1. **architect** with `/architecture-review`
2. **adversary** with `/adversary-review`
3. **security-researcher** with `/security-review`
4. **designer** with `/design-review` (skip if no UI files changed) — must screenshot and compare pixels, not just read code

Merge findings into: CRITICAL (must fix), WARNINGS (should fix), OBSERVATIONS.

## Phase 2: Fix

If verdict is NEEDS WORK:
- **developer** with `/apply-review` for code findings
- **qa** with `/apply-review` for test-related findings

## Verdict

- **SHIP IT** — zero critical issues
- **NEEDS WORK** — developer fixes, then re-verify, upgrade to SHIP IT if resolved
- **BLOCK** — critical issues, needs human review

**Rules:**
- **Be thorough.** Read every changed file end-to-end — no drive-by reviews. Read every function, check every type, verify every import. Skimming is how bugs survive review.
- **Check against the spec.** Every component, endpoint, and state machine has a spec in `docs/`. If the code diverges from the spec, that's a finding — either the code is wrong or the spec needs updating. Cite the specific doc section.
- **Verify, don't trust.** If a component claims to handle drag-drop, check that `useDraggable` is actually called. If a test claims to verify behavior, check that it actually asserts something meaningful. Surface-level "looks right" is not a review.
- Every issue must reference a file and line number
- Don't nitpick style — Biome handles formatting
- Distinguish fact from opinion — only facts can be CRITICAL
- Code without tests for its acceptance criteria is automatically NEEDS WORK
- New UI components without `.stories.tsx` files are automatically NEEDS WORK
