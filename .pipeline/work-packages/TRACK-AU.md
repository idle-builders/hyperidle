# Track AU: Runtime Simplification

This track separates the core app from the agent layer and removes the Strategy/Fabric split. Work, Conversation, Knowledge, Users, and Settings are core app domains. The agent layer owns every LLM-capable run: request intake, provisioning, harness execution, tools/MCP, context, capture, decomposition, and lifecycle events. Plugins are not a runtime layer; they preconfigure editable app configuration for agents, skills, routines, triggers, tools, MCP, and harnesses.

The point is not a new harness path. The point is one contract for every agent run: task-backed work, assistant turns, routine-triggered runs, knowledge actions, and decomposition work all become task-optional session requests consumed by the same runtime boundary. Every event that can cause an LLM call becomes triggerable. If no user or plugin trigger matches, the runtime attaches the default eligible agent with no event-specific prompt; a matching user/plugin trigger supplies the specific agent and prompt.

**Reference.** `docs/architecture/runtime-simplification.md`; `plans/strategy-kernel-plugin-split/dependency-graph.md` (as-is); `plans/strategy-kernel-plugin-split/as-should-dependency-graph.md` (target graph); `plans/strategy-kernel-plugin-split/as-is-vs-should-dependency-graph.md` (current gap comparison); `plans/strategy-kernel-plugin-split/component-inventory.md`; `docs/architecture/as-implemented-domain-architecture.md`; `.pipeline/work-packages/TRACK-AR.md` (real harness proof boundary); current domain callers in Work, Conversation, Knowledge, Users, Settings, and Routines.

**Corrective closure rule.** AU is not complete until the source tree matches the should graph, not a softer transitional graph. Agent handoff must be event/request driven, plugins must be editable configuration only, and no app-runtime/Fabric-shaped compatibility shell may remain as an ownership boundary. Every AU review from AU9 onward must explicitly compare implementation against `plans/strategy-kernel-plugin-split/as-should-dependency-graph.md` and fail the package when a forbidden edge remains, even if behavior still works.

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

**Plan calls.** Run `/pipeline:refine` first, then standard `/pipeline:architecture`. The plan must map each current caller that starts or intends to start an agent run, define the session request/event contract, define task-optional session identity and source correlation, plan data migration/backcompat, and separate runtime-bound real-harness tests from domain-level request/event tests. Use the as-is dependency graph to enumerate current callers and the as-should Agent Layer graph as the target component boundary. No `/pipeline:design` unless a later refinement adds a visible UI surface.

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

---

### AU2 — Plugin defaults become editable configuration

**Work package.** As a maintainer configuring HyperIdle, I want plugins to contribute default agents, skills, routines, triggers, tools, MCP servers, and harness descriptors as app configuration, so that preconfigured behavior is visible and editable instead of hidden in code. When this ships, a plugin can seed configuration, the app can show where a setting came from, and a user edit overrides the plugin default without modifying the plugin. Removing or disabling a plugin leaves user-owned overrides understandable rather than orphaned. This makes plugins a configuration source, not another global brain.

**Why this matters.** The maintainer benefits because today's behavior is scattered across Strategy methods, Fabric bootstrap subscribers, hard-coded tool registries, routine handlers, agent templates, and MCP wiring. The cost of not building this is that "plugins" would just recreate the current Strategy mess under a friendlier name. Treating plugin contributions as editable configuration keeps the app simple: the user sees and owns the actual agents, routines, triggers, tools, and MCP surfaces the system will use.

**Type.** framework

**What exists today.** Agents are stored as users with system prompts, harness preferences, model settings, and categories. User skills, routines, service connections, tool definitions, MCP bridge wiring, harness adapters, and settings pages already exist in separate shapes. Fabric and Minimal Strategy currently contribute agent scaffolds, selection, assistant formation, and decomposition behavior through a process-wide Strategy port. There is no plugin registry or unified provenance model that says "this editable config came from this plugin default."

**What's genuinely missing.** There is no app-owned configuration model that can accept plugin defaults for agents, skills, routines, triggers, tools, MCP, and harnesses. There is also no override/provenance behavior that lets users edit seeded configuration while keeping the plugin origin visible. Without this, plugins cannot replace Strategy/Fabric cleanly.

**Depends on.**
- **AU1** — plugin-provided run behavior must target the session request boundary rather than direct provisioning or harness calls.

**Complexity.** L

**Pre-build gates.**
- **Refinement:** Required — run /refine first (introduces/reshapes: plugin defaults and editable configuration provenance).
- **Design:** Not required — framework/backend configuration foundation; skip /design.

**Human concept review.** No — foundational configuration model only; AU5 handles the user-facing settings surface.

**Acceptance criteria.**
- A plugin can contribute default agents, skills, routines, triggers, tools, MCP servers, and harness descriptors without becoming the owner of user-edited runtime state.
- The app can distinguish plugin-provided defaults from user-owned overrides for every contributed configuration kind.
- A user override wins over the plugin default while preserving the ability to see the plugin origin.
- Disabling or removing a plugin produces an explicit, queryable state for affected configuration instead of silently deleting user-owned edits.
- Built-in HyperIdle behavior is represented through the same plugin-default mechanism as other plugin contributions.
- Existing agents, routines, tools, MCP, skills, and harness settings remain available through the new configuration model.

