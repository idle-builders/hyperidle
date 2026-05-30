# R5 Concept: Agent Work Loop

**Status:** Concept locked. No new primitives, no reshaped concepts. Integration verification only.

---

## Required reading for downstream skills

- `packages/server/src/services/session-provisioning.ts` -- 11-phase orchestrator, cost_update/token_usage/tool_call event handling
- `packages/server/src/skill-tools/tool-registry.ts` -- ALL_TOOL_DEFINITIONS, ToolContext, tool authorization
- `packages/server/src/skill-tools/handoff-to.ts` -- current toHuman handoff path (creates review *item*, not review *message*)
- `packages/server/src/skill-tools/send-message.ts` -- plain message sending (no review-type support)
- `packages/server/src/routes/sessions-routes.ts` -- POST /api/sessions, full provisionSession path (R1 wiring)
- `packages/server/src/routes/tasks.ts` -- POST /api/tasks (task creation via REST, not via skill tool)
- `packages/server/src/routes/threads.ts` -- POST /api/threads/:id/messages (verdict posting, authorization logic)
- `packages/server/src/routes/threads-schema.ts` -- messageInputSchema, reviewPayloadSchema, verdictPayloadSchema
- `packages/server/src/routes/bets.ts` -- GET /api/bets/:id (bet detail with costActual, tokensActual, tasks)
- `packages/fabric/src/services/cost-cap.ts` -- recordCostAndCheck (accumulates on users/teams, NOT bets)
- `packages/shared/src/thread.ts` -- Message types, ReviewPayload, VerdictPayload, VerdictDecision
- `packages/web/src/pages/WorkBet.tsx` -- bet detail page: task table, cost section, HostThreadSection
- `packages/design-system/src/RichMessageCard.tsx` -- review/questionnaire card with verdict action buttons
- `plans/R1/architecture.md` -- R1 wiring decisions (adapter lifecycle, credential resolution, POST route)

---

## Phase 0 -- Nouns

| Noun | Working definition | Classification |
|---|---|---|
| **Bet** | Time-boxed unit of work with a pitch, cost appetite, and status. | **Stable concept** -- R5 uses it as-is. |
| **Task** | Decomposition unit within a bet. Has state machine, owner, cost. | **Stable concept** -- R5 uses it as-is. |
| **Session** | One bounded agent run against a task. Has cost, outcome, state. | **Stable concept** -- R5 uses it as-is. |
| **Thread** | Container for typed messages, attached to a host entity. | **Stable concept** -- R5 uses it as-is. |
| **Message** | Element inside a thread: plain, review, questionnaire, verdict. | **Stable concept** -- R5 uses it as-is. |
| **ReviewPayload** | Structured payload for a review-type message: title, reasoning, artifactRef. | **Stable concept** -- R5 uses it as-is. |
| **VerdictPayload** | Structured payload for a verdict-type message: decision, resolvesMessageId, note. | **Stable concept** -- R5 uses it as-is. |
| **Cost** | Money in minor units + currency code. Accumulated from sessions. | **Stable concept** -- R5 uses it as-is (L17 shape). |
| **Skill Tool** | Agent-callable tool with Zod input schema and handler. Bound to ToolContext. | **Stable concept** -- R5 may add new tools but the pattern is unchanged. |

**Central question: does R5 introduce a new concept?**

No. R5 is an integration verification workpackage. Every noun is stable and defined in existing concept docs. The work is finding and closing protocol gaps in the existing data flows.

---

## Phase 1 -- Gap analysis (the real work of this concept pass)

Since all nouns are stable, the concept-level work is verifying that the existing primitives compose correctly to support the 5 acceptance criteria. Each AC maps to a data flow. I trace each flow and identify whether it works end-to-end or has a gap.

### AC1: Agent creates tasks via skill tools

**Expected flow:** Agent calls `create_task` tool -> handler inserts into `tasks` table -> GET /api/bets/:id returns task in task list -> WorkBet renders task row.

**Gap: No `create_task` skill tool exists.** The tool registry (`ALL_TOOL_DEFINITIONS`) includes `log_task`, `send_message`, `handoff_to`, `create_item`, `write_session_notes`, etc. -- but no task-creation tool. Tasks CAN be created via the REST endpoint `POST /api/tasks`, but agents don't call REST endpoints -- they call skill tools. The spec says "creates tasks using skill tools."

