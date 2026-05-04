# Block 7 — Single-Shot Mode

**Cohort:** Deferred — needs harness rework. A/B'd against the fully-shipped post-Round-3 baseline.
**Includes:** TE-27.

---

## Load-bearing claim

*A meaningful fraction of stories are template instances (CRUD route, schema-add, copy change, button addition) where the full Architect → Builder → Reviewer choreography is overkill, and a Haiku classifier with a templates library can route them to one-shot generation reliably enough that classifier-false-positive cost (a CI failure that kicks back to full pipeline) is small relative to classifier-true-positive savings.*

This block is structurally different from every other. It doesn't make the pipeline cheaper; it *bypasses the pipeline* for stories that match a template. The pre-pipeline classifier (Haiku-class, near-zero per-call cost) routes some fraction of L-stories to a single-shot generator + CI gate. CI failure routes back to the regular pipeline, so no story is lost.

Bundling Block 7 with any other block would muddle value attribution — its savings are *net of* the post-everything-else pipeline. A standalone A/B against the original baseline would over-credit it because it would be "winning against a pipeline that's about to get cheaper anyway." A/B against the fully-shipped baseline.

## Value lever

**All buckets.** Single-shot is one model call + CI; it pays no cache-write tax, minimal cache reads, low output. The qualifying-rate is unmeasured — the A/B has to confirm both that enough stories qualify *and* that the one-shot output passes CI without falling back. Measure on the qualifying subset; do not blend with full-pipeline averages.

## Risk profile

- **System complexity:** High. New classifier infra, templates library, routing logic, CI-failure → full-pipeline fallback path. Templates library becomes a maintenance surface that bit-rots as the codebase migrates.
- **Info-loss risk:** Highest in the plan. Single-shot bypasses every quality gate the regular pipeline runs. Classifier false-positives ship architecturally-wrong code that may pass CI (CI tests what the spec's tests test, no more). Templates that drift from the codebase produce code that compiles but doesn't fit. The cheapest failure is "fail CI, kick to full pipeline" (acceptable); the expensive failure is "pass CI, fail review or fail in production" (silent).
- **Compounds with:** Net of all other blocks. Sequence last; A/B against the latest baseline, not the original.

## Dependencies

- **Upstream:** All of Blocks 1a, 1b, 2, 4, 6, and Round 3 (model flip).
  - Classifier needs Block 0 to measure its hit rate honestly.
  - Fallback path (CI fails → regular pipeline) needs the regular pipeline to already be cheap, otherwise classifier-false-positives are catastrophic.
  - Templates library needs Block 4's anchored docs to cite.
- **Downstream:** None.

## Shippability

Large. New classifier infra. New templates library. New routing. One-way once stories start landing via single-shot (templates become load-bearing). Measurable on Block 0's dashboard via `hyperidle.story.pattern` attribute.

---

## TE-27 — Single-shot mode for known patterns

A pre-pipeline classifier (Haiku-class, near-zero cost per call) checks if the story matches a known pattern: CRUD route for an existing schema, schema column add, copy change, button addition, etc. If yes, skip the full pipeline and route to a single-shot generator with the relevant template. CI is the only verification. If CI fails, the failure (not the whole story) kicks off the regular Architect persona.

**Validation rule:** harder than other blocks because the bet is whole-pipeline-skipped. A/B by routing the same story through both paths in parallel worktrees; ship rule is the same (≥10% spend reduction, no AC regression on the qualifying subset). Track classifier false-positive rate explicitly.

**Sanity gate before flip-to-ready:** single-shot triggers `/review` (not `/check-definition-of-done`) at the end as a cheap sanity gate before flipping draft → ready. CI alone is not the final gate — `/review` reads the diff with full context.

**Templates library refresh:** templates regenerated from a recent successful story per pattern, refreshed on retro. Stale templates are flagged when their last-refresh date exceeds N days.

---

## How it could make the rest worse

| Risk | Mitigation |
|---|---|
| Classifier false-positive routes a novel story to single-shot, fails CI | Classifier conservative by default; CI failure routes to full Architect; no story is lost, just possibly slower |
| CI passes but code is architecturally wrong (silent failure) | `/review` at end of single-shot flow as cheap sanity gate before flipping ready |
| Templates library bit-rots as codebase migrates | Templates regenerated from recent successful stories per pattern, refreshed on retro |
| Single-shot's savings claimed against the original baseline (over-credit) | A/B against the post-Round-3 baseline only. The block's number is "savings vs. cheap pipeline," not "savings vs. original" |

---

## Open questions / adversary attacks

- "Classifier false-positive rate on novel-but-template-looking stories will be higher than you think; CI catches *test* failures but a single-shot can produce a passing-tests-but-architecturally-wrong commit." → Classifier conservative; CI failure routes to full pipeline. Genuine concern: CI tests architectural correctness only insofar as the spec's tests do. Settled by single-shot triggering `/review` at the end.
- "Templates library bit-rots; the library says CRUD pattern is X but the codebase has migrated to Y." → Templates regenerated from a recent successful story per pattern, refreshed on retro.
- "30–50% qualifying rate is fantasy; in practice every story has some twist." → Deferred — exactly what Block 0's dashboard answers in the first 10 stories. Don't argue it; measure it.

## A/B mechanics

- **Branch:** `block-7-singleshot` off the post-Round-3 SHA.
- **Compared against:** post-Round-3 baseline.
- **Stories:** retrospectively-classified qualifying subset (≥3 per pattern). Do not blend with non-qualifying stories.
- **Primary signals:** total spend on qualifying stories, classifier false-positive rate, CI-failure → full-pipeline fallback rate, post-`/review` rejection rate.
- **Ship rule:** ≥10% spend reduction on the qualifying subset, AC pass rate ≥ baseline, classifier false-positive rate < (manually-set threshold from first 10 stories), no silent architectural failures detected in retro pass.

---

## Files touched (when un-deferred)

- `packages/pipeline/src/classifier.ts` — pre-pipeline classifier.
- `.claude/skills/single-shot/` — new skill bundle.
- `.claude/templates/<pattern>/` — templates library, one directory per pattern.
- `bin/pipeline` — routing: classifier first, then either single-shot or regular pipeline.
- `packages/pipeline/src/runner.ts` — emit `hyperidle.story.pattern`, `hyperidle.classifier.confidence`, `hyperidle.singleshot.fallback` attributes.
