---
name: pipeline
description: "Use when multiple work packages need to be built in sequence or parallel. Triggers: batch implementation requested, track or story list provided, 'all' target given."
argument-hint: "[story-ids like 'A1 A2 A3' or track like 'A' or 'all']"
user-invocable: true
allowed-tools: Read Edit Write Bash Grep Glob Agent
---

# Pipeline — Build Stories End-to-End

Target: **$ARGUMENTS**

You are autonomous. There is NO human. Never pause, never ask, never stop until every story is done or blocked.

**NEVER end your turn without a tool call** unless all stories are done/blocked.

---

## Setup

1. Determine the track from the story IDs (e.g., A3 → Track A). Read `docs/work-packages/TRACK-<letter>.md` for the stories and `docs/work-packages/SHARED.md` for the dependency graph.
2. Read or create `.pipeline/progress.json` — skip `done` stories, resume `in_progress` from `currentStep`.
3. Record session start time.

---

## For each story (in dependency order):

Check dependencies are `done`. If not, skip to next. If none ready, exit.

Set status to `in_progress`. Create worktree:
```
git worktree add .worktrees/<id> -b feat/<id>-<desc> main
cd .worktrees/<id> && bun install
```

Then execute these steps. **Each step spawns an agent with a skill. Update `currentStep` in progress file before each step.**

| Step | Agent | Skill | Why |
|------|-------|-------|-----|
| 1 | architect | `/plan <id>` | Plan before building — prevents wasted implementation time and catches design flaws early |
| 2 | developer | `/write-tests <id>` | Tests first define the requirement, not the implementation — catches when the wrong thing gets built |
| 3 | developer | `/write-code <id>` | With tests as targets, implementation stays lean and every line exists because a test demands it |
| 4 | — | `bun run check && lint && test` | Automated gates catch regressions before they compound — the next agent inherits what you leave |
| 5 | qa | `/check-definition-of-done <id>` | The builder is biased — an independent auditor catches gaps the implementer rationalized away |
| 6 | developer | `/simplify` | AI code trends toward over-abstraction — simplifying keeps the codebase maintainable for the next story |
| 7 | developer | `/slop-scan` | AI-specific anti-patterns (verbose names, restating comments) make code harder to read if left unchecked |
| 8 | — | `bun run check && lint && test` | Verify simplify/slop-scan didn't break anything — cleanup must be behavior-preserving |
| 9 | — | `/review` | Multiple specialists catch different issue classes — architect sees layer violations, adversary finds over-engineering |
| 10 | — | `/ship <id>` | Clean git history with atomic commits lets future agents trace decisions |
| 11 | — | Merge yourself | Self-merge to main so the next story sees the latest code |
| 12 | — | Cleanup yourself | Remove worktree and branch to keep the repo clean |
| 13 | — | `/retro <id>` | Recording what went well/badly feeds the compound agent to improve the process over time |

If step 5 (DoD) fails: back to step 3. Max 3 attempts, then `blocked`.
If step 9 (review) blocks: back to step 3. Max 3 attempts.

After step 13: set status to `done`. Move to next story.

---

## Rules

- **Never stop after planning.** Step 1 is just the beginning. Immediately proceed to step 2.
- After each story, check elapsed time. If > 45 minutes, save progress and exit.
- If context degrades (compaction), finish current story and exit.
- Max 3 attempts per story. After 3, mark `blocked`.
- Progress file is the checkpoint. Write it after every status/step change.

**Don't rationalize skipping steps:**
- "Planning is done, I can stop" → planning is step 1 of 13. You haven't built anything yet.
- "This story is simple, skip to code" → simple stories have the highest skip rate and highest regression rate
- "The DoD check is redundant, tests passed" → tests prove behavior, DoD proves the RIGHT thing was built against the spec
- "Simplify/slop-scan aren't needed" → AI code accumulates cruft that compounds across stories. 2 minutes now saves hours later.
