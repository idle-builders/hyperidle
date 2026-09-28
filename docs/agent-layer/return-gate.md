# Return gate

Every agent turn that completes normally must invoke one of two return actions before stopping. A turn that does not is never recorded as `completed` — enforcement is provisioned per-harness at sandbox setup time, adjudicated via a real HTTP route, and backstopped by a drain-end gate that no harness can bypass.

## The accepted-return set

Two tool names form the closed accepted-return set (`RETURN_ACTION_NAMES` in `framework/harness-protocol/src/harness/return-actions.ts`):

| Tool | Satisfied when |
|---|---|
| `edit_task` | The edit is the session's own task AND moves it away from the calling agent: owner changes, or state moves to `review`/`done`. An ordinary field edit, a subtask create, or an edit to a different task does not satisfy the gate. |
| `send_message` | Any message posted to any thread. For a session with no task (a thread turn), `send_message` is the only accepted member — creating a task with `edit_task` does not end such a turn. |

The set is closed: `isReturnAction(toolName, args, taskId)` is the single runtime check. CLI harnesses decorate tool names with dialect prefixes; `stripMcpNamespace` (`return-actions.ts`) strips the `mcp__<server>__` MCP-protocol prefix and the `hyperidle_` OpenCode prefix before the membership check.

## Exemptions

- **Internal-extraction drains** (sessions provisioned with `tools: []`) — no tools means no return action is possible; enforcement is skipped, not waived.
- **Non-`completed` end-reasons** (`crashed`, `stopped`) — `evaluateReturn` returns `"returned"` for any non-`completed` reason.

## Per-harness enforcement channels

`provisionReturnHook` (`layers/agent-execution/harness-registry/src/provision-return-hook.ts`) is called before `startSession`. It dispatches on the adapter's `returnEnforcement` channel (non-optional; every adapter must declare one):

| Harness | Channel | Mechanism |
|---|---|---|
| `claude-code` | `settings-claude` | `.claude/settings.json` Stop hook calling `.claude/return-check.sh` (curl → `/api/mcp/:token/return-status`); exit-2 + stderr blocks |
| `codex` | `settings-codex` | Per-session `CODEX_HOME` with `hooks.json` in nested codex format; `{"decision":"block","reason":"…"}` on stdout blocks |
| `opencode` | `process-reengage` | No native hook; adapter re-invokes `opencode run <forceMessage>` after detecting `step_finish` on stdout |
| `cursor-agent` | `none` | No artifact written; drain-gate floor only |

## Adjudication: `POST /api/mcp/:token/return-status`

Claude-code and codex hooks call this route:

```
POST /api/mcp/:token/return-status
Authorization: Bearer <token>
Body: {} (ignored)

Response 200 empty body     → allow stop
Response 200 non-empty body → force message; hook must block
Response 401                → Authorization header missing the token
```

An unknown or already-ended token returns 200 empty (allow stop). The route resolves the token to a session, reads the `EnforcementEntry` from the `EnforcementRegistry`, calls `shouldForceReturn(entry.gate, entry.forceCount)`, and if a force is needed increments `forceCount` and returns the message.

The `return_status` tool (`layers/agent-execution/harness-registry/src/return-status-tool.ts`) is an agent-only MCP tool that lets an agent check its own return status before stopping.

## Force budget

`MAX_FORCE_RETURNS = 2` (`framework/harness-protocol/src/harness/return-actions.ts`). `shouldForceReturn(gate, forceCount)` returns the `FORCE_RETURN_MESSAGE` when `!gate.returned && forceCount < 2`, and `null` when the budget is spent or the agent already returned. When the budget is spent the hook allows the stop — the drain-gate floor then settles the verdict.

## Drain-gate floor

`createReturnGate` provides a `ReturnGate` reference (`{ returned: boolean }`) held by the `EnforcementEntry`. The event-stream observer mutates `gate.returned` to `true` when a return action is recorded. Every harness — including `cursor-agent` with channel `none` — goes through `evaluateReturn(gate, endReason)` at session end:

- `completed` + `gate.returned = true` → `"returned"` → session outcome `completed`
- `completed` + `gate.returned = false` → `"not_returned"` → session outcome `not_returned`; `session_not_returned` bus event; `sessions.outcome` written as `"not_returned"`
- `crashed` or `stopped` → `"returned"` regardless of the gate

`SessionOutcome` is `"completed" | "crashed" | "stopped" | "not_returned"`. Every `switch(outcome)` consumer must handle all four.
