/**
 * AES-256-GCM credential encryption with HKDF key derivation.
 *
 * @lore P3: Decision 3 — encrypt with key derived from HYPERIDLE_API_KEY via
 * HKDF. The API key is the root of trust; an attacker who has it already has
 * full API access. Adding a separate file-stored key would increase operational
 * complexity without improving security in practice.
 *
 * Format: base64(iv[12] + ciphertext[n] + authTag[16])
 */

import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";

/** AES-256-GCM IV length in bytes. */
const IV_LENGTH = 12;
/** AES-256-GCM auth tag length in bytes. */
const AUTH_TAG_LENGTH = 16;
/** Derived key length in bytes (256-bit AES key). */
const KEY_LENGTH = 32;
/** HKDF salt — fixed per-application constant. */
const HKDF_SALT = "hyperidle-credential-encryption-v1";
/** HKDF info — context string for key derivation. */
const HKDF_INFO = "credential-encryption-key";

/**
 * Derive a 256-bit AES key from the server secret using HKDF-SHA256.
 * Deterministic: same secret always produces the same key.
 */
export function deriveKey(serverSecret: string): Buffer {
	// @lore P3: hkdfSync is synchronous HKDF per RFC 5869. We use SHA-256
	// as the hash, a fixed salt (public constant), and a context info string
	// to domain-separate this key from any other derived keys.
	const keyMaterial = Buffer.from(serverSecret, "utf-8");
	const salt = Buffer.from(HKDF_SALT, "utf-8");
	const info = Buffer.from(HKDF_INFO, "utf-8");
	const derived = hkdfSync("sha256", keyMaterial, salt, info, KEY_LENGTH);
	return Buffer.from(derived);
}

/**
 * Encrypt a credential value with AES-256-GCM.
 * Returns base64(iv[12] + ciphertext[n] + authTag[16]).
 * Each call produces a different ciphertext (random IV).
 */
export function encryptCredentialValue(plaintext: string, serverSecret: string): string {
	const key = deriveKey(serverSecret);
	const iv = randomBytes(IV_LENGTH);
	const cipher = createCipheriv("aes-256-gcm", key, iv);

	const plaintextBuf = Buffer.from(plaintext, "utf-8");
	const ciphertext = Buffer.concat([cipher.update(plaintextBuf), cipher.final()]);
	const authTag = cipher.getAuthTag();

	// Concatenate: iv + ciphertext + authTag → base64
	const combined = Buffer.concat([iv, ciphertext, authTag]);
	return combined.toString("base64");
}

/**
 * Decrypt a credential value encrypted by encryptCredentialValue.
 * Returns the plaintext string, or null if decryption fails for any reason
 * (wrong key, tampered ciphertext, invalid format).
 */
export function decryptCredentialValue(encrypted: string, serverSecret: string): string | null {
	if (!encrypted) return null;

	try {
		const combined = Buffer.from(encrypted, "base64");

		// Minimum length: IV(12) + authTag(16) = 28 bytes; ciphertext can be 0 bytes
		if (combined.length < IV_LENGTH + AUTH_TAG_LENGTH) {
			return null;
		}

		const iv = combined.subarray(0, IV_LENGTH);
		const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH);
		const ciphertext = combined.subarray(IV_LENGTH, combined.length - AUTH_TAG_LENGTH);

		const key = deriveKey(serverSecret);
		const decipher = createDecipheriv("aes-256-gcm", key, iv);
		decipher.setAuthTag(authTag);

		const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
		return decrypted.toString("utf-8");
	} catch {
		// Decryption failure (wrong key, tampered auth tag, invalid base64, etc.)
		return null;
	}
}

/**
 * Get the server secret from env vars.
 * HYPERIDLE_CREDENTIAL_KEY takes priority (operator override for key rotation).
 * Falls back to HYPERIDLE_API_KEY (root of trust).
 */
export function getServerSecret(): string {
	return process.env.HYPERIDLE_CREDENTIAL_KEY ?? process.env.HYPERIDLE_API_KEY ?? "";
}

// Suppress unused import warning — createHmac is exported for potential use by callers
// that need HMAC-based operations with the same key material.
void createHmac;
