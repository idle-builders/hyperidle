/**
 * Preload script — exposes window.__HYPERIDLE__ via contextBridge.
 *
 * @lore N4: Sandboxed preloads (sandbox: true) run in a restricted CJS
 * context at runtime. In dev mode tsx handles the TS→JS transform; in
 * production esbuild compiles this to CJS with `electron` as external
 * (producing `require("electron")`). Using static `import` in source
 * gives us full type checking while the toolchain handles the CJS output.
 */

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("__HYPERIDLE__", {
	apiKey: process.argv.find((a: string) => a.startsWith("--api-key="))?.split("=")[1] ?? "",
	platform: "electron" as const,
	// S4: backend mode is passed from main process via additionalArguments
	backendMode: (process.argv.find((a: string) => a.startsWith("--backend-mode="))?.split("=")[1] ??
		null) as "local" | "shared" | null,
	credentials: {
		list: (): Promise<string[]> => ipcRenderer.invoke("credentials:list"),
		get: (name: string): Promise<string | null> => ipcRenderer.invoke("credentials:get", name),
		set: (name: string, value: string): Promise<{ stored: boolean; warning?: string }> =>
			ipcRenderer.invoke("credentials:set", name, value),
		delete: (name: string): Promise<void> => ipcRenderer.invoke("credentials:delete", name),
		isEncryptionAvailable: (): Promise<boolean> =>
			ipcRenderer.invoke("credentials:encryption-available"),
		status: (): Promise<Record<string, string>> => ipcRenderer.invoke("credentials:status"),
		validate: (name: string): Promise<{ valid: boolean; error?: string }> =>
			ipcRenderer.invoke("credentials:validate", name),
	},
	shell: {
		openLogs: (): Promise<void> => ipcRenderer.invoke("shell:open-logs"),
		openData: (): Promise<void> => ipcRenderer.invoke("shell:open-data"),
		selectFolder: (): Promise<string | null> => ipcRenderer.invoke("shell:select-folder"),
	},
	onOpenSettings: (callback: () => void): (() => void) => {
		ipcRenderer.on("open-settings", callback);
		return () => ipcRenderer.removeListener("open-settings", callback);
	},
	// S4: Worker IPC bridge — only functional in shared-mode Electron
	worker: {
		enable: (maxConcurrent: number): Promise<void> =>
			ipcRenderer.invoke("worker:enable", maxConcurrent),
		disable: (): Promise<void> => ipcRenderer.invoke("worker:disable"),
		pause: (): Promise<void> => ipcRenderer.invoke("worker:pause"),
		resume: (): Promise<void> => ipcRenderer.invoke("worker:resume"),
		status: (): Promise<unknown> => ipcRenderer.invoke("worker:status"),
		onStatusChange: (callback: (status: unknown) => void): (() => void) => {
			const handler = (_event: unknown, s: unknown): void => callback(s);
			ipcRenderer.on("worker:status-changed", handler);
			return () => ipcRenderer.removeListener("worker:status-changed", handler);
		},
	},
});
