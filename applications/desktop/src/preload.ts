import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("__HYPERIDLE__", {
	apiKey: process.argv.find((a: string) => a.startsWith("--api-key="))?.split("=")[1] ?? "",
	/** Sign in to a team's server and join it; on success the app reopens there as them. */
	join: (form: {
		address: string;
		team?: string;
	}): Promise<{ ok: boolean; problem?: string; needsTeam?: boolean }> =>
		ipcRenderer.invoke("backend:join", form),
});
