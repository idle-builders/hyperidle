/**
 * N4 — safe-credentials tests
 *
 * AC coverage:
 *  - encryptCredential() returns a base64-encoded string when safeStorage is available
 *  - encryptCredential() returns null when safeStorage is unavailable
 *  - decryptCredential() round-trips: encrypt then decrypt returns the original value
 *  - decryptCredential() returns null for invalid/corrupt ciphertext
 *  - createSafeCredentialsManager() registers IPC handlers for credentials:* channels
 *  - credentials:set stores encrypted value in credentials.json
 *  - credentials:set returns { stored: false, warning } when encryption unavailable
 *  - credentials:get returns decrypted value for a stored credential
 *  - credentials:get returns null for unknown credential name
 *  - credentials:list returns all stored credential names
 *  - credentials:delete removes a credential from the store
 *  - credentials:encryption-available returns the safeStorage.isEncryptionAvailable() result
 *  - memory-only fallback: credential stored in memory when encryption unavailable
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
	it("registerHandlers() calls ipcMain.handle for each credentials:* channel", async () => {
		const { ipcMain } = await import("electron");
		const manager = createSafeCredentialsManager(path.join(tmpDir, "credentials.json"));
		manager.registerHandlers();

		const handleMock = ipcMain.handle as ReturnType<typeof vi.fn>;
		const channels = handleMock.mock.calls.map((c) => c[0] as string);
		expect(channels).toContain("credentials:set");
		expect(channels).toContain("credentials:get");
		expect(channels).toContain("credentials:list");
		expect(channels).toContain("credentials:delete");
		expect(channels).toContain("credentials:encryption-available");
	});

	it("unregisterHandlers() calls ipcMain.removeHandler for each channel", async () => {
		const { ipcMain } = await import("electron");
		const manager = createSafeCredentialsManager(path.join(tmpDir, "credentials.json"));
		manager.registerHandlers();
		manager.unregisterHandlers();

		const removeHandlerMock = ipcMain.removeHandler as ReturnType<typeof vi.fn>;
		const channels = removeHandlerMock.mock.calls.map((c) => c[0] as string);
		expect(channels).toContain("credentials:set");
		expect(channels).toContain("credentials:get");
		expect(channels).toContain("credentials:list");
		expect(channels).toContain("credentials:delete");
		expect(channels).toContain("credentials:encryption-available");
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
});

describe("credentials:get handler", () => {
	it("returns decrypted value for a stored credential", async () => {
		const { ipcMain } = await import("electron");
		const credPath = path.join(tmpDir, "credentials.json");
		const manager = createSafeCredentialsManager(credPath);
		manager.registerHandlers();

		const handleMock = ipcMain.handle as ReturnType<typeof vi.fn>;
		type SetFn = (_event: unknown, name: string, value: string) => Promise<unknown>;
		type GetFn = (_event: unknown, name: string) => Promise<string | null>;
		const setHandlerFn = getHandler<SetFn>(handleMock, "credentials:set");
		const getHandlerFn = getHandler<GetFn>(handleMock, "credentials:get");

		await setHandlerFn(null, "shared_backend_key", "super-secret");
		const value = await getHandlerFn(null, "shared_backend_key");
		expect(value).toBe("super-secret");
	});

	it("returns null for an unknown credential name", async () => {
		const { ipcMain } = await import("electron");
		const credPath = path.join(tmpDir, "credentials.json");
		const manager = createSafeCredentialsManager(credPath);
		manager.registerHandlers();

		const handleMock = ipcMain.handle as ReturnType<typeof vi.fn>;
		type GetFn = (_event: unknown, name: string) => Promise<string | null>;
		const getHandlerFn = getHandler<GetFn>(handleMock, "credentials:get");

		const value = await getHandlerFn(null, "NONEXISTENT");
		expect(value).toBeNull();
	});
});

describe("credentials:list handler", () => {
	it("returns all stored credential names", async () => {
		const { ipcMain } = await import("electron");
		const credPath = path.join(tmpDir, "credentials.json");
		const manager = createSafeCredentialsManager(credPath);
		manager.registerHandlers();

		const handleMock = ipcMain.handle as ReturnType<typeof vi.fn>;
		type SetFn = (_event: unknown, name: string, value: string) => Promise<unknown>;
		type ListFn = (_event: unknown) => Promise<string[]>;
		const setHandlerFn = getHandler<SetFn>(handleMock, "credentials:set");
		const listHandlerFn = getHandler<ListFn>(handleMock, "credentials:list");

		// @lore This stored two names and asserted both came back. The catalog is
		// one name now — HyperIdle holds no model credential — so what the list
		// handler owes is that a stored name is returned and an unstored one is not.
		await setHandlerFn(null, "shared_backend_key", "valueA");

		const names = await listHandlerFn(null);
		expect(names).toEqual(["shared_backend_key"]);
	});

	it("returns empty array for an empty store", async () => {
		const { ipcMain } = await import("electron");
		const credPath = path.join(tmpDir, "credentials.json");
		const manager = createSafeCredentialsManager(credPath);
		manager.registerHandlers();

		const handleMock = ipcMain.handle as ReturnType<typeof vi.fn>;
		type ListFn = (_event: unknown) => Promise<string[]>;
		const listHandlerFn = getHandler<ListFn>(handleMock, "credentials:list");

		const names = await listHandlerFn(null);
		expect(names).toEqual([]);
	});
});

describe("credentials:delete handler", () => {
	it("removes a credential from the store", async () => {
		const { ipcMain } = await import("electron");
		const credPath = path.join(tmpDir, "credentials.json");
		const manager = createSafeCredentialsManager(credPath);
		manager.registerHandlers();

		const handleMock = ipcMain.handle as ReturnType<typeof vi.fn>;
		type SetFn = (_event: unknown, name: string, value: string) => Promise<unknown>;
		type DeleteFn = (_event: unknown, name: string) => Promise<void>;
		type ListFn = (_event: unknown) => Promise<string[]>;
		const setHandlerFn = getHandler<SetFn>(handleMock, "credentials:set");
		const deleteHandlerFn = getHandler<DeleteFn>(handleMock, "credentials:delete");
		const listHandlerFn = getHandler<ListFn>(handleMock, "credentials:list");

		await setHandlerFn(null, "shared_backend_key", "value");
		await deleteHandlerFn(null, "shared_backend_key");
		const names = await listHandlerFn(null);
		expect(names).not.toContain("shared_backend_key");
	});
});

describe("credentials:encryption-available handler", () => {
	it("returns true when safeStorage.isEncryptionAvailable() is true", async () => {
		const { ipcMain } = await import("electron");
		const manager = createSafeCredentialsManager(path.join(tmpDir, "credentials.json"));
		manager.registerHandlers();

		const handleMock = ipcMain.handle as ReturnType<typeof vi.fn>;
		type EncAvailFn = (_event: unknown) => Promise<boolean>;
		const encAvailHandler = getHandler<EncAvailFn>(handleMock, "credentials:encryption-available");

		const result = await encAvailHandler(null);
		expect(result).toBe(true);
	});

	it("returns false when safeStorage.isEncryptionAvailable() is false", async () => {
		const { ipcMain, safeStorage } = await import("electron");
		// @ts-expect-error private helper on mock
		safeStorage._setEncryptionAvailable(false);

		const manager = createSafeCredentialsManager(path.join(tmpDir, "credentials.json"));
		manager.registerHandlers();

		const handleMock = ipcMain.handle as ReturnType<typeof vi.fn>;
		type EncAvailFn = (_event: unknown) => Promise<boolean>;
		const encAvailHandler = getHandler<EncAvailFn>(handleMock, "credentials:encryption-available");

		const result = await encAvailHandler(null);
		expect(result).toBe(false);

		// @ts-expect-error private helper on mock
		safeStorage._setEncryptionAvailable(true);
	});
});

describe("memory-only fallback", () => {
	it("stores credential in memory when encryption is unavailable", async () => {
		const { ipcMain, safeStorage } = await import("electron");
		// @ts-expect-error private helper on mock
		safeStorage._setEncryptionAvailable(false);

		const credPath = path.join(tmpDir, "credentials.json");
		const manager = createSafeCredentialsManager(credPath);
		manager.registerHandlers();

		const handleMock = ipcMain.handle as ReturnType<typeof vi.fn>;
		type MemSetFn = (_event: unknown, name: string, value: string) => Promise<{ stored: boolean }>;
		type MemGetFn = (_event: unknown, name: string) => Promise<string | null>;
		const memSetHandler = getHandler<MemSetFn>(handleMock, "credentials:set");
		const memGetHandler = getHandler<MemGetFn>(handleMock, "credentials:get");

		await memSetHandler(null, "shared_backend_key", "in-memory-value");
		const value = await memGetHandler(null, "shared_backend_key");
		// Memory-only: the value should still be retrievable within the same session
		expect(value).toBe("in-memory-value");

		// @ts-expect-error private helper on mock
		safeStorage._setEncryptionAvailable(true);
	});
});
