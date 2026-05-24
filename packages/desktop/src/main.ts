/**
 * Electron main process entry point.
 *
 * Implements the full startup sequence from architecture.md §3:
 * single-instance lock → paths → API key → log rotation → migrations →
 * env vars → server → health check → BrowserWindow → IPC handlers → menu
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from "electron";

// @lore N5: CJS output (esbuild) has __dirname; ESM (dev/tsx) has import.meta.url.
const Dirname =
	typeof __dirname === "string" ? __dirname : path.dirname(fileURLToPath(import.meta.url));

import { buildAppMenuTemplate } from "./app-menu.js";
import { getPort, startServer, waitForHealth } from "./boot-server.js";
import type { LogRotator } from "./log-rotation.js";
import { createLogRotator } from "./log-rotation.js";
import { resolveMigrationsFolder, runMigrations } from "./migrate.js";
import { createSafeCredentialsManager } from "./safe-credentials.js";
import { loadWindowState, saveWindowState } from "./window-state.js";

// @lore N4: IS_DEV uses app.isPackaged which is false when running `electron .`
// from source and true in the packaged .app bundle. This is the correct way
// to distinguish dev from production in Electron — not NODE_ENV.
export const IS_DEV = !app.isPackaged;

// ---------------------------------------------------------------------------
// Exported helper functions for testability
// ---------------------------------------------------------------------------

/**
 * Resolve the path to the SQLite database file.
 * Lives at userData + '/hyperidle.db'.
 */
export function resolveDbPath(userDataDir: string): string {
	return path.join(userDataDir, "hyperidle.db");
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
	readonly dispose: () => void;
}

/**
 * Build the before-quit handler that shuts down server and log rotation.
 * Exported for unit testing.
 */
