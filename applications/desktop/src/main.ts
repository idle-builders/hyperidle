import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from "electron";

// @lore: Dirname — CJS output (esbuild) has __dirname; ESM (dev/tsx) requires fileURLToPath(import.meta.url)
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

// @lore: IS_DEV — app.isPackaged is false when running electron . from source; do not use NODE_ENV to distinguish dev from production in Electron
export const IS_DEV = !app.isPackaged;

export function resolveDataDir(userDataDir: string): string {
	return path.join(userDataDir, "hyperidle-pg");
}

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

// @lore: checkSingleInstanceLock — must be called BEFORE app.whenReady(); a second instance starts initialization before quitting otherwise
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

let logRotator: LogRotator | null = null;
let serverHandle: ServerHandleLike | null = null;

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

// @lore: isEntrypoint — process.versions.electron exists in Electron but not Vitest/Node; guards against boot side-effects when tests import this module
/* c8 ignore start */
const isEntrypoint = "electron" in process.versions;

if (isEntrypoint) {
	// Single-instance lock must run before app.whenReady()
	if (!checkSingleInstanceLock()) {
		// nothing
	} else {
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

interface BootContext {
	userDataDir: string;
	logDir: string;
	configPath: string;
	credentialsPath: string;
}

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
			// @lore: PGlite — throws "database is locked" or Postgres error code 55P03 when another process holds the data directory
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

	// Apply factory bootstrap after migrations — idempotent; system actor row must exist before first request
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

	// @lore: backgroundColor — must stay in sync with --surface-container (#242418); mismatch causes flash of wrong color before app shell paints
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

	if (IS_DEV) {
		mainWindow.webContents.openDevTools({ mode: "detach" });
	}

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

async function bootSharedMode(ctx: BootContext, serverUrl: string): Promise<void> {
	const clientConfig = loadClientConfig(ctx.configPath);
	const windowState = clientConfig.windowState;
	const preloadPath = path.join(Dirname, "preload.js");

	// @lore: backgroundColor — must stay in sync with --surface-container (#242418); mismatch causes flash of wrong color before app shell paints
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

	let workerClient: RemoteWorkerClient | null = null;
	const workerIpcChannels = [
		"worker:enable",
		"worker:disable",
		"worker:pause",
		"worker:resume",
		"worker:status",
	] as const;

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

	migrateWindowState(windowStatePath, configPath);

	const clientConfig = loadClientConfig(configPath);
	log("startApp config", { backendMode: clientConfig.backendMode ?? "local (default)" });
	const ctx: BootContext = { userDataDir, logDir, configPath, credentialsPath };

	if (clientConfig.backendMode === "shared") {
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
		const apiKey = readOrGenerateApiKey(secretsPath);
		log("startApp booting local mode");
		await bootLocalMode(ctx, apiKey);
	}
}
