# Delete batch — `filesystems`

6 convicted rows. Delete every one, or record it as a survivor with a reason.

| # | Symbol | Reach | Why it was convicted |
|---|---|---|---|
| 1 | `FilesystemReachabilityInput` |  | Nine-field mirror of FilesystemRow; the function reads four of them. Take FilesystemRow — the only production caller already passes exactly that. |
| 2 | `FilesystemRow (re-export alias)` |  | Pure passthrough of @hyperidle/db's type. Governance classifies db:row-type as an ungated import surface — the route imports it from @hyperidle/db directly (it already imports HyperIdleDb from there). |
| 3 | `NewFilesystem (re-export alias)` |  | Passthrough with zero external consumers — rg -a finds only framework/db itself and this package. |
| 4 | `NewFilesystemInjection (re-export alias)` |  | Same: zero external consumers. |
| 5 | `InjectedFilesystemForProvisioning` |  | Third copy of the same nine fields (Filesystem in filesystem-contract, FilesystemForProvisioning in run-orchestration are the other two). The consumer re-declares its own port shape by design (Mechanism C), so this one serves nobody — return Filesystem. |
| 6 | `FilesystemsServiceConnectionResolver` |  | Never used inside this package — it types the ROUTE's injected dependency and is parked here only because the route once lived in core-api. Post-F2 the route sits in the same layer; declare the one-member shape inline at the route (or import from @hyperidle/connections). |
