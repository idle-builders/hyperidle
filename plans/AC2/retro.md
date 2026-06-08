# AC2 Retro — Bet Hypothesis Validation Flow

## Delivery Metrics

- **Wall clock time:** 2026-06-07 16:32:28 → 18:41:05 (+0200) = ~2 hours 9 minutes
- **Commit count:** 10 commits
- **Lines changed:** 3,107 insertions + 80 deletions across 16 files
- **Test count:** 43 tests (AC2-retro.test.ts: 26 tests, WorkBet.retro.test.tsx: 17 tests)
- **Review cycles:** 1 full review cycle (code review identified 2 CRITICALs + 3 WARNINGs; both CRITICALs fixed in single follow-up commit a95b58a2)
- **Design cycles:** 1 (design-critique variant-a vs variant-b; approved single synthesis)

---

## Process Observations

### What Went Well

1. **Clear concept → architecture → code flow.** The concept doc (258 lines) performed rigorous probing of "validation as a flow, not an entity" and resolved the retro/reflection vocabulary collision early. This prevented schema churn and scope creep. The architecture plan (473 lines) followed directly, mapping every AC to plan tasks. Code implementation was straightforward.

2. **Design critique caught variant tension before code.** Design ran two variants (inline extended vs retro panel) in parallel. The critique (128 lines) synthesized them, recommending the two-column side-by-side layout (variant B's cognitive core) with AC1 section header continuity (variant A's consistency). This locked the design before code was written, preventing re-work.

3. **Architecture critique caught a real defect (YAML frontmatter).** The critique (158 lines) probed the frontmatter rendering assumption and found that `deriveBlocks` had no YAML stripping. The plan already had this listed as Risk #1; the critique escalated it to action. The code correctly resolved it: structured metadata (betId, hypothesis, verdict) lives in `knowledgeStrategyFabric.meta` JSON (queryable), body is pure markdown (renderable). This avoided visible YAML artifacts in the Knowledge view.

4. **Atomic two-write single-endpoint decision held.** The plan chose POST /bets/:id/retro (one endpoint, both writes) over two client-side calls. This was correctly justified in architecture critique as preventing the partial-failure mode. The code attempted to implement atomicity but missed wrapping in `db.transaction()` — the review caught this.

5. **Test count was ambitious and thorough.** 43 tests across two files gave high AC coverage. Individual tests were well-named and targeted (AC2-1 through AC2-15 mapped explicitly). This made the code review's AC completeness table straightforward to verify.

### What Could Improve

1. **Transaction semantics stated in code comments but not enforced in implementation.** The `@lore` comment at `bets.ts:897` claims "one transaction" but the code issued 3-5 independent queries. This was a latent bug caught by code review. The lesson: structural enforcement (wrapping in `db.transaction()`) is stronger than comment-based promises. Recommend: add a lint rule or test assertion that queries within atomicity-critical endpoints are in a transaction block.

2. **Frontmatter risk was escalated but not fully explored in architecture.** The architecture critique flagged YAML frontmatter as a CRITICAL risk with three options (add stripping to `deriveBlocks`, strip in `KnowledgeBody`, or not use YAML). The plan listed it but didn't decide until code review. The decision to use JSON in `knowledgeStrategyFabric.meta` was correct but came late. Recommend: architecture critique should probe not just "what could fail" but also "which option does the plan choose and why."

3. **Test validity was not visually inspected before merge.** AC2-4 (immutability test) had dead code: `where(bets.id ? undefined : undefined)` that updated all test bets. The test passed by accident (because the server code was correct and the second update overwrote the mess). Code review caught this with manual inspection, but a pre-merge test run visibility (seeing which rows were affected by each query) could have caught it earlier.

4. **Learnings field was required in design but optional in implementation.** The design spec said learnings are required (form label: "What did you learn?", populated state shows Learnings subsection). The Zod schema made learnings optional (`z.string().max(4000).optional()`). The populated state doesn't display learnings at all (they live in the knowledge item, not the bet record). This is a design-implementation gap: the form promises learnings will be captured and displayed, but re-editing shows them as empty and viewing the bet doesn't show them at all.

5. **Metadata display in populated state was incomplete.** The approved design spec 1.4 shows "Xd ago by @Name" timestamp/author metadata on the populated outcome. The code renders verdict + summary but not the timestamp or author, making it unclear when the outcome was recorded. This is a gap between spec and implementation.

6. **Session cost tracking for AI draft was stubbed but not enforced.** The concept doc hard rule 4 says "AI-assisted drafting is cost-capped." The architecture critique noted "The stub has no LLM cost, so the cost cap is effectively infinite for AC2." The implementation is a stub returning canned suggestions — correct for AC2. But the stub does not reserve cost or test the cost-cap path. When LLM integration lands, this will need adding.

### Risks Realized

1. **CRITICAL: No transaction atomicity on the two-write retro endpoint.** Architecture critique flagged "transaction semantics are mentioned but not specified." The code promised atomicity but was not wrapped in `db.transaction()`. This violates the "single endpoint is safer (atomic)" justification from the design. The code review caught this, and commit a95b58a2 fixed it. Lesson: architectural decisions about atomicity must be tested, not just reviewed for correctness in isolation.

