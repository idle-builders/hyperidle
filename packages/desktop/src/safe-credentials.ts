/**
 * safeStorage-backed credential storage with IPC handlers.
 */

import * as fs from "node:fs";
import { ipcMain, safeStorage } from "electron";

export interface SetCredentialResult {
	stored: boolean;
	warning?: string;
}

export interface SafeCredentialsManager {
	/**
	 * Register all ipcMain handlers for credentials:* channels.
	 * Must be called after app is ready.
	 */
	registerHandlers(): void;
	/** Remove all ipcMain handlers. Call on shutdown. */
	unregisterHandlers(): void;
}

const CHANNELS = [
	"credentials:set",
	"credentials:get",
	"credentials:list",
	"credentials:delete",
	"credentials:encryption-available",
] as const;

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
 * Create a SafeCredentialsManager that uses safeStorage to encrypt/decrypt
 * credentials stored in a JSON file at credentialsPath.
 */
export function createSafeCredentialsManager(credentialsPath: string): SafeCredentialsManager {
	// In-memory fallback for when encryption is unavailable
	const memoryStore = new Map<string, string>();

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
		// credentials:set
		ipcMain.handle(
			"credentials:set",
			async (_event: unknown, name: string, value: string): Promise<SetCredentialResult> => {
				const encrypted = encryptCredential(value);
				if (encrypted === null) {
					// Encryption unavailable — store in memory only
					memoryStore.set(name, value);
					return {
						stored: false,
						warning: "Keychain unavailable — stored in memory only",
					};
				}
				const store = loadStore();
				store[name] = encrypted;
				saveStore(store);
				return { stored: true };
			},
		);

		// credentials:get
		ipcMain.handle(
			"credentials:get",
			async (_event: unknown, name: string): Promise<string | null> => {
				// Check memory fallback first
				if (memoryStore.has(name)) {
					return memoryStore.get(name) ?? null;
				}
				const store = loadStore();
				const encoded = store[name];
				if (encoded === undefined) {
					return null;
				}
				return decryptCredential(encoded);
			},
		);

		// credentials:list
		ipcMain.handle("credentials:list", async (_event: unknown): Promise<string[]> => {
			const store = loadStore();
			const diskKeys = Object.keys(store);
			const memKeys = Array.from(memoryStore.keys()).filter((k) => !diskKeys.includes(k));
			return [...diskKeys, ...memKeys];
		});

		// credentials:delete
		ipcMain.handle("credentials:delete", async (_event: unknown, name: string): Promise<void> => {
			memoryStore.delete(name);
			const store = loadStore();
			if (name in store) {
				const { [name]: _removed, ...rest } = store;
				saveStore(rest);
			}
		});

		// credentials:encryption-available
		ipcMain.handle(
			"credentials:encryption-available",
			async (_event: unknown): Promise<boolean> => {
				return safeStorage.isEncryptionAvailable();
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
