/**
 * AH1 RED — Fail-loud root secret: no silent plaintext writes.
 *
 * AC3: The server boots refusing to store credentials with no encryption secret
 * available, rather than silently writing plaintext — a misconfigured deployment
 * fails loudly, not quietly.
 *
 * Proof type: integration (real DB via fixtures, real routes).
 *
 * @lore AH1 §6: vi.stubEnv is used (not process.env mutation) so sibling test
 * workers cannot inherit the unstubbed env. afterEach → vi.unstubAllEnvs()
 * restores the original. This file deliberately stubs both secrets to "" to
 * exercise the fail-loud path.
 *
 * @lore AH1 §6: Boot is NON-FATAL — createServer/createApp with no secret still
 * constructs (the ~17 existing fixtures need no change). Fail-loud is at the
 * write/validate boundary only.
 *
 * @lore AH1 §6: HYPERIDLE_API_KEY is set to the auth sentinel so routes are
 * reachable. HYPERIDLE_CREDENTIAL_KEY is set to "" so getServerSecret() returns
 * null/empty (after AH1 changes getServerSecret to return string | null instead
 * of defaulting to ""). Today getServerSecret() returns "" which is falsy but
 * encryptCredentialValue("", "") still produces ciphertext — the fail-loud test
 * catches this by asserting the route returns 500, not 200.
 */

import { serverCredentials } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-ah1-fail-loud";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

describe("AH1 AC3 — fail-loud root secret (route boundary)", () => {
	beforeEach(() => {
		// Auth key must match so routes are reachable.
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		// Deliberately clear the encryption credential so getServerSecret() → null.
		// HYPERIDLE_CREDENTIAL_KEY="" so the crypto secret is missing.
		vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", "");
		// Note: after AH1, getServerSecret() returns null when HYPERIDLE_CREDENTIAL_KEY=""
		// and falls back to HYPERIDLE_API_KEY only if HYPERIDLE_CREDENTIAL_KEY is unset.
		// The auth middleware reads HYPERIDLE_API_KEY for X-API-Key auth; that is separate
		// from the credential encryption secret path.
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	describe("PUT /api/credentials/:name — write boundary", () => {
		test("returns 500 MISSING_ROOT_SECRET when no encryption secret set", async ({ app }) => {
			// With HYPERIDLE_CREDENTIAL_KEY="" and HYPERIDLE_API_KEY set only for auth,
			// requireServerSecret() at the write boundary must throw MISSING_ROOT_SECRET.
			// Fails today: getServerSecret() returns "" and encryptCredentialValue("key","")
			// produces ciphertext (plaintext-equivalent), and the route returns 200.
			const res = await app.request("/api/credentials/anthropic_api_key", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({ value: "sk-ant-should-be-refused" }),
			});

			expect(res.status).toBe(500);
			const body = (await res.json()) as { error?: string; code?: string };
			expect(body.code).toBe("MISSING_ROOT_SECRET");
		});

		test("does NOT write a row when PUT is refused with no encryption secret", async ({
			app,
			db,
		}) => {
			await app.request("/api/credentials/anthropic_api_key", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({ value: "sk-ant-should-not-be-stored" }),
			});

			// Assert no row was persisted.
			// Fails today: current implementation writes a ""-keyed ciphertext row.
			const rows = await db
				.select()
				.from(serverCredentials)
				.where(eq(serverCredentials.name, "anthropic_api_key"));
			expect(rows).toHaveLength(0);
		});
	});

	describe("POST /api/credentials/:name/validate — validate boundary", () => {
		test("returns 200 valid:false with error — no uncaught throw when no secret set", async ({
			app,
		}) => {
			// The validate boundary must NOT throw an uncaught 500 when the secret is missing.
			// Fails today: decryptCredentialValue(row, "") can produce odd results when secret="",
			// and with AH1 getServerSecret()→null, deriveKey(null) throws an uncaught error.
			const res = await app.request("/api/credentials/anthropic_api_key/validate", {
				method: "POST",
				headers: authHeaders(),
			});

			// Must be 200 (not 500), with valid:false.
			// Either "Credential not set" (no row) or "Encryption secret not configured".
			// Both are valid fail-closed responses — the key assertion is no uncaught throw.
			expect(res.status).toBe(200);
			const body = (await res.json()) as { valid: boolean; error?: string };
			expect(body.valid).toBe(false);
		});
	});

	describe("boot — createApp with no secret (non-fatal invariant)", () => {
		test("health endpoint responds even with no encryption secret (non-fatal boot)", async ({
			app,
		}) => {
			// Boot must NOT throw even when the credential encryption secret is absent.
			// This verifies the non-fatal boot invariant (§6) is preserved by AH1.
			// The test passes TODAY (boot is already non-fatal) and must continue to pass
			// after the green phase changes getServerSecret() to return null.
			const res = await app.request("/api/health", { method: "GET" });
			expect(res.status).toBe(200);
		});
	});
});
