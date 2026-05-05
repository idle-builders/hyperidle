# L7 — Thread Response Unblocks the Agent (concept)

**Story:** TRACK-L L7 — when a founder commits a verdict or reply in the Conversations/Review thread, the agent waiting on that thread must be unblocked within the same session (sync path), or the response must be reliably recorded for pickup on the agent's next session (async path).

## Core primitive: response-as-event

A "response" is not a special event type — it IS a `thread_message_appended` event whose `senderId` is not the waiting agent's own id. The `AgentResponseRouter` service listens to this event and routes it to any registered waiter for the given thread. If no waiter is registered, the message sits in the DB and the agent reads it on next session via `read_inbox`.

## Two modes, one event

- **Sync mode:** harness has called `await_thread_response` skill tool → a Promise waiter is registered → the router resolves it when a qualifying message arrives → the skill tool returns the message → the agent's session continues.
- **Async mode:** no waiter registered → the commit persists → `agent_thread_cursor` advances on next `await_thread_response` drain check → the agent sees it in the inbox.

## Key design decisions

1. `await_thread_response` does a drain check first (any un-seen messages already in DB?) before registering a waiter — eliminates the TOCTOU race.
2. Sender filter: the message senderId must differ from the waiting agentId (an agent cannot unblock itself).
3. Cardinality: one waiter per (agentId, threadId) pair — the most recent `await_thread_response` supersedes any prior waiter.
4. The HTTP commit path (`POST /api/threads/:id/messages`) is unchanged — it is the canonical, idempotent, event-emitting endpoint.
5. The `agent_thread_cursor` table stores the last-seen message id per (agentId, threadId) to support the drain check.
