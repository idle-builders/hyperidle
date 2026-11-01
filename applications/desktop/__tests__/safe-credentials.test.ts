/**
 * safe-credentials tests — the person's own key, kept encrypted.
 *
 * AC coverage:
 *  - encryptCredential() returns a base64-encoded string when safeStorage is available
 *  - encryptCredential() returns null when safeStorage is unavailable
 *  - decryptCredential() round-trips: encrypt then decrypt returns the original value
 *  - decryptCredential() returns null for invalid/corrupt ciphertext
 *  - the person's own key is kept encrypted and read back; not kept without a keychain
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	decryptCredential,
	encryptCredential,
	keepPersonKey,
	readPersonKey,
} from "../src/safe-credentials.js";

// ---------------------------------------------------------------------------
// Mock the electron module — safeStorage cannot run outside Electron
// ---------------------------------------------------------------------------
vi.mock("electron", () => {
	const encryptionAvailable = { value: true };
	const encryptString = vi.fn((value: string) => Buffer.from(`ENCRYPTED:${value}`));
	const decryptString = vi.fn((buf: Buffer) => {
		const str = buf.toString();
		if (str.startsWith("ENCRYPTED:")) return str.slice("ENCRYPTED:".length);
		throw new Error("Decryption failed");
	});

	return {
		safeStorage: {
			get isEncryptionAvailable() {
				return () => encryptionAvailable.value;
			},
			get encryptString() {
				return encryptString;
			},
			get decryptString() {
				return decryptString;
			},
			_setEncryptionAvailable: (v: boolean) => {
				encryptionAvailable.value = v;
			},
		},
	};
});

let tmpDir: string;

beforeEach(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hyperidle-credtest-"));
});

afterEach(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true });
	vi.clearAllMocks();
});

describe("encryptCredential", () => {
	it("returns a non-empty base64 string when encryption is available", () => {
		const result = encryptCredential("secret-value");
		expect(result).not.toBeNull();
		expect(typeof result).toBe("string");
		expect((result ?? "").length).toBeGreaterThan(0);
		// base64 characters only
		expect(result).toMatch(/^[A-Za-z0-9+/=]+$/);
	});

	it("returns null when safeStorage.isEncryptionAvailable() returns false", async () => {
		const { safeStorage } = await import("electron");
		// @ts-expect-error private helper on mock
		safeStorage._setEncryptionAvailable(false);
		const result = encryptCredential("secret-value");
		expect(result).toBeNull();
		// @ts-expect-error private helper on mock
		safeStorage._setEncryptionAvailable(true);
	});
});

describe("decryptCredential", () => {
	it("round-trips: encrypt then decrypt returns the original value", () => {
		const original = "my-api-key-1234";
		const encrypted = encryptCredential(original);
		expect(encrypted).not.toBeNull();
		const decrypted = decryptCredential(encrypted ?? "");
		expect(decrypted).toBe(original);
	});

	it("returns null for corrupt ciphertext", () => {
		// Invalid base64 / not produced by our encryptString mock
		const result = decryptCredential("NOTVALIDBASE64!!!");
		expect(result).toBeNull();
	});
});

describe("the person's own key", () => {
	it("is kept encrypted and read back", () => {
		const credPath = path.join(tmpDir, "credentials.json");
		expect(keepPersonKey(credPath, "person-key-1234")).toBe(true);

		expect(fs.readFileSync(credPath, "utf-8")).not.toContain("person-key-1234");
		expect(readPersonKey(credPath)).toBe("person-key-1234");
	});

	it("is not kept when the keychain cannot encrypt it", async () => {
		const { safeStorage } = await import("electron");
		// @ts-expect-error private helper on mock
		safeStorage._setEncryptionAvailable(false);
		const credPath = path.join(tmpDir, "credentials.json");

		expect(keepPersonKey(credPath, "person-key-1234")).toBe(false);
		expect(fs.existsSync(credPath)).toBe(false);

		// @ts-expect-error private helper on mock
		safeStorage._setEncryptionAvailable(true);
	});

	it("reads as none before anyone joined", () => {
		expect(readPersonKey(path.join(tmpDir, "credentials.json"))).toBeNull();
	});
});
