---
name: review
description: "Multi-perspective code review. Spawns specialist agents in parallel."
argument-hint: "[file paths, PR number, or description of changes]"
user-invocable: true
---

# Code Review

**Why:** A single agent has blind spots. Multiple specialists reviewing in parallel catch different classes of issues — the architect sees layer violations, the adversary finds over-engineering, the security researcher spots injection vectors, the designer catches UX gaps. This is cheaper than fixing issues in production.

Identify changed files via `git diff --name-only`. Read the relevant story in the appropriate track file under `docs/work-packages/`.

## Phase 1: Scan (specialists in parallel)

Spawn review agents in parallel — each runs its scan skill, producing findings only:

1. **architect** with `/architecture-review`
2. **adversary** with `/adversary-review`
3. **security-researcher** with `/security-review`
4. **designer** with `/design-review` (skip if no UI files changed)

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
- Read every changed file — no drive-by reviews
- Every issue must reference a file and line number
- Don't nitpick style — Biome handles formatting
- Distinguish fact from opinion — only facts can be CRITICAL
- Code without tests for its acceptance criteria is automatically NEEDS WORK
- New UI components without `.stories.tsx` files are automatically NEEDS WORK
