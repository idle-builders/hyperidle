import type { ToolContext, ToolDefinition, ToolResult } from "@hyperidle/shared";
import {
	err,
	KERNEL_KNOWLEDGE_STATUSES,
	type KernelKnowledgeStatus,
	KNOWLEDGE_STATUSES,
	type KnowledgeStatus,
	ok,
} from "@hyperidle/shared";
import z from "zod";
import type { ToolHandlersPorts } from "./ports.js";

type AnyKnowledgeStatus = KnowledgeStatus | KernelKnowledgeStatus;

function isAnyKnowledgeStatus(value: string): value is AnyKnowledgeStatus {
	return (
		(KNOWLEDGE_STATUSES as readonly string[]).includes(value) ||
		(KERNEL_KNOWLEDGE_STATUSES as readonly string[]).includes(value)
	);
}

const ALLOWED_TRANSITIONS: Record<AnyKnowledgeStatus, readonly AnyKnowledgeStatus[]> = {
	draft: ["active", "captured", "archived"],
	captured: ["provisional"],
	provisional: ["validated", "archived", "needs_human"],
	validated: ["active", "archived"],
	active: ["stale", "archived"],
	stale: ["active", "archived"],
	archived: [],
	needs_human: [],
};

const promoteKnowledgeInputSchema = z.object({
	knowledgeItemId: z.string().min(1),
	toStatus: z.enum(KNOWLEDGE_STATUSES),
	reason: z.string().max(65_536).optional(),
});

type PromoteKnowledgeInput = z.infer<typeof promoteKnowledgeInputSchema>;

interface PromoteKnowledgeData {
	readonly knowledgeItemId: string;
	readonly fromStatus: string;
	readonly toStatus: string;
}

async function handler<TDb>(
	input: PromoteKnowledgeInput,
	ctx: ToolContext<TDb>,
	ports: ToolHandlersPorts<TDb>,
): Promise<ToolResult<PromoteKnowledgeData>> {
	const { knowledgeItemId, toStatus, reason } = input;

	const row = await ports.knowledge.findKnowledgeItemStatusById(ctx.db, knowledgeItemId);
	if (!row) {
		return err("NOT_FOUND", `Knowledge item not found: ${knowledgeItemId}`);
	}

	if (!isAnyKnowledgeStatus(row.status)) {
		return err("INVALID_STATE", `unknown current status: ${row.status}`);
	}
	const fromStatus: AnyKnowledgeStatus = row.status;

	const allowed = ALLOWED_TRANSITIONS[fromStatus] ?? [];
	if (!allowed.includes(toStatus)) {
		return err("INVALID_TRANSITION", `cannot transition ${fromStatus} → ${toStatus}`);
	}

	const editor = `agent:${ctx.agentId}`;
	const result = await ports.knowledge.promoteKnowledgeItem(ctx.db, {
		knowledgeItemId,
		fromStatus,
		toStatus,
		reason,
		editor,
	});

	if (!result.ok) {
		return err(result.code, result.message);
	}

	return ok<PromoteKnowledgeData>({
		knowledgeItemId,
		fromStatus: result.fromStatus,
		toStatus,
	});
}

export function createPromoteKnowledgeTool<TDb>(
	ports: ToolHandlersPorts<TDb>,
): ToolDefinition<PromoteKnowledgeInput, TDb> {
	return {
		name: "promote_knowledge",
		description:
			"Transition a knowledge item's lifecycle status (captured → provisional → validated → active → stale → archived). Blocks promotion to 'validated' if any open conflict exists on the item.",
		inputSchema: promoteKnowledgeInputSchema,
		handler: (args, ctx) => handler(args, ctx, ports),
		roles: ["assistant", "facilitator", "product_manager"],
	};
}
