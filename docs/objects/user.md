# User

Humans and agents are one `users` table. `kind` is `human` or `ai`.

Source: `framework/domain-model/src/actions/user.ts`, `layers/core-api/user/src/`.

## Fields

From `UserRowSchema` (`actions/user.ts`):

- `id`, `kind` (`human | ai`), `name`, `role` (free text), `status`.
- `ownerUserId` — the person who owns an agent.
- `agentCategory` (`team | individual | null`).
- `health` — a note on the agent (e.g. crash count); null when healthy.
- `team` — `{ id, name }` or null. Derived: an agent with no own team inherits its owner's team.
- `edges` — outgoing `org_edges` rows; the org chart is these edges.

## Team

The `teams` table has only `id`, `name`, `createdAt`. Team is set by name via `edit_user({ team: { name } })` — found or created. Never deleted. An agent inherits its owner's team when it has none of its own.

Team scope applies to documents, folders registered per team, and task assignment.

## Subscriptions

A subscription is a row on a user with exactly one of `event` (one of the 9 object events) or `schedule` (cron). Also: `paused`, `nextRunAt`, `documentId` (the prompt document).

The 9 object events: `task.created`, `task.changed`, `thread.created`, `thread.message`, `thread.changed`, `document.created`, `document.changed`, `user.created`, `user.changed`.

Schedule subscriptions are agent-only (refused for humans at `edit_user`).

**Firing.** A 30-second clock (`subscription-clock.ts`) fires scheduled subscriptions. Object events fire their matching subscriptions on every `task.changed` / `thread.message` / etc. event. For each matching subscription:

- If the subscriber is a person → an `inbox` row is created and a `user:<id>` push is sent.
- If the subscriber is an agent → a `subscription_run` work intent is queued.

**Reach.** Each subscription is scoped to what the subscriber can see — factory-wide, their team's objects, or their own. The scope is re-evaluated at fire time using the same `search_*` predicates as a normal query.

**Fresh install.** The person and their owned assistant are each subscribed to all 9 events.

Subscriptions are managed via `edit_user({ subscriptions: { add, remove, update } })`.

## Inbox

The inbox is a list of pointers at `changes` rows. Each row has `seenAt` and `readAt`. Rows are read via `open_user({}).inbox` (self-only, newest 50).

Seen: set when the popover opens. Read: set on click-through. Read rows older than 30 days are reaped by `inbox-reaper.ts` (reads the change's own timestamp, not an inbox timestamp).

Unread rows older than 30 days are NOT deleted — only read rows are swept.

## Review track record

Agents have a derived `reviewTrackRecord`: approval rate, total verdicts, recent verdicts (newest 10), window (30 days, hardcoded). Computed from verdict-message history; not stored.

## Agent run config

Per agent: `harnessType`, `modelId`, `modelProvider`, `modelOptions`, `maxConcurrentSessions` (default 1). Changed via `edit_user({ runConfig: ... })`.

## Folders

Each user's `open_user` response includes folders: for agents, the folders given to them; for people, their team's folders. Given/taken via `edit_user({ folders: { give, take } })`.

## Connections

Service connections (token or MCP) are stored encrypted. Visible to self only. Changed via `edit_user({ connections: { add, remove } })`. Also includes inherited connections.
