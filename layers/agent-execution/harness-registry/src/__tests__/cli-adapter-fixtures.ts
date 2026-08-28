import type { CliAdapterConfig } from "../cli-harness-adapter.js";

/** Test-only CLI specs. Production configuration is exercised through createLocalAdapterPool. */
export function cliAdapterFixture(
	family: "claude" | "codex" | "opencode" | "cursor-agent",
): CliAdapterConfig {
	switch (family) {
		case "claude":
			return {
				binary: "claude",
				args: [
					"-p",
					"{{prompt}}",
					"--output-format",
					"stream-json",
					"--verbose",
					"--model",
					"{{model}}",
					"--mcp-config",
					".mcp.json",
					"--strict-mcp-config",
					"--permission-mode",
					"bypassPermissions",
					"--settings",
					".claude/settings.json",
				],
				envMap: {},
				eventFormat: "ndjson",
				envAllowlist: ["PATH", "HOME", "LANG", "USER", "LOGNAME"],
				returnEnforcementChannel: "settings-claude",
				eventDialect: "claude-stream-json",
			};
		case "codex":
			return {
				binary: "codex",
				args: [
					"exec",
					"--sandbox",
					"workspace-write",
					"--model",
					"{{model}}",
					"{{prompt}}",
					"--json",
				],
				envMap: { OPENAI_API_KEY: "{{apiKey}}" },
				eventFormat: "ndjson",
				envAllowlist: ["PATH", "HOME", "LANG"],
				returnEnforcementChannel: "settings-codex",
				seedPrompt: "positional",
				mcpConfig: { dialect: "codex-toml" },
				stderrIgnorePatterns: [/.*/],
			};
		case "opencode":
			return {
				binary: "opencode",
				args: [
					"run",
					"{{prompt}}",
					"--dir",
					"{{sandbox}}",
					"--format",
					"json",
					"--pure",
					"--model",
					"{{model}}",
				],
				envMap: {},
				credentialEnvByProvider: {
					anthropic: "ANTHROPIC_API_KEY",
					openrouter: "OPENROUTER_API_KEY",
				},
				customEndpointProvider: {
					id: "brought-endpoint",
					npm: "@ai-sdk/openai-compatible",
					configFile: "opencode.json",
				},
				eventFormat: "ndjson",
				envAllowlist: ["PATH", "HOME", "LANG", "OPENROUTER_API_KEY", "XDG_DATA_HOME"],
				returnEnforcementChannel: "process-reengage",
				reEngageCarrier: "run-arg",
				mcpConfig: { dialect: "opencode-json" },
				stderrIgnorePatterns: [/.*/],
			};
		case "cursor-agent":
			return {
				binary: "cursor-agent",
				args: [
					"-p",
					"{{prompt}}",
					"--print",
					"--output-format",
					"stream-json",
					"--model",
					"{{model}}",
					"--trust",
					"--approve-mcps",
				],
				envMap: {},
				eventFormat: "ndjson",
				envAllowlist: ["PATH", "HOME", "LANG", "USER", "LOGNAME"],
				returnEnforcementChannel: "none",
				eventDialect: "claude-stream-json",
				mcpConfig: { dialect: "cursor-json" },
			};
	}
}
