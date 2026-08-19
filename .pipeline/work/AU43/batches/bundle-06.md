# Delete bundle 6 — harness-registry, tool-handlers

17 convicted rows across 2 package(s).

| # | Package | Symbol | Reach | Why convicted |
|---|---|---|---|---|
| 1 | harness-registry | `createHarnessAdapter (builtin overload)` | TEST-ONLY (prod uses new BuiltinHarnessAdapter in pool factory; eval uses this) | Factory arm with no production caller. |
| 2 | harness-registry | `createHarnessAdapter (cli overload)` | DEAD (prod uses new CliHarnessAdapter in pool factory) | Factory arm nothing calls. |
| 3 | harness-registry | `createHarnessAdapter (direct overload)` | DEAD in product (only tools/eval/provision-harness.ts:128) | DirectHarnessAdapter is eval-only; move class to tools/eval or delete outright. |
| 4 | harness-registry | `createHarnessAdapter (implementation)` | see 3–6 | Dies with the factory; isSocket guard moves next to RemoteHarnessAdapter if kept at all. |
| 5 | harness-registry | `probeHarnessSession` | TEST-ONLY | 334-line "AM3 will wire it" substrate; AM3 never came; deletion is behavior-neutral (caps already gated false). |
| 6 | harness-registry | `closeMcpBridgeSession` | BOOTSTRAP (boot wires provisioner port) | Pure passthrough to bridge.close — the definition of a wrapper. |
| 7 | harness-registry | `AdapterPool.list` | DEAD door (only workerConnections → GET /api/workers, which nothing calls) | Kill the route, the read-model, and this method together (feature kill 3). |
| 8 | harness-registry | `DisabledSandboxAdapter.exec` | DEAD (port member exec has no production caller anywhere) | Dies with the port member (row 68). |
| 9 | harness-registry | `LocalSandboxAdapter.exec` | TEST-ONLY (workspace-adapter.test.ts only) | No production caller; runShell helper and its lore die too. |
| 10 | harness-registry | `LocalSandboxAdapter.exists` | TEST-ONLY | Not even on the port; a test convenience living in production. |
| 11 | harness-registry | `HarnessAdapterSpec` |  | Dies with the factory (rows 3–7). |
| 12 | harness-registry | `ReturnEnforcementSpec` |  | isolated is set by tests only; dies with the singleton (feature kill 6). |
| 13 | harness-registry | `ExecResult` |  | Dies with exec (rows 44/47). |
| 14 | tool-handlers | `read_inbox` | AGENT:read_inbox | Push model (baked transcript/contextBundle + reengagement) is the first way agents see messages; polling with a limit×4 overfetch hack is the second way. Kill listInboxBySenderExclusion and the qa-engineer prompt line with it. |
| 15 | tool-handlers | `write_session_notes` | AGENT:write_session_notes | Writes sessions.notes, which nothing reads — no UI, no next-session read, context.ts:550 even blanks the file each session. Duplicate of the writeback path for real harnesses. Kill the builtin adapter's two internal invokes with it. |
| 16 | tool-handlers | `commit_file` | AGENT:commit_file — but zero prompts, zero evals, zero production callers | Duplicates native harness file-writing; exists as the AL7 irreversible showcase with a preemptive sandbox-escape guard. Fail-closed classification keeps AL7 honest without it. Catalog row and consistency-test row die with it. |
| 17 | tool-handlers | `ToolHandlersSessionsAccessor (ports.ts:478)` |  | Sole member writeNotes exists only for write_session_notes; dies with the tool. Its only implementation (composition-root binding to run-orchestration's setSessionNotes) dies too. |
