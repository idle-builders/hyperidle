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

## Rules

**NEVER end your turn without a tool call** unless ALL 17 steps are complete and the story is marked `done` in the progress file. If you are about to respond without calling a tool, STOP — you are not done.

**Every story requires ALL 17 steps.** No exceptions. No shortcuts. No "this is simple enough to skip X".


---

## Setup

1. Read `docs/WORK_PACKAGES.md` — extract story IDs, titles, dependencies for your target.
2. Read or create `.pipeline/progress.json` — skip stories already `done`. Resume `in_progress` stories from their `currentStep`.
3. Record session start time.

---

## For each story (in dependency order):

Check dependencies are `done`. If not, skip to next. If none ready, exit.

Set status to `in_progress` in progress file. Create worktree:
```
git worktree add .worktrees/<id> -b feat/<id>-<desc> main
cd .worktrees/<id> && bun install
```

Then execute this skill sequence. **Every skill call is mandatory. Call them one by one via the Skill tool.**

| Step | Action | How |
|------|--------|-----|
| 1 | Plan | `Skill(skill: "planning", args: "<id>")` |
| 2 | Implement | `Skill(skill: "implement", args: "<id>")` |
| 3 | Check DoD | `Skill(skill: "check-definition-of-done", args: "<id>")` |
| 4 | Simplify | `Skill(skill: "simplify")` |
| 5 | Slop scan | `Skill(skill: "slop-scan")` |
| 6 | Verify | Run `bun run check && bun run lint && bun run test` yourself |
| 7 | Review | `Skill(skill: "review")` |
| 8 | Ship | `Skill(skill: "ship", args: "<id>")` |
| 9 | Merge | `cd <repo-root> && git checkout main && git merge --squash feat/<id>-<desc> && git commit -m "feat(<id>): <title>"` |
| 10 | Cleanup | `git worktree remove .worktrees/<id> --force && git branch -D feat/<id>-<desc>` |
| 11 | Retro | `Skill(skill: "retro", args: "<id>")` |

**Update `currentStep` in progress file before each step.**

If step 3 (DoD) fails: go back to step 2. Max 3 attempts, then mark `blocked`.
If step 7 (review) blocks: go back to step 2. Max 3 attempts.

After step 11: set status to `done` in progress file. Move to next story.

---

## Rules

- **Never stop after planning.** Step 1 (plan) is just the beginning. You MUST call step 2 (implement) immediately after.
- **Never end your turn without a tool call** unless all stories are done/blocked.
- After each story, check elapsed time. If > 45 minutes, save progress and exit.
- If context degrades (compaction), finish current story and exit.
- Max 3 attempts per story. After 3, mark `blocked` with `needsHuman: true`.
- Progress file is the checkpoint. Write it after every status change.
