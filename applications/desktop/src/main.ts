/**
 * Electron main process entry point.
 *
 * Implements the full startup sequence from architecture.md §3:
 * single-instance lock → paths → API key → log rotation → migrations →
 * env vars → server → health check → BrowserWindow → IPC handlers → menu
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from "electron";

// @lore N5: CJS output (esbuild) has __dirname; ESM (dev/tsx) has import.meta.url.
const Dirname =
	typeof __dirname === "string" ? __dirname : path.dirname(fileURLToPath(import.meta.url));

import { RemoteWorkerClient } from "@hyperidle/agent-execution";
import { buildAppMenuTemplate } from "./app-menu.js";
import { getPort, startServer, waitForHealth } from "./boot-server.js";
import { loadClientConfig, migrateWindowState, saveClientConfig } from "./client-config.js";
import type { LogRotator } from "./log-rotation.js";
import { createLogRotator } from "./log-rotation.js";
import { resolveMigrationsFolder, runMigrations } from "./migrate.js";
import { createSafeCredentialsManager, decryptCredential } from "./safe-credentials.js";

function log(message: string, data?: Record<string, unknown>): void {
	const ts = new Date().toISOString();
	const suffix = data ? ` ${JSON.stringify(data)}` : "";
	process.stderr.write(`${ts} [desktop] ${message}${suffix}\n`);
}

// @lore N4: IS_DEV uses app.isPackaged which is false when running `electron .`
// from source and true in the packaged .app bundle. This is the correct way
// to distinguish dev from production in Electron — not NODE_ENV.
export const IS_DEV = !app.isPackaged;

// ---------------------------------------------------------------------------
// Exported helper functions for testability
// ---------------------------------------------------------------------------

/**
 * Resolve the PGlite data directory.
 * Lives at userData + '/hyperidle-pg'. PGlite uses a directory, not a single file.
 */
export function resolveDataDir(userDataDir: string): string {
	return path.join(userDataDir, "hyperidle-pg");
}

/**
 * Poll GET {serverUrl}/api/health until a 200 response is received or timeout.
 * Used for shared-mode health check against a remote server.
 * Throws if the health check does not succeed within timeoutMs.
 *
 * @lore P3 AC-4: Separate from waitForHealth() (which takes a port number)
 * to avoid changing the existing function signature that tests rely on.
 */
export async function waitForRemoteHealth(serverUrl: string, timeoutMs = 30_000): Promise<void> {
	const url = `${serverUrl.replace(/\/$/, "")}/api/health`;
	const deadline = Date.now() + timeoutMs;

	while (Date.now() < deadline) {
		try {
			const response = await fetch(url);
			if (response.ok) {
				return;
			}
		} catch {
			// Server not ready yet; retry after a short delay.
		}
		if (Date.now() + 100 < deadline) {
			await new Promise<void>((resolve) => setTimeout(resolve, 100));
		} else {
			break;
		}
	}

	throw new Error(
		`Remote health check failed: server at ${url} did not respond within ${timeoutMs}ms`,
	);
}

interface SecretsFile {
	apiKey: string;
}

/**
 * Read the HYPERIDLE_API_KEY from secrets.json, or generate and persist one.
 * The file is written with mode 0o600 (owner-read-write only).
 *
 * @lore N4: secrets.json stores the internal server auth key (NOT a user-facing
 * credential). It is written with 0o600 to restrict access to the current user.
 * We use crypto.randomBytes(32).toString('hex') for 256 bits of entropy.
 */
export function readOrGenerateApiKey(secretsPath: string): string {
	if (fs.existsSync(secretsPath)) {
		try {
			const raw = fs.readFileSync(secretsPath, "utf-8");
			const parsed = JSON.parse(raw) as SecretsFile;
			if (parsed.apiKey && typeof parsed.apiKey === "string") {
				return parsed.apiKey;
			}
		} catch {
			// Corrupt file — regenerate
		}
	}

	const apiKey = crypto.randomBytes(32).toString("hex");
	const data = JSON.stringify({ apiKey });
	fs.writeFileSync(secretsPath, data, { mode: 0o600 });
	return apiKey;
}

