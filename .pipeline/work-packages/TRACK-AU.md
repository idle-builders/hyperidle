# Track AU: Event-Driven Agent Runtime Boundary

This track separates the collaboration domains from the agent runtime. Work, Conversation, Knowledge, and Routine code should express intent as a durable/session request, while the agent runtime owns session lifecycle, harness selection, harness execution, tools/MCP, writeback, and lifecycle events.

The point is not a new harness path. The point is one contract for every agent run: task-backed work, assistant turns, routine-triggered runs, knowledge actions, and decomposition work all become task-optional session requests consumed by the same runtime boundary. That gives future local and remote provisioners the same input and output shape.

**Reference.** `docs/architecture/as-implemented-domain-architecture.md`; `.pipeline/work-packages/TRACK-AR.md` (real harness proof boundary); `packages/server/src/services/session-provisioning.ts`; `packages/server/src/harness/`; current domain callers in Work, Conversation, Knowledge, and Routines.

---

### AU1 — Event-driven session requests between collaboration domains and the agent runtime

**Work package.** As a maintainer evolving HyperIdle's agent runtime, I want Work, Conversation, Knowledge, and Routine flows to request agent runs through one task-optional session request boundary instead of calling local provisioning or adapters directly, so that the agent session/harness layer owns execution consistently. When this ships, a domain flow records or emits a session request with its domain context, the agent runtime consumes it, provisions a session through the same session/harness path, and publishes session lifecycle events back for domains and UI to react to. Task-backed work keeps working, but task-free runs such as assistant turns, routines, knowledge actions, and bet decomposition no longer need fake tasks or direct adapter calls. This creates the boundary remote provisioners need: they consume the same request and emit the same session events, regardless of where the harness runs.

**Why this matters.** The maintainer benefits because the real harness integration test boundary becomes clear: test session request -> runtime -> harness once, then test domain flows above it without rerunning the harness for every user journey. Users benefit because assistant/chat, work, routines, and future knowledge-agent actions all become normal agent runs instead of separate special cases. Not building this keeps `taskId` as a hidden global requirement, forces stub tasks, and leaves decomposition paths on direct adapter/provisioning calls that remote workers cannot own cleanly.

**Type.** backend / architecture.

**What exists today.** `provisionSession` is the shared session orchestrator and `AdapterPool`/`HarnessAdapter`/tool/MCP/writeback/session lifecycle are implemented and covered by AR harness integration tests. Task dispatch already requests provisioning for accepted tasks. Assistant and routine paths still need task-shaped compatibility because `sessions.taskId` is non-null. Bet decomposition uses direct adapter/runtime calls rather than entering through a task-optional session request. Domain events already exist through `EventBus`, and session events already notify consumers, but there is no single durable request contract owned by the agent runtime.

**What's genuinely missing.** There is no collaboration-to-runtime contract for "an agent run is requested," and no task-optional session identity model. Collaboration domains are coupled to `provisionSession`, `taskId`, or adapter/runtime details. The missing boundary is an event/message-style request consumed by the agent runtime and answered with session lifecycle events.

**Depends on.**
- **AR2** — AU1 builds on the proven production session/harness seam and capture-before-teardown pattern; without it the new boundary would not have a reliable runtime proof.
- **AR4** — assistant turns are one of the task-free consumers that must remain harness-agnostic; AU1 should not start until the current assistant provisioning cleanup is settled.

**Complexity.** L

**Pre-build gates.**
- Refinement required: sharpen the session request contract, task-optional session identity, and domain correlation semantics before architecture.
- Design not required: backend/runtime boundary only, no new UI surface.

**Human concept review.** No. This is a backend architecture boundary with no new user-facing concept.

**Acceptance criteria.**
- A task-optional session request can represent task, routine, assistant/conversation, knowledge, and decomposition-triggered agent runs without fabricating a task id.
- Work, Conversation, Knowledge, and Routine domains use the session request boundary rather than invoking local provisioning or harness adapters directly.
- The agent runtime is the sole owner of provisioning behavior: adapter selection, harness start/stream/stop, tool/MCP invocation, writeback/capture, and lifecycle persistence/events.
- Session lifecycle events carry enough correlation data for originating domains and UI to update state without direct calls back into the runtime.
- Existing task-backed dispatch behavior remains observable at the API/user level.
- Direct decomposition adapter calls and assistant/routine stub-task paths are removed, or isolated behind a documented compatibility migration with no new callers.
- Local and remote provisioners can consume the same request contract; collaboration domain code does not need to know where the harness runs.
- Harness integration tests remain focused at the session/runtime boundary; domain-level tests prove request emission and event reaction without rerunning the real harness for every consumer flow.

**Validation scenarios.**
- Given an accepted task emits a session request, when the agent runtime consumes it, then a real session is provisioned through the existing session/harness path and the task/domain reacts to the final lifecycle event.
- Given an assistant message, routine trigger, or knowledge action without a task, when the domain emits a session request, then a session is created with the right source correlation and no fake task row.
- Given bet decomposition needs a PM agent run, when decomposition starts, then it enters through the session request/runtime boundary rather than direct adapter start.
- Given a remote provisioner is selected, when the same session request is consumed remotely, then the caller observes the same lifecycle events as the local provisioner path.

**Plan calls.** Run `/pipeline:refine` first, then standard `/pipeline:architecture`. The plan must map each current caller that starts or intends to start an agent run, define the session request/event contract, define task-optional session identity and source correlation, plan data migration/backcompat, and separate runtime-bound real-harness tests from domain-level request/event tests. No `/pipeline:design` unless a later refinement adds a visible UI surface.

**Contracts / constraints.**
- No new parallel harness execution path; the existing runtime/harness path remains the only way to call an LLM.
- `HarnessAdapter` is runtime-facing only; collaboration domains never call adapters directly.
- Task-backed sessions keep their current user/API behavior.
- The request/event contract must be durable, idempotent, and correlation-safe enough for remote worker consumption.
- Real harness tests stay at the session/runtime boundary; domains above it use service/API/DB tests.
- No preemptive security gates or enterprise worker-control features.

**Out of scope.**
- Implementing the remote worker protocol, worker registration UI, or cloud worker scheduling.
- Adding new harness types or changing harness capability descriptors.
- Eval redesign or eval suite changes.
- New user-facing agent controls beyond preserving existing status behavior.
- Per-agent sandboxing or credential isolation.

**Effort.** L (~5d)
