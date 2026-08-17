# Delete batch — `fw-work-intent-port`

2 convicted rows. Delete every one, or record it as a survivor with a reason.

| # | Symbol | Reach | Why it was convicted |
|---|---|---|---|
| 1 | `AgentWorkIntentRecorder` | interface · BOOTSTRAP: app.ts:405-437 wires buildSeamBackedWorkIntentRecorder; injected into threads.ts, work, policy, routine, review | Port with one implementation = indirection, and its TTx/tx parameter is a lie — the sole implementation ignores it (record: (_tx, input) => port.intents.submit(input)). It is a second name for AgentOrchestrationPort.intents.submit. Replace every injected AgentWorkIntentRecorder<X> with the plain function type; delete the two shared-type pin tests with it; fix the false atomicity story in the package header by deleting the package. |
| 2 | `AgentWorkIntentReader` | interface · DEAD | Zero implementations, zero callers — findByKindAndSource appears nowhere outside this package (rg -a across layers/framework/applications/tools). Referenced only by two stale @lore comments. Dead on arrival since the AU31 reshape. |
