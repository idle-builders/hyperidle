/**
 * Barrel for @hyperidle/tool-handlers (agent-orchestration Layer Service).
 *
 * @lore BC5 T11: `ToolHandlersPorts`/`buildToolDefinitions` are DELETED —
 * `create_team`/`add_agent`, this package's last two hand-written tools,
 * are gone with the `CoreApiPort` seam and the `org` package they wrote
 * through. What is left is generic dispatch infrastructure with a real
 * caller beyond those two tools: `run-orchestration-composition.ts`'s
 * `buildToolProvider` still assembles a session's registry from the
 * composed action list through `buildToolRegistry` below, role-filtered the
 * same way. A tool-less catalog is still a catalog.
 */

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
