import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock electron APIs — factories must NOT reference outer variables
// (vi.mock is hoisted to the top of the file by Vitest)
// ---------------------------------------------------------------------------

vi.mock("electron", () => ({
	app: {
		requestSingleInstanceLock: vi.fn(() => true),
		whenReady: vi.fn(() => Promise.resolve()),
		quit: vi.fn(),
		exit: vi.fn(),
		getPath: vi.fn((name: string) => {
			const map: Record<string, string> = {
				userData: "/tmp/test-userdata",
				logs: "/tmp/test-logs",
			};
			return map[name] ?? `/tmp/test-${name}`;
		}),
		on: vi.fn(),
		name: "HyperIdle",
		isPackaged: false,
	},
	BrowserWindow: Object.assign(
		vi.fn(() => ({
			loadFile: vi.fn(),
			loadURL: vi.fn(),
			isMinimized: vi.fn(() => false),
			isDestroyed: vi.fn(() => false),
			restore: vi.fn(),
			focus: vi.fn(),
			on: vi.fn(),
			getBounds: vi.fn(() => ({ x: 0, y: 0, width: 1280, height: 800 })),
			isMaximized: vi.fn(() => false),
			isFullScreen: vi.fn(() => false),
			maximize: vi.fn(),
			setFullScreen: vi.fn(),
			show: vi.fn(),
			webContents: {
				executeJavaScript: vi.fn(() => Promise.resolve()),
				send: vi.fn(),
			},
		})),
		{ getAllWindows: vi.fn(() => []) },
	),
	dialog: {
		showMessageBox: vi.fn().mockResolvedValue({ response: 1 }),
		showErrorBox: vi.fn(),
	},
	shell: {
		openPath: vi.fn(),
		showItemInFolder: vi.fn(),
	},
	Menu: {
		setApplicationMenu: vi.fn(),
	},
	screen: {
		getPrimaryDisplay: vi.fn(() => ({
			bounds: { x: 0, y: 0, width: 1920, height: 1080 },
		})),
	},
	ipcMain: {
		handle: vi.fn(),
		removeHandler: vi.fn(),
	},
	safeStorage: {
		isEncryptionAvailable: vi.fn(() => true),
	},
}));

vi.mock("../src/boot-server.js", () => ({
	startServer: vi.fn(() => ({
		httpServer: { address: () => ({ port: 3456 }), close: vi.fn() },
		dispose: vi.fn(),
	})),
	getPort: vi.fn(() => 3456),
	waitForHealth: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/migrate.js", () => ({
	runMigrations: vi.fn(() => ({ applied: 0, schemaVersion: 1 })),
	resolveMigrationsFolder: vi.fn(() => "/tmp/drizzle"),
}));

vi.mock("../src/log-rotation.js", () => ({
	createLogRotator: vi.fn(() => ({
		logPath: "/tmp/test-logs/server.log",
		attach: vi.fn(),
		detach: vi.fn(),
		writeSync: vi.fn(),
	})),
}));

vi.mock("../src/app-menu.js", () => ({
	buildAppMenuTemplate: vi.fn(() => ({})),
}));

vi.mock("../src/safe-credentials.js", () => ({
	createSafeCredentialsManager: vi.fn(() => ({
		registerHandlers: vi.fn(),
		unregisterHandlers: vi.fn(),
	})),
}));

vi.mock("../src/client-config.js", () => ({
	loadClientConfig: vi.fn(() => ({
		backendMode: null,
		serverUrl: null,
		lastView: null,
		windowState: {
			x: undefined,
			y: undefined,
			width: 1280,
			height: 800,
			isMaximized: false,
			isFullScreen: false,
		},
	})),
	saveClientConfig: vi.fn(),
	migrateWindowState: vi.fn(),
	DEFAULTS: {
		backendMode: null,
		serverUrl: null,
		lastView: null,
		windowState: { width: 1280, height: 800, isMaximized: false, isFullScreen: false },
	},
}));

// ---------------------------------------------------------------------------
// Import functions under test
// ---------------------------------------------------------------------------
import {
	checkSingleInstanceLock,
	getBeforeQuitHandler,
	readOrGenerateApiKey,
	resolveDataDir,
	waitForRemoteHealth,
} from "../src/main.js";

let tmpDir: string;

beforeEach(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hyperidle-maintest-"));
	vi.clearAllMocks();
});

