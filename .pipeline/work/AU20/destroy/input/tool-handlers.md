# Destroyer input — `tool-handlers` (agent-orchestration)

Package: `layers/agent-orchestration/tool-handlers`
Surface: 2 exported functions, 0 classes (0 member methods), 2 interface/type declarations, 0 const/enum exports.

## A. Exported functions — EVERY ONE NEEDS A VERDICT

| # | Method | Public | Location |
|---|---|---|---|
| 1 | `buildToolDefinitions` | yes | `layers/agent-orchestration/tool-handlers/src/tool-definitions.ts:1616` |
| 2 | `buildToolRegistry` | yes | `layers/agent-orchestration/tool-handlers/src/tool-registry.ts:68` |

## C. Interface / type declarations — the DI-port surface

Verdict each DECLARATION (not every member individually) unless a member is independently interesting. A port member whose only implementation you are deleting dies with it — say so.

- `ToolHandlersSessionsAccessor` (interface, internal) `layers/agent-orchestration/tool-handlers/src/ports.ts:478` — members: `writeNotes`
- `ToolHandlersPorts` (interface, public) `layers/agent-orchestration/tool-handlers/src/ports.ts:488` — members: `coreApi`, `sessions`
