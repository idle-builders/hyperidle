import { randomUUID } from "node:crypto";
import { knowledgeConflicts, knowledgeItems } from "@hyperidle/db";
import { and, eq } from "drizzle-orm";
import z from "zod";
import type { ToolContext, ToolDefinition } from "./tool-registry.js";
import { err, ok, type ToolResult } from "./tool-result.js";

/**
 * `create_conflict_review` — Record a conflict between a proposed knowledge
 * edit and the current stored version. Inserts a new `knowledge_conflicts`
 * row with `status='open'`; facilitator queues route off that.
 *
 * @lore The `proposedBy` identity is always derived from `ctx.agentId` and
 * never taken from the input payload. A prior revision accepted a caller-
 * supplied `proposedBy` field, which let an agent spoof any identity and
 * break audit attribution. The agent runtime authenticates each session's
 * agent identity at handoff — trust that, not the free-text payload.
 */
const createConflictReviewInputSchema = z.object({
	knowledgeItemId: z.string().min(1),
	// 64 KiB cap on free-text to prevent DoS via oversized proposals.
	proposedBody: z.string().min(1).max(65_536),
	proposedMeta: z.string().max(65_536).optional(),
	versionBase: z.number().int().nonnegative(),
});

type CreateConflictReviewInput = z.infer<typeof createConflictReviewInputSchema>;

interface CreateConflictReviewData {
	readonly conflictId: string;
	readonly itemId: string;
	readonly status: "open";
}

async function handler(
	input: CreateConflictReviewInput,
	ctx: ToolContext,
): Promise<ToolResult<CreateConflictReviewData>> {
	const [item] = await ctx.db
		.select()
		.from(knowledgeItems)
		.where(eq(knowledgeItems.id, input.knowledgeItemId))
		.limit(1);
	if (!item) {
		return err("NOT_FOUND", `Knowledge item not found: ${input.knowledgeItemId}`);
	}

	if (input.versionBase > item.version) {
		return err(
			"INVALID_INPUT",
			`versionBase ahead of current (${input.versionBase} > ${item.version})`,
		);
	}

	const proposedBy = `agent:${ctx.agentId}`;

	// Dedup guard: if THIS agent already has an open conflict on THIS item,
	// refuse. Without this, a misbehaving agent could file the same conflict
	// repeatedly — each new row blocks `promote_knowledge → validated`, so
	// unbounded inserts would DoS the promotion pipeline.
	const [existing] = await ctx.db
		.select()
		.from(knowledgeConflicts)
		.where(
			and(
				eq(knowledgeConflicts.itemId, input.knowledgeItemId),
				eq(knowledgeConflicts.proposedBy, proposedBy),
				eq(knowledgeConflicts.status, "open"),
			),
		)
		.limit(1);
	if (existing) {
		return err(
			"DUPLICATE",
			`open conflict already exists from this agent on this item: ${existing.id}`,
		);
	}

	const conflictId = randomUUID();
	const now = new Date().toISOString();

	await ctx.db.insert(knowledgeConflicts).values({
		id: conflictId,
		itemId: input.knowledgeItemId,
		versionBase: input.versionBase,
		versionCurrent: item.version,
		proposedBody: input.proposedBody,
		proposedMeta: input.proposedMeta ?? null,
		proposedBy,
		status: "open",
		createdAt: now,
	});

	return ok<CreateConflictReviewData>({
		conflictId,
		itemId: input.knowledgeItemId,
		status: "open",
	});
}

export const createConflictReviewTool: ToolDefinition<CreateConflictReviewInput> = {
	name: "create_conflict_review",
	description:
		"Record a conflict between a proposed knowledge edit and the current stored version. Creates an open knowledge_conflicts row routed to the relevant facilitator's queue.",
	inputSchema: createConflictReviewInputSchema,
	handler,
	// @lore AD8b: role string "chief_of_staff" renamed to "assistant".
	// @lore AD8c: role string "practice_facilitator" renamed to "facilitator".
	roles: ["assistant", "facilitator", "product_manager"],
};
