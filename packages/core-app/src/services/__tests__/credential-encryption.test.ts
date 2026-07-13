/**
 * P3 RED — Server-side credential encryption (AC-8)
 *
 * AC coverage:
 *  - encryptCredentialValue + decryptCredentialValue round-trips correctly
 *  - decryptCredentialValue with wrong key returns null
 *  - decryptCredentialValue with tampered ciphertext returns null (GCM auth tag check)
 *  - deriveKey produces different keys from different secrets
 *  - deriveKey produces the same key from the same secret (deterministic)
 *  - Encrypted value is a valid base64 string
 *  - Each encryption call produces a different ciphertext (random IV)
 */

import { describe, expect, it } from "vitest";
import {
	decryptCredentialValue,
	deriveKey,
	encryptCredentialValue,
} from "../credential-encryption.js";

describe("P3 AC-8 — Credential encryption", () => {
	const SECRET = "test-server-secret-12345";

	describe("deriveKey", () => {
		it("produces a 32-byte (256-bit) Buffer", () => {
			const key = deriveKey(SECRET);
			expect(key).toBeInstanceOf(Buffer);
			expect(key.length).toBe(32);
		});

		it("produces the same key from the same secret (deterministic)", () => {
			const key1 = deriveKey(SECRET);
			const key2 = deriveKey(SECRET);
			expect(key1.equals(key2)).toBe(true);
		});

		it("produces different keys from different secrets", () => {
			const key1 = deriveKey("secret-a");
			const key2 = deriveKey("secret-b");
			expect(key1.equals(key2)).toBe(false);
		});

		it("handles empty string secret without throwing", () => {
			expect(() => deriveKey("")).not.toThrow();
		});
	});

	describe("encryptCredentialValue", () => {
		it("returns a non-empty string", () => {
			const encrypted = encryptCredentialValue("my-api-key", SECRET);
			expect(typeof encrypted).toBe("string");
			expect(encrypted.length).toBeGreaterThan(0);
		});

		it("returns a valid base64 string", () => {
			const encrypted = encryptCredentialValue("my-api-key", SECRET);
			expect(() => Buffer.from(encrypted, "base64")).not.toThrow();
			// base64 characters only (standard or url-safe)
			expect(encrypted).toMatch(/^[A-Za-z0-9+/=]+$/);
		});

		it("produces different ciphertext on each call (random IV)", () => {
			const encrypted1 = encryptCredentialValue("same-value", SECRET);
			const encrypted2 = encryptCredentialValue("same-value", SECRET);
			expect(encrypted1).not.toBe(encrypted2);
		});

		it("can encrypt an empty string", () => {
			const encrypted = encryptCredentialValue("", SECRET);
			expect(typeof encrypted).toBe("string");
			expect(encrypted.length).toBeGreaterThan(0);
		});

		it("can encrypt a very long value", () => {
			const longValue = "x".repeat(10000);
			const encrypted = encryptCredentialValue(longValue, SECRET);
			expect(typeof encrypted).toBe("string");
		});
	});

	describe("decryptCredentialValue", () => {
		it("round-trips: encrypt then decrypt returns the original value", () => {
			const original = "sk-ant-api03-test-key-12345";
			const encrypted = encryptCredentialValue(original, SECRET);
			const decrypted = decryptCredentialValue(encrypted, SECRET);
			expect(decrypted).toBe(original);
		});

		it("round-trips with empty string value", () => {
			const encrypted = encryptCredentialValue("", SECRET);
			const decrypted = decryptCredentialValue(encrypted, SECRET);
			expect(decrypted).toBe("");
		});

		it("round-trips with unicode value", () => {
			const original = "日本語テスト-key-🔑";
			const encrypted = encryptCredentialValue(original, SECRET);
			const decrypted = decryptCredentialValue(encrypted, SECRET);
			expect(decrypted).toBe(original);
		});

		it("returns null when wrong secret used", () => {
			const encrypted = encryptCredentialValue("my-api-key", "correct-secret");
			const result = decryptCredentialValue(encrypted, "wrong-secret");
			expect(result).toBeNull();
		});

		it("returns null for tampered ciphertext (GCM auth tag failure)", () => {
			const encrypted = encryptCredentialValue("my-api-key", SECRET);
			// Flip the last few base64 characters to tamper with the auth tag
			const buf = Buffer.from(encrypted, "base64");
			// Tamper with the last byte (auth tag is at the end)
			const lastIdx = buf.length - 1;
			buf[lastIdx] = (buf[lastIdx] ?? 0) ^ 0xff;
			const tampered = buf.toString("base64");
			const result = decryptCredentialValue(tampered, SECRET);
			expect(result).toBeNull();
		});

		it("returns null for completely invalid base64 input", () => {
			const result = decryptCredentialValue("NOT_VALID_BASE64!!!", SECRET);
			expect(result).toBeNull();
		});

		it("returns null for an empty string input", () => {
			const result = decryptCredentialValue("", SECRET);
			expect(result).toBeNull();
		});

		it("returns null for a value too short to contain IV + ciphertext + authTag", () => {
			// A valid base64 string but too short to be a valid encrypted value
			const result = decryptCredentialValue(Buffer.from("short").toString("base64"), SECRET);
			expect(result).toBeNull();
		});
	});
});
