import * as crypto from "node:crypto";
import { items, threads } from "@hyperidle/db";
import type { ItemCreatedEvent } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { routeItem } from "../services/item-router.js";
import type { ToolContext, ToolDefinition } from "./tool-registry.js";
import { type ToolResult, err, ok } from "./tool-result.js";

const RISK_TIERS = ["low", "medium", "high"] as const;

const createItemInputSchema = z.object({
	title: z.string().min(1),
	body: z.string().optional(),
	kind: z.string().optional(),
	verb: z.string().optional(),
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
		threadId = crypto.randomUUID();
		ctx.db
			.insert(threads)
			.values({
				id: threadId,
				kind: input.kind === "review" ? "review" : "item",
				createdAt: now,
			})
			.run();
	}

	const itemId = crypto.randomUUID();
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
		streamId: crypto.randomUUID(),
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
