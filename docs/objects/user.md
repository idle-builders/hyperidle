# User

Humans and agents are one `users` table. `kind` is `human` or `ai`.

Source: `framework/domain-model/src/actions/user.ts`, `layers/core-api/user/src/`.

## Fields

From `UserRowSchema` (`actions/user.ts`):

- `id`, `kind` (`human | ai`), `name`, `role` (`founder | member | agent | system` — access control, not a craft), `discipline` (free text, nullable — someone's craft; clusters a context bundle, never gates access), `status`.
- `ownerUserId` — the person who owns an agent.
- `agentCategory` (`team | individual | null`).
- `health` — a note on the agent (e.g. crash count); null when healthy.
- `teams` — `{ id, name }[]`, every team the user is in. A person may be in several; an agent is in exactly one.
- `edges` — outgoing `org_edges` rows; the org chart is these edges.

## Teams

There is one organisation, and nothing names it. A team is a group inside it — a product team, a function such as sales, or a group across functions. A team is a name and a filter, not an object of its own: there are no team actions.

- **A person can be in several teams. An agent is in exactly one** — an owned agent too, and its team must be one of its owner's. A person cannot leave a team one of their agents is in; move the agent first. The only users in no team are the hidden system actor and the agents a plugin brings for everyone.
- `edit_user({ teams: ["Product", "Support"] })` sets the whole list; each name is found (oldest first) or created. Refusals: `belonging_required` (no team), `agent_one_team` (an agent in more than one), `agent_team_not_owners` (an owned agent outside its owner's teams).
- `search_users({ teamId })` lists everyone in that team.
- Storage: `teams` (`id`, `name`, `createdAt`, never deleted) and `user_teams` (`user_id`, `team_id`).

**Everyone reads every team's knowledge.** Conversations and documents are shown across all teams. A team-scoped document sits in that team's space, and goes into the context of that team's agents; it never limits who can read it.

Team scope applies to documents (their space), folders registered per team, and task assignment.

## Subscriptions

A subscription is a row on a user with exactly one of `event` (one of the 9 object events) or `schedule` (cron). Also: `paused`, `nextRunAt`, `documentId` (the prompt document).

**Following one object.** An event subscription may carry `objectId`: it then fires only for that task, thread or document. A person follows a task this way (`edit_user({ subscriptions: { add: [{ event: "task.changed", objectId }] } })`), and follows each task they start: when a person creates a task, the user module adds that subscription for them.

The 9 object events: `task.created`, `task.changed`, `thread.created`, `thread.message`, `thread.changed`, `document.created`, `document.changed`, `user.created`, `user.changed`.

Schedule subscriptions are agent-only (refused for humans at `edit_user`).

**Firing.** A 30-second clock (`subscription-clock.ts`) fires scheduled subscriptions. Object events fire their matching subscriptions on every `task.changed` / `thread.message` / etc. event. For each matching subscription:

- If the subscriber is a person → an `inbox` row is created and a `user:<id>` push is sent.
- If the subscriber is an agent → a `subscription_run` work intent is queued.

**Reach.** Each subscription is scoped to what the subscriber can see, re-evaluated at fire time with the same `search_*` predicates as a normal query. A task or user change reaches the subscriber when it is theirs or in one of their teams; a subscriber in no team is reached by every team's.

**First start.** The first agent (Builder) is subscribed to all 9 events. The person starts with none, and follows each task they start.

Subscriptions are managed via `edit_user({ subscriptions: { add, remove, update } })`.

## Inbox

The inbox is a list of pointers at `changes` rows. Each row has `seenAt` and `readAt`. Rows are read via `open_user({}).inbox` (self-only, newest 50).

Read: set when you open the thread, task or document a row is about (from the bell or anywhere else), or for every row with Mark all read (`edit_user({ inbox: { read } })`). `seenAt` is set only through `edit_user({ inbox: { seen } })`; the app does not set it. Read rows older than 30 days are reaped by `inbox-reaper.ts` (reads the change's own timestamp, not an inbox timestamp).

Unread rows older than 30 days are NOT deleted — only read rows are swept.

## Agent run config

Per agent: `harnessType`, `modelId`, `modelProvider`, `modelOptions`, `maxConcurrentSessions` (default 1). Changed via `edit_user({ runConfig: ... })`.

## Folders

Each user's `open_user` response includes folders: for agents, the folders given to them; for people, the folders of every team they are in. Given/taken via `edit_user({ folders: { give, take } })`; a folder added by someone in several teams names which one (`folders.add[].team`).

## Connections

Service connections (token or MCP) are stored encrypted. Visible to self only. Changed via `edit_user({ connections: { add, remove } })`. Also includes inherited connections.
