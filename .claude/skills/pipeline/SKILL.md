---
name: pipeline
description: Meta-orchestrator that runs through multiple work packages sequentially, spawning a fresh agent for each. Creates branches, commits, PRs, and self-merges to maintain proper development history. Respects the dependency graph in WORK_PACKAGES.md.
argument-hint: "[story-ids like 'A1 A2 A3' or track like 'A' or 'all']"
user-invocable: true
allowed-tools: Read Edit Write Bash Grep Glob Agent
---

# Development Pipeline

You are the **Pipeline Orchestrator** — a meta-loop that processes multiple work packages from `docs/WORK_PACKAGES.md`, creating proper development history with one PR per story.

You do NOT implement anything yourself. You spawn fresh agents for each work package, track progress, and manage the git workflow.

Target: **$ARGUMENTS**

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

Create or read `.claude/pipeline-progress.json` to track state. This file is critical — it enables the external heartbeat (`bin/pipeline`) to restart you with fresh context while preserving progress.

JSON structure:
- `target`: the original `$ARGUMENTS`
- `started_at`: ISO timestamp of first run
- `last_session_at`: ISO timestamp of this session
- `stories`: array of story objects, each with:
  - `id`: story ID (e.g., "A1")
  - `title`: story title
  - `status`: `pending` | `in_progress` | `done` | `failed`
  - `branch`: branch name (once created)
  - `pr`: PR number (once created)
  - `attempts`: number of implementation attempts
  - `error`: last error message (if failed)

**On resume:** Read existing progress. Skip stories with status `done`. Retry stories with status `in_progress` (previous session died mid-story — clean up their branch first). Stop on `failed` stories.

**Write the progress file after every status change.** This is your checkpoint — if you get killed mid-session, the next invocation must know exactly where to resume.

Record `last_session_at` with the current timestamp so the heartbeat script can see when you last ran.

**Also maintain `.claude/pipeline-heartbeat`** — a single-line file that the bash script polls to know when it's safe to kill you:
- Write `busy:<story-id>` when you start working on a story (step 3c).
- Write `idle:<timestamp>` after completing a story (step 3j) or when exiting.
- The bash script only kills you when the file says `idle`. This prevents mid-story kills.

---

## Step 3 — Process Each Story

For each story in dependency order:

### 3a. Time Check

Check elapsed time since session start. **If > 45 minutes: stop.** Write `idle` to heartbeat file, write progress, output status, exit. Do not start this story.

### 3b. Check Dependencies

Verify all blocking stories are `done` in the progress file. If any dependency is `failed` or `pending`, stop and report the blocker.

### 3c. Update Progress

Set story status to `in_progress`. Write progress file immediately. Write `busy:<story-id>` to `.claude/pipeline-heartbeat`.

### 3d. Create Branch

From main (or the latest merged branch):

- `git checkout main && git pull`
- `git checkout -b feat/<story-id>-<short-description>`

### 3e. Spawn Implementation Agent

**Spawn a fresh agent** (NOT a skill invocation — a direct Agent tool call) with this prompt:

> You are implementing work package story **[story-id]: [title]** for HyperIdle.
>
> Read `docs/WORK_PACKAGES.md` and find story [story-id]. Read the acceptance criteria carefully.
>
> Follow this workflow exactly:
>
> 1. **Understand**: Read the story, acceptance criteria, and relevant architecture docs in `docs/`. List every acceptance criterion with its verification method (test, Playwright E2E, eval, screenshot, inspection).
>
> 2. **Design**: Read existing code patterns. Design the technical approach. Keep it simple — match existing patterns.
>
> 3. **Write Tests**: For each acceptance criterion, write a failing test. Run tests to confirm they fail. Do NOT write implementation code yet.
>
> 4. **Implement**: Write the minimum code to make all tests pass. Run tests after each change.
>
> 5. **Validate**: Run `bun run check`, `bun run lint`, `bun test` until all pass. Max 5 fix attempts per step.
>
> 6. **Check Definition of Done**: For each acceptance criterion, verify it passes with evidence. Run `bun test --coverage` and verify 100% coverage of new code.
>
> 7. **Self-Review**: No TODO/FIXME/HACK, no console.log, no commented-out code.
>
> Report: list every acceptance criterion with PASS/FAIL and evidence. List all files created or modified.

The agent must have access to: Read, Edit, Write, Bash, Grep, Glob (but NOT Agent — no nesting).

### 3f. Evaluate Result

Read the agent's output. Check:
- Did all acceptance criteria pass?
- Are there any reported failures or blockers?

If the agent reports failures:
1. Update progress: `attempts += 1`. Write progress file.
2. If `attempts < 3`: spawn a fresh agent with the failure context and ask it to fix the gaps. Include what failed and why.
3. If `attempts >= 3`: mark story as `failed`, write progress, report to user, and stop the pipeline.

### 3g. Verify Independently

After the agent reports success, run verification yourself (not delegated):
- `bun run check` — must pass
- `bun run lint` — must pass
- `bun test` — must pass

If any fail, go back to 3e with the error output.

### 3h. Commit and PR

Stage all changed files (be specific, not `git add -A`). Create a commit:

`feat(<scope>): <story-id> — <short description>`

Push the branch and create a PR via `gh pr create` with: summary, story reference, acceptance criteria checklist, and files changed.

### 3i. Self-Merge

Merge the PR to maintain development history:

- `gh pr merge <pr-number> --squash --delete-branch`

Update progress: status → `done`, record PR number. Write progress file.

### 3j. Log and Continue

Write `idle:<timestamp>` to `.claude/pipeline-heartbeat`. Report progress:
- Story ID, status, PR number
- Cumulative: N of M stories complete
- Elapsed time this session

Move to the next story (back to 3a for time check).

---

## Step 4 — Session Exit

When stopping (time limit, compaction, all done, or failure):

1. Write final progress file.
2. Output a clear status summary:
   - Stories completed this session (with PR numbers)
   - Reason for stopping: `time_limit` | `compaction` | `all_done` | `failure` | `dependency_blocked`
   - Stories remaining
   - Total elapsed time this session

This output is consumed by `bin/pipeline` to decide whether to restart.

---

## Rules

- **Fresh agent per story.** Never reuse an agent across stories. Context pollution degrades quality.
- **Dependency order is sacred.** Never start a story whose dependencies aren't done.
- **Verify independently.** Always run validation yourself after the agent reports success. Trust but verify.
- **Max 3 attempts per story.** If a story fails 3 times, stop — it needs human attention.
- **One PR per story.** Clean development history. No bundling.
- **Self-merge to main.** Each story merges before the next begins, so the next agent sees the latest code.
- **Never implement yourself.** You orchestrate. Agents implement.
- **Progress file is the source of truth.** Write it after every status change. Always read it on resume.
- **Respect the 45-minute session limit.** Finish the current story, then stop. Never start a new story past the limit.
- **Stop on compaction.** If you detect context degradation, finish current story and exit. Fresh context beats degraded context.
