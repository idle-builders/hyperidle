# Destroyer input — `tool-protocol` (framework)

Package: `framework/tool-protocol`
Surface: 9 exported functions, 0 classes (0 member methods), 13 interface/type declarations, 1 const/enum exports.

## A. Exported functions — EVERY ONE NEEDS A VERDICT

| # | Method | Public | Location |
|---|---|---|---|
| 1 | `ok` | yes | `framework/tool-protocol/src/tool.ts:77` |
| 2 | `err` | yes | `framework/tool-protocol/src/tool.ts:82` |
| 3 | `toRegistered` | yes | `framework/tool-protocol/src/tool.ts:242` |
| 4 | `wrapForRegistry` | yes | `framework/tool-protocol/src/tool.ts:261` |
| 5 | `toClaudeToolSpec` | yes | `framework/tool-protocol/src/tool.ts:286` |
| 6 | `classifyReversibility` | yes | `framework/tool-protocol/src/tool.ts:317` |
| 7 | `canonicalJson` | yes | `framework/tool-protocol/src/tool.ts:339` |
| 8 | `identityHash` | yes | `framework/tool-protocol/src/tool.ts:362` |
| 9 | `composeWorkflowAllowDeny` | yes | `framework/tool-protocol/src/tool.ts:383` |

## C. Interface / type declarations — the DI-port surface

Verdict each DECLARATION (not every member individually) unless a member is independently interesting. A port member whose only implementation you are deleting dies with it — say so.

- `ToolCatalogEntry` (interface, public) `framework/tool-protocol/src/builtin-tool-catalog.ts:18` — members: `name`, `description`, `roles`, `reversibility`
- `ToolContext` (interface, public) `framework/tool-protocol/src/tool.ts:41` — members: `db`, `eventBus`, `agentId`, `sessionId`, `taskId`, `teamId`, `threadId`, `requestContext`, `sandboxPath`, `ingestion`, `onAbortSession`
- `ToolResult` (type, public) `framework/tool-protocol/src/tool.ts:72`
- `ToolHandler` (type, public) `framework/tool-protocol/src/tool.ts:87`
- `ToolDefinition` (interface, public) `framework/tool-protocol/src/tool.ts:97` — members: `name`, `description`, `inputSchema`, `handler`, `roles`, `reversibility`, `annotations`
- `RegisteredTool` (interface, public) `framework/tool-protocol/src/tool.ts:116` — members: `name`, `description`, `inputSchema`, `handler`, `roles`, `reversibility`, `annotations`
- `ClaudeToolSpec` (interface, public) `framework/tool-protocol/src/tool.ts:142` — members: `name`, `description`, `input_schema`
- `ToolRegistry` (interface, public) `framework/tool-protocol/src/tool.ts:153` — members: `definitions`, `invoke`, `toClaudeToolSpecs`
- `RegistrySessionWorkflow` (interface, public) `framework/tool-protocol/src/tool.ts:164` — members: `reviewMessageId`, `subjectThreadId`, `artifactId`
- `BuildToolRegistryOptions` (interface, public) `framework/tool-protocol/src/tool.ts:171` — members: `role`, `extraTools`, `sessionWorkflow`, `useOnlyExtraTools`
- `ProposedCallWorkflowPort` (interface, public) `framework/tool-protocol/src/tool.ts:187` — members: `captureProposedCall`, `consumeTailoredGrant`, `recordOutcome`
- `AssistantToolResult` (type, public) `framework/tool-protocol/src/tool.ts:211`
- `AssistantToolShape` (interface, public) `framework/tool-protocol/src/tool.ts:216` — members: `name`, `description`, `inputSchema`, `handler`

## D. Const / enum exports

- `BUILTIN_TOOL_CATALOG` (const, public) `framework/tool-protocol/src/builtin-tool-catalog.ts:51`
