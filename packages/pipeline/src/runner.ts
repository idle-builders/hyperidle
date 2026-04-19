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
	durationMs: number;
	error: string | null;
}

export interface RunOptions {
	streamName: string;
	storyId: string;
	cwd: string;
	interactive: boolean;
	abortController?: AbortController;
	onOutput?: (text: string) => void;
}

const IN_DOCKER = process.env.HYPERIDLE_DOCKER === "1";

function handleSystemMessage(
	streamName: string,
	sys: { subtype: string; [key: string]: unknown },
): void {
	const TRACKED_SUBTYPES = new Set([
		"task_started",
		"task_progress",
		"task_notification",
		"init",
		"status",
	]);

	if (!TRACKED_SUBTYPES.has(sys.subtype)) {
		appendOutput(
			streamName,
			`[system:${sys.subtype}] ${sys.status ?? sys.compact_result ?? sys.message ?? ""}`,
		);
	}

	if (sys.subtype === "task_started") {
		const ts = sys as {
			// biome-ignore lint/style/useNamingConvention: Claude Agent SDK response
			task_id: string;
			description: string;
			// biome-ignore lint/style/useNamingConvention: Claude Agent SDK response
			task_type?: string;
		};
		appendOutput(streamName, `>>> AGENT STARTED: ${ts.description}`);
		updateSubAgent(streamName, {
			taskId: ts.task_id,
			description: ts.description,
			status: "running",
		});
	} else if (sys.subtype === "task_progress") {
		const tp = sys as {
			// biome-ignore lint/style/useNamingConvention: Claude Agent SDK response
			task_id: string;
			description: string;
			// biome-ignore lint/style/useNamingConvention: Claude Agent SDK response
			last_tool_name?: string;
			// biome-ignore lint/style/useNamingConvention: Claude Agent SDK response
			usage?: { total_tokens: number; tool_uses: number };
		};
		updateSubAgent(streamName, {
			taskId: tp.task_id,
			description: tp.description,
			status: "running",
			lastTool: tp.last_tool_name,
			tokenCount: tp.usage?.total_tokens,
			toolUses: tp.usage?.tool_uses,
		});
	} else if (sys.subtype === "task_notification") {
		const tn = sys as {
			// biome-ignore lint/style/useNamingConvention: Claude Agent SDK response
			task_id: string;
			status: string;
			summary: string;
			// biome-ignore lint/style/useNamingConvention: Claude Agent SDK response
			usage?: { tool_uses: number; duration_ms: number };
		};
		const icon = tn.status === "completed" ? "<<<" : "<!>";
		const dur = tn.usage?.duration_ms ? ` (${Math.round(tn.usage.duration_ms / 1000)}s)` : "";
		appendOutput(streamName, `${icon} AGENT ${tn.status.toUpperCase()}${dur}: ${tn.summary}`);
		updateSubAgent(streamName, {
			taskId: tn.task_id,
			description: tn.summary,
			status: tn.status === "completed" ? "completed" : "failed",
		});
	}
}

interface ResultMessage {
	subtype: string;
	result: string;
	// biome-ignore lint/style/useNamingConvention: Claude Agent SDK response
	num_turns: number;
	// biome-ignore lint/style/useNamingConvention: Claude Agent SDK response
	stop_reason: string | null;
	// biome-ignore lint/style/useNamingConvention: Claude Agent SDK response
	terminal_reason?: string;
	// biome-ignore lint/style/useNamingConvention: Claude Agent SDK response
	permission_denials?: unknown[];
}

function handleResultMessage(streamName: string, storyId: string, resultMsg: ResultMessage): void {
	appendOutput(
		streamName,
		`[RESULT] ${resultMsg.subtype} | turns: ${resultMsg.num_turns} | stop: ${resultMsg.stop_reason ?? "none"} | terminal: ${resultMsg.terminal_reason ?? "none"}`,
	);
	if (resultMsg.permission_denials && resultMsg.permission_denials.length > 0) {
		appendOutput(
			streamName,
			`[RESULT] Permission denials (${resultMsg.permission_denials.length}): ${JSON.stringify(resultMsg.permission_denials)}`,
		);
	}
	if (resultMsg.subtype !== "success") {
		appendOutput(storyId, `[RESULT] Error: ${resultMsg.result}`);
	}
}

export async function runStory(options: RunOptions): Promise<RunResult> {
	const { streamName, storyId, cwd, abortController } = options;
	const startTime = Date.now();
	let sessionId: string | null = null;
	try {
		const q = query({
			prompt: `/pipeline ${storyId}`,
			options: {
				cwd,
				permissionMode: IN_DOCKER ? "bypassPermissions" : "default",
				allowDangerouslySkipPermissions: IN_DOCKER,
				maxTurns: 10000,
				includePartialMessages: true,
				abortController,
				canUseTool: IN_DOCKER
					? undefined
					: async (toolName: string, input: unknown) => {
							appendOutput(
								streamName,
								`[PERMISSION] Requesting: ${toolName}(${JSON.stringify(input).slice(0, 100)})`,
							);

							if (!options.interactive) {
								appendOutput(streamName, `[PERMISSION] DENIED (auto mode): ${toolName}`);
								return { behavior: "deny", message: "Denied by pipeline auto mode" } as never;
							}

							return new Promise((resolve) => {
								const id = `${streamName}-${Date.now()}`;
								addApproval({
									id,
									storyId: streamName,
									toolName,
									input: JSON.stringify(input).slice(0, 200),
									resolve: (allowed) => {
										removeApproval(id);
										resolve({ behavior: allowed ? "allow" : "deny" } as never);
									},
								});
							});
						},
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
							appendOutput(streamName, text);
						}
					}

					const toolUses =
						message.message?.content?.filter((c: { type: string }) => c.type === "tool_use") ?? [];
					for (const tu of toolUses) {
						const t = tu as { type: string; id: string; name: string };
						updateToolCall(streamName, {
							id: t.id,
							name: t.name,
							status: "running",
							elapsed: 0,
						});
					}
					break;
				}

				case "tool_progress": {
					updateToolCall(streamName, {
						id: message.tool_use_id,
						name: message.tool_name,
						status: "running",
						elapsed: message.elapsed_time_seconds,
						parentTaskId: message.task_id,
					});
					break;
				}

				case "tool_use_summary": {
					for (const id of message.preceding_tool_use_ids) {
						completeToolCall(streamName, id);
					}
					appendOutput(streamName, message.summary);
					break;
				}

				case "system": {
					handleSystemMessage(streamName, message as { subtype: string; [key: string]: unknown });
					break;
				}

				case "result": {
					sessionId = message.session_id;
					const resultMsg = message as unknown as ResultMessage;
					handleResultMessage(streamName, storyId, resultMsg);
					return {
						success: resultMsg.subtype === "success",
						sessionId,
						durationMs: Date.now() - startTime,
						error: resultMsg.subtype === "success" ? null : resultMsg.result,
					};
				}
			}
		}

		return {
			success: false,
			sessionId,
			durationMs: Date.now() - startTime,
			error: "Session ended without result",
		};
	} catch (err) {
		const errorMsg = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
		appendOutput(streamName, `ERROR: ${errorMsg}`);
		return {
			success: false,
			sessionId,
			durationMs: Date.now() - startTime,
			error: errorMsg,
		};
	}
}
