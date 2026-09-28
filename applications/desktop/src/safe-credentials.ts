import * as fs from "node:fs";
import { ipcMain, safeStorage } from "electron";

const CREDENTIAL_NAME = "shared_backend_key";

export interface SetCredentialResult {
	stored: boolean;
	warning?: string;
}

export interface SafeCredentialsManager {
	registerHandlers(): void;
	unregisterHandlers(): void;
}

const CHANNELS = ["credentials:set"] as const;

export function encryptCredential(value: string): string | null {
	if (!safeStorage.isEncryptionAvailable()) {
		return null;
	}
	const buf = safeStorage.encryptString(value);
	return buf.toString("base64");
}

export function decryptCredential(encoded: string): string | null {
	try {
		const buf = Buffer.from(encoded, "base64");
		return safeStorage.decryptString(buf);
	} catch {
		return null;
	}
}

export function createSafeCredentialsManager(credentialsPath: string): SafeCredentialsManager {
	function loadStore(): Record<string, string> {
		try {
			const raw = fs.readFileSync(credentialsPath, "utf-8");
			return JSON.parse(raw) as Record<string, string>;
		} catch {
			return {};
		}
	}

	function saveStore(store: Record<string, string>): void {
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
