# Architecture Critique: Z8

ARCHITECTURE-SCORE: 8/10  rounds=1  score-line: SA:9 LI:10 AC:N/A DM:N/A N:9 MD:8 FMC:7 S:7 V:8

## Context

Z8 is an audit workpackage that produces a document, not code. Several scoring dimensions (Layer Integrity, API Contracts, Data Model Alignment) are structurally N/A or trivially satisfied because no code, routes, schemas, or cross-layer calls are planned. I score those as 10 (no violations possible) and weight the critique toward the dimensions that actually matter for this workpackage: Spec Alignment, Naming, Module Depth (document structure), Failure-Mode Coverage (audit methodology gaps), Simplicity, and Verifiability.

The spec itself says "Skip /design, skip /architecture" -- an architecture plan was produced anyway. That is fine; it provides the builder with a clear methodology. I critique what exists.

---

### CRITICAL

None.

### WARNING

- [plan section 7, pre-audit inventory] The plan claims "13 routes + 2 legacy redirects + 2 dev-only" in section 2.1 but the router has 19 `path:` entries. The plan should enumerate all 19 so the builder can cross-check completeness. The `conversations/review` and `conversations/chat` routes are present in the router but not mentioned in section 7.1 or anywhere in the plan. If these are real features, they will be missed. If they are legacy/dead, the audit should still note them.

- [plan section 2.1, source table] The plan claims 31 API route files but the codebase has 32. The plan should enumerate all route files by name rather than giving a count that may already be stale. A missed route file means a missed feature.

- [plan section 9, verification] The verification method for "Audit performed by actually using the running app" is "the document header includes the commit SHA and screenshots exist in `plans/Z8/screenshots/`." This is a weak verification -- the existence of screenshots does not prove the builder actually navigated every route. A stronger method: the audit document must contain a UI path for every route in `router.tsx` and every settings section in `SETTINGS_SECTIONS`. This cross-check is already half-described for the first AC but should be the explicit gate for this AC too.

- [plan section 6.2, screenshots] The screenshot checklist has 20+ items but no specification for what constitutes a valid screenshot (e.g., full viewport, specific resolution, must show URL bar or breadcrumb proving which route). A blank or error screenshot technically satisfies "screenshot exists." The plan should specify that each screenshot must show the feature in its described state (populated vs. empty) and include the URL path in the browser.

### SUGGESTION

- [plan section 3, categorization rubric] The "Hidden Gem" category requires the feature to be "powerful and functional" but there is no explicit test for "functional." A feature could be both a Hidden Gem (undiscoverable) and Built But Rough (functional but buggy). The plan says "exactly one category" -- clarify that a feature with both discoverability and quality issues should be categorized by its worse problem (Built But Rough trumps Hidden Gem, since fixing discoverability on a rough feature makes a bad first impression).

- [plan section 5, document structure] The plan specifies the document path as `docs/product/launch-readiness-audit.md`. The `docs/product/` directory may not exist yet. Task 6 should include creating the directory. Minor but the builder will hit a file-write error otherwise.

- [plan section 7.8 and 7.9, API-only features] For Agent Runtime and Infrastructure features, the plan does not specify how to verify these without a UI. The methodology in section 6.1 is entirely UI-walkthrough-based. For API-only features, the builder needs a concrete method: call the endpoint with curl, check the response, note whether it returns data or errors. Task 3 only says "navigate every route" which does not cover API-only features.

- [plan section 8, task ordering] Task 2 (test coverage mapping) runs before Task 3 (live walkthrough). This ordering is fine for efficiency but the plan should note that Task 3 findings may reveal features not found in Task 1's static analysis (e.g., features triggered by user actions that have no dedicated route, like inline editing, drag-and-drop, or context menus). Task 4 should reconcile the static inventory (Task 1) with the live walkthrough discoveries (Task 3) before categorizing.

- [plan section 12, what the builder should NOT do] "Do not create a PR" is listed but the spec's Plan Calls says "skip /architecture." If the pipeline created this plan anyway, the pipeline will presumably also handle PR creation. This is consistent but could confuse a standalone builder. Minor.

