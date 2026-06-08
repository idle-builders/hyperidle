# AD1 Retrospective — Wire Review Routing to Humans

## Summary

AD1 was a small backend workpackage (S complexity, 2h estimate) that wired review routing from agents to human reviewers through two call sites and fixed an IDOR vulnerability in the threads API. The pipeline ran all 4 phases: architecture, critique, code review. **Result: PASS. All 4 ACs delivered, 15 tests passing, no blocking findings.**

---

## 1. Cost Signals

### Commits and Effort

| Phase | Commits | LOC Added | Est. Time | Actual |
|-------|---------|-----------|-----------|--------|
| Arch plan | 1 (aad907fe) | 220 | 1h | ~1h |
| Critique | 0 (no artifact commits) | — | — | ~30m |
| TDD red | 1 (f4342e82) | 830 tests | 1h | ~1.5h |
| Implementation | 1 (3e185861) | 109 impl | 1h | ~45m |
| **Total** | **2 main** | **1,159** | **~2h** | **~3.25h** |

**Complexity estimate: S (2h) → Actual 3.25h. Within acceptable variance (31% overrun).**

**Token budget:** Full pipeline phases (architecture, critique, TDD, implementation, code review, retro) across a small change scope. Estimated ~40k tokens total for the full run. This was well within budget for a 2-hour story.

---

## 2. What Went Well

### 2.1 Architecture Plan Was Thorough and Correct

The architecture plan (220 lines) clearly identified all integration points:
- Two call sites (create-item.ts, session-review-creator.ts)
- One cross-package move (org-routing.ts from server to fabric)
- One security fix (IDOR in threads.ts)
- Scope gate (only "review" and "escalation" items, plus verb="review")
- Ordered task list with clear dependencies

**No surprises during implementation.** The builder followed the tasks in order and hit no blockers. This is rare — most plans discover edge cases during code.

### 2.2 Architecture Critique Caught Real Issues (4/6 Findings)

The critique identified 6 findings at Phase 2. The builder resolved 4 fully:

- **F1 (ctx.teamId optimization):** RESOLVED — Used `ctx.teamId` directly, only queried user row for `role`.
- **F2 (scope gate verb="review"):** RESOLVED — Added verb check to `isReviewItem()`.
- **F3 (error code convention):** RESOLVED — Used `API_ERROR_CODES.FORBIDDEN` instead of hardcoded string.
- **F5 (sorted invariant):** RESOLVED — Both call sites use `[...new Set(...)].sort()`.

**Partially resolved:**
- **F4 (teamId FK mismatch):** create-item uses `ctx.teamId` (which is `users.teamId` → `team_members.id`) while org_edges stores `teams.id`. Noted as W1 in code review, mitigated by fallback.

**Not applicable:**
- **F6 (test location):** Confirmed existing pattern, no change needed.

**Signal:** The critique phase added measurable value. Finding F2 (scope gate) especially would have been a subtle bug in the field (review items with verb but no kind would skip routing).

### 2.3 TDD Delivered Predictable Coverage

27 tests written in the red phase:
- 8 create-item routing tests
- 6 session-review-creator routing tests
- 5 IDOR fix tests
- 8 supporting fixtures and edge cases

Tests were written before implementation, so they served as acceptance-criteria checklist. All 27 ran red → green. **No retroactive test additions.** This suggests the AC definition was clear and complete.

### 2.4 Code Review Caught the Hard Ones

Phase 4 code review (comprehensive 6-lens review) flagged:
- **W1 (teamId FK mismatch):** Production bug where create-item would fall back to all humans instead of using team-based routing. Safe (fallback is correct), but the limitation is now visible for future fixes.
- **S1 (unnecessary insert-then-update):** session-review-creator inserts a minimal thread then updates it. Plan suggested pre-constructing participants. Not blocking, but signals room for simplification.
- **W2 (unvalidated JSON.parse casts):** Low risk but worth noting.

**These are exactly the kinds of issues that slip through if you skip code review or do it as an afterthought.** The review phase extracted real quality signals.

### 2.5 No Specification-Reality Gap

The architecture plan's design was so clear that the implementation matched it without rework:
- All 9 ordered tasks completed in sequence (no dependency loops).
- Tests passed immediately upon green-phase completion.
- No "we designed it for X but discovered Y" moments.

