import { randomUUID } from "node:crypto";
import type { ItemCreatedEvent, ToolContext, ToolDefinition, ToolResult } from "@hyperidle/shared";
import { err, ok } from "@hyperidle/shared";
import z from "zod";
import type { ToolHandlersPorts } from "./ports.js";

const RISK_TIERS = ["low", "medium", "high"] as const;

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

function isReviewItem(input: CreateItemInput): boolean {
	return input.kind === "review" || input.kind === "escalation" || input.verb === "review";
}

function mergeParticipants(existing: readonly string[], humanIds: readonly string[]): string[] {
	return [...new Set([...existing, ...humanIds])].sort();
}

async function handler<TDb>(
	args: CreateItemInput,
	ctx: ToolContext<TDb>,
	ports: ToolHandlersPorts<TDb>,
): Promise<ToolResult> {
	const parsed = createItemInputSchema.safeParse(args);
	if (!parsed.success) {
		return err("INVALID_INPUT", parsed.error.message);
	}
	const input = parsed.data;

	const now = new Date().toISOString();

	let threadId = input.threadId;
	if (threadId) {
		const existing = await ports.conversation.getThreadById(ctx.db, threadId);
		if (!existing) {
			return err("NOT_FOUND", `Thread not found: ${threadId}`);
		}
	} else {
		threadId = randomUUID();
		await ports.conversation.insertThread(ctx.db, {
			id: threadId,
			hostKind: "task",
			hostId: ctx.taskId,
			initiatorId: ctx.agentId,
			participants: JSON.stringify([ctx.agentId]),
			lastActiveAt: now,
			createdAt: now,
		});
	}

	if (isReviewItem(input)) {
		const agentRow = await ports.users.getUserById(ctx.db, ctx.agentId);

		const humanIds = await ports.org.resolveReviewRecipientsForItem(ctx.db, {
			userId: ctx.agentId,
			agentRole: agentRow?.role ?? undefined,
			teamId: ctx.teamId,
		});

		if (humanIds.length > 0) {
			const threadRow = await ports.conversation.getThreadById(ctx.db, threadId);

			const currentParticipants: string[] = threadRow
				? (JSON.parse(threadRow.participants) as string[])
				: [ctx.agentId];

			const merged = mergeParticipants(currentParticipants, humanIds);
			await ports.conversation.updateThread(ctx.db, threadId, {
				participants: JSON.stringify(merged),
			});
		}
	}

	const itemId = randomUUID();
	await ports.work.createItem(ctx.db, {
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
		blocking: input.blocking ?? false,
		reasoning: input.reasoning ?? null,
		threadId,
		createdAt: now,
	});

	const view = ports.work.routeItem({
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

export function createCreateItemTool<TDb>(
	ports: ToolHandlersPorts<TDb>,
): ToolDefinition<CreateItemInput, TDb> {
	return {
		name: "create_item",
		description:
			"Create a human-facing item (review, escalation, knowledge proposal, etc.) and route it to the appropriate view based on risk tier and kind. Auto-creates a thread if none is provided.",
		inputSchema: createItemInputSchema,
		handler: (args, ctx) => handler(args, ctx, ports),
	};
}
