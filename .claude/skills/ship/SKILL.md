---
name: ship
description: "Commit and push changes. Create PR if on a feature branch."
argument-hint: "[story-id or branch description]"
user-invocable: true
min_tool_calls: 5
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

## CI gate (MUST PASS — story stops at green PR)

After pushing, CI runs automatically (`.github/workflows/ci.yml`): type check + lint + test. Wait for CI to pass:

```bash
# Check CI status
gh pr checks <pr-number> --watch
```

If CI fails, read the failure logs (`gh pr checks <pr-number>`), fix the issues, push again, and wait for green CI.

**Do NOT merge.** The /ship skill stops at "green PR open." Merging is a human decision (the A/B harness depends on PRs staying open and re-runnable; merging mid-experiment destroys the comparison). When the human is ready to merge, they run `gh pr merge` themselves.

**Rules:**
- **Story is "shipped" when CI is green and the PR is open** — not when merged
- **Never merge** — leave the PR open, the human decides when to merge
- Never ship failing tests or lint errors
- Never `git add -A` or `git add .` — stage specific files
- Never force push
- Never use `--no-verify` to skip hooks
- One PR per story

## Target

$ARGUMENTS
