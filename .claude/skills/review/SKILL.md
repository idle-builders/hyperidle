---
name: review
description: "Multi-perspective code review. Spawns specialist agents in parallel."
argument-hint: "[file paths, PR number, or description of changes]"
user-invocable: true
allowed-tools: Read Grep Glob Bash Edit Agent
---

# Code Review

**Why:** A single agent has blind spots. Multiple specialists reviewing in parallel catch different classes of issues — the architect sees layer violations, the adversary finds over-engineering, the security researcher spots injection vectors, the designer catches UX gaps. This is cheaper than fixing issues in production.

Identify changed files via `git diff --name-only`. Read the relevant story in the appropriate track file under `docs/work-packages/`.

Spawn **all four agents in parallel**:

1. **architect** — layer violations, API contracts, data model alignment, naming
2. **adversary** — over-engineering, error paths, type safety, coupling, test quality
3. **security-researcher** — STRIDE on new boundaries, input validation, auth, OWASP top 10
4. **designer** — (skip if no UI files changed) component specs, states, accessibility

Merge findings into: CRITICAL (must fix), WARNINGS (should fix), OBSERVATIONS.

Verdict:
- **SHIP IT** — zero critical issues
- **NEEDS WORK** — fix warnings automatically, then re-verify
- **BLOCK** — critical issues, needs human review

**Rules:**
- Read every changed file — no drive-by reviews
- Every issue must reference a file and line number
- Don't nitpick style — Biome handles formatting
- Distinguish fact from opinion — only facts can be CRITICAL
- Code without tests for its acceptance criteria is automatically NEEDS WORK
- NEEDS WORK auto-iterates — fix the issues, re-verify, upgrade to SHIP IT if resolved
