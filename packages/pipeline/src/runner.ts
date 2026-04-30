import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { query } from "@anthropic-ai/claude-agent-sdk";

type SystemMessage = Extract<SDKMessage, { type: "system" }>;
type ResultMessage = Extract<SDKMessage, { type: "result" }>;

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
	groupName: string;
	storyId: string;
	cwd: string;
	interactive: boolean;
	abortController?: AbortController;
	onOutput?: (text: string) => void;
}

const IN_DOCKER = process.env.HYPERIDLE_DOCKER === "1";

function handleSystemMessage(groupName: string, sys: SystemMessage): void {
	const TRACKED_SUBTYPES = new Set([
		"task_started",
		"task_progress",
		"task_notification",
		"init",
		"status",
	]);

	if (!TRACKED_SUBTYPES.has(sys.subtype)) {
		// Generic system events (compact, status, etc.) — surface what we have.
		// Use `in` checks so we only read fields the variant actually carries.
		const status = "status" in sys ? sys.status : undefined;
		const compact = "compact_result" in sys ? sys.compact_result : undefined;
		const message = "message" in sys ? sys.message : undefined;
		appendOutput(groupName, `[system:${sys.subtype}] ${status ?? compact ?? message ?? ""}`);
	}

	if (sys.subtype === "task_started") {
		appendOutput(groupName, `>>> AGENT STARTED: ${sys.description}`);
		updateSubAgent(groupName, {
			taskId: sys.task_id,
			description: sys.description,
			status: "running",
		});
	} else if (sys.subtype === "task_progress") {
		updateSubAgent(groupName, {
			taskId: sys.task_id,
			description: sys.description,
			status: "running",
			lastTool: sys.last_tool_name,
			tokenCount: sys.usage?.total_tokens,
			toolUses: sys.usage?.tool_uses,
		});
	} else if (sys.subtype === "task_notification") {
		const icon = sys.status === "completed" ? "<<<" : "<!>";
		const dur = sys.usage?.duration_ms ? ` (${Math.round(sys.usage.duration_ms / 1000)}s)` : "";
		appendOutput(groupName, `${icon} AGENT ${sys.status.toUpperCase()}${dur}: ${sys.summary}`);
		updateSubAgent(groupName, {
			taskId: sys.task_id,
			description: sys.summary,
			status: sys.status === "completed" ? "completed" : "failed",
		});
	}
}

function handleResultMessage(groupName: string, storyId: string, resultMsg: ResultMessage): void {
	appendOutput(
		groupName,
		`[RESULT] ${resultMsg.subtype} | turns: ${resultMsg.num_turns} | stop: ${resultMsg.stop_reason ?? "none"} | terminal: ${resultMsg.terminal_reason ?? "none"}`,
	);
	if (resultMsg.permission_denials && resultMsg.permission_denials.length > 0) {
		appendOutput(
			groupName,
			`[RESULT] Permission denials (${resultMsg.permission_denials.length}): ${JSON.stringify(resultMsg.permission_denials)}`,
		);
	}
	if (resultMsg.subtype !== "success") {
		appendOutput(storyId, `[RESULT] Error: ${resultMsg.errors.join("; ")}`);
	}
}

export async function runStory(options: RunOptions): Promise<RunResult> {
	const { groupName, storyId, cwd, abortController } = options;
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
								groupName,
								`[PERMISSION] Requesting: ${toolName}(${JSON.stringify(input).slice(0, 100)})`,
							);

							if (!options.interactive) {
								appendOutput(groupName, `[PERMISSION] DENIED (auto mode): ${toolName}`);
								return { behavior: "deny", message: "Denied by pipeline auto mode" } as never;
							}

							return new Promise((resolve) => {
								const id = `${groupName}-${Date.now()}`;
								addApproval({
									id,
									storyId: groupName,
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
							appendOutput(groupName, text);
						}
					}

					const toolUses =
						message.message?.content?.filter((c: { type: string }) => c.type === "tool_use") ?? [];
					for (const tu of toolUses) {
						const t = tu as { type: string; id: string; name: string };
						updateToolCall(groupName, {
							id: t.id,
							name: t.name,
							status: "running",
							elapsed: 0,
						});
					}
					break;
				}

				case "tool_progress": {
					updateToolCall(groupName, {
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
						completeToolCall(groupName, id);
					}
					appendOutput(groupName, message.summary);
					break;
				}

				case "system": {
					handleSystemMessage(groupName, message);
					break;
				}

				case "result": {
					sessionId = message.session_id;
					handleResultMessage(groupName, storyId, message);
					if (message.subtype === "success") {
						return { success: true, sessionId, durationMs: Date.now() - startTime, error: null };
					}
					return {
						success: false,
						sessionId,
						durationMs: Date.now() - startTime,
						error: message.errors.join("; "),
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
		appendOutput(groupName, `ERROR: ${errorMsg}`);
		return {
			success: false,
			sessionId,
			durationMs: Date.now() - startTime,
			error: errorMsg,
		};
	}
}
