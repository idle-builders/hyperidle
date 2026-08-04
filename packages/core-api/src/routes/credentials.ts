/**
 * Credential CRUD endpoints for server-side credential management.
 *
 * NEVER include credential values in responses. All response shapes
 * expose only { name, state, lastValidatedAt }.
 *
 * @lore P3: These endpoints are for shared-mode deployments where credentials
 * are stored encrypted in the server_credentials table. In local mode,
 * credentials live in safeStorage on the desktop.
 */

import { deleteCredential, readCredentials, writeCredential } from "@hyperidle/connections";
import type { HyperIdleDb } from "@hyperidle/db";
import { readServerConfig } from "@hyperidle/settings";
import type { CredentialName, CredentialState } from "@hyperidle/shared";
import { CREDENTIAL_CATALOG, CREDENTIAL_STATES, isCredentialName } from "@hyperidle/shared";
import { decryptCredentialValue, encryptCredentialValue } from "@hyperidle/shared/crypto";
import { type HyperIdleEnv, requireBoundary } from "@hyperidle/shared/http";
import { Hono } from "hono";
import { z } from "zod";
import { createRateLimiter } from "../middleware/rate-limit.js";

/** Validation timeout: 10 seconds for all external service calls. */
const VALIDATE_TIMEOUT_MS = 10_000;

/**
 * Call Anthropic API to test key validity.
 * A non-401 response means the key is valid (even 400 = bad request, not bad key).
 */
async function validateAnthropicApiKey(
	apiKey: string,
): Promise<{ valid: boolean; error?: string }> {
	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), VALIDATE_TIMEOUT_MS);
		try {
			const response = await fetch("https://api.anthropic.com/v1/models", {
				headers: {
					"x-api-key": apiKey,
					"anthropic-version": "2023-06-01",
				},
				signal: controller.signal,
			});
			if (response.status === 401) {
				return { valid: false, error: "Invalid API key" };
			}
			return { valid: true };
		} finally {
			clearTimeout(timer);
		}
	} catch (err) {
		return {
			valid: false,
			error: err instanceof Error ? err.message : "Network error",
		};
	}
}

/**
 * Call OpenRouter auth check endpoint to test key validity.
 */
async function validateOpenRouterApiKey(
	apiKey: string,
): Promise<{ valid: boolean; error?: string }> {
	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), VALIDATE_TIMEOUT_MS);
		try {
			const headers = new Headers();
			headers.set("Authorization", `Bearer ${apiKey}`);
			const response = await fetch("https://openrouter.ai/api/v1/auth/key", {
				headers,
				signal: controller.signal,
			});
			if (response.status === 401 || response.status === 403) {
				return { valid: false, error: "Invalid API key" };
			}
			return { valid: true };
		} finally {
			clearTimeout(timer);
		}
	} catch (err) {
		return {
			valid: false,
			error: err instanceof Error ? err.message : "Network error",
		};
	}
}

/**
 * Call this server's own health/auth endpoint to validate a shared backend key.
 * @lore P3: The server validates its own key by calling itself. This confirms the
 * key format is correct and the auth middleware accepts it.
 */
async function validateSharedBackendKey(
	apiKey: string,
	selfUrl: string,
): Promise<{ valid: boolean; error?: string }> {
	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), VALIDATE_TIMEOUT_MS);
		try {
			const url = `${selfUrl.replace(/\/$/, "")}/api/health/auth`;
			const response = await fetch(url, {
				headers: { "X-API-Key": apiKey },
				signal: controller.signal,
			});
			if (response.status === 200) {
				return { valid: true };
			}
			if (response.status === 401) {
				return { valid: false, error: "Invalid API key" };
			}
			return { valid: false, error: `Unexpected status: ${response.status}` };
		} finally {
			clearTimeout(timer);
		}
	} catch (err) {
		return {
			valid: false,
			error: err instanceof Error ? err.message : "Network error",
		};
	}
}

interface CredentialStatusResponse {
	name: CredentialName;
	state: CredentialState;
	lastValidatedAt: string | null;
}

