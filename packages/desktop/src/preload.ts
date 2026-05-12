/**
 * Preload script — exposes window.__HYPERIDLE__ via contextBridge.
 *
 * IMPORTANT: This file uses require() for Electron modules (NOT import).
 * Sandboxed Electron preloads run in a restricted CJS context.
 * See architecture.md §4 for the full rationale.
 *
 * N4 stub — implementation pending.
 */

// @lore N4: preload uses CJS require() for Electron modules, not ESM import.
// Sandboxed preloads (sandbox: true) do not go through Node's ESM loader.
// NODE_OPTIONS='--import tsx' applies only to the main process, not preload.

// biome-ignore lint/suspicious/noExplicitAny: CJS interop in sandboxed preload
const { contextBridge, ipcRenderer } = require("electron") as any;

contextBridge.exposeInMainWorld("__HYPERIDLE__", {
	apiKey: process.argv.find((a: string) => a.startsWith("--api-key="))?.split("=")[1] ?? "",
	platform: "electron" as const,
	credentials: {
		list: (): Promise<string[]> => ipcRenderer.invoke("credentials:list"),
		get: (name: string): Promise<string | null> => ipcRenderer.invoke("credentials:get", name),
		set: (name: string, value: string): Promise<{ stored: boolean; warning?: string }> =>
			ipcRenderer.invoke("credentials:set", name, value),
		delete: (name: string): Promise<void> => ipcRenderer.invoke("credentials:delete", name),
		isEncryptionAvailable: (): Promise<boolean> =>
			ipcRenderer.invoke("credentials:encryption-available"),
	},
	shell: {
		openLogs: (): Promise<void> => ipcRenderer.invoke("shell:open-logs"),
		openData: (): Promise<void> => ipcRenderer.invoke("shell:open-data"),
	},
	onOpenSettings: (callback: () => void): (() => void) => {
		ipcRenderer.on("open-settings", callback);
		return () => ipcRenderer.removeListener("open-settings", callback);
	},
});