**Validation scenarios.**
- Given a plugin contributes an agent and routine, when the app lists configuration, then both appear with plugin provenance and editable state.
- Given a user changes a plugin-provided agent prompt or trigger prompt, when the plugin default later changes, then the user override remains the active value and the origin is still visible.
- Given a plugin is disabled, when configuration is queried, then affected defaults and overrides report an explicit disabled-origin state instead of disappearing silently.
- Given built-in HyperIdle defaults load, when the same configuration APIs are queried, then built-in agents/routines/tools/MCP are represented the same way as plugin-provided defaults.

**Plan calls.** Run /pipeline:refine first to lock plugin-default vocabulary and provenance rules, then standard architecture pass. Plan should use the as-should Configuration And Plugin graph as the target shape and focus on contracts and observable behavior, not marketplace/distribution.

**Contracts / constraints.**
- Plugins seed configuration; users own active editable configuration.
- User overrides always win over plugin defaults.
- Built-in defaults use the same path as plugin defaults.
- Plugin disable/remove behavior must be explicit and inspectable.
- No marketplace, remote installation, permissions tiers, or enterprise approval flow.

**Out of scope.**
- A visual settings UI for editing all contributed configuration; AU5 owns it.
- Trigger evaluation and runtime dispatch; AU4 owns it.
- Plugin package distribution, signing, publishing, or dependency resolution.
- Third-party plugin sandboxing.

**Effort.** L (~4d)

---

### AU3 — No Fabric runtime layer

**Work package.** As a maintainer, I want HyperIdle to run with only the core app and the agent layer, so that Knowledge is a normal app domain and agent execution is not hidden behind a separate Fabric/Strategy runtime. When this ships, the current Knowledge, routine, notification, context, writeback, selection, and dispatch behavior still works, but no runtime package or boot path treats Fabric as a layer. A contributor can explain the system as core app domains plus agent layer without learning a third "Strategy/Fabric" concept. Existing user-visible Work, Conversation, Knowledge, Users, and Settings behavior remains intact.

**Why this matters.** The maintainer benefits because the current split is creating duplicate ownership: Fabric is both a knowledge feature bundle and the active Strategy, while server code still imports Fabric services directly. The cost of not building this is continued spaghetti: every future plugin or trigger change has to ask whether it belongs in Kernel, Fabric, Strategy, server, or routes. Removing Fabric as a runtime layer makes the product easier to reason about and stops a dead architecture concept from shaping new work.

**Type.** framework

**What exists today.** The dependency audit shows a process-wide Active Strategy Registry, a shared Strategy contract, a Fabric Strategy Adapter, Fabric bootstrap services, and direct server imports from Fabric for cost, routines, notifications, knowledge routes, git export, task dispatch, and context helpers. The database has canonical Work, Conversation, Knowledge, Users, Routine, Session, Tool/MCP, and service-connection records, plus Fabric-named strategy projection tables. The server already owns routes, events, session provisioning, tools, MCP, harness adapters, and persistence writes. The Fabric package currently mixes knowledge behavior with service-bundle behavior such as schedulers, lifecycle propagation, notifications, scoring, task dispatch, and git export.

**What's genuinely missing.** There is no package/runtime boundary where Knowledge is core app behavior and LLM execution belongs only to the agent layer. Fabric-named services, tables, exports, and boot wiring still make Fabric look like a runtime layer. The missing outcome is a working app with no Fabric/Strategy runtime concept left in code, package dependencies, boot logs, or user-facing labels.

**Depends on.**
- **AU1** — this work needs the session request boundary first so Fabric-era direct provisioning and subscriber paths can be collapsed without inventing another execution path.
- **AU2** — final Fabric removal needs built-in and plugin-provided defaults to have an app-owned configuration home before Fabric-era agent, routine, tool, MCP, and prompt defaults can be rehomed.

**Complexity.** L

**Pre-build gates.**
- **Refinement:** Required — run /refine first (reshapes: core app vs agent layer boundary).
- **Design:** Not required — backend/framework/package boundary; skip /design.

**Human concept review.** No — backend architecture boundary with no new rendered surface.

**Acceptance criteria.**
- HyperIdle boots and runs without registering or selecting a Strategy or Fabric runtime layer.
- Core app domains still expose the existing observable Work, Conversation, Knowledge, Users, Settings, Routine, and notification behavior after Fabric is removed as a runtime concept.
- The agent layer is the only owner of LLM execution behavior: session request intake, provisioning, harness execution, tool/MCP invocation, context/capture, and lifecycle events.
- Server/core code has no runtime dependency on a Fabric package or Fabric boot bundle.
- User-facing and developer-facing runtime vocabulary no longer presents Fabric or Strategy as concepts needed to configure or run the app.
- Existing Fabric-named durable data remains readable through forward-compatible app concepts, with no data loss for knowledge, task, routine, or session history.

**Validation scenarios.**
- Given the app starts from an existing database, when boot completes, then Work, Conversation, Knowledge, Users, Settings, routines, notifications, and agent sessions are available without a Fabric/Strategy registration step.
- Given a knowledge item with existing Fabric-named projection data, when a user opens Knowledge, then the item and its derived signals remain visible under app-owned vocabulary.
- Given a task, assistant message, or routine causes an agent run, when the run starts, then it goes through the agent layer and not through a Fabric/Strategy runtime object.
- Given repository dependency checks run, when a core/server module imports a Fabric runtime package, then the check fails.

