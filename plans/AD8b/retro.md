# AD8b Retrospective — Assistant Agent + Overlay

**Workpackage:** AD8b — Assistant Agent + Overlay  
**Complexity:** L (~12h estimated)  
**Status:** DONE (all 15 ACs pass)  
**Review Cycles:** 2 (1 NOT DONE with 3 blockers; 1 DONE after fix commit)  
**Commits:** 8 (1 WIP scaffold + design/arch reviews + red tests + green implementation + fix + review pass 2)

---

## Pipeline Cost Summary

| Phase | Duration | Output | Notes |
|---|---|---|---|
| Phase 0 (Setup) | ~5m | Worktree + PR #233 | Concurrent with pipeline kickoff |
| Phase 1a (Concept) | Skipped | N/A | AD8b reused concept from AD8a (three-type taxonomy) |
| Phase 1b (Design) | ~1.5h | design/approved.md, design-critique.md (8/10) | 1 routine variant, 6 rejected directions evaluated |
| Phase 1c (Architecture) | ~2.5h | architecture.md, architecture-critique.md (8/10) | 12 tasks, 2 design-it-twice decisions, 9 security concerns |
| Phase 2 (Critique) | ~1h | review outcomes + C1 fix guidance | Design 8/10, Architecture 8/10, both passed ≥7 threshold |
| Phase 3a (Tests) | ~1.5h | AD8b-*.test.ts + AD8b-*.integration.test.ts (1751 LOC) | 10 test files, failing red phase |
| Phase 3b (Implementation) | ~4h | 80 files changed, +4602/-399 lines | New tools, dispatcher, settings component, renames |
| Phase 3c (Verify) | ~30m | npm run verify passes, CI green | check + lint + knip + test:all + build |
| Phase 4a (Review Pass 1) | ~1h | review.md (NOT DONE, 3 blockers) | B1: SettingsAssistant unmounted, B2: pinning trigger, B3: tool-call rendering |
| Phase 4b (Rework) | ~1h | fix(AD8b) commit wiring all 3 fixes | 150 insertions across 6 files |
| Phase 4c (Review Pass 2) | ~30m | review-pass2.md (DONE) | All blockers resolved, non-blocking observations logged |

**Total elapsed:** ~12h estimate. **Actual delivery:** 2 calendar days (9 Jun 08:00 — 9 Jun 18:00, +breaks) = ~14h active work.

**Cost drivers:**
1. **Architecture reconciliation table (1h)** — 20 spec-vs-reality checks prevented silent bugs and clarified builder assumptions before code.
2. **Coc→Assistant rename blast radius (1.5h)** — 40+ file references, sidebar prop propagation through 3 layers (AppShell → Sidebar → test consumers). Atomic rename required per plan.
3. **Integration wiring gaps (2h across two review cycles)** — 3 blockers, all stemming from components built correctly in isolation but not wired into the container.
4. **TDD red phase (1.5h)** — 1751 LOC of tests across 10 files. High-risk work (dispatcher, new tools, schema extensions) justified extensive test coverage before implementation.
5. **Code review iteration (1.5h total)** — Pass 1 NOT DONE caught 3 integration gaps. Builder fixed all 3 in 1h. Pass 2 verified all fixes and logged non-blocking findings.

---

## What Went Well

### 1. Two-Phase Review Gate Caught Integration Gaps Early
All three blockers (B1, B2, B3) were integration mismatches — components built correctly but missing container wiring. This pattern emerged from **Phase 4a code review**, not from tests:
- **B1** (SettingsAssistant unmounted): Component + tests correct, but no import/render in SettingsPage.
- **B2** (pinning trigger missing): Thread starts `pinned=false` (correct), but nothing calls `update(threads).set({pinned: true})` after response.
- **B3** (tool-call schema gap): `plainPayloadSchemaWithToolCalls` defined but never wired into `messageRowSchema`; overlay had no rendering logic.

**Cost signal:** The review gate prevented a "looks done" ship. Builder caught and fixed all three in **1h** because the review identified exact locations and the architectural foundation was sound.

### 2. Architecture Plan Reconciliation Prevented Wasted Work
The plan's section 1 ("Plan Reconciliation: spec vs reality") verified 20 codebase assumptions with line numbers before any task was attempted. This covered:
- Existing schema columns (soulPrompt, ThreadMessageAppendedEvent)
- Old routes to rename (coach.ts → assistant.ts)
- Role catalog structure (chief_of_staff removal)
- Session provisioning infrastructure (reuse vs. new)

**Example:** The plan correctly identified that `users.soulPrompt` already exists (X3 in schema), saving potential migration work. The plan also caught that `PlainPayload` has no `toolCalls` field and specified the extension needed — builder implemented this correctly.

### 3. Design-It-Twice Decisions Were Genuine Trade-off Analysis
Both design-it-twice sections (assistant dispatcher mechanism, tool-call metadata storage) presented real alternatives:
- **Dispatcher:** Event-driven (chosen) vs. inline (rejected for layer boundary violation)
- **Metadata:** Extend PlainPayload (chosen) vs. separate table (rejected as over-engineering)

