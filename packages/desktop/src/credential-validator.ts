/**
 * Credential validation by calling target services.
 *
 * @lore P3: Validation is best-effort. Network failures should not prevent
 * the app from working. The validation result is informational — the credential
 * is still stored whether valid or not.
 */

import type { CredentialName } from "@hyperidle/shared";

export interface ValidationResult {
	valid: boolean;
	error?: string;
}

/**
 * Validate a credential by calling the target service.
 * Returns { valid: true } if the credential authenticates, { valid: false, error } otherwise.
 *
 * @lore P3: External service calls during validation. In test environments
 * these calls will fail with network errors which we treat as { valid: false }.
 * anthropic_api_key: any non-401 response from the API means the key is valid
 * (even 400 means it authenticated). openrouter_api_key: similar pattern.
 * shared_backend_key: 200 from /api/health/auth means valid.
 */
export async function validateCredential(
	name: CredentialName,
	value: string,
	serverUrl?: string,
): Promise<ValidationResult> {
	try {
		switch (name) {
			case "anthropic_api_key":
				return await validateAnthropicKey(value);
			case "openrouter_api_key":
				return await validateOpenRouterKey(value);
			case "shared_backend_key":
				return await validateSharedBackendKey(value, serverUrl);
			default: {
				// @lore Z8-166: TypeScript does not narrow the switch scrutinee to
				// `never` in the `default` arm even when all union members are handled.
				// We accept `CredentialName` here so the guard compiles while still
				// providing a safe runtime fallback for any future catalog additions.
				const exhaustive = (n: CredentialName): ValidationResult => ({
					valid: false,
					error: `Unknown credential name: ${String(n)}`,
				});
				return exhaustive(name);
			}
		}
	} catch (err) {
		return {
			valid: false,
			error: err instanceof Error ? err.message : "Validation failed",
		};
	}
}

async function validateAnthropicKey(apiKey: string): Promise<ValidationResult> {
	try {
		const response = await fetch("https://api.anthropic.com/v1/models", {
			headers: {
				"x-api-key": apiKey,
				"anthropic-version": "2023-06-01",
			},
		});
		// Any non-401 response means the key authenticated (even 400 = bad request, not bad key)
		if (response.status === 401) {
			return { valid: false, error: "Invalid API key" };
		}
		return { valid: true };
	} catch (err) {
		return {
			valid: false,
			error: err instanceof Error ? err.message : "Network error",
		};
	}
}

async function validateOpenRouterKey(apiKey: string): Promise<ValidationResult> {
	try {
		const response = await fetch("https://openrouter.ai/api/v1/auth/key", {
			headers: {
				Authorization: `Bearer ${apiKey}`,
			},
		});
		if (response.status === 401 || response.status === 403) {
			return { valid: false, error: "Invalid API key" };
		}
		return { valid: true };
	} catch (err) {
		return {
			valid: false,
			error: err instanceof Error ? err.message : "Network error",
		};
	}
}

async function validateSharedBackendKey(
	apiKey: string,
	serverUrl?: string,
): Promise<ValidationResult> {
	if (!serverUrl) {
		return { valid: false, error: "No server URL configured for shared mode" };
	}

	try {
		const url = `${serverUrl.replace(/\/$/, "")}/api/health/auth`;
		const response = await fetch(url, {
			headers: {
				"X-API-Key": apiKey,
			},
		});
		if (response.status === 200) {
			return { valid: true };
		}
		if (response.status === 401) {
			return { valid: false, error: "Invalid API key" };
		}
		return { valid: false, error: `Unexpected status: ${response.status}` };
	} catch (err) {
		return {
			valid: false,
			error: err instanceof Error ? err.message : "Network error",
		};
	}
}