**Resolution:** Add a `create_task` skill tool. The tool accepts `{ title, description?, doneCondition?, ownerAgentId? }`, derives `betId` from the task the session is running against (via `ctx.taskId -> task.betId`), and inserts into the `tasks` table. This is the minimum fix to close the gap. No new concept -- it's a new implementation of the existing ToolDefinition pattern.

### AC2: Agent submits a review message

**Expected flow:** Agent calls a tool to submit a review -> handler creates a review-type message on the bet's host thread -> GET /api/threads/:id returns the message -> ThreadShell/HostThreadSection renders it -> `promotedRichMessageId` picks it -> RichMessageCard renders.

**Gap: No skill tool submits review-type messages.** Two adjacent mechanisms exist:
1. `handoff_to` with `toHuman: true` creates a review *item* in the `items` table and an attached thread on the *task* -- but this does NOT create a review-type *message* in the L1 thread primitive. It creates a legacy `items` row.
2. `send_message` creates plain-type messages only. It does not support the `review` message type.

**Resolution:** Add a `submit_review` skill tool. The tool accepts `{ title, reasoning[], artifactRef }`, finds or creates a thread attached to the bet (`hostKind: "bet"`, `hostId: betId`), posts a review-type message, and makes the agent a participant. This uses the existing ReviewPayload shape, the existing thread POST route, and the existing message insertion pattern. No new concept.

### AC3: User submits verdict, agent reads it

**Expected flow:** User clicks Approve/Reject on RichMessageCard -> POST /api/threads/:id/messages (verdict type) -> message persisted -> agent calls `read_inbox` -> sees verdict message.

**Assessment: Works if the agent is a thread participant.** The verdict posting path is fully implemented (threads.ts L490-556). The `read_inbox` tool reads messages from threads where the agent is a participant. If the `submit_review` tool (from AC2 fix) makes the agent a participant on the bet's thread, then verdicts posted to that thread will be readable by the agent.

**No gap, contingent on AC2 fix.** The `submit_review` tool must add the agent to the thread's participants array.

### AC4: Cost flows through and displays in WorkBet

**Expected flow:** Harness reports cost_update events -> `recordCostAndCheck` accumulates cost -> GET /api/bets/:id returns costActual -> WorkBet renders cost section.

**Gap: Cost does not accumulate on bets.** `recordCostAndCheck` (fabric/services/cost-cap.ts) updates `users.costActual` and `teams.costActual` but NOT `bets.costActualMinor`. The WorkBet page (line 930-951) renders `bet.costActual` and `bet.tokensActual`, but the bet detail route (bets.ts L310-325) reads from `bets.costActualMinor` / `bets.tokensActualJson`, which are never written by the session provisioning flow.

The `bets` table has `costActualMinor`, `costActualCurrency`, and `tokensActualJson` columns (schema.ts L97-100), but no code writes to them from session cost events.

**Resolution:** Extend `recordCostAndCheck` (or add a companion function) to accumulate cost on the bet associated with the session's task. The flow: `session.taskId -> task.betId -> bets.costActualMinor += delta`. Similarly, token accumulation at session end should update `bets.tokensActualJson`.

### AC5: Task status updates reflected in WorkBet

**Expected flow:** Agent calls a tool that transitions task state -> `transitionTask` updates `tasks.state` -> GET /api/bets/:id returns updated task list -> WorkBet renders StatusChip.

**Assessment: Partially works.** The session provisioning orchestrator calls `transitionTask(db, eventBus, params.taskId, "in_progress")` in Phase 3, which moves the session's own task to `in_progress`. For *other* tasks the agent creates (via AC1 fix), their initial state would be `proposed`. The agent has no tool to transition task state directly -- but this is appropriate because task state transitions happen through the REST API or through session provisioning, not through agent tools.

**Gap: Agent cannot update status of tasks it creates.** The `create_task` tool (from AC1 fix) will create tasks in `proposed` state. There's no skill tool to transition a task to `accepted`, `done`, etc. The agent would need to use `handoff_to` to complete a task (which doesn't transition to `done` -- it transitions to `blocked` for human review). For the integration verification, we need a way for task status updates to appear.

**Resolution:** The `create_task` tool should accept an optional `state` parameter (defaulting to `proposed`). The agent can create tasks directly in `accepted` or `in_progress` state. Additionally, the `handoff_to` tool already transitions tasks -- when an agent completes work and hands off to human review, the task moves to `blocked`. The WorkBet table already shows StatusChip for all task states. For full status lifecycle, we may need a `transition_task` skill tool -- but this is the *minimum* needed for the acceptance criteria.

---

## Phase 2 -- What R5 IS and IS NOT

