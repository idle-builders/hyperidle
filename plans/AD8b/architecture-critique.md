# AD8b Architecture Critique -- Assistant Agent + Overlay

ARCHITECTURE-SCORE: 8/10 rounds=1 score-line: SA:7 LI:9 AC:8 DM:8 N:9 MD:8 FMC:7 S:9 V:8

**Verdict: PASS.** Score 8/10 exceeds the 7-point threshold. Advances to build phase. One critical finding, two warnings, and three suggestions below.

---

## CRITICAL

**C1: [plan S7 Task 4] Thread lookup breaks with conditional pinning.** The current GET `/api/threads/coach` query finds the assistant thread via `eq(threads.pinned, true)`. The plan changes the thread to start `pinned: false` (conditional pinning per AC-6). On the second overlay open -- before the assistant has responded -- the query will fail to find the thread because `pinned=false` does not match the `pinned=true` filter.

The plan must specify the new query strategy. Two options:
(a) Remove the `pinned` filter and find by `hostKind="user"` + `hostId=userId` + participants contains the user's assistant agent id.
(b) Use a deterministic thread id pattern (e.g., `thr-assistant-${userId}`) and look up by id directly.

Option (b) is simpler and already half-present in the codebase (`thr-coach-${userId}`). The builder needs this resolved before implementing Task 4. Without it, the overlay will show an empty/error state on second open until the assistant responds.

---

## WARNING

**W1: [plan S0 / spec line 382] Portfolio-retro routine adoption missing from task list.** The spec explicitly lists "Adopt `portfolio-retro` routine: scoped to the user's teams (not factory-wide)" as deliverable #8 (line 382). The plan's scope section (S0) lists it as one of nine deliverables. But no task in the ordered task list (S7) addresses it. Risk 4 defers routine reassignment to AD8c, but the spec places this work in AD8b. Either: (a) add a task to the plan that reassigns `builtin:portfolio-retro` ownership from `seed-agent-cos` to the per-user assistant and scopes it to the user's teams, or (b) explicitly document that this deliverable is deferred to AD8c with a rationale that the builder can verify (e.g., it depends on AD8c's facilitator cleanup).

The `builtin:portfolio-retro` routine is seeded with `ownerAgentId: "seed-agent-cos"` in `seed-fixtures.ts` line 78. The integration test at `builtin-routines.integration.test.ts:137` asserts this ownership. If AD8b changes the owner, that test assertion must be updated.

**W2: [plan S5.2] classifyThreadConfiguration uses pinned as the assistant discriminant, which creates a classification gap.** The plan says the unpinned assistant thread classifies as "dm" because it falls through to the DM branch (`hostKind === "user" && participants.length === 2`). This is technically correct but semantically wrong -- the thread is an assistant thread from creation, not a DM. If any consumer switches on `ThreadConfiguration` to display DM-specific UI (e.g., a DM badge or DM-specific empty state), the assistant thread would incorrectly receive that treatment before pinning. The builder should verify there are no such consumers. If there are, the classifier needs a different discriminant (e.g., check if a participant has role="assistant").

---

## SUGGESTION

**S1: [plan S5.1] PlainPayloadWithBlockId not addressed.** `thread.ts` exports both `PlainPayload` and `PlainPayloadWithBlockId`. They have overlapping structure but are separate interfaces. The plan extends `PlainPayload` with `toolCalls` but does not mention `PlainPayloadWithBlockId`. This creates a type system split where some consumers (HostThreadSection, KnowledgeDetail) use the `WithBlockId` variant and would not see `toolCalls`. While assistant messages should use `PlainPayload` (not `WithBlockId`), the builder should consider whether these two interfaces should be consolidated or whether `PlainPayloadWithBlockId` should also get the `toolCalls` field for consistency.

**S2: [plan S7 Task 9] No LLM failure handling specified.** The assistant dispatcher provisions a session and the session calls the LLM. The plan does not specify: (a) max tool calls per assistant response (prevent infinite loops), (b) timeout for the LLM call, (c) behavior when the LLM returns an error (does the assistant post a "sorry, something went wrong" message? is the session marked as crashed?). The existing session-provisioning infrastructure handles session crashes (the `crashSession` function exists in `session-lifecycle.ts`), but the plan should confirm that the assistant dispatcher uses it and specify user-visible error behavior.

**S3: [plan S7 Task 9] Thread pinning race condition mitigation is vague.** Risk 3 identifies that two messages before the first response could provision two sessions. The mitigation says "the task-dispatcher already has concurrency-limit logic -- reuse it." The builder needs specifics: should the assistant-dispatcher maintain its own `Map<threadId, sessionId>` of in-flight sessions? Should it use the existing `sessions` table to check for active sessions? The concurrency-limit in task-dispatcher is per-agent, not per-thread -- is that the right granularity?

---

## What's Working Well

- **Plan reconciliation table (S1) is thorough.** 20 spec-vs-reality checks with EXISTS/CONFIRMED/DOES NOT EXIST verdicts. Every claim I verified against the codebase was accurate (soulPrompt column exists, PlainPayload shape confirmed, ThreadMessageAppendedEvent exists at line 187, seed-agent-cos exists, etc.). This is the standard other plans should match.
- **Design-it-twice sections are genuine.** Both decisions (event-driven dispatch vs. inline dispatch, PlainPayload extension vs. separate table) have real tradeoffs articulated. The rejections are specific ("violates the three-layer boundary," "extra join on every message fetch"), not straw-manned. Option B in each case was a plausible alternative that was rejected for concrete reasons.
- **Security analysis is comprehensive.** 9 concerns systematically evaluated. The soul prompt injection analysis is particularly good -- correctly identifying that structural guardrails (review messages for high-risk tools) cannot be bypassed by prompt manipulation because the dispatcher controls execution, not the LLM.
- **Protected tests section is populated** with 4 specific test files and a rationale for why they should not change.