**Plan calls.** Run /pipeline:refine first to lock the core app versus agent layer boundary against the live dependency audit, then standard architecture pass. This is a foundational cleanup; plan should classify each current Fabric component as core app, agent layer, plugin-seeded config, or deletion, using the as-is graph as the source inventory and the as-should graph as the target dependency shape. Preserve behavior while removing the Fabric/Strategy runtime concept.

**Contracts / constraints.**
- No new parallel LLM execution path.
- Existing user-visible behavior is preserved unless explicitly called out as dead/removed during refinement.
- Knowledge remains a core app domain, not a plugin-only feature.
- Forward-compatible migration only; no data loss from existing Fabric-named tables or rows.
- No enterprise plugin governance, marketplace, or trust-tier system.

**Out of scope.**
- Building the editable plugin/trigger UI; AU5 owns the app surface.
- Adding third-party plugin distribution or marketplace behavior.
- Changing the quality of knowledge scoring, context relevance, or agent decomposition.
- Remote worker scheduling.

**Effort.** L (~5d)

---

### AU4 — One trigger path for every LLM-capable event

**Work package.** As a maintainer and product operator, I want every event that can call an LLM to resolve through one trigger path, so that "which agent with which prompt works on this event" is data instead of scattered code. When this ships, task acceptance, assistant messages, routine fires, bet decomposition, knowledge actions, and proposed-call re-engagement all use the same trigger resolution rule. If no specific trigger exists, the runtime attaches the default eligible agent with no event-specific prompt. If a user or plugin trigger exists, that trigger supplies the specific agent and prompt.

**Why this matters.** The operator benefits because agent behavior becomes inspectable and editable instead of buried in event subscribers, Strategy calls, and route-specific provisioning. The cost of not building this is exactly the current spaghetti: every new LLM event becomes another bespoke handler that picks an agent and prompt differently. A single trigger path gives the app a simple mental model and gives plugins a narrow, reviewable extension point.

**Type.** backend

**What exists today.** Domain events already exist, including routine and work events. Routine rows have trigger fields, assistant turns start from message append paths, bet decomposition and owner selection use Strategy methods, task dispatch provisions sessions from Fabric services, and proposed-call grants can re-engage agent work. The dependency graph identifies these as current LLM-capable surfaces, but there is no trigger abstraction unifying them.

**What's genuinely missing.** There is no persisted trigger rule that maps an event to an agent, prompt, and execution action. There is no default attach behavior expressed as core runtime policy. There is no conflict/override model that makes user triggers beat plugin defaults and more specific triggers beat broader defaults.

**Depends on.**
- **AU2** — plugin-provided triggers must arrive as editable configuration with provenance and user override behavior.
- **AU3** — trigger migration must run after the Fabric/Strategy runtime layer is gone so there is no hidden fallback path competing with trigger resolution.

**Complexity.** L

**Pre-build gates.**
- **Refinement:** Required — run /refine first (introduces/reshapes: trigger).
- **Design:** Not required — backend/runtime behavior; skip /design.

**Human concept review.** No — backend trigger runtime; AU5 handles the editable human surface.

**Acceptance criteria.**
- Every current LLM-capable event surface resolves through trigger evaluation before an agent run is requested.
- When no user or plugin trigger matches, the runtime attaches the default eligible agent with no event-specific prompt.
- When a user trigger matches, it overrides plugin defaults for the same event scope.
- When plugin defaults conflict, resolution is deterministic and observable.
- Trigger resolution produces an agent-layer session request rather than directly invoking harnesses, provisioning internals, or Strategy/Fabric objects.
- Trigger outcomes are inspectable after the fact: event, matched trigger or fallback, chosen agent, prompt source, and requested run are queryable.
- Existing task, assistant, routine, decomposition, knowledge-action, and proposed-call behaviors remain observable after migration to triggers.

**Validation scenarios.**
- Given no configured trigger for an assistant message, when the message event fires, then the default eligible agent is attached and no event-specific prompt override is applied.
- Given a plugin trigger and a user trigger both match a routine fire event, when the event fires, then the user trigger wins and the chosen agent/prompt source is recorded.
- Given a bet decomposition event, when trigger evaluation completes, then decomposition starts as an agent-layer session request and no Strategy/Fabric object is invoked.
- Given trigger history is inspected for a task acceptance event, then it shows the event, matched trigger or fallback, chosen agent, prompt source, and resulting run request.

**Plan calls.** Run /pipeline:refine first to lock trigger vocabulary and default/override semantics, then standard architecture pass. Plan should start from the current LLM-capable surface list in `plans/strategy-kernel-plugin-split/dependency-graph.md`, target the Trigger Flow graph in `plans/strategy-kernel-plugin-split/as-should-dependency-graph.md`, and migrate one event family at a time onto one trigger path.

**Contracts / constraints.**
- Triggers cover every event that can call an LLM.
- Absence of a specific trigger is meaningful and executes default attach behavior.
- User triggers override plugin defaults.
- Trigger evaluation never calls harnesses directly; it emits or records an agent-layer session request.
- Trigger history must be inspectable for debugging.
- No hidden Strategy/Fabric fallback.

**Out of scope.**
- Full settings UI for editing triggers; AU5 owns it.
- Marketplace or third-party plugin lifecycle.
- New LLM event types beyond migrating existing surfaces.
- Evaluating quality of selected prompts or decompositions.

**Effort.** L (~4d)

---

### AU5 — Configuration surface for agents, skills, routines, triggers, tools, and MCP

