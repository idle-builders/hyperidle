# O2 Concept: Schema Migration and Route Rewrite

## Concept Assessment

O2 does not introduce or reshape any domain concepts. It physically reorganizes existing data and behavior along a boundary already defined in the kernel-separation concept doc (`plans/kernel-seperation/concept.md`).

The load-bearing nouns — kernel, strategy, extension table, knowledge item, task, session, item, artifact — are all defined in that concept doc. O2 executes the physical separation that the concept describes.

## What O2 Does

1. **Creates extension tables** (`knowledge_strategy_fabric`, `task_strategy_fabric`) — these are the physical manifestation of the "strategy metadata" concept. They hold strategy-owned columns stripped from kernel tables.

2. **Strips columns from kernel tables** — removes strategy-concern columns from `knowledgeItems`, `tasks`, `sessions`, `items`, `artifacts`. This is a data reorganization, not a concept change.

3. **Rewrites knowledge routes** — changes URL shape from `/:layer/...` to `/:id` patterns. Layer is a strategy concept (L0-L4 taxonomy); removing it from the URL shape makes the kernel route layer-agnostic.

4. **Purifies conversation/session/task routes** — removes inline strategy calls (`routeToFounder`, `routeItem`, `createRelevanceService`). Routes emit facts; strategy subscribes. This is the "events as boundary" pattern from the concept doc.

## Concepts Already Defined

All of the following are fully defined in `plans/kernel-seperation/concept.md` and need no further conceptual work:

- **Kernel** — slow-changing foundation (conversations, work, knowledge, users, graph, state machines, events, UI)
- **Strategy** — fast-adapting layer (scoring, routing, propagation, cost caps, notifications)
- **Extension table** — FK to kernel table, CASCADE delete, strategy-owned columns
- **Route purity** — routes emit facts, strategy subscribes, no inline strategy computation
- **Boundary rule** — kernel never imports from strategy

## No New Concepts Needed

O2 is reorganization, not invention. The concept phase is satisfied by the existing kernel-separation concept doc.
