import { randomUUID } from "node:crypto";
import type { ToolContext, ToolDefinition, ToolResult } from "@hyperidle/shared";
import { err, ok } from "@hyperidle/shared";
import z from "zod";
import type { ToolHandlersPorts } from "./ports.js";

const createConflictReviewInputSchema = z.object({
	knowledgeItemId: z.string().min(1),
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

async function handler<TDb>(
	input: CreateConflictReviewInput,
	ctx: ToolContext<TDb>,
	ports: ToolHandlersPorts<TDb>,
): Promise<ToolResult<CreateConflictReviewData>> {
	const item = await ports.knowledge.findKnowledgeItemVersionById(ctx.db, input.knowledgeItemId);
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

	const existing = await ports.knowledge.findOpenConflictByItemAndProposer(
		ctx.db,
		input.knowledgeItemId,
		proposedBy,
	);
	if (existing) {
		return err(
			"DUPLICATE",
			`open conflict already exists from this agent on this item: ${existing.id}`,
		);
	}

	const conflictId = randomUUID();
	const now = new Date().toISOString();

	await ports.knowledge.createKnowledgeConflict(ctx.db, {
		id: conflictId,
		itemId: input.knowledgeItemId,
		versionBase: input.versionBase,
		versionCurrent: item.version,
		proposedBody: input.proposedBody,
		proposedMeta: input.proposedMeta ?? null,
		proposedBy,
		createdAt: now,
	});

	return ok<CreateConflictReviewData>({
		conflictId,
		itemId: input.knowledgeItemId,
		status: "open",
	});
}

export function createCreateConflictReviewTool<TDb>(
	ports: ToolHandlersPorts<TDb>,
): ToolDefinition<CreateConflictReviewInput, TDb> {
	return {
		name: "create_conflict_review",
		description:
			"Record a conflict between a proposed knowledge edit and the current stored version. Creates an open knowledge_conflicts row routed to the relevant facilitator's queue.",
		inputSchema: createConflictReviewInputSchema,
		handler: (args, ctx) => handler(args, ctx, ports),
		roles: ["assistant", "facilitator", "product_manager"],
	};
}
