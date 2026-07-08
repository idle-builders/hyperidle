# Runtime Simplification Frame

This is the strategic frame for Track AU. It replaces the older Kernel/Strategy/Fabric framing with two runtime boundaries and one configuration surface.

## Boundary

HyperIdle has a core app and an agent layer.

The core app owns the user-visible product domains: Work, Conversation, Knowledge, Users, and Settings. It stores the durable records, emits domain events, exposes editing surfaces, and shows state back to humans. Knowledge is a core app domain, not a separate Fabric layer.

The agent layer owns every LLM-capable run. It accepts session requests, chooses and provisions the agent run, starts and supervises the harness, exposes tools and MCP, captures output, writes session lifecycle events, and handles the decomposition of an agent run or session into observable results. Collaboration domains do not call harnesses or provisioning internals directly.

Plugins are preconfiguration bundles, not a third runtime layer. A plugin can contribute default agents, skills, routines, triggers, tools, MCP servers, harness descriptors, and settings metadata. Once installed, those contributions appear as editable app configuration; user configuration wins over plugin defaults.

Triggers are the single rule for "event -> agent work." Any event that can cause an LLM call is triggerable. If no user or plugin trigger matches, the agent layer attaches the default eligible agent with no event-specific prompt. If a user or plugin trigger matches, it supplies the specific agent and prompt for that event.

## What Exists Today

The current code still has a Strategy port and a Fabric implementation. The server registers one active Strategy process-wide, then calls it for context assembly, learning ingestion, agent scaffolding, agent selection, bet decomposition, and assistant formation. Fabric also contains unrelated service-bundle behavior: schedulers, notification services, lifecycle propagation, knowledge scoring, git export, task dispatch, and context/writeback services.

The app already has many of the durable primitives this frame keeps: users include humans and agents, routines are editable records, knowledge is stored in canonical tables, MCP and tools run through the server runtime, harness adapters are registered centrally, and domain events are already emitted. The problem is not missing primitives; it is that LLM-callable behavior is split across Strategy calls, Fabric subscribers, direct provisioning paths, and hard-coded event handlers.

## Simplification Rule

When this track is complete:

- There is no Fabric runtime layer or Strategy concept.
- Core app domains do not know how an agent run is executed.
- The agent layer is the only owner of LLM execution.
- Triggers, routines, agents, skills, tools, and MCP are editable configuration in the app.
- Plugins only seed and extend that configuration; they do not become hidden global brains.
