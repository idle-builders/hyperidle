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
  - `status`: `pending` | `in_progress` | `done` | `failed` | `blocked`
  - `branch`: branch name (once created)
  - `pr`: PR number (once created)
  - `attempts`: number of implementation attempts
  - `error`: last error message (if failed)
  - `blocked_reason`: why this story is blocked (if blocked)
  - `blocked_at`: ISO timestamp of when it was blocked
  - `needs_human`: boolean — true if the blockage requires human input

**On resume:** Read existing progress. Skip stories with status `done`. Retry stories with status `in_progress` (previous session died mid-story — clean up their branch first). For `blocked` stories, check if the blockage is still valid and skip if so. For `failed` stories, stop that stream but continue other independent streams.

**Write the progress file after every status change.** This is your checkpoint — if you get killed mid-session, the next invocation must know exactly where to resume.

Record `last_session_at` with the current timestamp so the heartbeat script can see when you last ran.

**Also maintain `.claude/pipeline-heartbeat`** — a single-line file that the bash script polls to know when it's safe to kill you:
- Write `busy:<story-id>` when you start working on a story (step 3c).
- Write `idle:<timestamp>` after completing a story (step 3j) or when exiting.
- The bash script only kills you when the file says `idle`. This prevents mid-story kills.

---

## Step 3 — Process Stories (Sequential or Parallel)

