/**
 * AD8b Task 7 — Assistant tool surface.
 *
 * Exports:
 *   - ToolRiskLevel, AssistantToolDef types
 *   - ASSISTANT_TOOLS: 13-entry catalog with risk classification
 *   - HIGH_RISK_TOOLS: the 4 tools requiring a review-message gate
 *   - toolsForAssistant(): returns ToolDefinition[] for harness provisioning
 *
 * @lore AD8b: The 4 new tools (create_bet, edit_bet, update_task_status,
 * edit_block) use AssistantToolShape (status-discriminated result). The
 * toolsForAssistant() wrapper adapts them to the harness ToolDefinition
 * interface (success-boolean ToolResult).
 */

import { createArtifactTool } from "./create-artifact.js";
import { createBetTool } from "./create-bet.js";
import { createTaskTool } from "./create-task.js";
import { editBetTool } from "./edit-bet.js";
import { editBlockTool } from "./edit-block.js";
import { handoffToTool } from "./handoff-to.js";
import { logTaskTool } from "./log-task.js";
import { queryPracticeTool } from "./query-practice.js";
import { readInboxTool } from "./read-inbox.js";
import { sendMessageTool } from "./send-message.js";
import { submitReviewTool } from "./submit-review.js";
import { type RegisteredTool, toRegistered } from "./tool-registry.js";
import { err, ok } from "./tool-result.js";
import { updateTaskStatusTool } from "./update-task-status.js";
import { writeMemoryTool } from "./write-memory.js";

// Re-export types from assistant-tool-result for consumers.
export type { AssistantToolResult, AssistantToolShape } from "./assistant-tool-result.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ToolRiskLevel = "low" | "medium" | "high";

/**
 * Assembled assistant tool metadata: name + risk classification + description.
 */
export interface AssistantToolDef {
	readonly name: string;
	readonly riskLevel: ToolRiskLevel;
	readonly description: string;
}

// ---------------------------------------------------------------------------
// High-risk tool names (require review-message gate before execution)
// ---------------------------------------------------------------------------

/**
 * AC-4: These 4 tools require human approval via a review message before
 * the assistant executes them. The dispatcher checks this set.
 */
export const HIGH_RISK_TOOLS: readonly string[] = [
	"create_bet",
	"edit_bet",
	"submit_review",
	"handoff_to",
] as const;

// ---------------------------------------------------------------------------
// ASSISTANT_TOOLS catalog (13 entries)
// ---------------------------------------------------------------------------

/**
 * The full set of tools available to the assistant agent, with risk levels.
 *
 * Distribution:
 *   Low (3):    read_inbox, query_practice, log_task
 *   Medium (6): send_message, create_task, update_task_status, write_memory,
 *               create_artifact, edit_block
 *   High (4):   create_bet, edit_bet, submit_review, handoff_to
 */
export const ASSISTANT_TOOLS: readonly AssistantToolDef[] = [
	// Low-risk (read-only / observability)
	{ name: "read_inbox", riskLevel: "low", description: readInboxTool.description },
	{ name: "query_practice", riskLevel: "low", description: queryPracticeTool.description },
	{ name: "log_task", riskLevel: "low", description: logTaskTool.description },

	// Medium-risk (creates/updates within scope)
	{ name: "send_message", riskLevel: "medium", description: sendMessageTool.description },
	{ name: "create_task", riskLevel: "medium", description: createTaskTool.description },
	{
		name: "update_task_status",
		riskLevel: "medium",
		description: updateTaskStatusTool.description,
	},
	{ name: "write_memory", riskLevel: "medium", description: writeMemoryTool.description },
	{ name: "create_artifact", riskLevel: "medium", description: createArtifactTool.description },
	{ name: "edit_block", riskLevel: "medium", description: editBlockTool.description },

	// High-risk (require review-message gate)
	{ name: "create_bet", riskLevel: "high", description: createBetTool.description },
	{ name: "edit_bet", riskLevel: "high", description: editBetTool.description },
	{ name: "submit_review", riskLevel: "high", description: submitReviewTool.description },
	{ name: "handoff_to", riskLevel: "high", description: handoffToTool.description },
];

// ---------------------------------------------------------------------------
// toolsForAssistant() — returns ToolDefinition[] for harness provisioning
// ---------------------------------------------------------------------------

/**
 * Returns all 13 ToolDefinition objects accessible to the assistant.
 * Wraps the 4 new AssistantToolShape tools to satisfy the ToolDefinition
 * interface (success-boolean ToolResult).
 *
 * AC-7: Returns exactly 13 tool definitions.
 */
export function toolsForAssistant(): readonly RegisteredTool[] {
	return [
		toRegistered(readInboxTool),
		toRegistered(queryPracticeTool),
		toRegistered(logTaskTool),
		toRegistered(sendMessageTool),
		toRegistered(createTaskTool),
		toRegistered(writeMemoryTool),
		toRegistered(createArtifactTool),
		toRegistered(submitReviewTool),
		toRegistered(handoffToTool),
		// New assistant-specific tools — wrapped to adapt result type.
		wrapAssistantTool(createBetTool),
		wrapAssistantTool(editBetTool),
		wrapAssistantTool(updateTaskStatusTool),
		wrapAssistantTool(editBlockTool),
	];
}

/**
 * Wrap an AssistantToolShape to satisfy the RegisteredTool interface.
 * Converts { status: "ok" | "error" } → { success: boolean }.
 */
function wrapAssistantTool<T>(
	shape: import("./assistant-tool-result.js").AssistantToolShape<T>,
): RegisteredTool {
	return toRegistered<T>({
		name: shape.name,
		description: shape.description,
		inputSchema: shape.inputSchema,
		handler: async (args, ctx) => {
			const result = await shape.handler(args, ctx);
			if (result.status === "ok") {
				return ok(result.value);
			}
			return err("TOOL_ERROR", result.message);
		},
	});
}