**Work package.** As a product operator, I want one Settings area where I can see and edit the configuration that controls agent behavior, so that plugins and defaults do not hide what the system will do. When this ships, agents, skills, routines, triggers, tools, and MCP configuration are visible as app configuration with clear origin, active value, and override state. A user can edit the parts intended to be editable without learning whether they came from built-in defaults, a plugin, or manual setup. The surface makes the simplified architecture tangible: core app settings configure the agent layer.

**Why this matters.** The operator benefits because the new architecture only works if the behavior is inspectable and editable in the app. Without this surface, plugins and triggers would remain a backend mechanism and users would still experience hidden automation. The cost of not building it is a cleaned-up backend that still feels like a black box.

**Type.** frontend

**What exists today.** Settings already contains separate areas for agents, harnesses, connections, assistant configuration, and organization structure. Work pages expose routines, and agent profile pages show operational details. Tools, MCP, skills, plugin provenance, and event triggers do not appear as one coherent configuration surface. Current labels still expose Strategy/Fabric concepts in places such as agent categories and story data.

**What's genuinely missing.** There is no unified settings experience that shows what configuration controls agent behavior across agents, skills, routines, triggers, tools, and MCP. There is no user-facing provenance model for plugin defaults versus user overrides. There is no way to inspect trigger behavior from the app.

**Depends on.**
- **AU2** — the surface needs plugin-default provenance and editable configuration.
- **AU4** — trigger editing and inspection need the trigger runtime.

**Complexity.** L

**Pre-build gates.**
- **Refinement:** Required — run /refine first (reshapes: agent behavior configuration surface).
- **Design:** Required — novel surface; /design multi-variant + human review.

**Human concept review.** Yes — this introduces the primary user-facing surface for the new plugin/trigger configuration model.

**Acceptance criteria.**
- A user can find agents, skills, routines, triggers, tools, and MCP configuration from one Settings area without seeing Fabric or Strategy as required concepts.
- For plugin-provided configuration, the user can see origin, active value, and whether a user override is active.
- A user can edit supported agent, routine, trigger, tool, skill, and MCP settings and see the changed active value reflected after save.
- Trigger configuration shows which event it applies to, which agent it attaches, which prompt source it uses, and whether it is default, plugin-provided, or user-owned.
- Disabled or missing plugin origins produce an understandable state that explains what still runs and what no longer applies.
- Existing settings for agents, harnesses, assistant behavior, connections, and routines remain reachable and do not regress.

**Validation scenarios.**
- Given a plugin provides a default trigger and agent, when the user opens Settings, then both appear with origin and active value visible.
- Given the user overrides a trigger prompt, when the trigger row is reloaded, then the user override is shown as active and the plugin default remains visible as origin.
- Given a plugin is disabled, when Settings opens, then affected configuration explains what is disabled and what user-owned overrides remain active.
- Given a user edits an MCP or tool configuration, when they save and reload, then the active configuration reflects the change and no Fabric/Strategy label is shown.

**Plan calls.** Run /pipeline:refine first to sharpen the user-facing noun and guide draft, then /pipeline:design with multiple variants and human review. Architecture should plan the app/API contracts only after the design chooses how provenance, overrides, disabled origins, and trigger details are presented. Use the as-should Configuration And Plugin graph to keep the surface aligned with active editable configuration rather than plugin internals.

**Contracts / constraints.**
- Do not expose Fabric or Strategy as user-facing configuration concepts.
- Reuse existing Settings IA where it still fits; do not create a separate admin console.
- Plugin defaults are readable but user overrides are the active editable state.
- Text must make origin and override state understandable without requiring architecture knowledge.
- No marketplace, plugin store, or enterprise approval flow.

**Out of scope.**
- Building plugin installation/distribution.
- Adding new harnesses, tools, MCP servers, or skills beyond showing/editing contributed configuration.
- Reworking Work, Conversation, or Knowledge page IA outside links into Settings.
- Eval/tuning UI.

**Effort.** L (~4d)

---

### AU6 — Agent execution boundary closure

**Work package.** As a maintainer, I want every LLM-capable path to enter through the agent-layer request boundary, so that core app domains never need to know how a harness, tool, MCP server, context provider, or provisioning path works. When this ships, task acceptance, assistant turns, routines, knowledge actions, decomposition, and re-engagement all produce the same kind of run request and receive lifecycle state back through the same observable channel. The user-visible behavior stays the same, but the runtime shape is simpler: core domains record intent and react to results, while the agent layer owns execution. This closes the remaining gap between the trigger spine that exists today and the should graph's Agent Layer boundary.

**Why this matters.** The maintainer benefits because future agent behavior can be added once at the request/runtime boundary instead of being threaded through route-specific or Fabric-shaped call paths. Agents benefit because every run gets the same lifecycle, context, tool, MCP, capture, and writeback handling. The cost of not building this is continued partial migration: new trigger configuration exists, but old direct execution seams keep leaking through the app and make the should graph impossible to prove.

**Type.** backend

**What exists today.** `AgentSessionRequest` creation and consumption exist, and trigger-backed request creation is used by several surfaces. `provisionSession` remains the central execution service, server bootstrap still wires provisioning/runtime hooks, and Fabric-shaped app-runtime dispatchers and schedulers still create and consume agent runs. Assistant turns, bet decomposition, session routes, routine routes, task dispatch, and knowledge routes already have partial request-boundary behavior, but the boundary is not yet the single observable entry point for all LLM-capable work.

