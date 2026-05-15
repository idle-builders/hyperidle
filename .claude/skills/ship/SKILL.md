---
name: ship
description: "Commit and push changes. Create PR if on a feature branch."
argument-hint: "[workpackage-id or branch description]"
user-invocable: true
min_tool_calls: 5
---

# Ship

**Why:** Clean main branch ensures the next change starts from a reliable basis. Clean git history makes it possible to understand what changed and why. The attestation system lets CI validate in seconds instead of re-running the full verify suite.

## Steps

### 1. Pre-flight validation (MANDATORY — do not skip)

Run the full verification gate. If it fails, stop and fix before proceeding:

```bash
bun run verify
```

This is non-negotiable. Do not ship with failures. Do not use `--no-verify`. Do not rationalize "pre-existing failures" — if it's red, fix it or document why it's blocked and stop.

On green, verify automatically writes `.verify-attestation.json` — an HMAC-signed attestation proving this machine ran verify against the current HEAD. The signing key lives at `~/.config/hyperidle/verify-secret` (auto-generated on first green run, never committed to the repo).

If the working tree is dirty when verify runs, the attestation is marked `dirty: true` and CI will reject it. **Commit all code changes before running verify.**

### 2. Stage and commit

Stage files intentionally — never `git add -A` or `git add .`.

Commit with `<type>(<scope>): <imperative description>` referencing the workpackage ID. If changes span multiple logical units, make multiple atomic commits.

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`. Scopes: `db`, `server`, `web`, `fabric`, `shared`, or omit.

### 3. Run verify (if not already green for this commit)

If you committed new code after the last verify run, re-run:

```bash
bun run verify
```

The attestation must match HEAD. If code changed since the last green run, the attestation's SHA won't match and CI will reject it.

### 4. Commit the attestation

```bash
git add .verify-attestation.json
git commit -m "verify: attestation"
```

This must be the **last commit** before pushing. CI checks that no source files changed between the attested SHA and HEAD — only `.verify-attestation.json` may differ.

### 5. Branch and push

If not on a feature branch, create one: `feat/<workpackage-id>-<description>`.

```bash
git push -u origin HEAD
```

### 6. Create PR

```bash
gh pr create --title "<type>(<scope>): <description>" \
  --body "## Summary\n\n<what changed and why>\n\n## Verification\n\nbun run verify — all green (attestation attached)"
```

Main is protected — commits only land via pull request.

### 7. CI attestation check

CI runs `check-attestation.ts` which validates:
- **HMAC signature** — the attestation was signed with the shared secret
- **Full coverage** — all tools ran (not `--quick` or `--only=...`)
- **Clean tree** — no uncommitted changes when verify ran
- **No post-verify changes** — no source files changed after the attested SHA

CI completes in ~30 seconds (checkout + attestation check) instead of ~10 minutes (full verify).

If CI fails, read the error:
- `HMAC signature invalid` → secret mismatch; re-run `gh secret set VERIFY_SECRET < ~/.config/hyperidle/verify-secret`
- `partial verify` → re-run `bun run verify` without `--quick` or `--only`
- `working tree dirty` → commit everything, then re-run verify
- `source files changed after verify` → code was committed after verify; re-run verify and re-commit attestation

### 8. Merge decision

**Do NOT merge automatically.** The `/ship` skill stops at "green PR open." Merging is a human decision — the A/B harness depends on PRs staying open and re-runnable.

When the human is ready: `gh pr merge --squash`.

## Quick reference

The full ship flow in one block:

```bash
# 1. Commit your code
git add <files>
git commit -m "feat(web): add onboarding flow"

# 2. Verify (writes attestation on green)
bun run verify

# 3. Commit attestation + push
git add .verify-attestation.json
git commit -m "verify: attestation"
git push -u origin HEAD

# 4. Open PR
gh pr create --title "feat(web): add onboarding flow" --body "..."
```

## Rules

- **Never ship failing verify** — fix first
- **Never `git add -A`** — stage specific files
- **Never force push** — history is shared
- **Never `--no-verify`** — hooks exist for a reason
- **Never merge** — leave the PR for the human
- **One PR per workpackage** in pipeline mode
- **Attestation must be the last commit** — no code after it

## GitHub secret setup (one-time)

The HMAC secret must exist both locally and in GitHub Actions:

```bash
# Local key is auto-generated on first `bun run verify` green run.
# Add it to GitHub:
gh secret set VERIFY_SECRET < ~/.config/hyperidle/verify-secret
```

## Target

$ARGUMENTS
