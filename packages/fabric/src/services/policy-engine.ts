import { type HyperIdleDb, items, messages, threads, userSkills } from "@hyperidle/db";
import type { EventBus, ItemCreatedEvent, NotificationEvent } from "@hyperidle/shared";
import { and, desc, eq } from "drizzle-orm";
import { isSilenced as sharedIsSilenced } from "./silence-policy.js";

interface PolicyEngineOptions {
	/** Inject current time for testability. Defaults to () => new Date(). */
	nowFn?: () => Date;
}

type PolicyAction = "push" | "queue" | "auto_resolve";

/**
 * Registers the policy engine event handler.
 * Subscribes to `item_created` events and applies autonomy/silence rules.
 * Returns an unsubscribe function.
 */
export function registerPolicyEngine(
	db: HyperIdleDb,
	eventBus: EventBus,
	options?: PolicyEngineOptions,
): () => void {
	const nowFn = options?.nowFn ?? (() => new Date());

	const handler = (event: ItemCreatedEvent): void => {
		void (async () => {
			await evaluateItem(db, eventBus, event.itemId, nowFn);
		})();
	};

	return eventBus.on("item_created", handler);
}

async function evaluateItem(
	db: HyperIdleDb,
	eventBus: EventBus,
	itemId: string,
	nowFn: () => Date,
): Promise<void> {
	// 1. Load the item
	const [item] = await db.select().from(items).where(eq(items.id, itemId)).limit(1);
	if (!item) return;

	// 2. Load the source agent's autonomy level
	const autonomyLevel = await getAutonomyLevel(db, item.sourceAgentId);

	// 3. Determine action (priority order)
	const action = await determineAction(db, item, autonomyLevel, nowFn);

	// 4. Execute the action
	await executeAction(db, eventBus, itemId, action);
}

async function getAutonomyLevel(db: HyperIdleDb, sourceAgentId: string | null): Promise<number> {
	if (!sourceAgentId) return 1;

	const skills = await db.select().from(userSkills).where(eq(userSkills.userId, sourceAgentId));

	if (skills.length === 0) return 1;

	// Return max autonomy level across all skills
	return Math.max(...skills.map((s) => s.autonomyLevel));
}

async function determineAction(
	db: HyperIdleDb,
	item: {
		riskTier: string | null;
		kind: string | null;
		blocking: number | null;
		sourceAgentId: string | null;
	},
	autonomyLevel: number,
	nowFn: () => Date,
): Promise<PolicyAction> {
	// a. High-risk: ALWAYS push
	if (item.riskTier === "high") return "push";

	// b. Skill-change: ALWAYS push
	if (item.kind === "skill_change") return "push";

	const isBlocking = (item.blocking ?? 0) !== 0;

	// c. Check silence modes (only for non-blocking items)
	if (!isBlocking) {
		if (await sharedIsSilenced(db, { sourceAgentId: item.sourceAgentId }, nowFn())) return "queue";
	}

	// d. Autonomy-based rules
	if (autonomyLevel >= 4 && item.riskTier === "low") return "auto_resolve";
	if (autonomyLevel === 3 && item.riskTier === "low") return "queue";
	// L2 or L1 -> push
	return "push";
}

async function executeAction(
	db: HyperIdleDb,
	eventBus: EventBus,
	itemId: string,
	action: PolicyAction,
): Promise<void> {
	switch (action) {
		case "auto_resolve": {
			// L1a M4: write a `verdict`-typed message instead of a row in the
			// dropped `responses` table. The item carries a `threadId`; the
			// verdict targets the most recent review-typed message in that
			// thread (or the legacy item id when no review message exists).
			const [item] = await db.select().from(items).where(eq(items.id, itemId)).limit(1);
			if (!item) break;
			// L1 step5 (W5): push the type filter into SQL and limit to the
			// most recent review-typed message — the previous query loaded
			// every message in the thread to JS just to find one.
			const [reviewMessage] = await db
				.select()
				.from(messages)
				.where(and(eq(messages.threadId, item.threadId), eq(messages.type, "review")))
				.orderBy(desc(messages.createdAt))
				.limit(1);

			const messageId = crypto.randomUUID();
			const respondedAt = new Date().toISOString();
			const verdictPayload = {
				decision: "approve",
				resolvesMessageId: reviewMessage?.id ?? itemId,
			};
			await db.insert(messages).values({
				id: messageId,
				senderId: "policy_engine",
				threadId: item.threadId,
				type: "verdict",
				payload: JSON.stringify(verdictPayload),
				clientKey: `__l1_policy_${itemId}`,
				legacyItemId: itemId,
				createdAt: respondedAt,
			});
			if (reviewMessage) {
				await db
					.update(messages)
					.set({ resolvedAt: respondedAt })
					.where(eq(messages.id, reviewMessage.id));
			}
			await db
				.update(threads)
				.set({ resolvedAt: respondedAt })
				.where(eq(threads.id, item.threadId));
			break;
		}
		case "queue": {
			// @lore I6: append to auditTrail instead of overwriting to preserve
			// prior entries (e.g. from re-evaluation after an unqueue).
			const [existing] = await db.select().from(items).where(eq(items.id, itemId)).limit(1);
			// @lore I6: old data may have a plain object instead of an array.
			// Guard with Array.isArray to avoid crashing on legacy audit trails.
			const parsed: unknown = existing?.auditTrail ? JSON.parse(existing.auditTrail) : [];
			const trail: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
			trail.push({ action: "policy_queued", timestamp: new Date().toISOString() });
			await db
				.update(items)
				.set({ auditTrail: JSON.stringify(trail) })
				.where(eq(items.id, itemId));
			break;
		}
		case "push": {
			const notification: NotificationEvent = {
				type: "notification",
				streamId: crypto.randomUUID(),
				targetId: itemId,
				message: `Item ${itemId} requires attention`,
				timestamp: Date.now(),
			};
			eventBus.emit(notification);
			break;
		}
	}
}