**What's genuinely missing.** The system does not yet prove that all LLM-capable behavior crosses one agent-layer boundary. Some code still treats provisioning/runtime hooks as local service details instead of an owned layer. The missing outcome is a runtime where every agent run has one request identity, one lifecycle path, and no direct domain ownership of execution internals.

**Depends on.**
- **AU4** — the closure work needs the trigger-backed request path first; without it there is no common event-to-run contract to make universal.

**Complexity.** L

**Pre-build gates.**
- **Refinement:** Required — run /refine first (reshapes: agent execution boundary).
- **Design:** Not required — backend/runtime boundary; skip /design.

**Human concept review.** No — backend architecture boundary with no new user-facing surface.

**Acceptance criteria.**
- Every current LLM-capable user or domain action produces an agent-layer run request before execution begins.
- Core app domain code can observe requested, running, completed, failed, and cancelled run state without importing harness, tool, MCP, context, or provisioning execution internals.
- Agent-layer execution owns harness selection, run admission, context assembly, tool/MCP availability, capture, writeback, and lifecycle publication for every run.
- Existing task, assistant, routine, knowledge-action, decomposition, and re-engagement behavior remains observable after the boundary closure.
- A failed agent run is reported through the same lifecycle state regardless of which domain action requested it.
- Runtime tests can prove the request-to-lifecycle path once, while domain tests prove request creation and lifecycle reaction without direct harness execution.

**Validation scenarios.**
- Given a task, assistant message, routine fire, knowledge action, and decomposition request, when each action requests agent work, then each has a durable run request before execution begins.
- Given a domain consumer watches run lifecycle state, when the agent run completes or fails, then the domain can update its state without calling execution internals.
- Given a harness/tool/MCP implementation changes, when core domain tests run, then they do not need to import or mock that execution implementation.
- Given an agent run fails during execution, when lifecycle state is queried, then the originating domain can show the same failed state shape as every other run type.

**Plan calls.** Run /pipeline:refine first to name the boundary and lock the lifecycle contract, then standard architecture pass. The plan should classify each current LLM-capable caller by observable request and lifecycle behavior, then close only the gaps that prevent the agent layer from being the single execution owner.

**Contracts / constraints.**
- No new harness execution path.
- Core app domains own records and events, not execution internals.
- Existing user-visible behavior must not regress.
- Request and lifecycle correlation must remain durable enough for local or remote workers.
- No Fabric or Strategy fallback is allowed for newly closed paths.

**Out of scope.**
- Removing the Fabric package or Strategy port entirely; AU7 owns runtime retirement.
- Building new Settings UI.
- Adding new harnesses, tools, MCP servers, or plugin distribution.
- Remote worker scheduling.

**Effort.** L (~4d)

---

### AU7 — Strategy and Fabric runtime retirement

**Work package.** As a maintainer, I want HyperIdle to boot and run without Strategy or Fabric as runtime concepts, so that the architecture matches the should dependency graph instead of carrying the older Kernel/Strategy/Fabric split. When this ships, there is no active Strategy singleton, no Strategy port required to run the app, no Fabric bootstrap/runtime service layer, and no minimal Strategy package used as a product runtime. Existing Work, Conversation, Knowledge, Users, Settings, routines, notifications, sessions, tools, MCP, and harness behavior still works under core app plus agent layer ownership. Historical data remains readable through current app concepts.

**Why this matters.** The maintainer benefits because the system can finally be explained and changed as two runtime boundaries plus configuration, not three overlapping frameworks. Product operators benefit indirectly because hidden Strategy/Fabric behavior stops competing with editable configuration and trigger rules. The cost of not building this is that AU remains only cosmetically complete: the should graph says Strategy/Fabric are gone, but contributors still have to learn and preserve them.

**Type.** framework

**What exists today.** The should graph says no Strategy port, active Strategy singleton, Fabric bootstrap, Fabric runtime package, or Fabric service layer should remain. The current code still has the shared Strategy port, active Strategy registry, Fabric Strategy adapter, Fabric bootstrap, minimal Strategy package, Fabric knowledge/context/services, and Fabric-shaped server app-runtime services. Several pieces of behavior have already moved toward trigger-backed requests and app-owned configuration, but runtime vocabulary and dependency edges still expose the old architecture.

**What's genuinely missing.** There is no completed retirement of Strategy/Fabric from boot, package dependencies, runtime services, developer vocabulary, and user-visible labels. Former Fabric responsibilities have not all been conclusively rehomed as core app behavior, agent-layer behavior, plugin/default configuration, or dead code. The missing outcome is a running app where Strategy and Fabric are not required runtime nouns.

**Depends on.**
- **AU6** — Strategy/Fabric runtime retirement cannot safely complete until all LLM execution paths are owned by the agent-layer boundary.

**Complexity.** L

**Pre-build gates.**
- **Refinement:** Required — run /refine first (reshapes: Strategy/Fabric retirement boundary).
- **Design:** Not required — framework/package boundary; skip /design.

**Human concept review.** No — backend/framework retirement with preserved user behavior.

