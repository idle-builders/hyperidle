import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("__HYPERIDLE__", {
	apiKey: process.argv.find((a: string) => a.startsWith("--api-key="))?.split("=")[1] ?? "",
	/** Join a team's server as a new person; on success the app reopens there as them. */
	join: (form: {
		address: string;
		teamKey: string;
		email: string;
		name: string;
		team?: string;
	}): Promise<{ ok: boolean; problem?: string; needsTeam?: boolean }> =>
		ipcRenderer.invoke("backend:join", form),
});
