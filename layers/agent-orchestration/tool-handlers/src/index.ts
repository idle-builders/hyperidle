// Barrel for @hyperidle/tool-handlers (agent-orchestration Layer Service).

// @lore: buildToolRegistry lives here not in harness-registry — imports only shared types, zero execution content; home is the layer that owns the definitions
export { buildToolRegistry } from "./tool-registry.js";
export type { BuildToolRegistryOptions } from "./tool-types.js";
export { toClaudeToolSpec, toRegistered } from "./tool-types.js";
