# Functional Requirements

Testable, outcome-level statements of what HyperIdle does. Field lists, schemas, and mechanism depth live in the owning layer docs — each section links its owner. Shapes themselves are owned by `framework/db/src/schema.ts`.

---

## F-1: Agent Identity and Lifecycle

Depth: [agent-layer/agent-model.md](../agent-layer/agent-model.md).

**F-1.1** An agent is defined by three composable parts: identity (an `agent_file` knowledge document bound to the agent), context (assembled just-in-time from the knowledge layers at session start), and skills. All three are independently swappable.

**F-1.2** Agents belong to exactly one of two categories — `team` (does the work, team-scoped), `individual` (user-scoped operator). Closed enum `AGENT_CATEGORIES` (`framework/domain-model/src/types.ts`).

**F-1.3** Every human user gets exactly one assistant (individual agent) at registration.

**F-1.4** Creating a team creates exactly one agent, with no identity. HyperIdle
ships no roster: roles and the agents that hold them come from plugins or from
the user. Specialist capabilities (security review, brand-voice check,
accessibility audit) are skills invoked within sessions, not separate top-level
agents.

**F-1.4a** A role is an open string on an agent, not a fixed list. The roles that
exist are the distinct roles among existing agents; a plugin or a user
introduces a new one by creating an agent with it, and can reuse any existing
one.

**F-1.5** Agents are retired (soft-delete to `status="retired"`), never hard-deleted. Retirement is available at any time.

**F-1.6** An agent belongs to exactly one team (`users.teamId` is a single FK). No multi-team membership.

**F-1.7** A session runs the model its agent was configured with (`model_id`/`model_provider`), passed to the harness binary as `--model`. There is no tier-based routing and no per-agent tier dial: the tier vocabulary (reasoning / workhorse / fast) survives only as the key of the token-usage bucket a session's spend is reported in. Vocabulary and mechanics: [agent-layer/model-routing-and-cost.md](../agent-layer/model-routing-and-cost.md).

## F-2: The Four Process Primitives

Shapes and semantics: [process-layer/the-four-primitives.md](../process-layer/the-four-primitives.md).

**F-2.1 Task.** A unit of work with an explicit done condition, owned by a team. A task may contain subtasks to any depth; a task with no parent is a root task — the top-level commitment. Eight states: `proposed | accepted | hold | in_progress | blocked | review | done | killed` (`framework/domain-model/src/types.ts`). `hold` is the single waiting state, whatever the wait is for — a person can put a task on hold by hand, and a task with unmet upstream dependencies is parked there too. A task with unfinished dependencies cannot move to `accepted` or `in_progress`; the state machine refuses it regardless of who or what asks. Dependencies are set at create or edit, by a human or an agent; a self-dependency, a dependency on a nonexistent task, or a dependency that would close a cycle is refused with a reason. When a task's last dependency reaches `done`, the Dependency Watcher auto-transitions it hold → accepted. When a dependency is killed instead, its id is dropped from every dependent that carries it, and any dependent that was waiting on it in `hold` returns to `proposed` for re-planning rather than starting. `blocked` is distinct: a runtime block discovered during execution. Tasks carry an `outcomeVerdict` (met / met_with_rework / partially_met / not_met), an optional thread, and `tokensActualJson` for their own session's usage (subtree totals are summed at read time). Every change to a mutable field lands in `auditTrail`. Editing is ungated — `PATCH /api/tasks/:id` accepts the same body from a human or an agent with no role or status gate. Depth: [process-layer/tasks-and-sessions.md](../process-layer/tasks-and-sessions.md).

**F-2.2 Session.** A single agent's bounded run on a task, states `active | paused | done | crashed`. The session ends before context compaction, and the agent writes session notes back to the task before ending — notes are the bridge between sessions on the same task. Shape owned by [process-layer/the-four-primitives.md](../process-layer/the-four-primitives.md) §Sessions.

**F-2.3 Team.** A persistent group of agents. Capacity is a single integer — max concurrent in-progress tasks at any depth of the task tree. Teams persist; agents join and leave by direct membership change. Depth: [process-layer/teams.md](../process-layer/teams.md).

