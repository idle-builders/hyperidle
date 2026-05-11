import { randomUUID } from "node:crypto";
import { items, threads } from "@hyperidle/db";
import type { ItemCreatedEvent } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import z from "zod";
import { routeItem } from "../services/item-router.js";
import type { ToolContext, ToolDefinition } from "./tool-registry.js";
import { err, ok, type ToolResult } from "./tool-result.js";

const RISK_TIERS = ["low", "medium", "high"] as const;

/**
 * @lore I6: validate kind and verb against known enums, not arbitrary strings.
 * These lists are derived from actual usage across the codebase: item-router,
 * builtin-routines, cost-cap, handoff-protocol, session-review-creator,
 * review-item-factory, and agents route.
 */
const ITEM_KINDS = [
	"review",
	"skill_change",
	"knowledge",
	"work",
	"chat",
	"escalation",
	"cost_cap_breach",
	"autonomy_change",
	"ordering",
	"post-bet-retro",
] as const;

const ITEM_VERBS = ["propose", "review", "approve", "reject", "escalate", "bet"] as const;

const createItemInputSchema = z.object({
	title: z.string().min(1),
	body: z.string().optional(),
	kind: z.enum(ITEM_KINDS).optional(),
	verb: z.enum(ITEM_VERBS).optional(),
	layer: z.string().optional(),
	riskTier: z.enum(RISK_TIERS).optional(),
	attentionScore: z.number().int().optional(),
	blocking: z.boolean().optional(),
	threadId: z.string().optional(),
	proposedAction: z.string().optional(),
	options: z.string().optional(),
	reasoning: z.string().optional(),
	costEstimate: z.number().int().optional(),
});

type CreateItemInput = z.infer<typeof createItemInputSchema>;

// biome-ignore lint/suspicious/useAwait: ToolDefinition.handler requires async signature
async function handler(args: CreateItemInput, ctx: ToolContext): Promise<ToolResult> {
	const parsed = createItemInputSchema.safeParse(args);
	if (!parsed.success) {
		return err("INVALID_INPUT", parsed.error.message);
	}
	const input = parsed.data;

	const now = new Date().toISOString();

	let threadId = input.threadId;
	if (threadId) {
		const existing = ctx.db.select().from(threads).where(eq(threads.id, threadId)).get();
		if (!existing) {
			return err("NOT_FOUND", `Thread not found: ${threadId}`);
		}
	} else {
		threadId = randomUUID();
		// L1a: synthesize a host_kind for thread auto-creation. Use 'task' as
		// a generic carrier (the item will route to a task in most flows).
		ctx.db
			.insert(threads)
			.values({
				id: threadId,
				hostKind: "task",
				hostId: ctx.taskId,
				initiatorId: ctx.agentId,
				participants: JSON.stringify([ctx.agentId]),
				lastActiveAt: now,
				createdAt: now,
			})
			.run();
	}

	const itemId = randomUUID();
	ctx.db
		.insert(items)
		.values({
			id: itemId,
			sourceAgentId: ctx.agentId,
			layer: input.layer ?? null,
			verb: input.verb ?? null,
			kind: input.kind ?? null,
			title: input.title,
			body: input.body ?? null,
			proposedAction: input.proposedAction ?? null,
			options: input.options ?? null,
			riskTier: input.riskTier ?? null,
			attentionScore: input.attentionScore ?? null,
			blocking: input.blocking ? 1 : 0,
			reasoning: input.reasoning ?? null,
			costEstimate: input.costEstimate ?? null,
			threadId,
			createdAt: now,
		})
		.run();

	const view = routeItem({
		riskTier: input.riskTier ?? null,
		kind: input.kind ?? null,
		verb: input.verb ?? null,
	});

	const event: ItemCreatedEvent = {
		type: "item_created",
		streamId: randomUUID(),
		itemId,
		conversationId: threadId,
		kind: input.kind ?? "unknown",
		timestamp: Date.now(),
	};
	ctx.eventBus.emit(event);

	return ok({ itemId, view, threadId });
}

export const createItemTool: ToolDefinition<CreateItemInput> = {
	name: "create_item",
	description:
		"Create a human-facing item (review, escalation, knowledge proposal, etc.) and route it to the appropriate view based on risk tier and kind. Auto-creates a thread if none is provided.",
	inputSchema: createItemInputSchema,
	handler,
};
