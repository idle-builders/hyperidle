import { query } from "@anthropic-ai/claude-agent-sdk";
import {
	addApproval,
	appendOutput,
	completeToolCall,
	removeApproval,
	updateSubAgent,
	updateToolCall,
} from "./store.js";

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
					// Extract text content
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

					// Extract tool_use blocks (tool calls starting)
					const toolUses =
						message.message?.content?.filter((c: { type: string }) => c.type === "tool_use") ?? [];
					for (const tu of toolUses) {
						const t = tu as { type: string; id: string; name: string };
						updateToolCall(storyId, {
							id: t.id,
							name: t.name,
							status: "running",
							elapsed: 0,
						});
					}
					break;
				}

				case "tool_progress": {
					updateToolCall(storyId, {
						id: message.tool_use_id,
						name: message.tool_name,
						status: "running",
						elapsed: message.elapsed_time_seconds,
						parentTaskId: message.task_id,
					});
					break;
				}

				case "tool_use_summary": {
					// Mark preceding tools as done
					for (const id of message.preceding_tool_use_ids) {
						completeToolCall(storyId, id);
					}
					appendOutput(storyId, message.summary);
					break;
				}

				case "system": {
					const sys = message as { subtype: string; [key: string]: unknown };

					if (sys.subtype === "task_started") {
						const ts = sys as {
							task_id: string;
							description: string;
							task_type?: string;
						};
						appendOutput(storyId, `>>> AGENT STARTED: ${ts.description}`);
						updateSubAgent(storyId, {
							taskId: ts.task_id,
							description: ts.description,
							status: "running",
						});
					} else if (sys.subtype === "task_progress") {
						const tp = sys as {
							task_id: string;
							description: string;
							last_tool_name?: string;
							usage?: { total_tokens: number; tool_uses: number };
						};
						updateSubAgent(storyId, {
							taskId: tp.task_id,
							description: tp.description,
							status: "running",
							lastTool: tp.last_tool_name,
							tokenCount: tp.usage?.total_tokens,
							toolUses: tp.usage?.tool_uses,
						});
					} else if (sys.subtype === "task_notification") {
						const tn = sys as {
							task_id: string;
							status: string;
							summary: string;
							usage?: { tool_uses: number; duration_ms: number };
						};
						const icon = tn.status === "completed" ? "<<<" : "<!>";
						const dur = tn.usage?.duration_ms
							? ` (${Math.round(tn.usage.duration_ms / 1000)}s)`
							: "";
						appendOutput(storyId, `${icon} AGENT ${tn.status.toUpperCase()}${dur}: ${tn.summary}`);
						updateSubAgent(storyId, {
							taskId: tn.task_id,
							description: tn.summary,
							status: tn.status === "completed" ? "completed" : "failed",
						});
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
