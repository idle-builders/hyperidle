import type { HarnessAdapter } from "@hyperidle/harness-protocol";
import { CLAUDE_CLI_CONFIG, CURSOR_AGENT_CLI_CONFIG } from "../adapter-pool.js";
import type { CliAdapterConfig } from "../cli-harness-adapter.js";
import { CliHarnessAdapter } from "../cli-harness-adapter.js";
import { CodexAppServerAdapter } from "../codex-app-server-adapter.js";
import { OpenCodeServeAdapter } from "../opencode-serve-adapter.js";

/**
 * Returns the production adapter for a harness — the same adapter class
 * `createLocalAdapterPool` / `registerCliAdaptersIfAvailable` would register,
 * so a wrong config or missing protocol support in production fails here too.
 */
export function productionHarnessAdapter(
	name: "claude" | "codex" | "opencode" | "cursor-agent",
): HarnessAdapter {
	switch (name) {
		case "claude":
			return new CliHarnessAdapter(CLAUDE_CLI_CONFIG);
		case "cursor-agent":
			return new CliHarnessAdapter(CURSOR_AGENT_CLI_CONFIG);
		case "codex":
			return new CodexAppServerAdapter();
		case "opencode":
			return new OpenCodeServeAdapter();
	}
}

/**
 * Looks up an adapter config through the same objects production spawns
 * from (adapter-pool.ts), never a hand-copied duplicate — so a wrong flag
 * or a stray credential in production fails the real-binary lane too.
 */
export function productionCliConfig(family: "claude" | "cursor-agent"): CliAdapterConfig {
	switch (family) {
		case "claude":
			return CLAUDE_CLI_CONFIG;
		case "cursor-agent":
			return CURSOR_AGENT_CLI_CONFIG;
	}
}
