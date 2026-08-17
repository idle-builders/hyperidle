# Delete batch — `fw-block-derivation`

2 convicted rows. Delete every one, or record it as a survivor with a reason.

| # | Symbol | Reach | Why it was convicted |
|---|---|---|---|
| 1 | `assertNoCollisions` | function · INTERNAL (wired to a no-op logger) + TEST-ONLY external refs | Reports to nobody by construction; golden-ids snapshot is the real guard. Delete export, dev-mode call, and the test that pokes it. |
| 2 | `CollisionLogger (unexported, derive-blocks.ts:440)` |  | Dies with assertNoCollisions; its only real implementation is a no-op. |
