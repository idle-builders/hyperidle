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
