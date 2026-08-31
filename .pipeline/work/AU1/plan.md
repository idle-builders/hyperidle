# AU1 — Event-driven session requests between collaboration domains and the agent runtime

Shipped 2026-07-08. Every domain that wants an agent to run creates an `AgentSessionRequest` row; the
runtime claims and consumes it. No domain provisions a session directly. The model itself is documented
in `docs/architecture/as-implemented-domain-architecture.md` and `runtime-simplification.md`.

## Invariants the boundary depends on

- **Claim before run.** The runtime claims a pending request and marks it running after admission but
  before `runSession`. Transient capacity or budget admission errors release the claim so the
  dispatcher retries rather than stranding the row.
- **Sessions may be task-free.** Routines, the assistant, and knowledge actions all create requests
  with no task, correlated instead by thread/user/team. `sessions.taskId` is nullable for this reason —
  a stub task to satisfy a NOT NULL is exactly what AU1 removed.
- **Request creation is idempotent.** `createAgentSessionRequest` returns the existing row on unique
  conflict rather than throwing.
- **WS session subscribe scopes task-free sessions** by thread/user/team correlation, not by task.
- Bet decomposition enters through a request like everything else; it does not import `AdapterPool` or
  start a `HarnessAdapter` directly.

## Known wart, deliberately left

`ToolContext.taskId` is typed `string`, so task-free request contexts pass an **empty-string
placeholder** rather than `null`. Broadening the type to optional is correct but touches a large number
of test helpers, so it was left alone. Anything reading `ToolContext.taskId` must treat `""` as absent.
