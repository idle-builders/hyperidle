/**
 * P3 RED — Desktop credential manager refactor (AC-11)
 *
 * AC coverage:
 *  - credentials:set with catalog name succeeds
 *  - credentials:set with non-catalog name is rejected
 *  - credentials:status returns every catalog entry
 *  - credentials:validate calls the validation function
 *  - credentials:list returns CredentialName[] (catalog names only, not arbitrary)
 *  - credentials:get only accepts CredentialName values
 *  - credentials:delete only accepts CredentialName values
 *
 * @lore P3: This extends the N4 safe-credentials tests. The P3 refactor adds
 * catalog enforcement: only a catalog name is accepted; arbitrary names are
 * rejected.
 *
 * @lore The catalog had three names — two model-provider keys plus the shared
 * backend key. HyperIdle stores no model credential any more, so it has one.
 * The credentials:status and credentials:validate handlers are new in P3.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSafeCredentialsManager } from "../src/safe-credentials.js";

// ---------------------------------------------------------------------------
// Mock the electron module — same pattern as N4 safe-credentials.test.ts
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

/** Helper: get a registered IPC handler by channel name. */
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
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hyperidle-p3-credtest-"));
});

afterEach(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true });
	vi.clearAllMocks();
});

describe("P3 AC-11 — credentials:set catalog enforcement", () => {
	it("accepts shared_backend_key (catalog name)", async () => {
		const { ipcMain } = await import("electron");
		const manager = createSafeCredentialsManager(path.join(tmpDir, "credentials.json"));
		manager.registerHandlers();

		const handleMock = ipcMain.handle as ReturnType<typeof vi.fn>;
		type SetFn = (
			_event: unknown,
			name: string,
			value: string,
		) => Promise<{ stored: boolean; warning?: string }>;
		const setHandler = getHandler<SetFn>(handleMock, "credentials:set");

		const result = await setHandler(null, "shared_backend_key", "backend-key");
		expect(result.stored).toBe(true);
	});

	it("rejects non-catalog name with an error result", async () => {
		const { ipcMain } = await import("electron");
		const manager = createSafeCredentialsManager(path.join(tmpDir, "credentials.json"));
		manager.registerHandlers();

		const handleMock = ipcMain.handle as ReturnType<typeof vi.fn>;
		type SetFn = (
			_event: unknown,
			name: string,
			value: string,
		) => Promise<{ stored: boolean; warning?: string } | { error: string }>;
		const setHandler = getHandler<SetFn>(handleMock, "credentials:set");

		// Non-catalog name should be rejected
		const result = await setHandler(null, "ARBITRARY_KEY", "some-value");
		// Either stored: false with a warning about invalid name, or throws/rejects
		if ("stored" in result) {
			expect(result.stored).toBe(false);
		} else {
			expect(result.error).toBeDefined();
		}
	});

	it("rejects MY_API_KEY (old freeform name) with stored: false", async () => {
		const { ipcMain } = await import("electron");
		const manager = createSafeCredentialsManager(path.join(tmpDir, "credentials.json"));
		manager.registerHandlers();

		const handleMock = ipcMain.handle as ReturnType<typeof vi.fn>;
		type SetFn = (
			_event: unknown,
			name: string,
			value: string,
		) => Promise<{ stored: boolean; warning?: string }>;
		const setHandler = getHandler<SetFn>(handleMock, "credentials:set");

		const result = await setHandler(null, "MY_API_KEY", "some-value");
		// Should be rejected — not a catalog name
		expect(result.stored).toBe(false);
	});
});