/**
 * Check single-instance lock. Returns true if this instance got the lock.
 * Calls app.quit() if the lock is not obtained.
 *
 * @lore N4: requestSingleInstanceLock must be called BEFORE app.whenReady()
 * to prevent a second instance from starting initialization before quitting.
 */
export function checkSingleInstanceLock(): boolean {
	const gotLock = app.requestSingleInstanceLock();
	if (!gotLock) {
		app.quit();
		return false;
	}
	return true;
}

export interface ServerHandleLike {
	readonly httpServer: {
		address(): { port: number } | string | null;
		close(cb?: (err?: Error) => void): void;
	};
	readonly dispose: () => Promise<void> | void;
}

/**
 * Build the before-quit handler that shuts down server and log rotation.
 * Exported for unit testing.
 */
export function getBeforeQuitHandler(
	serverHandle: ServerHandleLike | null,
	logRotator: LogRotator | null,
): (event?: { preventDefault(): void }) => void {
	let shutdownPromise: Promise<void> | null = null;
	let shutdownComplete = false;
	return (event?: { preventDefault(): void }): void => {
		if (shutdownComplete) return;
		event?.preventDefault();
		if (shutdownPromise) return;

		logRotator?.detach();
		shutdownPromise = Promise.resolve(serverHandle?.dispose())
			.catch((error: unknown) => {
				log("server shutdown failed", {
					error: error instanceof Error ? error.message : String(error),
				});
			})
			.finally(() => {
				shutdownComplete = true;
				app.quit();
			});
	};
}

// ---------------------------------------------------------------------------
// Error dialog helper
// ---------------------------------------------------------------------------

async function showStartupError(
	message: string,
	detail: string,
	logDir: string,
	dbPath?: string,
): Promise<void> {
	const buttons = ["Open Logs", "Quit"];
	const result = await dialog.showMessageBox({
		type: "error",
		title: "HyperIdle",
		message,
		detail,
		buttons,
		defaultId: 1,
	});

	if (result.response === 0) {
		await shell.openPath(logDir);
		if (dbPath) {
			shell.showItemInFolder(dbPath);
		}
	}

	app.quit();
}

// ---------------------------------------------------------------------------
// Module-level state (for shutdown)
// ---------------------------------------------------------------------------

let logRotator: LogRotator | null = null;
let serverHandle: ServerHandleLike | null = null;

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

// Register uncaughtException BEFORE anything else
process.on("uncaughtException", (err: Error): void => {
	if (logRotator) {
		try {
			logRotator.writeSync(`FATAL: ${err.stack ?? err.message}\n`);
		} catch {
			// Don't let logging failure mask the original error
		}
	}

	dialog.showErrorBox(
		"HyperIdle encountered an unexpected error",
		`${err.message}\n\nCheck logs at ~/Library/Logs/HyperIdle/`,
	);

	app.exit(1);
});

// @lore N4: We gate the side-effectful startup so that importing main.ts in tests
// (for the exported helpers) does not trigger the full app boot sequence.
// In Electron, process.argv[0] is the electron binary. In Vitest, it's the node
// binary running vitest. We detect Electron by checking for the electron binary name
// or the ELECTRON_RUN_AS_NODE env var being absent (Electron sets it when running
// as plain Node). The simplest reliable check: process.versions.electron exists
// at runtime but not in Vitest/Node.
/* c8 ignore start */
const isEntrypoint = "electron" in process.versions;

if (isEntrypoint) {
	// Single-instance lock must run before app.whenReady()
	if (!checkSingleInstanceLock()) {
		// app.quit() was called inside checkSingleInstanceLock; stop here.
	} else {
		// Register second-instance focus handler
		app.on("second-instance", (): void => {
			const windows = BrowserWindow.getAllWindows();
			if (windows.length > 0) {
				const win = windows[0];
				if (win && !win.isDestroyed()) {
					if (win.isMinimized()) win.restore();
					win.focus();
				}
			}
		});

		void startApp();
	}
}
/* c8 ignore stop */

// @lore A `SafeStorageLike` interface stood here so the Anthropic-key reader
// could be tested against a stub. That reader is gone; the one credential the
// desktop still stores is read through `readCredentialFromStore` below.

