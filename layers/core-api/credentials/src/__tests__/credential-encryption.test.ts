/**
 * P3 / AU20 Am4 — Server-side credential encryption (public API).
 *
 * AC coverage via the public no-arg API (encryptCredentialValue / decryptCredentialValue):
 *  - round-trips correctly when secret is set in env
 *  - different ciphertext on each call (random IV)
 *  - returns null for wrong key, tampered ciphertext, invalid base64, empty string, short input
 *  - throws MISSING_ROOT_SECRET when no env secret configured
 *
 * @lore AU20 Am4: deriveKey, getServerSecret, requireServerSecret are now INTERNAL
 * (not exported from credential-encryption.ts). Tests were updated to test the same
 * cryptographic properties through the public encryptCredentialValue / decryptCredentialValue
 * API, using process.env manipulation to supply the secret.
 */

import { describe, expect, it } from "vitest";
import { decryptCredentialValue, encryptCredentialValue } from "../credential-encryption.js";

const TEST_SECRET = "test-server-secret-12345-xyzwq!!!";
const OTHER_SECRET = "other-server-secret-99999-abcde!!!";

/** Temporarily set HYPERIDLE_CREDENTIAL_KEY and run fn, then restore. */
function withSecret<T>(secret: string, fn: () => T): T {
	const prev = process.env.HYPERIDLE_CREDENTIAL_KEY;
	process.env.HYPERIDLE_CREDENTIAL_KEY = secret;
	try {
		return fn();
	} finally {
		if (prev === undefined) {
			delete process.env.HYPERIDLE_CREDENTIAL_KEY;
		} else {
			process.env.HYPERIDLE_CREDENTIAL_KEY = prev;
		}
	}
}

/** Temporarily clear both credential env vars and run fn. */
function withNoSecret<T>(fn: () => T): T {
	const prevCred = process.env.HYPERIDLE_CREDENTIAL_KEY;
	const prevApi = process.env.HYPERIDLE_API_KEY;
	process.env.HYPERIDLE_CREDENTIAL_KEY = "";
	process.env.HYPERIDLE_API_KEY = "";
	try {
		return fn();
	} finally {
		if (prevCred === undefined) {
			delete process.env.HYPERIDLE_CREDENTIAL_KEY;
		} else {
			process.env.HYPERIDLE_CREDENTIAL_KEY = prevCred;
		}
		if (prevApi === undefined) {
			delete process.env.HYPERIDLE_API_KEY;
		} else {
			process.env.HYPERIDLE_API_KEY = prevApi;
		}
	}
}