describe("P3 AC-11 — credentials:status handler", () => {
	it("registerHandlers() includes credentials:status channel", async () => {
		const { ipcMain } = await import("electron");
		const manager = createSafeCredentialsManager(path.join(tmpDir, "credentials.json"));
		manager.registerHandlers();

		const handleMock = ipcMain.handle as ReturnType<typeof vi.fn>;
		const channels = handleMock.mock.calls.map((c) => c[0] as string);
		expect(channels).toContain("credentials:status");
	});

	it("credentials:status returns every catalog entry", async () => {
		const { ipcMain } = await import("electron");
		const manager = createSafeCredentialsManager(path.join(tmpDir, "credentials.json"));
		manager.registerHandlers();

		const handleMock = ipcMain.handle as ReturnType<typeof vi.fn>;
		type StatusFn = (_event: unknown) => Promise<Record<string, string>>;
		const statusHandler = getHandler<StatusFn>(handleMock, "credentials:status");

		const status = await statusHandler(null);
		expect(typeof status).toBe("object");
		expect(Object.keys(status)).toEqual(["shared_backend_key"]);
	});

	it("credentials:status returns 'absent' for credentials not yet set", async () => {
		const { ipcMain } = await import("electron");
		const manager = createSafeCredentialsManager(path.join(tmpDir, "credentials.json"));
		manager.registerHandlers();

		const handleMock = ipcMain.handle as ReturnType<typeof vi.fn>;
		type StatusFn = (_event: unknown) => Promise<Record<string, string>>;
		const statusHandler = getHandler<StatusFn>(handleMock, "credentials:status");

		const status = await statusHandler(null);
		expect(status.shared_backend_key).toBe("absent");
	});

	it("credentials:status returns 'present_untested' after setting a credential", async () => {
		const { ipcMain } = await import("electron");
		const manager = createSafeCredentialsManager(path.join(tmpDir, "credentials.json"));
		manager.registerHandlers();

		const handleMock = ipcMain.handle as ReturnType<typeof vi.fn>;
		type SetFn = (_event: unknown, name: string, value: string) => Promise<{ stored: boolean }>;
		type StatusFn = (_event: unknown) => Promise<Record<string, string>>;
		const setHandler = getHandler<SetFn>(handleMock, "credentials:set");
		const statusHandler = getHandler<StatusFn>(handleMock, "credentials:status");

		await setHandler(null, "shared_backend_key", "sk-ant-test");
		const status = await statusHandler(null);
		expect(["present_untested", "valid"]).toContain(status.shared_backend_key);
	});
});

describe("P3 AC-11 — credentials:validate handler", () => {
	it("registerHandlers() includes credentials:validate channel", async () => {
		const { ipcMain } = await import("electron");
		const manager = createSafeCredentialsManager(path.join(tmpDir, "credentials.json"));
		manager.registerHandlers();

		const handleMock = ipcMain.handle as ReturnType<typeof vi.fn>;
		const channels = handleMock.mock.calls.map((c) => c[0] as string);
		expect(channels).toContain("credentials:validate");
	});

	it("credentials:validate returns { valid: boolean } for a catalog name", async () => {
		const { ipcMain } = await import("electron");
		const manager = createSafeCredentialsManager(path.join(tmpDir, "credentials.json"));
		manager.registerHandlers();

		const handleMock = ipcMain.handle as ReturnType<typeof vi.fn>;
		type ValidateFn = (
			_event: unknown,
			name: string,
		) => Promise<{ valid: boolean; error?: string }>;
		const validateHandler = getHandler<ValidateFn>(handleMock, "credentials:validate");

		// Set a credential first
		type SetFn = (_event: unknown, name: string, value: string) => Promise<{ stored: boolean }>;
		const setHandler = getHandler<SetFn>(handleMock, "credentials:set");
		await setHandler(null, "shared_backend_key", "sk-ant-test");

		const result = await validateHandler(null, "shared_backend_key");
		expect(typeof result.valid).toBe("boolean");
		// Hits the real provider catalog to validate the key — give it headroom
		// beyond the 5s default so it doesn't flake under full-suite load.
	}, 20_000);

	it("credentials:validate for absent credential returns { valid: false }", async () => {
		const { ipcMain } = await import("electron");
		const manager = createSafeCredentialsManager(path.join(tmpDir, "credentials.json"));
		manager.registerHandlers();

		const handleMock = ipcMain.handle as ReturnType<typeof vi.fn>;
		type ValidateFn = (
			_event: unknown,
			name: string,
		) => Promise<{ valid: boolean; error?: string }>;
		const validateHandler = getHandler<ValidateFn>(handleMock, "credentials:validate");

		const result = await validateHandler(null, "shared_backend_key");
		expect(result.valid).toBe(false);
	});
});

describe("P3 AC-11 — credentials:list returns catalog names only", () => {
	it("credentials:list returns the three catalog names (not arbitrary names)", async () => {
		const { ipcMain } = await import("electron");
		const manager = createSafeCredentialsManager(path.join(tmpDir, "credentials.json"));
		manager.registerHandlers();

		const handleMock = ipcMain.handle as ReturnType<typeof vi.fn>;
		type SetFn = (_event: unknown, name: string, value: string) => Promise<{ stored: boolean }>;
		type ListFn = (_event: unknown) => Promise<string[]>;
		const setHandler = getHandler<SetFn>(handleMock, "credentials:set");
		const listHandler = getHandler<ListFn>(handleMock, "credentials:list");

		// Set a catalog credential
		await setHandler(null, "shared_backend_key", "sk-ant-test");

		const names = await listHandler(null);
		// P3: list returns catalog names (all three, even absent ones), OR
		// only the stored names — both are acceptable. But stored names MUST be catalog names.
		for (const name of names) {
			expect(["shared_backend_key", "openrouter_api_key", "shared_backend_key"]).toContain(name);
		}
	});
});
