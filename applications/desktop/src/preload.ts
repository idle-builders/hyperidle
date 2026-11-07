import { contextBridge, type IpcRendererEvent, ipcRenderer } from "electron";

type SpeechText = { kind: "partial" | "final"; text: string } | { kind: "error"; message: string };

let onSpeech: ((_event: IpcRendererEvent, text: SpeechText) => void) | null = null;

contextBridge.exposeInMainWorld("__HYPERIDLE__", {
	apiKey: process.argv.find((a: string) => a.startsWith("--api-key="))?.split("=")[1] ?? "",
	/** Sign in to a team's server and join it; on success the app reopens there as them. */
	join: (form: {
		address: string;
		team?: string;
	}): Promise<{ ok: boolean; problem?: string; needsTeam?: boolean; cancelled?: boolean }> =>
		ipcRenderer.invoke("backend:join", form),
	/** Stops a sign-in that is still waiting for the browser. */
	cancelJoin: (): Promise<void> => ipcRenderer.invoke("backend:cancel-join"),
	/** The local runner: query which agents it holds and adopt one to this computer. */
	runner: {
		state: (agentId: string): Promise<{ held: boolean; movedAway: boolean } | null> =>
			ipcRenderer.invoke("runner:state", agentId),
		moveHere: (agentId: string): Promise<void> => ipcRenderer.invoke("runner:move-here", agentId),
	},
	/** Only when the speech helper shipped with this app; the page never sees the IPC event. */
	speech: process.argv.includes("--speech")
		? {
				start: (
					onText: (text: SpeechText) => void,
					opts?: { utterances?: boolean },
				): Promise<void> => {
					if (onSpeech) ipcRenderer.removeListener("speech:text", onSpeech);
					onSpeech = (_event, text) => onText(text);
					ipcRenderer.on("speech:text", onSpeech);
					return ipcRenderer.invoke("speech:start", opts);
				},
				stop: (): Promise<void> => ipcRenderer.invoke("speech:stop"),
				audio: (samples: Float32Array): void => ipcRenderer.send("speech:audio", samples),
			}
		: undefined,
});