2. **CRITICAL: Immutability test validity.** AC2-4 was supposed to verify that the hypothesis snapshot is immutable (never changes on re-validation). The test had dead code that accidentally updated all bets, then ran the correct update. The test passed because the server code was correct, not because the test was valid. This is a hidden test quality issue that code review caught. Lesson: tests that accidentally pass obscure real issues. Recommend: test harness should validate test coverage more strictly (e.g., mutation testing or query-log inspection).

3. **Design-implementation learnings gap.** The spec says "Learnings" textarea in edit form, "Learnings" subsection in populated view. The code stores learnings in the knowledge item (correct per concept doc), but the bet detail page doesn't fetch or display them. This means: editing shows an empty learnings field (users see their learnings vanish after save), viewing shows no learnings section at all. Users can find learnings in the Knowledge view, but the bet detail page breaks the expectation set by the form. Lesson: when a feature spans multiple entities (bet + knowledge item), the frontend integration needs explicit attention to flow continuity.

---

## Cost Signals

### Token Efficiency

- **Concept phase (258 lines):** Extensive probing (6 phases) paid off. The vocab collision resolution (reflection vs retro) was discovered and locked early, preventing churn in downstream phases. Estimated cost: 2-3x typical concept, but prevented rework.
- **Design phase (665 lines across 4 files):** Two variants ran in parallel. Design critique (128 lines) evaluated both efficiently. The synthesis was single-round, no re-litigate cycles. Clean trade-off between exploration cost and decision quality.
- **Architecture phase (473 lines):** Interrogation section addressed the key open questions (single vs dual endpoints, AI draft scope, body format). The reconciliation table was precise and caught 4 mismatches with reality that became implementation tasks. Clean input to code.
- **Architecture critique (158 lines):** Caught one real defect (frontmatter), one decision gap (which option for fixing it). Good signal-to-noise. The CRITICAL risk escalation added weight to the problem.
- **Code review (1000+ lines output):** Detailed AC-by-AC table (15 rows) + 2 CRITICALs + 5 WARNINGs. The code was 538 lines of production code (26 tests in AC2-retro.test.ts, 17 in WorkBet.retro.test.tsx). The review output is ~2x the production code size, but justified: identified two real bugs (transaction wrapper, test dead code) and three design gaps (learnings display, metadata, form validation). This is healthy review-to-code ratio.
- **Revision cycle:** Single commit a95b58a2 (86 insertions/deletions) fixed both CRITICALs + test cleanup. Fast closure after code review.

### Observation Density

Process artifacts had high information density:
- **Concept doc:** 6 distinct rejections per noun (what validation/retro knowledge item is NOT), 3 vocab collisions resolved, 5 hard rules. Dense probe.
- **Architecture critique:** 7 dimension scores (spec alignment, layer integrity, API contracts, data model, naming, module depth, failure coverage, simplicity) with concrete evidence per score. Structured evaluation prevented vague feedback.
- **Code review:** Explicit AC table forced enumeration of all 15 acceptance criteria and their evidence locations. This prevented "lgtm" reviews that miss subtle bugs.

### Agent Session Reuse

- Skills ran in sequence: concept → design → design-critique → architecture → architecture-critique → write-tests → write-code → code-review → fix → ship. Each skill had locked input from the prior step. No parallel agent launches (unlike `/pipeline` which can run multiple workpackages in parallel).
- No backtrack: concept was not re-opened after architecture, design was not re-critiqued after code. This linear flow kept context in memory across phases and reduced re-entry cost.

---

## Recommendations for Next Workpackage

1. **Enforce transaction semantics at the linting/test level.** AC2's transaction bug was caught by code review, not by build gates. Recommend: add a lint rule or pattern-based test that verifies any endpoint with atomicity requirements (flagged by `@lore` or schema validation) has queries inside a `db.transaction()` block. This would have caught CRITICAL-1 pre-review.

2. **Strengthen test validity checking.** AC2-4's dead code test passed accidentally. Recommend: during code review, for any test touching the database, print/assert the affected row count or query results. This would have caught the `where(undefined)` bug immediately. Consider mutation testing as a future practice.

3. **Design-implementation handoff for multi-entity features.** Learnings span bet detail + knowledge view. The form promised learnings would be captured and visible; the implementation stored them but didn't display them on the bet detail. Recommend: for features that span multiple entities/views, architecture should explicitly task out the display/fetch path for each view (e.g., "Populated outcome section fetches knowledge item body to display learnings"). The design flow already covers this (spec 1.4 shows learnings in populated view), but architecture didn't call it out as an implementation task.

4. **Cost-cap path should be tested even with stubs.** The AI draft endpoint is a stub (no LLM). The concept doc hard rule 4 says "cost-capped." Recommend: the stub should still reserve cost or be wrapped in a cost-cap check that would fire when real LLM code is added. For AC2, this is low priority, but the pattern prevents "stub costs nothing, LLM version is never tested for cost" scenarios.

