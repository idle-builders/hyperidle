---
name: ship
description: "Commit and push changes. Create PR if on a feature branch."
argument-hint: "[story-id or branch description]"
user-invocable: true
allowed-tools: Bash Read Grep Glob
---

# Ship

**Why:** Clean git history makes it possible to understand what changed and why. Atomic commits with clear messages let future agents (and humans) trace decisions. PRs create a review record.

Run `bun run check && bun run lint && bun run test`. If anything fails, stop.

Stage files (never `git add -A`). Commit with `<type>(<scope>): <imperative description>` referencing the story ID. If changes span multiple logical units, make multiple atomic commits.

Types: feat, fix, refactor, test, docs, chore. Scopes: db, server, web, fabric, shared, or omit.

If not on a feature branch, create one: `feat/<story-id>-<description>`.

Push with `-u`. Create PR via `gh pr create` with summary and story reference.

**Rules:**
- Never ship failing tests or lint errors
- Never `git add -A` or `git add .` — stage specific files
- Never force push
- One PR per story
