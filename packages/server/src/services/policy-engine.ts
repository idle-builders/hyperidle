/**
 * AD4: Policy engine rewritten to use approval-rate-based trust instead of
 * manually-assigned per-skill autonomy levels.
 *
 * @lore AD4: Removed `getAutonomyLevel` (userSkills-based) and replaced with
 * `getAgentTrustSignal` (verdict-history-based). Thresholds are read from
 * factory settings with safe defaults so no migration is required.
 */

import { factorySettings, type HyperIdleDb } from "@hyperidle/db";
import type { EventBus, ItemCreatedEvent, NotificationEvent } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { isSilenced as sharedIsSilenced } from "../notifications/silence-policy.js";
import * as work from "../work-service.js";
import { computeApprovalRate } from "./approval-rate.js";
import {
	insertMessage,
	listMessagesByThread,
	updateMessage,
	updateThread,
} from "./conversation-store.js";

interface PolicyEngineOptions {
	/** Inject current time for testability. Defaults to () => new Date(). */
	nowFn?: () => Date;
}

type PolicyAction = "push" | "queue" | "auto_resolve";

interface TrustSignal {
	approvalRate: number;
	totalVerdicts: number;
}

/**
 * Registers the policy engine event handler.
 * Subscribes to `item_created` events and applies trust/silence rules.
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
	const item = await work.getItemById(db, itemId);
	if (!item) return;

	// 2. Load the source agent's trust signal (approval rate from verdict history)
	const trust = await getAgentTrustSignal(db, item.sourceAgentId);

	// 3. Determine action (priority order)
	const action = await determineAction(db, item, trust, nowFn);

	// 4. Execute the action
	await executeAction(db, eventBus, itemId, action);
}

async function getAgentTrustSignal(
	db: HyperIdleDb,
	sourceAgentId: string | null,
): Promise<TrustSignal> {
	if (!sourceAgentId) return { approvalRate: 0, totalVerdicts: 0 };

	// Read window from factory settings (default 30 days)
	const windowDays = await getFactorySettingInt(db, "trust_window_days", 30);
	const result = await computeApprovalRate(db, sourceAgentId, windowDays);

	return {
		approvalRate: result.approvalRate,
		totalVerdicts: result.totalVerdicts,
	};
}

async function determineAction(
	db: HyperIdleDb,
	item: {
		riskTier: string | null;
		kind: string | null;
		blocking: number | boolean | null;
		sourceAgentId: string | null;
	},
	trust: TrustSignal,
	nowFn: () => Date,
): Promise<PolicyAction> {
	// a. High-risk: ALWAYS push
	if (item.riskTier === "high") return "push";

	// b. Skill-change: ALWAYS push
	if (item.kind === "skill_change") return "push";

	const isBlocking = !!item.blocking;

	// c. Check silence modes (only for non-blocking items)
	if (!isBlocking) {
		if (await sharedIsSilenced(db, { sourceAgentId: item.sourceAgentId }, nowFn())) return "queue";
	}

	// d. Trust-based rules (replaces autonomy level rules)
	// Read thresholds from factory settings with defaults
	const autoResolveThreshold = await getFactorySettingFloat(
		db,
		"trust_auto_resolve_threshold",
		0.9,
	);
	const autoResolveMinVerdicts = await getFactorySettingInt(
		db,
		"trust_auto_resolve_min_verdicts",
		10,
	);
	const queueThreshold = await getFactorySettingFloat(db, "trust_queue_threshold", 0.7);

	// @lore AD4: Cold-start protection applies to both auto_resolve and queue.
	// Insufficient verdicts → always push regardless of rate, so new agents
	// always see maximum oversight until they accumulate enough history.
	if (trust.totalVerdicts < autoResolveMinVerdicts) {
		return "push";
	}

	if (trust.approvalRate >= autoResolveThreshold && item.riskTier === "low") {
		return "auto_resolve";
	}

	if (trust.approvalRate >= queueThreshold && item.riskTier === "low") {
		return "queue";
	}

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
			const item = await work.getItemById(db, itemId);
			if (!item) break;
			// L1 step5 (W5): push the type filter into SQL and limit to the
			// most recent review-typed message — the previous query loaded
			// every message in the thread to JS just to find one.
			const [reviewMessage] = await listMessagesByThread(db, item.threadId, {
				type: "review",
				order: "createdAt",
				dir: "desc",
				limit: 1,
			});

			const messageId = crypto.randomUUID();
			const respondedAt = new Date().toISOString();
			const verdictPayload = {
				decision: "approve",
				resolvesMessageId: reviewMessage?.id ?? itemId,
			};
			await insertMessage(db, {
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
				await updateMessage(db, reviewMessage.id, { resolvedAt: respondedAt });
			}
			await updateThread(db, item.threadId, { resolvedAt: respondedAt });
			break;
		}
		case "queue": {
			// @lore I6: append to auditTrail instead of overwriting to preserve
			// prior entries (e.g. from re-evaluation after an unqueue).
			const existing = await work.getItemById(db, itemId);
			// @lore I6: old data may have a plain object instead of an array.
			// Guard with Array.isArray to avoid crashing on legacy audit trails.
			const parsed: unknown = existing?.auditTrail ? JSON.parse(existing.auditTrail) : [];
			const trail: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
			trail.push({ action: "policy_queued", timestamp: new Date().toISOString() });
			await work.updateItemById(db, itemId, { auditTrail: JSON.stringify(trail) });
			break;
		}
		case "push": {
			const notification: NotificationEvent = {
				type: "notification",
				streamId: crypto.randomUUID(),
				targetId: itemId,
				// AF8: MANDATORY kind discriminator — policy-engine push is "attention"
				// so the notification listener can distinguish it from dep-watcher
				// auto_unblock events (concept hard rule #6).
				kind: "attention",
				message: `Item ${itemId} requires attention`,
				timestamp: Date.now(),
			};
			eventBus.emit(notification);
			break;
		}
	}
}

// ---------------------------------------------------------------------------
// Factory settings helpers (internal)
// ---------------------------------------------------------------------------

async function getFactorySettingFloat(
	db: HyperIdleDb,
	key: string,
	defaultValue: number,
): Promise<number> {
	const [row] = await db
		.select()
		.from(factorySettings)
		.where(eq(factorySettings.key, key))
		.limit(1);

	if (!row) return defaultValue;
	const parsed = Number.parseFloat(row.value);
	return Number.isFinite(parsed) ? parsed : defaultValue;
}

async function getFactorySettingInt(
	db: HyperIdleDb,
	key: string,
	defaultValue: number,
): Promise<number> {
	const [row] = await db
		.select()
		.from(factorySettings)
		.where(eq(factorySettings.key, key))
		.limit(1);

	if (!row) return defaultValue;
	const parsed = Number.parseInt(row.value, 10);
	return Number.isFinite(parsed) ? parsed : defaultValue;
}
