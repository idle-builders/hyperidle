import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { type Span, SpanStatusCode } from "@opentelemetry/api";

type SystemMessage = Extract<SDKMessage, { type: "system" }>;
type ResultMessage = Extract<SDKMessage, { type: "result" }>;

import {
	type BriefData,
	type MemoryData,
	readMemory,
	setActiveStory,
	writeBrief,
	writeMemory,
} from "./brief.js";
import { getTracer, HYPERIDLE, initOtel, recordSpanError, setSpanAttributes } from "./otel.js";
import { loadAllSkillFrontmatter, type SkillFrontmatter } from "./skill-frontmatter.js";
import {
	addApproval,
	appendOutput,
	completeToolCall,
	removeApproval,
	updateSubAgent,
	updateToolCall,
} from "./store.js";

initOtel();

let skillFrontmatterCache: Map<string, SkillFrontmatter> | null = null;

function findSkillsRoot(): string | null {
	let dir = dirname(fileURLToPath(import.meta.url));
	for (let i = 0; i < 8; i++) {
		const candidate = join(dir, ".claude", "skills");
		if (existsSync(candidate)) return candidate;
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return null;
}

function skillFrontmatter(name: string): SkillFrontmatter | undefined {
	if (!skillFrontmatterCache) {
		try {
			const root = findSkillsRoot();
			skillFrontmatterCache = root ? loadAllSkillFrontmatter(root) : new Map();
		} catch {
			skillFrontmatterCache = new Map();
		}
	}
	return skillFrontmatterCache.get(name);
}

function inferSkillName(text: string | undefined): string | undefined {
	if (!text) return undefined;
	const slash = text.match(/\/([a-z][a-z0-9-]*)/);
	if (slash) return slash[1];
	const word = text.match(/^([a-z][a-z0-9-]*)/);
	return word ? word[1] : undefined;
}

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

export function inferSkillNameForTesting(text: string | undefined): string | undefined {
	return inferSkillName(text);
}

export function handleSystemMessage(
	groupName: string,
	storyId: string,
	sys: SystemMessage,
	taskSpans: Map<string, Span>,
	cwd?: string,
	taskPersonas?: Map<string, string>,
): void {
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
		const skillName = inferSkillName(sys.description);
		const fm = skillName ? skillFrontmatter(skillName) : undefined;
		const taskSpan = getTracer().startSpan("hyperidle.persona");
		setSpanAttributes(taskSpan, {
			[HYPERIDLE.storyId]: storyId,
			[HYPERIDLE.persona]: skillName ?? sys.description,
			[HYPERIDLE.taskDescription]: sys.description,
			[HYPERIDLE.taskType]: sys.task_type,
			[HYPERIDLE.taskWorkflow]: sys.workflow_name,
			[HYPERIDLE.toolCallsMinimumEstimate]: fm?.minToolCalls,
		});
		taskSpans.set(sys.task_id, taskSpan);
		taskPersonas?.set(sys.task_id, skillName ?? sys.description);
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
		const taskSpan = taskSpans.get(sys.task_id);
		if (taskSpan) {
			setSpanAttributes(taskSpan, {
				[HYPERIDLE.totalTokens]: sys.usage?.total_tokens,
				[HYPERIDLE.toolCallsActual]: sys.usage?.tool_uses,
				[HYPERIDLE.durationMs]: sys.usage?.duration_ms,
			});
			if (sys.status !== "completed") {
				taskSpan.setStatus({
					code: SpanStatusCode.ERROR,
					message: `task ${sys.status}`,
				});
			}
			taskSpan.end();
			taskSpans.delete(sys.task_id);
		}
		if (cwd) {
			const fromPersona =
				taskPersonas?.get(sys.task_id) ?? inferSkillName(sys.summary) ?? "unknown";
			taskPersonas?.delete(sys.task_id);
			persistHandoverBrief(cwd, storyId, {
				fromPersona,
				toPersona: "",
				priorScore: null,
				targetFiles: [],
				openIssues: [],
				ledgerEntry: sys.summary ?? "",
				artifactPaths: [],
			});
		}
	}
}

