---
name: simplify
description: Post-implementation simplification pass. Reviews recently changed code for unnecessary complexity, duplication, dead code, and over-abstraction. Fixes issues without changing behavior.
argument-hint: "[file paths or 'all' for all recent changes]"
user-invocable: true
allowed-tools: Read Edit Bash Grep Glob
---

# Simplify

Review and simplify code without changing behavior. Run this after `/implement`, before `/review`.

## Step 1 — Identify Scope

Use `$ARGUMENTS` if provided, otherwise find recently changed files via `git diff --name-only HEAD~1`.

## Step 2 — Analyze Each File

Check for:

- **Over-abstraction:** Helpers/utilities used only once — inline them. Premature generics — remove them. Config-driven behavior that's really code — replace with code. Factory functions producing one product — just construct it.
- **Duplication:** Three or more identical blocks — extract. Two is fine, leave them.
- **Dead code:** Unused exports. Unreachable branches. Commented-out code — delete it, git has history.
- **Over-engineering:** Error handling for impossible scenarios. Defensive copies of never-mutated data. Unnecessary async. Wrapper types adding no information.

## Step 3 — Fix

Fix directly. Keep changes behavior-preserving. If unsure whether a change is safe, skip it.

## Step 4 — Verify

Run `bun run check && bun run lint && bun test`. If anything breaks, revert the change that caused it.

## Step 5 — Report

List simplified files with what changed. Report validation status.
