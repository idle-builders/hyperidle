# AU6 — Agent execution boundary closure

Shipped. Domains call one agent-layer boundary service to get an agent run; they no longer import the
request consumer or reach for runtime/registry hooks directly. The previous direct callers were
`assistant-turn`, `bet-decomposition`, the routine scheduler, the task dispatcher, and the session
routes.

## The shape, and the two rejected alternatives

A thin facade over the existing request consumer, plus lifecycle observers — a read model over
`agent_session_requests` exposing a common `requested | running | completed | failed | cancelled`
state, with no new tables.

- **Telling domains to import `consumeAgentSessionRequest` directly** was rejected: the name exposes
  runtime consumption as the domain-facing API and keeps domains adjacent to provisioning detail.
- **A new `agent_runs` table** was rejected: request rows already are the durable run identity, so a
  second table would duplicate lifecycle and enlarge AU7's retirement work.

## Constraints

- **Reuse AU4's resolver.** Do not add a parallel trigger resolver.
- **Do not split `provisionSession`.** It keeps owning context assembly, harness selection, tools/MCP,
  capture/writeback and final lifecycle. AU6 only makes the request boundary the single domain-facing
  entry point.
- The legacy provision registry in `server-factory` stays as a compatibility adapter delegating to the
  boundary; it is not the boundary.
