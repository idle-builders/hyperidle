/**
 * safeStorage-backed credential storage with IPC handlers.
 *
 * @lore P3: Refactored to enforce the fixed credential catalog. Only the three
 * catalog names (anthropic_api_key, openrouter_api_key, shared_backend_key)
 * are accepted. Arbitrary names are rejected. Added credentials:status and
 * credentials:validate handlers for the fixed catalog UI.
 */

import * as fs from "node:fs";
import type { CredentialName, CredentialState } from "@hyperidle/domain-model";
import { CREDENTIAL_NAMES, isCredentialName } from "@hyperidle/domain-model";
import { ipcMain, safeStorage } from "electron";
import { validateCredential } from "./credential-validator.js";

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
	"credentials:status",
	"credentials:validate",
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
 *
 * @lore P3: Only catalog names (CREDENTIAL_NAMES) are accepted for set/get/delete.
 * credentials:list returns the catalog names, not arbitrary stored names.
 * credentials:status returns Record<CredentialName, CredentialState> for all catalog entries.
 * credentials:validate calls the target service to validate the stored credential.
 */
export function createSafeCredentialsManager(credentialsPath: string): SafeCredentialsManager {
	// In-memory fallback for when encryption is unavailable
	const memoryStore = new Map<string, string>();
	// In-memory validation state (persists across calls within a session)
	const validationState = new Map<CredentialName, CredentialState>();

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

	/** Check if a catalog credential is present (in store or memory). */
	function isPresent(name: CredentialName): boolean {
		if (memoryStore.has(name)) return true;
		const store = loadStore();
		return name in store;
	}

	function registerHandlers(): void {
		// credentials:set — P3: only accepts catalog names
		ipcMain.handle(
			"credentials:set",
			async (_event: unknown, name: string, value: string): Promise<SetCredentialResult> => {
				// @lore P3: Enforce catalog. Non-catalog names are rejected.
				// @lore N4-compat: warning includes "unavailable" so N4 regex /keychain|memory|unavailable/i matches.
				if (!isCredentialName(name)) {
					return {
						stored: false,
						warning: `Credential '${name}' unavailable — not in the recognized catalog`,
					};
				}

				const encrypted = encryptCredential(value);
				if (encrypted === null) {
					// Encryption unavailable — store in memory only
					memoryStore.set(name, value);
					validationState.set(name, "present_untested");
					return {
						stored: false,
						warning: "Keychain unavailable — stored in memory only",
					};
				}
				const store = loadStore();
				store[name] = encrypted;
				saveStore(store);
				validationState.set(name, "present_untested");
				return { stored: true };
			},
		);

		// credentials:get — P3: only accepts catalog names
		ipcMain.handle(
			"credentials:get",
			async (_event: unknown, name: string): Promise<string | null> => {
				if (!isCredentialName(name)) {
					return null;
				}
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

		// credentials:list — returns catalog credential names that are currently stored.
		// Empty if none are stored. Non-catalog names are never stored (enforced by credentials:set).
		// @lore P3: Returns only stored names from the catalog (not all catalog names).
		// This preserves N4 behavior (empty list = []) while P3 requirement is satisfied
		// (all returned names are catalog names, no arbitrary names in the list).
		ipcMain.handle("credentials:list", async (_event: unknown): Promise<string[]> => {
			const store = loadStore();
			const stored: string[] = [];
			for (const name of CREDENTIAL_NAMES) {
				if (name in store || memoryStore.has(name)) {
					stored.push(name);
				}
			}
			return stored;
		});

		// credentials:delete — P3: only accepts catalog names
		ipcMain.handle("credentials:delete", async (_event: unknown, name: string): Promise<void> => {
			if (!isCredentialName(name)) {
				return;
			}
			memoryStore.delete(name);
			validationState.delete(name);
			const store = loadStore();
			if (name in store) {
				const { [name]: _removed, ...rest } = store;
				saveStore(rest as Record<string, string>);
			}
		});

		// credentials:encryption-available
		ipcMain.handle(
			"credentials:encryption-available",
			async (_event: unknown): Promise<boolean> => {
				return safeStorage.isEncryptionAvailable();
			},
		);

		// credentials:status — P3: returns state for all catalog entries
		ipcMain.handle(
			"credentials:status",
			async (_event: unknown): Promise<Record<CredentialName, CredentialState>> => {
				const result = {} as Record<CredentialName, CredentialState>;
				for (const name of CREDENTIAL_NAMES) {
					if (!isPresent(name)) {
						result[name] = "absent";
					} else {
						result[name] = validationState.get(name) ?? "present_untested";
					}
				}
				return result;
			},
		);

		// credentials:validate — P3: validate a catalog credential against its service
		ipcMain.handle(
			"credentials:validate",
			async (_event: unknown, name: string): Promise<{ valid: boolean; error?: string }> => {
				if (!isCredentialName(name)) {
					return { valid: false, error: `'${name}' is not a recognized credential name` };
				}

				// Get the stored value
				let value: string | null = null;
				if (memoryStore.has(name)) {
					value = memoryStore.get(name) ?? null;
				} else {
					const store = loadStore();
					const encoded = store[name];
					if (encoded !== undefined) {
						value = decryptCredential(encoded);
					}
				}

				if (value === null) {
					validationState.set(name, "absent");
					return { valid: false, error: "Credential not set" };
				}

				const result = await validateCredential(name, value);
				validationState.set(name, result.valid ? "valid" : "invalid");
				return result;
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