/**
 * Safely cast a DB validationState string to CredentialState.
 * Falls back to "present_untested" for any unrecognized value.
 * @lore P3 F-ADV-2: validate at runtime, do not blindly cast text column.
 */
function toCredentialState(raw: string): CredentialState {
	if ((CREDENTIAL_STATES as readonly string[]).includes(raw)) {
		return raw as CredentialState;
	}
	return "present_untested";
}

function buildStatusResponse(
	name: CredentialName,
	row: { validationState: string; lastValidatedAt: string | null } | undefined,
): CredentialStatusResponse {
	if (!row) {
		return { name, state: "absent", lastValidatedAt: null };
	}
	return {
		name,
		state: toCredentialState(row.validationState),
		lastValidatedAt: row.lastValidatedAt ?? null,
	};
}

const setCredentialBodySchema = z.object({
	value: z.string().min(1),
});

/**
 * Rate limiter for credential mutation + validation endpoints.
 * Validation endpoint is the most sensitive (potential API key oracle).
 * Limit: 20 req/min for PUT/DELETE, 3 req/min per identity for POST /validate.
 *
 * @lore P3 F-SEC-1: rate limiting required per security table in architecture.
 */
const mutateLimiter = createRateLimiter({ limit: 20, windowMs: 60_000 });
const validateLimiter = createRateLimiter({ limit: 3, windowMs: 60_000 });