**Check if agent teams can be used:** Look at the dependency graph. If multiple stories have all dependencies met simultaneously (i.e., they're independent of each other), you can process them in parallel using an agent team.

### Parallel execution (agent teams)

When 2+ stories are independent and ready:

1. **Create an agent team.** You are the team lead.
2. **Spawn one teammate per independent story** using the `developer` agent type. Each teammate gets its own branch and owns a complete story lifecycle (plan → implement → prove → commit → PR).
3. **Assign tasks** via the shared task list. Each story becomes a task with subtasks for planning, implementation, verification, commit, and PR.
4. **Require plan approval** — each teammate must plan before implementing. Review and approve their plan before they proceed.
5. **Monitor progress.** Check in on teammates, redirect if stuck. When a teammate finishes, merge their PR before spawning the next batch.
6. **Avoid file conflicts.** Only run stories in parallel if they touch different packages/files. If two stories might edit the same file, run them sequentially.
7. **Each teammate runs retro** at the end of their story — appending observations to `.claude/retro-log.jsonl`.
8. **Clean up the team** after the parallel batch finishes, before starting the next batch.

Fall back to sequential processing if stories have dependencies or might conflict on files.

### Sequential execution (subagents)

For each story in dependency order:

### 3a. Time Check

Check elapsed time since session start. **If > 45 minutes: stop.** Write `idle` to heartbeat file, write progress, output status, exit. Do not start this story.

### 3b. Check Dependencies

Verify all blocking stories are `done` in the progress file.

- If a dependency is `blocked` or `failed`: **do NOT stop the entire pipeline.** Instead, skip this story and move to the next story that has all dependencies met. This story becomes `dependency_blocked` — it will be retried when its dependency is resolved.
- If NO stories in the remaining queue have all dependencies met (all remaining stories are blocked by failed/blocked stories): stop the pipeline and report the full dependency graph with blockers.

### 3c. Update Progress

Set story status to `in_progress`. Write progress file immediately. Write `busy:<story-id>` to `.claude/pipeline-heartbeat`.

### 3d. Create Branch

From main (or the latest merged branch):

- `git checkout main && git pull`
- `git checkout -b feat/<story-id>-<short-description>`

### 3e. Spawn Planning Agent

**Spawn a fresh agent** to plan the work before implementation:

> You are planning work package story **[story-id]: [title]** for HyperIdle.
>
> Read `docs/WORK_PACKAGES.md` and find story [story-id]. Read `docs/ARCHITECTURE.md` and relevant architecture docs. Read existing code in the packages this story touches.
>
> Produce a development plan:
> 1. List every acceptance criterion with its verification method.
> 2. Identify all gaps — new files, modified files, dependencies, migrations.
> 3. Decompose into ordered tasks (~100 lines each), each independently testable.
> 4. Map every criterion to at least one task. Map every task to at least one test.
> 5. Flag any ambiguities or open questions — do not guess.
>
> Output a structured plan: criteria table, gaps list, ordered task table with files/tests/dependencies, and risks.

The agent must have access to: Read, Bash, Grep, Glob (but NOT Edit, Write, or Agent — planning only).

Save the plan output — it feeds into the implementation agent.

### 3f. Spawn Implementation Agent

**Spawn a fresh agent** with the plan from 3e:

> You are implementing work package story **[story-id]: [title]** for HyperIdle.
>
> Here is the development plan: [paste plan from 3e]
>
> Follow this workflow exactly:
>
> 1. **Write Tests**: For each task in the plan, write a failing test. Run tests to confirm they fail. Do NOT write implementation code yet.
>
> 2. **Implement**: Follow the task order from the plan. Write the minimum code to make all tests pass. Run tests after each change.
>
> 3. **Validate**: Run `bun run check`, `bun run lint`, `bun test` until all pass. Max 5 fix attempts per step.
>
> 4. **Prove**: For each acceptance criterion, prove it is complete, correct, and working with observable evidence (test output, command output, screenshots). Words are not proof — only evidence is proof. Run `bun test --coverage` and show 100% coverage of new code.
>
> 5. **Self-Review**: No TODO/FIXME/HACK, no console.log, no commented-out code.
>
> Report: list every acceptance criterion with PASS/FAIL and the evidence itself. List all files created or modified.

The agent must have access to: Read, Edit, Write, Bash, Grep, Glob (but NOT Agent — no nesting).

### 3g. Evaluate Result

Read the agent's output. Check:
- Did all acceptance criteria pass?
- Are there any reported failures or blockers?
- Is there convincing evidence for each criterion (not just assertions)?

If the agent reports failures:
1. Update progress: `attempts += 1`. Write progress file.
2. If `attempts < 3`: spawn a fresh agent with the failure context and ask it to fix the gaps. Include what failed and why.
3. If `attempts >= 3`: **Block the story, don't stop the pipeline.**
   - Set status to `blocked`, set `needs_human: true`.
   - Write `blocked_reason` with a clear summary: what was attempted, what failed, and what needs human decision (architecture question? ambiguous requirement? fundamental approach wrong?).
   - Write `blocked_at` timestamp.
   - **Continue processing other stories** that don't depend on this blocked story.
   - The pipeline only stops when ALL remaining stories are blocked or their dependencies are blocked.

### 3h. Verify Independently

After the agent reports success, run verification yourself (not delegated):
- `bun run check` — must pass
- `bun run lint` — must pass
- `bun test` — must pass

If any fail, go back to 3f with the error output.

### 3i. Commit and PR

Stage all changed files (be specific, not `git add -A`). Create a commit:

`feat(<scope>): <story-id> — <short description>`

Push the branch and create a PR via `gh pr create` with: summary, story reference, acceptance criteria checklist, and files changed.

### 3j. Self-Merge

Merge the PR to maintain development history:

- `gh pr merge <pr-number> --squash --delete-branch`

Update progress: status → `done`, record PR number. Write progress file.

### 3k. Retro (lightweight)

**Spawn a fresh agent** to contribute observations from this story to the retro log:

> You just finished story **[story-id]**. Review what happened:
> - Check the git log for this branch (commits, fixups, reverts).
> - Check `.claude/pipeline-progress.json` for attempt count.
> - Note any errors, retries, permission denials, or rework.
>
> Append observations to `.claude/retro-log.jsonl` — one JSON line per observation:
> `{"date": "[today]", "story": "[id]", "type": "[friction|failure|gap|success|escalation]", "observation": "[specific sentence]", "severity": "[low|medium|high|critical]", "tags": ["tag1", "tag2"]}`
>
> Record everything notable — problems AND successes. Be specific: name the skill, the step, the file, the error.
> If something is critically broken and will break the next story: output an ESCALATION warning.
> Do NOT change any skills or process files. Observe and record only.

The agent must have access to: Read, Write, Bash, Grep, Glob (but NOT Edit or Agent — observation only).

This step is fast (< 2 minutes). Always run it — even under time pressure. The compound agent needs data.

### 3l. Compound review (periodic)

Every **3 completed stories**, spawn the **compound agent** to review accumulated observations:

> You are the compound agent. Read `.claude/retro-log.jsonl` and identify patterns.
> A pattern requires 3+ occurrences across different stories.
> Propose specific, surgical skill changes for confirmed patterns.
> Do NOT apply changes directly — output proposals for the coordinator.
> See `.claude/agents/compound/AGENT.md` for your full instructions.

The compound agent has access to: Read, Grep, Glob, Bash (read-only review).

If the compound agent proposes changes: evaluate them yourself. For skill file edits, apply them if they're clearly correct and targeted. For CLAUDE.md changes or new skills, skip — those need human approval. Log what you applied and what you deferred.

### 3m. Log and Continue

Write `idle:<timestamp>` to `.claude/pipeline-heartbeat`. Report progress:
- Story ID, status, PR number
- Cumulative: N of M stories complete
- Elapsed time this session

Move to the next story (back to 3a for time check).

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
   
   To unblock: Edit .claude/pipeline-progress.json, set story status to "pending",
   fix the underlying issue, and restart the pipeline.
   ```

This output is consumed by `bin/pipeline` to decide whether to restart.

---

## Rules

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
