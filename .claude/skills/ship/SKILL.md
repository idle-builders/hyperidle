---
name: ship
description: "Verify, attest, push, and wait for CI green. The single gate between code and a merge-ready PR."
argument-hint: "[workpackage-id or branch description]"
user-invocable: true
min_tool_calls: 5
---

# Ship

**Why:** Clean main branch ensures the next change starts from a reliable basis. Clean git history makes it possible to understand what changed and why. The attestation system lets CI validate in seconds instead of re-running the full verify suite.

**Ship is not done until CI is green.** Local verify is necessary but not sufficient — the PR check must pass.

## Steps

### 0. Code-review gate (MANDATORY — do not skip)

Verify that code review is complete before shipping. Check that the reviewer emitted "Verdict: DONE" for this workpackage. If no review verdict exists, stop — do not proceed to verify/ship. Ship without code review is a process violation, not an efficiency gain.

### 1. Stage and commit all code changes

Stage files intentionally — never `git add -A` or `git add .`.

Commit with `<type>(<scope>): <imperative description>` referencing the workpackage ID. If changes span multiple logical units, make multiple atomic commits.

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`. Scopes: `db`, `server`, `web`, `fabric`, `shared`, or omit.

### 2. Merge origin/main (MANDATORY — do not skip)

Merge main before verify so the attestation covers the merged tree. This prevents attestation conflicts when main has moved since the branch was created.

```bash
git fetch origin main
git merge origin/main --no-edit
```

If there are merge conflicts, resolve them. If the only conflict is `.verify-attestation.json`, take either side — it will be regenerated in the next step.

After resolving conflicts, commit the merge. The working tree must be **completely clean** before proceeding.

### 3. Pre-flight validation (MANDATORY — do not skip)

```bash
npm run verify
```

This is non-negotiable. Do not ship with failures. Do not use `--no-verify`. Do not rationalize "pre-existing failures" — if it's red, fix it or document why it's blocked and stop.

On green, verify automatically writes `.verify-attestation.json` — an HMAC-signed attestation proving this machine ran verify against the current HEAD. The signing key lives at `~/.config/hyperidle/verify-secret` (auto-generated on first green run, never committed to the repo).

If the working tree is dirty when verify runs, the attestation is marked `dirty: true` and CI will reject it. **The working tree must be clean when verify runs.**

### 4. Commit the attestation

```bash
git add .verify-attestation.json
git commit -m "verify: attestation"
```

This must be the **last commit** before pushing. CI checks that no source files changed between the attested SHA and HEAD — only `.verify-attestation.json` may differ.

### 5. Push

```bash
git push -u origin HEAD
```

### 6. Create or update PR

If no PR exists yet:

```bash
gh pr create --title "<type>(<scope>): <description>" \
  --body "## Summary\n\n<what changed and why>\n\n## Verification\n\nnpm run verify — all green (attestation attached)"
```

The PR `## Summary` is for the human — lead with **what was built and what the human can now do/see**, then the key surfaces touched. Not a phase log. See "Outcome-first summary" below.

If a draft PR already exists (pipeline mode), flip it ready:

```bash
gh pr ready
```

Main is protected — commits only land via pull request.

### 7. Wait for CI green (MANDATORY — do not skip)

Poll until CI reports a result. **Ship is not complete until CI is green.**

```bash
# Get PR number for this branch
PR_NUMBER=$(gh pr view --json number -q '.number')

# Poll CI status (max 10 attempts, 30s apart = 5 minutes)
for i in $(seq 1 10); do
  sleep 30
  STATUS=$(gh pr checks "$PR_NUMBER" 2>&1)
  if echo "$STATUS" | grep -q "pass"; then
    echo "CI green"
    break
  elif echo "$STATUS" | grep -q "fail"; then
    echo "CI red — read the failure log and fix"
    break
  fi
  echo "Attempt $i: CI still pending..."
done
```

**If CI is red:**
1. Pull the failure log: `gh run view <run-id> --log-failed`
2. Read the error message — common causes:
   - `HMAC signature invalid` → secret mismatch; re-run `gh secret set VERIFY_SECRET < ~/.config/hyperidle/verify-secret`
   - `partial verify` → re-run `npm run verify` without `--quick` or `--only`
   - `working tree dirty` → commit everything, merge main, then re-run verify
   - `source files changed after verify` → code was committed after verify; re-run verify and re-commit attestation
3. Fix the issue, then re-run from step 2 (merge main, verify, attest, push).
4. Max 3 push attempts. After 3, mark `blocked` with reason `ci-red-after-3-fixes`.

**Ship is only complete when `gh pr checks` returns green.** Do not declare success before this.

### 7a. Ship-summary check (interactive mode only)

This is the pipeline's **ship-summary check** (see `pipeline/SKILL.md` "Ship-summary check" in the Ship dispatch). It is a check, not a recap: it passes only when every AC is *evidenced* (cite the Phase-4 `/review` AC table, not Builder's say-so) and the summary says something CI-green does not. A summary that only echoes "CI green," or lists an AC it cannot evidence, FAILS — surface the gap to the founder instead of emitting it.

Read `PIPELINE_INTERACTIVE` per **the canonical rule** (defined in `pipeline/SKILL.md` "## Run modes" and `concept/SKILL.md` "## Recap gate" — interactive iff value is exactly the literal string `1`; everything else, including unset/empty/`0`/`true`, is autonomous). Do not restate the truthiness check here — reference the canonical rule.

**If not interactive:** skip this step entirely. Proceed to step 8 unchanged — no summary, no founder prompt. In A/B mode `PIPELINE_INTERACTIVE` is absent, so this step is skipped; step 8's A/B branch is byte-identical to pre-AJ2 behavior.

