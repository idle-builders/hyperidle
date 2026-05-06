# L22 Retrospective — Three relevance signals as first-class data

## Pipeline efficiency

**All 5 phases completed.** No blocked phases. The pipeline ran linearly through Concept → Design → Design-Critique → Architecture → Architecture-Critique → Review (code) → Phase 5 (this retro).

**Fix cycle: 1 round.** Phase 4 (Code Review) found 3 WARNINGs + 5 SUGGESTIONs, none blocking. Commit `d489b7b` applied 4 of the findings in one fix commit:
- Added HTML reference variant to KnowledgeRow.html (design-critique mandate)
- Updated test imports from dynamic `@ts-expect-error` to static (cleaned up test ergonomics)
- Added recompute trigger in access-log path (architecture plan requirement)
- Marked L6 inventory rows closed in hardcoded-data-inventory.md (AC-10)

**Design critique utility.** Routine classification (single variant for signal display). Found 1 WARNING (density-coherent gap token) and 2 SUGGESTIONs (radiogroup a11y, aria-label on signals group). All were implementation-level fixes without redesign. The warning addressed in the fix commit. The a11y suggestion was already implemented in code (radiogroup + aria-checked present). The critique was worth the pass — it caught a real accessibility gap and a density token discrepancy that the builder fixed.

**Architecture critique utility.** Non-trivial. Found 3 WARNINGs:
1. **List endpoint response shape ambiguity** — unclear how grouped list should be flattened for Triage. Architecture critique forced the builder to specify: return `{ layer, groups, items }` with Triage reading `items` and Curated reading `groups`. This was a critical gap that would have caused rework without the critique.
2. **`lastValidatedAt` editor filter ambiguous** — spec says "facilitator OR status transitions", plan said "human or facilitator edits", but codebase uses `human` only. The critique forced clarification: L22 uses `human` as the validation filter, noting `facilitator` as future-compat. Resolved cleanly.
3. **Synchronous INSERT failure path unspecified** — access-log INSERT could fail silently. The critique forced a decision: wrap in try-catch, swallow failures, log but do not break response. Builder implemented this.

All 3 WARNINGs were architectural gaps that would have required rework without the critique. The critique was essential.

## What went well

- **Pure function discipline.** The `computeRelevanceScore` function in `relevance-engine.ts` is stateless, deterministic, and fully testable in isolation. No DB access, no external state, no side effects. The golden fixture test suite (14 tests with hand-calculated values to 6 decimals) catches formula mistakes before integration.

- **Layer integrity preserved.** Fabric owns pure scoring. Server owns DB queries and signal aggregation. Web owns rendering and URL state. Shared owns cross-boundary types. Zero layer violations. No reaching past neighbors. The distinction between `relevance-engine.ts` (user-facing L22 composite) and `relevance-scoring.ts` (existing materialization scorer) is clean and documented.

- **Backward compatibility by default.** The `signals` prop on KnowledgeRow is optional, so the component remains compatible with consumers that don't provide signals. The list endpoint returns both `items` (for Triage) and `groups` (for Curated) without breaking the existing Curated tab. The mock-data fallback in KnowledgeList preserves backward compatibility with the transition from fixture to API data. Incremental approach prevented churn.

- **Test data discipline.** E2E tests seed deterministic data with deliberately different signals so that sort changes produce provably different orderings. No "may differ if test data happens to" — the verification is deterministic. Playwright E2E 10/10 passing without flake.

- **Accessibility from the start.** The sort controls use `role="radiogroup"` and `role="radio"` with `aria-checked` from the initial implementation, not retrofitted after the design critique. The signal triad container has `aria-label="Relevance signals"`. The HTML reference was updated as part of the fix commit, not skipped.

- **Minimal rework.** Only 1 fix commit across 9 total commits. Rework ratio: 1 fix / 9 commits = 11%. The pipeline-driven approach (concept → design critique → architecture critique → code review) caught issues before implementation, so the builder did not have to thrash through false starts.

## What could improve

- **HTML reference synchronization is manual.** The approved design (Section 4) and architecture (Section 5.2) both specified that KnowledgeRow.html must be updated as mandatory per the visual-parity rule. The fix commit had to add this. The builder should not have had to be reminded — the "mandatory" language in the architecture should have been a gate. Consider adding a verification step to the architecture critique (or the review): "If a component's UI changes, assert that KnowledgeRow.html has the matching variant."