// @lore A `readAnthropicKeyFromStore` stood here, decrypting the stored
// Anthropic key at boot and putting it into `process.env.ANTHROPIC_API_KEY` so
// the built-in harness would pick it up. No harness reads a key HyperIdle
// supplies — each authenticates with its own login — and the desktop app stores
// no model credential to read.

/** Parameters shared by local and shared mode boot paths. */
interface BootContext {
	userDataDir: string;
	logDir: string;
	configPath: string;
	credentialsPath: string;
}

/**
 * Register common IPC handlers used in both local and shared mode.
 */
function registerCommonIpcHandlers(mainWindow: BrowserWindow, ctx: BootContext): void {
	ipcMain.handle("shell:open-logs", async (): Promise<void> => {
		await shell.openPath(ctx.logDir);
	});
	ipcMain.handle("shell:open-data", async (): Promise<void> => {
		await shell.openPath(ctx.userDataDir);
	});
	ipcMain.handle("shell:select-folder", async (): Promise<string | null> => {
		const result = await dialog.showOpenDialog(mainWindow, {
			properties: ["openDirectory"],
			title: "Select repository folder",
		});
		return result.canceled ? null : (result.filePaths[0] ?? null);
	});
}

/**
 * Bind window state persistence handlers to save config.json on window changes.
 */
function bindWindowStatePersistence(mainWindow: BrowserWindow, configPath: string): void {
	const saveState = (): void => {
		if (!mainWindow.isDestroyed()) {
			const bounds = mainWindow.getBounds();
			saveClientConfig(configPath, {
				windowState: {
					...bounds,
					isMaximized: mainWindow.isMaximized(),
					isFullScreen: mainWindow.isFullScreen(),
				},
			});
		}
	};

	let resizeMoveTimer: ReturnType<typeof setTimeout> | null = null;
	const debouncedSaveState = (): void => {
		if (resizeMoveTimer) clearTimeout(resizeMoveTimer);
		resizeMoveTimer = setTimeout(saveState, 500);
	};

	mainWindow.on("resize", debouncedSaveState);
	mainWindow.on("move", debouncedSaveState);
	mainWindow.on("close", saveState);
	mainWindow.on("enter-full-screen", saveState);
	mainWindow.on("leave-full-screen", saveState);
}

/**
 * Run DB migrations with lock-contention retry dialog.
 * Returns false if the user chose to quit, true on success.
 */
async function runMigrationsWithRetry(
	dbPath: string,
	migrationsFolder: string,
	logDir: string,
): Promise<boolean> {
	let migrated = false;
	while (!migrated) {
		try {
			await runMigrations(dbPath, migrationsFolder);
			migrated = true;
		} catch (err) {
			const msg = err instanceof Error ? err.message : "";
			// @lore PGlite migration: PGlite throws "database is locked" or
			// Postgres error code 55P03 (lock_not_available) when another
			// process holds the data directory. Replaces SQLITE_BUSY check.
			if (msg.includes("locked") || msg.includes("55P03")) {
				const response = await dialog.showMessageBox({
					type: "warning",
					title: "HyperIdle",
					message: "Database is locked by another process.",
					detail: "Close other instances of HyperIdle and try again.",
					buttons: ["Retry", "Quit"],
					defaultId: 0,
				});
				if (response.response === 1) {
					app.quit();
					return false;
				}
			} else if (err instanceof Error && /downgrade/i.test(err.message)) {
				const response = await dialog.showMessageBox({
					type: "error",
					title: "HyperIdle",
					message: "This database was used with a newer version of HyperIdle.",
					detail: "Please update the application or restore from a backup.",
					buttons: ["Reveal in Finder", "Quit"],
					defaultId: 1,
				});
				if (response.response === 0) {
					shell.showItemInFolder(dbPath);
				}
				app.quit();
				return false;
			} else {
				await showStartupError(
					"Database migration failed.",
					`${(err as Error).message}\n\nYour data is safe.`,
					logDir,
					dbPath,
				);
				return false;
			}
		}
	}
	return true;
}

/**
 * Boot sequence for local mode: migrate DB, start embedded server, open window.
 *
 * @lore P3 AC-3/AC-5: local mode (including null/unset backendMode) boots the embedded server.
 */
