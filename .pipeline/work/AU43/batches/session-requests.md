# Delete batch — `session-requests`

10 convicted rows. Delete every one, or record it as a survivor with a reason.

| # | Symbol | Reach | Why it was convicted |
|---|---|---|---|
| 1 | `createSessionRequest (direct overload)` | DEAD (shipping roots; tools/eval only = dev world) | Zero production callers; the drain inserts internally; eval must use the real intake path. |
| 2 | `findSessionRequest (by idempotencyKey)` | TEST-ONLY | Zero production callers — request idempotency lives inside insertRequestInternal; run-orchestration/contracts.ts doesn't even declare this arm. |
| 3 | `drainLifecycleProjections` | TEST-ONLY | No production caller anywhere (rg -a confirmed: only its own tests + one core-api test). The sync twin of a poller that shouldn't exist either. |
| 4 | `startLifecycleProjectionDrain` | BOOTSTRAP (boot.ts:352) | A forever-poller + durable inbox whose only real work is one same-package UPDATE routed through a DI port back into itself; replaced by an inline conditional UPDATE in finishRequestInTxInternal. |
| 5 | `LifecycleProjectionDrainStop` |  | Dies with startLifecycleProjectionDrain; no external importer. |
| 6 | `BakedWorkIntentRequest` |  | Local mirror of @hyperidle/work-intent-port's canonical type; nobody imports it from this package; same-layer precedent for importing the real one exists. |
| 7 | `BakedContextKnowledgeItem` |  | Same mirror, same fix. |
| 8 | `BakedContextBundle` |  | Same mirror, same fix. |
| 9 | `AgentLifecycleFact` |  | Dies with the inbox; no production importer outside this package. |
| 10 | `DurableAgentQueueDeps` |  | lifecycleProjection was its reason to exist and it's a self-call; what remains is { db, eventBus } — pass them as parameters. queueDeps() and durable-agent-queue.ts's port const die with it. |