export function getBeforeQuitHandler(
	serverHandle: ServerHandleLike | null,
	logRotator: LogRotator | null,
): () => void {
	return (): void => {
		if (serverHandle) {
			serverHandle.dispose();
		}
		if (logRotator) {
			logRotator.detach();
		}
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

async function startApp(): Promise<void> {
	await app.whenReady();

	// Resolve paths
	const userDataDir = app.getPath("userData");
	const dbPath = resolveDbPath(userDataDir);
	const logDir = app.getPath("logs");
	const secretsPath = path.join(userDataDir, "secrets.json");
	const windowStatePath = path.join(userDataDir, "window-state.json");

	// Initialize log rotation early so server output is captured from the start
	fs.mkdirSync(logDir, { recursive: true });
	logRotator = createLogRotator(logDir);
	logRotator.attach();

	// Read or generate API key
	const apiKey = readOrGenerateApiKey(secretsPath);

	// Resolve migrations folder
	const migrationsFolder = resolveMigrationsFolder();

	// Run migrations with SQLITE_BUSY retry loop (architecture §13.1)
	let migrated = false;
	while (!migrated) {
		try {
			runMigrations(dbPath, migrationsFolder);
			migrated = true;
		} catch (err) {
			const nodeErr = err as NodeJS.ErrnoException;
			if (nodeErr.code === "SQLITE_BUSY") {
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
					return;
				}
				// Loop back to retry
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
				return;
			} else {
				await showStartupError(
					"Database migration failed.",
					`${(err as Error).message}\n\nYour data is safe.`,
					logDir,
					dbPath,
				);
				return;
			}
		}
	}

	// Set environment variables before calling createServer
	process.env.DATABASE_URL = dbPath;
	process.env.HYPERIDLE_API_KEY = apiKey;
	if (!IS_DEV) {
		process.env.NODE_ENV = "production";
		const staticDir = path.join(process.resourcesPath ?? "", "web-dist");
		if (fs.existsSync(path.join(staticDir, "index.html"))) {
			process.env.HYPERIDLE_STATIC_DIR = staticDir;
		}
	}

	// In dev mode, bind to port 3001 so Vite proxy target works
	// (Vite proxies /api/* to http://localhost:3001)
	if (IS_DEV) {
		process.env.PORT = "3001";
	}

	// Start the server
	let handle: ReturnType<typeof startServer>;
	try {
		handle = startServer();
	} catch (err) {
		await showStartupError("Server failed to start.", (err as Error).message, logDir);
		return;
	}
	serverHandle = handle;

	// Extract assigned port
	const port = getPort(handle);

	// Load window state
	const { screen } = await import("electron");
	const primaryDisplay = screen.getPrimaryDisplay();
	const displayBounds = primaryDisplay.bounds;
	const windowState = loadWindowState(windowStatePath, displayBounds);

	// Create the BrowserWindow
	const preloadPath = path.join(Dirname, "preload.js");
	const mainWindow = new BrowserWindow({
		x: windowState.x,
		y: windowState.y,
		width: windowState.width,
		height: windowState.height,
		backgroundColor: "#1a1a2e",
		webPreferences: {
			preload: preloadPath,
			contextIsolation: true,
			sandbox: true,
			additionalArguments: [`--api-key=${apiKey}`],
		},
		show: false,
	});

	// Show splash first
	const splashPath = path.join(Dirname, "splash.html");
	mainWindow.loadFile(splashPath);
	mainWindow.show();

	if (windowState.isMaximized) {
		mainWindow.maximize();
	}
	if (windowState.isFullScreen) {
		mainWindow.setFullScreen(true);
	}

	// Show migration progress if it takes > 2s (already ran, but keep the pattern for future use)
	const migrationTimer = setTimeout(() => {
		if (!mainWindow.isDestroyed()) {
			void mainWindow.webContents.executeJavaScript(
				'window.showMigrationStatus && window.showMigrationStatus("Running database migrations...")',
			);
		}
	}, 2000);
	clearTimeout(migrationTimer);

	// Update splash status
	if (!mainWindow.isDestroyed()) {
		void mainWindow.webContents.executeJavaScript(
			'window.updateStatus && window.updateStatus("Starting server...")',
		);
	}

	// Poll health with 30s timeout
	try {
		await waitForHealth(port, 30_000);
	} catch {
		await showStartupError(
			"Server not responding.",
			"The server did not start within 30 seconds.",
			logDir,
		);
		return;
	}

	// Load the app
	const appUrl = IS_DEV ? "http://localhost:5173" : `http://127.0.0.1:${port}`;
	mainWindow.loadURL(appUrl);

	// Persist window state on resize/move/close
	const saveState = (): void => {
		if (!mainWindow.isDestroyed()) {
			const bounds = mainWindow.getBounds();
			saveWindowState(windowStatePath, {
				...bounds,
				isMaximized: mainWindow.isMaximized(),
				isFullScreen: mainWindow.isFullScreen(),
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

	// Register IPC handlers for safeStorage credentials
	const credentialsPath = path.join(userDataDir, "credentials.json");
	const credManager = createSafeCredentialsManager(credentialsPath);
	credManager.registerHandlers();

	// Register shell IPC handlers
	ipcMain.handle("shell:open-logs", async (): Promise<void> => {
		await shell.openPath(logDir);
	});
	ipcMain.handle("shell:open-data", async (): Promise<void> => {
		await shell.openPath(userDataDir);
	});
	ipcMain.handle("shell:select-folder", async (): Promise<string | null> => {
		const result = await dialog.showOpenDialog(mainWindow, {
			properties: ["openDirectory"],
			title: "Select repository folder",
		});
		return result.canceled ? null : (result.filePaths[0] ?? null);
	});

	// Build and set application menu
	const menu = buildAppMenuTemplate({
		isDev: IS_DEV,
		logDir,
		dataDir: userDataDir,
		onOpenSettings: (): void => {
			if (!mainWindow.isDestroyed()) {
				mainWindow.webContents.send("open-settings");
			}
		},
	});
	Menu.setApplicationMenu(menu as unknown as Electron.Menu);

	// Graceful shutdown
	app.on("before-quit", getBeforeQuitHandler(serverHandle, logRotator));

	// macOS: clicking the Dock icon when all windows are closed reopens the window
	app.on("activate", (): void => {
		if (BrowserWindow.getAllWindows().length === 0) {
			// Recreate the window
			void startApp();
		}
	});
}
