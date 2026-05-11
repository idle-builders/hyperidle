/**
 * safeStorage-backed credential storage with IPC handlers.
 *
 * N4 stub — implementation pending.
 */

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

/**
 * Create a SafeCredentialsManager that uses safeStorage to encrypt/decrypt
 * credentials stored in a JSON file at credentialsPath.
 */
export function createSafeCredentialsManager(_credentialsPath: string): SafeCredentialsManager {
	throw new Error("not implemented");
}

/**
 * Low-level: encrypt a string value using safeStorage.
 * Returns base64-encoded ciphertext, or null if encryption is unavailable.
 */
export function encryptCredential(_value: string): string | null {
	throw new Error("not implemented");
}

/**
 * Low-level: decrypt a base64-encoded ciphertext using safeStorage.
 * Returns null if the value cannot be decrypted.
 */
export function decryptCredential(_encoded: string): string | null {
	throw new Error("not implemented");
}