**F-2.4 Routine.** A recurring trigger attached to a named agent with persistent state across runs (`stateKey`). Trigger types: heartbeat, calendar (cron in `triggerConfig`), event (any of the full event vocabulary, `EVENT_TYPES`), continuous. An event trigger may carry a `transitionTo` constraint in `triggerConfig` to filter by the target state. A routine has no team of its own — its scope is wherever its owner agent belongs. Routines declare `humanReview` and `silent` (sleep-time routines that update memory without producing items). Lifecycle state is `active | paused | error` (`routines.state`, `framework/db/src/schema.ts`); the boolean `routines.active` is **deprecated** — new code reads `state` (AA2 will drop `active`). Each trigger is recorded in `routine_runs` — an append-only audit log (`framework/db/src/schema.ts`). Routine creation is not approval-gated; an event routine takes effect on the very next matching event, with no restart. All routines are generic (plugin-provided or user-created) — there are no hard-wired builtin routines in core. Depth: [process-layer/routines-and-retros.md](../process-layer/routines-and-retros.md).

## F-3: Knowledge

Tree structure and scope are owned by [knowledge-architecture/the-canonical-store.md](../knowledge-architecture/the-canonical-store.md).

**F-3.1** All knowledge lives in the canonical `knowledge_items` store (PGlite locally, Postgres on a server). Kernel columns live on the base table; strategy signals (attentionScore, relevanceScore, confidence, citations) live in the `knowledge_app_projection` extension table. The Knowledge Fabric projects the one store into two surfaces: the Knowledge view for humans and assembled file sandboxes for agents.

**F-3.2** Knowledge is nested, not layered: a knowledge item can contain knowledge items, and where an item sits says what it is about. `scope` (`factory | team | user`) says only who sees it. One-liners only here — the taxonomy doc owns the definitions.

**F-3.3** Context assembly at session start writes a three-zone sandbox — `context/` (read-only), `knowledge/` (proposed changes), `work/` (scratch) — under a token budget, with TOON packs for structured data. Depth: [knowledge-architecture/the-knowledge-fabric-how-knowledge-moves.md](../knowledge-architecture/the-knowledge-fabric-how-knowledge-moves.md).

**F-3.4** Writeback is continuous: a file watcher (500ms debounce) turns changed files into item updates with version checks, new files into items with status `captured`, and version conflicts into `knowledge_conflicts` rows for resolution. Depth: [knowledge-architecture/sync-and-conflict-resolution.md](../knowledge-architecture/sync-and-conflict-resolution.md).

**F-3.5** Every knowledge item has a lifecycle status. Kernel keeps `draft / active / archived / needs_human`; the fabric 7-state lifecycle is `captured → provisional → validated → active → stale → archived` (plus `needs_human`). Promotion from provisional to validated happens automatically at 5+ cross-scope repetitions with no contradiction and no open conflict (`AUTO_PROMOTION_REPETITION_THRESHOLD = 5`, `layers/core-api/knowledge/src/promotion-pipeline.ts`).

**F-3.6** Items are scored for human attention (novelty, conflict, repetition, confidence, taste, recency); crossing the 0.7 threshold creates a review item. Relevance is a separate three-signal model (recency / frequency / citation). Depth: [knowledge-architecture/relevance-and-attention.md](../knowledge-architecture/relevance-and-attention.md).

**F-3.7** **Not implemented.** This described Git as an export target for version history — factory and team knowledge exporting as markdown files, never the source of truth. The exporter was deleted in AU26 (increment C1); see [system-requirements.md](system-requirements.md) S-2.2. The database is the only store today. The unimplemented export sketch: [knowledge-architecture/facilitators.md](../knowledge-architecture/facilitators.md).

## F-4: Facilitators

Duties and lifecycle: [knowledge-architecture/facilitators.md](../knowledge-architecture/facilitators.md); role identity: [agent-layer/agent-model.md](../agent-layer/agent-model.md).

**F-4.1** Knowledge curation agents: assistant (individual) and product manager (team). Full category-to-role mapping: [agent-layer/agent-model.md](../agent-layer/agent-model.md).

**F-4.2** Facilitators continuously organize knowledge (promotion, conflict resolution, decay/archival, lifecycle propagation), score items for human attention, and close the loop by writing human feedback back into the store.

