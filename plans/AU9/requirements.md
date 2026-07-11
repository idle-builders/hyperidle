DOC-CLASS: minor

# AU9 — Hard agent handoff boundary

## Required reading

- `.pipeline/work-packages/TRACK-AU.md` — AU corrective-closure rule and AU9 contract.
- `plans/strategy-kernel-plugin-split/as-should-dependency-graph.md` — acceptance target.
- `plans/strategy-kernel-plugin-split/as-is-vs-should-dependency-graph.md` — current gap inventory.
- `docs/architecture/runtime-simplification.md` — core-app/agent-layer ownership.
- `docs/architecture/run-unit-model.md` — durable run and lifecycle model.
- `docs/process-layer/tasks-and-sessions.md` — task/session observable behavior.
- `docs/process-layer/handoff-and-lifecycle-propagation.md` — lifecycle reaction rules.

## Sharpened goal

### Value and audience

Maintainers get one explainable start boundary for all agent work. Core application code records product intent and publishes domain facts; it never chooses triggers, constructs an `AgentSessionRequest`, admits a run, or waits on execution. The agent layer consumes intent, resolves effective configuration, creates the durable request, runs it, and publishes lifecycle events. This removes the most consequential forbidden edge in the should graph without changing what users observe.

### Observable success

- Assistant messages, explicit session starts, knowledge actions, routine fires, decomposition, ready/accepted tasks, and granted re-engagement enter execution from an agent-layer event subscriber.
- The first core-to-agent artifact is a persisted domain intent plus its domain event; no route or core-domain service imports request construction or execution APIs.
- Request creation, trigger resolution, admission/execution, and lifecycle publication occur only behind the agent-layer subscriber/orchestrator boundary.
- Existing success, failure, cancellation, completion, reply, task/session, routine-run, decomposition, and re-engagement observations remain available.
- Static validation fails if core routes/domain services regain request/runtime imports.
- After a process dies between committing intent and delivering its in-process wake event, boot reconciliation discovers the pending intent and creates exactly one correlated run request.

### Scope

In scope: define typed intent events where an existing event is insufficient; persist explicit intent when the initiating domain lacks a durable source record; move direct handoff out of routes/core services into agent-layer subscribers; retain durable correlation and idempotency; update boot wiring; add runtime and static boundary proof.

Out of scope: plugin/default ownership (AU10), deleting or rehoming the transitional `app-runtime` shell (AU11), the final global dependency guard (AU8), new LLM entry points, remote scheduling, new harness paths, UI changes, and behavior improvements.

## Pinned noun

**Agent work intent** is a durable core-domain fact saying that a product action needs agent work, identified by source kind/id and idempotency key and published as a typed domain event. It is not an `AgentSessionRequest`, trigger outcome, prompt selection, harness command, or execution callback.

Hard rules:

1. Core code may persist intent and emit its event; only agent-layer code may resolve it into a run request.
2. Intent must be committed before its event is emitted and must carry stable correlation sufficient for replay/idempotency.
3. Domains observe terminal run state through lifecycle/read-model events only.
4. No compatibility wrapper may conceal synchronous request construction/execution behind a core-owned function.

## Guide draft

### Starting agent work from a core domain

Persist the domain action first, then emit its typed event with the durable source identity and idempotency key. Stop there. Do not import trigger resolution, session-request, provisioning, harness, tool, MCP, context, or agent-run-boundary modules.

The agent layer subscribes to the event, loads active configuration, creates or reuses the durable run request, and schedules execution. Completion, failure, and cancellation return as lifecycle events/read-model state correlated to the original source. Domain handlers react to those facts without receiving an execution promise or callback.

### Existing handoff families

| Family | Core intent/event | Agent-layer reaction |
|---|---|---|
| Assistant turn | persisted human `thread_message_appended` | validate assistant thread/sender, resolve/create assistant, enqueue conversational run |
| Session start | persisted session-start intent event | resolve task/source trigger, enqueue run; route returns accepted intent/read model |
| Knowledge action | persisted knowledge-action intent + typed event | replace the current route-owned request creation; resolve knowledge trigger and enqueue run |
| Routine | persisted routine fire/run + `routine_fired` | replace both manual-route and scheduler direct execution; resolve owner/trigger and enqueue run |
| Decomposition | persisted bet state + `work_decompose_requested` (or active-state event translated in agent layer) | enqueue decomposition run |
| Task | persisted task transition + task-ready/accepted event | enqueue owner/default run |
| Re-engagement | persisted proposed-call grant + `proposed_call_granted` | enqueue same-lineage/default re-engagement run |

No user-facing guide page is introduced. Existing developer architecture guidance needs a small correction from direct request handoff to event-first handoff; hence `DOC-CLASS: minor`.

## Contradiction audit

The target graph and AU9 agree. Several older docs still cite deleted Fabric paths or direct `runAssistantTurn`/Strategy-era ownership; these are stale implementation references, not authority to retain the forbidden edge. AU9 must update the specific runtime/run-unit developer documentation it changes, without broad documentation cleanup owned by AU11.
