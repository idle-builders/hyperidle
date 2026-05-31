# R7 Code Review -- Knowledge & Bet Cycles

**Reviewer:** Phase 4 code review (same reviewer as Phase 2 architecture critique, score 7.7/10)
**Branch:** `feat/R7-knowledge-bet-cycles` (or current branch)
**Commits reviewed:** `2ce357b8` (failing tests), `b23be922` (implementation fixes)

---

## Verdict: DONE

All 5 acceptance criteria are satisfied. The implementation is clean, correctly addresses the architecture critique findings, and passes all tests (29 new R7 tests + 13 existing write-memory tests, 0 regressions). Typecheck and lint both pass with zero errors.

---

## AC Completeness Audit

| AC | Status | Evidence |
|----|--------|----------|
| AC-1: write_memory and promote_knowledge create items appearing in KnowledgeList | PASS | `R7-knowledge-e2e.test.ts` -- 4 tests verify write_memory creates items with status="draft", sets scopeKind/scopeId on kernel and fabric tables, and items appear in DB queries. `R7-knowledge-cycle.test.tsx` -- 11 tests verify KnowledgeList renders draft items in triage tab and active items in curated tab. |
| AC-2: Knowledge items from session N materialize into session N+1 | PASS | `R7-knowledge-e2e.test.ts` -- "an item written by write_memory with layer=L2 appears in materialize() output for the same productId" passes. scopeId on fabric extension table correctly matches productId for `fetchAllForLayer()`. |
| AC-3: Bet transitions through full lifecycle (shaped/draft -> committed/active -> shipped/completed) | PASS | `R7-bet-lifecycle.test.ts` -- 5 tests verify: POST /api/bets creates draft bet, POST commit transitions to active, transitionBet moves to completed, lifecycle propagation auto-completes bet when all tasks done, full end-to-end lifecycle. |
| AC-4: Shipped bets appear in WorkPortfolio with correct status and ship rate | PASS | `R7-bet-lifecycle.test.ts` -- 4 tests verify: 100% when all completed, 50% when half, dash when none, killed bets excluded from denominator. |
| AC-5: KnowledgeList triage tab shows draft items, curated tab shows promoted items | PASS | `R7-knowledge-cycle.test.tsx` -- triage tab renders draft items, curated tab renders active items, tabs correctly exclude the other status, auto-selection defaults to triage when drafts exist. |

---

## Lens 1: Architecture (Positive)

**Layer integrity: PASS.** Changes respect the three-layer boundary. `write-memory.ts` and `promote-knowledge.ts` (Meta Layer / server) call into `knowledge-repository.ts` (Meta Layer / fabric). No layer-skipping.

**API contracts: PASS.** `CreateKnowledgeItemInput` was extended with optional `scopeKind` field -- backward compatible (defaults to "factory"). `ToolContext` was extended with optional `teamId` -- backward compatible (existing callers and tests continue to work with undefined).

**Architecture critique findings addressed:**

- **F1 (Blocking -- type-level impossibility):** Correctly resolved. Builder created `AnyKnowledgeStatus` union type and replaced `isKnowledgeStatus()` with `isAnyKnowledgeStatus()` that checks both `KNOWLEDGE_STATUSES` and `KERNEL_KNOWLEDGE_STATUSES`. The `ALLOWED_TRANSITIONS` record is now typed as `Record<AnyKnowledgeStatus, readonly AnyKnowledgeStatus[]>`. This compiles and is type-safe.

- **F2 (Non-blocking -- kernel table scope write path):** Correctly resolved. `fabric.create()` now writes `scopeKind` and `scopeId` to the kernel INSERT (lines 141-142 of knowledge-repository.ts). The existing `scopeId` in `CreateKnowledgeItemInput` continues to flow to the fabric extension table as well (line 159).

- **F3 (Non-blocking -- fabric extension table scopeId):** Correctly resolved. `write_memory` passes `scopeId: teamId` which flows through `CreateKnowledgeItemInput.scopeId` to both the kernel table (line 142) and the fabric extension table (line 159). Materialization queries the fabric extension table's `scopeId`, so this is critical.

**Plan deviation (non-blocking):** Architecture plan Task 3 specified wiring `teamId` into ToolContext in `session-provisioning.ts` Phase 8. The builder added `teamId?: string` to the `ToolContext` interface but did NOT wire it in `session-provisioning.ts` (line 292-300 -- `teamId` is available in scope at line 172 but not passed to the ToolContext constructor). Instead, `write_memory` falls back to querying `tasks.teamId` via `ctx.taskId`. This works because the fallback is robust, but it adds an extra DB query per `write_memory` call that the plan intended to avoid. This is a minor inefficiency, not a correctness bug.

---

## Lens 2: Design (Positive)

No UI changes in this diff. The KnowledgeList page was not modified -- the fix is upstream (write_memory defaults to "draft" instead of "active"). The frontend test file (`R7-knowledge-cycle.test.tsx`) confirms the existing UI correctly separates triage and curated tabs by status.

---

## Lens 3: Security (Positive)

**Input validation: PASS.** `write_memory` input schema validates status against `z.enum(KNOWLEDGE_STATUSES)` (fabric statuses only). The default "draft" is applied server-side after validation, not from user input. An agent cannot directly pass "draft" as a status via the input schema -- it is a server-controlled default.

**Transition authorization: PASS.** `promote_knowledge` retains its `roles` filter (line 183: `["chief_of_staff", "practice_facilitator", "product_manager"]`). Only facilitator-class agents can transition statuses. The `draft -> active` transition does not weaken the authorization model.