**Acceptance criteria.**
- The app boots without registering, selecting, or requiring an active Strategy.
- Runtime code no longer depends on a Fabric bootstrap or Fabric service bundle to start core app, agent-layer, routine, notification, knowledge, or session behavior.
- Runtime code no longer depends on a minimal Strategy implementation as a product fallback.
- Former Fabric responsibilities are observable under one of the target owners: core app domain, agent layer, plugin/default configuration, or explicitly removed dead behavior.
- Existing user-visible Work, Conversation, Knowledge, Users, Settings, Routine, notification, session, tool, MCP, and harness behavior remains available after retirement.
- Existing durable records with Strategy/Fabric-era names remain readable through current app behavior with no data loss.
- User-facing and developer-facing runtime documentation no longer requires Strategy or Fabric as active concepts.

**Validation scenarios.**
- Given a fresh app boot, when startup completes, then no active Strategy registration is required for core app and agent runs to work.
- Given existing knowledge, routine, task, session, and notification data, when the app is opened after retirement, then those records remain visible through current app surfaces.
- Given an agent run starts from a task, assistant message, or routine, when execution begins, then no Strategy or Fabric runtime object participates.
- Given a contributor reads the runtime docs, when they follow the boot/runtime model, then they can understand the system as core app plus agent layer plus plugin/default configuration.

**Plan calls.** Run /pipeline:refine first to lock the retirement vocabulary and classify remaining Strategy/Fabric responsibilities, then standard architecture pass. The plan should use `plans/strategy-kernel-plugin-split/as-is-vs-should-dependency-graph.md` as the gap inventory and `plans/strategy-kernel-plugin-split/as-should-dependency-graph.md` as the acceptance target.

**Contracts / constraints.**
- Preserve existing user-visible behavior unless refinement identifies dead behavior explicitly.
- No data loss for existing Strategy/Fabric-era durable records.
- No new runtime layer may replace Fabric under a different name.
- Plugins remain configuration sources, not execution owners.
- Agent layer remains the only owner of LLM-capable execution.

**Out of scope.**
- New plugin marketplace, installation, signing, or sandboxing.
- New configuration UI beyond preserving what AU5 introduced.
- Improving relevance scoring, prompt quality, or decomposition quality.
- Remote worker protocol.

**Effort.** L (~5d)

---

### AU9 — Hard agent handoff boundary

**Work package.** As a maintainer, I want agent work to start only through the agent-layer request boundary, so that core app domains never create, consume, or execute agent requests directly. When this ships, assistant turns, session routes, knowledge actions, routines, decomposition, tasks, and re-engagement all record intent or emit an event, and the agent layer resolves that into a durable run request and lifecycle. A direct route/service handoff into execution is a failing architecture state, not a compatibility seam.

**Why this matters.** Direct handoff is the clearest red flag in the current implementation because it leaves core app code choosing how agent execution starts. That means the should graph has not actually landed: routes and domain services still know too much about run construction and execution. This package cuts that edge completely.

**Type.** backend

**What exists today.** AU1/AU4/AU6 describe the target request path, but current code can still create triggered agent session requests from core routes and services and immediately execute them. The resulting behavior works, but ownership is wrong: core app code crosses into agent-layer work instead of publishing intent and reacting to lifecycle.

**What's genuinely missing.** There is no hard rule that domain code stops at event/request intent and never builds or consumes execution requests itself. There is also no proof that every LLM-capable entry point has the same handoff shape.

**Depends on.**
- **AU7** — Strategy/Fabric runtime retirement must be settled enough that this package can cut the remaining direct handoff paths instead of preserving them as migration glue.

**Complexity.** L

**Pre-build gates.**
- **Refinement:** Required — run /refine first to name the handoff contract and enumerate every current direct caller.
- **Design:** Not required — backend boundary only.

**Human concept review.** No — no new user-facing surface.

**Acceptance criteria.**
- Core app routes and domain services never directly create, consume, or execute agent run requests.
- Every existing LLM-capable entry point hands off by recording domain intent or publishing a domain event that the agent layer consumes.
- The agent layer is the only owner of request construction, trigger resolution outcome binding, execution admission, and lifecycle publication.
- Assistant turns, session-start paths, knowledge actions, routines, decomposition, task acceptance, and re-engagement preserve current observable behavior after the handoff cut.
- Failure, cancellation, and completion are observed by domains only through lifecycle state/events, not direct execution callbacks.
- Review for this package must include a should-graph audit proving no core-to-agent direct handoff edge remains.

**Validation scenarios.**
- Given each existing LLM-capable entry point, when it requests agent work, then the first cross-boundary artifact is a domain event or recorded intent consumed by the agent layer.
- Given a domain route or service attempts to create or execute an agent request directly, when validation runs, then the package fails.
- Given an agent run fails, completes, or is cancelled, when the originating domain updates, then it uses lifecycle state/events rather than execution internals.

**Plan calls.** Run /pipeline:refine first, then /pipeline:architecture. The architecture plan must inventory every direct handoff site, classify the replacement event/intent, and state how review will prove the should graph edge was removed.

**Contracts / constraints.**
- No direct agent request creation outside the agent layer.
- No compatibility wrapper that still lets domains execute agent work.
- No new harness path.
- Preserve current user-visible behavior.
- Review is against the should graph, not against the previous AU transitional state.

**Out of scope.**
- Plugin configuration ownership; AU10 owns it.
- Removing the app-runtime transitional shell; AU11 owns it.
- Adding new LLM-capable entry points.
- Remote worker scheduling.

**Effort.** L (~3d)

---

### AU10 — Plugin surface ownership correction

