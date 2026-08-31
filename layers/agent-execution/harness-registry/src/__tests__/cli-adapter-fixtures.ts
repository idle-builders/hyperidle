import type { CliAdapterConfig } from "../cli-harness-adapter.js";

/**
 * Gate test claude config: same as the default fixture but includes
 * --mcp-config + --settings so the gate hook and MCP test server are picked up.
 * Identical to cliAdapterFixture("claude") — exported as a named constant so
 * gate tests import it explicitly and the intent is clear.
 */
export const GATE_TEST_CLAUDE_CONFIG: CliAdapterConfig = {
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
				envMap: { ANTHROPIC_API_KEY: "{{apiKey}}" },
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
