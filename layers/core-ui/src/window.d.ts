/**
 * TypeScript declarations for window.__HYPERIDLE__ — the contextBridge API
 * exposed by the Electron preload script.
 *
 * When running in a browser (non-Electron), window.__HYPERIDLE__ is undefined.
 */

/**
 * S4: Worker status snapshot exposed via IPC bridge.
 * Kept in sync with WorkerStatus in applications/remote-worker/src/remote-worker-client.ts.
 */
interface WorkerStatus {
	enabled: boolean;
	connected: boolean;
	paused: boolean;
	activeSessions: number;
	maxConcurrent: number;
	deviceId: string | null;
	modelProviders: string[];
}

interface HyperIdleElectronBridge {
	apiKey: string;
	platform: "electron";
	/** Backend mode: "local" (embedded server) or "shared" (remote server). */
	backendMode?: "local" | "shared" | null;
	credentials: {
		set(name: string, value: string): Promise<{ stored: boolean; warning?: string }>;
	};
	shell: {
		openLogs(): Promise<void>;
		openData(): Promise<void>;
		selectFolder(): Promise<string | null>;
	};
	/** Subscribe to the Settings open event from the application menu. Returns a disposer. */
	onOpenSettings(callback: () => void): () => void;
	/** S4: Worker registration controls (only available in shared-mode Electron). */
	worker?: {
		enable(maxConcurrent: number): Promise<void>;
		disable(): Promise<void>;
		pause(): Promise<void>;
		resume(): Promise<void>;
		status(): Promise<WorkerStatus>;
		onStatusChange(callback: (status: WorkerStatus) => void): () => void;
	};
}

interface Window {
	__HYPERIDLE__?: HyperIdleElectronBridge;
}