async function bootLocalMode(ctx: BootContext, apiKey: string): Promise<void> {
	log("boot:local start", { userDataDir: ctx.userDataDir, isDev: IS_DEV });

	const dbPath = resolveDataDir(ctx.userDataDir);
	log("boot:local db", { dbPath });
	const clientConfig = loadClientConfig(ctx.configPath);

	const migrationsFolder = resolveMigrationsFolder();
	log("boot:local migrations", { migrationsFolder, exists: fs.existsSync(migrationsFolder) });
	const migrated = await runMigrationsWithRetry(dbPath, migrationsFolder, ctx.logDir);
	if (!migrated) {
		log("boot:local migrations failed or cancelled");
		return;
	}
	log("boot:local migrations complete");

	// Apply factory bootstrap after migrations — idempotent, runs every launch.
	// @lore AF17: factory bootstrap must run before the server starts so the hidden
	// system actor row is present when the first request arrives. No agent is seeded
	// here: agents arrive from the welcome screen or a plugin. The call is idempotent
	// (onConflictDoNothing) so repeated launches are safe.
	// @lore AU29 §2.5.4: `applyFactoryBootstrap` (framework/db) dissolved into layer
	// faces — `framework/db` may not import a layer, so first-boot composition moved to
	// this composition root. Only the core-state face is left: the run-config face wrote
	// the built-in harness and a hardcoded Anthropic model, and once the built-in harness
	// was retired it had nothing left to write that an absent row does not already resolve.
	try {
		const { createPgliteDb } = await import("@hyperidle/db");
		const { applyFactoryCoreState } = await import("@hyperidle/core-api");
		const handle = await createPgliteDb(dbPath);
		try {
			await applyFactoryCoreState(handle.db);
			log("boot:local factory bootstrap complete");
		} finally {
			await handle.close();
		}
	} catch (err) {
		log("boot:local factory bootstrap FAILED (non-fatal)", {
			error: (err as Error).message,
		});
		// Non-fatal: the server will start but may be missing factory rows.
		// The next launch will retry.
	}

	process.env.DATABASE_URL = dbPath;
	process.env.HYPERIDLE_API_KEY = apiKey;
	// The plugins that ship inside the app: electron-builder copies the repo's
	// `plugins/` into Resources beside the migrations; in development they are read
	// straight from the repo (same split as `resolveMigrationsFolder`).
	process.env.HYPERIDLE_BUNDLED_PLUGINS_DIR = IS_DEV
		? path.resolve(Dirname, "..", "..", "..", "plugins")
		: path.join(process.resourcesPath ?? "", "plugins");
	if (!IS_DEV) {
		process.env.NODE_ENV = "production";
		const staticDir = path.join(process.resourcesPath ?? "", "web-dist");
		const hasStaticDir = fs.existsSync(path.join(staticDir, "index.html"));
		log("boot:local static dir", { staticDir, exists: hasStaticDir });
		if (hasStaticDir) {
			process.env.HYPERIDLE_STATIC_DIR = staticDir;
		}
	}
	if (IS_DEV) {
		process.env.PORT = "3001";
	}

	log("boot:local starting server", {
		DATABASE_URL: dbPath,
		HYPERIDLE_STATIC_DIR: process.env.HYPERIDLE_STATIC_DIR ?? "(unset)",
		HYPERIDLE_BUNDLED_PLUGINS_DIR: process.env.HYPERIDLE_BUNDLED_PLUGINS_DIR,
		PORT: process.env.PORT ?? "(default)",
	});

	let handle: Awaited<ReturnType<typeof startServer>>;
	try {
		handle = await startServer();
	} catch (err) {
		log("boot:local server start FAILED", {
			error: (err as Error).message,
			stack: (err as Error).stack,
		});
		await showStartupError("Server failed to start.", (err as Error).message, ctx.logDir);
		return;
	}
	serverHandle = handle;

	const port = getPort(handle);
	log("boot:local server listening", { port });

	const windowState = clientConfig.windowState;
	const preloadPath = path.join(Dirname, "preload.js");
	log("boot:local preload", { preloadPath, exists: fs.existsSync(preloadPath) });

	// @lore AV5: titleBarStyle:"hiddenInset" — macOS-only; insets the OS traffic-lights
	// into the app-owned chrome instead of a separate gray bar (Windows/Linux unaffected).
	// Design: 28px draggable inset (h-[28px]) at the top of the sidebar column only — not
	// a full-width strip. The traffic-lights float over the sidebar; main content reaches
	// the window top unaffected. trafficLightPosition:{x:12,y:11} centers the lights within
	// that 28px inset. backgroundColor must stay in sync with --surface-container (#242418);
	// the cool "#1a1a2e" violated AQ-018. Windows/Linux titleBarOverlay is a deliberate follow-up.
	const mainWindow = new BrowserWindow({
		x: windowState.x,
		y: windowState.y,
		width: windowState.width,
		height: windowState.height,
		titleBarStyle: "hiddenInset",
		trafficLightPosition: { x: 12, y: 11 },
		backgroundColor: "#242418",
		webPreferences: {
			preload: preloadPath,
			contextIsolation: true,
			sandbox: true,
			additionalArguments: [`--api-key=${apiKey}`, "--backend-mode=local"],
		},
		show: false,
	});

	const splashPath = path.join(Dirname, "splash.html");
	mainWindow.loadFile(splashPath);
	mainWindow.show();
	if (windowState.isMaximized) mainWindow.maximize();
	if (windowState.isFullScreen) mainWindow.setFullScreen(true);

	if (!mainWindow.isDestroyed()) {
		void mainWindow.webContents.executeJavaScript(
			'window.updateStatus && window.updateStatus("Starting server...")',
		);
	}

	log("boot:local waiting for health check", { port, timeoutMs: 30_000 });
	try {
		await waitForHealth(port, 30_000);
	} catch {
		log("boot:local health check FAILED — server did not respond within 30s");
		await showStartupError(
			"Server not responding.",
			"The server did not start within 30 seconds.",
			ctx.logDir,
		);
		return;
	}
	log("boot:local health check passed");

	const appUrl = IS_DEV ? "http://localhost:5173" : `http://127.0.0.1:${port}`;
	log("boot:local loading app", { appUrl });
	mainWindow.loadURL(appUrl);

	// In dev mode, open devtools for debugging
	if (IS_DEV) {
		mainWindow.webContents.openDevTools({ mode: "detach" });
	}

	// Log renderer errors visible in main process
	mainWindow.webContents.on(
		"did-fail-load",
		(_event, errorCode, errorDescription, validatedURL) => {
			log("renderer did-fail-load", { errorCode, errorDescription, validatedURL });
		},
	);
	mainWindow.webContents.on("render-process-gone", (_event, details) => {
		log("renderer process gone", { reason: details.reason, exitCode: details.exitCode });
	});
	mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
		if (level >= 2) {
			log("renderer console", { level: level === 2 ? "warn" : "error", message, line, sourceId });
		}
	});

	bindWindowStatePersistence(mainWindow, ctx.configPath);

	const credManager = createSafeCredentialsManager(ctx.credentialsPath);
	credManager.registerHandlers();
	registerCommonIpcHandlers(mainWindow, ctx);

	const menuTemplate = buildAppMenuTemplate({
		isDev: IS_DEV,
		logDir: ctx.logDir,
		dataDir: ctx.userDataDir,
		onOpenSettings: (): void => {
			if (!mainWindow.isDestroyed()) mainWindow.webContents.send("open-settings");
		},
	});
	Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
	app.on("before-quit", getBeforeQuitHandler(serverHandle, logRotator));
	app.on("activate", (): void => {
		if (BrowserWindow.getAllWindows().length === 0) void startApp();
	});

	log("boot:local complete", { port, appUrl });
}