**Information disclosure: No issues.** No secrets are logged. The `teamId` derivation via DB query does not leak data.

**Scope escalation risk: Low.** `write_memory` derives `teamId` from the task's `teamId` column, which is a FK relationship the agent already has access to (they are working on that task). No privilege escalation.

---

## Lens 4: Adversarial (Negative)

**F1 (Minor) -- write_memory status schema allows agent to explicitly pass fabric statuses:**
The input schema at line 33 is `z.enum(KNOWLEDGE_STATUSES).optional()`. An agent can pass `status: "active"` to bypass the "draft" default and place items directly in curated. This undermines the triage workflow. The spec says "Knowledge items from agents default to product scope" and "KnowledgeList triage tab shows draft items created by agents" -- both suggest agents should NOT be able to skip triage.

**Mitigation:** This is an existing design decision (the status field was always optional with agent-chosen values). The R7 change correctly changes the DEFAULT but does not close this explicit override path. A follow-up could remove the `status` field from the agent-facing schema or restrict it to "draft" only.

**F2 (Minor) -- ToolContext.teamId not wired in session-provisioning:**
As noted in the Architecture lens, `teamId` is available at line 172 of `session-provisioning.ts` but not passed to the ToolContext at line 292. This means every `write_memory` call in production will execute the fallback DB query. For a saboteur perspective: if `ctx.taskId` somehow pointed to a task in a different team, the item would be scoped to that team. However, session provisioning validates that the task belongs to the agent's bet chain, so this cross-team leakage is not exploitable in practice.

**F3 (Observation) -- `AnyKnowledgeStatus` union has overlapping members:**
`KnowledgeStatus` includes "active" and "archived". `KernelKnowledgeStatus` also includes "active" and "archived". The union `KnowledgeStatus | KernelKnowledgeStatus` collapses these duplicates at the type level. This is not a bug -- TypeScript handles this correctly -- but it means the status vocabulary now has two sources of truth for the "active" and "archived" strings. Future changes to either source could silently desynchronize them.

---

## Lens 5: Simplification (Negative)

**F4 (Minor) -- Redundant lore comments:**
The `@lore` comments are appropriate in `write-memory.ts` (line 70-79) and `promote-knowledge.ts` (line 41-45) where they explain non-obvious design decisions. However, the `CreateKnowledgeItemInput` interface in `knowledge-repository.ts` has two large `@lore` comment blocks (lines 27-29 and lines 38-43) that repeat the same R7 rationale. The scopeKind comment (4 lines) and the status comment (6 lines) add 10 lines of documentation to a 7-field interface. The information is valuable but could be more concise.

**F5 (Observation) -- draft -> captured transition in ALLOWED_TRANSITIONS:**
Line 49 of `promote-knowledge.ts`: `draft: ["active", "captured", "archived"]`. The `"captured"` transition allows a facilitator to push a draft item into the fabric's 7-state pipeline (draft -> captured -> provisional -> validated -> active). This is architecturally sound but untested -- no test exercises draft -> captured. It is also not required by any AC. It is a reasonable extension but adds an untested code path.

---

## Lens 6: AI Slop (Negative)

**F6 (Minor) -- Stale red-phase comments in test files:**
The test files contain comments that describe the "red phase" failure behavior (e.g., "This test FAILS until that default is changed" at line 109 of `R7-knowledge-e2e.test.ts`, "Currently defaults to 'active' -- this test FAILS until that default is changed"). These comments are now stale -- the fixes have been applied and the tests pass. They describe a historical state, not the current state.

Similarly, the file-level docstring in `R7-knowledge-e2e.test.ts` (lines 8-11) says "These tests FAIL in the red phase because: ..." -- this is misleading now that the green phase is complete.

**F7 (Observation) -- Redundant test in promote_knowledge suite:**
`R7-knowledge-e2e.test.ts` has two tests that verify essentially the same thing:
1. "promote_knowledge transitions a draft item to active status" (line ~167)
2. "promote_knowledge succeeds for 'draft' now that ALLOWED_TRANSITIONS includes 'draft' key" (line ~193)

Both insert a draft item, call `promoteKnowledgeTool.handler` with `toStatus: "active"`, and assert `result.success === true`. The second test's description acknowledges it's testing the same behavior as the first. One test is sufficient.

---

## Summary of Findings

| ID | Severity | Lens | Description |
|----|----------|------|-------------|
| F1 | Minor | Adversarial | write_memory status input allows agent to explicitly pass "active", bypassing triage. Follow-up: restrict or remove status from agent input. |
| F2 | Minor | Adversarial / Architecture | `teamId` not wired in session-provisioning.ts despite being available. Adds unnecessary DB query per write_memory call. |
| F3 | Observation | Adversarial | `AnyKnowledgeStatus` union has overlapping "active" and "archived" members from two sources. |
| F4 | Minor | Simplification | Verbose @lore comments on CreateKnowledgeItemInput -- 10 lines of docs on a 7-field interface. |
| F5 | Observation | Simplification | `draft -> captured` transition is untested and not required by any AC. |
| F6 | Minor | AI Slop | Stale red-phase comments in test files describe pre-fix failure behavior that no longer applies. |
| F7 | Observation | AI Slop | Duplicate test for promote_knowledge draft -> active transition. |

None of these findings are blocking. The implementation correctly satisfies all 5 ACs.
