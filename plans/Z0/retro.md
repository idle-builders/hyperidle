# Z0 Retro — Documentation Site (VitePress)

## Cost Signals

| Metric | Value |
|---|---|
| Estimated | 2h (S-complexity) |
| Actual productive | ~2h |
| Review overhead | ~1.5h (2 cycles) |
| Total | ~3.5h |
| Overhead ratio | 75% |
| Review cycles | 2 |
| Lines of code | ~89 |
| Files created | 5 |
| Files modified | 2 |

## Process Observations

### What worked

1. **Architecture plan was thorough and accurate.** Section 6 (tooling isolation) systematically walked through every tool and all claims held up.
2. **Critique feedback was acted on immediately.** Builder removed redundant `:root` CSS block per architecture-critique Suggestion 2.
3. **No scope creep.** Implementation matched the plan exactly.
4. **No tests needed — correctly identified.** All 8 ACs are static/build properties, not runtime behavior.

### What didn't work

1. **File staging assumption.** Builder used `git commit -a` which only stages tracked files. New `.vitepress/` directory files were untracked and missed. This caused a mandatory second review cycle.
2. **Verification methods underspecified for visual ACs.** Plan said "visual inspection" without concrete autonomous steps.
3. **AC count mismatch.** Plan said "4 content pages" but there are 5 markdown files (index + 4 content docs).

### What was surprising

1. Builder proactively applied architecture-critique CSS feedback without being told, adding a `@lore` comment.
2. The `npx vitepress --version` command created a spurious `.vitepress/cache/` at repo root.

## Improvement Candidates

1. **Git staging guard:** Add pre-commit check for untracked files before shipping. `/ship` should validate `git status --porcelain | grep '^??'` is empty.
2. **Verification method specification:** `/architecture` should require concrete verification steps for visual/interactive ACs (not just "visual inspection").
3. **Asset inventory in architecture:** Enumerate file counts explicitly to avoid AC count mismatches.
4. **Track review-cycle counts:** Feed into `/compound` for pattern detection.

## Key Takeaway

The git staging issue is a systemic risk for workpackages adding new directories. Should be caught at build-time (pre-commit), not review-time.
