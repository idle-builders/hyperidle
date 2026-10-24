/**
 * safe-credentials tests — one channel, write-only.
 *
 * AC coverage:
 *  - encryptCredential() returns a base64-encoded string when safeStorage is available
 *  - encryptCredential() returns null when safeStorage is unavailable
 *  - decryptCredential() round-trips: encrypt then decrypt returns the original value
 *  - decryptCredential() returns null for invalid/corrupt ciphertext
 *  - createSafeCredentialsManager() registers ONLY credentials:set
 *  - credentials:set stores encrypted value in credentials.json
 *  - credentials:set returns { stored: false, warning } when encryption unavailable
 *  - credentials:set rejects a non-catalog name
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	createSafeCredentialsManager,
	decryptCredential,
	encryptCredential,
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
		ipcMain: {
			handle: vi.fn(),
			removeHandler: vi.fn(),
		},
	};
});

/** Helper: get a registered IPC handler by channel name. Throws if not found. */
function getHandler<T extends (...args: unknown[]) => unknown>(
	handleMock: ReturnType<typeof vi.fn>,
	channel: string,
): T {
	const call = handleMock.mock.calls.find((c) => c[0] === channel);
	if (!call) throw new Error(`IPC handler '${channel}' not registered`);
	return call[1] as T;
}

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

describe("createSafeCredentialsManager", () => {
	it("registerHandlers() registers ONLY credentials:set — no other channel", async () => {
		const { ipcMain } = await import("electron");
		const manager = createSafeCredentialsManager(path.join(tmpDir, "credentials.json"));
		manager.registerHandlers();

		const handleMock = ipcMain.handle as ReturnType<typeof vi.fn>;
		const channels = handleMock.mock.calls.map((c) => c[0] as string);
		expect(channels).toEqual(["credentials:set"]);
	});
});

describe("credentials:set handler", () => {
	it("writes encrypted value to credentials.json when encryption is available", async () => {
		const { ipcMain } = await import("electron");
		const credPath = path.join(tmpDir, "credentials.json");
		const manager = createSafeCredentialsManager(credPath);
		manager.registerHandlers();

		const handleMock = ipcMain.handle as ReturnType<typeof vi.fn>;
		type SetFn = (
			_event: unknown,
			name: string,
			value: string,
		) => Promise<{ stored: boolean; warning?: string }>;
		const setHandler = getHandler<SetFn>(handleMock, "credentials:set");

		const result = await setHandler(null, "shared_backend_key", "sk-1234abcd");
		expect(result.stored).toBe(true);
		expect(result.warning).toBeUndefined();

		// Verify credentials.json was written
		expect(fs.existsSync(credPath)).toBe(true);
		const raw = JSON.parse(fs.readFileSync(credPath, "utf-8")) as Record<string, string>;
		expect(Object.keys(raw)).toContain("shared_backend_key");
	});

	it("returns { stored: false, warning } when encryption is unavailable", async () => {
		const { ipcMain, safeStorage } = await import("electron");
		// @ts-expect-error private helper on mock
		safeStorage._setEncryptionAvailable(false);

		const credPath = path.join(tmpDir, "credentials.json");
		const manager = createSafeCredentialsManager(credPath);
		manager.registerHandlers();

		const handleMock = ipcMain.handle as ReturnType<typeof vi.fn>;
		type SetFn = (
			_event: unknown,
			name: string,
			value: string,
		) => Promise<{ stored: boolean; warning?: string }>;
		const setHandler = getHandler<SetFn>(handleMock, "credentials:set");

		const result = await setHandler(null, "shared_backend_key", "sk-1234abcd");
		expect(result.stored).toBe(false);
		expect(result.warning).toBeDefined();
		expect(result.warning).toMatch(/keychain|memory|unavailable/i);

		// @ts-expect-error private helper on mock
		safeStorage._setEncryptionAvailable(true);
	});

	it("rejects a non-catalog name with stored: false", async () => {
		const { ipcMain } = await import("electron");
		const credPath = path.join(tmpDir, "credentials.json");
		const manager = createSafeCredentialsManager(credPath);
		manager.registerHandlers();

		const handleMock = ipcMain.handle as ReturnType<typeof vi.fn>;
		type SetFn = (
			_event: unknown,
			name: string,
			value: string,
		) => Promise<{ stored: boolean; warning?: string }>;
		const setHandler = getHandler<SetFn>(handleMock, "credentials:set");

		const result = await setHandler(null, "ARBITRARY_KEY", "some-value");
		expect(result.stored).toBe(false);
		expect(result.warning).toBeDefined();

		// The rejected name must never be written to disk.
		expect(fs.existsSync(credPath)).toBe(false);
	});
});
