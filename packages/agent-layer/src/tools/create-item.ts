import { randomUUID } from "node:crypto";
import type { ItemCreatedEvent } from "@hyperidle/shared";
import z from "zod";
import { getThreadById, insertThread, updateThread } from "@hyperidle/core-app";
import { routeItem } from "@hyperidle/core-app";
import { resolveReviewRecipients } from "@hyperidle/core-app";
import { getUserById } from "@hyperidle/core-app";
import { work } from "@hyperidle/core-app";
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

/**
 * Determine whether a create-item invocation requires human review routing.
 * @lore AD1 F2: scope gate checks both kind AND verb. kind=review/escalation
 * triggers routing (e.g. session-end reviews). verb=review also triggers routing
 * (e.g. "work" item proposed for human review). Both paths route to humans.
 */
function isReviewItem(input: CreateItemInput): boolean {
	return input.kind === "review" || input.kind === "escalation" || input.verb === "review";
}

/**
 * Merge human reviewer IDs into existing thread participants.
 * Returns a new sorted, deduplicated array.
 */
function mergeParticipants(existing: string[], humanIds: string[]): string[] {
	return [...new Set([...existing, ...humanIds])].sort();
}

async function handler(args: CreateItemInput, ctx: ToolContext): Promise<ToolResult> {
	const parsed = createItemInputSchema.safeParse(args);
	if (!parsed.success) {
		return err("INVALID_INPUT", parsed.error.message);
	}
	const input = parsed.data;

	const now = new Date().toISOString();

	let threadId = input.threadId;
	if (threadId) {
		const existing = await getThreadById(ctx.db, threadId);
		if (!existing) {
			return err("NOT_FOUND", `Thread not found: ${threadId}`);
		}
	} else {
		threadId = randomUUID();
		// L1a: synthesize a host_kind for thread auto-creation. Use 'task' as
		// a generic carrier (the item will route to a task in most flows).
		await insertThread(ctx.db, {
			id: threadId,
			hostKind: "task",
			hostId: ctx.taskId,
			initiatorId: ctx.agentId,
			participants: JSON.stringify([ctx.agentId]),
			lastActiveAt: now,
			createdAt: now,
		});
	}

	// @lore AD1: Wire review routing to humans. When the item is a review or
	// escalation (kind=review/escalation OR verb=review), resolve human
	// recipients via org_edges and add them to the thread participants.
	// Uses ctx.teamId directly (F3: available in ToolContext since R7).
	// Agent role is looked up from the users table for function-mechanism routing.
	if (isReviewItem(input)) {
		const agentRow = await getUserById(ctx.db, ctx.agentId);

		const humanIds = await resolveReviewRecipients(ctx.db, {
			userId: ctx.agentId,
			agentRole: agentRow?.role ?? undefined,
			teamId: ctx.teamId,
		});

		if (humanIds.length > 0) {
			const threadRow = await getThreadById(ctx.db, threadId);

			const currentParticipants: string[] = threadRow
				? (JSON.parse(threadRow.participants) as string[])
				: [ctx.agentId];

			const merged = mergeParticipants(currentParticipants, humanIds);
			await updateThread(ctx.db, threadId, { participants: JSON.stringify(merged) });
		}
	}

	const itemId = randomUUID();
	await work.createItem(ctx.db, {
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
		// @lore AF4/Z8-167: the `items` table has no attention_score/cost_estimate
		// columns (those live on knowledge_items), so these tool inputs cannot be
		// persisted here. Dropped from the insert to type-check; never written at
		// runtime. Whether they belong on items is routed to the knowledge WP (Batch 7).
		blocking: input.blocking ?? false,
		reasoning: input.reasoning ?? null,
		threadId,
		createdAt: now,
	});

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