afterEach(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
describe("resolveDataDir", () => {
	it("returns userData + /hyperidle-pg", () => {
		const result = resolveDataDir("/custom/userdata");
		expect(result).toBe("/custom/userdata/hyperidle-pg");
	});

	it("returns an absolute path", () => {
		const result = resolveDataDir("/some/path");
		expect(path.isAbsolute(result)).toBe(true);
	});
});

describe("readOrGenerateApiKey", () => {
	it("creates secrets.json when it does not exist and returns a hex key", () => {
		const secretsPath = path.join(tmpDir, "secrets.json");
		const key = readOrGenerateApiKey(secretsPath);

		expect(typeof key).toBe("string");
		expect(key.length).toBe(64); // 32 bytes → 64 hex chars
		expect(key).toMatch(/^[0-9a-f]{64}$/);
		expect(fs.existsSync(secretsPath)).toBe(true);
	});

	it("creates secrets.json with mode 0o600", () => {
		const secretsPath = path.join(tmpDir, "secrets.json");
		readOrGenerateApiKey(secretsPath);
		const stat = fs.statSync(secretsPath);
		// Check the file permissions (mode & 0o777 to mask type bits)
		expect(stat.mode & 0o777).toBe(0o600);
	});

	it("returns the same key on subsequent calls (reads existing secrets.json)", () => {
		const secretsPath = path.join(tmpDir, "secrets.json");
		const key1 = readOrGenerateApiKey(secretsPath);
		const key2 = readOrGenerateApiKey(secretsPath);
		expect(key1).toBe(key2);
	});

	it("reads an existing key without overwriting it", () => {
		const secretsPath = path.join(tmpDir, "secrets.json");
		const existingKey = "a".repeat(64);
		fs.writeFileSync(secretsPath, JSON.stringify({ apiKey: existingKey }), { mode: 0o600 });

		const key = readOrGenerateApiKey(secretsPath);
		expect(key).toBe(existingKey);
	});

	it("generates a new key if secrets.json is corrupt", () => {
		const secretsPath = path.join(tmpDir, "secrets.json");
		fs.writeFileSync(secretsPath, "NOTJSON", { mode: 0o600 });

		const key = readOrGenerateApiKey(secretsPath);
		expect(typeof key).toBe("string");
		expect(key.length).toBe(64);
	});
});

describe("checkSingleInstanceLock", () => {
	it("calls app.quit() when requestSingleInstanceLock returns false", async () => {
		const { app } = await import("electron");
		(app.requestSingleInstanceLock as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);

		checkSingleInstanceLock();

		expect(app.quit).toHaveBeenCalled();
	});

	it("does not call app.quit() when requestSingleInstanceLock returns true", async () => {
		const { app } = await import("electron");
		(app.requestSingleInstanceLock as ReturnType<typeof vi.fn>).mockReturnValueOnce(true);

		checkSingleInstanceLock();

		expect(app.quit).not.toHaveBeenCalled();
	});

	it("returns false when lock is not obtained", async () => {
		const { app } = await import("electron");
		(app.requestSingleInstanceLock as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);

		const result = checkSingleInstanceLock();
		expect(result).toBe(false);
	});

	it("returns true when lock is obtained", async () => {
		const { app } = await import("electron");
		(app.requestSingleInstanceLock as ReturnType<typeof vi.fn>).mockReturnValueOnce(true);

		const result = checkSingleInstanceLock();
		expect(result).toBe(true);
	});
});

describe("getBeforeQuitHandler", () => {
	it("calls dispose on the server handle when invoked", () => {
		const mockDispose = vi.fn();
		const mockDetach = vi.fn();
		const mockHandle = {
			httpServer: { address: (): { port: number } => ({ port: 3456 }), close: vi.fn() },
			dispose: mockDispose,
		};
		const mockRotator = {
			logPath: "/tmp/server.log",
			attach: vi.fn(),
			detach: mockDetach,
			writeSync: vi.fn(),
		};

		const handler = getBeforeQuitHandler(mockHandle, mockRotator);
		handler();

		expect(mockDispose).toHaveBeenCalledOnce();
	});

	it("calls detach on the log rotator when invoked", () => {
		const mockDispose = vi.fn();
		const mockDetach = vi.fn();
		const mockHandle = {
			httpServer: { address: (): { port: number } => ({ port: 3456 }), close: vi.fn() },
			dispose: mockDispose,
		};
		const mockRotator = {
			logPath: "/tmp/server.log",
			attach: vi.fn(),
			detach: mockDetach,
			writeSync: vi.fn(),
		};

		const handler = getBeforeQuitHandler(mockHandle, mockRotator);
		handler();

		expect(mockDetach).toHaveBeenCalledOnce();
	});

	it("handles null server handle gracefully without throwing", () => {
		const mockDetach = vi.fn();
		const mockRotator = {
			logPath: "/tmp/server.log",
			attach: vi.fn(),
			detach: mockDetach,
			writeSync: vi.fn(),
		};

		const handler = getBeforeQuitHandler(null, mockRotator);
		expect(() => handler()).not.toThrow();
		expect(mockDetach).toHaveBeenCalled();
	});

	it("handles null log rotator gracefully without throwing", () => {
		const mockDispose = vi.fn();
		const mockHandle = {
			httpServer: { address: (): { port: number } => ({ port: 3456 }), close: vi.fn() },
			dispose: mockDispose,
		};

		const handler = getBeforeQuitHandler(mockHandle, null);
		expect(() => handler()).not.toThrow();
		expect(mockDispose).toHaveBeenCalled();
	});
});

describe("waitForRemoteHealth", () => {
	it("resolves when the remote server responds 200", async () => {
		// Use a real HTTP server to verify
		const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
		vi.stubGlobal("fetch", mockFetch);

		await expect(waitForRemoteHealth("http://remote-server:3001", 5000)).resolves.toBeUndefined();

		expect(mockFetch).toHaveBeenCalledWith("http://remote-server:3001/api/health");
		vi.unstubAllGlobals();
	});

	it("throws when remote server never responds within timeout", async () => {
		const mockFetch = vi.fn().mockRejectedValue(new Error("Connection refused"));
		vi.stubGlobal("fetch", mockFetch);

		await expect(waitForRemoteHealth("http://remote-server:3001", 150)).rejects.toThrow(
			"Remote health check failed",
		);
		vi.unstubAllGlobals();
	});

	it("strips trailing slash from serverUrl before appending /api/health", async () => {
		const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
		vi.stubGlobal("fetch", mockFetch);

		await waitForRemoteHealth("http://remote-server:3001/", 5000);

		expect(mockFetch).toHaveBeenCalledWith("http://remote-server:3001/api/health");
		vi.unstubAllGlobals();
	});
});
