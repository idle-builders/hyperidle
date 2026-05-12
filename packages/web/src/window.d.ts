/**
 * TypeScript declarations for window.__HYPERIDLE__ — the contextBridge API
 * exposed by the Electron preload script.
 *
 * When running in a browser (non-Electron), window.__HYPERIDLE__ is undefined.
 */

interface HyperIdleElectronBridge {
	apiKey: string;
	platform: "electron";
	credentials: {
		list(): Promise<string[]>;
		get(name: string): Promise<string | null>;
		set(name: string, value: string): Promise<{ stored: boolean; warning?: string }>;
		delete(name: string): Promise<void>;
		isEncryptionAvailable(): Promise<boolean>;
	};
	shell: {
		openLogs(): Promise<void>;
		openData(): Promise<void>;
	};
	/** Subscribe to the Settings open event from the application menu. Returns a disposer. */
	onOpenSettings(callback: () => void): () => void;
}

interface Window {
	__HYPERIDLE__?: HyperIdleElectronBridge;
}
