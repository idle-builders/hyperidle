---
name: ship
description: Stage, commit, push, and create a pull request in one workflow. Generates commit message and PR description from the diff and work package context.
argument-hint: "[story-id or branch description]"
user-invocable: true
allowed-tools: Bash Read Grep Glob
---

# Ship

Take the current changes from working tree to pull request.

## Step 1 — Pre-flight

Run validation to ensure we're shipping clean code:

```bash
bun run check && bun run lint && bun test
```

If anything fails, **stop**. Tell the user to run `/verify` first. Do not ship broken code.

## Step 2 — Assess Changes

```bash
git status
git diff --stat
git diff
```

Read the diff to understand what changed. If a story ID was provided in `$ARGUMENTS`, read the relevant work package from `WORK_PACKAGES.md` for context.

## Step 3 — Branch

If not already on a feature branch:

```bash
git checkout -b <type>/<story-id>-<description>
```

Branch naming: `feat/A1-project-scaffolding`, `fix/B3-materialization-race`, `refactor/C2-task-state-machine`.

## Step 4 — Commit

Stage the relevant files (be specific, don't use `git add -A`):

```bash
git add <specific-files>
```

Generate a commit message from the diff. Format:

```
<type>(<scope>): <imperative description>

<body — what changed and why, 2-3 lines max>

Story: <story-id if applicable>

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
```

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`
Scopes: `db`, `server`, `web`, `fabric`, `shared`, or omit for cross-cutting

If the changes span multiple logical units, make multiple atomic commits.

## Step 5 — Push

```bash
git push -u origin <branch-name>
```

## Step 6 — Pull Request

Create the PR using `gh`:

```bash
gh pr create --title "<concise title>" --body "$(cat <<'EOF'
## Summary
<2-3 bullet points describing what this PR does and why>

## Story
<Story ID and title from WORK_PACKAGES.md, if applicable>

## Changes
<List of key changes by package>

## Acceptance Criteria
<Checklist from work package, checked off>

## Test Plan
- [ ] All existing tests pass
- [ ] New tests cover acceptance criteria
- [ ] Typecheck clean
- [ ] Lint clean

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

## Step 7 — Report

Output the PR URL so the user can review it.

## Rules

- **Never ship failing tests or lint errors.** Pre-flight is mandatory.
- **Never `git add -A` or `git add .`.** Stage specific files.
- **Never force push.** If push fails, diagnose why.
- **One PR per story.** Don't bundle unrelated changes.
- **Ask before pushing** if there are uncommitted changes that look unrelated to the story.
