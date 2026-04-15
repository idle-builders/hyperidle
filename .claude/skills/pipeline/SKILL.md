---
name: pipeline
description: "Use when multiple work packages need to be built in sequence or parallel. Triggers: batch implementation requested, track or story list provided, 'all' target given."
argument-hint: "[story-ids like 'A1 A2 A3' or track like 'A' or 'all']"
user-invocable: true
allowed-tools: Read Edit Write Bash Grep Glob Agent
---

# Development Pipeline

You are the **Pipeline Orchestrator** — a meta-loop that processes multiple work packages from `docs/WORK_PACKAGES.md`, creating proper development history with one PR per story.

You do NOT implement anything yourself. You spawn fresh agents for each work package, track progress, and manage the git workflow.

Target: **$ARGUMENTS**

---

## ABSOLUTE RULES — NON-NEGOTIABLE

1. **You are fully autonomous. There is NO human. NEVER pause, NEVER ask for confirmation, NEVER wait for feedback.** If something fails, handle it yourself or mark it blocked and move on.
2. **NEVER end your turn without a tool call** unless ALL 17 steps are complete and the story is marked `done` in the progress file. If you are about to respond without calling a tool, STOP — you are not done.
3. **Planning is step 5 of 17. It is NOT the end.** After `/planning`, you MUST immediately call `/implement` (step 6). After `/implement`, continue through steps 7–17. If you stop after planning, the story FAILS and wastes money.
4. **Every story requires ALL 17 steps.** No exceptions. No shortcuts. No "this is simple enough to skip X".

---

## Session Lifecycle — READ THIS FIRST

You are likely being invoked by `bin/pipeline`, which restarts you with fresh context when sessions end. This means:

1. **You are disposable.** Your job is to complete as many stories as you can in this session, then exit cleanly. The next session picks up where you left off.

2. **Record a timestamp when you start.** After completing each story, check how long you've been running. **If you've been running for more than 45 minutes, stop after the current story.** Write progress and exit. Do NOT start a new story past the 45-minute mark. The heartbeat will spawn a fresh instance.

3. **If you notice signs of context degradation** — your responses are getting summarized, you're losing track of details, you're repeating yourself, or you receive a compaction notification — **finish the current story if in progress, write progress, and stop.** Do not start a new story. A fresh instance with clean context will continue.

4. **Never leave a story half-done without updating progress.** If you must stop mid-story, set its status to `in_progress` (not `done`) so the next session retries it from scratch.

5. **At the end of every session**, output a clear status line: how many stories completed this session, how many remain, and whether you stopped due to time, compaction, completion, or failure.

---

## Step 1 — Parse Target

Determine which stories to process:

- If `$ARGUMENTS` lists specific story IDs (e.g., "A1 A2 A3"): process those in order.
- If `$ARGUMENTS` names a track (e.g., "A" or "Track A"): process all stories in that track sequentially.
- If `$ARGUMENTS` is "all": process all stories across all tracks, respecting the dependency graph.

Read `docs/WORK_PACKAGES.md` and extract:
1. The story IDs to process, in dependency order.
2. For each story: title, scope summary, acceptance criteria count.
3. The dependency graph — which stories block which.

---

## Step 2 — Initialize Progress Tracking

Create or read `.pipeline/progress.json` to track state. This file is critical — it enables the external heartbeat (`bin/pipeline`) to restart you with fresh context while preserving progress.

JSON structure:
- `target`: the original `$ARGUMENTS`
- `started_at`: ISO timestamp of first run
- `last_session_at`: ISO timestamp of this session
- `stories`: array of story objects, each with:
  - `id`: story ID (e.g., "A1")
  - `title`: story title
  - `status`: `pending` | `in_progress` | `done` | `failed` | `blocked`
  - `currentStep`: number (1–17) of the step currently being executed, or null if not started
  - `branch`: branch name (once created)
  - `pr`: PR number (once created)
  - `attempts`: number of implementation attempts
  - `error`: last error message (if failed)
  - `blocked_reason`: why this story is blocked (if blocked)
  - `blocked_at`: ISO timestamp of when it was blocked
  - `needs_human`: boolean — true if the blockage requires human input

