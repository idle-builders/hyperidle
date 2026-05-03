# Validation Before Implementation

**No code is written until the definition of done and validation setup exist.** This is non-negotiable. For every work package or task:

1. Extract the acceptance criteria from the relevant track file in `docs/work-packages/`.
2. Define the verification method for each criterion (automated test, Playwright E2E, eval, screenshot, inspection).
3. Write the failing tests that prove the criteria (red phase).
4. Only then begin implementation.

If you cannot define how to verify a criterion, clarify the requirement before writing code. Unverifiable criteria are incomplete specifications.

## Validation gates

Before any work is complete: `bun run check` (zero type errors) + `bun run lint` (zero lint errors) + `bun run test` (all green). Target 100% test coverage of new code including Playwright E2E tests for all user-facing features. Every change must be independently verifiable by agents — if it can't be proven with a test, it's not done.

## Proof & Definition of Done

You can only say that something is done if you looked at the actual output of your change. That means looking at the rendered and painted output from the browser and visual verifying, through images or visual testing. Or looking at the produced data from an API or interface via a test or env that checks input → output.

## Capture Lore

When you make a non-obvious decision, encounter a cross-cutting constraint, or discover a gotcha that would surprise the next agent — capture it as a `@lore` comment in the code. Use `/lore` to scan and index these. Every workaround, every "why not the obvious approach", every platform-specific quirk should be documented where it lives.