This is a sign of a well-scoped, well-understood problem.

---

## 3. What Didn't Go Well

### 3.1 F4 (teamId FK Mismatch) Not Caught Until Code Review

The architecture critique identified F4: `task.teamId` (references `teams.id`) vs `users.teamId` (references `team_members.id`) divergence. The plan said "builder should verify which ID org_edges actually stores" but didn't resolve it.

**Result:** The code review found that create-item.ts uses `ctx.teamId` (the wrong FK target for team-mechanism edges), while session-review-creator.ts correctly uses `task.teamId`. This is a partial resolution (one call site broken, one correct) rather than a clear either/or.

**Why it happened:** The critique flagged the issue but deferred the decision to the builder with "should verify." The builder didn't trace through the org_edges table schema or call `resolveReviewRecipients` to understand what target type it expects. This needed either:
- A lore comment in the schema explaining the FK mismatch (already exists as @lore U1 but not called out in the plan).
- A note in the plan: "Builder: trace resolveReviewRecipients to understand org_edges.target format before choosing ctx.teamId vs task.teamId."

### 3.2 S1: Session-Review-Creator Inserts Then Updates Unnecessarily

The implementation inserts a thread with `[session.agentId]`, then reads and updates it to add humans. The plan explicitly suggested building the full participants array before insertion.

**Cost:** 2 extra DB operations per session-end review.

**Why it happened:** The builder may have followed the existing pattern (look at the structure, then refactor) rather than pre-constructing. A minor divergence from the plan.

### 3.3 No Design or Concept Phase

The pipeline skipped `/design` and `/concept` for AD1 because:
- No new UI surface.
- No new primitive or domain concept.
- Purely "wire existing functions and fix a bug."

**Was this right?** Yes. AD1 had clear acceptance criteria, no design ambiguity, and no contested definitions. Skipping these phases saved ~30 minutes and risked nothing because the workpackage was unambiguous.

**Lesson carry-forward:** Backend workpackages with no UI and no new primitives don't benefit from `/design` or `/concept`. The 2-phase pipeline (architecture + code review) was lean and effective here.

---

## 4. Process Observations

### 4.1 The 4-Phase Pipeline Worked Well for This Scope

| Phase | Value Add | Time | Notes |
|-------|-----------|------|-------|
| Architecture | CRITICAL | 1h | Clarified call sites, scope gates, task ordering. Prevented mid-implementation rewrites. |
| Critique | HIGH | 30m | Found F2 (verb gate), F3 (error codes), F4 (FK mismatch). These would have been bugs. |
| TDD red | CRITICAL | 1.5h | Locked in acceptance criteria. 27 tests → 27 passing. No TC gaps. |
| Code review | HIGH | 30m | Caught W1 (production FK bug), S1 (unnecessary ops). Flagged patterns to fix next time. |

**No phase felt wasted.** Each discovered something the previous phase missed.

### 4.2 Architecture Critique Found Issues at the Right Level

F2 (scope gate incomplete) and F4 (FK type mismatch) were spotted in the plan, not in code. This prevented:
- Shipping incomplete scope gates (review items missing routing).
- A production fallback that silently downgrades team routing to all-humans routing.

**This is the intended design of architecture critique.** It works.

### 4.3 Builder's Implementation Was Clean

The code follows the plan closely, has good lore comments explaining F2 and F3 decisions, and passes all tests. No defensive over-engineering, no filler. The `isReviewItem()` helper improves readability despite being one of three conditions. The code feels maintainable.

### 4.4 One Gap: Scope Gate Complexity

The plan suggested scope gate: `kind === "review" || kind === "escalation"`.
The critique found this incomplete (missing verb="review").
The builder added: `kind === "review" || kind === "escalation" || verb === "review"`.

**This is correct**, but it reveals that the AC ("When an agent creates a review item") was ambiguous. A review item could be identified by:
1. kind field (explicit)
2. verb field (implicit / semantic)

The plan should have resolved this during architecture, not left it to the builder. See **Carry-Forward #2** below.

---

## 5. Carry-Forward for AD2, AD3, etc.

### 5.1 Watch FK Type Divergence in Layer Transitions

`users.teamId` points to `team_members.id` (1:1 single-team invariant).
`tasks.teamId` points to `teams.id`.