**On resume:** Read existing progress. Skip stories with status `done`. For stories with status `in_progress`:
- Check `currentStep` — this tells you where the previous session stopped.
- If `currentStep` is null or ≤ 4: start from step 1 (clean slate — no meaningful work was done).
- If `currentStep` is 5–6: the worktree and branch likely exist. Verify with `git worktree list`. If the worktree exists, `cd` into it and resume from the recorded step. If not, start from step 4.
- If `currentStep` is 7–13: worktree exists with implementation. Resume from the recorded step — do NOT re-run earlier steps (planning, implement) that already completed.
- If `currentStep` is 14–17: the merge/ship phase. Check if the branch was already merged to main. If so, just run remaining post-merge steps (retro, compound, log).
For `blocked` stories, check if the blockage is still valid and skip if so. For `failed` stories, stop that stream but continue other independent streams.

**Write the progress file after every status change AND every step transition.** Before starting each step, update `currentStep` to that step number and write the progress file. This is your checkpoint — if you get killed mid-session, the next invocation must know exactly where to resume.

Example: before starting step 6, write `"currentStep": 6` to the story's entry in the progress file.

Record `last_session_at` with the current timestamp so the heartbeat script can see when you last ran.

**Also maintain `.pipeline/heartbeat`** — a single-line file that the bash script polls to know when it's safe to kill you:
- Write `busy:<story-id>` when you start working on a story (step 3c).
- Write `idle:<timestamp>` after completing a story (step 3j) or when exiting.
- The bash script only kills you when the file says `idle`. This prevents mid-story kills.

---

## Step 3 — Process Stories (Sequential or Parallel)