/**
 * Prime the runner-owned durable state surface for `storyId` in `cwd`. Sets
 * the active-story pointer the SessionStart hook reads, and writes a minimal
 * memory stub if none exists (so the hook always has something to inject).
 * Returns whether memory existed at session start — recorded as
 * `hyperidle.brief.injected` for A/B comparison.
 */
function primeStoryState(cwd: string, storyId: string): boolean {
	try {
		setActiveStory(cwd, storyId);
	} catch {
		return false;
	}
	const existing = readMemory(cwd, storyId);
	if (existing) return true;
	const stub: MemoryData = {
		story: { id: storyId, spec: { headline: "", acs: [] } },
		plan: { locked: false, summary: "", routes: [], targetFiles: [] },
		openIssues: [],
		priorPersona: { headline: "" },
	};
	try {
		writeMemory(cwd, storyId, stub);
		return true;
	} catch {
		return false;
	}
}

function persistHandoverBrief(cwd: string, storyId: string, data: BriefData): void {
	try {
		writeBrief(cwd, storyId, data);
	} catch (err) {
		// @lore Brief write must never abort the run — the SessionStart hook
		// degrades gracefully when the brief is missing (emits empty context).
		const message = err instanceof Error ? err.message : String(err);
		appendOutput(storyId, `[brief] write failed: ${message}`);
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
	const storySpan = getTracer().startSpan("hyperidle.story");
	const pipelineFm = skillFrontmatter("pipeline");
	const briefInjected = primeStoryState(cwd, storyId);
	setSpanAttributes(storySpan, {
		[HYPERIDLE.storyId]: storyId,
		[HYPERIDLE.persona]: "pipeline",
		[HYPERIDLE.toolCallsMinimumEstimate]: pipelineFm?.minToolCalls,
		[HYPERIDLE.briefInjected]: briefInjected,
	});
	const taskSpans = new Map<string, Span>();
	const taskPersonas = new Map<string, string>();
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
					handleSystemMessage(groupName, storyId, message, taskSpans, cwd, taskPersonas);
					break;
				}

				case "result": {
					sessionId = message.session_id;
					handleResultMessage(groupName, storyId, message);
					setSpanAttributes(storySpan, {
						[HYPERIDLE.iteration]: message.num_turns,
						[HYPERIDLE.durationMs]: Date.now() - startTime,
					});
					if (message.subtype === "success") {
						storySpan.end();
						endLingeringTaskSpans(taskSpans);
						return { success: true, sessionId, durationMs: Date.now() - startTime, error: null };
					}
					storySpan.setStatus({
						code: SpanStatusCode.ERROR,
						message: message.errors.join("; "),
					});
					storySpan.end();
					endLingeringTaskSpans(taskSpans);
					return {
						success: false,
						sessionId,
						durationMs: Date.now() - startTime,
						error: message.errors.join("; "),
					};
				}
			}
		}

		storySpan.setStatus({
			code: SpanStatusCode.ERROR,
			message: "Session ended without result",
		});
		storySpan.end();
		endLingeringTaskSpans(taskSpans);
		return {
			success: false,
			sessionId,
			durationMs: Date.now() - startTime,
			error: "Session ended without result",
		};
	} catch (err) {
		const errorMsg = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
		appendOutput(groupName, `ERROR: ${errorMsg}`);
		recordSpanError(storySpan, err);
		storySpan.end();
		endLingeringTaskSpans(taskSpans);
		return {
			success: false,
			sessionId,
			durationMs: Date.now() - startTime,
			error: errorMsg,
		};
	}
}

function endLingeringTaskSpans(taskSpans: Map<string, Span>): void {
	for (const span of taskSpans.values()) {
		span.setStatus({ code: SpanStatusCode.ERROR, message: "task ended without notification" });
		span.end();
	}
	taskSpans.clear();
}
