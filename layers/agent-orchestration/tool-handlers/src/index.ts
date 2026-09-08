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
 *
 * `create_bet`/`edit_bet` exist as ordinary `["assistant"]`-role-scoped
 * tools in `buildToolDefinitions`'s own `all` array.
 *
 * @lore AU19 Increment 4 (§7.5 C1 resolution): the DB-/domain-touching
 * handler bodies of `tools/*` (§4 roster). `buildToolDefinitions(ports)`
 * DI-wires all 22 domain-touching tool bodies and the orchestration Layer
 * (today `packages/server`'s composition root) wires `ports` to each target
 * Service's real exports, then hands the resulting `RegisteredTool[]` into
 * `@hyperidle/tool-provider`'s `buildToolRegistry`.
 */

export type { ToolHandlersPorts, ToolHandlersReviewAccessor } from "./ports.js";
export { buildToolDefinitions } from "./tool-definitions.js";
/**
 * @lore AU31 §2.5: `buildToolRegistry` relocated from `@hyperidle/harness-
 * registry` (agent-execution) — it imports only `@hyperidle/shared` and
 * holds zero execution content (role-filter + zod-validate closure over
 * shared types), so its legal home is the layer that owns the
 * definitions it dispatches, not the layer that owns harness adapters.
 */
export { buildToolRegistry } from "./tool-registry.js";
export type { BuildToolRegistryOptions } from "./tool-types.js";
export { toClaudeToolSpec, toRegistered } from "./tool-types.js";