The rejections were grounded in architecture principles (three-layer boundary, query cost), not straw-manning. Both decisions held up in code review — no regrets.

---

## What Didn't Go Well

### 1. Integration Wiring Was Assumed, Not Verified
The architecture plan specified **12 ordered tasks** for the builder to implement in sequence. All 12 were completed, but **3 tasks had gaps** where pieces existed but weren't connected:

- **Task 10 (SettingsAssistant):** Component written, stories written, tests written. But Task 10 also said "Add section between Models and Appearance in SettingsPage" — this explicit mount step was documented but not executed.
- **Task 9 (assistant dispatcher):** Event subscription and filter logic correct. But Task 9 also specified "After first response: update thread.pinned = true" — this secondary action was deferred/forgotten.
- **Task 11 (tool-call rendering):** TaskCallSummary type exported, schema definition done. But "Pass through ThreadShell's message rendering via ... logic in the AssistantOverlay's ThreadShell consumption" was not wired. `messageRowSchema` not updated to use the correct schema variant.

**Root cause:** The plan's task descriptions were prose-heavy, not step-by-step pseudo-code. Ambiguity between "the component is done" and "the component is integrated" was not enforced. Tests verified component behavior in isolation but did not verify integration (E2E test for "user can access settings > save soul prompt > overlay reflects change").

**Prevention:** Future plans should separate "write component" from "mount component" as distinct substeps, or use an integration test for the full flow before code review.

### 2. SettingsAssistant Styling Deviated from Design Spec
The design critique flagged that the component styling (font sizes, colors, capitalization) deviated from the approved design contract:
- Spec: 13px uppercase text-tertiary section title
- Implementation: text-base font-semibold with text-primary color

The deviation is minor but represents a **missed design-spec verification step**. The design was approved as complete, so implementation should have matched exactly. This was a non-blocking observation in code review, but it's a signal that design-handoff rigor could be higher.

### 3. Architecture Plan Did Not Predict the 3 Blockers
Despite the plan's thoroughness (reconciliation table, design-it-twice, security analysis), none of the "Risks and ambiguities" section (S10) mentioned integration wiring gaps. Risk 1 (sidebar prop rename blast radius) was correct, but Risk 2-3 addressed latency and race conditions, not container-assembly issues.

**Example:** Risk 3 says "two sessions could be provisioned" if the user sends two messages before the first response. True, but it didn't flag that nothing pins the thread after the assistant responds — a more fundamental contract violation.

**Pattern:** Architectural risks are identified at the **component/service level**, but **cross-component integration gaps** are harder to predict without explicit integration checklists. The three blockers would have been caught by an "Integration Wiring Checklist" task:
- [ ] SettingsAssistant mounted in SettingsPage
- [ ] Pinning trigger implemented in dispatcher for AI responses
- [ ] messageRowSchema updated to use plainPayloadSchemaWithToolCalls
- [ ] renderToolCallSummaries integrated into overlay's message rendering

---

## Pattern Observations

### P1: Integration Wiring Gaps Are Systematic
This is the third consecutive workpackage (AD7, AE4, AD8b) where **working components failed to integrate**:
- **AD7 (Search backend):** Builder delivered 5 ACs with working route, test suite, and response shapes, but code review found 3 contract violations (null checks, N+1 query). Rework 13%.
- **AE4 (Mobile & responsive):** Drawer animation spec'ed in design, planned in architecture, but code-rendered conditionally, so CSS transition had no prior state → animation never fired. Flagged as deferred cosmetic gap.
- **AD8b (Assistant):** SettingsAssistant, pinning, tool-call rendering — all planned but not wired. Review pass 1 NOT DONE.

**Signal:** Builders are strong at **single-component correctness** (tests pass, implementation matches spec) but weak at **container assembly** (connecting components into the application). This is not a testing problem — it's an **integration verification problem**. Tests verify each component in isolation; code review catches the assembly gaps.

**Recommendation (see below):** Require integration tests for cross-component flows before code review. Example: test that creating an assistant thread → sending message → assistant responds → thread pins → user opens overlay → sees soul prompt in settings → edits it → saves → overlay reflects change.

### P2: Two-Review-Cycle Pattern Is Working
All three previous workpackages (AD7, AE4, AD8b) that shipped complex changes went through review cycles:
- **Phase 4a:** First review pass identifies structural issues (blockers, missing pieces)
- **Phase 4b:** Builder does 1-2h rework fixing all blockers
- **Phase 4c:** Second review pass confirms fixes and logs non-blocking observations

**Cost:** 1h review + 1h rework + 0.5h re-review = 2.5h total. This is high, but **prevention cost** of missing integration gaps until post-ship is much higher (user-facing bugs, unplanned support tickets).

