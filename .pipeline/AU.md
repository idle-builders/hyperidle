# Track AU: Runtime Simplification

This track separates the core app from the agent layer and removes the Strategy/Fabric split. Work, Conversation, Knowledge, Users, and Settings are core app domains. The agent layer owns every LLM-capable run: request intake, provisioning, harness execution, tools/MCP, context, capture, decomposition, and lifecycle events. Plugins are not a runtime layer; they preconfigure editable app configuration for agents, skills, routines, triggers, tools, MCP, and harnesses.

The point is not a new harness path. The point is one contract for every agent run: task-backed work, assistant turns, routine-triggered runs, knowledge actions, and decomposition work all become task-optional session requests consumed by the same runtime boundary. Every event that can cause an LLM call becomes triggerable. If no user or plugin trigger matches, the runtime attaches the default eligible agent with no event-specific prompt; a matching user/plugin trigger supplies the specific agent and prompt.

**Reference.** `docs/architecture/runtime-simplification.md`; `plans/strategy-kernel-plugin-split/dependency-graph.md` (as-is); `plans/strategy-kernel-plugin-split/as-should-dependency-graph.md` (target graph); `plans/strategy-kernel-plugin-split/as-is-vs-should-dependency-graph.md` (current gap comparison); `plans/strategy-kernel-plugin-split/component-inventory.md`; `docs/architecture/as-implemented-domain-architecture.md`; `.pipeline/work-packages/TRACK-AR.md` (real harness proof boundary); current domain callers in Work, Conversation, Knowledge, Users, Settings, and Routines; `plans/AU19/concept.html` (interactive Applications/Layers/Services composition drawing, the concept document AU19 itself was registered from).

**Corrective closure rule.** AU is not complete until the source tree matches the should graph, not a softer transitional graph. Agent handoff must be event/request driven, plugins must be editable configuration only, and no app-runtime/Fabric-shaped compatibility shell may remain as an ownership boundary. Every AU review from AU9 onward must explicitly compare implementation against `plans/strategy-kernel-plugin-split/as-should-dependency-graph.md` and fail the package when a forbidden edge remains, even if behavior still works.

**Migration note.** The work-planning skill moved to a new registration shape: each work package now gets its own seeded spec at `.pipeline/work/<id>/plan.md`, registered here in a per-track coordination file (`.pipeline/<track>.md`) instead of the legacy `.pipeline/work-packages/TRACK-<track>.md` prose file + `.pipeline/work-packages/pipeline-manifest.yaml` entry. Only **AU20** and **AU21** have been transferred into this new shape so far. AU1–AU19 remain registered in the legacy `.pipeline/work-packages/TRACK-AU.md` (full specs) and `.pipeline/work-packages/pipeline-manifest.yaml` (registry rows) — this file does not yet duplicate them. A full-track migration, if ever done, would move the rest here and retire the legacy entries.

---

## Work package registry

| ID | Title | Type | Complexity | Depends | Status |
|---|---|---|---|---|---|
| AU20 | Challenge every Service's exposed method surface (reduce, don't just document) | backend | L | AU19 (legacy: `.pipeline/work-packages/TRACK-AU.md`) | planned |
| AU21 | Reduce agent-to-core coupling; formalize core-to-agent as EventBus-only | backend | L | AU19 (legacy: `.pipeline/work-packages/TRACK-AU.md`) | planned |
| AU23 | Restore end-to-end product confidence after runtime simplification | application | L | AU20, AU21 | planned |

## Dependency graph

- `AU20` → `AU19` (legacy-registered): needs the real Service package boundaries, the mechanical extraction script, and the edge-audit findings AU19 produced.
- `AU21` → `AU19` (legacy-registered): needs the real Service boundaries, the mechanical extraction script, and the 112-capability adversarial audit's findings.
- `AU20` and `AU21` do not depend on each other but share findings (`log_task`, duplicate-read cases) — cross-reference rather than duplicate fixes; see each plan's **Plan calls** section.
- `AU23` → `AU20`, `AU21`: validates the combined final Service API and runtime-boundary migration through deterministic browser, real-backend, real-harness, and desktop release journeys.