export function createCredentialRoutes(db: HyperIdleDb): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();

	/** GET /api/credentials — list all catalog entries with state */
	router.get("/", requireBoundary({ kind: "public-data" }), async (c) => {
		const rows = await readCredentials(db);
		const rowMap = new Map(rows.map((r) => [r.name, r]));

		const response: CredentialStatusResponse[] = CREDENTIAL_CATALOG.map((entry) =>
			buildStatusResponse(entry.name, rowMap.get(entry.name)),
		);

		return c.json(response);
	});

	/** PUT /api/credentials/:name — set credential (encrypt + store) */
	router.put("/:name", requireBoundary({ kind: "public-data" }), mutateLimiter, async (c) => {
		const name = c.req.param("name");
		if (!isCredentialName(name)) {
			return c.json({ error: "Unknown credential name", code: "VALIDATION_ERROR" }, 400);
		}

		let rawBody: unknown;
		try {
			rawBody = await c.req.json();
		} catch {
			return c.json({ error: "Invalid JSON", code: "VALIDATION_ERROR" }, 400);
		}

		const parsed = setCredentialBodySchema.safeParse(rawBody);
		if (!parsed.success) {
			return c.json(
				{ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsed.error.issues },
				400,
			);
		}

		const { value } = parsed.data;

		// AH1 §6: Fail-loud at the write boundary — encryptCredentialValue throws
		// MISSING_ROOT_SECRET when no secret is configured.
		let encryptedValue: string;
		try {
			encryptedValue = encryptCredentialValue(value);
		} catch {
			return c.json(
				{
					error: "Encryption secret not configured",
					code: "MISSING_ROOT_SECRET",
				},
				500,
			);
		}

		const now = new Date().toISOString();

		// Upsert: resets validationState to "present_untested" + clears
		// lastValidatedAt on every write (a new value has never been re-validated).
		await writeCredential(db, name, {
			encryptedValue,
			validationState: "present_untested",
			lastValidatedAt: null,
			updatedAt: now,
		});

		const [row] = await readCredentials(db, { name });

		return c.json(buildStatusResponse(name, row));
	});

	/** DELETE /api/credentials/:name — remove credential */
	router.delete("/:name", requireBoundary({ kind: "public-data" }), mutateLimiter, async (c) => {
		const name = c.req.param("name");
		if (!isCredentialName(name)) {
			return c.json({ error: "Unknown credential name", code: "VALIDATION_ERROR" }, 400);
		}

		await deleteCredential(db, name);

		return c.body(null, 204);
	});

	/** POST /api/credentials/:name/validate — validate against external service */
	router.post(
		"/:name/validate",
		requireBoundary({ kind: "public-data" }),
		validateLimiter,
		async (c) => {
			const name = c.req.param("name");
			if (!isCredentialName(name)) {
				return c.json({ error: "Unknown credential name", code: "VALIDATION_ERROR" }, 400);
			}

			// Check if credential exists
			const [row] = await readCredentials(db, { name });

			if (!row) {
				return c.json({ valid: false, error: "Credential not set" }, 200);
			}

			// decryptCredentialValue returns null when no root secret is set.
			// @lore AH1 §6: Fail-loud at validate boundary — return 200 {valid:false}
			// on missing secret so the client sees a clean error rather than a 500.
			const plaintext = decryptCredentialValue(row.encryptedValue);

			if (!plaintext) {
				return c.json({ valid: false, error: "Credential decryption failed" }, 200);
			}

			// Call the appropriate external service to validate the key.
			// @lore P3 F-ARCH-4: Each credential type dispatches to its own validator.
			// Tests mock these external calls via vi.spyOn / global fetch mocking.
			let validationResult: { valid: boolean; error?: string };
			switch (name) {
				case "anthropic_api_key":
					validationResult = await validateAnthropicApiKey(plaintext);
					break;
				case "openrouter_api_key":
					validationResult = await validateOpenRouterApiKey(plaintext);
					break;
				case "shared_backend_key": {
					// Self-validate: use local server address
					const port = process.env.PORT ?? "3001";
					const selfUrl = `http://127.0.0.1:${port}`;
					validationResult = await validateSharedBackendKey(plaintext, selfUrl);
					break;
				}
				case "openai_compatible_api_key": {
					// AH1 §5 CRITICAL-3: Validate against the configured baseUrl.
					// Read baseUrl from server_config (non-secret, lives in tier config).
					// @lore AH1 SSRF deferral: this fetches a user-supplied baseUrl.
					// For v1 (single-founder local-trust) this is acceptable.
					// Hardening follow-up: block link-local/metadata IPs for multi-user deployments.
					const cfg = await readServerConfig(db);
					const openaiCompatibleTiers = (["reasoning", "workhorse", "fast"] as const).filter(
						(t) =>
							cfg.modelGateway[t].provider === "openai-compatible" && cfg.modelGateway[t].baseUrl,
					);
					const firstOaiTier = openaiCompatibleTiers[0];
					if (openaiCompatibleTiers.length === 0 || !firstOaiTier) {
						validationResult = {
							valid: false,
							error:
								"Set a base URL first (configure an openai-compatible tier in Settings > Models)",
						};
					} else {
						const baseUrl = cfg.modelGateway[firstOaiTier].baseUrl ?? "";
						try {
							const controller = new AbortController();
							const timer = setTimeout(() => controller.abort(), VALIDATE_TIMEOUT_MS);
							try {
								const response = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/models`, {
									headers: { Authorization: `Bearer ${plaintext}` },
									signal: controller.signal,
								});
								if (response.status === 401 || response.status === 403) {
									validationResult = { valid: false, error: "Invalid API key" };
								} else {
									validationResult = { valid: true };
								}
							} finally {
								clearTimeout(timer);
							}
						} catch (err) {
							validationResult = {
								valid: false,
								error: err instanceof Error ? err.message : "Network error",
							};
						}
					}
					break;
				}
				default: {
					// AH1 §5 CRITICAL-3: isCredentialName() at the top already rejects
					// unknown names — this branch is a fail-closed runtime guard.
					validationResult = { valid: false, error: "Unknown credential name" };
				}
			}

			// Update validation state in DB
			const now = new Date().toISOString();
			const newState: CredentialState = validationResult.valid ? "valid" : "invalid";

			await writeCredential(db, name, {
				validationState: newState,
				lastValidatedAt: now,
				updatedAt: now,
			});

			// Response MUST NOT include the raw value
			const result: { valid: boolean; error?: string } = { valid: validationResult.valid };
			if (validationResult.error) {
				result.error = validationResult.error;
			}
			return c.json(result);
		},
	);

	return router;
}
