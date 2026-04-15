import { query } from "@anthropic-ai/claude-agent-sdk";
import { addApproval, appendOutput, removeApproval } from "./store.js";

export interface RunResult {
	success: boolean;
	sessionId: string | null;
	cost: number;
	durationMs: number;
	error: string | null;
}

export interface RunOptions {
	storyId: string;
	cwd: string;
	interactive: boolean;
	abortController?: AbortController;
	onOutput?: (text: string) => void;
}

export async function runStory(options: RunOptions): Promise<RunResult> {
	const { storyId, cwd, abortController } = options;
	const startTime = Date.now();
	let sessionId: string | null = null;
	let totalCost = 0;

	try {
		const q = query({
			prompt: `/pipeline ${storyId}`,
			options: {
				cwd,
				permissionMode: options.interactive ? "default" : "auto",
				includePartialMessages: true,
				abortController,
				canUseTool: options.interactive
					? async (toolName, input) => {
							return new Promise((resolve) => {
								const id = `${storyId}-${Date.now()}`;
								addApproval({
									id,
									storyId,
									toolName,
									input: JSON.stringify(input).slice(0, 200),
									resolve: (allowed) => {
										removeApproval(id);
										resolve({ behavior: allowed ? "allow" : "deny" } as never);
									},
								});
							});
						}
					: undefined,
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
						if (options.onOutput) {
							options.onOutput(text);
						} else {
							appendOutput(storyId, text);
						}
					}
					break;
				}

				case "result": {
					sessionId = message.session_id;
					totalCost = message.total_cost_usd;

					return {
						success: message.subtype === "success",
						sessionId,
						cost: totalCost,
						durationMs: Date.now() - startTime,
						error: message.subtype === "success" ? null : String(message.result),
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
		};
	} catch (err) {
		const errorMsg = err instanceof Error ? err.message : String(err);
		appendOutput(storyId, `ERROR: ${errorMsg}`);
		return {
			success: false,
			sessionId,
			cost: totalCost,
			durationMs: Date.now() - startTime,
			error: errorMsg,
		};
	}
}
