# Delete batch — `harness-registry`

13 convicted rows. Delete every one, or record it as a survivor with a reason.

| # | Symbol | Reach | Why it was convicted |
|---|---|---|---|
| 1 | `createHarnessAdapter (builtin overload)` | TEST-ONLY (prod uses new BuiltinHarnessAdapter in pool factory; eval uses this) | Factory arm with no production caller. |
| 2 | `createHarnessAdapter (cli overload)` | DEAD (prod uses new CliHarnessAdapter in pool factory) | Factory arm nothing calls. |
| 3 | `createHarnessAdapter (direct overload)` | DEAD in product (only tools/eval/provision-harness.ts:128) | DirectHarnessAdapter is eval-only; move class to tools/eval or delete outright. |
| 4 | `createHarnessAdapter (implementation)` | see 3–6 | Dies with the factory; isSocket guard moves next to RemoteHarnessAdapter if kept at all. |
| 5 | `probeHarnessSession` | TEST-ONLY | 334-line "AM3 will wire it" substrate; AM3 never came; deletion is behavior-neutral (caps already gated false). |
| 6 | `closeMcpBridgeSession` | BOOTSTRAP (boot wires provisioner port) | Pure passthrough to bridge.close — the definition of a wrapper. |
| 7 | `AdapterPool.list` | DEAD door (only workerConnections → GET /api/workers, which nothing calls) | Kill the route, the read-model, and this method together (feature kill 3). |
| 8 | `DisabledSandboxAdapter.exec` | DEAD (port member exec has no production caller anywhere) | Dies with the port member (row 68). |
| 9 | `LocalSandboxAdapter.exec` | TEST-ONLY (workspace-adapter.test.ts only) | No production caller; runShell helper and its lore die too. |
| 10 | `LocalSandboxAdapter.exists` | TEST-ONLY | Not even on the port; a test convenience living in production. |
| 11 | `HarnessAdapterSpec` |  | Dies with the factory (rows 3–7). |
| 12 | `ReturnEnforcementSpec` |  | isolated is set by tests only; dies with the singleton (feature kill 6). |
| 13 | `ExecResult` |  | Dies with exec (rows 44/47). |
