# Delete bundle 7 — work, fw-event-bus, conversation, fw-presentation-format

18 convicted rows across 4 package(s).

| # | Package | Symbol | Reach | Why convicted |
|---|---|---|---|---|
| 1 | work | `getTaskRiskTierByTaskId` | BOOTSTRAP:service-bootstrap.ts:439 → review port — always returns null | A2 founder-confirmed. Reads task_planning_signals, which nothing writes in production; the sole consumer gate has never passed. Kill function + table + port member + gate (kill #2). |
| 2 | work | `—` | SessionStartSourceUnavailableError · thrown UI:POST /api/sessions/ — caught nowhere | Zero catch sites; the route already 404s the same condition. Throw Error. |
| 3 | work | `—` | TaskRunSourceUnavailableError · thrown via rows 7/8 — caught nowhere | Zero catch sites; the class discriminates nothing. Throw Error. |
| 4 | work | `ArtifactTaskSummaryRow` |  | Dies with row 14's merge. |
| 5 | work | `RevisionLogEntry` |  | Revision-log feature dies (kill #3); its only external "consumer" declares a local mirror instead of importing. |
| 6 | work | `WorkDeps` |  | Zero constructors, zero importers (kill #8). UserStoreReader/WorkUserRow die with it. |
| 7 | work | `StateTransitionAuditEntry` |  | auditTrail dies (kill #3). |
| 8 | work | `HandoffAuditEntry` |  | auditTrail dies; policy's writer appends to a blob nobody reads. |
| 9 | work | `TaskAuditEntry` |  | Union of the two above; task-audit.ts deleted whole. |
| 10 | fw-event-bus | `EventBus.off (typed overload)` | INTERNAL — only via the unsubscribe closure on returns | Zero direct production callers. Make removal private; the closure is the API. |
| 11 | fw-event-bus | `EventBus.off ("" overload)` | INTERNAL — same closure path | Same. |
| 12 | fw-event-bus | `EventBus.off (implementation signature)` | INTERNAL | Dies with rows 4–5; survives only as a private helper. |
| 13 | fw-event-bus | `EventBus.once` | TEST-ONLY (event-bus.test.ts:165 is the only caller in the repo) | Dead API plus the test that keeps it warm. |
| 14 | conversation | `countThreads` | UI:GET /api/conversations/ — a door with zero production callers | Unchanged, strengthened: dies with kill 1, and an org-global thread count has no principal it should ever be shown to on a shared backend. |
| 15 | conversation | `AssistantTurnSourceUnavailableError (class)` | INTERNAL — thrown at resolver:126, caught by nobody | Unchanged. No importer outside package+barrel, no instanceof. Replace with plain Error. |
| 16 | conversation | `AssistantThreadPinReactionDeps` |  | Dies with row 1's move to Layer code. Unchanged. |
| 17 | fw-presentation-format | `deriveTitleFromPitch` | fn · UI: WorkBetCreate preview only | Deprecated alias of #1; migrate the one caller, honor the U1 removal promise. |
| 18 | fw-presentation-format | `deriveInitials` | fn · UI: 2 server routes shipping agentInitials fields | Server presentation field; web already owns a different deriveInitials and all 4 web components use it — the split-brain dies with this export. |