**If interactive (`PIPELINE_INTERACTIVE` == `1`):** after CI-green (step 7) and before the human merges (step 8), emit the ship summary as readable chat prose. The summary must contain five beats:

1. **What shipped** — one-paragraph plain-English description of the change (sourced from the PR title/body + workpackage outcome).
2. **Which ACs were covered** — the reviewer's AC table result (from Phase 4 `/review`'s AC-completeness audit).
3. **Which files changed** — the changed-file list (from `git diff --stat` against `origin/main`).
4. **Retro cost signal** — the cost signal the retro emitted (from `plans/<id>/retro.md`, Phase 6 retro).
5. **Residual risk** — anything the founder should weigh before merging (from the retro's risk notes + reviewer findings that were accepted/deferred).

**No-fabricate fallback rule — one line:** a beat with no source says "not recorded," never a guess.
- Beat 4 (retro cost signal): if `retro.md` carries no explicit cost signal → **"cost signal: not recorded"**.
- Beat 5 (residual risk): if neither retro nor accepted/deferred reviewer findings name a risk → **"residual risk: none recorded"**.
- Beats 1–3: these source from the PR body, reviewer AC table, and `git diff --stat`, which always exist by ship time; if the AC table is somehow missing → **"AC coverage: not available — see PR review"**.

Emit as chat prose. **No `AskUserQuestion`** — the human-merge decision (step 8) is already the gate. The summary is briefing for that decision, not a second gate. It is distinct from raw CI pass/fail: CI-green says "the gates passed"; the summary says "here is what passed and what it means." A summary that merely echoes "CI green" has not satisfied this step.

**Frame it outcome-first.** Lead with the product — what the human can now do or see — in plain words, and keep it skimmable. Beat 1 is the user-visible outcome (name the feature, not the workpackage ID), not a phase log. Do not headline pipeline mechanics — phase numbers, persona names, review-round counts, critique scores, attestation/HMAC internals, verify tool lists, CI-polling. A process detail only earns a line if it materially affects the human (e.g. a deferred follow-up they must track).

### 8. Merge decision

**Do NOT merge automatically.** The `/ship` skill stops at "CI-green PR open." Merging is a human decision — the A/B harness depends on PRs staying open and re-runnable. In interactive mode, the founder reads the ship summary (step 7a) before deciding; the merge stance is otherwise unchanged.

When the human is ready: `gh pr merge --squash`.

## Quick reference

The full ship flow in one block:

```bash
# 1. Commit your code
git add <files>
git commit -m "feat(web): add onboarding flow"

# 2. Merge main (prevents attestation conflicts)
git fetch origin main && git merge origin/main --no-edit

# 3. Verify (writes attestation on green)
npm run verify

# 4. Commit attestation + push
git add .verify-attestation.json
git commit -m "verify: attestation"
git push -u origin HEAD

# 5. Open PR (or gh pr ready if draft exists)
gh pr create --title "feat(web): add onboarding flow" --body "..."

# 6. Wait for CI green
gh pr checks <number>  # poll until green
```

## Rules

- **Never ship failing verify** — fix first
- **Never skip the merge-main step** — attestation conflicts are the #1 CI failure cause
- **Never declare ship complete before CI is green** — local green is not enough
- **Never `git add -A`** — stage specific files
- **Never force push** — history is shared
- **Never `--no-verify`** — hooks exist for a reason
- **Never merge** — leave the PR for the human; the ship-summary check (interactive mode) holds the change accountable to the human, it does not merge for them
- **One PR per workpackage** in pipeline mode
- **Attestation must be the last commit** — no code after it

## GitHub secret setup (one-time)

The HMAC secret must exist both locally and in GitHub Actions:

```bash
# Local key is auto-generated on first `npm run verify` green run.
# Add it to GitHub:
gh secret set VERIFY_SECRET < ~/.config/hyperidle/verify-secret
```

## Releasing (backend + desktop, unified)

Releases go through the **unified pipeline** — one version bump, one PR, both
surfaces shipped on merge. The full design is in `docs/deployment/releases.md`.
The desktop DMG is built+notarized **locally**; publish/mirror/Homebrew and the
backend cluster deploy all happen in **CI on merge**. `release.sh` no longer
pushes or publishes — it **stages**.

### Prerequisites (local)

- Apple credentials in `.env`: `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`
- Developer ID Application certificate in the keychain
- `gh` CLI authenticated with write access to `ambrovia/hyperidle`

### Steps

1. **Stage locally** (builds + signs + notarizes the DMG, uploads it to a hidden
   draft release, bumps root+desktop+chart versions, writes `release-manifest.json`):

```bash
./packages/desktop/scripts/release.sh <version>   # e.g. 0.5.0
```

2. **Commit + open a PR** with what the script changed:

```bash
git add -A && git commit -m "release: HyperIdle v<version>"
gh pr create --base main --fill
```

3. **Merge once green.** The PR's **Release Guard** check verifies the staged DMG
   (asset present + sha256 matches the manifest), so a version bump can't merge
   half-built. On merge, CD runs automatically: `deploy.yml` ships the backend to
   the cluster; `release.yml` publishes the draft release → `desktop-release.yml`
   mirrors the DMG to `hyperidle-releases` and updates Homebrew.

Do **not** run `release.sh` after a release is merged — it stages, it does not
publish. Publishing is CI's job, triggered by the version-bump merge.

### Local-only test build (no signing)

```bash
./packages/desktop/scripts/build-local.sh
open packages/desktop/release/mac-arm64/HyperIdle.app
```

### Local-only test build (no signing)

If the user wants to test the build before a signed release:

```bash
./packages/desktop/scripts/build-local.sh
open packages/desktop/release/mac-arm64/HyperIdle.app
```

This produces an unsigned `.app` for local testing. No Apple credentials needed.

## Target

$ARGUMENTS
