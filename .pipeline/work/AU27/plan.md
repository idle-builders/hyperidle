# AU27 — The assistant turn is just an ordinary agent: de-specialize its output + execution path

## Work package

**Work package.** As a maintainer, I want the assistant turn to run as a genuinely ordinary tool-driven agent session — same execution path, same output mechanism, same tool surface — as every other agent kind (task_run, routine_run, knowledge_action, reengagement), so that "the assistant is just an ordinary agent" is true in the code and not just in intent. Today the assistant is still secretly special on the **output + execution** side: it runs through a bespoke `conversational` mode (`dispatch.runAssistantTurn` → a `conversational: {...}` params bag → `executeAgentRunRequest`), returns a special `conversationalReply`/`conversationalToolCalls` result shape, and **dispatch itself** (not the agent, not a tool) parses that reply and posts it into the thread afterward. Every other agent kind produces its work products via ordinary explicit tool calls DURING the session and flows through the shared `run-orchestration` poller (`drainIntents → runClaimedRequest`); the assistant does neither. This WP collapses that specialness: the assistant runs on the normal poller path and posts its response by calling a new generic **`reply`** tool DURING the session, exactly like any other agent's output.

**Why this matters.** The maintainer stated it verbatim during AU21's build: *"the assistant is just an ordinary agent [session]. and the orchestration should deal with it like any other agent. also the assistant uses tools like any other agent. there is nothing special."* And: *"the conversation with the assistant is nothing different than any ordinary conversation. the only place where the assistant is treated specially is in the UI since it can show up in a different spot visually."* AU21's Decision H2 closed the assistant turn's **input** side (core bakes the transcript, orchestration formats it, no agent MCP pull) but never touched the **output** side. Leaving a whole second execution path + a special result shape + an orchestration-side post-hoc write means the runtime still forks on "is this the assistant," which is exactly the specialness this track (AU) exists to remove. It is not user-facing-broken today (assistants reply fine), so this is a coherence/architecture fix, not an incident — but it is real, scoped, buildable debt, and it is the natural precondition for AU25 (resumable harness sessions) applying uniformly to all kinds.

**Type.** backend.

**What exists today (verified in AU21's Decision K, source-traced).** `packages/agent-orchestration/dispatch/src/service.ts`'s `runTurnInternal` (`:302-422`) is a separate assistant execution entry (`DispatchOps.runAssistantTurn`, `:533,567`) that passes `conversational: { threadId, assistantAgentId, draftRegistry, messages, systemPromptOverride }` into `executeAgentRunRequest` (`:363-369`), then reads `result.conversationalReply`/`conversationalToolCalls` and posts the reply via `ports.conversation.insertMessage` (`:371-401`; failure twin `persistTurnFailureInternal` `:105-135`). `packages/agent-orchestration/run-orchestration/src/provisioner.ts` implements the mode: `isConversational` gating (`:1245`), the conversational tool-registry merge (`:1207-1217`), reply capture from the harness `completion` event (`:1576-1581`), and the special result fields (`:740,787-791,1795-1798`); `contracts.ts:231` declares `RunOptions.conversational`. The assistant-only draft tool surface is `packages/agent-orchestration/tool-handlers/src/assistant-draft-registry.ts` (`buildAssistantDraftRegistry`). No generic "post a message into the thread this session is running for" tool exists: `send_message` (`tool-definitions.ts:109-141`) is agent→agent direct messaging, `log_task` (`:1456-1479`) appends to the task's notes column, and `ToolContext` (`shared/src/tool.ts:38-56`) has no `threadId`. `tasks.threadId → threads.id` (`db/src/schema.ts:220`) confirms task comments are the same threads/messages primitive — every conversation-anchored kind has a well-defined calling thread (`assistant` → `sourceCorrelation.threadId`, `session-request.ts:66`; `task`/`proposed_call` → the task's `threadId`, `:54,100`).

