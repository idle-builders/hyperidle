# AK7 Pipeline Retro — "Selection seam: deterministic owner assignment"

Run date: 2026-06-22. Fresh-context observation pass (Phase 6). Observe, don't fix.

## Cost signals

Concept-introducing backend seam. Effort distribution:
- Phase 1 (concept→architecture): `/design` correctly skipped (no UI surface). Architecture critique scored 7/10 APPROVED round 1.
- Phase 2 (architecture critique): **1 round**. R1 7/10 APPROVED with 1 CRITICAL + 4 WARNINGs; designer folded all findings into the plan in one revision before build. No R2 needed.
- Phase 3 (TDD → green): single green-phase blocker (protected-test-contract misread); required one extra review round to resolve.
- Phase 4 (code review): **2 rounds**. R1 NOT DONE (dead-code/call-site audit: seam unwired at production surface); R2 DONE after wiring `selectOwner` + emitting `work_selection_requested` through bet-decomposition path. ~24 files across packages/shared, packages/strategy-minimal, packages/fabric, packages/server.
- Phase 5 (docs): as-built. All ACs proven via live flow after fix — no stubs.

## What the architecture critique caught early (pre-code)

**1 CRITICAL + 4 WARNINGs folded before build.**

- **CRITICAL — `routine_delegate` no-regression.** Critique's fact-audit identified the need for a regression-trap that actually exercises the production code path. The critique caught that the submitted `[A, B, A]` golden asserted against an **inline stub**, not the production `selectOwner`, making the regression-trap vacuous — a suite-passing test that does not catch the regression it is named after.
- **Vacuous ESLint guard.** The round-robin guard was written to enforce deterministic selection, but was exempted for the one file it was meant to catch. Critique flagged the exemption making the rule fire on nothing.
- 3 additional WARNINGs resolved in the same designer revision.

Catching these before `/write-tests` is the value of the producer/evaluator split — both were contract/boundary errors invisible to a passing test suite.

## What the two-review model caught that tests didn't (Phase 4)

**CRITICAL — production seam unwired (dead-code audit).** The green suite passed. The code review's call-site/dead-code audit found:

1. `selectOwner` was exported and unit-tested but had **zero production callers** — it was not invoked anywhere in the live request path.
2. `work_selection_requested` was defined in the event schema but **emitted nowhere** — no live code path fired the event.
3. Consequence: AC1 (event emitted on selection), AC2 (owner assigned on task creation), and AC4 (bet-decomposition routes through seam) were **unmet at the live surface** despite a fully green test suite.

Fix required wiring `selectOwner` into the bet-decomposition path and emitting `work_selection_requested` from the correct call site — work the builder had deferred as "AK7b", believing it would touch the AK3 protected integration tests.

## Process friction

**Green-phase BLOCKER: protected-test contract misread.**

The builder deferred wiring bet-decomposition through the seam, believing the protected AK3 integration tests could not be touched. The actual contract is:

> **Assertions frozen, setup may evolve.**

Registering a Fabric-equivalent strategy in the AK3 fixture `beforeEach` is legitimate — the assertions remain byte-identical, only the fixture setup changes to make the seam visible. The misread caused:
- One extra review round (R1 NOT DONE → R2 DONE).
- One extra builder session to wire the deferred call sites.

Root cause: the phrase "protected tests stay green/unmodified" was interpreted as "never touch the file" rather than "freeze the oracle (assertions), setup may change to accommodate architecture evolution."

## Process signals (candidates for /compound)

1. **Protected-test contract must be stated precisely in builder guidance.** "Protected tests stay green" = assertions/oracle bytes frozen; fixture `beforeEach` setup may change to register new seam participants. Without this precision, builders over-restrict and defer required wiring.
2. **AC-completeness audits must verify call sites are wired, not just that helpers exist and pass unit tests.** Helpers with 100% unit-test coverage and zero production callers satisfy no AC. Phase-4 code review should include an explicit call-site/dead-code pass for every new export named in an AC.
3. **Critique's fact-audit is the right place to catch stub-based regression traps.** A `[A, B, A]` golden asserting against an inline stub (not the production function) makes the test vacuously green. Critique should check that regression-trap tests import and exercise the production symbol, not a local substitute.
