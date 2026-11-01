import { contextBridge, type IpcRendererEvent, ipcRenderer } from "electron";

type SpeechText = { kind: "partial" | "final"; text: string } | { kind: "error"; message: string };

let onSpeech: ((_event: IpcRendererEvent, text: SpeechText) => void) | null = null;

contextBridge.exposeInMainWorld("__HYPERIDLE__", {
	apiKey: process.argv.find((a: string) => a.startsWith("--api-key="))?.split("=")[1] ?? "",
	credentials: {
		set: (name: string, value: string): Promise<{ stored: boolean; warning?: string }> =>
			ipcRenderer.invoke("credentials:set", name, value),
	},
	/** Reopen the app on a team's server; the key is stored first, through `credentials`. */
	join: (address: string): Promise<{ ok: boolean; problem?: string }> =>
		ipcRenderer.invoke("backend:join", address),
	/** Only when the speech helper shipped with this app; the page never sees the IPC event. */
	speech: process.argv.includes("--speech")
		? {
				start: (onText: (text: SpeechText) => void): Promise<void> => {
					if (onSpeech) ipcRenderer.removeListener("speech:text", onSpeech);
					onSpeech = (_event, text) => onText(text);
					ipcRenderer.on("speech:text", onSpeech);
					return ipcRenderer.invoke("speech:start");
				},
				stop: (): Promise<void> => ipcRenderer.invoke("speech:stop"),
			}
		: undefined,
});