**What's genuinely missing.** A generic session-scoped `reply` (or `post_message`) MCP tool that posts a plain message into the session's calling thread via the `CoreApiPort` seam — available to ALL agent kinds; a `threadId` field on `ToolContext` populated from the baked request (assistant from correlation; task/proposed_call baked at emit from `task.threadId`); the convergence of `dispatch.runAssistantTurn` into the shared `run-orchestration` poller path; the removal of the whole `conversational` mode (`RunOptions.conversational`, `RunResult.conversationalReply`/`conversationalToolCalls`, `dispatch`'s conversational runner, and the assistant draft registry as a special surface); and moving the pre-handoff "assistant can't respond" notice UX onto the standard `agent_run_admission_failed` → core-api `conversation` subscriber (§10 of AU21's architecture already reserves the `assistant_turn` → `conversation` subscriber slot).

**Depends on.**
- **AU21** — this WP builds on H2's baked assistant transcript, the `CoreApiPort` seam, the baked-request/emit path, and the `agent_run_admission_failed` channel — all of which AU21 shipped. It cannot be meaningfully scoped or built until AU21 has shipped those.

**Complexity.** L

**Engineering tier.** production (matches AU21's own tier).

**Pre-build gates.**
- **Refinement:** Not required — the goal, the source trace, and the design are already settled via AU21's Decision K (`.pipeline/work/AU21/architecture.md`, search "Decision K"), a real verified architecture pass.
- **Design:** Not required — backend, no new UI surface. The UI already renders the assistant in its own visual spot (the founder's one accepted specialness) and that is unchanged; the response still lands as an ordinary thread message.

**Human review gates.** Yes — mandatory for every work package. The one judgment call to confirm during build: the exact scope of retiring/folding the assistant draft registry (`buildAssistantDraftRegistry`) — whether its draft tools become ordinary tools or are retired — should be confirmed against the current tool surface, not assumed.

**Plan calls.** Standard architecture pass, but treat AU21's Decision K (K2 section) as the locked design frame — do not re-derive it; verify its source claims still hold against the current tree (AU21 will have shipped more by the time this starts) and produce the increment breakdown from it.

**Contracts / constraints.**
- The assistant reply must land through the **same** `CoreApiPort` route + middleware a human or any other agent uses (the seam AU21 Increment 2 already routes `send_message`/`insertMessage` through) — never an orchestration-side special write.
- The generic `reply` tool must be available to every agent kind, and must fail cleanly (not crash) for a session with no calling thread (routine/knowledge).
- `ToolContext.threadId` must be populated from the **baked** request (emit-time), never a new orchestration→core read on the run path — this preserves AU21's AC #2 (zero orchestration→core reads).
- The assistant turn must flow through the shared `run-orchestration` poller path after this WP — no second execution entry may remain.
- The UI's assistant rendering (its distinct visual spot) is unchanged — this is backend-only; the founder's one accepted specialness (visual placement) stays.
- Must not regress the assistant's failure UX: a pre-handoff failure (e.g. no API key) must still surface a helpful message in the thread, via the `agent_run_admission_failed` → `conversation` subscriber, not the deleted `persistTurnFailureInternal` path.

**Out of scope.**
- Resumable per-thread harness sessions + delta computation (resume-vs-new) — that is **AU25** (meta-orchestration of harness sessions). AU27 keeps today's fresh-spawn model; it only de-specializes the assistant's output + execution path. AU27 should land before or with AU25 so AU25 applies uniformly.
- Mid-run delivery into an already-running session — that is **AU22**.
- Any UI redesign of the assistant surface.
- Re-opening any AU21 AC — AU21's AC #2/#9 are met independent of this WP; this is a purity refinement, not a boundary hole.

**Effort.** L (~4-6d) — a new generic tool + `ToolContext.threadId` + emit-time thread baking for task/proposed_call, plus deleting `conversational` mode across three packages (`dispatch`, `run-orchestration`, `tool-handlers`) and converging two execution paths into one. Each piece is independently testable.

## Acceptance criteria

- A generic `reply`/`post_message` MCP tool exists, is available to every agent kind, and posts a plain message into the session's calling thread through the `CoreApiPort` seam (same route + middleware a human uses) — proven by a test that a task_run session posts a comment into its task's thread via the tool.
- `ToolContext` carries a `threadId` (the session's calling thread) populated from the baked request, with **zero** orchestration→core read on the run path — proven by a test (and the AU21 anti-regrowth guard staying green).
- The assistant turn produces its response by calling the generic `reply` tool DURING the session, not via an orchestration-side post-hoc write — proven end-to-end (an assistant turn's reply appears in the thread, authored through the seam by the agent's own tool call).
- The `conversational` mode is fully removed: `RunOptions.conversational`, `RunResult.conversationalReply`/`conversationalToolCalls`, `dispatch`'s `runTurnInternal`/`runAssistantTurn`/`persistTurnFailureInternal`, and the assistant-only draft registry as a special surface are gone — a grep/type check confirms no `conversational` execution branch remains.
- The assistant turn flows through the shared `run-orchestration` poller path (`drainIntents → runClaimedRequest`), the same as every other kind — no second execution entry remains (test asserts the assistant intent is consumed by the shared poller).
- The pre-handoff failure UX still surfaces a helpful thread message via the `agent_run_admission_failed` → core-api `conversation` subscriber (test: force a no-API-key failure for an assistant turn; a notice message appears in the thread; no reliance on the deleted `persistTurnFailureInternal`).
- A routine_run/knowledge_action session (no calling thread) calling `reply` gets a clean, well-typed error, never a crash (test).

## Validation scenarios

- Given a user sends a message to the assistant, when the assistant turn runs, then the assistant's response appears in the thread — authored by the assistant agent through the `CoreApiPort` seam via its own `reply` tool call — with no orchestration-side post-hoc write anywhere in the path.
- Given a task_run agent session is running for a task, when the agent calls `reply`, then a comment appears in the task's own thread (the same `threads`/`messages` primitive an assistant conversation uses), proving the capability is generic, not assistant-specific.
- Given the assistant's API key is missing, when the turn fails at pre-handoff, then a helpful notice message appears in the thread via the `agent_run_admission_failed` → `conversation` subscriber (not the deleted conversational failure path).
- Given a routine_run session (no calling thread), when its agent calls `reply`, then it receives a clean typed error and the session continues, never crashing.
- Given the assistant turn and a task_run both run, when their execution paths are inspected, then both flow through the same `run-orchestration` poller (`drainIntents → runClaimedRequest`) with no `conversational` branch — the assistant has no special execution entry.
