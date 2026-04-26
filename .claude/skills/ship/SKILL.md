---
name: ship
description: "Commit and push changes. Create PR if on a feature branch."
argument-hint: "[story-id or branch description]"
user-invocable: true
---

# Ship

**Why:** Clean main branch ensure the next change will start from a reliable basis. Clean git history makes it possible to understand what changed and why. Atomic commits with clear messages let future agents (and humans) trace decisions. PRs create a review record. CI gates prevent broken code from reaching main.


## Pre-flight validation (MANDATORY — do not skip)

Run all three checks. If ANY fail, stop and fix before proceeding:
```bash
bun run check   # Zero type errors
bun run lint     # Zero lint errors
bun run test     # All tests pass
```

This is non-negotiable. Do not merge with failures. Do not use `--no-verify`. Do not rationalize "pre-existing failures" — if it's red, fix it or document why it's blocked and stop.

## Branch and PR

If not on a feature branch, create one: `feat/<story-id>-<description>`.

Push with `-u`. Create PR via `gh pr create` with summary and story reference.

Main is a protected branch and can only be commited to via a pull request.

## Commit

Stage files (never `git add -A`). Commit with `<type>(<scope>): <imperative description>` referencing the story ID. If changes span multiple logical units, make multiple atomic commits.

Types: feat, fix, refactor, test, docs, chore. Scopes: db, server, web, fabric, shared, or omit.

## CI gate (MUST PASS before merge)

After pushing, CI runs automatically (`.github/workflows/ci.yml`): type check + lint + test. Wait for CI to pass before merging:

```bash
# Check CI status
gh pr checks <pr-number> --watch

# Only merge when all checks pass
gh pr merge <pr-number> --merge --delete-branch
```

If CI fails, read the failure logs (`gh pr checks <pr-number>`), fix the issues, push again, and wait for green CI. Never merge a red PR.

## Cleanup

After merge, clean up the worktree and run `bun install` on main to get back to a clean state.

**Rules:**
- **Never merge with failing CI** — check, lint, AND test must all pass
- Never ship failing tests or lint errors
- Never `git add -A` or `git add .` — stage specific files
- Never force push
- Never use `--no-verify` to skip hooks
- One PR per story
