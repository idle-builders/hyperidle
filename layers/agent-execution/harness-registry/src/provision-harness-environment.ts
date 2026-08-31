import type { ReturnEnforcementChannel } from "@hyperidle/harness-capability";
import type { GateRule } from "./action-gate-registry.js";
import { writeHarnessMcpConfig } from "./cli-mcp-config.js";
import { installGateHook } from "./provision-gate-hook.js";
import { installReturnHook } from "./provision-return-hook.js";

export interface ProvisionOptions {
	readonly sandboxPath: string;
	readonly mcpUrl: string;
	readonly token: string;
	readonly dialect?: "codex-toml" | "opencode-json" | "cursor-json";
	readonly channel?: ReturnEnforcementChannel;
	readonly forceBudget?: number;
	/**
	 * The session's mounted filesystems, threaded down to the
	 * dialect writer so a harness with a trust precondition (codex) can declare
	 * them trusted alongside the sandbox. See cli-mcp-config.ts's
	 * `HarnessMcpConfigParams.trustedPaths`.
	 */
	readonly trustedPaths?: readonly string[];
	/**
	 * Action gate rules resolved for this session. When non-empty,
	 * installs a PreToolUse gate hook alongside the Stop hook.
	 */
	readonly gateRules?: readonly GateRule[];
}

export async function provisionHarnessEnvironment(
	options: ProvisionOptions,
): Promise<{ readonly tokenEnv?: Record<string, string> }> {
	const configured = options.dialect
		? writeHarnessMcpConfig({
				dialect: options.dialect,
				sandboxPath: options.sandboxPath,
				mcpUrl: options.mcpUrl,
				token: options.token,
				trustedPaths: options.trustedPaths,
			})
		: {};
	if (options.channel) {
		await installReturnHook({
			sandboxPath: options.sandboxPath,
			channel: options.channel,
			bridgeToken: options.token,
			mcpUrl: options.mcpUrl,
			forceBudget: options.forceBudget ?? 0,
		});
		if (options.gateRules && options.gateRules.length > 0) {
			await installGateHook({
				sandboxPath: options.sandboxPath,
				channel: options.channel,
				bridgeToken: options.token,
				mcpUrl: options.mcpUrl,
			});
		}
	}
	return configured;
}