**Work package.** As a maintainer, I want plugins and built-in defaults to be configuration sources only, so that they cannot discover runtime capabilities by importing execution registries or act as a hidden runtime layer. When this ships, plugin-provided agents, skills, routines, triggers, tools, MCP, and harness descriptors are resolved from editable configuration records with provenance, while runtime execution reads the active configuration through agent-layer contracts.

**Why this matters.** The current plugin surface is not correct if plugin configuration imports tool/runtime registries or owns built-in capability resolution. That recreates Strategy/Fabric in a new place. Plugins should seed editable configuration; they should not know how execution is wired.

**Type.** framework

**What exists today.** AU2/AU5 define plugin defaults and configuration surface, but current implementation can still mix plugin configuration with built-in tool definitions and runtime-derived capability data. That makes plugin configuration depend upward on execution internals instead of being plain app configuration.

**What's genuinely missing.** There is no clean ownership split where configuration describes desired capabilities and runtime registries/adapters consume that description without being imported by plugin/default resolution.

**Depends on.**
- **AU9** — plugin triggers and defaults must feed the hard agent handoff path, not direct execution paths.

**Complexity.** M

**Pre-build gates.**
- **Refinement:** Required — run /refine first to lock plugin/default ownership and identify all runtime-derived config leaks.
- **Design:** Not required — backend/framework correction only.

**Human concept review.** No — no new user-facing surface beyond preserving AU5 behavior.

**Acceptance criteria.**
- Plugin/default configuration code does not import runtime tool registries, harness adapters, MCP bridge registries, provisioning services, or agent execution internals.
- Built-in defaults are represented through the same editable configuration/provenance model as plugin defaults.
- Runtime execution consumes active configuration through agent-layer contracts instead of plugin code pushing behavior into runtime registries.
- User overrides, disabled plugin origins, and built-in defaults preserve AU2/AU5 observable behavior.
- Capability validation is explicit and inspectable without making plugin configuration own runtime discovery.
- Review for this package must include a should-graph audit proving plugins are configuration sources only.

**Validation scenarios.**
- Given plugin/default configuration loads, when active configuration is queried, then built-in and plugin defaults appear with provenance without importing runtime registries.
- Given a user override exists, when plugin defaults change, then the override remains active and runtime consumes the active value.
- Given plugin configuration attempts to call or import execution internals, when validation runs, then the package fails.

**Plan calls.** Run /pipeline:refine first, then /pipeline:architecture. The plan must classify configuration records, runtime capability validation, and active configuration consumption against the should graph.

**Contracts / constraints.**
- Plugins seed configuration; they do not execute work.
- Built-ins use the plugin/default configuration path.
- Runtime registries/adapters consume active configuration; plugin config never imports them.
- No marketplace, signing, sandboxing, or permissions tier.
- Review is against the should graph, not against the previous AU transitional state.

**Out of scope.**
- Hard agent handoff; AU9 owns it.
- Removing app-runtime transitional ownership; AU11 owns it.
- New settings UI.
- Third-party plugin distribution.

**Effort.** M (~2d)

---

### AU11 — Runtime ownership hard cut

**Work package.** As a maintainer, I want the transitional app-runtime/Fabric-shaped shell deleted as an ownership boundary, so that runtime responsibilities live only in their final should-graph homes: core app domains, agent layer, or editable configuration. When this ships, core routes and services do not import harness, MCP, provisioning, context, or tool execution internals; agent-layer modules do not own core CRUD; and no compatibility layer remains that groups former Fabric services under a new name.

**Why this matters.** Leaving the transitional shell in place means AU7 was not a true refactor. It keeps the old architecture alive behind softer names and lets core/server code keep reaching into harness and MCP details. This package is intentionally destructive: classify, move, delete, and let tests prove behavior, instead of preserving old ownership for convenience.

**Type.** framework

**What exists today.** Strategy/Fabric source can be retired while a server-local runtime shell still carries task dispatch, routine scheduling, trigger resolution, and provisioning-adjacent behavior. Core routes can still receive harness/MCP/provisioning dependencies directly. That shape violates the should graph even if Fabric package names are gone.

**What's genuinely missing.** There is no final ownership pass that removes the transitional boundary and forbids core/server surfaces from depending on agent execution implementation details.

**Depends on.**
- **AU9** — direct agent handoff must be cut before ownership can be final.
- **AU10** — plugin/default ownership must be clean before former runtime services can be deleted or rehomed without recreating hidden configuration behavior.

**Complexity.** L

**Pre-build gates.**
- **Refinement:** Required — run /refine first to classify each transitional runtime responsibility as core app, agent layer, editable configuration, or deletion.
- **Design:** Not required — framework/backend ownership cut.

**Human concept review.** No — no new user-facing surface.

**Acceptance criteria.**
- No transitional app-runtime/Fabric-shaped ownership boundary remains in boot, service wiring, or runtime imports.
- Core routes and core domain services do not import harness adapters, MCP bridge registries, provisioning internals, context assembly, tool execution, or agent lifecycle implementation details.
- Agent-layer code does not own Work, Conversation, Knowledge, Users, Settings, Routine, or notification CRUD except through explicit core app contracts.
- Former transitional services are either moved to their should-graph owner or deleted as dead behavior; none remain as pass-through wrappers.
- Existing Work, Conversation, Knowledge, Settings, Routine, notification, session, tool, MCP, and harness behavior remains observable.
- Review for this package must include a should-graph audit proving every moved/deleted responsibility lands in the target owner.

