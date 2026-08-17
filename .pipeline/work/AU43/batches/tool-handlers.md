# Delete batch — `tool-handlers`

5 convicted rows. Delete every one, or record it as a survivor with a reason.

| # | Symbol | Reach | Why it was convicted |
|---|---|---|---|
| 1 | `read_inbox` | AGENT:read_inbox | Push model (baked transcript/contextBundle + reengagement) is the first way agents see messages; polling with a limit×4 overfetch hack is the second way. Kill listInboxBySenderExclusion and the qa-engineer prompt line with it. |
| 2 | `write_session_notes` | AGENT:write_session_notes | Writes sessions.notes, which nothing reads — no UI, no next-session read, context.ts:550 even blanks the file each session. Duplicate of the writeback path for real harnesses. Kill the builtin adapter's two internal invokes with it. |
| 3 | `commit_file` | AGENT:commit_file — but zero prompts, zero evals, zero production callers | Duplicates native harness file-writing; exists as the AL7 irreversible showcase with a preemptive sandbox-escape guard. Fail-closed classification keeps AL7 honest without it. Catalog row and consistency-test row die with it. |
| 4 | `log_task` | AGENT:log_task | Appends to tasks.notes, a column no UI and no handler ever reads — a write-only audit trail, the ETHOS anti-pattern by name. Kill appendTaskNote, PATCH /tasks/:id/notes, the column, and the eval scenario. |
| 5 | `ToolHandlersSessionsAccessor (ports.ts:478)` |  | Sole member writeNotes exists only for write_session_notes; dies with the tool. Its only implementation (composition-root binding to run-orchestration's setSessionNotes) dies too. |
