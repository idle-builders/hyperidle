# AU11 — Developer guide draft (backwards-planned)

> This is the doc-state AU11 lands. It targets `docs/architecture/runtime-simplification.md` and
> `docs/architecture/as-implemented-domain-architecture.md`. No user-guide change (no user-facing
> concept). DOC-CLASS: moderate.

## Runtime has exactly two owners

After AU11 the server runtime has **two** owners, not three:

1. **Core app** — owns product records, domain events, and editable configuration for Work,
   Conversation, Knowledge, Users, Settings, Routines, and Notifications. It records intent and
   reacts to lifecycle. It never provisions a session, never imports a harness adapter, MCP bridge,
   or provisioning internal.
2. **Agent layer** — owns every LLM-capable run: trigger resolution, session requests, provisioning,
   harness execution, tools, MCP, context assembly, capture/writeback, cost, and lifecycle
   publication.

There is no `app-runtime` layer. The transitional `packages/server/src/app-runtime/` shell that
carried the former Fabric service bundle after AU7 is gone. Its responsibilities were reclassified:

- Knowledge CRUD, search, scoring, relevance, attention, promotion → `packages/server/src/knowledge/` (Core).
- Notification queue, delivery, preferences, digest → `packages/server/src/notifications/` (Core).
- Policy, approval-rate, review routing, lifecycle propagation, retention, practice-meeting,
  git-export, agent-lifecycle projection → `packages/server/src/services/` (Core).
- Context assembly, capture/writeback, roster/selection, task & assistant dispatch, cost, session
  reapers, provisioning injection → `packages/server/src/services/` (Agent-owned file set).
- Built-in routine defaults and git-export config → `packages/server/src/config/` (editable
  configuration / built-in plugin defaults).

## Where things wire

Boot no longer calls a single `bootstrapAppRuntime` grab-bag. The composition root
(`server-factory.ts`) wires each owner's registration explicitly:

- Core-domain registration (notifications listener/drain, policy engine, relevance/attention
  listeners, lifecycle propagation, review creator, retention reaper).
- Agent-layer registration (task dispatcher, routine scheduler fire path, assistant dispatcher,
  cost sentinel, session/sandbox reapers) — receives execution deps (adapter pool, workspace
  adapter, MCP bridge) only at the composition root, never threaded through a route.

The composition root is the one place allowed to know both owners; it assembles their deps and
hands each side only what it needs.

## The boundary is guarded

`scripts/au11-runtime-ownership-guard.ts` (wired into `npm run lint`, alongside au6/au7/au9/au10)
fails the build when:

- the `app-runtime` grouping returns (directory, barrel, `bootstrapAppRuntime`, or `./app-runtime`
  package export);
- a core route or core domain service imports a harness adapter, MCP bridge registry, provisioning
  internal, context assembler, tool-execution registry, or agent-lifecycle internal (config
  descriptor reads on Settings surfaces are allowed and distinguished);
- a moved service is re-exported under an alias that recreates the shell.

AU8 later adds the *complete* should-graph guard; AU11's guard covers only the boundary it cut.

## For contributors

To add agent execution behavior, work in the agent-owned `services/` file set behind the session
request boundary. To add a product record or event, work in the core domain (`knowledge/`,
`notifications/`, or `services/` core files). If you find yourself importing a harness adapter from
a route, you are on the wrong side of the boundary — record an intent instead.
</content>