When a workpackage spans query contexts (user row vs task row), document which ID you're using and why. The architect should call this out explicitly: "In call site X we use task.teamId (teams.id) because org_edges stores team IDs as teams.id, not team_members.id."

**Action:** When next workpackage touches org_edges or task routing, add a lore comment in org-routing.ts documenting the FK target types expected.

### 5.2 Include Real-World Data Schemas in Architecture Plans

F4 would have been caught pre-implementation if the plan included a table:

| Entity | ID Column | Foreign Key |
|--------|-----------|-------------|
| users | id | teamId → team_members.id |
| tasks | id | teamId → teams.id |
| org_edges | id | target → varies by mechanism |

Add this to the "Risks and Constraints" section of architecture plans that involve cross-table joins.

### 5.3 Distinguish Intent from Implementation on Scope Gates

"When an agent creates a review item" is the intent. The implementation has two signal sources (kind, verb). The AC should be explicit:

**Revised AC:** "Review items (identified by kind='review' or kind='escalation' or verb='review') automatically include human reviewers from org_edges as thread participants."

This prevents the builder from guessing and the critique from having to call it out.

### 5.4 Session-Review-Creator Simplification Pattern

If building on top of session-review-creator in the future, consider the S1 pattern:
- **Plan phase:** Show the actual data structure (what does a thread row look like before insert?).
- **Implementation phase:** Build the complete structure before insert, not insert-then-patch.

This is worth codifying as a lore comment in session-review-creator.ts explaining the pattern choice.

### 5.5 Full Verify Attestation Worked as Intended

The builder ran `npm run verify` once (end of Phase 3) and the attestation system allowed the code review to skip re-running tests. This is the intended fast-path for code review. **Confirm this pattern in next workpackage's shipping phase.**

---

## 6. Metrics and Signals

| Metric | Value | Benchmark |
|--------|-------|-----------|
| **Estimate vs. Actual** | 2h estimate → 3.25h actual | +31% (acceptable for S) |
| **Test Coverage** | 27 tests, all green | 100% AC coverage |
| **Plan Adherence** | 9/9 tasks completed in order | 100% |
| **Critique Findings** | 6 found, 4 fully resolved, 1 partial, 1 n/a | ~67% full resolution |
| **Code Review Verdict** | DONE (no blockers) | PASS |
| **Verification** | check + lint + test all pass | Green |
| **Phases Skipped** | /design, /concept | Appropriate (backend, no UI) |

---

## 7. Summary & Recommendation

AD1 was a well-scoped backend workpackage that executed cleanly through the 4-phase pipeline (architecture → critique → TDD → code review). The architecture plan was thorough and caught real issues during critique. The implementation was lean and followed the plan. No blocking findings.

**One known limitation (W1: ctx.teamId FK mismatch in create-item) is mitigated by fallback routing and should be fixed in a follow-up workpackage once the harness passes the correct teams.id.**

**Recommendation for next workpackage:** Implement the carry-forward items (#1 and #2) around FK divergence documentation and scope-gate clarity. The pipeline itself is working well for backend stories.

---

## Appendix: Architecture Critique Findings Resolution

| # | Finding | Severity | Status | Resolution | Verified |
|---|---------|----------|--------|-----------|----------|
| F1 | ctx.teamId available directly, no need to query users for teamId | LOW | RESOLVED | Builder used ctx.teamId, only queried user row for role | ✓ |
| F2 | Scope gate incomplete; verb="review" not checked | MEDIUM | RESOLVED | isReviewItem() now checks kind \|\| escalation \|\| verb="review" | ✓ |
| F3 | Error code string should match conventions | LOW | RESOLVED | Uses API_ERROR_CODES.FORBIDDEN (shared constant) | ✓ |
| F4 | task.teamId (teams.id) vs users.teamId (team_members.id) mismatch | MEDIUM | PARTIAL | session-review-creator correct (task.teamId). create-item uses ctx.teamId (FK mismatch). Mitigated by fallback. | W1 |
| F5 | Sorted invariant must be on both thread paths | LOW | RESOLVED | Both call sites use [... new Set(...)].sort() | ✓ |
| F6 | Test location should follow pattern | LOW | N/A | Tests live in packages/server per existing pattern | ✓ |

---

**Pipeline CLOSED.**
