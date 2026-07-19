/**
 * CLI harness configuration constants — exposed via the ./cli-configs subpath.
 *
 * These are internal production configs, not product-surface exports from the
 * main barrel. Service integration tests that need to construct CLI adapters
 * manually (e.g. AH2/AM4 pool-setup helpers) import from here.
 *
 * @lore AU20 Ag4a: CLAUDE_CLI_CONFIG / CURSOR_AGENT_CLI_CONFIG / CLI_TOOL_CONFIGS +
 * CliAdapterConfig removed from the product barrel (.). Retained as a named
 * ./cli-configs subpath so test pool-construction code can still reference them
 * without importing internal module paths directly. Will be superseded once the
 * factory pattern (createLocalAdapterPool / select-by-capability) replaces manual
 * pool construction in test helpers (later Ag4 increments).
 */
export { CLAUDE_CLI_CONFIG, CLI_TOOL_CONFIGS, CURSOR_AGENT_CLI_CONFIG } from "./adapter-pool.js";
export type { CliAdapterConfig } from "./cli-harness-adapter.js";
