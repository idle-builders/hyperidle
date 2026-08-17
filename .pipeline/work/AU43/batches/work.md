# Delete batch — `work`

9 convicted rows. Delete every one, or record it as a survivor with a reason.

| # | Symbol | Reach | Why it was convicted |
|---|---|---|---|
| 1 | `getTaskRiskTierByTaskId` | BOOTSTRAP:service-bootstrap.ts:439 → review port — always returns null | A2 founder-confirmed. Reads task_planning_signals, which nothing writes in production; the sole consumer gate has never passed. Kill function + table + port member + gate (kill #2). |
| 2 | `—` | SessionStartSourceUnavailableError · thrown UI:POST /api/sessions/ — caught nowhere | Zero catch sites; the route already 404s the same condition. Throw Error. |
| 3 | `—` | TaskRunSourceUnavailableError · thrown via rows 7/8 — caught nowhere | Zero catch sites; the class discriminates nothing. Throw Error. |
| 4 | `ArtifactTaskSummaryRow` |  | Dies with row 14's merge. |
| 5 | `RevisionLogEntry` |  | Revision-log feature dies (kill #3); its only external "consumer" declares a local mirror instead of importing. |
| 6 | `WorkDeps` |  | Zero constructors, zero importers (kill #8). UserStoreReader/WorkUserRow die with it. |
| 7 | `StateTransitionAuditEntry` |  | auditTrail dies (kill #3). |
| 8 | `HandoffAuditEntry` |  | auditTrail dies; policy's writer appends to a blob nobody reads. |
| 9 | `TaskAuditEntry` |  | Union of the two above; task-audit.ts deleted whole. |