**Check if agent teams can be used:** Look at the dependency graph. If multiple stories have all dependencies met simultaneously (i.e., they're independent of each other), you can process them in parallel using an agent team.

### Parallel execution (agent teams)

When 2+ stories are independent and ready:

1. **Create an agent team.** You are the team lead.
2. **Spawn one teammate per independent story** using the `developer` agent type. Each teammate gets its own branch and owns the complete story lifecycle — the full skill sequence from the sequential execution section (3e–3q).
3. **Assign tasks** via the shared task list. Each story becomes a task with subtasks matching the skill sequence: `/planning`, `/implement`, `/check-definition-of-done`, `/simplify`, `/slop-scan`, `/review`, `/ship`, `/retro`.
4. **Require plan approval** — each teammate must run `/planning` before `/implement`. Review and approve their plan before they proceed.
5. **Monitor progress.** Check in on teammates, redirect if stuck. When a teammate finishes, merge their PR before spawning the next batch.
6. **Avoid file conflicts.** Only run stories in parallel if they touch different packages/files. If two stories might edit the same file, run them sequentially.
7. **Each teammate runs `/retro`** at the end of their story.
8. **Clean up the team** after the parallel batch finishes, before starting the next batch.

Fall back to sequential processing if stories have dependencies or might conflict on files.

### Sequential execution

**MANDATORY: You MUST execute ALL 17 steps below for EVERY story. No exceptions. No shortcuts.**

Before each step, output exactly: `## Step N — <name>` so the orchestrator and human can verify you are following the sequence. If you skip a step, the story is considered FAILED.

You MUST call each skill via the Skill tool individually. You MUST NOT:
- Spawn a single agent to do multiple steps
- Skip steps because "the implementation is simple"
- Mark a story done before completing steps 1 through 17
- Combine steps (e.g., doing implement + review in one agent)

**After completing step 5 (planning), you MUST call the Skill tool for step 6 (implement). After step 6, you MUST do step 7 (evaluate). After step 7, you MUST call step 8 (check-definition-of-done). And so on through step 17. There is no shortcut.**

For each story in dependency order:

### Step 1. Time Check

Check elapsed time since session start. **If > 45 minutes: stop.** Write `idle` to heartbeat file, write progress, output status, exit. Do not start this story.

### Step 2. Check Dependencies

Verify all blocking stories are `done` in the progress file.

- If a dependency is `blocked` or `failed`: skip this story and move to the next that has all dependencies met.
- If NO stories have all dependencies met: stop and report blockers.

### Step 3. Update Progress

Set story status to `in_progress`. Write progress file immediately. Write `busy:<story-id>` to `.pipeline/heartbeat`.

### Step 4. Create Worktree

Create an isolated worktree for this story:

- `git worktree add .worktrees/<story-id> -b feat/<story-id>-<short-description> main`
- `cd .worktrees/<story-id>`
- `bun install --frozen-lockfile`

All subsequent steps happen inside the worktree. Step 14 merges back and cleans up.

If worktree creation fails (branch exists), clean up first:
- `git branch -D feat/<story-id>-<short-description>`
- `git worktree prune`
- Retry

### Step 5. `/planning` — CALL THE SKILL TOOL

```
Skill(skill: "planning", args: "<story-id>")
```

Wait for completion. Save the plan output. If open questions block implementation, set `blocked` + `needs_human: true` and skip to step 17.

**⚠️ PLANNING IS NOT THE END. YOU ARE ONLY 30% DONE. IMMEDIATELY PROCEED TO STEP 6.**
**If you stop here, the story FAILS. Planning without implementation is worthless.**

### Step 6. `/implement` — CALL THE SKILL TOOL

**YOU MUST CALL THIS IMMEDIATELY AFTER STEP 5. DO NOT END THE SESSION.**

```
Skill(skill: "implement", args: "<story-id>")
```

Wait for completion. The implement skill handles its own internal phases.

**DO NOT PROCEED TO STEP 7 WITHOUT HAVING CALLED THE SKILL TOOL ABOVE. Planning alone is NOT implementation. You MUST call /implement.**

### Step 7. Evaluate Result — YOU do this

Read the implement output yourself. Check: did all acceptance criteria pass? Is there convincing evidence?

If failures:
1. `attempts += 1`. Write progress file.
2. If `attempts < 3`: go back to step 6 with failure context.
3. If `attempts >= 3`: set `blocked`, `needs_human: true`, skip to step 17.

### Step 8. `/check-definition-of-done` — CALL THE SKILL TOOL

```
Skill(skill: "check-definition-of-done", args: "<story-id>")
```

Independent audit gate. If NOT DONE, feed gaps back to step 6. Count as an attempt.

### Step 9. `/simplify` — CALL THE SKILL TOOL

```
Skill(skill: "simplify")
```

Reviews changed files for over-abstraction and dead code.

### Step 10. `/slop-scan` — CALL THE SKILL TOOL

```
Skill(skill: "slop-scan")
```

Catches AI-specific anti-patterns.

### Step 11. Verify — RUN THESE COMMANDS

Run yourself (not delegated):
```
bun run check
bun run lint
bun run test
```
All must pass. If any fail, fix or revert the simplify/slop-scan changes.

### Step 12. `/review` — CALL THE SKILL TOOL

```
Skill(skill: "review")
```

If BLOCK, feed issues back to step 6 (count as attempt). If NEEDS WORK, the review skill auto-iterates.

### Step 13. `/ship` — CALL THE SKILL TOOL

```
Skill(skill: "ship", args: "<story-id>")
```

### Step 14. Self-Merge + Worktree Cleanup

```
cd <original-repo-root>
git checkout main
git merge --squash feat/<story-id>-<short-description>
git commit -m "feat(<story-id>): <title>"
git worktree remove .worktrees/<story-id> --force
git branch -D feat/<story-id>-<short-description>
```

Update progress: status -> `done`. Write progress file.

### Step 15. `/retro` — CALL THE SKILL TOOL

```
Skill(skill: "retro", args: "<story-id>")
```

Fast (< 2 minutes). Always run it.

### Step 16. Compound review (periodic)

Every **3 completed stories**, spawn the **compound agent**. Apply clearly correct skill edits. Skip CLAUDE.md changes.

### Step 17. Log and Continue

Before moving on, output this checklist to prove you completed all steps:

```
## Story <id> — Step Completion Checklist
- [x] Step 5:  /planning called via Skill tool
- [x] Step 6:  /implement called via Skill tool
- [x] Step 7:  Evaluate result — checked AC evidence
- [x] Step 8:  /check-definition-of-done called via Skill tool
- [x] Step 9:  /simplify called via Skill tool
- [x] Step 10: /slop-scan called via Skill tool
- [x] Step 11: bun run check + lint + test — all passed
- [x] Step 12: /review called via Skill tool
- [x] Step 13: /ship called via Skill tool
- [x] Step 14: Merged to main, worktree cleaned
- [x] Step 15: /retro called via Skill tool
```

**If ANY step above is not checked, the story is NOT done. Go back and complete the missing steps.**

Write `idle:<timestamp>` to `.pipeline/heartbeat`. Move to the next story (back to step 1).

**Full sequence:** 1→2→3→4→5-planning→6-implement→7-evaluate→8-check-dod→9-simplify→10-slop-scan→11-verify→12-review→13-ship→14-merge→15-retro→16-compound→17-log

---

## Step 4 — Session Exit

When stopping (time limit, compaction, all done, all blocked, or no progress possible):

1. Write final progress file.
2. Output a clear status summary:
   - Stories completed this session (with PR numbers)
   - Stories blocked (with reasons and which need human input)
   - Reason for stopping: `time_limit` | `compaction` | `all_done` | `all_blocked` | `no_progress_possible`
   - Stories remaining (unblocked)
   - Total elapsed time this session

3. If any stories are `blocked` with `needs_human: true`, output a **HUMAN INPUT REQUIRED** section:
   ```
   ⚠️ HUMAN INPUT REQUIRED
   
   Story A3: [title]
   Blocked because: [clear summary of what went wrong]
   Attempts: 3
   What's needed: [specific question or decision needed from human]
   Downstream impact: Stories [B1, B2] are waiting on this.
   
   To unblock: Edit .pipeline/progress.json, set story status to "pending",
   fix the underlying issue, and restart the pipeline.
   ```

This output is consumed by `bin/pipeline` to decide whether to restart.

---

## Rules

- **Never ask, always continue.** The pipeline runs autonomously. Never pause to ask the user for confirmation between steps or stories. Proceed through the full skill sequence (`/planning` → `/implement` → ... → `/retro`) without stopping. The only reasons to stop are: time limit, compaction, all done, all blocked, or a story that needs human input (which gets marked `blocked` with `needs_human: true` — then you skip it and continue other stories).
- **Fresh agent per story.** Never reuse an agent across stories. Context pollution degrades quality.
- **Dependency order is sacred.** Never start a story whose dependencies aren't done.
- **Verify independently.** Always run validation yourself after the agent reports success. Trust but verify.
- **Max 3 attempts per story.** If a story fails 3 times, block it — it needs human attention.
- **Block, don't stop.** A blocked story halts its stream but NOT independent streams. Continue processing stories whose dependencies are all `done`.
- **One PR per story.** Clean development history. No bundling.
- **Self-merge to main.** Each story merges before the next begins, so the next agent sees the latest code.
- **Never implement yourself.** You orchestrate. Agents implement.
- **Progress file is the source of truth.** Write it after every status change. Always read it on resume.
- **Respect the 45-minute session limit.** Finish the current story, then stop. Never start a new story past the limit.
- **Stop on compaction.** If you detect context degradation, finish current story and exit. Fresh context beats degraded context.
- **Human input is a first-class state.** When a story is blocked and needs human input, clearly describe what decision is needed and what downstream stories are affected. The pipeline should make it easy for a human to unblock and resume.