describe("credential encryption — public API", () => {
	describe("encryptCredentialValue", () => {
		it("returns a non-empty string", () => {
			const encrypted = withSecret(TEST_SECRET, () => encryptCredentialValue("my-api-key"));
			expect(typeof encrypted).toBe("string");
			expect(encrypted.length).toBeGreaterThan(0);
		});

		it("returns a valid base64 string", () => {
			const encrypted = withSecret(TEST_SECRET, () => encryptCredentialValue("my-api-key"));
			expect(() => Buffer.from(encrypted, "base64")).not.toThrow();
			// base64 characters only (standard encoding)
			expect(encrypted).toMatch(/^[A-Za-z0-9+/=]+$/);
		});

		it("produces different ciphertext on each call (random IV)", () => {
			const encrypted1 = withSecret(TEST_SECRET, () => encryptCredentialValue("same-value"));
			const encrypted2 = withSecret(TEST_SECRET, () => encryptCredentialValue("same-value"));
			expect(encrypted1).not.toBe(encrypted2);
		});

		it("can encrypt an empty string", () => {
			const encrypted = withSecret(TEST_SECRET, () => encryptCredentialValue(""));
			expect(typeof encrypted).toBe("string");
			expect(encrypted.length).toBeGreaterThan(0);
		});

		it("can encrypt a very long value", () => {
			const longValue = "x".repeat(10000);
			const encrypted = withSecret(TEST_SECRET, () => encryptCredentialValue(longValue));
			expect(typeof encrypted).toBe("string");
		});

		it("throws MISSING_ROOT_SECRET when no secret is configured", () => {
			withNoSecret(() => {
				expect(() => encryptCredentialValue("any-value")).toThrow();
				try {
					encryptCredentialValue("any-value");
				} catch (err) {
					const code = (err as Error & { code?: string }).code;
					expect(code).toBe("MISSING_ROOT_SECRET");
				}
			});
		});
	});

	describe("decryptCredentialValue", () => {
		it("round-trips: encrypt then decrypt returns the original value", () => {
			const original = "sk-ant-api03-test-key-12345";
			let encrypted!: string;
			withSecret(TEST_SECRET, () => {
				encrypted = encryptCredentialValue(original);
			});
			const decrypted = withSecret(TEST_SECRET, () => decryptCredentialValue(encrypted));
			expect(decrypted).toBe(original);
		});

		it("round-trips with empty string value", () => {
			let encrypted!: string;
			withSecret(TEST_SECRET, () => {
				encrypted = encryptCredentialValue("");
			});
			const decrypted = withSecret(TEST_SECRET, () => decryptCredentialValue(encrypted));
			expect(decrypted).toBe("");
		});

		it("round-trips with unicode value", () => {
			const original = "日本語テスト-key-🔑";
			let encrypted!: string;
			withSecret(TEST_SECRET, () => {
				encrypted = encryptCredentialValue(original);
			});
			const decrypted = withSecret(TEST_SECRET, () => decryptCredentialValue(encrypted));
			expect(decrypted).toBe(original);
		});

		it("returns null when wrong secret used for decryption", () => {
			// Encrypt with TEST_SECRET, then try to decrypt with OTHER_SECRET
			const encrypted = withSecret(TEST_SECRET, () => encryptCredentialValue("my-api-key"));
			const result = withSecret(OTHER_SECRET, () => decryptCredentialValue(encrypted));
			expect(result).toBeNull();
		});

		it("returns null for tampered ciphertext (GCM auth tag failure)", () => {
			const encrypted = withSecret(TEST_SECRET, () => encryptCredentialValue("my-api-key"));
			// Flip the last few base64 characters to tamper with the auth tag
			const buf = Buffer.from(encrypted, "base64");
			const lastIdx = buf.length - 1;
			buf[lastIdx] = (buf[lastIdx] ?? 0) ^ 0xff;
			const tampered = buf.toString("base64");
			const result = withSecret(TEST_SECRET, () => decryptCredentialValue(tampered));
			expect(result).toBeNull();
		});

		it("returns null for completely invalid base64 input", () => {
			const result = withSecret(TEST_SECRET, () => decryptCredentialValue("NOT_VALID_BASE64!!!"));
			expect(result).toBeNull();
		});

		it("returns null for an empty string input", () => {
			const result = withSecret(TEST_SECRET, () => decryptCredentialValue(""));
			expect(result).toBeNull();
		});

		it("returns null for a value too short to contain IV + ciphertext + authTag", () => {
			const result = withSecret(TEST_SECRET, () =>
				decryptCredentialValue(Buffer.from("short").toString("base64")),
			);
			expect(result).toBeNull();
		});

		it("returns null when no secret is configured (graceful degradation)", () => {
			// Encrypt with a key first, then clear it to simulate missing secret
			const encrypted = withSecret(TEST_SECRET, () => encryptCredentialValue("my-api-key"));
			const result = withNoSecret(() => decryptCredentialValue(encrypted));
			expect(result).toBeNull();
		});
	});

	describe("key determinism (proven through encrypt/decrypt consistency)", () => {
		it("same secret always decrypts its own ciphertext (deterministic key derivation)", () => {
			// Two separate encrypt calls produce different ciphertexts (random IV)
			// but both decrypt correctly with the same secret.
			const original = "deterministic-key-test";
			const enc1 = withSecret(TEST_SECRET, () => encryptCredentialValue(original));
			const enc2 = withSecret(TEST_SECRET, () => encryptCredentialValue(original));
			expect(enc1).not.toBe(enc2); // random IV
			const dec1 = withSecret(TEST_SECRET, () => decryptCredentialValue(enc1));
			const dec2 = withSecret(TEST_SECRET, () => decryptCredentialValue(enc2));
			expect(dec1).toBe(original);
			expect(dec2).toBe(original);
		});

		it("different secrets produce incompatible ciphertexts", () => {
			// secret-a encrypts; secret-b cannot decrypt it.
			const original = "cross-key-test";
			const encrypted = withSecret("secret-a-long-enough-for-hkdf!!!!", () =>
				encryptCredentialValue(original),
			);
			const result = withSecret("secret-b-long-enough-for-hkdf!!!!", () =>
				decryptCredentialValue(encrypted),
			);
			expect(result).toBeNull();
		});
	});
});
