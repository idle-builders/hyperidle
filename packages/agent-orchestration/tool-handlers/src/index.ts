/**
 * Barrel for @hyperidle/tool-handlers (agent-orchestration Layer Service).
 *
 * @lore AU20 Am10: collapsed from 42 exports to 3.
 *   - 22 `createXTool` factory exports → 0 PUBLIC (internal; assembled by
 *     `buildToolDefinitions`). The tool set is internal data, not 22 named
 *     exports — adding a tool adds one internal entry; public API unchanged.
 *   - 13 port sub-type exports → internal (reachable structurally through
 *     `ToolHandlersPorts`; only the aggregate is the DI contract).
 *   - `buildAllToolDefinitions` + `toolsForRoleFromPorts` → 1
 *     `buildToolDefinitions(ports, {role?})`.
 *   - `resolveDraftTeamId` + `resolveCurrentDraftBetId` + `AssistantDraftRegistryParams`
 *     → folded inside `buildAssistantDraftRegistry` (which is now async).
 *
 * @lore AU19 Increment 4 (§7.5 C1 resolution): the DB-/domain-touching
 * handler bodies of `tools/*` (§4 roster). `buildToolDefinitions(ports)`
 * DI-wires all 22 domain-touching tool bodies and the orchestration Layer
 * (today `packages/server`'s composition root) wires `ports` to each target
 * Service's real exports, then hands the resulting `RegisteredTool[]` into
 * `@hyperidle/tool-provider`'s `buildToolRegistry`.
 */

export { buildAssistantDraftRegistry } from "./assistant-draft-registry.js";
export type { ToolHandlersPorts } from "./ports.js";
export { buildToolDefinitions } from "./tool-definitions.js";
