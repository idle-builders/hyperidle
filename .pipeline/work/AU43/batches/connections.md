# Delete batch — `connections`

1 convicted rows. Delete every one, or record it as a survivor with a reason.

| # | Symbol | Reach | Why it was convicted |
|---|---|---|---|
| 1 | `HeldConnectionForProvisioning` |  | Dies with row 1's merge. It is already a duplicate: run-orchestration/src/connection-provisioning.ts:94 declares its own structurally identical interface, and that is the one the consumer actually types against. The boot closure maps rows → that shape. |
