import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("__HYPERIDLE__", {
	apiKey: process.argv.find((a: string) => a.startsWith("--api-key="))?.split("=")[1] ?? "",
	platform: "electron" as const,
	backendMode: (process.argv.find((a: string) => a.startsWith("--backend-mode="))?.split("=")[1] ??
		null) as "local" | "shared" | null,
	credentials: {
		set: (name: string, value: string): Promise<{ stored: boolean; warning?: string }> =>
			ipcRenderer.invoke("credentials:set", name, value),
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