/**
 * Boot sequence for shared mode: connect to remote server, open window pointing at serverUrl.
 *
 * @lore P3 AC-4: No embedded server is started. The desktop connects to the remote serverUrl.
 * The embedded server (startServer/migrations) is NOT called.
 */
async function bootSharedMode(ctx: BootContext, serverUrl: string): Promise<void> {
	const clientConfig = loadClientConfig(ctx.configPath);
	const windowState = clientConfig.windowState;
	const preloadPath = path.join(Dirname, "preload.js");

	// @lore AV5: Same hiddenInset config as bootLocalMode — both windows share the same
	// titlebar treatment. backgroundColor matches --surface-container to avoid a flash of
	// cool color (#1a1a2e) before the app shell paints. Windows/Linux follow-up out of scope.
	const mainWindow = new BrowserWindow({
		x: windowState.x,
		y: windowState.y,
		width: windowState.width,
		height: windowState.height,
		titleBarStyle: "hiddenInset",
		trafficLightPosition: { x: 12, y: 11 },
		backgroundColor: "#242418",
		webPreferences: {
			preload: preloadPath,
			contextIsolation: true,
			sandbox: true,
			// S4: pass backend mode so preload can expose it via __HYPERIDLE__.backendMode
			additionalArguments: ["--backend-mode=shared"],
		},
		show: false,
	});

	const splashPath = path.join(Dirname, "splash.html");
	mainWindow.loadFile(splashPath);
	mainWindow.show();
	if (windowState.isMaximized) mainWindow.maximize();
	if (windowState.isFullScreen) mainWindow.setFullScreen(true);

	if (!mainWindow.isDestroyed()) {
		void mainWindow.webContents.executeJavaScript(
			'window.updateStatus && window.updateStatus("Connecting to remote server...")',
		);
	}

	try {
		await waitForRemoteHealth(serverUrl, 30_000);
	} catch {
		await showStartupError(
			"Remote server not responding.",
			`Could not connect to ${serverUrl} within 30 seconds.`,
			ctx.logDir,
		);
		return;
	}

	mainWindow.loadURL(serverUrl);
	bindWindowStatePersistence(mainWindow, ctx.configPath);

	const credManager = createSafeCredentialsManager(ctx.credentialsPath);
	credManager.registerHandlers();
	registerCommonIpcHandlers(mainWindow, ctx);

	// S4: Worker client — initialized if config.workerEnabled is true
	let workerClient: RemoteWorkerClient | null = null;
	const workerIpcChannels = [
		"worker:enable",
		"worker:disable",
		"worker:pause",
		"worker:resume",
		"worker:status",
	] as const;

	/**
	 * Read a credential from the encrypted safeStorage store.
	 * Returns null if not found or decryption fails.
	 */
	function readCredentialFromStore(name: string): string | null {
		try {
			const raw = fs.readFileSync(ctx.credentialsPath, "utf-8");
			const store = JSON.parse(raw) as Record<string, string>;
			const encoded = store[name];
			if (encoded === undefined) return null;
			return decryptCredential(encoded);
		} catch {
			return null;
		}
	}

	function createWorkerClient(maxConcurrent: number): RemoteWorkerClient | null {
		const config = loadClientConfig(ctx.configPath);
		const authKey = readCredentialFromStore("shared_backend_key");
		if (!authKey) {
			log("worker:enable — shared_backend_key not found in safeStorage; skipping");
			return null;
		}

		let deviceId = config.workerDeviceId;
		if (!deviceId) {
			deviceId = crypto.randomUUID();
			saveClientConfig(ctx.configPath, { workerDeviceId: deviceId });
		}

		// @lore This read the stored model keys to advertise which providers this
		// worker could serve. There are no stored model keys: a worker runs the
		// harnesses installed on its own machine, and each authenticates itself.
		const modelProviders: string[] = [];
		const client = new RemoteWorkerClient({
			serverUrl,
			credentialsPath: ctx.credentialsPath,
			authKey,
			deviceId,
			machineName: os.hostname(),
			modelProviders,
			maxConcurrent,
		});

		client.onStatusChange((status) => {
			if (!mainWindow.isDestroyed()) {
				mainWindow.webContents.send("worker:status-changed", status);
			}
		});

		return client;
	}

	// Register worker IPC handlers
	ipcMain.handle("worker:enable", async (_event: unknown, maxConcurrent: number): Promise<void> => {
		if (workerClient) {
			await workerClient.disconnect();
		}
		saveClientConfig(ctx.configPath, { workerEnabled: true, workerMaxConcurrent: maxConcurrent });
		workerClient = createWorkerClient(maxConcurrent);
		if (workerClient) {
			await workerClient.connect();
		}
	});

	ipcMain.handle("worker:disable", async (): Promise<void> => {
		if (workerClient) {
			await workerClient.disconnect();
			workerClient = null;
		}
		saveClientConfig(ctx.configPath, { workerEnabled: false });
	});

	ipcMain.handle("worker:pause", (): void => {
		workerClient?.pause();
	});

	ipcMain.handle("worker:resume", (): void => {
		workerClient?.resume();
	});

	ipcMain.handle("worker:status", (): unknown => {
		if (workerClient) {
			return workerClient.getStatus();
		}
		const config = loadClientConfig(ctx.configPath);
		return {
			enabled: config.workerEnabled,
			connected: false,
			paused: false,
			activeSessions: 0,
			maxConcurrent: config.workerMaxConcurrent,
			deviceId: config.workerDeviceId,
			modelProviders: [],
		};
	});

	// Auto-start worker on boot if configured
	{
		const config = loadClientConfig(ctx.configPath);
		if (config.workerEnabled && config.workerDeviceId) {
			workerClient = createWorkerClient(config.workerMaxConcurrent);
			if (workerClient) {
				void workerClient.connect().catch((err: unknown) => {
					log("worker:auto-start failed", { error: (err as Error).message });
				});
			}
		}
	}

	const menuTemplate = buildAppMenuTemplate({
		isDev: IS_DEV,
		logDir: ctx.logDir,
		dataDir: ctx.userDataDir,
		onOpenSettings: (): void => {
			if (!mainWindow.isDestroyed()) mainWindow.webContents.send("open-settings");
		},
	});
	Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
	// No server handle in shared mode
	// S4: include worker client shutdown in before-quit handler
	app.on("before-quit", (event) => {
		if (workerClient) {
			event.preventDefault();
			void workerClient.disconnect().finally(() => {
				workerClient = null;
				for (const channel of workerIpcChannels) {
					ipcMain.removeHandler(channel);
				}
				app.quit();
			});
		} else {
			getBeforeQuitHandler(null, logRotator)();
		}
	});
	app.on("activate", (): void => {
		if (BrowserWindow.getAllWindows().length === 0) void startApp();
	});
}

