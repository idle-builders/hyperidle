# AH5 Rework Retro

## Headline Event

Post-ship architecture fail caught by the founder. AH5 shipped a GitHub Actions workflow (`ah5-smoke.yml`) running the live-LLM e2e smoke lane. Project rule: e2e/expensive/live tests are LOCAL ONLY — never in GitHub Actions; `ci.yml` stays fast and key-free.

## Remediation Path

Revert PR #301 → re-architecture (score 9/10) → rebuild → Phase-4 code review DONE. The implementation was sound and fully preserved — only the test venue (GitHub Actions → local `smoke:ah5` orchestrator) was wrong.

## Root Cause

Spec AC4 text said "runs in CI" — ambiguous. Read as GitHub Actions by both the original architect and the Phase-2 critic. Neither original architecture review nor either Phase-2 review caught it. The local verification lane is also "CI" in a broad sense (it runs in `npm run verify`), but the project hard rule means "local only" whenever live/expensive tests are involved.

## Recurring Pattern (2nd+ Instance)

AJ1 (#287) was also reverted for putting expensive visual-regression testing in GitHub CI. Pattern: **expensive/e2e/live/visual test in GitHub CI = architecture fail.**

## Process-Improvement Candidates for `/compound`

1. **Guard/lint or review-lens**: flag any new `.github/workflows/*.yml` that runs Playwright, e2e, live models, or smoke lanes.
2. **Spec-authoring rule**: "runs in CI" must be disambiguated; expensive/live tests must say "local verification lane" not "CI."

## What Worked

- Revert-of-revert preserved the sound implementation without re-writing it.
- Rework critique verified the fix was real, not just relocated — checked that `ci.yml` was byte-identical to pre-AH5 `main` and `OPENROUTER_API_KEY` was absent from all workflow files.
- Founder-amendment was recorded durably in two places: `TRACK-AH.md §AH5` + `@lore` comment in `ah5-smoke-local.ts`.
- Venue split by key-need: key-free gates (selection unit tests, gating integration test, no-mock guard) stay in `npm run verify`; key-required live lane (`smoke:ah5` orchestrator + probe + Playwright) is local-only, manually invoked, fails closed on absent key.
