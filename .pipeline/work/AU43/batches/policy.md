# Delete batch — `policy`

3 convicted rows. Delete every one, or record it as a survivor with a reason.

| # | Symbol | Reach | Why it was convicted |
|---|---|---|---|
| 1 | `recordPropagationHop` | SCHED:30s heartbeat + EVENT:session_ended/task_state_changed/bet_state_changed + UI:POST /api/bets/:id/kill (cascade port) | Stands — founder affirmed: a write-only ledger is dead at any user count. Kill it and every caller (cascade hops, run-stop hops, LogSink sinks). Correction: the propagation_applied/propagation_failed EVENTS exit the blast radius (Ruling 2) — only the log rows, timer, and retry die. |
| 2 | `reapTerminalPropagationLog` | SCHED:retention-reaper (service-bootstrap.ts:520) | Stands. A reaper for a log nobody reads is bloat squared; it never reaps failed rows anyway. Dies with the table. |
| 3 | `LogPropagationEntry` |  | Stands: input type of recordPropagationHop, dies with it. |