**Validation scenarios.**
- Given app boot, when dependencies are inspected, then no transitional runtime shell participates in wiring.
- Given core route/domain code is scanned by validation, when it imports harness/MCP/provisioning/context/tool execution internals, then the package fails.
- Given a former transitional service has no final owner, when implementation review runs, then it must be deleted or explicitly rejected by the package review.
- Given task, routine, assistant, knowledge, and decomposition flows run, then existing observable behavior still works through final owners.

**Plan calls.** Run /pipeline:refine first, then /pipeline:architecture. The plan must start from `plans/strategy-kernel-plugin-split/as-is-vs-should-dependency-graph.md`, produce a responsibility-by-responsibility owner table, and require review to compare code against `plans/strategy-kernel-plugin-split/as-should-dependency-graph.md`.

**Contracts / constraints.**
- Delete hard: no pass-through ownership layer, no aliases, no compatibility shell.
- Preserve observable product behavior unless refinement explicitly classifies behavior as dead.
- Core app owns domain records/events; agent layer owns execution.
- Plugins remain configuration sources only.
- Review is against the should graph, not against the previous AU transitional state.

**Out of scope.**
- New runtime features.
- New configuration UI.
- Plugin marketplace or plugin security model.
- Remote worker protocol.

**Effort.** L (~4d)

---

### AU8 — Should dependency graph guard

**Work package.** As a maintainer, I want the should dependency graph to be mechanically enforced, so that AU cannot be called complete while forbidden Strategy/Fabric/runtime edges still exist or can silently return. When this ships, repository validation fails if runtime code reintroduces Strategy/Fabric dependencies, core app domains import agent execution internals, agent-layer modules take ownership of core domain CRUD, or plugins act as runtime executors instead of configuration sources. The graph comparison becomes a living contract rather than a one-time markdown audit. This gives future agents a fast, objective signal for whether the runtime simplification boundary still holds.

**Why this matters.** The maintainer benefits because architecture drift becomes visible immediately instead of rediscovered by another manual dependency audit. Pipeline builders benefit because they can verify boundary rules before claiming AU complete. The cost of not building this is repeating the current problem: specs say the should graph is reached, while source dependencies quietly say otherwise.

**Type.** infra

**What exists today.** The as-should graph defines target ownership rules, and the as-is-vs-should comparison records current gaps. General lint, typecheck, tests, and package scripts already exist, but there is no dedicated validation that encodes the AU dependency graph. Existing source still contains Strategy/Fabric runtime concepts, so the guard must land after retirement rather than blocking the current transitional state prematurely.

**What's genuinely missing.** There is no automated proof that core app, agent layer, and plugin/default configuration obey the should graph. There is also no pipeline-facing closure check that says AU is incomplete when forbidden runtime edges remain. The missing outcome is a validation gate that catches drift and documents the expected graph in executable form.

**Depends on.**
- **AU11** — the guard must enforce the final graph after hard handoff, plugin ownership correction, and transitional runtime ownership deletion; before AU11, the repository still intentionally contains forbidden edges.

**Complexity.** M

**Pre-build gates.**
- **Refinement:** Not required — goal is clear and reuses requirements already locked in `docs/architecture/runtime-simplification.md`.
- **Design:** Not required — infra validation; skip /design.

**Human concept review.** No — validation infrastructure only.

**Acceptance criteria.**
- Repository validation fails when runtime code imports or registers Strategy/Fabric runtime concepts after AU7.
- Repository validation fails when core app domain code imports harness, tool, MCP, context, provisioning, or other agent execution internals directly.
- Repository validation fails when plugin/default configuration code subscribes directly to domain events or invokes harness execution as a runtime actor.
- Repository validation fails when agent-layer code owns Work, Conversation, Knowledge, Users, or Settings CRUD instead of using core app contracts.
- The validation output names the violated boundary clearly enough for a pipeline-builder to fix it without rerunning a manual audit.
- The AU track has an explicit closure signal that points to the should graph and the guard, so future reviewers know AU is not done unless the guard passes.
- The review artifact for AU8 explicitly compares the repository against the should dependency graph and marks AU incomplete if any forbidden edge remains.

**Validation scenarios.**
- Given a runtime module reintroduces a Strategy/Fabric runtime import, when validation runs, then it fails with a boundary-specific message.
- Given a core domain module imports a harness adapter directly, when validation runs, then it fails with the core-to-agent-layer boundary violation.
- Given plugin/default configuration code attempts to execute agent work directly, when validation runs, then it fails with the plugin-as-runtime violation.
- Given the repository matches the should graph, when validation runs, then the AU dependency guard passes with the normal verification suite.

**Plan calls.** Standard architecture pass. The plan should translate the should graph's boundary rules into validation checks and decide how they attach to the existing verification suite without creating a custom process orchestrator.

**Contracts / constraints.**
- The guard must be deterministic and runnable in normal repository validation.
- The guard checks architecture boundaries, not style preferences.
- The guard must not require network access.
- The guard must explain failures in target-graph vocabulary.
- No broad refactor beyond what is needed to make the graph enforceable.
- Review is against the should graph, not against the previous AU transitional state.

**Out of scope.**
- Removing remaining Strategy/Fabric code; AU7 owns that.
- Adding new runtime behavior.
- Plugin marketplace or security governance.
- Visual/UI testing.

**Effort.** M (~1d)
