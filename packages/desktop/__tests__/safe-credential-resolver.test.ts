/**
 * S4 RED — SafeStorageCredentialResolver: unit tests (AC-4).
 *
 * AC coverage:
 *  - resolve("anthropic_api_key") returns decrypted value when present in store
 *  - resolve("anthropic_api_key") returns null when not in store
 *  - resolve("openrouter_api_key") returns decrypted value when present
 *  - resolve("shared_backend_key") returns decrypted value when present
 *  - returns null when encryption unavailable (safeStorage.isEncryptionAvailable() = false)
 *  - returns null when credentials file is missing
 *  - returns null when credentials file is corrupt JSON
 *  - returns null when decryption throws (corrupt stored value)
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock electron before importing the module under test
vi.mock("electron", () => {
	const encryptString = vi.fn((value: string) => Buffer.from(`ENC:${value}`));
	const decryptString = vi.fn((buf: Buffer) => {
		const str = buf.toString();
		if (str.startsWith("ENC:")) return str.slice(4);
		throw new Error("Decryption failed");
	});

	let encryptionAvailable = true;

	return {
		safeStorage: {
			isEncryptionAvailable: vi.fn(() => encryptionAvailable),
			encryptString,
			decryptString,
			// Test helper
			_setEncryptionAvailable: (v: boolean) => {
				encryptionAvailable = v;
			},
		},
	};
});

import { SafeStorageCredentialResolver } from "../src/safe-credential-resolver.js";
import { encryptCredential } from "../src/safe-credentials.js";

let tmpDir: string;

beforeEach(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hyperidle-s4-resolver-"));
});

afterEach(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true });
	vi.restoreAllMocks();
});

function writeCredentials(dir: string, data: Record<string, string>): string {
	const credPath = path.join(dir, "credentials.json");
	fs.writeFileSync(credPath, JSON.stringify(data), { mode: 0o600 });
	return credPath;
}

function makeEncryptedStore(entries: Record<string, string>): Record<string, string> {
	const store: Record<string, string> = {};
	for (const [k, v] of Object.entries(entries)) {
		const encrypted = encryptCredential(v);
		if (encrypted) store[k] = encrypted;
	}
	return store;
}

describe("S4 AC-4 — SafeStorageCredentialResolver", () => {
	it("resolve('anthropic_api_key') returns decrypted value when present", async () => {
		const store = makeEncryptedStore({ anthropic_api_key: "sk-ant-test-key-123" });
		const credPath = writeCredentials(tmpDir, store);
		const resolver = new SafeStorageCredentialResolver(credPath);

		const result = await resolver.resolve("anthropic_api_key");
		expect(result).toBe("sk-ant-test-key-123");
	});

	it("resolve('anthropic_api_key') returns null when not in store", async () => {
		const credPath = writeCredentials(tmpDir, {});
		const resolver = new SafeStorageCredentialResolver(credPath);

		const result = await resolver.resolve("anthropic_api_key");
		expect(result).toBeNull();
	});

	it("resolve('openrouter_api_key') returns decrypted value when present", async () => {
		const store = makeEncryptedStore({ openrouter_api_key: "or-api-key-xyz" });
		const credPath = writeCredentials(tmpDir, store);
		const resolver = new SafeStorageCredentialResolver(credPath);

		const result = await resolver.resolve("openrouter_api_key");
		expect(result).toBe("or-api-key-xyz");
	});

	it("resolve('shared_backend_key') returns decrypted value when present", async () => {
		const store = makeEncryptedStore({ shared_backend_key: "backend-key-secret" });
		const credPath = writeCredentials(tmpDir, store);
		const resolver = new SafeStorageCredentialResolver(credPath);

		const result = await resolver.resolve("shared_backend_key");
		expect(result).toBe("backend-key-secret");
	});

	it("returns null when credentials file does not exist", async () => {
		const credPath = path.join(tmpDir, "nonexistent.json");
		const resolver = new SafeStorageCredentialResolver(credPath);

		const result = await resolver.resolve("anthropic_api_key");
		expect(result).toBeNull();
	});

	it("returns null when credentials file contains corrupt JSON", async () => {
		const credPath = path.join(tmpDir, "credentials.json");
		fs.writeFileSync(credPath, "CORRUPT{{{{");
		const resolver = new SafeStorageCredentialResolver(credPath);

		const result = await resolver.resolve("anthropic_api_key");
		expect(result).toBeNull();
	});

	it("returns null when encryption is unavailable", async () => {
		// Set up a valid store
		const store = makeEncryptedStore({ anthropic_api_key: "sk-ant-key" });
		const credPath = writeCredentials(tmpDir, store);
		const resolver = new SafeStorageCredentialResolver(credPath);

		// Make encryption unavailable
		const { safeStorage } = await import("electron");
		(
			safeStorage as unknown as { _setEncryptionAvailable: (v: boolean) => void }
		)._setEncryptionAvailable(false);

		const result = await resolver.resolve("anthropic_api_key");
		expect(result).toBeNull();

		// Restore
		(
			safeStorage as unknown as { _setEncryptionAvailable: (v: boolean) => void }
		)._setEncryptionAvailable(true);
	});

	it("returns null when credential stored as plaintext but decryptString throws on it", async () => {
		// Write a store with a non-encrypted (non-base64) value that will fail decryption
		const credPath = writeCredentials(tmpDir, { anthropic_api_key: "not-base64-encrypted" });
		const resolver = new SafeStorageCredentialResolver(credPath);

		// Mock decryptString to throw
		const { safeStorage } = await import("electron");
		vi.spyOn(safeStorage, "decryptString").mockImplementation(() => {
			throw new Error("Decryption failed");
		});

		const result = await resolver.resolve("anthropic_api_key");
		expect(result).toBeNull();
	});
});
