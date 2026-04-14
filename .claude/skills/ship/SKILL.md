---
name: ship
description: "Use when changes are ready to commit and push. Triggers: implementation verified, review passed, ready to create PR."
argument-hint: "[story-id or branch description]"
user-invocable: true
allowed-tools: Bash Read Grep Glob
---

# Ship

Take the current changes from working tree to pull request.

## Step 1 — Pre-flight

Run `bun run check && bun run lint && bun test`. If anything fails, stop and tell the user to run `/verify` first.

## Step 2 — Assess Changes

Run `git status` and `git diff --stat`. Read the diff. If a story ID was provided, read the relevant work package for context.

## Step 3 — Branch

If not on a feature branch, create one: `<type>/<story-id>-<description>` (e.g., `feat/A1-project-scaffolding`).

## Step 4 — Commit

Stage specific files (never `git add -A`). Generate a commit message: `<type>(<scope>): <imperative description>` with a short body, story reference, and Co-Authored-By line. If changes span multiple logical units, make multiple atomic commits.

Commit types: feat, fix, refactor, test, docs, chore. Scopes: db, server, web, fabric, shared, or omit.

## Step 5 — Push

Push with `-u` flag to set upstream tracking.

## Step 6 — Pull Request

Create PR via `gh pr create` with: summary bullets, story reference, changes by package, acceptance criteria checklist, and test plan.

## Step 7 — Report

Output the PR URL.

## Rules

- Never ship failing tests or lint errors.
- Never `git add -A` or `git add .`.
- Never force push.
- One PR per story.
- Ask before pushing if there are unrelated uncommitted changes.
