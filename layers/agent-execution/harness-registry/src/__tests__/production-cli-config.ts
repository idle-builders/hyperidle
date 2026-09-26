import { CLAUDE_CLI_CONFIG, CLI_TOOL_CONFIGS, CURSOR_AGENT_CLI_CONFIG } from "../adapter-pool.js";
import type { CliAdapterConfig } from "../cli-harness-adapter.js";

/**
 * Looks up an adapter config through the same objects production spawns
 * from (adapter-pool.ts), never a hand-copied duplicate — so a wrong flag
 * or a stray credential in production fails the real-binary lane too.
 */
export function productionCliConfig(
	family: "claude" | "codex" | "opencode" | "cursor-agent",
): CliAdapterConfig {
	switch (family) {
		case "claude":
			return CLAUDE_CLI_CONFIG;
		case "cursor-agent":
			return CURSOR_AGENT_CLI_CONFIG;
		case "codex":
		case "opencode": {
			const config = CLI_TOOL_CONFIGS[family];
			if (!config) throw new Error(`CLI_TOOL_CONFIGS has no entry for ${family}`);
			return config;
		}
	}
}
