/**
 * AES-256-GCM credential cipher, through its public API
 * (encryptCredentialValue / decryptCredentialValue). Round-trip, tamper, and
 * wrong-key properties, plus a GOLDEN VECTOR: a base64 ciphertext minted by
 * the pre-move implementation, which the cipher must still decrypt to its
 * original plaintext — a round-trip alone cannot prove the on-disk format
 * (KDF, salt, info string, byte layout) never silently changed, and every
 * connection token already at rest in a user's local PGlite directory would
 * become unreadable if it had.
 */

import { describe, expect, it, test, vi } from "vitest";
import { decryptCredentialValue, encryptCredentialValue } from "../token-cipher.js";

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
				let thrown: unknown;
				try {
					encryptCredentialValue("any-value");
				} catch (err) {
					thrown = err;
				}
				expect((thrown as (Error & { code?: string }) | undefined)?.code).toBe(
					"MISSING_ROOT_SECRET",
				);
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

/** Fixed key used to mint the golden vector below. */
const FIXED_KEY = "au26-e1-fixed-key";
/** Fixed plaintext used to mint the golden vector below. */
const FIXED_PLAINTEXT = "sk-au26-e1-fixed-plaintext-value";
/** base64(iv[12] + ciphertext[n] + authTag[16]) — minted by the pre-move code. */
const PRE_MOVE_CIPHERTEXT =
	"ECXJOo0uZOSVHOvxpkTARLtx43z0ghOVjZUYHVh/1yGPG4sbkanI4aN07lZJfWsx0l4VKMKGywkqfDCD";

const OTHER_KEY = "au26-e1-some-other-key";

function withFixedSecret<T>(secret: string, fn: () => T): T {
	vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", secret);
	try {
		return fn();
	} finally {
		vi.unstubAllEnvs();
	}
}

describe("credential cipher — on-disk format is stable across the move to shared", () => {
	test("decrypts the pre-move golden vector to the original plaintext", () => {
		const decrypted = withFixedSecret(FIXED_KEY, () => decryptCredentialValue(PRE_MOVE_CIPHERTEXT));
		expect(decrypted).toBe(FIXED_PLAINTEXT);
	});

	test("round-trips a fixed key + plaintext", () => {
		const roundTripped = withFixedSecret(FIXED_KEY, () =>
			decryptCredentialValue(encryptCredentialValue(FIXED_PLAINTEXT)),
		);
		expect(roundTripped).toBe(FIXED_PLAINTEXT);
	});

	test("emits the pre-move wire format — base64 of iv[12] + ciphertext + authTag[16]", () => {
		const encrypted = withFixedSecret(FIXED_KEY, () => encryptCredentialValue(FIXED_PLAINTEXT));
		const bytes = Buffer.from(encrypted, "base64");
		const golden = Buffer.from(PRE_MOVE_CIPHERTEXT, "base64");
		// Same plaintext length ⇒ byte-identical envelope length across the move.
		expect(bytes.length).toBe(golden.length);
		expect(bytes.length).toBe(12 + FIXED_PLAINTEXT.length + 16);
	});

	test("a different key cannot read the golden vector", () => {
		expect(
			withFixedSecret(OTHER_KEY, () => decryptCredentialValue(PRE_MOVE_CIPHERTEXT)),
		).toBeNull();
	});

	test("a tampered golden vector fails the auth tag", () => {
		const bytes = Buffer.from(PRE_MOVE_CIPHERTEXT, "base64");
		const last = bytes.length - 1;
		bytes[last] = (bytes[last] ?? 0) ^ 0xff;
		const tampered = bytes.toString("base64");
		expect(withFixedSecret(FIXED_KEY, () => decryptCredentialValue(tampered))).toBeNull();
	});

	test("the primitive reads no database — it depends only on env + node:crypto", () => {
		// The cipher is callable with no db handle, no connection, nothing
		// injected but the env secret.
		const encrypted = withFixedSecret(FIXED_KEY, () => encryptCredentialValue("no-db-needed"));
		expect(withFixedSecret(FIXED_KEY, () => decryptCredentialValue(encrypted))).toBe(
			"no-db-needed",
		);
	});
});