### What's Working Well

- The three-pass methodology (static inventory, live walkthrough, test coverage mapping) is thorough and correctly ordered. Starting from code ensures nothing is missed by a UI-only walkthrough; the live walkthrough catches features the code scan would over-count (dead code) or under-count (emergent features from component composition).

- The categorization rubric in section 3 is honest and operationally precise. Each category has falsifiable criteria, not vibes. The "launch-ready requires test coverage" constraint directly maps to the spec's AC. The per-feature entry format in section 4 has all five fields the spec demands (name, UI path, discoverability, what's rough, recommendation).

- The pre-audit feature inventory in section 7 is impressively detailed (~72 features across 9 groups) and correctly sourced from the actual codebase structure. The spot-checks I performed against `router.tsx`, `settings-types.ts`, and `pages/*.tsx` confirm the plan's claims are grounded in reality, with only minor count discrepancies.

---

## Dimension Details

**1. Spec Alignment (9/10):** Every AC maps to a task. The Quick Wins AC maps to Task 5 with a concrete ranking formula. The Hidden Gems AC maps to Task 4 step 3. The "actually use the running app" AC maps to Task 3. The "test coverage for launch-ready" AC maps to Task 2 + Task 4. No scope creep -- the plan explicitly says "no code, no tests, no fixes." One point deducted because the plan adds a screenshot deliverable (`plans/Z8/screenshots/`) that is not in the spec's ACs -- harmless but technically additive scope.

**2. Layer Integrity (10/10):** N/A. No code crosses layers. The plan produces a document.

**3. API Contracts (N/A, scored 10/10):** No APIs are created or modified.

**4. Data Model Alignment (N/A, scored 10/10):** No schemas are created or modified.

**5. Naming (9/10):** Document structure, section names, and category labels are honest and self-describing. "Launch-Ready," "Built But Rough," "Hidden Gem," "Incomplete" are clear and non-euphemistic. The output path `docs/product/launch-readiness-audit.md` is honest. One point deducted: "Quick Wins" is slightly marketing-speak; "High-Impact Polish Items" would be more precise, but this matches the spec's own language so it is defensible.

**6. Module Depth (8/10):** The document structure in section 5 is well-organized with clear hierarchy. The per-feature entry format is the right level of detail -- not so granular that the document becomes unusable, not so coarse that findings lack actionability. The feature grouping by view/area (section 2.2) maps cleanly to the product's information architecture. Two points deducted: the plan could specify a summary table at the top of each area section (feature name | category | discoverability score) for scanability before diving into per-feature prose.

**7. Failure-Mode Coverage (7/10):** Section 10 covers four risks (stale seed data, missing API keys, unexpected feature count, time pressure). These are the right risks. But the plan does not address: (a) what happens if `npm run dev` fails to start -- the entire audit depends on a running app and the plan has no fallback; (b) what happens if the builder's environment lacks browser automation tooling for screenshots (Playwright not installed, headless-only environment); (c) features that only appear after specific user actions (e.g., completing onboarding, creating the first bet, receiving a notification) -- the plan does not specify that the builder must trigger these states.

**8. Simplicity (7/10):** The plan is well-scoped -- no over-engineering for a document-production workpackage. However, the screenshot requirement feels heavy for a document that references UI paths. If the document already has exact UI paths and the commit SHA anchors the codebase state, screenshots add evidence-gathering overhead without proportional value. The spec says "each finding includes the specific UI path OR a screenshot" -- the plan mandates both. This is a minor over-specification. Also, the self-review task (Task 7) largely duplicates what the verification section (section 9) already specifies.

**9. Verifiability (8/10):** Each AC has a concrete verification method in section 9. The cross-check method (compare inventory against `router.tsx` routes + `SETTINGS_SECTIONS` + API routes) is the right approach. Two points deducted: (a) the verification for "each entry includes all five fields" says "grep the output document" but does not specify the exact grep pattern or what constitutes a pass; (b) no protected-tests list is needed (no tests written) but the plan correctly omits this without explanation -- adding a one-line "N/A: no tests produced" would be cleaner.
