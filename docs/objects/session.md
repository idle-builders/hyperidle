# Session

A session is one bounded agent run: started, working, finished. Many sessions can happen per task.

Source: `framework/domain-model/src/actions/session.ts`, `layers/agent-orchestration/run-orchestration/src/`.

## States

Four: `active`, `done`, `stopped`, `crashed`. Declared in `SESSION_STATES` (`actions/session.ts`).

- `active` — process is running.
- `done` — completed normally.
- `stopped` — stopped by `stop_session`.
- `crashed` — harness process exited unexpectedly, or the reaper swept it.

## Where a session comes from

Every session starts from a row in its agent's inbox, which the agent's runner turns into a run: a turn in a thread (`message`), a run on a task (`task_run`), a subscription firing (`subscription`), or the session that asked a question coming back with the answer (`review_answered`). How rows are written and worked: [How an agent gets work](../architecture/overview.md#how-an-agent-gets-work).

Thread turns and resumed sessions do not assemble a `knowledge/` tree — they get an empty manifest and only `context/session.toon`. Only task and subscription runs get documents.

## Concurrency

Each agent has `maxConcurrentSessions` (default 1) from its run config. When a run request is refused because the agent is at its limit, the request is released back to `pending` and retried at the next scheduler tick (every ~1 second). No reassignment.

## Working folder

Every task run and subscription run gets a working folder inside the agent's space directory (`~/HyperIdle/<agentName>/` on disk, overridable via `HYPERIDLE_SPACES_DIR`). The path depends on what the session is working on:

- Task run: `<space>/tasks/<taskId>/`
- Subscription run: `<space>/subscriptions/<subscriptionId>/`
- Thread turn: `<space>/conversations/<callingThreadId>/`

The working folder persists after the session ends. All sessions on the same task share the same working folder.

The working folder contains four zones:

- `context/` — read-only. Contains `session.toon`: a flat key-value file with task, ancestors, agent, team data.
- `knowledge/` — documents the agent may read, edit, and reorganize. Changes sync back automatically.
- `work/` — scratch area. `work/task-notes.md` and `work/session-notes.md` are watched; writes there go to `sessions.notes`. Everything else in `work/` is ignored by writeback.
- `.fabric/manifest.json` — manifest of assembled items; read-only for the agent.

## Notes

`sessions.notes` is written by the file watcher when the agent edits `work/task-notes.md` or `work/session-notes.md`. When a new session starts on the same task, the most recently completed session's notes are seeded into `work/task-notes.md` so the agent can continue from where the previous session left off. `tasks.notes` is a separate field written only via `edit_task({ appendNote })`.

## Token counts

`sessions.modelTier` is set at session start. Token usage per tier is tracked on the task (`tasks.tokensActualJson`) and merged at session end.

## Watching a session

`watch_session` returns the session row and its in-memory activity buffer (tool calls, reasoning, answer deltas). The buffer is evicted when the session ends; a call after eviction returns an empty list, not an error.

## Stopping a session

`stop_session` kills the harness process. Anyone signed in may stop any session — no ownership check. The stop is async: the answer reflects the row at the moment of the call; the terminal state arrives as a later event.
