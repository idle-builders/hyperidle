import { randomUUID } from "node:crypto";
import type { HyperIdleDb } from "@hyperidle/db";
import type { ItemCreatedEvent } from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";
import type { ReviewPorts } from "./ports.js";

/**
 * Stable marker recorded in `items.reasoning` for attention-engine reviews.
 * @lore G2 idempotency: the `reasoning` column stores JSON. We use a
 * `LIKE %...%` search on the column instead of an FK because review items
 * already speak JSON for the `reasoning` blob and adding a new column for
 * a single consumer was judged heavier than the LIKE probe.
 *
 * @lore AU20 Am9: `ATTENTION_REVIEW_SOURCE` constant internalized — only
 * `attentionReviewReasoningMarker` is exported (the idempotency contract the
 * attention engine LIKE-probes).
 */
const ATTENTION_REVIEW_SOURCE = "attention_engine";

/**
 * Build the stable marker the idempotency check in `attention-service.ts`
 * looks for on the `items.reasoning` column.
 */
export function attentionReviewReasoningMarker(knowledgeItemId: string): string {
	return `"source":"${ATTENTION_REVIEW_SOURCE}","knowledgeItemId":"${knowledgeItemId}"`;
}

/** Input for creating a review `items` row tied to a knowledge item. */
export interface CreateReviewItemInput {
	readonly knowledgeItemId: string;
	/** @lore O2: layer comes from knowledgeAppProjection and may be null when no projection row exists. */
	readonly layer: string | null;
	readonly title: string;
	readonly body: string;
	readonly riskTier: "low" | "medium" | "high";
	/** @lore O2: attentionScore no longer stored as a column on items; embedded in reasoningBlob. */
	readonly attentionScore: number;
	/** Additional payload to merge into the reasoning JSON. */
	readonly reasoning: Readonly<Record<string, unknown>>;
	readonly nowMs: number;
}

export interface CreateReviewItemResult {
	readonly itemId: string;
	readonly threadId: string;
}

/**
 * Factory: build a `createReviewItemForKnowledge` function bound to the
 * injected `conversation`/`work` ports. The returned function's 3-arg shape
 * `(db, eventBus, input)` is fixed by `@hyperidle/knowledge`'s
 * `KnowledgeReviewWriter` port.
 *
 * Renamed from `buildCreateReviewItemForKnowledge` (AU20 Am9 — same factory
 * pattern, shorter name, deps now drawn from `ReviewPorts` fields).
 *
 * @lore AU19 Increment 1j: the 3-arg shape is fixed by `@hyperidle/knowledge`'s
 * `KnowledgeReviewWriter` port (Increment 1a) — a factory that CURRIES the DI
 * deps preserves that external 3-arg shape while still achieving Mechanism C
 * internally.
 */
/**
 * Minimal deps shape — only the two methods actually called.
 * @lore AU20 Am9 reviewer: `Pick<ReviewPorts,"conversation"|"work">` leaked the
 * entire port surface to every caller. Narrowed to a structural type containing
 * only `insertThread` + `createItem` so callers pass exactly what the body uses.
 */
type CreateReviewItemDeps = {
	conversation: Pick<ReviewPorts["conversation"], "insertThread">;
	work: Pick<ReviewPorts["work"], "createItem">;
};

export function createReviewItem(
	deps: CreateReviewItemDeps,
): (
	db: HyperIdleDb,
	eventBus: EventBus,
	input: CreateReviewItemInput,
) => Promise<CreateReviewItemResult> {
	return async (db, eventBus, input) => {
		const threadId = randomUUID();
		const isoNow = new Date(input.nowMs).toISOString();

		// L1a: thread carries host_kind/host_id; for knowledge-review the
		// host is the knowledge item being reviewed.
		await deps.conversation.insertThread(db, {
			id: threadId,
			hostKind: "knowledge_item",
			hostId: input.knowledgeItemId,
			initiatorId: ATTENTION_REVIEW_SOURCE,
			participants: JSON.stringify([ATTENTION_REVIEW_SOURCE]),
			lastActiveAt: isoNow,
			createdAt: isoNow,
		});

		const itemId = randomUUID();
		const reasoningBlob = {
			source: ATTENTION_REVIEW_SOURCE,
			knowledgeItemId: input.knowledgeItemId,
			// @lore O2: attentionScore embedded here since it has no column on items
			attentionScore: input.attentionScore,
			...input.reasoning,
		};

		// @lore O2: attentionScore and costEstimate columns stripped from the items
		// kernel table. The riskTier remains on items; attentionScore is persisted
		// on knowledgeAppProjection instead.
		await deps.work.createItem(db, {
			id: itemId,
			sourceAgentId: null,
			layer: input.layer,
			verb: "review",
			kind: "knowledge",
			title: input.title,
			body: input.body,
			proposedAction: null,
			options: null,
			riskTier: input.riskTier,
			blocking: false,
			reasoning: JSON.stringify(reasoningBlob),
			threadId,
			createdAt: isoNow,
		});

		const event: ItemCreatedEvent = {
			type: "item_created",
			streamId: randomUUID(),
			itemId,
			conversationId: threadId,
			kind: "knowledge",
			timestamp: input.nowMs,
		};
		eventBus.emit(event);

		return { itemId, threadId };
	};
}