### What R5 IS

R5 is an **integration verification workpackage**. It runs an agent against a real bet and fixes the broken connections in the data flows between:
- Agent skill tools -> DB writes
- DB writes -> API responses
- API responses -> UI rendering

The fixes are:
1. Two new skill tools (`create_task`, `submit_review`) that close the tool-gap between what agents need and what skill tools provide.
2. Cost accumulation on bets (extending the existing `recordCostAndCheck` path).
3. Possibly token accumulation on bets at session end.

### What R5 IS NOT

1. **R5 is NOT introducing new domain concepts.** Every noun, every type, every state machine is pre-existing.
2. **R5 is NOT changing the skill tool pattern.** New tools follow the exact same `ToolDefinition<Input>` pattern.
3. **R5 is NOT changing the Thread primitive.** Review messages and verdicts use the existing L1 thread type system.
4. **R5 is NOT adding automatic session triggering.** Sessions are triggered manually via POST /api/sessions.
5. **R5 is NOT modifying existing skill tool signatures.** Existing tools are unchanged.

---

## Phase 3 -- Vocabulary

| Term | Definition | Aliases not to use |
|---|---|---|
| **create_task** | Skill tool: agent creates a new task under its bet. | "add_task", "new_task", "decompose" |
| **submit_review** | Skill tool: agent posts a review-type message to the bet's host thread. | "request_review", "send_review", "handoff_review" |
| **bet cost accumulation** | The process by which session cost flows to the bet's costActualMinor column. | "bet cost rollup", "cost propagation" |

---

## Phase 4 -- Contracts

### New skill tools

- **Cardinality:** Both new tools are available to all agent roles (`roles: undefined`). Task creation and review submission are not restricted by role.
- **Closure:** The skill tool list is open (addable without concept-doc changes). These are new implementations of the existing ToolDefinition pattern.
- **Mutability:** Tools produce DB writes (inserts). The writes are final -- no undo mechanism.
- **Identity:** Tools derive IDs from `crypto.randomUUID()`, matching all existing tools.

### Cost accumulation on bets

- **Cardinality:** One bet has many tasks, each task has many sessions. Cost accumulates upward: session -> task -> bet.
- **Mutability:** `bets.costActualMinor` is monotonically increasing (only additive cost updates). Token accumulation is additive by tier.
- **Hard rule:** Cost accumulation on the bet MUST use the same `recordCostAndCheck` call path that already accumulates on agents/teams. This prevents drift between the three accumulators.

---

## Phase 5 -- No concept-doc ground-truth updates needed

All nouns are stable. No `docs/` files need updating. The gaps identified are implementation gaps (missing tools, missing DB writes), not concept gaps.

---

## Phase 6 -- Self-critique

**Does this concept contradict existing docs?** No. The identified gaps are implementation omissions, not concept violations. The Thread, Message, Review, Verdict types are used as designed.

**Is the rejection list real?** Yes. Each rejection (not new concepts, not automatic triggering, not signature changes) is distinct and has a concrete rationale.

**Are the contracts complete?** Yes, for the scope of R5. The two new tools follow existing patterns. The cost accumulation contract is the only new commitment.

**Is the rationale concrete?** Yes. Each gap is traced to specific code files with line numbers. The resolution for each gap is the minimum change needed.

**Is the gap analysis exhaustive?** Cross-checked all 5 ACs against the codebase. The critical gaps are:
1. Missing `create_task` tool (AC1)
2. Missing `submit_review` tool (AC2)
3. Missing bet cost accumulation (AC4)

AC3 (verdict readback) works contingent on AC2 fix. AC5 (task status updates) partially works and is fully addressed by the `create_task` tool + existing `transitionTask` in session provisioning.

**Does "submit_review" collide with anything?** The `handoff_to` tool with `toHuman: true` creates a review *item* (legacy `items` table), not a review *message*. The names are distinct. The `submit_review` tool creates a review-type *message* on the L1 thread primitive. These are different mechanisms targeting different tables.

---

## Summary of gaps for architecture

| Gap | AC | Severity | Fix category |
|---|---|---|---|
| No `create_task` skill tool | AC1 | Critical | New skill tool |
| No `submit_review` skill tool | AC2 | Critical | New skill tool |
| Cost not accumulated on bets | AC4 | Critical | Extend `recordCostAndCheck` |
| Token accumulation not written to bets | AC4 | Medium | Extend session teardown |
| Agent needs thread participation for verdict readback | AC3 | Medium | Handled by `submit_review` tool |
