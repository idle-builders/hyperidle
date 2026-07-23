# AU23 — Rebuild end-to-end tests against the real application

## Work package

**Work package.** As a maintainer, I want the Playwright suite to exercise HyperIdle through the real browser, server, API, and database, so that a passing end-to-end test proves the shipped application works. The existing journeys and product intentions remain the coverage contract, but internal HTTP responses are no longer manufactured inside Playwright. Deterministic agent behavior remains available through the harness adapter, where it represents a controlled harness implementation rather than a mocked application route. When this ships, every retained Playwright identity runs against isolated real application state and failures identify real product or test-contract defects.

**Why this matters.** Maintainers currently cannot trust a green Playwright run as evidence that the UI and backend work together: 81 of 89 specs intercept requests, including HyperIdle's own API. That can hide broken endpoints, stale response shapes, and frontend/backend integration regressions. Rebuilding this proof boundary makes release decisions trustworthy while preserving the user journeys the suite was intended to protect.

**Type.** infra

**What exists today.** HyperIdle has 89 Playwright spec files covering navigation, work, conversations, knowledge, settings, agents, and harness-backed flows. The repository also has a real Hono API, migrated PGlite test substrate, Playwright configurations, and a deterministic harness adapter suitable for controlled agent behavior. However, the committed suite contains 616 `page.route()` interceptions across 82 files, 613 `fulfill()` responses, and 81 route-intercepting specs, so most tests exercise browser-side fixture responses instead of the real application boundary.

**What's genuinely missing.** The suite lacks one supported path that starts the real application stack, creates isolated state through real application/data boundaries, and runs every retained journey without intercepting HyperIdle's internal API. It also lacks a mechanical guard preventing internal-route mocks from returning and a trustworthy failure inventory separating product regressions from stale tests during migration.

**Depends on.**
- **AU20** — AU23 must target the reduced, final Service APIs rather than rebuild tests around endpoints still moving during AU20.
- **AU21** — AU23 must exercise the final core/agent boundary and event flow rather than encode the transitional coupling AU21 removes.

**Complexity.** L

**Engineering tier.** production

**Pre-build gates.**
- **Refinement:** Required — run /refine first because this reshapes the repository's definition of an end-to-end proof.
- **Design:** Not required — test infrastructure and behavior preservation; no new product UI.

**Human review gates.** Yes — the real-proof boundary, preserved journey inventory, and final trustworthy suite require explicit requirement, architecture, and final approval.

**Plan calls.** Skip /design. Architecture must first establish the real application test substrate and deterministic-harness boundary, then migrate the suite in small independently reviewed batches. It must preserve identity-level journey intent, classify every observed failure before changing its test or product behavior, and protect the Service census inherited from AU20.

**Contracts / constraints.**
- Playwright may not intercept or fulfill any HyperIdle-owned `/api/**` request.
- Playwright exercises the real HyperIdle server, API handlers, migrated database, and frontend.
- Deterministic behavior is permitted only behind the harness adapter; it may not replace application HTTP routes.
- Existing journey intent and coverage identities are preserved unless an independently reviewed finding proves a test obsolete or invalid.
- Every failure is classified with evidence as product broken, test broken, external prerequisite, or test infrastructure before its correction is chosen.
- Test data is isolated and repeatable; tests do not depend on execution order or leaked state.
- AU20's Service surface baseline remains unchanged: 231 methods and 181 types.

**Out of scope.**
- Adding product features solely to satisfy an obsolete test.
- Re-expanding Service APIs simplified by AU20.
- Exercising real paid model providers in every Playwright run; the deterministic harness adapter is the normal E2E agent boundary.
- Replacing focused service integration or real-harness release tests with Playwright.

**Effort.** L (~5-8d)

## Acceptance criteria

- Every retained Playwright journey runs through the real frontend, HyperIdle API, and migrated database, with no HyperIdle-owned API response intercepted or fulfilled by the test.
- The suite retains an identity-level mapping from each pre-migration journey to its migrated proof or an independently reviewed deletion rationale.
- Agent-driven journeys use the deterministic harness adapter while still exercising real application orchestration, persistence, API, and UI behavior.
- Every pre-migration failure has a terminal evidence-backed classification—product broken, test broken, external prerequisite, or test infrastructure—and no failure remains unclassified.
- Product-broken findings are corrected in product code; test-broken findings are corrected in tests without weakening the user-visible journey they protect.
- Test state is isolated and reproducible across individual, shuffled, and repeated execution.
- A mechanical static guard rejects any reintroduction of Playwright interception or fulfillment for HyperIdle-owned API routes.
- The complete Playwright suite passes against the real application stack, alongside check, lint, unit, component, service-integration, and Service-surface census verification.

## Validation scenarios

- Given the complete migrated Playwright suite, when it runs from a clean database against the real application stack, then every retained identity reaches a terminal passing result and no HyperIdle API request is intercepted by Playwright.
- Given an agent-driven journey, when the deterministic harness responds, then the request still traverses the real orchestration, persistence, API, and rendered UI boundaries.
- Given the suite is run by file, in shuffled order, and repeatedly, when execution completes, then results are stable and no test observes another test's data.
- Given a spec attempts to fulfill a HyperIdle `/api/**` request, when repository validation runs, then the static guard rejects the change.
