# Delete batch — `fw-harness-protocol`

7 convicted rows. Delete every one, or record it as a survivor with a reason.

| # | Symbol | Reach | Why it was convicted |
|---|---|---|---|
| 1 | `registeredHarnessCount` | UI:GET /api/agent-profile (agent-profile.ts:192) | One-line forwarder for reader.size; one caller inlines it. |
| 2 | `workerConnections` | UI:GET /api/workers (workers.ts) | One-line forwarder for reader.list(); one caller inlines it. |
| 3 | `harnessCapabilityDescriptors` | UI:harnesses routes (harnesses.ts, 4 sites) | Forwarder for reader.describe(); one calling file. |
| 4 | `refreshHarnessDiscoveries` | UI:harness refresh route (harnesses.ts) | Forwarder for reader.refresh(); one caller. |
| 5 | `isHarnessEvent` | DEAD (rg -a — zero refs, not even a test) | Exported, never called anywhere. |
| 6 | `isInternalExtractionDrain` | AGENT:provisioner exemption (provisioner.ts) | One caller, one line (config.tools.length === 0). Inline at the call site with a comment. |
| 7 | `PreCompactionEvent` |  | Emitted by builtin only, parsed by nobody (provisioner drain has no case). Dead protocol. Kill variant + emission. |
