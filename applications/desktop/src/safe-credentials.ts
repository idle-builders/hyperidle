import * as fs from "node:fs";
import { safeStorage } from "electron";

/** The person's own key for the server they joined, kept encrypted by the OS keychain. */
const PERSON_KEY = "person_key";

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

function loadStore(credentialsPath: string): Record<string, string> {
	try {
		return JSON.parse(fs.readFileSync(credentialsPath, "utf-8")) as Record<string, string>;
	} catch {
		return {};
	}
}

/** False when the keychain cannot encrypt it: the key is then not kept at all. */
export function keepPersonKey(credentialsPath: string, key: string): boolean {
	const encrypted = encryptCredential(key);
	if (encrypted === null) return false;
	const store = loadStore(credentialsPath);
	store[PERSON_KEY] = encrypted;
	fs.writeFileSync(credentialsPath, JSON.stringify(store), { mode: 0o600 });
	return true;
}

export function readPersonKey(credentialsPath: string): string | null {
	const encoded = loadStore(credentialsPath)[PERSON_KEY];
	return encoded === undefined ? null : decryptCredential(encoded);
}
