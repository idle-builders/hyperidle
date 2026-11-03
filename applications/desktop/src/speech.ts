import { type ChildProcess, spawn } from "node:child_process";
import * as readline from "node:readline";
import { ipcMain, type WebContents } from "electron";

/** One line from the speech helper (`native/speech/main.swift`). */
type SpeechText = { kind: "partial" | "final"; text: string } | { kind: "error"; message: string };

/**
 * The record button's main-process side: `speech:start` runs the helper for the window that
 * asked, its lines come back on `speech:text`, and `speech:stop` closes its stdin so it writes
 * the last words and exits. One recording at a time. In a huddle the page sends the call's
 * microphone sound on `speech:audio` and the helper reads it from stdin.
 */
export function registerSpeechHandlers(helperPath: string): void {
	let helper: ChildProcess | null = null;
	/** Helpers told to stop; their exit is expected, not a failure. */
	const stopped = new WeakSet<ChildProcess>();
	/** The page that started a huddle helper, the only one whose sound it takes. */
	let huddlePage: WebContents | null = null;

	ipcMain.handle(
		"speech:start",
		(event: { sender: WebContents }, opts?: { utterances?: boolean }) => {
			if (helper) {
				stopped.add(helper);
				helper.kill();
			}
			const sender = event.sender;
			const send = (text: SpeechText) => {
				if (!sender.isDestroyed()) sender.send("speech:text", text);
			};
			const child = spawn(helperPath, opts?.utterances ? ["--utterances"] : [], {
				stdio: ["pipe", "pipe", "ignore"],
			});
			helper = child;
			// The helper can die while sound is still being written to it; its exit says why.
			child.stdin?.on("error", () => undefined);
			huddlePage = opts?.utterances ? sender : null;
			// A page that reloads or closes can no longer stop its helper, so the microphone would stay on.
			const pageGone = () => child.kill();
			sender.once("did-navigate", pageGone);
			sender.once("destroyed", pageGone);
			let ended = false;
			readline.createInterface({ input: child.stdout }).on("line", (line) => {
				const text = JSON.parse(line) as SpeechText;
				if (text.kind === "error") ended = true;
				else if (!opts?.utterances && text.kind === "final") ended = true;
				send(text);
			});
			child.on("error", (err) => {
				ended = true;
				send({ kind: "error", message: `The speech helper could not start: ${err.message}` });
			});
			child.on("close", () => {
				if (helper === child) {
					helper = null;
					huddlePage = null;
				}
				if (!sender.isDestroyed()) {
					sender.off("did-navigate", pageGone);
					sender.off("destroyed", pageGone);
				}
				if (!(ended || stopped.has(child)))
					send({ kind: "error", message: "The speech helper stopped unexpectedly." });
			});
		},
	);

	ipcMain.handle("speech:stop", () => {
		if (helper) stopped.add(helper);
		helper?.stdin?.end();
	});

	ipcMain.on("speech:audio", (event: { sender: WebContents }, samples: Float32Array) => {
		if (event.sender !== huddlePage || !helper?.stdin?.writable) return;
		helper.stdin.write(Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength));
	});
}