**F-4.3** Product managers have a dual role: coordinator (integrates the task list, resolves handoffs, drafts retros) and self-improver.

**F-4.4** Surfacing trajectory shifts is the product manager's judgement — no numerical thresholds. Done-condition changes and other significant task edits are visible in `auditTrail`; emitting a review item for notable changes is the product manager's call.

## F-5: Handoff

Depth: [process-layer/handoff-and-lifecycle-propagation.md](../process-layer/handoff-and-lifecycle-propagation.md).

**F-5.2** Handoff is the coordination primitive: the `handoff_to` tool (toAgent / toRole / toHuman, contextId, status, reason, artifacts, remainingWork) ends the session, transfers ownership, and notifies on the task thread.

**F-5.3** Handoff to a human uses the same mechanism as handoff to an agent — humans are `users` rows with `kind="human"`.

**F-5.4** Replanning is expected: the task list evolves as the team works; surfacing changes to the human follows F-4.4.

## F-6: Routing and Review

Item shape and routing rules: [human-interface-layer/items-and-routing.md](../human-interface-layer/items-and-routing.md).

**F-6.1** **Not currently implemented.** This described `routeItem` routing every item to one of the three views by risk tier, kind, and verb (risk tier medium/high, reviews, skill changes, and chat → Conversations; knowledge → Knowledge; work/tasks → Work; fallback Conversations). Core-api itself already stopped calling this inline at item creation (`@lore O2`, `layers/core-api/src/routes/conversations.ts`), and AU21 §6 Decision L3 traced the remaining `tool-handlers` copy (`route_item` tool + `ports.work.routeItem` + the `item-router.ts` file) to be vestigial — its `view` output was consumed by nothing — and deleted it outright. Real item routing (persisted, actually driving where an item surfaces) does not exist in the codebase today; re-provisioning it is a separate, unscoped product decision, not this fix.

**F-6.2** Human decisions on review items use the five-verdict grammar — see [human-interface-layer/thread-primitive.md](../human-interface-layer/thread-primitive.md).

**F-6.3** Review gating is trust-based: verdict-history approval rate × item risk tier — see [human-interface-layer/review-primitive.md](../human-interface-layer/review-primitive.md).

**F-6.4** Responsibility routing uses `org_edges` (fromUserId, mechanism, target) to find the right human by domain.

## F-7: Top-Down and Bottom-Up Knowledge Flow

**F-7.1** Top-down: humans set direction through factory-layer knowledge and task commitment in the Work view. Every session's assembled context includes the factory layer.

**F-7.2** Bottom-up: agents contribute findings to their practice through direct knowledge writes; the facilitator decides which become captured practice items. New practice knowledge is automatically available to the next session via context assembly — pull, not push. Any agent can message humans directly.

**F-7.3** The two flows meet at the task: committed top-down, revised bottom-up, every revision appended to `auditTrail` with reasoning.

## F-8: Retros and Learning

Plugin routines: [process-layer/routines-and-retros.md](../process-layer/routines-and-retros.md).

**F-8.1** When a task transitions to `done`, the `post-task-retro` routine from the knowledge-management plugin fires. The Knowledge Librarian reads the completed task's notes, identifies concrete learnings, and creates or updates knowledge items. This routine is plugin-provided — teams without the knowledge-management plugin have no automatic retro unless they create one manually.

**F-8.3** Periodic portfolio retros are not a built-in mechanism. A team or founder can create a calendar-triggered routine on any agent to review cross-task patterns at whatever cadence they choose.

## F-9: WIP Limits

Concurrency semantics: [process-layer/wip-and-cost-limits.md](../process-layer/wip-and-cost-limits.md).

**F-9.2** An agent's WIP limit is `maxConcurrentSessions`, default 1 (`framework/db/src/schema.ts`). Team capacity (`teams.capacity`) is a single integer — the maximum number of tasks that may be `in_progress` at once, counted at every depth of the task tree.

**F-9.3** Hitting a WIP limit is enforced synchronously, never a silent drop: transitioning a task to `in_progress` when the team is at capacity is rejected with `CapacityExceededError` (409); an agent already at its session concurrency limit causes the run to retry rather than starting a second session.
