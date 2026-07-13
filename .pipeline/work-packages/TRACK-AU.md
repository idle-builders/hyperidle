# Track AU: Runtime Simplification

This track separates the core app from the agent layer and removes the Strategy/Fabric split. Work, Conversation, Knowledge, Users, and Settings are core app domains. The agent layer owns every LLM-capable run: request intake, provisioning, harness execution, tools/MCP, context, capture, decomposition, and lifecycle events. Plugins are not a runtime layer; they preconfigure editable app configuration for agents, skills, routines, triggers, tools, MCP, and harnesses.

The point is not a new harness path. The point is one contract for every agent run: task-backed work, assistant turns, routine-triggered runs, knowledge actions, and decomposition work all become task-optional session requests consumed by the same runtime boundary. Every event that can cause an LLM call becomes triggerable. If no user or plugin trigger matches, the runtime attaches the default eligible agent with no event-specific prompt; a matching user/plugin trigger supplies the specific agent and prompt.

**Reference.** `docs/architecture/runtime-simplification.md`; `plans/strategy-kernel-plugin-split/dependency-graph.md` (as-is); `plans/strategy-kernel-plugin-split/as-should-dependency-graph.md` (target graph); `plans/strategy-kernel-plugin-split/as-is-vs-should-dependency-graph.md` (current gap comparison); `plans/strategy-kernel-plugin-split/component-inventory.md`; `docs/architecture/as-implemented-domain-architecture.md`; `.pipeline/work-packages/TRACK-AR.md` (real harness proof boundary); current domain callers in Work, Conversation, Knowledge, Users, Settings, and Routines; `plans/AU19/concept.html` (interactive Applications/Layers/Services composition drawing, the concept document AU19 itself was registered from — see AU19's own entry below).

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

### AU8 — Should dependency graph guard (WONT BUILD; superseded by AU19)

> **2026-07-13: retired.** AU19 ("Applications, Layers, and Services") subsumes this work package's
> goal — one general table-ownership guard instead of nine separate hand-typed ones — into its Table
> ACL mechanism. Do not build AU8 standalone; see `docs/architecture/runtime-simplification.md`
> §"Applications, Layers, and Services" and `AU19` below. Spec kept for historical reference.

**Work package.** As a maintainer, I want the should dependency graph to be mechanically enforced, so that AU cannot be called complete while forbidden Strategy/Fabric/runtime edges still exist or can silently return. When this ships, repository validation fails if runtime code reintroduces Strategy/Fabric dependencies, core app domains import agent execution internals, agent-layer modules take ownership of core domain CRUD, or plugins act as runtime executors instead of configuration sources. The graph comparison becomes a living contract rather than a one-time markdown audit. This gives future agents a fast, objective signal for whether the runtime simplification boundary still holds.

**Why this matters.** The maintainer benefits because architecture drift becomes visible immediately instead of rediscovered by another manual dependency audit. Pipeline builders benefit because they can verify boundary rules before claiming AU complete. The cost of not building this is repeating the current problem: specs say the should graph is reached, while source dependencies quietly say otherwise.

**Type.** infra

**What exists today.** The as-should graph defines target ownership rules, and the as-is-vs-should comparison records current gaps. General lint, typecheck, tests, and package scripts already exist, but there is no dedicated validation that encodes the AU dependency graph. Existing source still contains Strategy/Fabric runtime concepts, so the guard must land after retirement rather than blocking the current transitional state prematurely.

**What's genuinely missing.** There is no automated proof that core app, agent layer, and plugin/default configuration obey the should graph. There is also no pipeline-facing closure check that says AU is incomplete when forbidden runtime edges remain. The missing outcome is a validation gate that catches drift and documents the expected graph in executable form.

**Depends on.**
- **AU17** — the guard must enforce the should-graph with zero tolerated allowlist exceptions for genuine violations (founder ruling, this track's own review cycle); AU12–AU16 close every violation that would otherwise need one (Conversation/Users/Work/Routine/Knowledge cross-writing, the routine-scheduler fire-time bypass, the descriptor-read allowlist), and AU17 gives the guard a real package boundary to check instead of a hand-typed file allowlist. AU8 stays blocked until AU17 is `done`.

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

**Plan calls.** Standard architecture pass. Consolidate the four existing overlapping guard scripts (`au7-runtime-retirement-guard.ts`, `au9-direct-handoff-guard.ts`, `au10-plugin-config-ownership-guard.ts`, `au11-runtime-ownership-guard.ts`) into one, reframed around a `TABLE_OWNER` map (one entry per table naming which service owns it) rather than a per-file core-vs-agent allowlist — this catches cross-domain-within-core violations the current file-based split structurally cannot see (e.g. a Routine handler writing into `messages` would be invisible to a core-vs-agent split, since both sides are "core," but is exactly what a table-ownership map catches). Add a parallel `ROUTE_OWNER` map for the same idea one level up at the HTTP-route grain, since the MCP/worker endpoints are physically mounted on the same server as Core API's own domain routes — physical colocation is not the same as logical permission, and a future route that blurs that line needs the same mechanical catch. By the time this work package runs, AU12–AU17 should have removed every genuine violation that would otherwise have needed an allowlist entry; the two real, deliberate (not violation) exceptions expected to remain are the `routines.ts` 3-function curated cross-package export for `packages/eval`, and — pending confirmation from AU12/AU13's Settings/Notification audit task — possibly Settings/Notification rows in `TABLE_OWNER` if that audit found the same raw-write pattern there.

**Follow-on registered by AU15 (`agent_work_intents` single-owner guard).** Add `agent_work_intents` to AU8's `TABLE_OWNER` map (owner = `services/agent-work-intents.ts` + `services/agent-work-intent-worker.ts`; sanctioned write helper = `recordAgentWorkIntent`). AU15 could only close its own chartered edge file-scoped (no `agent-selection` import / no raw `agentWorkIntents` access in `routine-scheduler.ts`) because a full zero-allowlist guard cannot land while three pre-existing non-owner accessors remain: `routes/threads.ts` (insert), `routes/sessions-routes.ts` (read), `services/agent-layer-boot.ts` (read). AU8 (or a dedicated predecessor) must migrate those three onto the owning module before adding the `agent_work_intents` `TABLE_OWNER` row — same shape as AU13 did for `routines`/`routineRuns`. Recorded here so this debt is durable and not lost when `plans/AU15/` is retired at write-docs.

**Contracts / constraints.**
- The guard must be deterministic and runnable in normal repository validation.
- The guard checks architecture boundaries, not style preferences.
- The guard must not require network access.
- The guard must explain failures in target-graph vocabulary.
- No broad refactor beyond what is needed to make the graph enforceable.
- Review is against the should graph, not against the previous AU transitional state.
- No allowlist entries for genuine violations — only the two named, deliberate exceptions above (or others explicitly surfaced and justified during this work package's own architecture pass) may be allowlisted; anything else found must be sent back as a new prerequisite work package, not absorbed into an exception.

**Out of scope.**
- Removing remaining Strategy/Fabric code; AU7 owns that.
- Adding new runtime behavior.
- Plugin marketplace or security governance.
- Visual/UI testing.

**Effort.** M (~1d)

---

### AU12 — Conversation and Users own their own writes

**Work package.** As a maintainer closing out Track AU, I want the Conversation domain (threads, messages) and the Users/Agents domain (human and agent identity records) to each have exactly one owning module that writes their tables, so that core routes and agent-layer code both call that module instead of writing the same rows two different ways. When this ships, a thread can be created, a message appended, a user record created or updated — through one function per operation, called from wherever that operation is needed, with no other code path touching those tables directly. Nothing about what the product does changes; what changes is that there is finally one place that owns the shape and correctness of a message or a user record.

**Why this matters.** The maintainer benefits because this is the single largest reason AU8's should-graph guard cannot be built without allowlisting real violations away: today, agent-owned code and core routes independently write the same Conversation/Users tables with no shared function, so there is no single place enforcing what a valid message or user record even is. The cost of not building this is that any future guard checking "does agent-layer code own core CRUD" has nothing to check against — the violation is structural, not a one-off bug, and it will keep recurring at every new call site until there is a real owning module to route through.

**Type.** backend.

**What exists today.** `services/agent-work-assistant.ts` (agent-owned) does `db.insert(messages)` at two separate call sites and `db.insert(users)` to lazy-create the assistant user the first time it's needed. `services/assistant-dispatcher.ts` (agent-owned) does `db.update(threads)` to pin a thread after a reply. Independently, core routes — `routes/assistant.ts`, `routes/coach.ts`, `routes/teams-routes.ts`, `routes/users.ts`, `routes/threads.ts`, `routes/agents.ts` — each do their own raw inserts/updates against the same `threads`/`messages`/`users` tables. No function on either side is shared; there is no Conversation service and no Users/Agents service anywhere in the codebase. This is confirmed by direct code reading (a forked audit agent traced every call site), not inferred.

**What's genuinely missing.** A Conversation service (owns `threads`/`messages`: create a thread, append a message, pin/unpin, whatever the current call sites collectively need) and a Users/Agents service (owns `users`: create, get-or-create, update identity/config fields) that both core routes and agent-layer code call — replacing every raw `db.insert`/`db.update` against these tables outside the owning service's own file.

**Depends on.**
- **AU11** — the agent-owned files this touches (`agent-work-assistant.ts`, `assistant-dispatcher.ts`) were relocated and finalized by AU11; their location needed to be stable before refactoring their internals.

**Complexity.** L

**Pre-build gates.**
- **Refinement:** Not required — goal is clear and reuses requirements already locked in `docs/architecture/runtime-simplification.md` and `plans/strategy-kernel-plugin-split/as-should-dependency-graph.md` (Core App Graph already specifies a Conversation Service and a User/Agent Service as the target shape).
- **Design:** Not required — backend refactor, no new or changed UI surface, no user-visible behavior change.

**Human concept review.** No — pure internal refactor; nothing user-facing moves.

**Acceptance criteria.**
- Every current caller that creates or modifies a thread, a message, or a user record does so by calling one owning function for that table, from wherever the call originates (core route or agent-layer code) — never a direct insert/update against the table itself.
- All existing observable Conversation and Users/Agents behavior (assistant replies appear, threads pin correctly, the assistant user is created exactly once, team member/user CRUD via routes) is unchanged from before this work package.
- A newly-written call site that tried to bypass the owning function and write the table directly would fail typecheck or a lint/guard check, not merely convention.
- Repository validation (or a review-time audit) can enumerate zero remaining direct-table-write call sites against `threads`/`messages`/`users` outside the two owning modules.

**Validation scenarios.**
- Given an assistant turn produces a reply, when the reply is recorded, then it goes through the Conversation service's message-append function and the same message appears via the existing API exactly as before.
- Given the assistant user does not yet exist for a team, when an assistant turn needs it, then the Users/Agents service's get-or-create function is what creates it, not a raw insert in `agent-work-assistant.ts`.
- Given a routine or task-dispatch path pins a thread after a reply, when that happens, then it calls the Conversation service's pin function.
- Given the full existing test suite for threads/messages/users routes and agent-work-assistant/assistant-dispatcher behavior, when it is re-run after this work package, then it passes unchanged (behavior-preservation, not new behavior).

**Plan calls.** Standard architecture pass, but treat this as a behavior-preservation refactor first: enumerate every current call site against `threads`/`messages`/`users` (core and agent-owned) before designing the two services' function signatures, so the new functions are shaped by what real callers need rather than an idealized API. As a first task, audit the Settings and Notification domains for the same raw-write pattern (not yet checked at this depth) — if found, flag scope growth back to the maintainer rather than silently absorbing it into this work package.

**Contracts / constraints.**
- No product behavior may change — this is ownership consolidation, not a feature.
- The owning service's functions are the only code (besides the service's own tests) permitted to import the Drizzle table objects for `threads`/`messages`/`users`.
- No new tables, no schema changes.
- Agent-layer callers keep calling in-process (same process, function call) — no queue, no API introduced at this boundary.

**Out of scope.**
- Knowledge, Work, Routine, Settings, Notification domains — separate work packages.
- Any UI change.
- The routine-scheduler fire-time bypass (AU15) or the descriptor-read allowlist (AU16) — unrelated edges.
- The package split (AU17) — comes after this and depends on it.

**Effort.** L (~3-4d)

---

### AU13 — Work and Routine own their own writes

**Work package.** As a maintainer closing out Track AU, I want the Work domain (bets, tasks, work items) and the Routine domain (routines, routine runs) to each have exactly one owning module that writes their tables, so that core routes and agent-layer routine execution both call that module instead of writing the same rows two different ways. When this ships, creating a work item, recording a routine run, or updating a routine's schedule all happen through one function per operation, called from wherever it's needed. Same shape of change as AU12, for the other two domains that share a call path through routine execution.

**Why this matters.** The maintainer benefits for the same reason as AU12: this is a second, confirmed instance of the same structural violation, not a variant that can be skipped. Built-in routine execution is one of the most frequently firing agent-layer code paths (practice meetings, portfolio retros, knowledge decay/promotion all run through it) — leaving it writing Work and Routine tables directly means the single highest-traffic agent-owned code path is also the least accountable one.

**Type.** backend.

**What exists today.** `services/builtin-routine-handlers.ts` (agent-owned) does `tx.insert(threads)` and `tx.insert(items)` — `items` is a Work-domain table — as part of running built-in routines, and separately does `insert(routines)`, `insert(routineRuns)`, `update(routines)` directly. No Work service and no Routine service exist; core routes that touch bets/tasks/items and routines/routine_runs do their own independent writes, same pattern as AU12's finding for Conversation/Users. Confirmed by direct code reading.

**What's genuinely missing.** A Work service (owns `bets`/`tasks`/`items`) and a Routine service (owns `routines`/`routine_runs`) that both core routes and `builtin-routine-handlers.ts` call, replacing every raw `insert`/`update` against these tables outside the owning service's own file. (The `threads` insert inside `builtin-routine-handlers.ts` should route through AU12's Conversation service, since it's the same table — flag the overlap to whichever of AU12/AU13 lands second so the call site isn't refactored twice.)

**Depends on.**
- **AU11** — `builtin-routine-handlers.ts` is one of the 14 agent-owned files AU11 relocated and finalized; its location needed to be stable first.

**Complexity.** L

**Pre-build gates.**
- **Refinement:** Not required — goal is clear and reuses requirements already locked in `docs/architecture/runtime-simplification.md` and the as-should-dependency-graph.md.
- **Design:** Not required — backend refactor, no UI surface.

**Human concept review.** No — pure internal refactor.

**Acceptance criteria.**
- Every current caller that creates or modifies a bet, task, work item, routine, or routine run does so by calling one owning function for that table, never a direct insert/update.
- All existing observable Work and Routine behavior (built-in routines still fire and produce the same effects, task/bet CRUD via routes unchanged) is unchanged from before this work package.
- The `threads` insert inside `builtin-routine-handlers.ts` is routed through AU12's Conversation service rather than left as, or duplicated into, a second raw write path.
- Repository validation (or a review-time audit) can enumerate zero remaining direct-table-write call sites against `bets`/`tasks`/`items`/`routines`/`routine_runs` outside the two owning modules.

**Validation scenarios.**
- Given a built-in routine (e.g. `knowledge-decay`, `portfolio-retro`) fires, when it creates a work item or records its run, then it does so through the Work/Routine service functions and produces the same observable rows as before.
- Given a task is accepted or a bet's state changes via a core route, when that write happens, then it goes through the Work service.
- Given the full existing test suite for tasks/bets/routines and `builtin-routine-handlers.ts` behavior, when it is re-run after this work package, then it passes unchanged.

**Plan calls.** Standard architecture pass, behavior-preservation first: enumerate every current call site against `bets`/`tasks`/`items`/`routines`/`routine_runs` before designing the two services. Coordinate with AU12 on the shared `threads` write inside `builtin-routine-handlers.ts` so it isn't independently refactored by both work packages. As a first task, if AU12 has not already done so, audit Settings and Notification for the same pattern.

**Contracts / constraints.**
- No product behavior may change.
- The owning service's functions are the only code permitted to import the Drizzle table objects for `bets`/`tasks`/`items`/`routines`/`routine_runs`.
- No new tables, no schema changes.
- No change to routine scheduling/timing in this work package — that is AU15's job, not this one's; this work package only changes *who writes the tables*, not *when agent selection happens*.

**Out of scope.**
- Conversation, Users, Knowledge, Settings, Notification domains — separate work packages.
- The routine-scheduler fire-time bypass (AU15) — depends on this landing first, but is its own decision and its own work package.
- The package split (AU17).

**Effort.** L (~3-4d)

---

### AU14 — Knowledge write-path unification

**REOPENED (2026-07-12), CORRECTED AGAIN same day — writes-only was not sufficient; this WP is not
done.** The original round (PR #434, merged `f22990a7`) unified `routes/knowledge.ts`'s `POST /` and
`PATCH /:id` onto the repository and is staying merged — do not revert or redo that half. A founder
ruling on the sibling AU12/AU13 work packages (`feedback_service_ownership_includes_reads.md`)
corrected a mis-interpretation this WP made independently and identically: **"the owning service is
the only code permitted to import the table object" is a hard requirement covering reads too, not
just writes — even when a WP's acceptance criteria text only spells out write call sites.** The first
reopening pass (below, drafted against that ruling) scoped this round to reads only — the 4 GET
handlers plus the two POST/PATCH post-write re-selects — because those were the call sites the
founder's AU12/AU13 example concretely named. **That was still too narrow.** The founder's directive
is unconditional: **"all reads and write MUST go through the knowledge service. no exclusion."**
Read literally, that also closes the write-side carve-out round 1 itself made explicit ("Out of
scope for this WP: `PATCH /:id/scope`, `POST /:id/merge`, `POST /:id/split`, `POST /:id/archive`,
`POST /:id/flag`... keep as-is") — those five handlers still do their own `db.update`/
`db.insert(knowledgeItems)` today, unconverted by round 1 and untouched by the reads-only draft of
this reopening. **This round now covers every remaining direct `knowledgeItems` table access in
`routes/knowledge.ts`, read or write, with zero named exceptions** — the 4 GET handlers, the two
post-write re-selects, AND the five specialized write handlers' own reads and writes
(scope-change, merge, split, archive, flag). After this round, grep for `knowledgeItems` (any
`db.select`/`db.insert`/`db.update` call, not just `.from`) in `routes/knowledge.ts` outside a call
into `knowledge-repository.ts` must return zero matches — full stop.

**Work package.** As a maintainer closing out Track AU, I want Knowledge to have exactly one path —
covering both reads and writes — for every access to a knowledge item, so that no code anywhere in
the server can see or change `knowledge_items` except through `knowledge-repository.ts`. Writes are
already unified (AU14 round 1). This round closes reads: every one of `routes/knowledge.ts`'s GET
handlers, and the write handlers' own post-write re-select, must call the repository instead of
selecting from the table directly.

**Why this matters.** A write-only guard only catches half the coupling problem the Knowledge
repository exists to kill — every other domain module, and any future one, can still read the row
shape directly around the repository's abstraction, meaning a future repository-level change (a
computed field, a soft-delete filter, a redaction rule) silently doesn't apply to whichever read
call site wasn't converted. The whole point of "one owning module per table" is that it is
literally the only code path to that table, full stop — not "the only path for a subset of
operations."

**Type.** backend.

**What exists today (post round-1 merge, `f22990a7`).** `packages/server/src/knowledge/knowledge-repository.ts` has `create`/`update`/`list`/`search`, already called by `services/context-assembly.ts`, `services/writeback.ts`, and three agent tools (`tools/write-memory.ts`, `tools/promote-knowledge.ts`, `tools/query-practice.ts`). `routes/knowledge.ts`'s `POST /` and `PATCH /:id` now call the repository's `create`/`update` (round 1, done) — but the repository's already-exported `list()`/`search()` functions are not called by any GET handler. Every GET handler still does its own raw `db.select().from(knowledgeItems)` with its own Q2 filtering, its own AF13-computed fields (`accessCount30d`, `lastActivityAt`, `relatedItems`), and its own triage-count aggregation — none of which routes through `list()`/`search()`. The two POST/PATCH handlers' post-write re-select (kept as a raw read in round 1, deliberately, to preserve the exact response shape) is the same gap in miniature.

**What's genuinely missing.** `routes/knowledge.ts`'s GET handlers (`/search`, `/`, `/triage-count`, `/:id`, and the related-items computation inside `/:id`) need to call the repository's `list`/`search` (extended if they don't yet support everything a given GET handler needs — e.g. triage-count aggregation, related-items lookup, the AF13 computed-signal fields) instead of a raw `db.select()`. The `POST /`/`PATCH /:id` post-write re-select should also go through a repository read function rather than a raw select. Q2 read-filtering must be preserved exactly, using the same non-HTTP-caller-safe pattern round 1 established for writes (resolved value passed in, not a `userId` the repository inspects itself).

**Depends on.**
- None. Independent of AU12/AU13 — touches only the Knowledge domain, not Conversation/Users/Work/Routine. Not blocked by round 1 having already merged; this is additive to that code, not a revert.

**Complexity.** L (was M for round 1's writes-only scope). Covers four GET handlers with real
computed-field logic (access signals, related items, triage aggregation) AND five specialized
write handlers (scope-change, merge, split, archive, flag) whose own reads/writes were never
converted by round 1.

**Pre-build gates.**
- **Refinement:** Not required — goal is clear; this is convergence onto an already-existing implementation, not new design. Same rationale as round 1, now applied to the full remaining surface.
- **Design:** Not required — backend refactor, no UI surface.

**Human concept review.** No.

**Acceptance criteria.**
- `routes/knowledge.ts`'s `GET /search`, `GET /`, `GET /triage-count`, and `GET /:id` handlers call the knowledge repository's `list`/`search` functions (extended, or new narrowly-scoped functions) rather than performing their own `db.select()` reads.
- `POST /` and `PATCH /:id`'s post-write response re-select also goes through a repository read function rather than a raw `db.select()`.
- `PATCH /:id/scope`, `POST /:id/merge`, `POST /:id/split`, `POST /:id/archive`, and `POST /:id/flag` — every read AND write these five handlers perform directly against `knowledgeItems` — is routed through the repository (existing `create`/`update`, or new narrowly-scoped repository functions for merge/split's multi-row operations). Round 1's explicit carve-out of these five handlers is superseded; there is no remaining exception.
- The Q2 user-scope visibility rule (an item is visible if not user-scoped, or if the requesting user is its owner) continues to hold exactly as before, for every read AND write call site, including all newly-converted ones.
- Every currently-observable behavior — AF13's computed `accessCount30d`/`lastActivityAt`/`relatedItems` fields, the triage-count aggregation, the `knowledge_accessed` event emission on `GET /:id`, merge/split's multi-row semantics, archive/flag's status transitions, scope-change's projection-layer update — is preserved exactly.
- `routes/knowledge.ts` has zero remaining direct `knowledgeItems` table access of any kind (`db.select`, `db.insert`, `db.update`) outside a call into `knowledge-repository.ts` — grep-verifiable, zero-allowlist, no named exceptions.
- (Carried from round 1, already satisfied, must not regress): create/update call the repository; Q2 write-side holds; exactly one event per write; edit log records every create/update regardless of origin.

**Validation scenarios.**
- Given the existing knowledge route integration tests (list/search/triage-count/get-by-id, scope-change, merge, split, archive, flag, including their Q2 exclusion assertions and their AF13 computed-field assertions), when re-run after this round, then all pass with no behavior change to any consumer.
- Given a user-scoped knowledge item exists, when a different user requests the list, search, or triage-count, then it is excluded exactly as it is today (Q2 preserved on every read path, not just `GET /`).
- Given a knowledge item is read via `GET /:id`, when it is read, then it still emits `knowledge_accessed` and still returns the same computed fields as before this round.
- Given two items are merged, or one item is split, when the operation completes, then the resulting rows and edit-log entries are identical to today's raw-write behavior.
- Given a repo-wide grep for any `knowledgeItems` table access (`db.select`/`db.insert`/`db.update` targeting it) outside `knowledge-repository.ts`, when run after this round, then it returns zero matches in `routes/knowledge.ts`.

**Plan calls.** The repository's `list()`/`search()`/`create()`/`update()` were designed for their existing non-HTTP callers (`context-assembly.ts`, `writeback.ts`, tools) and do not yet support everything the route's GET handlers or the merge/split/archive/flag/scope-change handlers need. The plan must decide, per handler, whether to extend an existing repository function or add a new narrowly-scoped one — but in every case the route must stop touching `knowledgeItems` directly, and the repository must stay callable by its existing non-HTTP callers with no behavior change to them. Follow round 1's precedent for the Q2 pattern (resolved values passed in, repository never inspects `userId`) for both reads and the write handlers that need it. Merge/split are the highest-risk conversions (multi-row, non-CRUD-shaped operations) — the plan should treat them as their own design problem, not assume `create`/`update` cover them as-is.

**Contracts / constraints.**
- No behavior change visible to any existing consumer of any read or write endpoint.
- The repository remains the single owner of all `knowledge_items` reads AND writes, with zero exceptions; `routes/knowledge.ts` becomes purely a caller of it, never a second implementation of any operation on that table.
- No schema changes.
- Round 1's write-path unification (PR #434, `POST /` and `PATCH /:id`) stays intact — this round is additive, not a redo, and extends the same pattern to the remaining five write handlers plus all reads.

**Out of scope.**
- Any other domain's read/write path (see AU12/AU13 — which have the identical read gap and need their own equivalent follow-up, not covered here).
- Changing what Q2 visibility means, only preserving it through the merge.
- The descriptor read-model (AU16) or package split (AU17) — unrelated.

**Effort.** L (~2d) — was M (~1d) for round 1's writes-only scope.

---

### AU15 — Routine agent-selection goes through the intent queue

**Work package.** As a maintainer closing out Track AU, I want routine-triggered agent selection to go through the same durable intent-queue path every other trigger family (task acceptance, knowledge actions, assistant messages) already uses, so that there is exactly one channel between Core App and the Agent Layer — never a second, undocumented one. When this ships, `routine-scheduler.ts` no longer calls agent-owned selection code directly at fire-time; a routine firing produces a durable intent the agent layer's normal drain path picks up, the same way every other family already works.

**Why this matters.** The maintainer benefits because a durable queue's real value — surviving a process crash between "the fact was recorded" and "the agent layer acted on it," and not blocking the caller for however long that takes — holds regardless of whether Core App and the Agent Layer happen to run in the same process, which they always do today. A second channel that bypasses the queue "because it's simple" undermines that guarantee for exactly the trigger family using it, and is also the one thing left that AU8's should-graph guard cannot mechanically allow without adding a special-cased exception — which the maintainer has ruled out. AU11's own review already looked at fixing this the obvious way and rejected it because it silently changes *when* agent selection happens (fire-time vs. drain-time); this work package exists to make that decision on purpose, with the timing implications re-verified, rather than leave it as an unexamined shortcut.

**Type.** backend.

**What exists today.** `services/routine-scheduler.ts` (core, evaluates cron due-checks) imports `agent-selection.ts` (`isAgentAtWipLimit`, `selectAgentByAppDefaults`) and calls it directly and synchronously when a routine becomes due, deciding the owner/eligible agent at that exact moment. Every other trigger family — task acceptance, knowledge actions, assistant messages, bet decomposition — instead writes a durable `agent_work_intents` row in the same transaction as its own domain write, and the agent layer's drain loop resolves the trigger and selects the agent later, asynchronously. Confirmed present as of the AU11 branch's own review, which named it explicitly as a deliberate, undocumented-as-permanent residual edge.

**What's genuinely missing.** A decision, made on purpose, about whether routine-triggered agent selection should move to drain-time (matching every other family) or be formalized as an intentional, permanent, first-class second mode — and, in either case, the implementation and re-verification that routine behavior (WIP-limit enforcement, owner-role resolution) still holds correctly under whichever timing is chosen. Given the "exactly one channel" principle, the expected direction is closing the bypass (moving to drain-time), not formalizing the exception, but the architecture pass must make and justify this call explicitly rather than default to it without checking for a real correctness reason routines might need fire-time information that drain-time can't reconstruct.

**Depends on.**
- **AU13** — this work package touches `routine-scheduler.ts` and interacts with `builtin-routine-handlers.ts`, both of which AU13 is also modifying (giving Routine a real owning service); sequencing after AU13 avoids two work packages independently changing the same files.

**Complexity.** L

**Pre-build gates.**
- **Refinement:** Not required — the user-facing goal (routines keep firing correctly) is already clear; the open question is a technical timing decision, which belongs in `/architecture`, not `/refine`.
- **Design:** Not required — backend/infra, no UI surface.

**Human concept review.** No.

**Acceptance criteria.**
- Routine-triggered agent selection no longer calls `agent-selection.ts` directly and synchronously from `routine-scheduler.ts` at fire-time; it is resolved through the same intent-queue/drain path every other trigger family uses, OR — only if the architecture pass concludes fire-time selection is genuinely required and documents why — it is formalized as a named, first-class second resolution mode with an explicit rationale, not a silent bypass.
- WIP-limit enforcement (`isAgentAtWipLimit`) and owner-role resolution (`selectAgentByAppDefaults`) produce the same effective outcome for existing routines under the new timing as they did under the old, for every built-in routine (`practice-meeting`, `post-bet-retro`, `portfolio-retro`, `knowledge-decay`, `knowledge-promotion`).
- If timing moved from fire-time to drain-time, the work package's validation explicitly checks for and rules out (or documents and accepts) any race between a routine becoming due and the drain processing its intent.
- AU8's should-graph guard (once built) requires no special-cased allowlist entry for this edge.

**Validation scenarios.**
- Given a routine becomes due while its eligible agent is at its WIP limit, when the routine fires, then the same "don't dispatch" outcome occurs under the new path as under the old.
- Given a routine with a specific owner-role resolution rule becomes due, when it fires, then the same agent is selected as before.
- Given the full existing routine-firing test suite, when re-run after this work package, then it passes with no unexplained behavior change; any explained, intentional change is called out in the architecture plan and confirmed acceptable.

**Plan calls.** This work package needs a real architecture decision, not just a mechanical move: start from AU11's own review notes on why the obvious drain-time fix was rejected, and either resolve that concern for real (e.g. by confirming the due-check evaluation itself doesn't need fire-time-only data) or find a different way to close the channel that doesn't reintroduce the same problem. Do not default to "formalize the exception" without first genuinely checking whether the fire-time requirement is real.

**Contracts / constraints.**
- No second channel between Core App and the Agent Layer may remain undocumented; whatever this work package lands on must be either the standard queue path or an explicitly named, justified exception — never a silent bypass.
- Built-in routine behavior (which agent runs, when, and whether WIP limits are respected) must not silently change; any behavior change must be intentional and documented.

**Out of scope.**
- Changing what the built-in routines themselves do — only how agent selection is triggered.
- The Work/Routine service boundary itself (AU13's job, must land first).
- The package split (AU17) or AU8 itself.

**Effort.** L (~2-3d)

---

### AU16 — Harness/worker capability read-model

**Work package.** As a maintainer closing out Track AU, I want core routes that display which harnesses and workers are available to read that information through a real, agent-layer-owned read function, so that no core route needs to import anything from the harness/MCP internals — not even for a read-only display. When this ships, the 8 route files that currently import adapter/registry types directly instead call one small exported read function, and the descriptor-read allowlist in `au11-runtime-ownership-guard.ts` is no longer needed.

**Why this matters.** The maintainer benefits because today's allowlist is a hand-verified, per-file carve-out — each of the 8 files was checked, once, to confirm it only performs read-only capability queries, with no structural guarantee that a *future* addition to one of those files stays read-only. A real read API removes the need for that manual verification permanently: a route calling a read function categorically cannot reach an execution call, because the function it's calling doesn't expose one.

**Type.** backend.

**What exists today.** `au11-runtime-ownership-guard.ts`'s `DESCRIPTOR_READ_ALLOWLIST` names 8 route files (`agent-profile.ts`, `agents.ts`, `assistant.ts`, `connections.ts`, `harnesses.ts`, `teams-routes.ts`, `users.ts`, `workers.ts`) permitted to `import type` `AdapterPool`/`SandboxAdapter`/`McpBridgeRegistry` for genuine read-only queries (`.size`, `.getCapabilitiesByType()`, `.listCapabilityDescriptors()`, `.refreshDiscoveries()`, `.getRegistrationMetaByType()`, `.list()`) — verified file-by-file at AU11 build time to contain zero execution calls.

**What's genuinely missing.** A small, real, agent-layer-owned function (or narrow set of functions) that exposes exactly the read-only capability/registration data these 8 files need, callable without importing anything from `harness/` or `mcp/`. Once it exists, all 8 files are repointed to it and the allowlist is deleted, not just left in place unused.

**Depends on.**
- None. Independent of AU12–AU15 — touches only route files and a new small read surface in the harness/adapter area, not Conversation/Users/Work/Routine/Knowledge.

**Complexity.** M

**Pre-build gates.**
- **Refinement:** Not required — the gap and its 8 call sites are already fully enumerated; no design decision to sharpen.
- **Design:** Not required — backend/infra, no UI surface (the 8 routes' existing UI-facing behavior is unchanged, only what they import changes).

**Human concept review.** No.

**Acceptance criteria.**
- None of the 8 currently-allowlisted route files import anything from `harness/` or `mcp/` paths, directly or via type-only import, after this work package.
- Each of the 8 files instead calls one exported, read-only function that returns exactly the capability/registration data it currently reads (available harnesses, worker connection status, capability descriptors).
- `DESCRIPTOR_READ_ALLOWLIST` is deleted from `au11-runtime-ownership-guard.ts` (or the guard consolidation in AU8, whichever lands the change) with zero remaining findings.
- The observable behavior of all 8 routes (what a client sees when querying harness/worker/connection availability) is unchanged.

**Validation scenarios.**
- Given a client queries available harnesses via `routes/harnesses.ts`, when the route runs, then it returns the same data as before, sourced from the new read function instead of a direct adapter-type import.
- Given a worker connects or disconnects, when `routes/workers.ts` is queried, then it reflects the same connection status as before via the new function.
- Given the guard runs after this work package (or AU8's consolidated version), when it scans the 8 previously-allowlisted files, then it reports zero findings without needing an allowlist entry for them.

**Plan calls.** Standard architecture pass. Design the read function(s) from the actual union of what the 8 files currently query (enumerate each file's specific calls first), not from an idealized capability API — this is a narrow extraction, not a new subsystem.

**Contracts / constraints.**
- No new execution capability is exposed — read-only, full stop.
- No behavior change visible to any client of the 8 routes.

**Out of scope.**
- Any other Agent Layer internals (Tool Surface, Sandbox Bridge, etc.) — this work package touches only the harness/worker capability read path.
- The package split (AU17) or AU8 itself.

**Effort.** M (~1d)

---

### AU17 — Core App and Agent Layer as real packages (WONT BUILD; superseded by AU19)

> **2026-07-13: retired, founder-rejected.** PR #447 implemented this spec — two workspace packages
> plus a slimmed composition root — CI-green, but closed unmerged on founder review: the package
> *boundary* was correct in principle, but each new package's internals were a flat, undifferentiated
> `services/` dump (43 files in core-app, 31 in agent-layer) carried over unchanged from the old
> monolith, not a real domain structure. AU19 replaces this spec with an Applications / Layers /
> Services structure that gives every file a real domain home, not just a package. Do not build AU17
> standalone; see `docs/architecture/runtime-simplification.md` §"Applications, Layers, and Services"
> and `AU19` below. Spec kept for historical reference — AU19's plan should reuse AU17's real,
> verified findings (the acyclic file classification, the external-consumer migration table, the
> `au17-package-boundary-guard.ts` typecheck-boundary technique) rather than re-deriving them.

**Work package.** As a maintainer closing out Track AU, I want Core App and Agent Layer to be real, separate workspace packages instead of a hand-typed allowlist of file paths inside a directory both share, so that the boundary between them is a build-time fact — an unauthorized import fails typecheck — rather than something only a guard script re-derives on every run. When this ships, `packages/server`'s ~80 services/routes files are split into `@hyperidle/core-app` and `@hyperidle/agent-layer`, each with a small, deliberate `exports` map, wired together by a thin bootstrap package so the deployable server is unchanged.

**Why this matters.** The maintainer benefits because today's guard scripts need a hand-maintained array of agent-owned file paths (`AU9_AGENT_FILES`, `AU11_AGENT_FILES`, and their extras) precisely because there is no folder, let alone package, distinguishing core from agent-owned code — everything lives together in one flat `services/` directory of 81 files. A real package boundary means a new file's ownership is decided once, by which package it's created in, not re-derived by a script every time the guard runs; and it means the boundary is enforced by `tsc`/the build itself, not only by a lint pass someone has to remember to run.

**Type.** framework.

**What exists today.** `packages/server` is a single npm workspace package containing `routes/`, `services/`, `harness/`, `knowledge/`, `notifications/`, `config/`, `tools/`, `mcp/` — Core App and Agent Layer code both live inside `services/` (81 files), distinguished only by the guard scripts' hand-typed allowlists. `packages/server/package.json`'s `exports` map already deep-exports roughly 15 individual internal files (`./harness/adapter-pool`, `./services/session-provisioning`, etc.) directly to other packages — confirmed by reading the file — meaning even today's "public API" is a pile of internal-path exports, not a deliberate small surface. Confirmed via topology research this session: Core App and Agent Layer's orchestration half are colocated in every deployment shape observed (embedded on laptop, colocated in the shared-backend cluster pod); only harness execution ever actually crosses a process/machine boundary (a joined remote worker), and that boundary already has zero database coupling (`worker-ws.ts`/`remote-harness-adapter.ts` import nothing from `@hyperidle/db`).

**What's genuinely missing.** Two real workspace packages (naming: `@hyperidle/core-app` and `@hyperidle/agent-layer`, or equivalent) each owning their own files with TypeScript project references between them, a small deliberate `exports` map replacing today's ~15-file sprawl, and a thin bootstrap layer (could remain inside a slimmed `packages/server`) that wires both into the one deployable Hono app/process — with no change to how the app actually runs or deploys in any topology.

**Depends on.**
- **AU12** — Conversation/Users services must exist and own their tables before splitting packages around them; splitting first would just relocate the current cross-writing into two packages instead of fixing it.
- **AU13** — same reasoning, for Work/Routine.
- **AU14** — Knowledge's write path must be unified first, for the same reason.
- **AU15** — the routine-scheduler edge touches files this work package will be relocating; landing it first avoids moving files mid-change.
- **AU16** — the descriptor-read allowlist must be replaced by a real read function first, so the new `core-app` package genuinely has zero harness/mcp imports to carry forward.
- **AU18** — Settings/Notification must own their own tables first, same reasoning as AU12/AU13/AU14: splitting Core App into a real package while `factorySettings`/`notificationQueue` still have no single owner just relocates the cross-writing into the new package instead of fixing it.

**Complexity.** L

**Pre-build gates.**
- **Refinement:** Not required — the target shape is already specified by this track's should-graph docs and this session's topology research; no open conceptual question remains.
- **Design:** Not required — framework/build-tooling change, no UI surface.

**Human concept review.** No.

**Acceptance criteria.**
- `@hyperidle/core-app` and `@hyperidle/agent-layer` exist as separate workspace packages; no directory-convention-only distinction remains.
- Neither package can import a file from the other except through its declared `exports` map — verified by an import that isn't in the map failing to resolve at typecheck, not merely by convention.
- The deployable server (web/desktop-facing behavior, all existing routes, all existing agent-run behavior) is unchanged in every currently-supported topology (laptop-solo, shared-backend, remote worker).
- `packages/server`'s `exports` map (or its successor packages' maps) no longer deep-exports individual internal files as its primary shape — the surface is small and deliberate.
- Any dead code `knip` can newly see as a result of removing the old barrel/re-export structure is deleted, not suppressed with a new ignore-list entry.

**Validation scenarios.**
- Given the full existing test suite (unit, component, integration, e2e), when run after the split, then all pass with no behavior change attributable to the package restructuring itself.
- Given a hypothetical file in `core-app` tries to import an unexported internal file from `agent-layer`, when typecheck runs, then it fails.
- Given the app boots in laptop-solo mode and in a simulated shared-backend mode, when either boots, then behavior is identical to pre-split.
- Given `knip` runs after the split, when it reports newly-dead code surfaced by removing the old structure, then that code is deleted in this work package, not ignored.

**Plan calls.** This is a large, mostly-mechanical migration — plan the file-by-file ownership assignment (which of the ~80 files goes to which package) as an explicit table before moving anything, the same way AU11 did for the app-runtime dissolution. Expect, per AU11's own experience, that this move surfaces previously-hidden dead code; the plan should budget time for deleting it rather than treating it as scope creep.

**Contracts / constraints.**
- No change to deployment/build output shape — the same process boots and serves in every topology as before.
- No behavior change of any kind; this work package is pure structural migration.
- Plugin/Config code may remain a subfolder of `core-app` rather than its own package — the boundary that matters is the rule, not necessarily a third package.

**Out of scope.**
- Any behavior change to any domain — all of that is AU12–AU16's job, must be done first.
- Splitting Agent Layer's own internal pieces (Trigger Resolver, Sandbox Bridge, Tool Surface, etc.) into further sub-packages — one boundary at a time.
- AU8 itself — depends on this landing first.

**Effort.** L (~3-5d)

---

### AU18 — Notification owns its own reads/writes; `factorySettings` is retired

**Work package.** As a maintainer closing out Track AU, I want Notification to have exactly one owning module for `notificationQueue`, and I want the legacy `factorySettings` catch-all table to disappear entirely — every real setting it currently holds finishes moving onto the already-built `server_config` table, and every value that was never really a setting (a computed running total, a cached classification) becomes private state owned by the one function that actually computes it. When this ships, notification delivery/digest/mute go through one owning module the same way Conversation/Users/Work/Routine/Knowledge already do, every real user-facing config value lives in the one structured config table the codebase already adopted for this purpose, and `factorySettings` has zero remaining callers and is dropped.

**Why this matters.** This is the last confirmed Core App write/read-ownership gap in Track AU, found independently by AU12's and AU13's own first-task audits, both of which correctly declined to fold it in and flagged it back as its own work package. But the deeper reason this matters isn't just "give it an owning module like the others" — direct code reading found that `factorySettings` is not one domain's table at all: it's a generic key-value bucket that a prior work package (`server-config.ts`, tagged `P3`) already started replacing with a proper structured `server_config` table ("Replaces `factorySettings` for new structured config" — its own comment), and that migration simply never finished. Five callers (`notifications/config.ts`, `notifications/mute.ts`, `observability/config.ts`, `git-export-config.ts`, `routes/status.ts`'s generic `/settings` endpoint) still write real, human-settable configuration into the old table instead of the new one. Two callers (`cost-cap.ts`'s `cost_actual` running total, `cost-sentinel.ts`'s cached alert-level read) aren't settings at all — they're computed state that happens to share the same generic table by historical accident. Leaving this half-migrated state in place means `factorySettings` keeps looking like a real domain AU8's guard has to account for, when it's actually a finished migration's leftover debris. AU17's package split has the same problem one level up: splitting Core App into a real package while this ambiguity remains just relocates it.

**Type.** backend.

**What exists today.** `notificationQueue` is read and written raw from `notifications/dispatcher.ts`, `notifications/digest.ts`, `routes/notifications-routes.ts`, `services/retention-reaper.ts`, and `services/lifecycle-propagation.ts` — no owning module exists. `factorySettings` (`key`/`value`/`updatedAt`) is read/written raw from eight files; direct code reading classified every one:
- **Real, human-settable configuration** (a route lets a user change it) that never migrated off the legacy table: `notifications/config.ts` (SMTP/ntfy delivery settings, via `routes/notifications-routes.ts`'s `PATCH`), `notifications/mute.ts` (per-type mute, via the Settings UI), `observability/config.ts` (telemetry export config, via `routes/observability-routes.ts`'s `PATCH`), `git-export-config.ts` (git-export destination config, via `routes/git-export-routes.ts`'s `PATCH`), and `routes/status.ts`'s generic `PATCH`/`GET /settings` catch-all endpoint (arbitrary key/value, with reserved-prefix blocking that already tells callers to prefer the domain-specific routes above).
- **Computed/internal state, not a setting**: `services/cost-cap.ts`'s `recordFactoryCost()` writes `cost_actual` as a running total (`SUM(users.costActual)`) recomputed after every cost event — no route sets it, it's system-computed. `services/cost-sentinel.ts` only reads that same key to classify an alert level, also system-computed, and separately caches its own classification back into `factorySettings`.
- `services/server-config.ts`/`server_config` (single-row, Zod-validated, deep-merge-able) already exists and already holds a comparable notification-preferences sub-schema (`reviewAlerts`/`costAlerts`/`blockerAlerts`/quiet-hours/`mutedTeams`), model-gateway config, and a disabled-harness list — this is the pattern the five real-setting callers should have used from the start.
- Notification's delivery model itself (drain loop, adapters, digest batching, quiet-hours/silence policy, the in-app popover) is already built and working (Track AF/AF8) — this work package does not touch what notifications do, only who owns the row.

**What's genuinely missing.** A Notification module owning every read and write against `notificationQueue`. For `factorySettings`: (1) the five real-setting callers migrated onto `server_config`'s existing structured-config pattern (extending its schema as needed — deep-merge already supports adding new top-level sections), and (2) `cost-cap.ts` becoming the sole reader/writer of its own `cost_actual` state, with `cost-sentinel.ts` calling an exported function instead of touching any table. Once both are done, `factorySettings` has no remaining callers and the table itself is dropped — a real schema removal, but only as the last step once nothing references it.

**Depends on.**
- **AU11** — `services/cost-cap.ts` and `services/cost-sentinel.ts` are agent-owned files AU11 relocated and finalized; their location needed to be stable before refactoring their internals, the same reasoning AU12/AU13 depended on AU11 for.

**Complexity.** L

**Pre-build gates.**
- **Refinement:** Not required — goal is clear and reuses requirements already locked in `docs/architecture/runtime-simplification.md` and `plans/strategy-kernel-plugin-split/as-should-dependency-graph.md` (the Core App Graph already names a Notification Service as a target Core App component; note that graph's "Settings Service" is a *different*, already-built thing — the plugin-default/user-override catalog, AU2/AU5 — not this work package's concern, and this work package must not reuse that name).
- **Design:** Not required — backend refactor, no new or changed UI surface, no user-visible behavior change.

**Human concept review.** No — pure internal refactor; nothing user-facing moves.

**Acceptance criteria.**
- Every current caller that reads or writes a `notificationQueue` row does so through one owning Notification module, never a direct `select`/`insert`/`update`/`delete` against the table itself.
- Every real setting currently stored in `factorySettings` (notification delivery config, notification mute, observability config, git-export config, and whatever `routes/status.ts`'s generic endpoint currently persists) is readable and writable through `server_config`'s existing structured pattern instead, with identical values and identical route responses.
- `cost-cap.ts` is the sole reader and writer of its own cost-accumulation state; `cost-sentinel.ts` obtains the value by calling an exported function, never by touching a table directly.
- `factorySettings` has zero remaining callers anywhere in `packages/server` and is dropped as a table.
- All existing observable behavior (cost-cap enforcement, cost-sentinel alerting, git-export config resolution, notification delivery/digest/mute/quiet-hours, the status route, notification read/seen state) is unchanged from before this work package.
- A newly-written call site that tries to access `notificationQueue` directly, or tries to reintroduce a `factorySettings`-shaped raw table for cross-domain config, fails a lint-time guard, not merely convention — zero allowlisted exceptions, matching AU12/AU13/AU14's corrected standard.
- If any query needs both `notificationQueue` and a table owned by another domain, it is decomposed into one call per owning service — never a documented cross-owned-table exception, per the founder's zero-exceptions ruling (see AU12/AU13's precedent: the `items ⋈ threads` join in `work-service.ts` was removed, not allowlisted).

**Validation scenarios.**
- Given a policy engine or dependency watcher raises a `notification` event, when it is enqueued and later delivered or digested, then every step goes through the owning Notification module and the notification is delivered identically to before.
- Given a user changes notification delivery settings, mute state, observability config, or git-export config via their existing routes, when the change is saved and re-read, then it round-trips through `server_config` with the same values as before the migration.
- Given a bet's cost accumulates, when `cost-cap.ts` records it and `cost-sentinel.ts` later checks the alert level, then both still produce the same enforcement/alerting behavior as before, through function calls instead of raw table access.
- Given the full existing test suite for cost-cap, cost-sentinel, notifications (delivery/digest/mute/routes), git-export config, observability config, and the status route, when it is re-run after this work package, then it passes unchanged (behavior-preservation, not new behavior).
- Given the migration is complete, when the repository is searched for any reference to `factorySettings`, then none remain outside the migration's own historical test fixtures (if any are kept) and the table no longer exists in the schema.

**Plan calls.** Standard architecture pass, behavior-preservation first. Two independent halves that can likely be sequenced or parallelized within the WP: (1) Notification's `notificationQueue` ownership — enumerate every read/write call site (not just writes) before designing the owning module's function signatures. (2) `factorySettings` retirement — enumerate every real call site (reads and writes) per file, confirm each of the five real-setting callers' exact keys/shapes against `server-config.ts`'s existing `ServerConfigSchema`, extend that schema (new top-level sections, deep-merge already handles partial updates), migrate each caller, then confirm `cost-cap.ts`/`cost-sentinel.ts`'s computed-state fix, then drop the table in a final migration once `git grep factorySettings` returns nothing outside tests/migrations history. Expect the real site count to be larger than this spec's own estimate once reads are included — AU12 and AU13 both undercounted their own scope by roughly 3-7x on their first audit; budget accordingly. Do not invent a new generic "settings service" abstraction — the correct home for real settings already exists (`server_config`); this work package finishes an existing migration, it doesn't start a new pattern.

**Contracts / constraints.**
- No product behavior may change — this is ownership consolidation plus completing an already-adopted migration, not a feature.
- The Notification module's functions (and its own tests) are the only code permitted to reference the `notificationQueue` table object, for both reads and writes.
- `server_config`'s existing schema/module pattern (Zod-validated, deep-merge, single row) is the target home for every real setting currently on `factorySettings` — do not design a parallel or competing config mechanism.
- `factorySettings` itself is dropped once empty of callers — a genuine schema change, but only as this work package's last step, not its first.
- Zero exceptions for cross-owned-table access: any query needing a second domain's table must decompose into one call per owning service.
- Agent-layer callers keep calling in-process (same process, function call) — no queue, no API introduced at this boundary.
- Do not use the name "Settings Service" for anything built here — that name is reserved for the should-graph's plugin-default/user-override catalog (AU2/AU5), a separate, already-correct system this work package does not touch.

**Out of scope.**
- Conversation, Users, Work, Routine, Knowledge domains — already done (AU12/AU13/AU14).
- Notification's own feature completeness (delivery model, popover, digest cadence) — already built (Track AF/AF8); this work package changes who owns the row, not what notifications do.
- The plugin-default/user-override configuration system (AU2/AU5, the should-graph's real "Settings Service") — a separate, already-correct system, untouched.
- Wiring the should-graph's Settings Service into any of the real Settings UI pages, none of which currently use it — a real gap, but a different one, not this work package's job.
- The routine-scheduler fire-time bypass (AU15) or the descriptor-read allowlist (AU16) — unrelated edges.
- The package split (AU17) — comes after this and depends on it.
- AU8 itself — depends on this landing first (transitively, via AU17).

**Effort.** L (~3-4d)

---

### AU19 — Applications, Layers, and Services structure (supersedes AU8 + AU17)

**Concept document.** `plans/AU19/concept.html` — an interactive drawing built and iteratively
corrected with the founder across this WP's registration (Applications/Layers/Services composition
diagram, the composition schedule, all three enforcement mechanisms with a worked example, as-is vs
as-should folder trees, and a revision log of every correction). `/refine` and `/architecture` should
open it first, before re-reading this spec prose — it renders the same decisions this section
describes, in the form they were actually reviewed and approved in. Committed on the branch that
registered this WP (`plan/AU19-applications-layers-services`); persists at that path across future
worktrees per this repo's `plans/<workpackage-id>/` convention.

**Work package.** As a maintainer closing out Track AU, I want the codebase organized into three real, mechanically-enforced tiers — Applications (deployment units: `desktop`, `remote-server`, `ui`, `remote-worker`), Layers (`core-ui`, `core-api`, `agent-orchestration`, `agent-execution` — communication-pattern boundaries that compose into each Application), and Services (bounded units with a clear interface, decomposing **every** Layer, not just `core-api` — a Service that owns a SQL table is additionally ACL-enforced as that table's sole owner) — realized as a **two-level package hierarchy**: 4 thin Layer packages composing ~20-25 real Service packages nested under them (`packages/<layer>/<service>/`), not a shared folder inside 4 monolithic packages — enforced by **three** mechanisms, not two: (1) Table ACL (a Service package never exports its raw table), (2) the Layer/execution boundary (only `agent-execution`'s Services may reach an LLM CLI/harness/MCP), and (3) a **composition boundary** — Service packages may never import another Service package or a Layer package; all cross-Service wiring happens in the Layer package that owns the composition, all cross-Layer wiring happens in the Application that composes them. So that a file's home mechanically declares both its permissions *and* who's allowed to wire it to anything else — a convention someone has to remember today, and one nothing currently enforces even loosely. When this ships, an Application contains only bootstrap/wiring code; a Layer package can only depend on its own Service packages; every SQL-owning Service package is the sole code path to its assigned table(s); no Service package ever imports another; `agent-orchestration` and `agent-execution` are each a set of real Service packages rather than flat dumps; and only `agent-execution`'s Service packages can reach an LLM CLI, harness adapter, or MCP server. This replaces AU17's rejected two-package split (real boundary, but flat undifferentiated internals) and folds in AU8's original goal (one general ownership guard instead of nine hand-typed ones).

**Why this matters.** The maintainer gets what AU17 promised but didn't deliver: opening `packages/<X>/src/` tells you what a file is allowed to do, not just which of two buckets it landed in. The composition boundary (mechanism 3) adds something neither AU17 nor the first two mechanisms could give: today, any Service can quietly reach into any other Service's exported function, and nothing names that as a violation the way it names an unauthorized table write — this is exactly how "weird features" accrete invisibly (a Service doing something outside its own stated job because nothing stopped it from importing a neighbor). Forcing every cross-Service call to go through an explicit Layer-level wiring point makes that coupling visible and auditable, not just relocated. Concretely this also unblocks running Applications in genuinely different topologies (a `remote-worker` that composes only `agent-execution`, a thin `ui` that composes only `core-ui`) — today's flat structure makes that combinatorics illegible even though the underlying runtime already supports it (harness execution already crosses a process boundary with zero DB coupling — confirmed by AU17's own topology research). Not building this leaves the codebase's single largest legibility debt unaddressed and leaves AU8's original problem (nine separate hand-typed guard scripts, no general mechanism) unsolved.

**Type.** framework.

**What exists today.** `packages/server` is a single npm workspace package containing ~238 production files: `routes/` (38, HTTP surface), `harness/`+`mcp/`+`tools/` (50, pre-existing subfolders, agent-execution-shaped), `knowledge/`+`notifications/` (30, pre-existing subfolders, already domain-shaped Services), and a flat `services/` directory (~74 files) mixing every other domain Service (`work-service.ts`, `conversation-store.ts`, `user-store.ts`, `routine-service.ts`, `server-config.ts`) with every other agent-orchestration/execution-support file (`agent-run-boundary.ts`, `trigger-resolution.ts`, `context-assembly.ts`, `cost-cap.ts`, ...) with no grouping beyond "not knowledge, not notifications." Nine domain-ownership WPs (AU12–AU18) already built the real Service-layer owning modules for Conversation, Users, Work, Routine, Knowledge, Notifications, Settings-adjacent config — each enforced today by its own separately hand-written AST guard script (`au12-conversation-users-ownership-guard.ts` etc.), not a general mechanism. AU17 (PR #447, closed unmerged, founder-rejected) proved the package-boundary technique works — `tsc` module resolution genuinely fails on an unexported cross-package import, verified via a negative-case fixture — and produced a real, verified acyclic file classification (84 files agent-execution-shaped, 86 files domain-Service-shaped, 68 files composition-root-shaped) and a real external-consumer migration table (`packages/eval`, `packages/web/scripts/*`), but organized the two new packages' internals as flat dumps rather than by Layer/Service, which is the reason it was rejected. No "Application" concept exists in code today — desktop/remote-server/ui/remote-worker are informal deployment-mode distinctions (env vars, `HYPERIDLE_PROFILE`), not structural boundaries.

**What's genuinely missing.** (1) The Application/Layer/Service taxonomy realized as actual package/directory structure, not documentation — see `docs/architecture/runtime-simplification.md` §"Applications, Layers, and Services" for the full definition. (2) ~20-25 real Service packages nested under their 4 Layer packages (`packages/<layer>/<service>/`), each with its own `package.json`/`tsconfig.json`/`vitest.config.ts` and a barrel that exports functions only, never a raw table object — plus the root `workspaces` glob widened from `"packages/*"` to also match `"packages/*/*"`. (3) A single small, general, declarative ACL check (does a package's barrel export a raw table object) replacing the nine hand-typed per-domain scan guards. (4) A structural (not convention-based) restriction so only `agent-execution`'s Service packages can import an LLM-CLI/harness/MCP/tool-execution symbol. (5) **A composition boundary**: no Service package may list another Service or Layer package in its own `dependencies` — every current place where one Service-shaped module directly calls another's exported function needs to become a dependency-injected parameter instead, wired by the owning Layer (or, for cross-process edges, by the Application). (6) Migration of the ~238 existing files into this structure, built on top of AU17's already-verified classification and migration table rather than re-deriving them from scratch.

**Depends on.**
- **AU12, AU13, AU14, AU15, AU16, AU18** — every Service-layer owning module this WP relocates and ACL-wraps must exist first; same blocking reasoning AU17 used. All six are merged.

**Complexity.** L

**Pre-build gates.**
- **Refinement:** Required — this work package introduces three new load-bearing structural primitives (`Application`, `Layer`, `Service` as enforced package/ACL concepts, distinct from the prior informal "core app / agent layer" framing) that the rest of the codebase's structure will depend on. Run `/refine` to: (1) sharpen the exact Layer boundaries (especially the `agent-orchestration` / `agent-execution` split, which has no precedent in the current codebase); (2) confirm the Application list is exhaustive; (3) settle whether "Service" or "Domain" is the right name for the third tier — both are live candidates as of registration; (4) decide whether `core-ui` (`packages/web`) takes a position in this WP on mirroring the same Service/Domain names as its internal organization, or whether that's explicitly deferred — raised in review as a real idea but out of AU17's original scope entirely, so it needs its own decision, not a default; (5) confirm the Service list in `docs/architecture/runtime-simplification.md` (currently ~20, pulled from the as-should graph) is a floor, not a ceiling, before `/architecture` designs the package layout. Package granularity itself is **no longer open** — settled 2026-07-13: one real npm workspace package per Service, nested under its Layer (`packages/<layer>/<service>/`), not a shared folder inside 4 monolithic Layer packages; see `docs/architecture/runtime-simplification.md`'s "Package granularity" note for the reasoning (Table ACL is structurally reinforced when a Service package never exports its raw table object, and this avoids repeating the scan-root-guard staleness failure this session hit twice building AU17).
- **Design:** Not required — backend/infra structural migration, no UI surface. (`core-ui` as a Layer name does not mean this WP redesigns UI — it only relocates existing `packages/web` code under the new Layer boundary if `/architecture` determines that's in scope; no visual/UX change either way.)

**Human concept review.** No — pure internal/structural restructuring; no user-facing behavior changes in any topology.

**Acceptance criteria.**
- The codebase is organized into Application units (at minimum `desktop`, `remote-server`, `ui`, `remote-worker`) that each compose one or more Layers to boot a running process; an Application's own code is bootstrap/wiring only, with no business logic.
- The four Layer packages (`core-ui`, `core-api`, `agent-orchestration`, `agent-execution`) exist as real structural boundaries — a Layer package importing anything outside its own Service packages (plus `db`/`shared`) fails at build/typecheck time, verified by a negative-case fixture, not merely by convention.
- Every SQL-owning Service (knowledge, work, conversation, users, settings, notifications, routine, and any others `/architecture` identifies — the registered list is a floor, not a ceiling) is its own npm workspace package, nested under its Layer, and is the sole code path permitted to read or write its assigned table(s) — its barrel never exports the raw table object (verified by a negative-case fixture: attempting to import it from outside the package fails to resolve), backed by one small general guard checking every package's barrel for an exported table object, replacing the nine separate hand-written guard scripts AU12–AU18 each produced.
- `agent-orchestration` and `agent-execution` are each a set of real Service packages (e.g. `trigger-resolution`, `session-requests`, `context-assembly`, `cost`, `dispatch` under orchestration; `harness-registry`, `tool-provider`, `mcp-provider` under execution), each with its own `package.json`/tests, not a flat directory — none of these own a SQL table, so their boundary is the package/exports-map itself, not Table ACL.
- Only `agent-execution`'s Service packages may import or reach LLM CLI invocation, harness adapters, MCP bridge execution, or tool execution — every other package is structurally forbidden from that surface because it isn't a dependency of any package that imports it, verified by a negative-case fixture.
- **No Service package imports another Service package or a Layer package** — its own `package.json` `dependencies` contain only `@hyperidle/db`/`@hyperidle/shared` (and, if `/architecture` decides one is needed, a narrow shared ports/contracts package) — verified by a negative-case fixture (a Service package with a forbidden dependency fails to resolve). Every cross-Service composition point in the migrated codebase is wired by the owning Layer package (or, for a cross-process edge like agent-orchestration↔agent-execution under `remote-server`+`remote-worker`, by the Application) — not by one Service importing another.
- The enforcement scaffolding (Application/Layer/Service package boundaries + the Table ACL mechanism + the execution-only LLM/CLI restriction + the composition boundary) is built and proven on a minimal slice (e.g. the `knowledge` and `harness-registry` Service packages plus their two Layer packages, with at least one real cross-Service composition — `context-assembly` calling `knowledge` — wired at the Layer level to prove the pattern) — including at least one deliberate sanity-break per mechanism (an unauthorized import, a barrel export of a raw table object, or a Service package depending on another Service package, injected and confirmed caught, then reverted) — BEFORE the bulk file migration begins.
- The existing ~238 files (reusing AU17's verified classification as a starting point, not re-deriving it) are migrated into the new structure; the deployable server, desktop app, web UI, and remote worker are behaviorally unchanged in every currently-supported topology (laptop-solo, shared-backend, remote worker).
- `agent_work_intents` gets a `TABLE_OWNER` entry and its three known non-owner accessors (`routes/threads.ts` insert, `routes/sessions-routes.ts` read, `services/agent-layer-boot.ts` read — debt flagged by AU15, never closed) are migrated onto the owning module as part of this WP, not deferred again.
- AU8 and AU17 are marked superseded in `.pipeline/pipeline-manifest.yaml` and this track file (already done as part of registering this WP); no dangling "not started, blocked" entry for either remains schedulable.

**Validation scenarios.**
- Given a Service file is queried for direct SQL access from outside its owning module, when the Table ACL guard runs, then it fails — demonstrated live via a sanity-break (inject an unauthorized access, confirm RED, revert).
- Given a `core-ui` or `core-api` Layer file attempts to import a harness adapter, LLM CLI invocation, or tool-execution symbol, when the build/typecheck runs, then it fails.
- Given a Service package's `package.json` is edited to add another Service package as a dependency, when `npm install`/`tsc` runs, then it fails to resolve — and given a legitimate cross-Service need (e.g. `context-assembly` needing `knowledge`), when the composition is inspected, then it is wired in the owning Layer package, not imported directly by the Service.
- Given the app boots in every currently-supported topology (laptop-solo desktop, remote-server + web ui, remote worker attached), when each boots, then behavior is identical to pre-migration and the full existing test suite passes unchanged.
- Given the repository's manifest and track file are reviewed, when AU8 and AU17 are checked, then both are explicitly marked superseded with no orphaned schedulable entry.

**Plan calls.** This is a large, mostly-mechanical migration with a hard ordering constraint: **build and prove the enforcement scaffolding first, on a minimal slice (one Service package per Layer, including one real cross-Service composition wired at the Layer level), before scaffolding the remaining ~20 Service packages and moving the bulk of the 238 files** — do not repeat AU17's mistake of treating internal organization as an afterthought to the package boundary. `/architecture` should explicitly reuse AU17's already-verified artifacts (the acyclic file classification, the external-consumer migration table, the `au17-package-boundary-guard.ts` `tsc`-negative-case technique) as a starting input rather than re-deriving them, but must re-classify every file against the new four-Layer/N-Service-package taxonomy (not the old two-package one) since `agent-orchestration` vs `agent-execution` is a real split AU17 never drew, and every Service is now its own package rather than a shared folder. Write one small scaffolding script/template for a Service package (`package.json` + `tsconfig.json` + `vitest.config.ts` + `src/index.ts` barrel skeleton) so creating ~20-25 packages is mechanical repetition, not 20-25 rounds of manual authoring. **Separately, budget a full audit of every current Service-shaped-module-calls-another-Service-shaped-module edge** — the composition boundary (mechanism 3) means each one becomes a dependency-injected parameter wired by the owning Layer instead of a direct import; produce an explicit table of these edges the same way AU11/AU17 tabulated their file moves, since this is genuinely new refactoring work, not relocation, and is exactly where `/architecture` should expect to find the "weird features" this session flagged as a reason to do this. Expect the real Service/Layer boundary for ambiguous files (the ~20-30 files with no single clear domain, e.g. `ws-broadcaster.ts`, `org-edges.ts`, `credential-encryption.ts`) to need its own explicit disposition table too — do not default ambiguous files into a new flat "shared" package without naming why each one is there. The Service list in `docs/architecture/runtime-simplification.md` (~20 across all four Layers, pulled from the as-should graph's fuller vocabulary — trigger resolution, session requests, run orchestration, context assembly, capture/writeback, cost, dispatch, harness registry, tool provider, MCP provider, alongside the seven SQL-owning ones) is explicitly a floor: budget the architecture pass to find more, the same way AU17's own audit found 7x more files than its spec estimated. `core-ui`'s internal Service/Domain alignment is a separate open decision `/refine` must resolve (see Refinement gate above) — do not silently decide it inside `/architecture`.

**Contracts / constraints.**
- No behavior change to any deployment topology's observable behavior — pure structural + enforcement migration, same discipline AU17 used.
- **One npm workspace package per Service, nested under its Layer** (`packages/<layer>/<service>/`) — not a shared folder inside 4 monolithic Layer packages (founder-settled, 2026-07-13, after explicit comparison against the folder-based alternative; see `docs/architecture/runtime-simplification.md`'s "Package granularity" note).
- **A SQL-owning Service's barrel (`src/index.ts`) never exports its raw Drizzle table object** — only typed functions — the discipline that makes Table ACL structurally true (no other package can obtain a reference to a table it doesn't own) rather than resting purely on a guard.
- The residual Table ACL guard must be general and declarative (one check per package barrel, not one hand-typed scan script per domain) — this WP's explicit job is to replace the nine-hand-typed-guards pattern, not add a tenth instance of it.
- **No Service package may depend on another Service package or a Layer package** (composition boundary, founder-added 2026-07-13) — a Service's own `dependencies` are limited to `@hyperidle/db`/`@hyperidle/shared` (plus a narrow shared ports/contracts package, if `/architecture` decides one is warranted). Every cross-Service composition is wired one level up, by the owning Layer package; every cross-process composition (e.g. `agent-orchestration` reaching `agent-execution` when they run on separate machines) is wired one level up again, by the Application.
- Zero allowlist exceptions for cross-owned-table access, per the founder's standing zero-exceptions ruling (AU12/AU13/AU18 precedent) — a query needing two Services' tables decomposes into one call per owning Service.
- Only the `agent-execution` Layer may hold LLM CLI/harness/tool-execution imports — no exceptions elsewhere, including in `agent-orchestration`.
- **`agent-execution` holds zero Service/table references of any kind, including `knowledge`** (founder correction, 2026-07-13) — it receives an assembled context bundle and returns raw run output over the existing worker channel; context assembly and capture/writeback against Knowledge belong to `agent-orchestration`, which stays colocated with `core-api` and the database in every Application that composes it. This is what makes a `remote-worker` deployable with zero DB credentials, consistent with AU17's own finding that `worker-ws.ts`/`remote-harness-adapter.ts` already import nothing from `@hyperidle/db`.
- `remote-server` never composes `agent-execution`, unconditionally (founder correction, 2026-07-13) — not even in a single-host shared-backend deployment. Execution always runs as a separate `remote-worker` process, colocated on the same host or not.
- AU8 and AU17 must be explicitly marked superseded (not silently deleted) in the manifest and track file — done at registration time, verify it stays intact through this WP's own commits.

**Out of scope.**
- Redesigning any Service's internal business logic — this WP relocates and ACL-wraps existing owning modules (`conversation-store.ts`, `work-service.ts`, etc.); it does not rewrite their internal logic. **Exception, explicitly in scope**: a Service's *exported function signatures* change where needed to accept a dependency-injected parameter instead of importing another Service directly (the composition boundary, mechanism 3) — that is relocation-of-coupling, not a logic rewrite, and it's this WP's job.
- New UI/UX work — `core-ui` as a Layer name is a structural boundary, not a redesign.
- The Prompt Catalog gap or other should-graph gaps already tracked separately in `docs/architecture/runtime-simplification.md`'s gap register.
- Splitting `agent-execution`'s own internals further (sandbox bridge, tool surface, etc.) into sub-services — one boundary at a time, same principle AU17 used.
- Building the abstraction layer for choosing an Application's concrete cross-process wiring (e.g. a formal "harness client" interface with in-process vs remote-worker implementations) if it doesn't already exist in a usable form — `worker-ws.ts`/`remote-harness-adapter.ts` already provide this; this WP relocates/formalizes ownership of that choice at the Application level, it does not design a new abstraction from scratch.

**Effort.** L (~8-10d) — larger than AU17's original 3-5d estimate: adds the Application tier, the agent-orchestration/agent-execution split (new, no AU17 precedent), ~20-25 Service packages instead of 2-3 (mitigated by a scaffolding template, but still more surface to migrate files into and verify), the general Table ACL mechanism (AU8's absorbed scope), the `agent_work_intents` debt cleanup, and now the composition-boundary audit + dependency-injection refactor (mechanism 3) — genuinely new refactoring work on top of relocation, not just more files to move.
