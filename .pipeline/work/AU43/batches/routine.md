# Delete batch — `routine`

5 convicted rows. Delete every one, or record it as a survivor with a reason.

| # | Symbol | Reach | Why it was convicted |
|---|---|---|---|
| 1 | `isBuiltinRoutineId` | UI:POST /api/routines/:id/trigger, SCHED:TICK pollIntervalMs | Recognizes builtin: id strings — pure mechanism of the bypass path; the plugin uses ordinary routine ids. Kill both callers' builtin branches. |
| 2 | `extractBuiltinKind` | UI:POST /api/routines/:id/trigger, SCHED:TICK, EVENT:bet_state_changed | Id-string parsing (builtin:kind:teamId) for a scheme nobody re-provides. |
| 3 | `BuiltinRoutineId` |  | Id scheme of the bypass mechanism — not re-provided. |
| 4 | `RunBuiltinResult` |  | Return type of the bypass dispatcher — not re-provided. |
| 5 | `PostBetRetroArgs` |  | One-field args type of a ritual body; the plugin's retro is a generic event routine, not this signature. |
