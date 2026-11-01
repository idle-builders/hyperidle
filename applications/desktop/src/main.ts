import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
	app,
	BrowserWindow,
	dialog,
	ipcMain,
	Menu,
	nativeImage,
	nativeTheme,
	powerMonitor,
	shell,
	Tray,
} from "electron";

// @lore: Dirname — CJS output (esbuild) has __dirname; ESM (dev/tsx) requires fileURLToPath(import.meta.url)
const Dirname =
	typeof __dirname === "string" ? __dirname : path.dirname(fileURLToPath(import.meta.url));

import { buildAppMenuTemplate } from "./app-menu.js";
import { getPort, startServer, waitForHealth } from "./boot-server.js";
import type { ClientConfig } from "./client-config.js";
import { loadClientConfig, migrateWindowState, saveClientConfig } from "./client-config.js";
import type { LogRotator } from "./log-rotation.js";
import { createLogRotator } from "./log-rotation.js";
import { resolveMigrationsFolder, runMigrations } from "./migrate.js";
import { keepPersonKey, readPersonKey } from "./safe-credentials.js";

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

// @lore: the Paper canvas in core-ui's tokens.css, light or dark like the computer, painted before the page loads.
function paperCanvas(): string {
	return nativeTheme.shouldUseDarkColors ? "#141310" : "#faf8f4";
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

/**
 * The menus say HyperIdle, not the package name. The data and logs folders were named after the
 * package and stay there: renaming the app must not move anyone's database.
 */
export function nameTheApp(): void {
	const userData = app.getPath("userData");
	const logs = app.getPath("logs");
	app.setName("HyperIdle");
	app.setPath("userData", userData);
	app.setPath("logs", logs);
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
// Handler set by bootLocalMode so the second-instance event can reopen the window.
let reopenHandler: (() => void) | null = null;

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

/**
 * Local mode's quit closes the windows and keeps the server and its agents running.
 * A Mac logout or shutdown must go through, or macOS cancels it.
 */
export function makeLocalBeforeQuitHandler(
	onHide: () => void,
	systemShuttingDown: () => boolean,
): (event?: { preventDefault(): void }) => void {
	return (event?: { preventDefault(): void }): void => {
		if (systemShuttingDown()) return;
		event?.preventDefault();
		onHide();
	};
}

/**
 * Returns true when the login item should be registered for the first time.
 * Respects a prior user toggle by checking the saved flag.
 */
export function shouldRegisterLoginItem(
	config: Pick<ClientConfig, "loginItemSet">,
	isPackaged: boolean,
): boolean {
	if (!isPackaged) return false;
	if (config.loginItemSet) return false;
	return true;
}

/**
 * Returns a handler that shows the dock and focuses or recreates the window.
 * createWindow must open a window on the already-running server — never boot a new one.
 */
export function makeReopenWindowHandler(createWindow: () => void): () => void {
	return (): void => {
		app.dock?.show();
		const windows = BrowserWindow.getAllWindows();
		if (windows.length > 0) {
			const win = windows[0];
			if (win && !win.isDestroyed()) {
				if (win.isMinimized()) win.restore();
				win.show();
				win.focus();
				return;
			}
		}
		createWindow();
	};
}

// @lore: isEntrypoint — process.versions.electron exists in Electron but not Vitest/Node; guards against boot side-effects when tests import this module
/* c8 ignore start */
const isEntrypoint = "electron" in process.versions;

if (isEntrypoint) {
	nameTheApp();
	// Single-instance lock must run before app.whenReady()
	if (!checkSingleInstanceLock()) {
		// nothing
	} else {
		app.on("second-instance", (): void => {
			if (reopenHandler) {
				reopenHandler();
				return;
			}
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

function registerCommonIpcHandlers(ctx: BootContext): void {
	// First start's "Join a team on a server": the team key gets this person made on the server,
	// which hands back their own key; that key is kept and the app reopens on the server as them.
	ipcMain.handle(
		"backend:join",
		async (
			_event: unknown,
			form: { address: string; teamKey: string; email: string; name: string; team?: string },
		): Promise<{ ok: boolean; problem?: string; needsTeam?: boolean }> => {
			const trimmed = form.address.trim().replace(/\/$/, "");
			const serverUrl = /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
			if (!URL.canParse(serverUrl)) return { ok: false, problem: "That is not a server address." };
			const res = await fetch(`${serverUrl}/api/join`, {
				method: "POST",
				headers: { "X-API-Key": form.teamKey, "Content-Type": "application/json" },
				body: JSON.stringify({ email: form.email, name: form.name, team: form.team }),
			}).catch(() => null);
			if (!res) return { ok: false, problem: `${serverUrl} did not answer.` };
			if (res.status === 401) return { ok: false, problem: "That team key is not right." };
			const body = (await res.json().catch(() => ({}))) as {
				key?: string;
				error?: string;
				details?: { needsTeam?: boolean };
			};
			if (!body.key) {
				return {
					ok: false,
					problem: body.error ?? "That did not work.",
					...(body.details?.needsTeam ? { needsTeam: true } : {}),
				};
			}
			if (!keepPersonKey(ctx.credentialsPath, body.key))
				return { ok: false, problem: "The keychain is unavailable, so your key cannot be kept." };
			saveClientConfig(ctx.configPath, { backendMode: "shared", serverUrl });
			app.relaunch();
			app.exit(0);
			return { ok: true };
		},
	);
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

async function stopLocalServer(
	handle: ServerHandleLike | null,
	rotator: LogRotator | null,
): Promise<void> {
	rotator?.detach();
	try {
		await handle?.dispose();
	} catch (err) {
		log("stop: server dispose failed", { error: (err as Error).message });
	}
	app.exit(0);
}

function createTrayIcon(): ReturnType<typeof nativeImage.createFromPath> {
	const iconFile = "TrayIconTemplate.png";
	// @lore: tray icon path — packaged app reads from Resources/; dev reads from build/ next to src/
	const iconPath = app.isPackaged
		? path.join(process.resourcesPath ?? "", iconFile)
		: path.resolve(Dirname, "..", "build", iconFile);
	const icon = nativeImage.createFromPath(iconPath);
	icon.setTemplateImage(true);
	return icon;
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
	const port = getPort(handle);
	log("boot:local server listening", { port });

	const preloadPath = path.join(Dirname, "preload.js");
	log("boot:local preload", { preloadPath, exists: fs.existsSync(preloadPath) });
	const appUrl = IS_DEV ? "http://localhost:5173" : `http://127.0.0.1:${port}`;

	// Opened at Mac login: the server starts with no window; the menu bar icon opens one.
	const startedAtLogin = app.isPackaged && app.getLoginItemSettings().wasOpenedAtLogin;

	const newWindow = (): BrowserWindow => {
		const state = loadClientConfig(ctx.configPath).windowState;
		const win = new BrowserWindow({
			x: state.x,
			y: state.y,
			width: state.width,
			height: state.height,
			titleBarStyle: "hiddenInset",
			trafficLightPosition: { x: 12, y: 11 },
			backgroundColor: paperCanvas(),
			webPreferences: {
				preload: preloadPath,
				contextIsolation: true,
				sandbox: true,
				additionalArguments: [`--api-key=${apiKey}`],
			},
			show: false,
		});
		win.show();
		if (state.isMaximized) win.maximize();
		if (state.isFullScreen) win.setFullScreen(true);
		if (IS_DEV) win.webContents.openDevTools({ mode: "detach" });
		win.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
			log("renderer did-fail-load", { errorCode, errorDescription, validatedURL });
		});
		win.webContents.on("render-process-gone", (_event, details) => {
			log("renderer process gone", { reason: details.reason, exitCode: details.exitCode });
		});
		win.webContents.on("console-message", (_event, level, message, line, sourceId) => {
			if (level >= 2) {
				log("renderer console", { level: level === 2 ? "warn" : "error", message, line, sourceId });
			}
		});
		bindWindowStatePersistence(win, ctx.configPath);
		return win;
	};

	// The splash shows while the server warms up, then the same window loads the app.
	const bootWindow = startedAtLogin ? null : newWindow();
	if (bootWindow) {
		bootWindow.loadFile(path.join(Dirname, "splash.html"));
		void bootWindow.webContents.executeJavaScript(
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

	if (bootWindow && !bootWindow.isDestroyed()) {
		log("boot:local loading app", { appUrl });
		bootWindow.loadURL(appUrl);
	}
	if (startedAtLogin) app.dock?.hide();

	const createAppWindow = (): void => {
		newWindow().loadURL(appUrl);
	};

	registerCommonIpcHandlers(ctx);

	const menuTemplate = buildAppMenuTemplate({
		isDev: IS_DEV,
		logDir: ctx.logDir,
		dataDir: ctx.userDataDir,
	});
	Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));

	// Tray icon stays visible the whole time the server runs.
	const trayIcon = createTrayIcon();
	const tray = new Tray(trayIcon);
	tray.setToolTip("HyperIdle");

	const reopen = makeReopenWindowHandler(createAppWindow);
	reopenHandler = reopen;

	const stopServer = (): void => {
		void stopLocalServer(handle, logRotator);
	};

	tray.setContextMenu(
		Menu.buildFromTemplate([
			{ label: "HyperIdle is running", enabled: false },
			{ label: "Open HyperIdle", click: reopen },
			{ type: "separator" },
			{ label: "Stop HyperIdle", click: stopServer },
		]),
	);
	tray.on("double-click", reopen);

	// Cmd+Q hides the dock and closes windows; process keeps running.
	let systemShuttingDown = false;
	app.on(
		"before-quit",
		makeLocalBeforeQuitHandler(
			(): void => {
				for (const win of BrowserWindow.getAllWindows()) win.close();
				app.dock?.hide();
			},
			() => systemShuttingDown,
		),
	);

	app.on("activate", reopen);

	// Electron turns SIGTERM into a quit, which the handler above keeps from ending the server.
	process.on("SIGTERM", stopServer);

	// Logout or shutdown: let the quit through so macOS does not cancel it.
	powerMonitor.on("shutdown", (): void => {
		systemShuttingDown = true;
	});

	// Register as a login item the first time this packaged build starts.
	if (shouldRegisterLoginItem(clientConfig, app.isPackaged)) {
		app.setLoginItemSettings({ openAtLogin: true });
		saveClientConfig(ctx.configPath, { loginItemSet: true });
	}

	log("boot:local complete", { port, appUrl });
}

async function bootSharedMode(ctx: BootContext, serverUrl: string): Promise<void> {
	const clientConfig = loadClientConfig(ctx.configPath);
	const windowState = clientConfig.windowState;
	const preloadPath = path.join(Dirname, "preload.js");

	const mainWindow = new BrowserWindow({
		x: windowState.x,
		y: windowState.y,
		width: windowState.width,
		height: windowState.height,
		titleBarStyle: "hiddenInset",
		trafficLightPosition: { x: 12, y: 11 },
		backgroundColor: paperCanvas(),
		webPreferences: {
			preload: preloadPath,
			contextIsolation: true,
			sandbox: true,
			// The person's own key, handed back at joining: every request is them.
			additionalArguments: [`--api-key=${readPersonKey(ctx.credentialsPath) ?? ""}`],
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

	registerCommonIpcHandlers(ctx);

	const menuTemplate = buildAppMenuTemplate({
		isDev: IS_DEV,
		logDir: ctx.logDir,
		dataDir: ctx.userDataDir,
	});
	Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
	app.on("before-quit", getBeforeQuitHandler(null, logRotator));
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
				`Set serverUrl in ${configPath}, or delete that file to start over on this computer.`,
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
