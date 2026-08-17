# Delete batch — `fw-event-bus`

4 convicted rows. Delete every one, or record it as a survivor with a reason.

| # | Symbol | Reach | Why it was convicted |
|---|---|---|---|
| 1 | `EventBus.off (typed overload)` | INTERNAL — only via the unsubscribe closure on returns | Zero direct production callers. Make removal private; the closure is the API. |
| 2 | `EventBus.off ("" overload)` | INTERNAL — same closure path | Same. |
| 3 | `EventBus.off (implementation signature)` | INTERNAL | Dies with rows 4–5; survives only as a private helper. |
| 4 | `EventBus.once` | TEST-ONLY (event-bus.test.ts:165 is the only caller in the repo) | Dead API plus the test that keeps it warm. |
