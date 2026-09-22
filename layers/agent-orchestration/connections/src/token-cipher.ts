/**
 * AES-256-GCM credential encryption with HKDF key derivation.
 *
 * @lore P3: Decision 3 — encrypt with key derived from HYPERIDLE_API_KEY via
 * HKDF. The API key is the root of trust; an attacker who has it already has
 * full API access. Adding a separate file-stored key would increase operational
 * complexity without improving security in practice.
 *
 * Format: base64(iv[12] + ciphertext[n] + authTag[16])
 *
 * @lore AU20 Am4: getServerSecret/requireServerSecret/deriveKey are intentionally
 * NOT exported — the cipher owns the key. Callers use encryptCredentialValue /
 * decryptCredentialValue with no secret param; the service handles key lookup.
 * Pure secret-param helpers are kept file-private for internal package use.
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
 * Get the server secret from env vars.
 * HYPERIDLE_CREDENTIAL_KEY takes priority (operator override for key rotation).
 * Falls back to HYPERIDLE_API_KEY (root of trust).
 *
 * @lore AH1 §6: Returns null (not empty string) when both vars are absent/empty.
 * @internal — not exported. Callers use encryptCredentialValue/decryptCredentialValue.
 */
function getServerSecret(): string | null {
	// HYPERIDLE_CREDENTIAL_KEY takes priority.
	// @lore AH1 §6: If HYPERIDLE_CREDENTIAL_KEY is explicitly set (even to ""),
	// we do NOT fall back to HYPERIDLE_API_KEY. An empty CREDENTIAL_KEY means "no
	// encryption key configured" — a deliberate operator choice to separate auth
	// key from credential encryption key. Only when CREDENTIAL_KEY is entirely
	// absent (undefined) do we fall back to HYPERIDLE_API_KEY (legacy single-key
	// deployments where HYPERIDLE_API_KEY served both purposes).
	if (process.env.HYPERIDLE_CREDENTIAL_KEY !== undefined) {
		const credKey = process.env.HYPERIDLE_CREDENTIAL_KEY;
		return credKey !== "" ? credKey : null;
	}
	// HYPERIDLE_CREDENTIAL_KEY is unset → fall back to HYPERIDLE_API_KEY.
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
 * @lore AU20 Am4: No serverSecret param — the cipher owns the key.
 * Callers that need graceful handling of a missing secret should catch
 * MISSING_ROOT_SECRET (code property on the thrown error).
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
 * @lore AU20 Am4: No serverSecret param — the cipher owns the key.
 * Returning null on missing secret matches the "graceful degradation" posture:
 * reads that can't decrypt are surfaced as MissingCredentialError downstream,
 * not as a hard boot failure.
 */
export function decryptCredentialValue(ciphertext: string): string | null {
	const secret = getServerSecret();
	if (!secret) return null;
	return decryptWithSecret(ciphertext, secret);
}
