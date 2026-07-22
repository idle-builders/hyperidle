# AU23 — Restore end-to-end product confidence after runtime simplification

## Work package

**Work package.** As a maintainer of HyperIdle, I want every browser and desktop end-to-end journey revalidated against the completed AU20 + AU21 application, so that a green release suite once again proves the product users actually run. Every failure or unrun test must be investigated individually and classified with evidence as a real product regression, an intentional product move, a stale test or mock, or an end-to-end harness defect. Completion means the current web and desktop products work, their tests describe the current product honestly, and no failure is hidden by deletion, skipping, blanket rebaselining, or weakened assertions.

**Why this matters.** AU20 and AU21 change broad Service APIs and runtime boundaries. The existing end-to-end signal now contains a mixture of genuine breakage, retired routes, moved interactions, stale assumptions, and harness contamination. Without restoring that signal, neither the runtime migration nor subsequent complexity destruction can be trusted: a passing unit suite can coexist with a broken clean boot, browser journey, or desktop shell.

**Type.** application

**What exists today.** HyperIdle has Playwright browser suites, real-backend journeys, desktop packaging and smoke paths, unit/component tests, service integration tests, and real-harness integration tests. Current exploratory evidence indicates both real application failures and unreliable test infrastructure, including clean-database boot, backend-outage behavior, desktop development wiring, obsolete routes and selectors, lane contamination, and missing failure artifacts. This evidence is input to investigation, not an implementation to preserve.

**What's genuinely missing.** There is no exhaustive, reviewed disposition of the post-AU20/AU21 end-to-end inventory and no deterministic release proof that exercises the current browser application, real backend, and desktop application without silently leaving tests unrun.

**Depends on.**
- **AU20** — its final Service API migration is the product baseline under test.
- **AU21** — its final runtime boundary is the product baseline under test.

**Complexity.** L

**Engineering tier.** mvp

**Pre-build gates.**
- **Refinement:** Required — planner must define the authoritative journey inventory, classification evidence, and release boundary before tests change.
- **Design:** Light — existing journeys may have intentionally moved, so current interaction contracts need visual confirmation; this is repair, not redesign.

**Human review gates.** Yes — requirements, concept, and final evidence gates remain mandatory because changing broad end-to-end expectations can conceal product loss.

**Plan calls.** Begin with a complete test-and-journey ledger on the combined AU20 + AU21 baseline. Investigate each failure independently against current product documentation and rendered behavior. Establish deterministic, isolated browser, real-backend, and desktop lanes with useful diagnostics. Write or correct executable proof before repairing product code. Keep product fixes, harness fixes, and evidence-backed stale-test migrations reviewable and separately committed where practical.

**Contracts / constraints.**
- Assume every failure may be caused by AU20/AU21 until evidence proves otherwise.
- Every failed, skipped, timed-out, or unrun test receives an explicit evidence-backed disposition; aggregate counts alone are insufficient.
- Intentional moves require a newer authoritative product contract plus proof of the replacement journey.
- Tests are not deleted, skipped, weakened, or broadly rebaselined to manufacture green.
- Mocked browser tests, real-backend tests, real-harness tests, and desktop tests remain distinct lanes and cannot satisfy one another's proof obligations.
- Clean-environment boot and release behavior are first-class product journeys.
- User-visible output is inspected in the real browser or desktop application; source inspection alone is not completion proof.
- No new product scope, redesign, enterprise hardening, or speculative compatibility layer is introduced.

**Out of scope.**
- New features unrelated to restoring a documented current journey.
- AU22 internal complexity reduction.
- Reopening AU20/AU21 architecture without a demonstrated product defect.
- Treating unit or mocked component coverage as a substitute for end-to-end proof.

**Effort.** L (~8-12d)

## Acceptance criteria

- A complete ledger accounts for every browser and desktop end-to-end test on the combined AU20 + AU21 baseline, including failures, skips, timeouts, and tests not reached; each non-pass has one reviewed disposition with reproducible evidence and an owner action.
- Every intentional product move has an authoritative current contract and a passing replacement journey; every stale test or mock is updated to that contract without weakening the capability asserted.
- Every confirmed product regression is repaired and proven through a failing-then-passing automated journey, including clean-database startup and honest backend-unavailable behavior where affected.
- Browser lanes are deterministic and isolated: mocked, real-backend, and real-harness coverage cannot contaminate one another; wrong-server reuse, unmatched network requests, global timeout exhaustion, and missing diagnostic artifacts fail clearly rather than leaving ambiguous or unrun results.
- The desktop application passes clean development and packaged smoke journeys with its real preload, renderer, and backend wiring, and the rendered result is visually inspected.
- Current user journeys meet the repository's accessibility and visual requirements on supported themes and viewports, with visual evidence for repaired states.
- `npm run check`, `npm run lint`, unit/component tests, service integration tests, real-harness integration tests, full Playwright E2E lanes, and desktop build/smoke validation pass with exact executed/pass/skip counts and no unexplained skipped, timed-out, or unrun test.

## Validation scenarios

- Given the combined AU20 + AU21 baseline, when the complete E2E inventory runs in bounded isolated shards, then every declared test produces a pass or an evidence-backed ledger disposition and none disappear behind a global timeout.
- Given a journey whose route, interaction, or ownership intentionally changed, when its old assertion is reviewed, then the newer authoritative contract identifies the replacement and a passing test proves equivalent required user value.
- Given a confirmed browser, backend, accessibility, or desktop regression, when the application starts from a clean environment and the repaired journey executes, then the user-visible output and underlying behavior both succeed with retained failure diagnostics.
- Given the release candidate, when all static, unit, integration, browser, real-harness, and desktop lanes run from clean isolated environments, then exact counts reconcile to the inventory and the reviewed ledger contains no unresolved or unexplained result.
