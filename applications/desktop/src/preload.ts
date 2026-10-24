import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("__HYPERIDLE__", {
	apiKey: process.argv.find((a: string) => a.startsWith("--api-key="))?.split("=")[1] ?? "",
	credentials: {
		set: (name: string, value: string): Promise<{ stored: boolean; warning?: string }> =>
			ipcRenderer.invoke("credentials:set", name, value),
	},
	/** Reopen the app on a team's server; the key is stored first, through `credentials`. */
	join: (address: string): Promise<{ ok: boolean; problem?: string }> =>
		ipcRenderer.invoke("backend:join", address),
});
