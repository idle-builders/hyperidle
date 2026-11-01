import { type ChildProcess, spawn } from "node:child_process";
import * as readline from "node:readline";
import { ipcMain, type WebContents } from "electron";

/** One line from the speech helper (`native/speech/main.swift`). */
type SpeechText = { kind: "partial" | "final"; text: string } | { kind: "error"; message: string };

/**
 * The record button's main-process side: `speech:start` runs the helper for the window that
 * asked, its lines come back on `speech:text`, and `speech:stop` closes its stdin so it writes
 * the last words and exits. One recording at a time.
 */
export function registerSpeechHandlers(helperPath: string): void {
	let helper: ChildProcess | null = null;

	ipcMain.handle("speech:start", (event: { sender: WebContents }) => {
		helper?.kill();
		const sender = event.sender;
		const send = (text: SpeechText) => {
			if (!sender.isDestroyed()) sender.send("speech:text", text);
		};
		const child = spawn(helperPath, [], { stdio: ["pipe", "pipe", "ignore"] });
		helper = child;
		let ended = false;
		readline.createInterface({ input: child.stdout }).on("line", (line) => {
			const text = JSON.parse(line) as SpeechText;
			if (text.kind !== "partial") ended = true;
			send(text);
		});
		child.on("error", (err) => {
			ended = true;
			send({ kind: "error", message: `The speech helper could not start: ${err.message}` });
		});
		child.on("close", () => {
			if (helper === child) helper = null;
			if (!ended) send({ kind: "error", message: "The speech helper stopped unexpectedly." });
		});
	});

	ipcMain.handle("speech:stop", () => {
		helper?.stdin?.end();
	});
}
