/**
 * AES-256-GCM credential encryption with HKDF key derivation.
 *
 * Format: base64(iv[12] + ciphertext[n] + authTag[16])
 *
 * @lore: token-cipher — API key is root of trust; HKDF adds domain separation; getServerSecret/deriveKey unexported so the cipher owns the key
 */

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

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
 * @internal — not exported; callers use encryptCredentialValue/decryptCredentialValue.
 */
function deriveKey(serverSecret: string): Buffer {
	const keyMaterial = Buffer.from(serverSecret, "utf-8");
	const salt = Buffer.from(HKDF_SALT, "utf-8");
	const info = Buffer.from(HKDF_INFO, "utf-8");
	const derived = hkdfSync("sha256", keyMaterial, salt, info, KEY_LENGTH);
	return Buffer.from(derived);
}

/**
 * Get the server secret from env vars.
 * HYPERIDLE_CREDENTIAL_KEY takes priority (operator override for key rotation).
 * Falls back to HYPERIDLE_API_KEY (root of trust).
 *
 * @internal — not exported. Callers use encryptCredentialValue/decryptCredentialValue.
 */
function getServerSecret(): string | null {
	if (process.env.HYPERIDLE_CREDENTIAL_KEY !== undefined) {
		const credKey = process.env.HYPERIDLE_CREDENTIAL_KEY;
		return credKey !== "" ? credKey : null;
	}
	const apiKey = process.env.HYPERIDLE_API_KEY;
	if (apiKey !== undefined && apiKey !== "") return apiKey;
	return null;
}

/**
 * Require the server secret, throwing if absent.
 * @internal — not exported. Used inside encryptCredentialValue.
 * @throws {Error & { code: "MISSING_ROOT_SECRET" }} when no secret is configured.
 */
function requireServerSecret(): string {
	const secret = getServerSecret();
	if (!secret) {
		const err = new Error(
			"No encryption secret configured. Set HYPERIDLE_CREDENTIAL_KEY or HYPERIDLE_API_KEY.",
		) as Error & { code: string };
		err.code = "MISSING_ROOT_SECRET";
		throw err;
	}
	return secret;
}

/**
 * Encrypt with an explicit secret — file-private helper for internal package use.
 * Pure function; used by the public no-arg wrapper and by unit tests via barrel re-export.
 */
function encryptWithSecret(plaintext: string, serverSecret: string): string {
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
 * Decrypt with an explicit secret — file-private helper for internal package use.
 */
function decryptWithSecret(encrypted: string, serverSecret: string): string | null {
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
 * Encrypt a credential value with AES-256-GCM.
 * Reads the root secret from env (HYPERIDLE_CREDENTIAL_KEY / HYPERIDLE_API_KEY).
 * Returns base64(iv[12] + ciphertext[n] + authTag[16]).
 * Each call produces a different ciphertext (random IV).
 *
 * @throws {Error & { code: "MISSING_ROOT_SECRET" }} when no secret is configured.
 *
 */
export function encryptCredentialValue(plaintext: string): string {
	const secret = requireServerSecret();
	return encryptWithSecret(plaintext, secret);
}

/**
 * Decrypt a credential value encrypted by encryptCredentialValue.
 * Reads the root secret from env (HYPERIDLE_CREDENTIAL_KEY / HYPERIDLE_API_KEY).
 * Returns the plaintext string, or null if decryption fails for any reason
 * (wrong key, tampered ciphertext, invalid format, or no secret configured).
 *
 */
export function decryptCredentialValue(ciphertext: string): string | null {
	const secret = getServerSecret();
	if (!secret) return null;
	return decryptWithSecret(ciphertext, secret);
}
