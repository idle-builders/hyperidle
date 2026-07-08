DOC-CLASS: significant

# AU1 Requirements - Event-Driven Session Requests

Human concept review override: required after architecture, despite `TRACK-AU.md` saying "Human concept review: No." The work has no UI design surface, but the maintainer explicitly requires review of the requirements and architecture before implementation.

## Required Reading

- `.pipeline/work-packages/TRACK-AU.md` - AU1 work package, acceptance criteria, validation scenarios, constraints.
- `docs/architecture/runtime-simplification.md` - Track AU strategic frame and core app / agent layer boundary.
- `docs/architecture/as-implemented-domain-architecture.md` - current domain map and live session/event contracts.
- `docs/architecture/run-unit-model.md` - host run-unit, teardown capture seam, real harness proof pattern.
- `plans/strategy-kernel-plugin-split/dependency-graph.md` - as-is Strategy/Fabric/session caller graph.
- `plans/strategy-kernel-plugin-split/as-should-dependency-graph.md` - target Agent Layer and Session Request Queue shape.
- `plans/strategy-kernel-plugin-split/component-inventory.md` - current component ownership and AU migration risks.
- `.pipeline/work-packages/TRACK-AR.md` - real harness boundary rules, especially AR2/AR4/AR5 constraints.

## Goal

AU1 introduces one durable, task-optional session request boundary between core collaboration domains and the agent runtime. Work, Conversation, Knowledge, Routine, and decomposition flows should request an agent run by recording or emitting a typed request with source correlation. The agent runtime consumes that request, provisions the session through the existing session/harness path, and publishes lifecycle events that domains and UI can react to.

## Value And Audience

Primary audience: maintainers evolving the runtime. They get one contract to reason about, test, and later hand to local or remote provisioners.

Secondary audience: users. Existing task-backed work keeps working, while assistant turns, routines, knowledge actions, and decomposition stop relying on fake tasks or bespoke adapter calls.

## Success

- A task-backed agent run and a task-free agent run both enter the same runtime request path.
- Session records can identify their source without requiring a task row.
- Domains never call `provisionSession`, `HarnessAdapter`, or adapter-pool details directly.
- Runtime lifecycle events include enough source/correlation data for Work, Conversation, Knowledge, Routine, and UI consumers.
- Existing real harness tests stay focused on request -> runtime -> harness; domain tests prove request emission and lifecycle reaction without spawning real harnesses repeatedly.
- No implementation starts until the required human concept review approves this requirement and the architecture plan.

## Scope

In scope:

- Define the `AgentSessionRequest` noun and task-optional session identity.
- Add durable request storage and idempotent claim/consume behavior.
- Widen session lifecycle events with source/correlation data.
- Migrate task dispatch, assistant turn, routine session, knowledge-triggered run foundation, proposed-call re-engagement, and bet decomposition entry points onto request emission. Proposed-call re-engagement is included because the live task dispatcher already starts a second agent session from `proposed_call_granted`; AU1 must keep that existing LLM-capable caller from remaining a direct task-dispatch/provisioning path. AU4 will later decide trigger rules for the event, not the runtime request boundary.
- Keep `provisionSession` as the internal runtime orchestrator; domains no longer call it.

Out of scope:

- Remote worker transport, registration UI, worker scheduling, or cloud worker fleet behavior.
- Trigger resolution and plugin-default configuration; AU2/AU4 own those.
- New harness types, harness capability redesign, eval redesign, or sandbox/credential isolation.
- New user-facing agent controls beyond preserving existing observable status.

## Guide Draft

After AU1, developers start an agent run by creating an `AgentSessionRequest` with:

- `sourceKind` describing the origin: `task`, `assistant`, `routine`, `knowledge`, `decomposition`, or `proposed_call`.
- `sourceId` and optional `taskId` for task-backed work.
- `agentId`, team/user/thread/routine/bet correlation, and payload needed by the runtime.
- `idempotencyKey` so retries and duplicate domain events do not start duplicate runs.

The agent runtime owns request consumption. It claims a pending request, creates a session through the existing provisioning path, starts the harness, invokes tools/MCP, captures/writebacks output, and publishes lifecycle events with the original request id and source correlation. Domain code listens to lifecycle events or reads projected state; it does not reach back into provisioning internals.

Task runs continue to behave as before from the API/user point of view. Task-free runs no longer create conversation/routine/decomposition stub tasks just to satisfy `sessions.task_id`.

### Source Correlation Matrix

| sourceKind | sourceId | streamId | Required correlation |
| --- | --- | --- | --- |
| `task` | task id | `task:<taskId>` | `taskId`, `teamId`, optional `proposedCallId` for approved follow-up sessions |
| `assistant` | triggering message id | `thread:<threadId>` | `threadId`, `messageId`, `userId`, `assistantAgentId` |
| `routine` | routine run id | `routine:<routineId>` | `routineId`, `routineRunId`, `teamId` |
| `knowledge` | knowledge item id plus action | `knowledge:<knowledgeItemId>` | `knowledgeItemId`, action, scope/team correlation when present |
| `decomposition` | bet id | `bet:<betId>:decomposition` | `betId`, `teamId`, PM/decomposer agent id |
| `proposed_call` | proposed call id | `task:<taskId>` | `taskId`, `proposedCallId`, granted agent id |

## Nouns

### Agent Session Request

A durable request for the agent runtime to run an agent on behalf of a core domain event or action.

Not a trigger: triggers decide whether an event should cause work and which agent/prompt to use; AU1 only defines the request boundary after that decision.

Hard rules:

- Must be durable and idempotent.
- May reference a task, but must not require one.
- Must carry enough source correlation for lifecycle projection without domain-specific callbacks.
- Must be consumable by local and future remote provisioners through the same contract.

### Source Correlation

The domain identity attached to a session request and repeated on lifecycle events so originators can update state.

Not a task surrogate: task correlation is one optional case, not the universal identity.

Hard rules:

- `requestId` is the runtime correlation root.
- `taskId` remains present only when the source is task-backed.
- Each source kind must have a stable source id and stream id.
