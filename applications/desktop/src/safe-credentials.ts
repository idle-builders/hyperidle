/**
 * safeStorage-backed credential storage — one IPC channel, write-only.
 *
 * @lore The bridge used to carry six channels: set, get (plaintext
 * readback), list, delete, status, validate. Nothing in the renderer has
 * called anything but set since CredentialsTab stopped using the bridge —
 * the Worker settings field only ever writes the shared backend key, never
 * reads it back. The catalog collapsed to that one name, so it lives here
 * as a local constant instead of a shared enum in domain-model.
 */

import * as fs from "node:fs";
import { ipcMain, safeStorage } from "electron";

/** The one credential name this bridge accepts. Not extensible from the renderer. */
const CREDENTIAL_NAME = "shared_backend_key";

export interface SetCredentialResult {
	stored: boolean;
	warning?: string;
}

export interface SafeCredentialsManager {
	/**
	 * Register the ipcMain handler for credentials:set.
	 * Must be called after app is ready.
	 */
	registerHandlers(): void;
	/** Remove the ipcMain handler. Call on shutdown. */
	unregisterHandlers(): void;
}

const CHANNELS = ["credentials:set"] as const;

/**
 * Low-level: encrypt a string value using safeStorage.
 * Returns base64-encoded ciphertext, or null if encryption is unavailable.
 */
export function encryptCredential(value: string): string | null {
	if (!safeStorage.isEncryptionAvailable()) {
		return null;
	}
	const buf = safeStorage.encryptString(value);
	return buf.toString("base64");
}

/**
 * Low-level: decrypt a base64-encoded ciphertext using safeStorage.
 * Returns null if the value cannot be decrypted.
 */
export function decryptCredential(encoded: string): string | null {
	try {
		const buf = Buffer.from(encoded, "base64");
		return safeStorage.decryptString(buf);
	} catch {
		return null;
	}
}

/**
 * Create a SafeCredentialsManager that uses safeStorage to encrypt a
 * credential and write it to a JSON file at credentialsPath.
 *
 * main.ts's readCredentialFromStore reads that same file directly for the
 * worker to connect with — this manager never hands the value back to a
 * renderer.
 */
export function createSafeCredentialsManager(credentialsPath: string): SafeCredentialsManager {
	/** Load the on-disk JSON store. Returns {} if missing. */
	function loadStore(): Record<string, string> {
		try {
			const raw = fs.readFileSync(credentialsPath, "utf-8");
			return JSON.parse(raw) as Record<string, string>;
		} catch {
			return {};
		}
	}

	/** Persist the on-disk JSON store with mode 0o600 (owner read/write only). */
	function saveStore(store: Record<string, string>): void {
		// @lore N4: credentials.json stores encrypted credential blobs.
		// Even though values are encrypted, we restrict file access to the owner
		// per architecture §10.1: "The file itself is written with mode 0o600."
		fs.writeFileSync(credentialsPath, JSON.stringify(store), { mode: 0o600 });
	}

	function registerHandlers(): void {
		ipcMain.handle(
			"credentials:set",
			(_event: unknown, name: string, value: string): SetCredentialResult => {
				if (name !== CREDENTIAL_NAME) {
					return {
						stored: false,
						warning: `Credential '${name}' unavailable — not in the recognized catalog`,
					};
				}

				const encrypted = encryptCredential(value);
				if (encrypted === null) {
					// @lore N4-compat: warning includes "keychain"/"unavailable" so the
					// existing warning-detection regex still matches. There is no memory
					// fallback any more — nothing reads this value back, so a value this
					// manager cannot encrypt is not stored anywhere.
					return {
						stored: false,
						warning: "Keychain unavailable — value not stored",
					};
				}
				const store = loadStore();
				store[name] = encrypted;
				saveStore(store);
				return { stored: true };
			},
		);
	}

	function unregisterHandlers(): void {
		for (const channel of CHANNELS) {
			ipcMain.removeHandler(channel);
		}
	}

	return { registerHandlers, unregisterHandlers };
}
