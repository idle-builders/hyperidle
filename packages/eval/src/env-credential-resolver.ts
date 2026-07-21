/**
 * EnvCredentialResolver — eval-only credential resolver.
 *
 * Reads credentials from process.env. Used by the eval CI lane which has no DB
 * and reads its LLM key from a CI-secret env var.
 *
 * @lore AH1 §3: This is INTENTIONALLY eval-only. Production server wiring
 * always uses DbCredentialResolver (packages/core-api/connections) exclusively.
 * No production code path should instantiate EnvCredentialResolver.
 *
 * @lore AU20 R-connections: Relocated from packages/core-api/connections/src/
 * credential-resolver.ts. The production vault (connections) no longer exports
 * this class — it is an eval fixture, not a vault capability.
 */

import type { CredentialName, CredentialResolver } from "@hyperidle/shared";

/**
 * Maps credential names to environment variable names.
 */
const ENV_VAR_MAP: Record<CredentialName, string> = {
	anthropic_api_key: "ANTHROPIC_API_KEY",
	openrouter_api_key: "OPENROUTER_API_KEY",
	shared_backend_key: "HYPERIDLE_API_KEY",
	openai_compatible_api_key: "OPENAI_COMPATIBLE_API_KEY",
};

/**
 * Reads credentials from process.env.
 * In local mode, the desktop main process sets env vars from safeStorage before
 * booting the server. In eval CI, env vars are set via CI secrets.
 */
export class EnvCredentialResolver implements CredentialResolver {
	async resolve(name: CredentialName): Promise<string | null> {
		const envVar = ENV_VAR_MAP[name];
		const value = process.env[envVar];
		return value !== undefined && value !== "" ? value : null;
	}
}
