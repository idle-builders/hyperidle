DOC-CLASS: minor

# AU6 Requirements: Agent Execution Boundary Closure

## Required Reading

- `.pipeline/work-packages/TRACK-AU.md` AU6 section
- `.pipeline/plans/AU4.md`
- `docs/architecture/as-implemented-domain-architecture.md`
- `docs/architecture/run-unit-model.md`
- `docs/agent-layer/agent-model.md`
- `docs/agent-layer/harness-capability-descriptor.md`
- `docs/process-layer/tasks-and-sessions.md`
- `docs/process-layer/bets-shape-commit-change-ship.md`
- `docs/process-layer/routines-and-retros.md`
- `docs/process-layer/staged-operation.md`

## Sharpened Goal

Value: maintainers get one execution boundary for every LLM-capable action. Core domains record intent and react to lifecycle state; they do not import or call harness, MCP, context, provisioning, or tool execution internals.

Success: task acceptance, assistant turns, routine fires, knowledge actions, bet decomposition, and proposed-call re-engagement can all be expressed as agent run requests. The agent layer owns admission, session provisioning, context assembly, tool/MCP exposure, capture/writeback, and lifecycle publication. Domains can observe `requested`, `running`, `completed`, `failed`, and `cancelled` through a stable read model without knowing the execution implementation.

Scope:
- In: a named agent-layer run request/execute/read boundary over the existing `AgentSessionRequest` path.
- In: lifecycle read model helpers that normalize request statuses into domain-observable run states.
- In: migration of direct domain/runtime calls to the boundary where they currently consume requests themselves.
- In: tests proving request creation, execution ownership, lifecycle observation, uniform failure, and preserved existing source behavior.
- Out: new harnesses, remote worker scheduling, Settings UI, plugin distribution, and removal of the Fabric package or Strategy runtime as a whole.

## Boundary Noun

Agent run boundary: the server-side agent-layer API that accepts a domain intent as a durable run request, executes it through the runtime, and exposes lifecycle state back to domains.

It is not:
- A new harness path.
- A separate orchestration framework.
- A domain-owned executor.
- A replacement for AU4 trigger resolution; AU4 chooses the request binding before this boundary executes it.

Hard rules:
- Every execution begins from a durable `AgentSessionRequest` row.
- Execution internals stay behind the agent layer: harness selection, admission, context assembly, tools/MCP, capture, writeback, and lifecycle writes.
- Domains receive lifecycle state by request/source/session correlation, not by importing provisioning internals.

## Developer Guide Draft

When a domain needs agent work, create an agent run request and hand it to the agent layer. Use source metadata to correlate the run with the domain record. The domain may read run state through the lifecycle helper, which returns a common state shape for all source kinds.

Do not call `provisionSession`, `admitSession`, `runSession`, harness adapters, MCP bridge setup, context assembly, or writeback services from core domains. Those are agent-layer implementation details. Domain services own records, events, and reactions to terminal lifecycle state.

The runtime still uses the existing request table and session provisioning engine. AU6 makes the ownership boundary explicit and testable so AU7 can retire remaining Fabric/Strategy runtime nouns without changing user-visible behavior.