async function startApp(): Promise<void> {
	await app.whenReady();

	// Resolve paths
	const userDataDir = app.getPath("userData");
	const logDir = app.getPath("logs");
	const secretsPath = path.join(userDataDir, "secrets.json");
	const windowStatePath = path.join(userDataDir, "window-state.json");
	const configPath = path.join(userDataDir, "config.json");
	const credentialsPath = path.join(userDataDir, "credentials.json");

	// Initialize log rotation early so server output is captured from the start
	fs.mkdirSync(logDir, { recursive: true });
	logRotator = createLogRotator(logDir);
	logRotator.attach();

	log("startApp", {
		userDataDir,
		logDir,
		logFile: logRotator.logPath,
		isDev: IS_DEV,
		electronVersion: process.versions.electron,
		nodeVersion: process.versions.node,
		platform: process.platform,
		arch: process.arch,
	});

	// P3: Migrate window-state.json → config.json on first run after upgrade.
	migrateWindowState(windowStatePath, configPath);

	// P3: Read client config to determine BackendMode.
	// @lore P3 AC-3/AC-4/AC-5: null backendMode (first run) defaults to local.
	const clientConfig = loadClientConfig(configPath);
	log("startApp config", { backendMode: clientConfig.backendMode ?? "local (default)" });
	const ctx: BootContext = { userDataDir, logDir, configPath, credentialsPath };

	if (clientConfig.backendMode === "shared") {
		// SHARED MODE: connect to remote server, no embedded server started.
		const serverUrl = clientConfig.serverUrl;
		if (!serverUrl) {
			log("startApp shared mode FAILED — no serverUrl configured");
			await showStartupError(
				"Shared mode requires a server URL.",
				"Go to Settings → Backend to configure the remote server URL.",
				logDir,
			);
			return;
		}
		log("startApp booting shared mode", { serverUrl });
		await bootSharedMode(ctx, serverUrl);
	} else {
		// LOCAL MODE (or null/unset): boot embedded server.
		const apiKey = readOrGenerateApiKey(secretsPath);
		log("startApp booting local mode");
		await bootLocalMode(ctx, apiKey);
	}
}
