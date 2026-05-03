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

1. Identify changed files via `git diff --name-only`
2. Read the relevant story in the appropriate track file under `docs/work-packages/`
3. Read the relevant concept docs for context:
   - Always: `docs/ARCHITECTURE.md`, `docs/work-packages/SHARED.md`
   - If backend changes: `docs/PROCESS_LAYER.md`, `docs/AGENT_LAYER.md`, `docs/KNOWLEDGE_ARCHITECTURE.md`
   - If frontend changes: `docs/UI_DESIGN.md`, `docs/HUMAN_INTERFACE_LAYER.md`, `docs/INFORMATION_ARCHITECTURE.md`
   - If requirements questions: `docs/REQUIREMENTS.md`

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
- **Check against the spec.** Every component, endpoint, and state machine has a spec in `docs/`. If the code diverges from the spec, that's a finding — either the code is wrong or the spec needs updating. Cite the specific doc section.
- **Verify, don't trust.** If a component claims to handle drag-drop, check that `useDraggable` is actually called. If a test claims to verify behavior, check that it actually asserts something meaningful. Surface-level "looks right" is not a review.
- Every issue must reference a file and line number
- Don't nitpick style — Biome handles formatting
- Distinguish fact from opinion — only facts can be CRITICAL
- Code without tests for its acceptance criteria is automatically NEEDS WORK
- New UI components without `.stories.tsx` files are automatically NEEDS WORK
