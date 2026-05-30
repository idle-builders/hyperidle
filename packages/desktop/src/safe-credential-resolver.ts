/**
 * S4: SafeStorageCredentialResolver — implements CredentialResolver interface
 * backed by Electron's safeStorage (encrypted credential store).
 *
 * Used by DesktopWorkerClient to supply API keys to ClaudeAgentSdkAdapter
 * without setting environment variables or transmitting keys over IPC.
 *
 * @lore S4 Decision 4: Inject resolver into ClaudeAgentSdkAdapter rather than
 * mutating process.env. This is the same pattern as DbCredentialResolver on
 * the server side — different backing store, same interface.
 *
 * @lore S4: Returns null (not throws) for all failure cases — missing file,
 * corrupt JSON, decryption failure, encryption unavailable — so the harness
 * adapter surfaces a clean MissingCredentialError to the caller.
 */

import * as fs from "node:fs";
import type { CredentialResolver } from "@hyperidle/server/harness";
import type { CredentialName } from "@hyperidle/shared";
import { safeStorage } from "electron";

export class SafeStorageCredentialResolver implements CredentialResolver {
	constructor(private readonly credentialsPath: string) {}

	/**
	 * Reads the named credential from the encrypted credentials.json file.
	 * Returns null if: encryption unavailable, file missing, corrupt JSON,
	 * key absent in store, or decryption fails.
	 */
	async resolve(name: CredentialName): Promise<string | null> {
		// Encryption must be available to decrypt
		if (!safeStorage.isEncryptionAvailable()) {
			return null;
		}

		let store: Record<string, string>;
		try {
			const raw = fs.readFileSync(this.credentialsPath, "utf-8");
			store = JSON.parse(raw) as Record<string, string>;
		} catch {
			return null;
		}

		const encoded = store[name];
		if (encoded === undefined) {
			return null;
		}

		try {
			const buf = Buffer.from(encoded, "base64");
			return safeStorage.decryptString(buf);
		} catch {
			return null;
		}
	}
}
