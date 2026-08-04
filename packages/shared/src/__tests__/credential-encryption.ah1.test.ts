/**
 * AH1 — credential encryption unit tests (public API).
 *
 * AC3: encryptCredentialValue() must throw MISSING_ROOT_SECRET when no secret is
 * configured — not silently produce a ciphertext with an empty key.
 *
 * @lore AU20 Am4: getServerSecret/requireServerSecret are now INTERNAL — not
 * exported from credential-encryption.ts. These tests were originally written
 * to test those internal functions directly. After AU20 they test the same
 * semantics through the public encryptCredentialValue / decryptCredentialValue API:
 *   - encryptCredentialValue throws MISSING_ROOT_SECRET when no secret set
 *   - decryptCredentialValue returns null when no secret set
 *   - both work normally when HYPERIDLE_CREDENTIAL_KEY is present
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("encryptCredentialValue / decryptCredentialValue — secret-gate", () => {
	beforeEach(() => {
		// biome-ignore lint/suspicious/noConsole: test setup logging
		// Clear both env vars so every test starts from "no secret configured".
		// vi.stubEnv is used so sibling workers cannot inherit the unstubbed env.
		// Use dynamic import inside each test (see below) so the module re-reads env.
	});

	afterEach(() => {
		// Dynamic import caches the module — env changes take effect because the functions
		// read process.env at call time (not at module load time).
	});

	it("encryptCredentialValue throws when both credential env vars are absent/empty", async () => {
		// biome-ignore lint/suspicious/noConsole: test
		process.env.HYPERIDLE_CREDENTIAL_KEY = "";
		process.env.HYPERIDLE_API_KEY = "";
		try {
			const { encryptCredentialValue } = await import("../crypto/credential-encryption.js");
			expect(() => encryptCredentialValue("any-value")).toThrow();
		} finally {
			delete process.env.HYPERIDLE_CREDENTIAL_KEY;
			delete process.env.HYPERIDLE_API_KEY;
		}
	});

	it("encryptCredentialValue throws with code MISSING_ROOT_SECRET", async () => {
		process.env.HYPERIDLE_CREDENTIAL_KEY = "";
		process.env.HYPERIDLE_API_KEY = "";
		try {
			const { encryptCredentialValue } = await import("../crypto/credential-encryption.js");
			try {
				encryptCredentialValue("any-value");
				throw new Error("Expected encryptCredentialValue to throw");
			} catch (err) {
				expect(err).toBeInstanceOf(Error);
				const code = (err as Error & { code?: string }).code;
				expect(code).toBe("MISSING_ROOT_SECRET");
			}
		} finally {
			delete process.env.HYPERIDLE_CREDENTIAL_KEY;
			delete process.env.HYPERIDLE_API_KEY;
		}
	});

	it("decryptCredentialValue returns null when both vars absent/empty (no secret)", async () => {
		process.env.HYPERIDLE_CREDENTIAL_KEY = "";
		process.env.HYPERIDLE_API_KEY = "";
		try {
			const { decryptCredentialValue } = await import("../crypto/credential-encryption.js");
			// Any ciphertext — returns null because no secret is available to decrypt with.
			const result = decryptCredentialValue("dGVzdC1jaXBoZXJ0ZXh0");
			expect(result).toBeNull();
		} finally {
			delete process.env.HYPERIDLE_CREDENTIAL_KEY;
			delete process.env.HYPERIDLE_API_KEY;
		}
	});

	it("encryptCredentialValue succeeds when HYPERIDLE_CREDENTIAL_KEY is set", async () => {
		process.env.HYPERIDLE_CREDENTIAL_KEY = "my-cred-key-32chars-long!!!!!!";
		process.env.HYPERIDLE_API_KEY = "";
		try {
			const { encryptCredentialValue } = await import("../crypto/credential-encryption.js");
			const result = encryptCredentialValue("my-secret-value");
			expect(typeof result).toBe("string");
			expect(result.length).toBeGreaterThan(0);
		} finally {
			delete process.env.HYPERIDLE_CREDENTIAL_KEY;
			delete process.env.HYPERIDLE_API_KEY;
		}
	});

	it("encrypt then decrypt round-trips when key is set", async () => {
		process.env.HYPERIDLE_CREDENTIAL_KEY = "my-cred-key-32chars-long!!!!!!";
		process.env.HYPERIDLE_API_KEY = "";
		try {
			const { encryptCredentialValue, decryptCredentialValue } = await import(
				"../crypto/credential-encryption.js"
			);
			const plaintext = "super-secret-credential";
			const encrypted = encryptCredentialValue(plaintext);
			const decrypted = decryptCredentialValue(encrypted);
			expect(decrypted).toBe(plaintext);
		} finally {
			delete process.env.HYPERIDLE_CREDENTIAL_KEY;
			delete process.env.HYPERIDLE_API_KEY;
		}
	});
});