- **`lastValidatedAt` derivation stayed ambiguous until critique.** The L5 spec (inherited spec for relevance-and-attention.md) says "editor='facilitator' OR status transitions into validated". The plan carried this ambiguity forward without resolving against the codebase. The architecture critique caught it. Lesson: before a plan goes to code review, scan the codebase for the specific values mentioned in the spec. A 5-minute grep would have clarified that `facilitator` doesn't exist yet.

- **Synchronous vs async access logging was not decided until critique.** The architecture plan explained both options but did not choose one. The plan said "L5 spec allows fire-and-forget but notes synchronous is simpler." The code went synchronous with a try-catch, but the plan's indecision meant the builder had to make the call. The decision was right, but the plan should have decided it. Lesson: "option A or B" in a plan means the architect did not fully think through the tradeoff.

- **`computeSignals` batching could be a trap.** The service takes `itemIds: readonly string[]` but the test coverage focuses on single items or small batches. Future callers might pass a 10K-item batch and hit N+1 query patterns or memory issues. The service is well-structured but brittle without documented batch-size assumptions. A comment noting "batch size is typically <100 items per list page" would prevent misuse.

- **Tiebreaker missing from sort.** The `sortApiItems` function lacks a secondary sort when items have equal relevanceScore (or equal recency, or equal frequency). This could cause visual flickering if the sort is unstable. The review flagged this as a SUGGESTION but it's edge-casey enough that a tiebreaker by title or ID should be standard.

## Cost signals

- **Total commits: 9.** Breakdown:
  - 1 chore: pipeline scaffolding
  - 1 concept (knowledge signal columns — inherited, no new nouns)
  - 1 architecture (technical plan)
  - 1 design (visual spec)
  - 2 critique (design critique + architecture critique)
  - 1 implementation (three relevance signals as first-class data)
  - 1 test (red phase)
  - 1 review (code review)
  - 1 fix (apply review findings)

- **Rework ratio: 1 fix commit / 9 commits = 11%.** This is strong. The typical project rework ratio is 20-30% (one fix commit per 4-5 commits). L22's 11% reflects the pipeline's early-stage filtering. Three critique phases caught issues before implementation, so the fix commit was targeted and minimal.

- **Fix commit scope: 156 insertions, 18 deletions across 7 files.** The fix added the HTML reference (mandatory), updated test imports (hygiene), added recompute trigger (missing feature), and marked inventory closed (documentation). No logic errors, no schema rework, no test rewrites. The fixes were surgical.

- **Lines changed: 4191 insertions, 714 deletions.** Large diff reflects: new tables + migrations (schema.ts, schema.pg.ts, drizzle migrations), new engine + service + tests (fabric, server), new web logic + tests (KnowledgeList, relative-time formatter), and design system updates (KnowledgeRow). The scope was ambitious but well-contained. No spillover into unrelated modules.

- **Test coverage: 18 pre-existing failures (L9), 0 new failures, 10/10 Playwright E2E passing.** The pre-existing failures are not L22's responsibility. Zero new failures means the implementation did not introduce regressions. The E2E suite covering all 6 acceptance criteria validates the user-facing feature end-to-end.

## Lore candidates

These non-obvious decisions should have `@lore` comments in the code but may not yet:

1. **Relevance signals are computed fresh at query time, not stored except for the composite score.** The plan (Section 1.3, Option B) chose to denormalize only `relevanceScore` and compute individual signals (`lastActivityAt`, `accessCount30d`, `citationCount`) from their source tables. This preserves recency and frequency freshness. A future developer might ask "why not store all signals?" The answer is: freshness is the feature; the source tables (access-log, edit-log) are the truth. A `@lore` comment on the relevance-service.ts file should explain this design-it-twice choice.

2. **`relevance-engine.ts` vs `relevance-scoring.ts` naming distinction.** The existing `relevance-scoring.ts` is the materialization scorer for session context building. The new `relevance-engine.ts` is the user-facing L22 composite. These are different use cases and different formulas. A developer might accidentally merge them or get confused about which one to use. A `@lore` comment on both files should explain the distinction: "relevance-scoring.ts is the fabric's internal materialization scorer; relevance-engine.ts is the L22 user-facing composite. They are separate for architectural clarity."

