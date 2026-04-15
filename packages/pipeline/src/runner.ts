import { query } from "@anthropic-ai/claude-agent-sdk";
import type { AgentStatus } from "./types.js";

export interface RunResult {
	success: boolean;
	sessionId: string | null;
	cost: number;
	durationMs: number;
	error: string | null;
	output: string;
}

export interface RunOptions {
	storyId: string;
	cwd: string;
	interactive: boolean;
	onStatus?: (status: AgentStatus) => void;
	onOutput?: (storyId: string, text: string) => void;
	abortController?: AbortController;
}

export async function runStory(options: RunOptions): Promise<RunResult> {
	const { storyId, cwd, onOutput, abortController } = options;
	const startTime = Date.now();
	let sessionId: string | null = null;
	let totalCost = 0;
	const outputChunks: string[] = [];

	try {
		const q = query({
			prompt: `/pipeline ${storyId}`,
			options: {
				cwd,
				permissionMode: options.interactive ? "default" : "auto",
				includePartialMessages: true,
				abortController,
			},
		});

		for await (const message of q) {
			switch (message.type) {
				case "assistant": {
					const text =
						message.message?.content
							?.filter((c: { type: string }) => c.type === "text")
							.map((c: { type: string; text?: string }) => c.text ?? "")
							.join("") ?? "";
					if (text) {
						outputChunks.push(text);
						onOutput?.(storyId, text);
					}
					break;
				}

				case "result": {
					sessionId = message.session_id;
					totalCost = message.total_cost_usd;

					if (message.subtype === "success") {
						return {
							success: true,
							sessionId,
							cost: totalCost,
							durationMs: Date.now() - startTime,
							error: null,
							output: outputChunks.join(""),
						};
					}

					return {
						success: false,
						sessionId,
						cost: totalCost,
						durationMs: Date.now() - startTime,
						error: "result" in message ? String(message.result) : "Unknown error",
						output: outputChunks.join(""),
					};
				}
			}
		}

		return {
			success: false,
			sessionId,
			cost: totalCost,
			durationMs: Date.now() - startTime,
			error: "Session ended without result",
			output: outputChunks.join(""),
		};
	} catch (err) {
		return {
			success: false,
			sessionId,
			cost: totalCost,
			durationMs: Date.now() - startTime,
			error: err instanceof Error ? err.message : String(err),
			output: outputChunks.join(""),
		};
	}
}
