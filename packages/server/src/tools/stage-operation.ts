import { randomUUID } from "node:crypto";
import { artifacts, messages, stagedOperations } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import z from "zod";
import {
	isKnownCapability,
	KNOWN_CAPABILITY_KEYS,
} from "../services/staged-operation-dispatcher.js";
import type { ToolContext, ToolDefinition } from "./tool-registry.js";
import { err, ok, type ToolResult } from "./tool-result.js";

/**
 * AL7 — stage_operation: agent-facing tool to park a fully-bound, irreversible
 * operation behind the human gate.
 *
 * The agent provides the operation spec. The kernel dispatcher executes it
 * only after an "approve" verdict is received on the review message that
 * references this staged op's artifact.
 *
 * @lore AL7: This is the ONLY agent-facing verb for staged ops. The dispatcher
 * (execute verb) is Kernel-held and is NOT in ALL_TOOL_DEFINITIONS. The split
 * enforces the capability boundary: agents propose, humans approve, kernel executes.
 *
 * @lore AL7: artifactId MUST reference a row in the artifacts table with
 * kind="action_operation". The artifact is the plan document; the staged op
 * is the live execution record anchored to a specific review message.
 *
 * @lore AL7 WARNING-1: subjectThreadId is NO LONGER agent-supplied. The tool
 * derives it from messages.threadId for the given reviewMessageId. This ensures
 * the op is always bound to the exact review whose approve will fire it — an
 * agent bug or malicious input cannot misalign the thread anchor.
 *
 * @lore AL7 CRITICAL-3: Capability validation at stage time. The (capabilityTool,
 * operation) pair MUST be in the kernel capability descriptor (KNOWN_CAPABILITY_KEYS).
 * Stage is rejected if the agent references a capability the kernel cannot execute.
 * This makes the capability split an enforcement at the write boundary, not just
 * a dispatch-time failure. An unknown tool surfaces here (rejected) and at dispatch
 * (failed Outcome) — defense in depth.
 */

// reviewableTypes: only these message types can gate a staged op.
// An agent cannot stage ops against a plain message or a task note.
const REVIEWABLE_TYPES = new Set(["review", "questionnaire"]);

const stageOperationInputSchema = z.object({
	artifactId: z.string().min(1).describe("ID of the action_operation artifact for this review."),
	// WARNING-1 fix: subjectThreadId is removed from the agent-facing schema.
	// The tool derives it from messages.threadId for reviewMessageId.
	reviewMessageId: z
		.string()
		.min(1)
		.describe("Message ID of the review message gate-keeping this operation."),
	consequenceId: z
		.string()
		.min(1)
		.describe("Stable ID for the consequence (for display + audit correlation)."),
	capabilityTool: z
		.string()
		.min(1)
		.describe(
			"Tool identifier (e.g. 'fixture:staged-op', 'github'). Must be in the Kernel capability map.",
		),
	capabilityHarnessType: z
		.string()
		.optional()
		.describe("Harness type required by the capability tool, if any."),
	operation: z
		.string()
		.min(1)
		.describe(
			"Operation verb within the capability tool (e.g. 'echo', 'merge_pr'). Must be registered.",
		),
	// @lore AF4/§4c: zod v4 removed single-arg z.record; must be z.record(keySchema, valueSchema).
	params: z.record(z.string(), z.unknown()).describe("Fully-bound parameters for the operation."),
	idempotencyKey: z
		.string()
		.min(1)
		.describe(
			"Agent-authored stable key. Unique per intended execution — NOT a re-execution guard (that is the status=pending claim).",
		),
	reversibility: z
		.enum(["irreversible", "reversible"])
		.describe("Whether the operation can be reversed after execution."),
});

type StageOperationInput = z.infer<typeof stageOperationInputSchema>;

async function handler(args: StageOperationInput, ctx: ToolContext): Promise<ToolResult> {
	const parsed = stageOperationInputSchema.safeParse(args);
	if (!parsed.success) {
		return err("INVALID_INPUT", parsed.error.message);
	}
	const input = parsed.data;

	// CRITICAL-3: Validate the capability at stage time (write boundary).
	// Reject if the (capabilityTool, operation) pair is not in the kernel map.
	if (!isKnownCapability(input.capabilityTool, input.operation)) {
		return err(
			"FORBIDDEN",
			`Capability not provisioned: the kernel has no executor for ` +
				`"${input.capabilityTool}/${input.operation}". ` +
				`Staged operations must reference a capability the kernel can execute. ` +
				`Known capabilities: ${Array.from(KNOWN_CAPABILITY_KEYS).join(", ")}`,
		);
	}

	// WARNING-1: resolve reviewMessageId → its thread. subjectThreadId is derived,
	// never agent-supplied, so the op is always bound to the exact review thread.
	const [reviewMsg] = await ctx.db
		.select()
		.from(messages)
		.where(eq(messages.id, input.reviewMessageId))
		.limit(1);

	if (!reviewMsg) {
		return err("NOT_FOUND", `Review message not found: ${input.reviewMessageId}`);
	}

	if (!REVIEWABLE_TYPES.has(reviewMsg.type)) {
		return err(
			"INVALID_INPUT",
			`Message ${input.reviewMessageId} has type "${reviewMsg.type}" — only "review" or "questionnaire" messages can gate a staged operation.`,
		);
	}

	const subjectThreadId = reviewMsg.threadId;

	// Verify the artifact exists.
	const [artifact] = await ctx.db
		.select()
		.from(artifacts)
		.where(eq(artifacts.id, input.artifactId))
		.limit(1);

	if (!artifact) {
		return err("NOT_FOUND", `Artifact not found: ${input.artifactId}`);
	}

	const now = new Date().toISOString();
	const id = randomUUID();

	await ctx.db.insert(stagedOperations).values({
		id,
		reviewMessageId: input.reviewMessageId,
		subjectThreadId, // derived from reviewMsg.threadId, not agent-supplied
		artifactId: input.artifactId,
		consequenceId: input.consequenceId,
		capabilityTool: input.capabilityTool,
		capabilityHarnessType: input.capabilityHarnessType ?? null,
		operation: input.operation,
		params: JSON.stringify(input.params),
		idempotencyKey: input.idempotencyKey,
		reversibility: input.reversibility,
		status: "pending",
		stagedByAgentId: ctx.agentId,
		createdAt: now,
	});

	return ok({ id, status: "pending" });
}

export const stageOperationTool: ToolDefinition<StageOperationInput> = {
	name: "stage_operation",
	description:
		"Park a fully-bound, irreversible operation behind the human gate. The operation will execute only after an 'approve' verdict is received on the specified review message. Use this to propose consequential actions (e.g. merging a PR, triggering a deployment) that require explicit human approval.",
	inputSchema: stageOperationInputSchema,
	handler,
};
