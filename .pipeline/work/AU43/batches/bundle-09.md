# Delete bundle 9 — fw-harness-protocol, filesystems, fw-harness-capability, connections

17 convicted rows across 4 package(s).

| # | Package | Symbol | Reach | Why convicted |
|---|---|---|---|---|
| 1 | fw-harness-protocol | `registeredHarnessCount` | UI:GET /api/agent-profile (agent-profile.ts:192) | One-line forwarder for reader.size; one caller inlines it. |
| 2 | fw-harness-protocol | `workerConnections` | UI:GET /api/workers (workers.ts) | One-line forwarder for reader.list(); one caller inlines it. |
| 3 | fw-harness-protocol | `harnessCapabilityDescriptors` | UI:harnesses routes (harnesses.ts, 4 sites) | Forwarder for reader.describe(); one calling file. |
| 4 | fw-harness-protocol | `refreshHarnessDiscoveries` | UI:harness refresh route (harnesses.ts) | Forwarder for reader.refresh(); one caller. |
| 5 | fw-harness-protocol | `isHarnessEvent` | DEAD (rg -a — zero refs, not even a test) | Exported, never called anywhere. |
| 6 | fw-harness-protocol | `isInternalExtractionDrain` | AGENT:provisioner exemption (provisioner.ts) | One caller, one line (config.tools.length === 0). Inline at the call site with a comment. |
| 7 | fw-harness-protocol | `PreCompactionEvent` |  | Emitted by builtin only, parsed by nobody (provisioner drain has no case). Dead protocol. Kill variant + emission. |
| 8 | filesystems | `FilesystemReachabilityInput` |  | Nine-field mirror of FilesystemRow; the function reads four of them. Take FilesystemRow — the only production caller already passes exactly that. |
| 9 | filesystems | `FilesystemRow (re-export alias)` |  | Pure passthrough of @hyperidle/db's type. Governance classifies db:row-type as an ungated import surface — the route imports it from @hyperidle/db directly (it already imports HyperIdleDb from there). |
| 10 | filesystems | `NewFilesystem (re-export alias)` |  | Passthrough with zero external consumers — rg -a finds only framework/db itself and this package. |
| 11 | filesystems | `NewFilesystemInjection (re-export alias)` |  | Same: zero external consumers. |
| 12 | filesystems | `InjectedFilesystemForProvisioning` |  | Third copy of the same nine fields (Filesystem in filesystem-contract, FilesystemForProvisioning in run-orchestration are the other two). The consumer re-declares its own port shape by design (Mechanism C), so this one serves nobody — return Filesystem. |
| 13 | filesystems | `FilesystemsServiceConnectionResolver` |  | Never used inside this package — it types the ROUTE's injected dependency and is parked here only because the route once lived in core-api. Post-F2 the route sits in the same layer; declare the one-member shape inline at the route (or import from @hyperidle/connections). |
| 14 | fw-harness-capability | `HarnessAccessMode` | type · DEAD (written, never read) | Every descriptor construction stamps it; .accessMode read by zero production files. Premise-free — dead at any user count. Delete type + descriptor field + HarnessCapabilities.accessMode + construction sites. |
| 15 | fw-harness-capability | `HarnessRuntimeCapabilities` | interface · display-only badges; zero runtime branches on the descriptor copy | Feature #2. Crossed-wire badge mapping shipped unnoticed — proof the display carries no value. Ruling 1 re-check: wrong flags shown to a whole team are still wrong flags; DELETE stands. |
| 16 | fw-harness-capability | `HARNESS_OPTION_CONTROL_KINDS` | const · TEST-ONLY (own package's descriptor test) | Only reference outside its declaration is its own test asserting the literal back at itself; part.ts redeclared a private copy rather than import it. A3 does not need it: option-value validation is per-descriptor against the specific control, never against a kind list. |
| 17 | connections | `HeldConnectionForProvisioning` |  | Dies with row 1's merge. It is already a duplicate: run-orchestration/src/connection-provisioning.ts:94 declares its own structurally identical interface, and that is the one the consumer actually types against. The boot closure maps rows → that shape. |