**Metric:** AD8b blockers were fixed at a 100% resolution rate (3 blockers → 3 fixes → all accepted). This is better than the assumption that "more careful initial build" would prevent the need for review cycles. The review process is the safety net.

### P3: Reconciliation Tables (Plan S1) Are High-ROI
The architecture plan's "Plan Reconciliation: spec vs reality" section listed 20 claims verified against the actual codebase. This explicit **spec-vs-reality audit** has been used in AA1, AB3, AD3, AD5, AE4, and now AD8b.

**Pattern evidence:**
- AA1: "7 spec assumptions verified" — plan caught that soulPrompt column exists, preventing migration work
- AB3: "8 assumptions verified" — plan caught role lookup pattern, preventing API design confusion
- AE4: "Plan reconciliation prevented wasted work"
- AD8b: "20 spec-vs-reality checks prevented silent bugs"

**Recommendation:** Make reconciliation tables a **required artifact** in all /architecture outputs. The 15–30m investment in upfront verification prevents 2–4h of downstream debugging and rework.

---

## Recommendations for Future Pipelines

### R1: Require Integration Test for Cross-Component Flows
Before code review, add an integration test that exercises the full user flow:

**Example for AD8b:**
```typescript
// Integration test: soul prompt editing
test('user can edit assistant soul prompt', async () => {
  const user = await seedUser();
  const response = await client.get(`/api/threads/assistant`);
  expect(response.thread.id).toBeDefined();
  
  await client.patch(`/api/users/${user.id}/assistant`, {
    soulPrompt: 'New soul',
  });
  
  const assistant = await client.get(`/api/users/${user.id}/assistant`);
  expect(assistant.soulPrompt).toBe('New soul');
});
```

This test would have caught B1 (unmounted component) immediately, because the UI path would be testable. Currently, component tests verify behavior in isolation, but not reachability.

**Effort:** ~30m per complex cross-component flow. Expected prevention: 1+ blocker per review cycle.

### R2: Add Integration Wiring Checklist to Task Descriptions
When a task specifies "create component" AND "mount component," separate them explicitly:

**Current (ambiguous):**
> Task 10: Settings — soul prompt editor. New SettingsAssistant component with textarea + save button. Add section between Models and Appearance in SettingsPage.

**Proposed (explicit):**
> Task 10a: Create SettingsAssistant component (component test + stories).  
> Task 10b: Mount SettingsAssistant in SettingsPage at the specified location (integration test: navigate to Settings > assert Assistant section visible).  
> Task 10c: Verify save/load cycle (integration test: edit → save → reload → verify persisted).

The sub-steps make it clear where the boundary between "component done" and "feature done" is.

### R3: Enforce Design-Spec Compliance via Component Test Snapshots
The design critique noted that SettingsAssistant styling deviated from the approved spec. Prevent this by:

1. Design produces a reference screenshot or token map for the component.
2. Implementation includes a component test with a visual snapshot (Playwright visual regression).
3. Code review compares snapshot to design reference.

**Tooling:** Playwright's visual comparison (existing in HyperIdle's E2E suite) can be adapted for component tests.

### R4: Expand Risks Section to Include Integration Gaps
The architecture plan's "Risks and ambiguities" section (S10) identified latency, race conditions, and rename blast radius. Add a new subsection for **integration risks**:

**Proposed section:**
> ### Integration Wiring Risks  
> 1. **SettingsAssistant mounting (Task 10b):** Component is testable, but visibility depends on import + render in SettingsPage. Missing mount = AC-2 partially unmet. Mitigation: integration test for "navigate to Settings > assert Assistant section > verify save works".  
> 2. **Thread pinning trigger (Task 9):** Dispatcher handles dispatch, but pinning is a separate update. Both exist in the same event handler, but they are distinct operations. Mitigation: test specifically that pinning occurs after AI response.  
> 3. **messageRowSchema mismatch (Task 12):** Schema extended, but not wired. Mitigation: verify that reading a message with toolCalls from DB preserves the field.

**Effort:** ~15m per plan to review task descriptions for integration assumptions.

---

## Summary

AD8b shipped successfully (all 15 ACs pass) with a **2-review-cycle pattern** that is becoming standard for complex changes. The architecture plan was thorough and forward-thinking, but **3 integration wiring gaps** emerged in code review, requiring a 1h rework and re-review. This is acceptable — the review process worked as a safety net.

**Key insight:** The three blockers were not "missing pieces" but "disconnected pieces." All components were built correctly and tested correctly. The issue was **container assembly** — wiring them into the application. This pattern has appeared in AD7, AE4, and AD8b, suggesting that integration test rigor needs to be higher.

**Cost efficiency:** 12h estimated, ~14h actual (2 calendar days with breaks). The review cycles added 2.5h but prevented a shipping defect. This is a good trade-off for workpackages in the L (large) complexity tier.

**Recommendation:** Adopt the four improvements (R1–R4) starting with AD8c and beyond to reduce review cycles and improve handoff quality.