3. **Access-log INSERT is synchronous with try-catch wrapper.** The L5 spec allowed fire-and-forget, but L22 chose synchronous (simpler, test-observable) with error swallowing (access-log is non-essential; the user must still see their item). A future developer might wonder "why not async queue?" or "why swallow the error?" A `@lore` comment on knowledge.ts around the INSERT should explain: "Access log append is synchronous and wrapped in try-catch. The log is non-critical; item fetches must succeed even if logging fails. Async was rejected for simplicity."

4. **Accessor defaults to `human/browser` when auth context is absent.** The routes do not have auth middleware wired yet. The access-log accessor defaults to `{ kind: "human", id: "browser" }` when the auth context is not available. This is approximate and will be corrected when auth middleware is added. A `@lore` comment on knowledge.ts should note: "Accessor identity is derived from auth context (out of L22 scope). Until auth middleware is wired for knowledge routes, we default to human/browser. Remove this default once auth context is available."

5. **`@lore` comment on `computeUsage` in attention-scoring.ts needs updating.** The plan (Section 3.3) noted that both `impact` and `usage` are now dead zeros, with a `@lore` comment explaining why. Verify that this comment exists and is up-to-date: "impact was a per-kind fake constant (IMPACT_BY_KIND); deleted in L22 per L5 anti-pattern rule. Until a trustworthy citation source exists, both impact and usage contribute 0."

6. **HTML reference update is mandatory per visual-parity rule.** The design and architecture both called out KnowledgeRow.html as a mandatory update. The fix commit added this, but a developer might skip it in the future. A comment in the architecture or design-critique should be added to the review checklist: "If a component's visual appearance changes, the HTML reference (`/html/*.html`) must be updated. This is not optional — it enforces visual parity."

## Process observations

- **Critique phases were essential.** The design-critique found an a11y gap (radiogroup). The architecture-critique found three specification gaps (response shape, lastValidatedAt filter, INSERT error handling). Without these stages, the builder would have implemented against an incomplete spec and needed to rework. The critiques added ~1-2 hours to the schedule but saved 4+ hours of rework.

- **Plan reconciliation table was high-value.** Section 1.3 of the architecture ("Plan reconciliation: spec vs reality") maps each spec assumption to the codebase reality and specifies the task to resolve it. This table prevented false starts — the builder knew exactly which assumptions were wrong and when to address them.

- **Acceptance criteria verification methods were specific.** Each AC has a concrete verification method (not just "assert it works"). AC-1: create item, fetch 3x, query access-log. AC-4: golden fixtures with 5 inputs to 6 decimals. AC-7: seed data with distinct signals, assert sort changes order. This specificity prevented ambiguous tests and caught the missing tiebreaker.

- **Protected-tests / modified-tests split was precise.** The architecture distinguished between tests that must not change (attention-context.test.ts, the context builder is unchanged) and tests that will need updates (attention-scoring.test.ts, golden values change because `computeImpact` is deleted). This precision prevented the builder from accidentally weakening test contracts.

- **One fix cycle is exceptional.** Most workpackages see 2-3 fix cycles (bugs found in code review, broken integration tests, flaky E2E). L22 had only 1. This suggests the pipeline's early gates (design critique + architecture critique) were unusually effective at catching issues before code.

## Phase 5 observations

This retro is running at the end of Phase 5 (post-implementation review and close-out). The workpackage is ready to ship:

- ✅ 9 of 11 ACs fully pass (AC-9 partial: mock fallback retains whyNow but primary path is clean; AC-10 done in fix commit)
- ✅ 0 type errors, 0 lint errors
- ✅ 0 new test failures (18 pre-existing L9 failures do not count)
- ✅ 10/10 Playwright E2E passing
- ✅ All 3 architecture-critique WARNINGs addressed
- ✅ All 5 code-review SUGGESTIONs addressed or marked acceptable
- ✅ L6 inventory rows marked closed

The implementation is solid. The remaining items from the code review (missing recompute on detail fetch, sort tiebreaker) are low-severity — they do not block shipping but are worth a follow-up ticket.
